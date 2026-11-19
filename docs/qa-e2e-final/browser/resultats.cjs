/* global require, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const { probe } = require('./runtime.cjs');
const { run } = require('./scenario.cjs');
run('resultats', async ({ login, visit, proof }) => {
    const target = probe('resultat');
    assert.equal(target.state, 'approved', 'Le jury historique doit être approuvé et en attente de sa première publication.');
    const owner = await login('etudiant.droit@usk.test');
    const resultUrl = '/app/dashboard/student/results?academic=' + target.entry;
    const before = await visit(owner, resultUrl);
    assert.ok(!before.official_results?.selected);
    await proof(owner, 'RES-01', 'Ouvrir les résultats avant publication', 'Aucun résultat officiel accessible à l’étudiant.');
    const dean = await login('doyen.droit@usk.test');
    const juryUrl = '/app/dashboard/admin/academic-results?run=' + target.run;
    const initial = await visit(dean, juryUrl);
    assert.equal(initial.run.state, 'approved');
    await dean.getByRole('button', { name: 'Publier la session', exact: true }).click();
    const dialog = dean.getByRole('dialog');
    await dialog.getByLabel(/^Motif/).fill('Publication de la session fictive de Droit après approbation du jury.');
    await dialog.getByLabel('Notifier les étudiants autorisés').check();
    const update = dean.waitForResponse((res) => res.request().method() === 'POST' && res.url().includes('/academic-results/'));
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    assert.ok([302, 303].includes((await update).status()));
    await dialog.waitFor({ state: 'hidden' });
    const published = await visit(dean, juryUrl);
    assert.equal(published.run.state, 'published');
    assert.equal(probe('resultat').state, 'published');
    await proof(dean, 'RES-02', 'Publier le jury historique approuvé', 'État publié vérifié dans la fiche du jury et dans la base.');
    const visible = await visit(owner, resultUrl + '&official=' + target.reference);
    assert.ok(visible.official_results.selected);
    assert.equal(visible.academic.id, target.entry);
    await proof(owner, 'RES-03', 'Consulter son propre résultat publié', 'Résultat officiel accessible après publication pour la même inscription.');
}).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
});
