/* global require, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, chromiumOptions, origin, verify, runDirectory } = require('./runtime.cjs');
const out = runDirectory('enseignement');
const trace = { events: [], checks: [] };
const reason = 'Vérification pédagogique avec des données de recette exclusivement fictives.';
const localDateOffset = (hours) =>
    new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Africa/Kinshasa',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    })
        .format(new Date(Date.now() + hours * 3600000))
        .replace(' ', 'T');
const props = (page) => page.locator('#app[data-page]').evaluate((el) => JSON.parse(el.getAttribute('data-page')).props);
(async () => {
    const verified = await verify();
    fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify(verified, null, 2));
    const browser = await chromium.launch(chromiumOptions);
    let page;
    try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'fr-FR', timezoneId: 'Africa/Kinshasa' });
        ctx.setDefaultTimeout(50000);
        ctx.setDefaultNavigationTimeout(90000);
        await ctx.route('**/*', (route) => (new URL(route.request().url()).origin === origin ? route.continue() : route.abort()));
        ctx.on('response', (r) => {
            const u = new URL(r.url()),
                method = r.request().method();
            if (method === 'POST' || u.pathname.startsWith('/app/dashboard/teacher'))
                trace.events.push({ method, status: r.status(), url: u.pathname + u.search, location: r.headers().location ?? null });
        });
        page = await ctx.newPage();
        await page.goto(origin + '/app/login', { waitUntil: 'domcontentloaded' });
        await page.locator('#login-email').fill('professeur.droit@usk.test');
        await page.locator('#login-password').fill('password');
        await page.getByRole('button', { name: /se connecter/i }).click();
        await page.waitForURL('**/app/dashboard/teacher**');
        const version = await (await page.request.get(origin + '/__usk_recipe/version')).json();
        assert.equal(version.revision, version.assets.revision);

        trace.version = version;
        const links = '/app/dashboard/teacher/resources';
        await page.goto(origin + links, { waitUntil: 'domcontentloaded' });
        let offer;
        for (const choice of (await props(page)).offers.data) {
            await page.goto(origin + links + '?offering=' + choice.id, { waitUntil: 'domcontentloaded' });
            if ((await props(page)).canManage) {
                offer = choice.id;
                break;
            }
        }
        assert(offer, 'Le professeur dispose d’une offre ouverte dans le profil.');
        const tab = await ctx.newPage();
        const byTitle = (kind) => 'Contrôle ' + kind + ' ' + Date.now();
        await page.getByRole('button', { name: 'Ajouter un support', exact: true }).click();
        const modal = page.getByRole('dialog');
        await modal.getByLabel(/^Type/).selectOption('material');
        await modal.getByLabel(/^Titre/).fill(byTitle('support'));
        await modal.getByLabel('Texte pédagogique').fill('Support de recette pour la vérification du parcours de publication.');
        await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click();
        await page.waitForURL((url) => url.searchParams.has('resource'));
        await page.getByText('Support enregistré.', { exact: true }).waitFor();
        const resource = new URL(page.url()).searchParams.get('resource');
        await tab.goto(origin + '/app/dashboard', { waitUntil: 'domcontentloaded' });
        await page.bringToFront();
        await page.getByRole('button', { name: 'Publier', exact: true }).click();
        await modal.getByLabel(/Motif|Justification/).fill(reason);
        const supportResponse = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/publication'));
        await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click();
        const publishedSupport = await supportResponse;
        assert.equal(publishedSupport.status(), 303);
        assert.equal(new URL(publishedSupport.headers().location, origin).searchParams.get('resource'), resource);
        await page
            .getByText(/Support publié/, { exact: false })
            .filter({ visible: true })
            .first()
            .waitFor();
        const supportProof = path.join(out, '01-support-publie.png');
        await page.screenshot({ path: supportProof });
        const supportUrl = page.url();
        await page.reload({ waitUntil: 'domcontentloaded' });
        assert.equal((await props(page)).selected.is_published, true);
        trace.checks.push({ name: 'Support publié', status: 303, url: supportUrl, proof: supportProof });
        const evaluation = '/app/dashboard/teacher/assessments?offering=' + offer;
        await page.goto(origin + evaluation, { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: 'Créer une évaluation', exact: true }).click();
        await page.getByLabel(/^Titre de l’évaluation/).fill(byTitle('évaluation'));
        await page.getByLabel(/^Catégorie/).selectOption('assignment');
        await page.getByLabel(/^Consignes/).fill('Consigne fictive pour la recette finale.');
        await page.getByLabel(/^Ouverture des dépôts \(Kinshasa\)/).fill(localDateOffset(-1));
        await page.getByLabel(/^Échéance \(Kinshasa\)/).fill(localDateOffset(24));
        await page.getByLabel(/^Barème maximal/).fill('20');
        await page.getByRole('button', { name: 'Enregistrer le brouillon', exact: true }).click();
        await page.waitForURL((url) => url.searchParams.has('resource'));
        const assessment = new URL(page.url()).searchParams.get('resource');
        await tab.goto(origin + '/app/dashboard', { waitUntil: 'domcontentloaded' });
        await page.bringToFront();
        await page.getByRole('button', { name: 'Publier maintenant', exact: true }).click();
        await modal.getByLabel(/Motif|Justification/).fill(reason);
        const assessmentResponse = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/lifecycle'));
        await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click();
        const publishedAssessment = await assessmentResponse;
        assert.equal(publishedAssessment.status(), 303);
        assert.equal(new URL(publishedAssessment.headers().location, origin).searchParams.get('resource'), assessment);
        await page.getByText('Évaluation publiée.', { exact: true }).waitFor();
        const assessmentProof = path.join(out, '02-evaluation-publiee.png');
        await page.screenshot({ path: assessmentProof });
        const assessmentUrl = page.url();
        await page.reload({ waitUntil: 'domcontentloaded' });
        assert.equal((await props(page)).selected.state, 'published');
        trace.checks.push({ name: 'Évaluation publiée', status: 303, url: assessmentUrl, proof: assessmentProof });
        console.log('Edge : support et évaluation publiés, avec fiche conservée, toast visible et état vérifié après rechargement.');
    } catch (error) {
        trace.error = error.message.split('\n')[0];
        if (page) await page.screenshot({ path: path.join(out, 'diagnostic.png') }).catch(() => {});
        throw error;
    } finally {
        fs.writeFileSync(path.join(out, 'trace.json'), JSON.stringify(trace, null, 2));
        await browser.close();
    }
})().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
