/* global require, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { probe } = require('./runtime.cjs');
const { run } = require('./scenario.cjs');

const reference = 'QA-SOLDE-GENERAL';
const execution = 'QA-REMBOURSEMENT-LOCAL-1';
const reason = 'Remboursement simulé du versement général de la recette locale USK.';
const formatted = (cents) => (cents / 100).toFixed(2);
const refundFor = (view, id) => view.refunds.data.find((r) => r.student_payment_id === id && r.reason === reason);

run('solde', async ({ login, visit, proof }) => {
    const ledger = probe('ledger');
    assert.equal(ledger.status, 'confirmed', 'Terminer les cas de seuil F01 à F09 avant le solde.');
    assert.ok(
        ledger.payments.some((r) => r[1] === 'QA-SEUIL1' && r[2] === 'cancelled'),
        'Le scénario du seuil doit avoir fini son annulation.',
    );
    const url = '/app/dashboard/admin/finance?academic=' + ledger.entry;
    const agent = await login('finance.med@usk.test');
    const institution = await login('admin@usk.test');
    const row = agent.getByRole('row').filter({ hasText: reference });
    const dialog = agent.getByRole('dialog');
    const submit = async (page, title) => {
        const d = page.getByRole('dialog');
        const changed = page.waitForResponse((res) => res.request().method() === 'POST', { timeout: 120000 });
        await d.getByRole('button', { name: title, exact: true }).click();
        assert.ok([302, 303].includes((await changed).status()));
        await d.waitFor({ state: 'hidden', timeout: 120000 });
    };
    let view = await visit(agent, url);
    let payment = view.payments.data.find((p) => p.reference === reference);
    const total = payment?.amount_cents ?? view.statement.balance.balance_cents;
    assert.ok(Number.isInteger(total) && total >= 100);
    if (!payment) {
        await agent.getByRole('button', { name: 'Saisir un versement', exact: true }).first().click();
        await dialog.getByLabel('Frais concernés').selectOption('unallocated');
        await dialog.getByLabel(/Montant reçu/).fill(formatted(total));
        await dialog.getByLabel('Mode de paiement').selectOption('other');
        await dialog.getByLabel('Référence unique du versement').fill(reference);
        await dialog
            .getByLabel('Pièce ou justification du versement')
            .fill('Opération financière simulée sur base QA isolée, sans encaissement réel.');
        await submit(agent, 'Enregistrer le versement');
        view = await visit(agent, url);
        payment = view.payments.data.find((p) => p.reference === reference);
        assert.equal(payment?.status, 'pending');
        await proof(agent, 'SOL-01', 'Enregistrer un versement général égal au montant encore dû', {
            entry: ledger.entry,
            amount_cents: total,
            payment: payment.id,
            status: payment.status,
        });
    }
    assert.equal(payment.kind, 'unallocated');
    if (payment.status === 'pending') {
        await row.getByRole('button', { name: 'Confirmer le versement', exact: true }).click();
        await dialog.getByLabel(/Motif après contrôle/).fill('Montant et référence fictifs contrôlés pour la recette locale.');
        await submit(agent, 'Confirmer le versement');
        view = await visit(agent, url);
        assert.equal(view.statement.balance.unallocated_cents, total);
        assert.equal(view.statement.balance.balance_cents, total);
        await proof(agent, 'SOL-02', 'Confirmer le versement avant son affectation', {
            outstanding_cents: total,
            unallocated_cents: view.statement.balance.unallocated_cents,
        });
    }
    if (view.statement.balance.unallocated_cents >= total) {
        const remaining = view.statement.obligation_remaining;
        assert.equal(
            Object.values(remaining).reduce((sum, n) => sum + n, 0),
            total,
        );
        await row.getByRole('button', { name: 'Affecter aux obligations' }).click();
        for (const o of view.obligations) {
            if (remaining[o.id] > 0) await dialog.getByLabel(o.title + ' (' + o.kind + ')', { exact: true }).fill(formatted(remaining[o.id]));
        }
        await dialog.getByLabel('Justification').fill('Affectation des fonds fictifs aux obligations annuelles restantes.');
        await submit(agent, 'Affecter après contrôle');
        view = await visit(agent, url);
        assert.equal(view.statement.balance.balance_cents, 0);
        assert.equal(view.statement.balance.unallocated_cents, 0);
        assert.equal(view.statement.balance.financial_clearance_status, 'cleared');
        await proof(agent, 'SOL-03', 'Affecter aux obligations et solder le compte annuel', {
            allocated_cents: total,
            balance: view.statement.balance,
        });
    }
    const receiptLink = row.getByRole('link', { name: 'Consulter le reçu' });
    const receiptUrl = new URL(await receiptLink.getAttribute('href'), agent.url());
    assert.equal(receiptUrl.origin, new URL(agent.url()).origin);
    const opened = agent
        .context()
        .waitForEvent('page', { timeout: 20000 })
        .catch(() => null);
    await receiptLink.click();
    const popup = await opened;
    const receipt = popup ?? agent;
    if (!popup) await receipt.goto(receiptUrl.href, { waitUntil: 'domcontentloaded' });
    await receipt.waitForURL(receiptUrl.href, { timeout: 120000 });
    await receipt.waitForLoadState('domcontentloaded');
    assert.equal(new URL(receipt.url()).origin, new URL(agent.url()).origin);
    await receipt.locator('main').getByText(reference, { exact: true }).waitFor();
    let exported;
    const privateDir = path.join(fs.realpathSync(process.env.USK_RECETTE_V2_ROOT), 'reçus-simulation');
    fs.mkdirSync(privateDir, { recursive: true });
    await receipt.exposeFunction('exporterRecuQa', () => {
        exported = receipt.pdf({ path: path.join(privateDir, 'solde-general.pdf'), printBackground: true, format: 'A4' });
        return exported.then(() => true);
    });
    await receipt.evaluate(() => {
        window.print = () => window.exporterRecuQa();
    });
    await receipt.getByRole('button', { name: /Imprimer.*PDF/ }).click();
    await receipt.waitForFunction(() => !!document.querySelector('.receipt-sheet'));
    assert.ok(exported);
    const bytes = await exported;
    assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
    assert.ok(bytes.length > 1000);
    if (popup) await popup.close();
    else await visit(agent, url);
    await proof(agent, 'SOL-04', 'Produire le PDF du reçu par la commande d’impression du navigateur', {
        payment: payment.id,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
    });

    const refundPanel = async (page) => {
        const details = page.locator('details.finance-account-options');
        if (!(await details.evaluate((el) => el.open))) await details.locator('summary').click();
        return details.locator('article').filter({ hasText: reason });
    };
    let refund = refundFor(view, payment.id);
    if (!refund) {
        await row.getByText('Autres actions', { exact: true }).click();
        await row.getByRole('button', { name: 'Demander un remboursement', exact: true }).click();
        await dialog.getByLabel(/^Montant demandé/).fill('1.00');
        await dialog.getByLabel(/^Justification/).fill(reason);
        await submit(agent, 'Enregistrer après contrôle');
        view = await visit(agent, url);
        refund = refundFor(view, payment.id);
        assert.equal(refund?.status, 'requested');
        await refundPanel(agent);
        await proof(agent, 'SOL-05', 'Demander un remboursement fictif partiel', {
            refund: refund.id,
            amount_cents: refund.amount_cents,
            status: refund.status,
        });
    }
    if (refund.status === 'requested') {
        await visit(institution, url);
        await (await refundPanel(institution)).getByRole('button', { name: 'Autoriser', exact: true }).click();
        await institution
            .getByRole('dialog')
            .getByLabel(/^Justification/)
            .fill('Contrôle institutionnel distinct de la demande de remboursement fictive.');
        await submit(institution, 'Enregistrer après contrôle');
        const validated = await visit(institution, url);
        refund = refundFor(validated, payment.id);
        assert.equal(refund.status, 'approved');
        assert.notEqual(refund.approved_by, refund.requested_by);
        assert.equal(validated.statement.balance.balance_cents, 0);
        await refundPanel(institution);
        await proof(institution, 'SOL-06', 'Autoriser avec un second compte et vérifier le solde', {
            refund: refund.id,
            author: refund.requested_by,
            approver: refund.approved_by,
        });
    }
    if (refund.status === 'approved') {
        await visit(agent, url);
        await (await refundPanel(agent)).getByRole('button', { name: 'Confirmer le décaissement exécuté' }).click();
        await dialog.getByLabel(/^Justification/).fill('Simulation QA du décaissement, limitée à la comptabilité fictive.');
        await dialog.getByLabel(/^Méthode du décaissement exécuté/).selectOption('other');
        await dialog.getByLabel(/^Référence du décaissement confirmé/).fill(execution);
        await submit(agent, 'Enregistrer après contrôle');
    }
    view = await visit(agent, url);
    refund = refundFor(view, payment.id);
    assert.equal(refund.status, 'executed');
    assert.equal(refund.execution_reference, execution);
    assert.equal(refund.amount_cents, 100);
    assert.equal(view.statement.balance.balance_cents, 100);
    assert.equal(view.payments.data.find((p) => p.reference === reference).status, 'confirmed');
    const database = probe('ledger');
    const persisted = database.payments.filter((r) => r[1] === reference);
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0][3], total);
    assert.equal(database.status, 'confirmed');
    await refundPanel(agent);
    await proof(agent, 'SOL-07', 'Simuler le décaissement, contrôler le solde, l’inscription et l’écriture originale', {
        refund: refund.id,
        gross_cents: total,
        balance_cents: view.statement.balance.balance_cents,
        enrollment: database.status,
    });
}).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
});
