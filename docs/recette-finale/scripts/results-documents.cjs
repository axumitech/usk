/* global module, require, __dirname */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs = require('node:fs');
const path = require('node:path');

const resultPath = '/app/dashboard/admin/academic-results';
const documentPath = '/app/dashboard/admin/official-documents';
const reason = 'Recette fictive Ordre 06, sans valeur administrative.';
const specimen = 'SPECIMEN — DONNEES FICTIVES — SANS VALEUR ADMINISTRATIVE';
const id = (value) => typeof value === 'object' && value !== null ? value.id : value;
const userId = (account) => account.user || account.id;

async function props(page) {
    return page.locator('#app').evaluate((element) => JSON.parse(element.getAttribute('data-page')).props);
}

async function submit(page, button, allowErrors = false) {
    const following = page.waitForResponse((response) => response.request().method() === 'GET'
        && response.headers()['x-inertia'] === 'true', { timeout: 30000 });
    await button.click();
    const response = await following;
    const returned = await response.json();
    await page.goto(response.url());
    const state = returned.props;
    if (!allowErrors && Object.keys(state.errors || {}).length) throw new Error(JSON.stringify(state.errors));
    return state;
}

async function saveModal(page, trigger, values = {}) {
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    for (const [label, value] of Object.entries(values)) {
        const field = dialog.getByLabel(new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\*?$'));
        if (typeof value === 'boolean') await field.setChecked(value);
        else if (await field.evaluate((element) => element.tagName) === 'SELECT') await field.selectOption(String(value));
        else await field.fill(String(value));
    }
    return submit(page, dialog.getByRole('button', { name: 'Enregistrer', exact: true }));
}

module.exports.run = async ({ fixture, origin, artifacts, login, capture, check, newPage, record, assertNoErrors, phase = 'all' }) => {
    const output = { documents: {}, results: {}, limitations: [
        'Règlement exclusivement synthétique repris de AcademicTeachingTest, sans adoption institutionnelle USK.',
        'Signataires fictifs et attestation specimen. Diplômes et règlement institutionnel hors validation réelle.',
    ] };
    const pages = [];
    const actor = async (key, viewport) => {
        const page = await newPage(viewport ? { viewport } : {});
        pages.push(page);
        const account = fixture.accounts[key] || fixture.students[key.replace('student_', '')];
        await login(page, account.email);
        return page;
    };
    const visit = async (page, suffix) => {
        const response = await page.goto(origin + suffix);
        check(response && response.status() < 400, 'Page inaccessible ' + suffix);
        return props(page);
    };
    const entry = id(fixture.students.med.entry);
    if (phase !== 'results') try {
        const manager = await actor('registrar_med');
        const signer = await actor('dean_med');
        let state = await visit(manager, documentPath);
        const university = state.universities.find((item) => item.faculties.some((faculty) => /Médecine/i.test(faculty.name)));
        check(university, 'Établissement médecine absent du catalogue documentaire');
        const faculty = university.faculties.find((item) => /Médecine/i.test(item.name));
        state = await saveModal(manager, manager.getByRole('button', { name: 'Ajouter un type', exact: true }), {
            'Établissement': university.id, 'Faculté': faculty.id, 'Famille': 'enrollment', 'Code': 'TESTRECETTE06',
            'Libellé': 'Attestation SPECIMEN recette 06', 'Demandes étudiantes': true, 'Téléchargement étudiant': true,
            'Impression autorisée': true, 'Duplicata ou rectification': true,
            'Appliquer la règle de délivrance financière': false, 'Motif': reason,
        });
        const type = state.type;
        check(type && !type.active, 'Type specimen créé inactif');
        state = await saveModal(manager, manager.getByRole('button', { name: 'Nouvelle version', exact: true }), {
            'Titre': specimen, 'Texte et variables': specimen + '\nNous attestons, pour la recette, l’inscription fictive de {{ student }} pour {{ year }}.',
            'Compte du signataire (ID)': userId(fixture.accounts.dean_med),
            'Qualité du signataire': 'Signataire fictif de recette', 'Motif': reason,
        });
        const template = state.templates.data[0];
        check(template && !template.approved_at, 'Modèle specimen soumis par un auteur distinct');
        await visit(signer, documentPath + '?type=' + type.id);
        await signer.locator('details').filter({ has: signer.locator('summary', { hasText: /Version 1/ }) }).locator('summary').first().click();
        await saveModal(signer, signer.getByRole('button', { name: 'Approuver', exact: true }), { 'Motif': reason });
        state = await saveModal(signer, signer.getByRole('button', { name: 'Activer', exact: true }), { 'Motif': reason });
        check(state.type.active, 'Type activé après approbation du signataire');
        const catalogueProof = await capture(signer, 'document-catalogue-specimen');
        record('DOC-01', 'Appariteur / doyen Médecine', 'Créer, approuver et activer un modèle specimen', 'Auteur et signataire distincts', 'Type actif et modèle approuvé par le signataire fictif', [catalogueProof]);

        state = await visit(manager, documentPath + '?academic=' + entry + '&type=' + type.id);
        state = await saveModal(manager, manager.getByRole('button', { name: 'Ouvrir · ' + type.name, exact: true }), { 'Motif': reason });
        const ticket = state.requests.data.find((item) => item.academic_enrollment_id === entry);
        check(ticket && ticket.status === 'open', 'Demande specimen créée');
        state = await saveModal(manager, manager.getByRole('button', { name: 'Contrôler', exact: true }), { 'Motif': reason });
        check(state.requests.data.find((item) => item.id === ticket.id).status === 'reviewed', 'Demande contrôlée');
        await visit(signer, documentPath + '?academic=' + entry + '&type=' + type.id);
        state = await saveModal(signer, signer.getByRole('button', { name: 'Approuver', exact: true }), { 'Motif': reason });
        check(state.requests.data.find((item) => item.id === ticket.id).status === 'approved', 'Demande approuvée par le signataire distinct');
        await visit(manager, documentPath + '?academic=' + entry + '&type=' + type.id);
        state = await saveModal(manager, manager.getByRole('button', { name: 'Émettre', exact: true }));
        const document = state.documents.data[0];
        check(document && document.status === 'issued' && document.validity === 'valid', 'Document émis et conservé');
        const proof = await capture(manager, 'document-specimen-emis');
        output.documents = { type: type.id, template: template.id, request: ticket.id, document: document.id, reference: document.number, verify: document.verify };
        record('DOC-02', 'Appariteur / doyen Médecine', 'Contrôler, approuver et émettre le PDF specimen', 'Émission après contrôle et signature', 'Document archivé visible', [proof]);

        const download = manager.waitForEvent('download');
        await manager.getByRole('link', { name: 'PDF archivé', exact: true }).click();
        const archive = await download;
        const pdf = path.join(artifacts, 'usk-06-attestation-specimen.pdf');
        await archive.saveAs(pdf);
        check(fs.readFileSync(pdf).subarray(0, 4).toString() === '%PDF', 'Archive PDF effectivement téléchargée');
        const publicPage = await newPage(); pages.push(publicPage);
        const verified = await publicPage.goto(new URL(document.verify, origin).href);
        check(verified.status() === 200, 'Vérification publique accessible');
        const publicText = await publicPage.locator('body').innerText();
        check(publicText.includes('Valide') && publicText.includes(document.number), 'Registre public confirme référence et validité');
        check(!publicText.includes(state.entry.name) && !publicText.includes(state.entry.matricule), 'Registre public préserve identité et matricule');
        const publicProof = await capture(publicPage, 'document-verification-publique');
        record('DOC-03', 'Tiers public', 'Vérifier le specimen via sa référence', 'Référence et statut sans identité ni notes', 'Vérification publique minimale et PDF valide', [publicProof, pdf]);
        const outsider = await actor('student_law');
        const denied = await outsider.goto(origin + '/app/dashboard/student/official-documents/' + document.verify.split('/').pop() + '?academic=' + id(fixture.students.law.entry));
        check([403, 404].includes(denied.status()), 'Document médecine interdit à l’étudiant droit');
        record('DOC-04', 'Étudiant Droit', 'Ouvrir directement le document Médecine', 'Refus HTTP', 'Accès refusé HTTP ' + denied.status(), [], 'law');
    } catch (error) {
        output.documents.error = String(error.stack || error);
        const proof = pages.length ? await capture(pages[0], 'document-echec').catch(() => null) : null;
        record('DOC-BLOCK', 'Recette documentaire', 'Parcours specimen', 'Workflow complet', String(error.message || error), proof ? [proof] : []);
    }

    if (phase !== 'documents') try {
        const savedDocuments = path.join(artifacts, 'results-documents-documents-result.json');
        if (fs.existsSync(savedDocuments)) {
            const issued = JSON.parse(fs.readFileSync(savedDocuments)).documents;
            check(issued.document, 'Document specimen précédent émis');
            const owner = await actor('student_med');
            await visit(owner, '/app/dashboard/student/documents?academic=' + entry + '&category=official');
            const ownDownload = owner.getByRole('link', { name: 'Télécharger · Attestation SPECIMEN recette 06', exact: true });
            check(await ownDownload.count() === 1, 'Specimen accessible dans la bibliothèque du propriétaire');
            const downloaded = owner.waitForEvent('download');
            await ownDownload.click();
            const file = path.join(artifacts, 'usk-06-attestation-specimen-etudiant.pdf');
            await (await downloaded).saveAs(file);
            check(fs.readFileSync(file).equals(fs.readFileSync(path.join(artifacts, 'usk-06-attestation-specimen.pdf'))), 'Archive étudiante identique au PDF émis');
            const proof = await capture(owner, 'document-bibliotheque-etudiant');
            record('DOC-05', 'Étudiant Médecine', 'Consulter et télécharger son specimen', 'Document réservé au propriétaire', 'Téléchargement identique à l’archive émise', [proof, file]);
        }
        const author = await actor('vice_med');
        const approver = await actor('dean_med');
        const teacherOutput = path.join(artifacts, 'teacher-assessment-result.json');
        const submitted = fixture.assessment || (fs.existsSync(teacherOutput) ? JSON.parse(fs.readFileSync(teacherOutput)) : null);
        const assessment = submitted?.med || submitted;
        check(assessment, 'Résultats soumis par le professeur encore indisponibles');
        const versionId = id(fixture.versions?.med) || assessment.version_id;
        let state = await visit(author, resultPath + '?version=' + versionId);
        const source = state.assessments.data.find((item) => item.id === (assessment.assessment_id || assessment.assessment));
        check(source, 'Source d’évaluation pédagogique disponible');
        const item = state.items.find((item) => item.id === source.ec);
        check(item, 'EC de la source disponible');
        const configuration = {
            scale: 2000, precision: 2, rounding: 'half_up', weighting: 'coefficients', ec_pass: 1000, ue_pass: 1000,
            compensation: 'none', credit_label: 'crédits', allow_equivalence: false, appeal_days: 7, quorum: 2,
            decisions: { validated: { label: 'Semestre validé', permits_incomplete: false, permits_eliminatory: false, progression: 'none', minimum_credits: 500 } },
            items: { [item.id]: { [source.id]: 10000 } },
        };
        await author.getByText('Créer une version de règlement', { exact: true }).click();
        const ruleForm = author.locator('form').filter({ has: author.getByRole('button', { name: 'Soumettre pour approbation', exact: true }) });
        await ruleForm.getByLabel(/^Niveau/).selectOption(String(item.level_id));
        await ruleForm.getByLabel(/^Périmètre du règlement/).selectOption('S1');
        await ruleForm.getByLabel('Code de version', { exact: true }).fill('TEST-RECETTE06');
        await ruleForm.getByLabel('Code de session', { exact: true }).fill('ordinaire');
        await ruleForm.getByLabel('Applicable à partir du', { exact: true }).fill(fixture.year_start);
        await ruleForm.getByLabel('Référence réglementaire', { exact: true }).fill('TEST-RECETTE — AcademicTeachingTest premier semestre — SANS ADOPTION INSTITUTIONNELLE');
        await ruleForm.getByLabel('Configuration du règlement', { exact: true }).fill(JSON.stringify(configuration));
        state = await submit(author, ruleForm.getByRole('button', { name: 'Soumettre pour approbation', exact: true }));
        const rule = state.rule;
        await visit(approver, resultPath + '?rule=' + rule.id);
        state = await saveModal(approver, approver.getByRole('button', { name: 'Approuver', exact: true }), { 'Motif': reason });
        check(state.rule.approved_at, 'Règlement synthétique approuvé par une seconde personne');
        await visit(author, resultPath + '?rule=' + rule.id);
        await author.getByText('Préparer une délibération', { exact: true }).click();
        const prepare = author.locator('form').filter({ has: author.getByRole('button', { name: 'Calculer les dossiers', exact: true }) });
        await prepare.getByLabel('Date du jury (Kinshasa)', { exact: true }).fill(new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Kinshasa',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(fs.existsSync(path.join(__dirname,'clock.json'))?JSON.parse(fs.readFileSync(path.join(__dirname,'clock.json'),'utf8')).now:Date.now())).replace(' ','T'));
        await prepare.getByLabel(/^Président/).selectOption(String(userId(fixture.accounts.vice_med)));
        await prepare.getByLabel(/^Secrétaire/).selectOption(String(userId(fixture.accounts.dean_med)));
        const jury = [fixture.accounts.vice_med, fixture.accounts.dean_med].map((account) => {
            const member = state.members.find((candidate) => candidate.id === userId(account));
            check(member, 'Membre du jury autorisé absent ' + account.name);
            return member;
        });
        for (const member of jury) await prepare.getByRole('checkbox', { name: member.name, exact: true }).check();
        await prepare.getByLabel('Motif', { exact: true }).fill(reason);
        state = await submit(author, prepare.getByRole('button', { name: 'Calculer les dossiers', exact: true }));
        const run = state.run;
        check(state.dossiers.data.length > 0, 'Dossiers de délibération préparés');
        const unpublishedStudent = await actor('student_med');
        const beforePublication = await visit(unpublishedStudent, '/app/dashboard/student/results?academic=' + entry);
        check(!beforePublication.official_results.selected, 'Résultats préparés encore privés');
        record('RES-PRIVATE', 'Étudiant Médecine', 'Consulter les résultats avant publication', 'Aucun résultat préparé accessible', 'Résultats préparés absents du portail étudiant', []);
        await author.getByText('Faire l’appel et ouvrir le jury', { exact: true }).click();
        let opening = author.locator('form').filter({ has: author.getByRole('button', { name: 'Ouvrir la délibération', exact: true }) });
        await opening.locator('input[type=checkbox]').first().check();
        await opening.getByLabel('Motif', { exact: true }).fill(reason);
        const rejectedQuorum = await submit(author, opening.getByRole('button', { name: 'Ouvrir la délibération', exact: true }), true);
        check(Object.keys(rejectedQuorum.errors || {}).length > 0 && rejectedQuorum.run.state === 'prepared', 'Quorum insuffisant refusé sans ouverture');
        record('RES-QUORUM', 'Vice-doyen Médecine', 'Tenter une ouverture avec un seul présent', 'Refus et jury encore préparé', 'Quorum insuffisant refusé', []);
        await author.getByText('Faire l’appel et ouvrir le jury', { exact: true }).click();
        opening = author.locator('form').filter({ has: author.getByRole('button', { name: 'Ouvrir la délibération', exact: true }) });
        for (const member of jury) await opening.getByRole('checkbox', { name: member.name, exact: true }).check();
        await opening.getByLabel('Motif', { exact: true }).fill(reason);
        state = await submit(author, opening.getByRole('button', { name: 'Ouvrir la délibération', exact: true }));
        for (const dossier of state.dossiers.data) {
            await visit(author, resultPath + '?run=' + run.id + '&result=' + dossier.id);
            state = await saveModal(author, author.getByRole('button', { name: 'Enregistrer une décision', exact: true }), { 'Décision réglementaire': 'validated', 'Motif': reason });
        }
        await visit(author, resultPath + '?run=' + run.id);
        state = await saveModal(author, author.getByRole('button', { name: 'Approuver', exact: true }), { 'Motif': reason });
        check(state.run.state === 'approved', 'Jury approuvé après toutes décisions');
        state = await saveModal(author, author.getByRole('button', { name: 'Publier la session', exact: true }), { 'Motif': reason, 'Notifier les étudiants autorisés': true });
        check(state.run.state === 'published', 'Résultats officiels synthétiques publiés');
        const juryProof = await capture(author, 'resultats-jury-synthetique-publies');
        output.results = { rule: rule.id, run: run.id, results: state.dossiers.data.map((item) => ({ id: item.id, reference: item.reference, entry: item.academic_enrollment_id })) };
        record('RES-01', 'Vice-doyen / doyen Médecine', 'Règlement test, quorum, décisions et publication', 'Workflow complet avec double contrôle', 'Délibération publiée avec décisions tracées', [juryProof]);
        const student = await actor('student_med');
        state = await visit(student, '/app/dashboard/student/results?academic=' + entry);
        check(state.official_results.selected, 'Résultat publié accessible au propriétaire');
        const studentProof = await capture(student, 'resultats-etudiant-publies');
        record('RES-02', 'Étudiant Médecine', 'Consulter le résultat officiel de recette', 'Résultat réservé au propriétaire', 'Résultat visible dans espace étudiant', [studentProof]);
        const other = await actor('student_law');
        const ref = output.results.results.find((item) => item.entry === entry).reference;
        const denied = await other.goto(origin + '/app/dashboard/student/results?academic=' + id(fixture.students.law.entry) + '&official=' + ref);
        check([403, 404].includes(denied.status()), 'Résultat médecine inaccessible étudiant Droit');
        record('RES-03', 'Étudiant Droit', 'Ouvrir le résultat Médecine par lien direct', 'Refus HTTP', 'Accès refusé HTTP ' + denied.status(), [], 'law');
    } catch (error) {
        output.results.error = String(error.stack || error);
        const proof = pages.length ? await capture(pages[pages.length - 1], 'resultats-echec').catch(() => null) : null;
        record('RES-BLOCK', 'Recette résultats', 'Délibération synthétique', 'Workflow complet', String(error.message || error), proof ? [proof] : []);
    }
    for (const page of pages) await assertNoErrors(page);
    fs.writeFileSync(path.join(artifacts, 'results-documents-' + phase + '-result.json'), JSON.stringify(output, null, 2));
    return output;
};
