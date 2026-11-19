/* global require, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { run } = require('./scenario.cjs');

const admission = 12;
const entry = 13;
const email = 'candidat.med@usk.test';
const reference = 'QA-ADM12-INS13-SEUIL';

run('admission-finance', async ({ login, visit, proof }) => {
    const db = new DatabaseSync(path.join(process.env.USK_RECETTE_V2_ROOT, 'usk-recette-v2.sqlite'), { readOnly: true });
    try {
        const identity = db
            .prepare(
                `SELECT a.id AS admission,a.uuid,a.status AS decision,e.id AS inscription,
            u.email,l.code AS niveau,y.title AS annee FROM academic_enrollments e JOIN enrollments a ON a.id=e.application_id
            JOIN student_profiles s ON s.id=e.student_profile_id JOIN users u ON u.id=s.user_id
            JOIN levels l ON l.id=e.level_id JOIN academic_years y ON y.id=e.academic_year_id WHERE e.id=?`,
            )
            .get(entry);
        assert.equal(identity.admission, admission);
        assert.equal(identity.email, email);
        assert.equal(identity.decision, 'validated');
        assert.equal(identity.annee, '2026-2027');
        const obligation = db
            .prepare(
                `SELECT id,amount_cents,finance_tariff_id,currency FROM student_obligations
            WHERE academic_enrollment_id=? AND kind='tuition' AND installment=1`,
            )
            .get(entry);
        assert.ok(obligation?.finance_tariff_id, 'La première tranche doit être établie par le barème de l’admission.');
        const finance = await login('finance.med@usk.test');
        await finance.bringToFront();
        const account = '/app/dashboard/admin/finance?academic=' + entry;
        let view = await visit(finance, account);
        assert.equal(view.selected.id, entry);
        const before = view.enrollmentConfirmation;
        const first = before.first_installment;
        const activation = first.activation;
        assert.ok(activation.automatic);
        assert.equal(activation.base_cents, first.amount_cents - (first.waived_cents || 0));
        assert.equal(first.amount_cents, obligation.amount_cents);
        assert.equal(activation.required_cents, Math.ceil((activation.base_cents * activation.percentage) / 100));
        const lookup = () => view.payments.data.find((payment) => payment.reference === reference);
        let payment = lookup();
        const needed = payment?.amount_cents ?? activation.remaining_cents;
        assert.ok(Number.isInteger(needed) && needed > 0);
        if (!payment) {
            assert.equal(before.status, 'pending_confirmation');
            assert.equal(needed, activation.required_cents);
        }
        await proof(finance, 'AF-01', 'Relire la candidature admise, son inscription et la tranche facturée', {
            ...identity,
            statut_initial_observe: before.status,
            tranche: obligation.id,
            bareme: obligation.finance_tariff_id,
            devise: obligation.currency,
            tranche_nette_centimes: activation.base_cents,
            seuil_pourcent: activation.percentage,
            seuil_centimes: activation.required_cents,
            reprise: Boolean(payment),
        });
        const modal = finance.getByRole('dialog');
        async function save(label) {
            const posted = finance.waitForResponse(
                (res) => res.request().method() === 'POST' && new URL(res.url()).pathname.includes('/student-academic/'),
                { timeout: 120000 },
            );
            await modal.getByRole('button', { name: label, exact: true }).click();
            assert.ok([302, 303].includes((await posted).status()));
            await modal.waitFor({ state: 'hidden', timeout: 120000 });
            view = await visit(finance, account);
            payment = lookup();
        }
        if (!payment) {
            await finance.getByRole('button', { name: 'Saisir un versement', exact: true }).first().click();
            await modal.getByLabel('Frais concernés').selectOption('tuition');
            await modal.getByLabel(/Montant reçu/).fill((needed / 100).toFixed(2));
            await modal.getByLabel('Mode de paiement').selectOption('bank_transfer');
            await modal.getByLabel('Référence unique du versement').fill(reference);
            await modal
                .getByLabel('Pièce ou justification du versement')
                .fill('Versement de recette pour la première tranche de la candidate admise.');
            await save('Enregistrer le versement');
            assert.equal(payment?.status, 'pending');
            assert.equal(view.enrollmentConfirmation.status, 'pending_confirmation');
            await proof(finance, 'AF-02', 'Saisir le versement exact du seuil et vérifier que la saisie reste en attente', {
                inscription: entry,
                paiement: payment.id,
                reference,
                montant_centimes: needed,
                statut: payment.status,
            });
        }
        assert.equal(payment.amount_cents, needed);
        if (payment.status === 'pending') {
            const row = finance.getByRole('row').filter({ hasText: reference });
            await row.getByRole('button', { name: 'Confirmer le versement', exact: true }).click();
            await modal.getByLabel(/Motif après contrôle/).fill('Contrôle du reçu fictif pour le dossier admis n° 12, inscription annuelle n° 13.');
            await save('Confirmer le versement');
        }
        assert.equal(payment.status, 'confirmed');
        assert.equal(view.enrollmentConfirmation.status, 'confirmed');
        const firstAfter = view.enrollmentConfirmation.first_installment;
        assert.equal(firstAfter.activation.remaining_cents, 0);
        assert.equal(firstAfter.paid_cents, needed);
        assert.equal(view.statement.balance.balance_cents, firstAfter.remaining_cents);
        assert.equal(
            db.prepare('SELECT COUNT(*) AS n FROM student_payments WHERE academic_enrollment_id=? AND reference=?').get(entry, reference).n,
            1,
        );
        await proof(finance, 'AF-03', 'Confirmer le paiement et constater l’activation automatique de la même inscription', {
            inscription: entry,
            reference,
            paiement: payment.id,
            valide_centimes: firstAfter.paid_cents,
            solde_centimes: view.statement.balance.balance_cents,
            statut: view.enrollmentConfirmation.status,
        });
        const student = await login(email);
        await student.bringToFront();
        const fees = await visit(student, '/app/dashboard/student/fees?academic=' + entry);
        assert.equal(fees.academic.id, entry);
        assert.equal(fees.academic.email, email);
        assert.equal(fees.academic.application_uuid, identity.uuid);
        assert.equal(fees.academic.enrollment_status, 'confirmed');
        assert.equal(fees.balance.balance_cents, view.statement.balance.balance_cents);
        const guide = student.getByRole('button', { name: 'Fermer le guide de bienvenue' });
        if (await guide.isVisible()) await guide.click();
        const transactions = await visit(student, '/app/dashboard/student/transactions?academic=' + entry);
        assert.equal(transactions.academic.id, entry);
        assert.ok(transactions.payments.some((p) => p.reference === reference && p.status === 'confirmed'));
        await student.getByText(reference, { exact: false }).filter({ visible: true }).first().waitFor();
        await proof(student, 'AF-04', 'Rouvrir le portail de la candidate devenue étudiante et relire référence et solde', {
            candidature: admission,
            inscription: entry,
            reference_candidature: fees.academic.reference,
            matricule: fees.academic.matricule,
            reference_versement: reference,
            solde_centimes: fees.balance.balance_cents,
            devise: fees.balance.currency,
        });
    } finally {
        db.close();
    }
}).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
