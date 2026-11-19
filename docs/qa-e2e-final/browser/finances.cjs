/* global require, process, Buffer */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs = require('node:fs'),
    path = require('node:path'),
    assert = require('node:assert/strict');
const { chromium, chromiumOptions, origin, runDirectory, probe, verify } = require('./runtime.cjs');
const evidence = runDirectory('finances');
const observations = [];
const entry = probe('ledger').entry;
const adminPath = '/app/dashboard/admin/finance?academic=' + entry;
const studentPath = '/app/dashboard/student/fees?academic=' + entry;
const recordPath = '/app/dashboard/admin/student-academic/' + entry + '/payments';
const ref = 'QA-SEUIL29',
    proofRef = 'QA-SEUIL1';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p10AAAAASUVORK5CYII=', 'base64');
function sql() {
    return probe('ledger');
}
async function until(check) {
    for (let i = 0; i < 50; i++) {
        let current = check();
        if (current) return current;
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('Etat attendu absent dans le profil fictif');
}
async function browserPage(browser, role) {
    const ctx = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    await ctx.route('**/*', (r) => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
    const page = await ctx.newPage();
    page.setDefaultTimeout(25000);
    page.setDefaultNavigationTimeout(90000);
    page.on('pageerror', (e) => observations.push({ javascript: e.message.slice(0, 140) }));
    page.on('response', (r) => {
        const u = new URL(r.url());
        if (u.origin === origin && r.request().method() === 'POST')
            observations.push({ post: u.pathname, status: r.status(), location: r.headers().location ?? null });
    });
    await page.goto(origin + '/app/login', { waitUntil: 'domcontentloaded' });
    await page.locator('input[name=email]').fill(role + '@usk.test');
    await page.locator('input[name=password]').fill('password');
    await page.getByRole('button', { name: /se connecter/i }).click();
    await page.waitForURL('**/app/dashboard**');
    return page;
}
const dialog = (p) => p.getByRole('dialog');
async function step(page, id, work) {
    try {
        const result = await work();
        observations.push({ id, state: 'VALIDÉ', detail: result });
    } catch (e) {
        observations.push({ id, state: 'ÉCHEC', detail: e.message.split('\n')[0] });
        throw e;
    } finally {
        if (page) await page.screenshot({ path: path.join(evidence, id + '.png'), fullPage: false }).catch(() => {});
        fs.writeFileSync(path.join(evidence, 'matrice.json'), JSON.stringify(observations, null, 2));
    }
}
async function fillRecord(page, amount, reference) {
    await page.getByRole('button', { name: 'Saisir un versement', exact: true }).first().click();
    const d = dialog(page);
    await d.getByLabel('Frais concernés').selectOption('tuition');
    await d.getByLabel(/Montant reçu/).fill(amount);
    await d.getByLabel('Mode de paiement').selectOption('bank_transfer');
    await d.getByLabel('Référence unique du versement').fill(reference);
    await d.getByLabel('Pièce ou justification du versement').fill('Reçu de caisse fictif vérifié en recette.');
    return d.getByRole('button', { name: 'Enregistrer le versement', exact: true });
}
async function proofForm(page, reference) {
    await page.goto(origin + studentPath, { waitUntil: 'domcontentloaded' });
    const guide = page.getByRole('button', { name: 'Fermer le guide de bienvenue' });
    if (await guide.isVisible()) {
        await guide.click();
        await guide.waitFor({ state: 'hidden' });
    }
    const top = page.getByRole('button', { name: /Déposer un justificatif/i });
    const form = page.getByRole('button', { name: 'Envoyer le justificatif', exact: true });
    if (!(await form.isVisible())) await top.first().click();
    const fields = page.locator('form').filter({ has: form }).first();
    await fields.getByLabel('Frais concernés').selectOption('tuition');
    await fields.getByLabel(/Montant réellement versé/).fill('1');
    await fields.getByLabel('Mode de paiement').selectOption('bank_transfer');
    await fields.getByLabel('Référence du versement').fill(reference);
    await fields.locator('input[type=file]').setInputFiles({ name: 'recu-fictif.png', mimeType: 'image/png', buffer: png });
    await form.click();
}
async function proofAction(page, decision, reason) {
    await page.goto(origin + adminPath, { waitUntil: 'domcontentloaded' });
    const title = decision === 'approve' ? 'Valider le justificatif' : 'Refuser le justificatif';
    await page.getByRole('button', { name: title + ' ' + proofRef, exact: true }).click();
    const d = dialog(page);
    const select = d.locator('select').first();
    await select.selectOption({ label: reason });
    await d.getByRole('button', { name: title, exact: true }).click();
    await d.waitFor({ state: 'hidden' });
}
(async () => {
    const version = await verify();
    fs.writeFileSync(path.join(evidence, 'version.json'), JSON.stringify(version, null, 2));
    const browser = await chromium.launch(chromiumOptions);
    try {
        const agent = await browserPage(browser, 'finance.med');
        const student = await browserPage(browser, 'etudiant.med3');
        await agent.goto(origin + adminPath, { waitUntil: 'domcontentloaded' });
        await step(agent, 'F01-reponse-perdue-et-rejeu', async () => {
            assert.equal(sql().paid, 2000);
            assert.equal(sql().status, 'pending_confirmation');
            const button = await fillRecord(agent, '9', ref);
            let dropped = false,
                rejectedStatus,
                changed;
            const seen = [];
            const pattern = origin + recordPath;
            const handler = async (route) => {
                if (route.request().method() !== 'POST') return route.continue();
                const data = route.request().postDataJSON();
                seen.push(data.operation_id);
                if (dropped) return route.continue();
                dropped = true;
                const actual = await route.fetch({ maxRedirects: 0 });
                rejectedStatus = actual.status();
                changed = actual.headers().location;
                await route.abort('failed');
            };
            await agent.route(pattern, handler);
            await button.click();
            await until(() => sql().payments.find((r) => r[1] === ref));
            await until(() => rejectedStatus);
            assert.equal(rejectedStatus, 303);
            assert.equal(new URL(changed, origin).pathname, '/app/dashboard/admin/finance');
            await button.waitFor({ state: 'visible' });
            await button.click({ clickCount: 2 });
            await until(() => seen.length >= 2);
            await dialog(agent).waitFor({ state: 'hidden' });
            await agent.unroute(pattern, handler);
            assert.equal(seen[0], seen[1]);
            assert(seen.every((id) => id === seen[0]));
            assert.equal(sql().payments.filter((r) => r[1] === ref).length, 1);
            assert.equal(sql().paid, 2000);
            return { httpCommit: rejectedStatus, attempts: seen.length, sameOperation: true, entries: 1, montantValide: 2000, url: agent.url() };
        });
        await step(agent, 'F02-montant-invalide', async () => {
            const button = await fillRecord(agent, '0', 'STAB-SEUIL-INVALID');
            await button.click();
            await dialog(agent).getByText('Le montant doit être supérieur à zéro.', { exact: true }).first().waitFor();
            assert.equal(sql().payments.length, 2);
            await dialog(agent)
                .getByRole('button', { name: /annuler|fermer/i })
                .first()
                .click();
            await dialog(agent).waitFor({ state: 'hidden' });
            return { errorVisible: true, entries: 1, url: agent.url() };
        });
        await step(agent, 'F03-confirmer-29', async () => {
            const row = agent.locator('tr').filter({ hasText: ref });
            await row.getByRole('button', { name: 'Confirmer le versement', exact: true }).click();
            await dialog(agent)
                .getByLabel(/Motif après contrôle/)
                .fill('Reçu de l’encaissement fictif contrôlé.');
            await dialog(agent).getByRole('button', { name: 'Confirmer le versement', exact: true }).click();
            await until(() => sql().paid === 2900);
            assert.equal(sql().status, 'pending_confirmation');
            await student.goto(origin + studentPath, { waitUntil: 'domcontentloaded' });
            await student.screenshot({ path: path.join(evidence, 'F03-etudiant.png') });
            return sql();
        });
        await step(student, 'F04-depot-preuve', async () => {
            await proofForm(student, proofRef);
            await until(() => sql().proofs.some((p) => p[2] === 'pending'));
            assert.equal(sql().paid, 2900);
            return sql();
        });
        await step(agent, 'F05-refus-preuve', async () => {
            await proofAction(agent, 'reject', 'Justificatif illisible.');
            await until(() => sql().proofs.some((p) => p[2] === 'rejected'));
            assert.equal(sql().paid, 2900);
            return sql();
        });
        await step(student, 'F06-depot-corrige', async () => {
            await proofForm(student, proofRef);
            await until(() => sql().proofs.some((p) => p[2] === 'pending'));
            assert.equal(sql().status, 'pending_confirmation');
            return sql();
        });
        await step(agent, 'F07-valider-preuve-et-30', async () => {
            await proofAction(agent, 'approve', 'Paiement reçu et référence vérifiée.');
            await until(() => sql().paid === 3000);
            assert.equal(sql().status, 'confirmed');
            assert.equal(sql().proofs.filter((p) => p[2] === 'accepted').length, 1);
            await student.goto(origin + studentPath, { waitUntil: 'domcontentloaded' });
            await student.screenshot({ path: path.join(evidence, 'F07-etudiant.png') });
            return sql();
        });
        await step(agent, 'F08-annuler-paiement-sans-refuser-preuve', async () => {
            await student.goto(origin + studentPath, { waitUntil: 'domcontentloaded' });
            const before = JSON.parse(await student.locator('#app').getAttribute('data-page')).props;
            assert.equal(before.permissions.courses_view.allowed, true);
            await student.screenshot({ path: path.join(evidence, 'F07-droits-pedagogiques.png') });
            const row = agent.locator('tr').filter({ hasText: proofRef }).first();
            await row.locator('summary').filter({ hasText: 'Autres actions' }).click();
            await row.getByRole('button', { name: 'Annuler l’écriture', exact: true }).click();
            await dialog(agent).getByLabel('Motif de l’annulation').fill('Contrepassation du paiement de recette.');
            await dialog(agent).getByRole('button', { name: 'Annuler l’écriture comptable', exact: true }).click();
            await until(() => sql().paid === 2900);
            assert(sql().payments.some((p) => p[1] === proofRef && p[2] === 'cancelled'));
            assert(sql().proofs.some((p) => p[1] === proofRef && p[2] === 'accepted'));
            await student.goto(origin + studentPath, { waitUntil: 'domcontentloaded' });
            const latest = JSON.parse(await student.locator('#app').getAttribute('data-page')).props;
            const proof = latest.payment_proofs.submissions.find((p) => p.reference === proofRef && p.proof_status === 'accepted');
            assert(proof);
            assert.equal(proof.payment_status, 'cancelled');
            await student.getByRole('region', { name: 'Justificatifs de paiement', exact: true }).scrollIntoViewIfNeeded();
            await student.screenshot({ path: path.join(evidence, 'F08-etudiant.png') });
            return {
                ...sql(),
                proofDecision: proof.proof_status,
                accountingStatus: proof.payment_status,
                coursesAt30: before.permissions.courses_view.allowed,
                coursesAfterCancellation: latest.permissions.courses_view.allowed,
            };
        });
        await step(student, 'F09-piece-identique-nouvelle-reference', async () => {
            const previous = sql();
            await proofForm(student, 'STAB-SEUIL-FICHIER-IDENTIQUE');
            await student.getByText('Ce fichier figure déjà parmi vos justificatifs en vérification ou acceptés.', { exact: true }).waitFor();
            assert.equal(sql().proofs.length, previous.proofs.length);
            assert.equal(sql().payments.length, previous.payments.length);
            return { visible: true, proofsUnchanged: true, paymentsUnchanged: true };
        });
        console.log(observations.filter((row) => row.id).map((row) => [row.id, row.state]));
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
