/* global Buffer, exports, require */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs = require('node:fs');
const path = require('node:path');
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+pBp0AAAAASUVORK5CYII=', 'base64');
const reason = 'Recette fictive des refus et corrections, sans décision d’admission.';
const correctionReason = 'Attestation fictive illisible, transmettre une nouvelle version pour la recette.';
const rejectionReason = 'Rejet fictif motivé : le justificatif transmis ne satisfait pas aux conditions de la formation.';

exports.run = async (h) => {
    const { fixture: fx, origin, artifacts, work, newPage, login, capture, check, record, probe, assertNoErrors } = h;
    const stateFile = path.join(work, 'admission-negative-state.json');
    const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
    const output = { scenarios: [], campaign_restored: false, candidates: {} };
    const pages = [];
    const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    const props = (page) => page.locator('#app').evaluate((element) => JSON.parse(element.getAttribute('data-page')).props);
    const go = async (page, suffix) => {
        const response = await page.goto(new URL(suffix, origin).href);
        check(response.status() < 400, 'Page accessible ' + suffix);
        await page.waitForLoadState('networkidle');
        return props(page);
    };
    const click = async (page, button) => {
        const following = page.waitForResponse((response) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(response.request().method()));
        await button.click();
        const response = await following;
        check(response.status() < 500, 'Action enregistrée sans erreur serveur');
        await page.waitForLoadState('networkidle');
        return response;
    };
    const report = (key, actor, action, expected, obtained, proofs) => {
        output.scenarios.push(key);
        record(key, actor, action, expected, obtained, proofs, 'law');
    };
    const account = async (key) => {
        const page = await newPage();
        pages.push(page);
        await login(page, fx.accounts[key].email);
        return page;
    };
    const campaignFields = (campaign) => Object.fromEntries(['academic_program_id', 'academic_year_id', 'level_id', 'is_open', 'opens_on', 'closes_on', 'additional_documents'].map((key) => [key, campaign[key] ?? null]));
    const campaignUrl = '/app/dashboard/admin/enrollments/campaigns?level_id=' + fx.levels.law;
    const dean = await account('dean_law');
    const correction = await account('candidate_correction');
    const rejected = await account('candidate_rejected');
    const campaignData = await go(dean, campaignUrl);
    const current = campaignData.campaigns.data.find((campaign) => campaign.academic_program_id === fx.programs.law && campaign.academic_year_id === fx.year && campaign.level_id === fx.levels.law);
    check(current, 'Campagne Droit fictive présente');
    state.original_campaign ||= campaignFields(current);
    save();

    const setCampaign = async (open) => {
        await go(dean, campaignUrl);
        await dean.getByRole('button', { name: 'Modifier', exact: true }).click();
        await dean.getByLabel('État', { exact: true }).selectOption(String(open));
        await dean.getByLabel('Ouvre le', { exact: true }).fill(state.original_campaign.opens_on || '');
        await dean.getByLabel('Clôture le', { exact: true }).fill(state.original_campaign.closes_on || '');
        await dean.getByLabel('Justificatifs obligatoires complémentaires (un par ligne)', { exact: true }).fill((state.original_campaign.additional_documents || []).join('\n'));
        await dean.getByLabel('Motif de la modification', { exact: true }).fill(reason);
        await click(dean, dean.getByRole('button', { name: 'Enregistrer la campagne', exact: true }));
        const data = await go(dean, campaignUrl);
        return data.campaigns.data.find((campaign) => campaign.id === current.id);
    };
    const selectLaw = async (page) => {
        await page.locator('#faculty_id').selectOption(String(fx.faculties.law));
        await page.locator('#level_id').selectOption(String(fx.levels.law));
        await page.locator('#year_id').selectOption(String(fx.year));
        if (await page.locator('#academic_program_id').count()) await page.locator('#academic_program_id').selectOption(String(fx.programs.law));
    };

    try {
        try {
            const closed = await setCampaign(false);
            check(closed.is_open === false, 'Campagne Droit fermée par formulaire');
            await go(correction, '/app/dashboard/enrollments/create');
            await selectLaw(correction);
            await correction.getByRole('alert').filter({ hasText: 'La campagne de ce programme n’est pas ouverte' }).waitFor();
            check(await correction.getByRole('button', { name: /Enregistrer et continuer/ }).isDisabled(), 'Campagne fermée empêche de poursuivre');
            const snapshot = probe('student', { email: fx.accounts.candidate_correction.email });
            check(!snapshot.applications.some((entry) => entry.status === 'submitted'), 'Aucune soumission en campagne fermée');
            report('ADM-NEG-CAMPAGNE', 'Candidat Droit / doyen Droit', 'Fermer une campagne et sélectionner cette formation',
                'Message de fermeture et poursuite indisponible', 'Message visible, bouton désactivé, aucune candidature soumise',
                [await capture(correction, 'admission-negative-campagne-fermee')]);
        } finally {
            const restored = await setCampaign(state.original_campaign.is_open);
            check(JSON.stringify(campaignFields(restored)) === JSON.stringify(state.original_campaign), 'Campagne Droit rouverte avec ses champs initiaux');
            output.campaign_restored = true;
            report('ADM-NEG-CAMPAGNE-RESTOREE', 'Doyen Droit', 'Rétablir la configuration de campagne initiale',
                'État, dates et pièces identiques à la configuration initiale', 'Configuration initiale contrôlée après enregistrement',
                [await capture(dean, 'admission-negative-campagne-restauree')]);
        }

        async function submitApplication(page, key, incomplete = false) {
            const before = probe('student', { email: fx.accounts[key].email });
            let application = before.applications[0];
            if (application && application.status !== 'draft') return application;
            await go(page, application ? `/app/dashboard/enrollments/${application.uuid}/edit` : '/app/dashboard/enrollments/create');
            if (await page.locator('#faculty_id').count()) {
                await selectLaw(page);
                await click(page, page.getByRole('button', { name: /Enregistrer et continuer/ }));
                await page.locator('#name').waitFor();
            }
            if (await page.locator('#name').count()) {
                await click(page, page.getByRole('button', { name: /Enregistrer et continuer/ }));
                await page.locator('input[type=file]').first().waitFor();
            }
            if (await page.locator('input[type=file]').count()) {
                if (incomplete && !state.incomplete_proof) {
                    await page.getByRole('button', { name: /Enregistrer et continuer/ }).click();
                    await page.getByRole('alert').filter({ hasText: 'Ajoutez le document' }).first().waitFor();
                    const draft = probe('student', { email: fx.accounts[key].email });
                    check(draft.applications[0].status === 'draft' && draft.entries.length === 0 && !draft.roles.includes('student'), 'Dossier incomplet reste brouillon sans inscription ni rôle étudiant');
                    state.incomplete_proof = await capture(page, 'admission-negative-dossier-incomplet');
                    save();
                }
                const upload = page.waitForResponse((response) => response.url().endsWith('/documents/upload') && response.request().method() === 'POST');
                await page.locator('input[type=file]').first().setInputFiles({ name: `attestation-${key}-v1.png`, mimeType: 'image/png', buffer: image });
                check((await upload).status() === 200, 'Pièce fictive transférée');
                await click(page, page.getByRole('button', { name: /Enregistrer et continuer/ }));
                await page.locator('#confirmed').waitFor();
            }
            await page.locator('#confirmed').check();
            await click(page, page.getByRole('button', { name: /Soumettre mon dossier/ }));
            await page.waitForURL('**/app/dashboard/enrollments');
            application = probe('student', { email: fx.accounts[key].email }).applications[0];
            check(application.status === 'submitted', 'Dossier complet transmis en submitted');
            return application;
        }

        const correctionApp = await submitApplication(correction, 'candidate_correction', true);
        check(state.incomplete_proof, 'Preuve du dossier incomplet disponible');
        report('ADM-NEG-INCOMPLET', 'Candidat Droit', 'Tenter de poursuivre le dossier sans justificatif obligatoire',
            'Pièce exigée et candidature conservée en brouillon', 'Erreur de validation visible, aucune inscription ni rôle étudiant', [state.incomplete_proof]);
        const correctionUrl = '/app/dashboard/admin/enrollments/' + correctionApp.id;
        let data = await go(dean, correctionUrl);
        if (!data.enrollment.analysis_started_at) {
            await click(dean, dean.getByRole('button', { name: 'Commencer l’analyse', exact: true }));
            data = await go(dean, correctionUrl);
        }
        if (data.enrollment.documents[0].version === 1) {
            await dean.getByRole('radio', { name: 'À corriger', exact: true }).check();
            await dean.getByLabel(/Remarque à l’étudiant/).fill(correctionReason);
            await click(dean, dean.getByRole('button', { name: 'Demander une correction', exact: true }));
            await click(dean, dean.getByRole('button', { name: /Demander les corrections \(1\)/ }));
            await go(correction, '/app/dashboard/enrollments/' + correctionApp.uuid);
            await correction.getByRole('tab', { name: /^Justificatifs/ }).click();
            await correction.getByLabel('Remplacer ce justificatif', { exact: true }).setInputFiles({ name: 'attestation-correction-v2.png', mimeType: 'image/png', buffer: image });
            await click(correction, correction.getByRole('button', { name: 'Envoyer le justificatif corrigé', exact: true }));
        }
        data = await go(dean, correctionUrl);
        check(data.enrollment.documents[0].version === 2 && data.enrollment.documents[0].needs_reexamination, 'Nouvelle version à réexaminer visible');
        check(data.enrollment.events.some((event) => event.event === 'document_replaced'), 'Remplacement historisé');
        check(data.enrollment.events.some((event) => event.event === 'document_reviewed' && event.verdict === 'correction_requested'), 'Ancien verdict de correction conservé');
        const reviewProof = await capture(dean, 'admission-negative-nouvelle-version-a-reexaminer');
        await go(correction, '/app/dashboard/enrollments/' + correctionApp.uuid);
        await correction.getByRole('tab', { name: 'Historique', exact: true }).click();
        const historyProof = await capture(correction, 'admission-negative-historique-remplacement');
        const correctionSnapshot = probe('student', { email: fx.accounts.candidate_correction.email });
        check(correctionSnapshot.entries.length === 0 && !correctionSnapshot.roles.includes('student'), 'Correction sans inscription ni activation étudiant');
        output.candidates.correction = correctionSnapshot;
        report('ADM-NEG-CORRECTION', 'Doyen Droit / candidat Droit', 'Demander une correction, remplacer la pièce et consulter l’historique',
            'Version2 à réexaminer, ancien verdict conservé, aucune inscription créée', 'Version2 pending, événements document_reviewed et document_replaced conservés', [reviewProof, historyProof]);

        const rejectedApp = await submitApplication(rejected, 'candidate_rejected');
        const rejectedUrl = '/app/dashboard/admin/enrollments/' + rejectedApp.id;
        data = await go(dean, rejectedUrl);
        if (!data.enrollment.analysis_started_at) await click(dean, dean.getByRole('button', { name: 'Commencer l’analyse', exact: true }));
        if (data.enrollment.status !== 'rejected') {
            await dean.getByRole('button', { name: 'Rejeter la demande', exact: true }).click();
            await dean.locator('#admission-decision-reason').fill(rejectionReason);
            await dean.getByRole('checkbox', { name: /J’ai examiné/ }).check();
            await click(dean, dean.getByRole('button', { name: 'Confirmer le rejet', exact: true }));
        }
        data = await go(rejected, '/app/dashboard/enrollments/' + rejectedApp.uuid);
        check(data.enrollment.rejection_reason === rejectionReason, 'Motif du rejet reçu par le candidat');
        const rejectedSnapshot = probe('student', { email: fx.accounts.candidate_rejected.email });
        check(rejectedSnapshot.applications[0].status === 'rejected' && rejectedSnapshot.entries.length === 0 && !rejectedSnapshot.roles.includes('student'), 'Candidat rejeté sans inscription ni rôle étudiant');
        output.candidates.rejected = rejectedSnapshot;
        report('ADM-NEG-REJET', 'Doyen Droit / candidat Droit', 'Prononcer un rejet motivé et consulter la décision',
            'Rejet visible, motif conservé, aucune inscription ni rôle étudiant', 'Statut rejected confirmé par sonde et motif visible au propriétaire', [await capture(rejected, 'admission-negative-rejet-motive')]);
        for (const page of pages) await assertNoErrors(page);
        return output;
    } catch (error) {
        output.error = error.message;
        output.interruptions = [];
        for (const [index, page] of pages.entries()) output.interruptions.push(await capture(page, `admission-negative-interruption-${index}`).catch(() => null));
        throw error;
    } finally {
        fs.writeFileSync(path.join(artifacts, 'admission-negative.json'), JSON.stringify(output, null, 2));
    }
};
