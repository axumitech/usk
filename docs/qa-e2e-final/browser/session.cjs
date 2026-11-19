/* global require, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const { run } = require('./scenario.cjs');

run('session', async ({ login, proof, origin }) => {
    const page = await login('etudiant.droit@usk.test');
    const cookies = await page.context().cookies(origin);
    const session = cookies.find((cookie) => cookie.name.startsWith('usk_recette_v2_'));
    assert.ok(session && session.httpOnly);
    assert.equal(session.sameSite.toLowerCase(), 'lax');
    await proof(page, 'SEC-SESSION', 'Vérifier les attributs du cookie de session sur la connexion locale.', {
        httpOnly: session.httpOnly, sameSite: session.sameSite,
    });
    const response = await page.context().request.post(origin + '/app/logout', {
        headers: { Accept: 'application/json' },
        maxRedirects: 0,
    });
    assert.equal(response.status(), 419);
    const stillAuthenticated = await page.goto(origin + '/app/dashboard/student/results', { waitUntil: 'domcontentloaded' });
    assert.equal(stillAuthenticated.status(), 200);
    assert.ok(new URL(page.url()).pathname.startsWith('/app/dashboard'));
    await proof(page, 'SEC-CSRF', 'Demander sa propre déconnexion sans jeton et rouvrir son espace.', {
        tentative: response.status(), espace: stillAuthenticated.status(),
    });
}).catch((error) => { console.error(error.message); process.exitCode = 1; });
