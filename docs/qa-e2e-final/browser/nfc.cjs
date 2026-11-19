/* global require, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./scenario.cjs');

run('nfc', async ({ login, visit, proof }) => {
    const profile = fs.realpathSync(process.env.USK_RECETTE_V2_ROOT);
    assert.match(path.basename(profile), /^usk_qa_e2e-/);
    const { password } = JSON.parse(fs.readFileSync(path.join(profile, 'final-qa.json'), 'utf8'));
    const user = await login('registrar.dr@usk.test', password);
    const url = '/app/dashboard/admin/card-issuance/nfc';
    const data = await visit(user, url);
    const [first, second] = data.rows.data.filter((entry) => entry.eligible && !entry.linked && entry.matricule);
    assert.ok(first && second);
    const specimen = randomBytes(7).toString('hex').toUpperCase();
    const row = (entry) => user.getByRole('row').filter({ hasText: entry.matricule }).first();
    const dialog = user.getByRole('dialog');
    async function assign(entry) {
        await row(entry).getByRole('button', { name: /^Associer/ }).click();
        await dialog.getByLabel(/Identifiant de la carte/).fill(specimen);
        await dialog.getByRole('button', { name: 'Associer la carte' }).click();
    }
    await assign(first);
    await dialog.waitFor({ state: 'hidden' });
    assert.equal((await visit(user, url)).rows.data.find((entry) => entry.id === first.id).linked, true);
    await proof(user, 'NFC-01', 'Associer un identifiant synthétique au moyen du formulaire opérateur.', { inscription: first.id });
    try {
        await assign(second);
        await dialog.getByText(/déjà associée à une autre inscription/).first().waitFor();
        await user.keyboard.press('Escape');
        await visit(user, url);
        await proof(user, 'NFC-02', 'Présenter le même identifiant pour une deuxième inscription.', { doublon: 'refusé' });
    } finally {
        await visit(user, url);
        await row(first).getByRole('button', { name: /Dissocier/ }).click();
        await dialog.getByRole('button', { name: 'Dissocier', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
    }
    const restored = (await visit(user, url)).rows.data;
    for (const entry of [first, second]) assert.equal(restored.find((item) => item.id === entry.id).linked, false);
    await proof(user, 'NFC-03', 'Dissocier le spécimen et relire les deux inscriptions.', { associations_restantes: 0 });
}).catch((error) => { console.error(error.message); process.exitCode = 1; });
