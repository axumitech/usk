/* global require, module, Buffer */
/* eslint @typescript-eslint/no-require-imports: "off" */
'use strict';

// Preparation only. The root harness runs this module after validating the isolated profile.
// All business mutations below are performed through visible application controls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports.run = async function run(h) {
    const { page } = h;
    assert.equal(new URL(h.origin).hostname, '127.0.0.1');
    assert.ok(Number.isFinite(Date.parse(h.startedAt)), 'h.startedAt must identify this isolated session.');
    for (const extension of ['pdf', 'png']) assert.ok(fs.existsSync(h.fixtures[extension]), `Missing ${extension} fixture.`);
    const stateFile = path.join(h.work, 'admissions-state.json');
    const prior = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
    const state = prior.startedAt === h.startedAt ? prior : { startedAt: h.startedAt, med: {}, droit: {}, mails: [] };
    const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    const correction = 'RECETTE USK : fournir une nouvelle version nette et complète du justificatif fictif.';
    const rejection = 'RECETTE USK : rejet fictif motivé après examen du document non conforme aux conditions de candidature.';

    const step = (id, actor, action, expected, perform) =>
        h.step(id, actor, action, expected, async () => {
            const observed = await perform();
            save();
            await h.capture(id);
            return observed;
        });
    const blocked = (id, actor, action, expected, reason) => h.block(id, actor, action, expected, reason);
    const wait = async (probe, message, timeout = 15000) => {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            if (await probe()) return;
            await page.waitForTimeout(150);
        }
        throw new Error(message);
    };
    const textContains = async (locator, pattern, message) => {
        await wait(async () => pattern.test(await locator.innerText()), message);
    };
    const mutate = async (control, expectedPath, action = 'click') => {
        const observed = page.waitForResponse(
            (response) => response.request().method() === 'POST' && new URL(response.url()).pathname === expectedPath,
            { timeout: 90000 },
        );
        try {
            await control[action]();
        } catch (error) {
            observed.catch(() => {});
            throw error;
        }
        const response = await observed;
        assert.ok(
            response.status() >= 200 && response.status() < 400,
            `POST ${expectedPath}: HTTP ${response.status()} (expected successful save/redirect, no 405).`,
        );
        return response;
    };
    const selectOption = async (selector, label) => {
        const control = page.locator(selector);
        await control.waitFor({ state: 'visible' });
        const values = await control
            .locator('option')
            .evaluateAll((options) => options.map((option) => ({ value: option.value, text: option.textContent, disabled: option.disabled })));
        const match = values.find((option) => option.value && !option.disabled && label.test(option.text || ''));
        assert.ok(match, `Expected available option ${label} in ${selector}; got ${JSON.stringify(values)}.`);
        await control.selectOption(match.value);
        return { value: match.value, label: match.text };
    };
    const chooseContext = async (faculty) => {
        const record = state[faculty];
        record.context = {};
        record.context.year = await selectOption('#year_id', /2026\D+2027/);
        const years = await page.locator('#year_id option').allTextContents();
        assert.ok(!years.some((year) => /2025\D+2026/.test(year)), 'Closed historical year must not be available.');
        record.context.faculty = await selectOption('#faculty_id', faculty === 'med' ? /médecine/i : /droit/i);
        record.context.program = await selectOption('#academic_program_id', faculty === 'med' ? /médecine|bioméd|MED/i : /droit|DRO/i);
        record.context.level = await selectOption('#level_id', /Licence\s*1|L1/i);
        const order = await page.locator('.enrollment-form-card select').evaluateAll((selects) => selects.map((control) => control.id));
        assert.deepEqual(order.slice(0, 4), ['year_id', 'faculty_id', 'academic_program_id', 'level_id']);
    };
    const next = async (target) => {
        await mutate(page.getByRole('button', { name: 'Enregistrer et continuer', exact: true }), '/app/dashboard/enrollments/save-progress');
        await page.getByRole('heading', { name: target }).waitFor({ state: 'visible' });
    };
    const partial = async (faculty) => {
        const response = await mutate(
            page.getByRole('button', { name: 'Enregistrer et continuer plus tard', exact: true }),
            '/app/dashboard/enrollments/save-progress',
        );
        const body = await response.json();
        assert.equal(body.ok, true);
        assert.ok(body.draft?.uuid, 'The save response must expose the draft UUID.');
        if (state[faculty].uuid) assert.equal(body.draft.uuid, state[faculty].uuid, 'Draft UUID must remain stable.');
        state[faculty].uuid = body.draft.uuid;
        await page.getByText('Brouillon sauvegardé', { exact: true }).waitFor({ state: 'visible' });
        return body.draft;
    };
    const resume = async (faculty) => {
        await h.goto('/app/dashboard/enrollments');
        const link = page.locator(`a[href="/app/dashboard/enrollments/${state[faculty].uuid}/edit"]`);
        assert.equal(await link.count(), 1, 'Exactly one resume link must exist for this UUID.');
        await link.click();
        await page.waitForURL(`**/enrollments/${state[faculty].uuid}/edit`);
    };
    const upload = async (faculty, extension = 'pdf') => {
        const inputs = page.locator('.enrollment-form-card input[type="file"]');
        const count = await inputs.count();
        assert.ok(count > 0, 'The fixture must have at least one admission requirement.');
        state[faculty].documents = [];
        for (let index = 0; index < count; index++) {
            const input = inputs.nth(index);
            const id = await input.getAttribute('id');
            const filename = `qa-${faculty}-${index + 1}.${extension}`;
            const response = page.waitForResponse(
                (result) => result.request().method() === 'POST' && new URL(result.url()).pathname === '/app/dashboard/enrollments/documents/upload',
            );
            await input.setInputFiles({
                name: filename,
                mimeType: extension === 'pdf' ? 'application/pdf' : 'image/png',
                buffer: fs.readFileSync(h.fixtures[extension]),
            });
            assert.equal((await response).status(), 200, 'The file must upload successfully.');
            await page.locator(`#${id}`).locator('..').getByText(filename, { exact: true }).waitFor({ state: 'visible' });
            state[faculty].documents.push({ input: id, filename });
        }
    };
    const submit = async (faculty) => {
        await next('Un dernier regard avant l’envoi.');
        await page.locator('#confirmed').check();
        await mutate(
            page.getByRole('button', { name: 'Soumettre mon dossier', exact: true }),
            `/app/dashboard/enrollments/${state[faculty].uuid}/submit`,
        );
        await page.waitForURL('**/app/dashboard/enrollments');
        const card = page
            .locator('.student-enrollment-card')
            .filter({ has: page.locator(`a[href="/app/dashboard/enrollments/${state[faculty].uuid}"]`) });
        await textContains(card.locator('.student-badge').first(), /soumis|transmis/i, 'The candidate must see the submitted status.');
    };
    const openAdmin = async (faculty) => {
        await h.goto(
            `/app/dashboard/admin/enrollments?q=${encodeURIComponent(faculty === 'med' && h.candidateEmail ? h.candidateEmail : `candidat.${faculty}@usk.test`)}`,
        );
        const links = await page.locator('a[href]').evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href')));
        const candidates = [...new Set(links.map((href) => href?.match(/\/admin\/enrollments\/(\d+)(?:[?#]|$)/)?.[1]).filter(Boolean))];
        assert.equal(candidates.length, 1, 'Search by exact candidate email must identify one dossier.');
        state[faculty].id = Number(candidates[0]);
        await page.locator(`a[href="/app/dashboard/admin/enrollments/${candidates[0]}"]`).first().click();
        await page.waitForURL(`**/admin/enrollments/${candidates[0]}`);
        await page.getByRole('region', { name: 'Décision sur la pièce sélectionnée' }).waitFor({ state: 'visible' });
        const start = page.getByRole('button', { name: 'Commencer l’analyse', exact: true });
        const verdict = decisionPane().getByRole('radio', {name:'Accepter', exact:true});
        await start.or(verdict).first().waitFor({state:'visible'});
        if (await start.isVisible()) {
            await mutate(start, `/app/dashboard/admin/enrollments/${candidates[0]}/start-analysis`);
            await verdict.waitFor({state:'visible'});
        }
        // Verify the saved administrative state on a new response before changing user.
        await page.reload({waitUntil:'domcontentloaded'});
        await verdict.waitFor({state:'visible'});
    };
    const decisionPane = () => page.getByRole('region', { name: 'Décision sur la pièce sélectionnée' });
    const acceptSelected = async (faculty) => {
        await decisionPane().getByRole('radio', { name: 'Accepter', exact: true }).check();
        const name = await decisionPane().getByRole('radio', { name: 'Accepter', exact: true }).getAttribute('name');
        const uuid = name.replace(/^verdict-/, '');
        await mutate(
            decisionPane().getByRole('button', { name: 'Accepter cette pièce', exact: true }),
            `/app/dashboard/admin/enrollments/${state[faculty].id}/documents/${uuid}/review`,
        );
        await textContains(decisionPane().locator('.review-proof-status').first(), /Accept/, 'The selected document must be accepted.');
    };
    const finalDecision = async (faculty, kind, reason) => {
        await page.getByRole('button', { name: kind === 'validate' ? 'Valider le dossier' : 'Rejeter la demande', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor({ state: 'visible' });
        await dialog.locator('#admission-decision-reason').fill(reason);
        await dialog.getByRole('checkbox', { name: /J’ai examiné/ }).check();
        await mutate(
            dialog.getByRole('button', { name: kind === 'validate' ? 'Confirmer la validation' : 'Confirmer le rejet', exact: true }),
            `/app/dashboard/admin/enrollments/${state[faculty].id}/${kind}`,
        );
        await dialog.waitFor({ state: 'hidden' });
        await textContains(page.locator('.review-status').first(), kind === 'validate' ? /Admis/ : /Refus/, 'The official decision must be visible.');
    };

    let med = await step(
        'S02-01',
        'Candidat Médecine',
        'Choisir l’année, la faculté, le programme et L1',
        'Année 2026-2027 en premier ; contexte cohérent disponible',
        async () => {
            await h.login(h.candidateEmail || 'candidat.med');
            await h.goto('/app/dashboard/enrollments');
            assert.equal(
                await page.locator('.student-enrollment-card').count(),
                0,
                'Use the pristine isolated candidate; do not duplicate an existing application.',
            );
            await h.goto('/app/dashboard/enrollments/create');
            await chooseContext('med');
            await next('Vérifiez vos coordonnées.');
            state.med.name = 'Candidat Médecine — RECETTE USK';
            await page.locator('#name').fill(state.med.name);
            assert.equal(await page.locator('#email').inputValue(), h.candidateEmail || 'candidat.med@usk.test');
            const draft = await partial('med');
            assert.equal(draft.last_step, 2);
            return `Brouillon ${state.med.uuid}, coordonnées sauvegardées à l’étape 2.`;
        },
    );

    if (med)
        med = await step(
            'S02-02',
            'Candidat Médecine',
            'Se déconnecter puis reprendre le brouillon',
            'Même UUID, nom/email et étape 2 restaurés',
            async () => {
                await h.logout();
                await h.login(h.candidateEmail || 'candidat.med');
                await resume('med');
                await page.getByRole('heading', { name: 'Vérifiez vos coordonnées.' }).waitFor();
                assert.equal(await page.locator('#name').inputValue(), state.med.name);
                assert.equal(await page.locator('#email').inputValue(), h.candidateEmail || 'candidat.med@usk.test');
                await next('Votre parcours et vos justificatifs.');
                return `Reprise du dossier ${state.med.uuid} et passage effectif à l’étape 3 sans erreur 405.`;
            },
        );
    else
        await blocked(
            'S02-02',
            'Candidat Médecine',
            'Reprendre le brouillon',
            'Dossier initial conservé',
            'Création/sauvegarde initiale non validée.',
        );

    if (med)
        await step(
            'S02-03',
            'Candidat Médecine',
            'Tenter de continuer sans pièce exigée',
            'Erreur locale compréhensible ; conservation du brouillon',
            async () => {
                await page.getByRole('button', { name: 'Enregistrer et continuer', exact: true }).click();
                await page.locator('.enrollment-field-error').first().waitFor({ state: 'visible' });
                await page.getByRole('heading', { name: 'Votre parcours et vos justificatifs.' }).waitFor();
                assert.equal(await page.locator('#confirmed').count(), 0);
                return 'Pièce manquante signalée, étape 3 conservée, aucune soumission finale.';
            },
        );
    else
        await blocked(
            'S02-03',
            'Candidat Médecine',
            'Vérifier le dossier incomplet',
            'Validation de la pièce obligatoire',
            'Reprise du brouillon non validée.',
        );

    if (med)
        med = await step(
            'S02-04',
            'Candidat Médecine',
            'Importer les pièces et sauvegarder partiellement',
            'Fichiers enregistrés sur le même dossier',
            async () => {
                await upload('med');
                const draft = await partial('med');
                assert.equal(draft.last_step, 3);
                const documents = Object.values(draft.form_snapshot.documents);
                assert.equal(documents.length, state.med.documents.length);
                assert.ok(
                    documents.every((document) => document.uuid && !document.temp),
                    'The saved files must use persistent document UUIDs.',
                );
                return `${documents.length} pièce(s) persistée(s) ; UUID du dossier inchangé.`;
            },
        );
    else await blocked('S02-04', 'Candidat Médecine', 'Sauvegarder les pièces', 'Pièces conservées', 'Brouillon non disponible.');

    if (med)
        med = await step(
            'S02-05',
            'Candidat Médecine',
            'Reprendre une seconde fois et contrôler les données précédentes',
            'Même année/contexte et mêmes pièces après reconnexion',
            async () => {
                await h.logout();
                await h.login(h.candidateEmail || 'candidat.med');
                await resume('med');
                await page.getByRole('heading', { name: 'Votre parcours et vos justificatifs.' }).waitFor();
                for (const document of state.med.documents) await page.getByText(document.filename, { exact: true }).waitFor({ state: 'visible' });
                await page.getByRole('button', { name: 'Précédent', exact: true }).click();
                assert.equal(await page.locator('#name').inputValue(), state.med.name);
                await page.getByRole('button', { name: 'Précédent', exact: true }).click();
                for (const [selector, field] of [
                    ['#year_id', 'year'],
                    ['#faculty_id', 'faculty'],
                    ['#academic_program_id', 'program'],
                    ['#level_id', 'level'],
                ]) {
                    assert.equal(await page.locator(selector).inputValue(), state.med.context[field].value);
                }
                await next('Vérifiez vos coordonnées.');
                await next('Votre parcours et vos justificatifs.');
                for (const document of state.med.documents) await page.getByText(document.filename, { exact: true }).waitFor({ state: 'visible' });
                return 'Année, faculté, programme, niveau, coordonnées et pièces restaurés sans deuxième candidature.';
            },
        );
    else
        await blocked(
            'S02-05',
            'Candidat Médecine',
            'Reprendre les pièces sauvegardées',
            'Conservation du dossier',
            'Sauvegarde documentaire non validée.',
        );

    if (med)
        med = await step('S02-06', 'Candidat Médecine', 'Relire et soumettre la candidature', 'Statut Soumise, une seule candidature', async () => {
            await submit('med');
            assert.equal(await page.locator('.student-enrollment-card').count(), 1);
            return `Dossier ${state.med.uuid} soumis ; une seule carte de candidature visible.`;
        });
    else await blocked('S02-06', 'Candidat Médecine', 'Soumettre le dossier', 'Soumission complète', 'Reprise des données/pièces non validée.');

    let review = false;
    if (med)
        review = await step(
            'S03-01',
            'Doyen Médecine',
            'Ouvrir le dossier, commencer l’analyse et consulter la pièce',
            'Examen explicite et aperçu privé disponibles',
            async () => {
                await h.login('doyen.med');
                await openAdmin('med');
                const preview = page.locator('.review-document-panel iframe, .review-document-panel img').first();
                await preview.waitFor({ state: 'visible' });
                state.med.preview = await preview.getAttribute('src');
                assert.ok(state.med.preview && !state.med.preview.includes('/storage/'), 'Private proof must use its controlled preview route.');
                return `Dossier administratif ${state.med.id} en analyse, pièce affichée via URL contrôlée.`;
            },
        );
    else await blocked('S03-01', 'Doyen Médecine', 'Examiner le dossier', 'Dossier soumis accessible', 'Soumission Médecine non validée.');

    if (review)
        await step(
            'S03-02',
            'Doyen Droit',
            'Essayer le dossier et la pièce de Médecine',
            '403/404 sur dossier et aperçu privé hors faculté',
            async () => {
                await h.login('doyen.droit');
                for (const route of [`/app/dashboard/admin/enrollments/${state.med.id}`, state.med.preview]) {
                    const target = new URL(route, h.origin);
                    assert.equal(target.origin, h.origin, 'A private preview must stay on the isolated application origin.');
                    const response = await page.goto(target.href);
                    assert.ok(response && [403, 404].includes(response.status()), `Cross-faculty access returned ${response?.status()}.`);
                }
                return 'Dossier et document privés refusés à la faculté étrangère.';
            },
        );
    else
        await blocked(
            'S03-02',
            'Doyen Droit',
            'Vérifier le cloisonnement facultaire',
            'Accès étranger refusé',
            'Dossier administratif non identifié.',
        );

    if (review)
        review = await step(
            'S03-03',
            'Doyen Médecine',
            'Demander correction avec plusieurs motifs et Autre motif',
            'Motifs historisés ; validation impossible tant que la pièce reste à corriger',
            async () => {
                await h.login('doyen.med');
                await h.goto(`/app/dashboard/admin/enrollments/${state.med.id}`);
                await decisionPane().getByRole('radio', { name: 'À corriger', exact: true }).check();
                const radioName = await decisionPane().getByRole('radio', { name: 'À corriger', exact: true }).getAttribute('name');
                state.med.correctedDocument = radioName.replace(/^verdict-/, '');
                await decisionPane().getByRole('checkbox', { name: 'Document illisible', exact: true }).check();
                await decisionPane().getByRole('checkbox', { name: 'Document incomplet', exact: true }).check();
                await decisionPane().getByRole('checkbox', { name: 'Autre motif', exact: true }).check();
                await decisionPane().getByLabel('Précisez l’autre motif (obligatoire)', { exact: true }).fill('x');
                await decisionPane().getByRole('button', { name: 'Demander une correction', exact: true }).click();
                await decisionPane().getByText('Précisez l’autre motif en 3 à 1000 caractères.', { exact: true }).waitFor({ state: 'visible' });
                await decisionPane().getByLabel('Précisez l’autre motif (obligatoire)', { exact: true }).fill(correction);
                await mutate(
                    decisionPane().getByRole('button', { name: 'Demander une correction', exact: true }),
                    `/app/dashboard/admin/enrollments/${state.med.id}/documents/${state.med.correctedDocument}/review`,
                );
                assert.equal(await page.getByRole('button', { name: 'Valider le dossier', exact: true }).isDisabled(), true);
                const tabs = page.getByRole('group', { name: 'Documents du dossier' }).getByRole('button');
                for (let index = 1; index < (await tabs.count()); index++) {
                    await tabs.nth(index).click();
                    await acceptSelected('med');
                }
                await mutate(
                    page.getByRole('button', { name: /Demander les corrections \(/ }),
                    `/app/dashboard/admin/enrollments/${state.med.id}/request-corrections`,
                );
                await textContains(
                    page.locator('.review-history'),
                    /Document illisible|document_reviewed|Justificatif|Pièce/,
                    'The documentary decision must be present in history.',
                );
                return 'Motifs illisible+incomplet+autre enregistrés, détail trop court refusé puis correction demandée, admission désactivée.';
            },
        );
    else await blocked('S03-03', 'Doyen Médecine', 'Demander les corrections', 'Décisions documentaires motivées', 'Analyse non disponible.');

    let replacement = false;
    if (review)
        replacement = await step(
            'S03-04',
            'Candidat Médecine',
            'Lire la correction et remplacer la pièce',
            'Motifs compréhensibles, version2 à réexaminer, historique conservé',
            async () => {
                await h.login(h.candidateEmail || 'candidat.med');
                await h.goto(`/app/dashboard/enrollments/${state.med.uuid}`);
                await page.getByRole('tab', { name: /^Justificatifs/ }).click();
                const card = page.locator(`#student-document-${state.med.correctedDocument}`);
                await textContains(card, /Document illisible/, 'The selected reason must be visible to the candidate.');
                await textContains(card, /Document incomplet/, 'All selected reasons must be visible.');
                await textContains(card, /RECETTE USK/, 'The additional explanation must be visible.');
                await card.getByLabel('Remplacer ce justificatif', { exact: true }).setInputFiles({
                    name: 'qa-med-version2.png',
                    mimeType: 'image/png',
                    buffer: fs.readFileSync(h.fixtures.png),
                });
                await mutate(
                    card.getByRole('button', { name: 'Envoyer le justificatif corrigé', exact: true }),
                    `/app/dashboard/enrollments/documents/${state.med.correctedDocument}/replace`,
                );
                await textContains(
                    page.locator(`#student-document-${state.med.correctedDocument}`),
                    /Version 2/,
                    'Replacement must advance the document version.',
                );
                await page.getByRole('tab', { name: 'Historique', exact: true }).click();
                await textContains(
                    page.locator('.student-timeline'),
                    /Nouvelle version|Document illisible|Correction/,
                    'Replacement and review history must remain visible.',
                );
                return 'Remplacement transmis comme version2 ; motifs et événements précédents consultables.';
            },
        );
    else
        await blocked(
            'S03-04',
            'Candidat Médecine',
            'Remplacer le justificatif',
            'Nouvelle version conservant l’historique',
            'Demande de correction non validée.',
        );

    let admitted = false;
    if (replacement)
        admitted = await step(
            'S03-05',
            'Doyen Médecine',
            'Réexaminer la nouvelle version puis admettre',
            'Pièces acceptées et décision officielle motivée',
            async () => {
                await h.login('doyen.med');
                await h.goto(`/app/dashboard/admin/enrollments/${state.med.id}`);
                await page.getByText('De nouvelles versions attendent votre examen', { exact: true }).waitFor();
                await textContains(decisionPane(), /VERSION 2/, 'The administrator must examine version2.');
                await acceptSelected('med');
                await finalDecision(
                    'med',
                    'validate',
                    'RECETTE USK : justificatifs corrigés, relus et conformes aux conditions fictives d’admission.',
                );
                return 'Nouvelle version acceptée ; admission motivée enregistrée et affichée.';
            },
        );
    else await blocked('S03-05', 'Doyen Médecine', 'Admettre le candidat', 'Admission après réexamen', 'Remplacement non validé.');

    if (admitted)
        await step(
            'S03-06',
            'Candidat admis Médecine',
            'Consulter la décision avant tout paiement',
            'Admis et inscription à confirmer ; admission distincte de l’activation financière',
            async () => {
                await h.login(h.candidateEmail || 'candidat.med');
                await h.goto(`/app/dashboard/enrollments/${state.med.uuid}`);
                await page.getByText('Admis', { exact: true }).first().waitFor({ state: 'visible' });
                await page.getByText('Inscription à confirmer', { exact: true }).waitFor({ state: 'visible' });
                const href = await page.getByRole('link', { name: 'Consulter mes frais' }).getAttribute('href');
                assert.ok(href, 'The admitted candidate must have an explicit financial follow-up link.');
                const financial = new URL(href, h.origin);
                assert.equal(financial.origin, h.origin);
                assert.ok(financial.searchParams.get('application') === state.med.uuid || financial.searchParams.has('academic'));
                await page.getByRole('link', { name: 'Consulter mes frais' }).click();
                await page.waitForURL((url) => url.pathname.endsWith('/student/fees'));
                await h.goto(page.url());
                const associated = await page.locator('#app[data-page]').evaluate((el) => JSON.parse(el.getAttribute('data-page')).props.academic);
                assert.equal(associated.enrollment_status, 'pending_confirmation');
                state.med.academic = Number(associated.id);
                assert.ok(state.med.academic > 0);
                return `Admission distincte du paiement : inscription ${state.med.academic} encore à confirmer.`;
            },
        );
    else
        await blocked(
            'S03-06',
            'Candidat Médecine',
            'Consulter l’inscription en attente',
            'Admission sans activation par simple décision',
            'Admission non validée.',
        );

    let droit = await step(
        'S02-07',
        'Candidat Droit',
        'Déposer une candidature Droit indépendante',
        'Dossier complet soumis par les formulaires existants',
        async () => {
            await h.login('candidat.droit');
            await h.goto('/app/dashboard/enrollments');
            assert.equal(await page.locator('.student-enrollment-card').count(), 0, 'The Droit candidate must also be pristine.');
            await h.goto('/app/dashboard/enrollments/create');
            await chooseContext('droit');
            await next('Vérifiez vos coordonnées.');
            await partial('droit');
            await next('Votre parcours et vos justificatifs.');
            await upload('droit', 'png');
            await submit('droit');
            return `Candidature Droit ${state.droit.uuid} soumise avec ses pièces.`;
        },
    );

    if (droit)
        droit = await step(
            'S03-07',
            'Doyen Droit',
            'Refuser une pièce puis motiver le rejet de candidature',
            'Motif documentaire prédéfini et décision officielle distincte',
            async () => {
                await h.login('doyen.droit');
                await openAdmin('droit');
                await decisionPane().getByRole('radio', { name: 'Refuser la pièce', exact: true }).check();
                await decisionPane().getByRole('checkbox', { name: 'Document non conforme', exact: true }).check();
                const radioName = await decisionPane().getByRole('radio', { name: 'Refuser la pièce', exact: true }).getAttribute('name');
                const uuid = radioName.replace(/^verdict-/, '');
                await mutate(
                    decisionPane().getByRole('button', { name: 'Enregistrer le refus', exact: true }),
                    `/app/dashboard/admin/enrollments/${state.droit.id}/documents/${uuid}/review`,
                );
                await finalDecision('droit', 'reject', rejection);
                return 'Refus de pièce pour non-conformité puis rejet officiel motivé, sans admission.';
            },
        );
    else
        await blocked(
            'S03-07',
            'Doyen Droit',
            'Rejeter le dossier avec motivation',
            'Décision officielle compréhensible',
            'Candidature Droit non soumise.',
        );

    if (droit)
        await step(
            'S03-08',
            'Candidat Droit',
            'Lire le rejet et son historique',
            'Refus, motif affiché et aucun lien d’espace étudiant',
            async () => {
                await h.login('candidat.droit');
                await h.goto(`/app/dashboard/enrollments/${state.droit.uuid}`);
                await page.getByText('Refusé', { exact: true }).first().waitFor();
                await page.getByText(rejection, { exact: true }).first().waitFor();
                assert.equal(await page.getByRole('link', { name: 'Mon espace étudiant', exact: true }).count(), 0);
                await page.getByRole('tab', { name: 'Historique', exact: true }).click();
                await textContains(page.locator('.student-timeline'), /Refus/, 'The rejected decision must remain in history.');
                return 'Refus et motivation communiqués ; absence d’ouverture de l’espace étudiant.';
            },
        );
    else await blocked('S03-08', 'Candidat Droit', 'Lire la décision de refus', 'Refus visible sans activation', 'Rejet non validé.');

    // Read-only MailHog lookup is limited to the exact test recipient and this run's timestamp.
    // The selected message is then opened visibly in MailHog for the evidence screenshot.
    const decodeSubject = (value) =>
        String(value)
            .replace(/\?=\s+=\?/g, '?==?')
            .replace(/=\?[^?]+\?([bq])\?([^?]*)\?=/gi, (_, mode, text) => {
                if (mode.toLowerCase() === 'b') return Buffer.from(text, 'base64').toString('utf8');
                const binary = text.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (__, hex) => String.fromCharCode(parseInt(hex, 16)));
                return Buffer.from(binary, 'latin1').toString('utf8');
            });
    const mail = async (id, email, subject, expected) =>
        step(
            id,
            'Candidat / MailHog local',
            `Consulter l’email ${expected}`,
            'Email récent du destinataire fictif et preuve dans l’interface MailHog',
            async () => {
                assert.ok(email.endsWith('@usk.test'), 'Only fictitious test recipients may be inspected.');
                let found;
                await wait(
                    async () => {
                        const response = await h.mailPage.request.get(
                            h.mailOrigin + '/api/v2/search?kind=to&query=' + encodeURIComponent(email) + '&limit=100',
                            { maxRedirects: 0 },
                        );
                        assert.ok(response.ok(), `MailHog API returned ${response.status()}.`);
                        const payload = await response.json();
                        found = (payload.items || []).find((message) => {
                            const recipients = (message.To || []).map((recipient) => `${recipient.Mailbox}@${recipient.Domain}`.toLowerCase());
                            const header = Object.entries(message.Content?.Headers || {}).find(([key]) => key.toLowerCase() === 'subject')?.[1];
                            const title = decodeSubject(Array.isArray(header) ? header.join(' ') : header || '');
                            return recipients.includes(email) && Date.parse(message.Created) >= Date.parse(h.startedAt) && subject.test(title);
                        });
                        return Boolean(found);
                    },
                    `No recent ${expected} email for ${email}; do not use an old message as proof.`,
                    20000,
                );
                const header = Object.entries(found.Content.Headers).find(([key]) => key.toLowerCase() === 'subject')[1];
                const title = decodeSubject(Array.isArray(header) ? header.join(' ') : header);
                await h.mailPage.goto(h.mailOrigin + '/');
                await h.mailPage.bringToFront();
                const message = h.mailPage.locator('.msglist-message').filter({hasText:email}).filter({hasText:subject}).first();
                await message.click();
                const preview = h.mailPage.locator('.preview:visible');
                await preview.waitFor({state:'visible'});
                assert.ok((await preview.innerText()).includes(email), 'Destinataire du courrier ouvert.');
                assert.ok(subject.test(await preview.innerText()), 'Objet du courrier ouvert.');
                const evidence = path.join(h.work, `${id}-mailhog.png`);
                await h.mailPage.screenshot({ path: evidence, fullPage: false, animations: 'disabled' });
                state.mails.push({ recipient: email, subject: title, created: found.Created, evidence: path.basename(evidence) });
                return `${title} ; destinataire ${email} ; reçu ${found.Created} ; capture ${path.basename(evidence)}.`;
            },
        );
    if (med) await mail('S03-MAIL-01', h.candidateEmail || 'candidat.med@usk.test', /candidature.*reçue/i, 'de réception de candidature');
    else await blocked('S03-MAIL-01', 'MailHog', 'Contrôler le reçu de candidature', 'Email récent', 'Soumission Médecine non validée.');
    if (review) await mail('S03-MAIL-02', h.candidateEmail || 'candidat.med@usk.test', /pièces.*compléter/i, 'de demande de correction');
    else await blocked('S03-MAIL-02', 'MailHog', 'Contrôler la demande de correction', 'Email récent', 'Correction non validée.');
    if (admitted) await mail('S03-MAIL-03', h.candidateEmail || 'candidat.med@usk.test', /candidature.*acceptée/i, 'de décision d’admission');
    else await blocked('S03-MAIL-03', 'MailHog', 'Contrôler l’admission', 'Email récent', 'Admission non validée.');
    if (droit) await mail('S03-MAIL-04', 'candidat.droit@usk.test', /Décision concernant votre candidature/i, 'de décision de refus');
    else await blocked('S03-MAIL-04', 'MailHog', 'Contrôler le refus', 'Email récent', 'Rejet non validé.');

    save();
    return state;
};
