/* global exports, require */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs = require('node:fs');
const path = require('node:path');

const entry = 13;
const reference = 'REC06-SOLDE-PREMIERE';
const executionReference = 'REC06-REMBOURSEMENT-FICTIF-10USD';
const reason = 'Remboursement fictif Ordre 06 de 10 USD, sans transaction bancaire ni décaissement réel.';
const projection = (allocation) => ({ id: allocation.id, obligation: allocation.student_obligation_id, amount_cents: allocation.amount_cents });

exports.run = async (h) => {
    const { fixture, origin, artifacts, work, newPage, login, capture, check, record, probe, assertNoErrors } = h;
    const stateFile = path.join(work, 'finance-refund-state.json');
    const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
    const output = { entry, reference, execution_reference: executionReference, simulated: true };
    const pages = [];
    const accountUrl = '/app/dashboard/admin/finance?academic=' + entry;
    const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    const ledger = () => probe('ledger', { entry });
    const payment = (value) => value.payments.find((row) => row.reference === reference);
    const refund = (value) => payment(value)?.refunds.find((row) => row.reason === reason && Number(row.amount_cents) === 1000);
    const props = (page) => page.locator('#app').evaluate((element) => JSON.parse(element.getAttribute('data-page')).props);
    const go = async (page, suffix) => {
        const response = await page.goto(new URL(suffix, origin).href);
        check(response.status() === 200, 'Page financière accessible ' + suffix);
        await page.waitForLoadState('networkidle');
        return props(page);
    };
    const actor = async (key) => {
        const page = await newPage();
        pages.push(page);
        await login(page, fixture.accounts[key].email);
        return page;
    };
    const submit = async (page, fill) => {
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();
        await dialog.getByLabel(/^Justification/).fill(reason);
        if (fill) await fill(dialog);
        const response = page.waitForResponse((result) => result.request().method() === 'POST');
        await dialog.getByRole('button', { name: 'Enregistrer après contrôle', exact: true }).click();
        check((await response).status() < 400, 'Formulaire de remboursement transmis');
        await dialog.waitFor({ state: 'hidden' });
    };
    const refundPanel = async (page) => {
        const panel = page.locator('details.finance-account-options');
        if (!(await panel.evaluate((element) => element.open))) await panel.locator('summary').click();
        return panel.locator('article').filter({ hasText: reason });
    };

    try {
        const initial = ledger();
        check(payment(initial) && Number(payment(initial).amount_cents) === 4000, 'Versement cible de 40 USD présent dans le dossier13');
        if (!state.before) {
            check(initial.enrollment_status === 'confirmed' && initial.first_installment.remaining_cents === 0, 'Inscription confirmée et première tranche couverte avant remboursement');
            check(!refund(initial), 'Aucun remboursement identique avant la recette');
            state.before = initial;
            save();
        }
        output.before = state.before;
        const finance = await actor('finance_med');
        let current = ledger();
        if (!refund(current)) {
            await go(finance, accountUrl);
            const row = finance.getByRole('row').filter({ hasText: reference });
            await row.getByText('Autres actions', { exact: true }).click();
            await row.getByRole('button', { name: 'Demander un remboursement', exact: true }).click();
            await submit(finance, (dialog) => dialog.getByLabel(/^Montant demandé/).fill('10.00'));
            current = ledger();
        }
        check(refund(current), 'Demande de remboursement de 10 USD conservée');
        check(refund(current).requested_by === fixture.accounts.finance_med.id, 'Demande attribuée à l’agent financier Médecine');
        state.refund_id = refund(current).id;
        save();
        await go(finance, accountUrl);
        await refundPanel(finance);
        record('FIN-REF-01', 'Agent financier Médecine', 'Demander le remboursement fictif partiel de 10 USD sur le versement de 40 USD',
            'Demande conservée sans effacer le versement', `Remboursement #${state.refund_id}, auteur financier tracé`,
            [await capture(finance, 'finance-remboursement-demande')], 'med');

        const institution = await actor('institutional');
        current = ledger();
        if (refund(current).status === 'requested') {
            await go(institution, accountUrl);
            await (await refundPanel(institution)).getByRole('button', { name: 'Autoriser', exact: true }).click();
            await submit(institution);
            current = ledger();
        }
        check(['approved', 'executed'].includes(refund(current).status), 'Remboursement autorisé');
        check(refund(current).approved_by === fixture.accounts.institutional.id && refund(current).approved_by !== refund(current).requested_by,
            'Autorisation institutionnelle attribuée à une autre personne');
        await go(institution, accountUrl);
        await refundPanel(institution);
        record('FIN-REF-02', 'Administrateur institutionnel', 'Autoriser la demande fictive par un compte distinct du demandeur',
            'Autorisation tracée avant exécution', 'approved_by distinct de requested_by',
            [await capture(institution, 'finance-remboursement-autorise')], 'med');

        if (refund(current).status === 'approved') {
            check(current.first_installment.remaining_cents === 0, 'Une autorisation seule ne rouvre pas l’obligation');
            await go(finance, accountUrl);
            await (await refundPanel(finance)).getByRole('button', { name: 'Confirmer le décaissement exécuté', exact: true }).click();
            await submit(finance, async (dialog) => {
                await dialog.getByLabel(/^Méthode du décaissement exécuté/).selectOption('other');
                await dialog.getByLabel(/^Référence du décaissement confirmé/).fill(executionReference);
            });
            current = ledger();
        }
        const executed = refund(current);
        check(executed.status === 'executed' && executed.execution_reference === executionReference && executed.method === 'other', 'Décaissement fictif exécuté avec référence unique');
        check(Number(executed.amount_cents) === 1000 && executed.executed_by === fixture.accounts.finance_med.id, 'Montant et exécutant conservés');
        check(current.payments.length === state.before.payments.length, 'Nombre des versements conservé');
        const original = payment(state.before);
        const after = payment(current);
        check(after.id === original.id && Number(after.amount_cents) === 4000 && after.status === 'confirmed', 'Versement partiellement remboursé conservé confirmé à son montant brut');
        check(JSON.stringify(after.allocations.map(projection)) === JSON.stringify(original.allocations.map(projection)), 'Affectations originales conservées');
        check(current.first_installment.status === 'due' && current.first_installment.remaining_cents === 1000, 'Première obligation rouverte à 10 USD');
        check(current.enrollment_status === 'confirmed', 'Inscription annuelle toujours confirmée');
        check(current.audit.some((event) => event.action === 'academic_enrollment_first_installment_review_required'), 'Audit de réexamen financier conservé');
        check(current.confirmation_audits === state.before.confirmation_audits && current.confirmation_notices === state.before.confirmation_notices, 'Confirmation et notification de confirmation conservées sans doublon');
        output.after = current;
        const accountData = await go(finance, accountUrl);
        check(accountData.enrollmentConfirmation.status === 'confirmed' && accountData.enrollmentConfirmation.first_installment_review_required, 'État confirmé et réexamen administratif exposés au compte financier');
        await finance.getByText('La couverture de la première tranche nécessite un réexamen administratif.', { exact: true }).waitFor();
        await finance.getByRole('region', { name: 'Suivi de l’inscription', exact: true }).scrollIntoViewIfNeeded();
        record('FIN-REF-03', 'Agent financier Médecine', 'Exécuter le remboursement fictif et contrôler le registre',
            'Paiement et allocations conservés, première obligation due10USD, inscription confirmée avec audit de réexamen',
            'Remboursement exécuté10USD, première tranche due1000centimes, inscription confirmed et audit présents',
            [await capture(finance, 'finance-remboursement-reexamen-administratif')], 'med');

        const student = await actor('candidate');
        const studentData = await go(student, '/app/dashboard/student/fees?academic=' + entry);
        check(studentData.academic.enrollment_status === 'confirmed' && studentData.first_installment.remaining_cents === 1000 && studentData.first_installment_review_required,
            'Étudiant informé de la nouvelle couverture et du réexamen');
        const first = student.getByRole('region', { name: 'Première tranche et inscription', exact: true });
        await first.getByText('Inscription confirmée', { exact: true }).waitFor();
        await first.getByText('La couverture de la première tranche doit être réexaminée. Contactez le service financier pour connaître la suite.', { exact: true }).waitFor();
        await first.scrollIntoViewIfNeeded();
        const studentProof = await capture(student, 'finance-remboursement-etudiant-informe');
        let next = '/app/dashboard/student/notifications?academic=' + entry;
        let notificationPage = next;
        const notices = [];
        while (next) {
            const data = await go(student, next);
            notices.push(...data.notifications.items.data);
            if (data.notifications.items.data.some((notice) => notice.kind === 'finance' && notice.reference === reference && notice.status === 'refund_executed')) notificationPage = next;
            next = data.notifications.items.next_page_url;
        }
        const expected = notices.filter((notice) => notice.kind === 'finance' && notice.reference === reference && notice.status === 'refund_executed');
        check(expected.length === 1, 'Notification unique de remboursement exécuté adressée au propriétaire');
        await go(student, notificationPage);
        const notice = student.locator('li.student-notice').filter({ hasText: reference }).filter({ hasText: 'Un remboursement a été enregistré comme exécuté' });
        await notice.waitFor({ state: 'visible' });
        await notice.scrollIntoViewIfNeeded();
        output.refund_notice = expected[0];
        record('FIN-REF-04', 'Étudiant Médecine', 'Consulter le reste de première tranche et la notification de remboursement',
            'Réexamen compréhensible et notification financière unique, inscription confirmée',
            'Première tranche due10USD et unique notification refund_executed reçue',
            [studentProof, await capture(student, 'finance-remboursement-notification')], 'med');
        for (const page of pages) await assertNoErrors(page);
        return output;
    } catch (error) {
        output.error = error.message;
        output.interruptions = [];
        for (const [index, page] of pages.entries()) output.interruptions.push(await capture(page, `finance-remboursement-interruption-${index}`).catch(() => null));
        throw error;
    } finally {
        fs.writeFileSync(path.join(artifacts, 'finance-refund.json'), JSON.stringify(output, null, 2));
    }
};
