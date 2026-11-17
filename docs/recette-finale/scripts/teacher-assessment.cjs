/* global Buffer, exports, require, __dirname */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs = require('node:fs/promises');
const path = require('node:path');

const reason = 'Recette finale avec des personnes et données exclusivement fictives.';
const portrait = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+pBp0AAAAASUVORK5CYII=', 'base64');
const kinshasaDate = (offset) => new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Africa/Kinshasa', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date((require('node:fs').existsSync(path.join(__dirname,'clock.json')) ? Date.parse(JSON.parse(require('node:fs').readFileSync(path.join(__dirname,'clock.json'),'utf8')).now) : Date.now()) + offset)).replace(' ', 'T');

exports.run = async function run(context) {
    const { fixture, origin, newPage, login, capture, check, record, assertNoErrors, probe } = context;
    const resultFile = path.join(context.work ?? __dirname, 'teacher-assessment-result.json');
    let result = {};
    try { result = JSON.parse(await fs.readFile(resultFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const pages = {};
    const absolute = (url) => new URL(url, origin).href;
    const props = (page) => page.evaluate(() => JSON.parse(document.querySelector('#app').getAttribute('data-page')).props);

    async function go(page, url) {
        const response = await page.goto(absolute(url));
        check(response && response.status() < 400, `Page ${url} accessible`);
        await page.waitForLoadState('networkidle');
        if (assertNoErrors) await assertNoErrors(page);
        return props(page);
    }

    async function submitModal(page) {
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel(/Motif|Justification/).fill(reason);
        await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        await page.waitForLoadState('networkidle');
    }

    async function denied(page, url) {
        const response = await page.goto(absolute(url));
        check(response && [403, 404].includes(response.status()), `Refus attendu pour ${url}`);
        return response.status();
    }

    async function makeMaterial(page, faculty, offering) {
        await go(page, `/app/dashboard/teacher/resources?offering=${offering}`);
        await page.getByRole('button', { name: 'Ajouter un support', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel(/^Type/).selectOption('material');
        await dialog.getByLabel(/^Titre/).fill(`Support fictif de recette ${faculty}`);
        await dialog.getByLabel('Texte pédagogique').fill(`Support confidentiel de la faculté ${faculty}.`);
        await dialog.getByLabel('Fichier privé').setInputFiles({ name: `support-fictif-${faculty}.png`, mimeType: 'image/png', buffer: portrait });
        await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        await page.waitForURL(/[?&]resource=\d+/);
        const data = await go(page, page.url());
        const support = data.selected;
        check(support && support.is_published === false, 'Support enregistré en brouillon');
        await page.getByRole('button', { name: 'Publier', exact: true }).click();
        await submitModal(page);
        const published = await go(page, page.url());
        check(published.selected.is_published === true, 'Support publié');
        const proof = await capture(page, `usk-06-prof-${faculty}-support-publie`);
        record(`PROF-${faculty}-SUPPORT`, `Professeur ${faculty}`, 'Créer un support privé puis le publier', 'Support publié dans son enseignement', 'Support publié avec fichier privé', [proof], faculty);
        return support.id;
    }

    async function announce(page, faculty, offering) {
        await go(page, '/app/dashboard/teacher?view=announcements');
        if (await page.getByText(`Annonce fictive de recette ${faculty}`, { exact: true }).count() > 0) {
            record(`PROF-${faculty}-ANNONCE`, `Professeur ${faculty}`, 'Consulter l’annonce créée pendant la recette', 'Annonce ciblée disponible', 'Annonce déjà créée retrouvée', [await capture(page, `usk-06-prof-${faculty}-annonce`)], faculty);
            return;
        }
        await go(page, `/app/dashboard/teacher?view=courses&offering=${offering}`);
        await page.getByRole('button', { name: 'Envoyer une annonce', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel(/Titre/).fill(`Annonce fictive de recette ${faculty}`);
        await dialog.getByLabel(/Message/).fill(`Message de recette exclusivement destiné au cours de ${faculty}.`);
        await dialog.getByRole('button', { name: 'Envoyer l’annonce', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        await page.waitForLoadState('networkidle');
        await go(page, '/app/dashboard/teacher?view=announcements');
        check(await page.getByText(`Annonce fictive de recette ${faculty}`, { exact: true }).count() > 0, 'Annonce créée visible au professeur');
        record(`PROF-${faculty}-ANNONCE`, `Professeur ${faculty}`, 'Publier une annonce du cours', 'Annonce ciblée créée', 'Formulaire soumis', [await capture(page, `usk-06-prof-${faculty}-annonce`)], faculty);
    }

    async function makeAssessment(page, faculty, offering) {
        await go(page, `/app/dashboard/teacher/assessments?offering=${offering}`);
        await page.getByRole('button', { name: 'Créer une évaluation', exact: true }).click();
        await page.getByLabel(/^Titre de l’évaluation/).fill(`Devoir fictif de recette ${faculty}`);
        await page.getByLabel(/^Catégorie/).selectOption('assignment');
        await page.getByLabel(/^Consignes/).fill(`Rédigez une réponse fictive pour la recette ${faculty}.`);
        await page.getByLabel(/^Ouverture des dépôts \(Kinshasa\)/).fill(kinshasaDate(-3600000));
        await page.getByLabel(/^Échéance \(Kinshasa\)/).fill(kinshasaDate(86400000));
        await page.getByLabel(/^Barème maximal/).fill('20');
        await page.getByRole('button', { name: 'Enregistrer le brouillon', exact: true }).click();
        await page.waitForURL(/[?&]resource=\d+/);
        const data = await go(page, page.url());
        check(data.selected && data.selected.state === 'draft', 'Brouillon évaluation enregistré');
        const resource = data.selected.resource_id;
        await page.getByRole('button', { name: 'Publier maintenant', exact: true }).click();
        await submitModal(page);
        const published = await go(page, page.url());
        check(published.selected.state === 'published', 'Devoir publié');
        record(`PROF-${faculty}-DEVOIR`, `Professeur ${faculty}`, 'Créer et publier un devoir individuel noté', 'Devoir publié, ouvert, barème de 20', `Évaluation ${published.selected.id}, ressource ${resource}`, [await capture(page, `usk-06-prof-${faculty}-devoir-publie`)], faculty);
        return { resource, assessment: published.selected.id, offering };
    }

    async function studentWork(page, faculty, student, work, support) {
        await go(page, `/app/dashboard/student/materials/${support}?academic=${student.entry}`);
        check(await page.getByText(`Support fictif de recette ${faculty}`, { exact: true }).count() > 0, 'Support étudiant accessible');
        const materialDownload = page.waitForEvent('download');
        await page.getByRole('link', { name: 'Télécharger', exact: true }).click();
        const downloaded = await materialDownload;
        check(! await downloaded.failure(), 'Support privé téléchargé par son destinataire');
        await go(page, `/app/dashboard/student/announcements?academic=${student.entry}`);
        check(await page.getByText(`Annonce fictive de recette ${faculty}`, { exact: true }).count() > 0, 'Annonce reçue par le public');
        await go(page, `/app/dashboard/student/assignments?academic=${student.entry}`);
        await page.getByRole('link', { name: new RegExp(`Devoir fictif de recette ${faculty}`) }).first().click();
        if (!await page.getByText(/Travail transmis.*Version/).count()) {
            await page.locator('summary').filter({ hasText: 'Soumettre mon travail' }).click();
            await page.getByLabel(/^Votre réponse/).fill(`Copie fictive personnelle de l’étudiant ${faculty}, dossier ${student.entry}.`);
            await page.getByLabel(/^Joindre un fichier/).setInputFiles({ name: `copie-fictive-${faculty}-${student.entry}.png`, mimeType: 'image/png', buffer: portrait });
            await page.getByRole('button', { name: 'Soumettre mon travail', exact: true }).click();
        }
        await page.getByText(/Travail transmis.*Version/).waitFor();
        await page.waitForLoadState('networkidle');
        record(`ETUD-${faculty}-${student.entry}-REMISE`, `Étudiant ${faculty}, dossier ${student.entry}`, 'Consulter support et annonce, remettre un devoir', 'Copie reçue dans son inscription', 'Travail transmis, version 1 visible', [await capture(page, `usk-06-etudiant-${faculty}-${student.entry}-travail-transmis`)], faculty);
        const studentUrl = page.url();
        const refreshed = await go(page, page.url());
        const resources = Array.isArray(refreshed.resources) ? refreshed.resources : refreshed.resources?.data ?? [];
        const submission = resources.find((row) => row.id === work.resource)?.submission?.id;
        check(Number.isInteger(submission), 'Identifiant de la copie de recette disponible');
        return { entry: student.entry, email: student.email, studentUrl, submission };
    }

    async function correct(page, faculty, work) {
        await go(page, `/app/dashboard/teacher/assessments?offering=${work.offering}&resource=${work.resource}`);
        if (await page.getByRole('button', { name: 'Clôturer', exact: true }).count()) {
            const closing = probe('assessment', {resource:work.resource}).assessment; await fs.writeFile(path.join(__dirname,'clock.json'), JSON.stringify({now:new Date(Date.parse(closing.accepts_until)+60000).toISOString(),purpose:'Simulation temporelle uniquement pour la recette de clôture des devoirs.'})); await login(page, fixture.accounts['teacher_'+faculty].email); await go(page, '/app/dashboard/teacher/assessments?offering='+work.offering+'&resource='+work.resource); await page.getByRole('button', { name: 'Clôturer', exact: true }).click();
            await submitModal(page);
        }
        const closed = await go(page, page.url());
        check(closed.selected.state === 'closed' && closed.records.data.length === work.students.length, 'Tous les participants attendus sont inclus dans le devoir');
        for (const row of closed.records.data) {
        if (row.correction_state !== 'draft') { await go(page,'/app/dashboard/teacher/assessments?offering='+work.offering+'&resource='+work.resource+'&record='+row.id); record('PROF-'+faculty+'-'+row.academic_enrollment_id+'-CORRECTION','Professeur '+faculty,'Consulter copie, noter et finaliser la correction','Correction finalisée à 16/20','Correction déjà finalisée contrôlée sur sa fiche',[await capture(page,'prof-'+faculty+'-'+row.academic_enrollment_id+'-correction-finalisee')],faculty); continue; }
        await go(page, `/app/dashboard/teacher/assessments?offering=${work.offering}&resource=${work.resource}`);
        const student = work.students.find((entry) => entry.entry === row.academic_enrollment_id);
        check(student, 'Participant attendu dans le public de recette');
        student.record = row.id;
        await page.locator('.assessment-participant-list a').filter({ hasText: row.name }).first().click();
        await page.locator('#assessment-correction').waitFor();
        check(await page.getByText(`Copie fictive personnelle de l’étudiant ${faculty}, dossier ${student.entry}.`, { exact: true }).count() > 0, 'Copie du bon étudiant consultée');
        await page.getByLabel(/^Note sur 20(?:\.00)?/).fill('16');
        await page.getByLabel(/^Appréciation privée/).fill(`Correction confidentielle validée pour la recette ${faculty}.`);
        await page.getByLabel(/^Fichier corrigé/).setInputFiles({ name: `correction-fictive-${faculty}.png`, mimeType: 'image/png', buffer: portrait });
        await page.locator('#assessment-correction').getByLabel(/^Motif/).fill(reason);
        const correctedResponse=page.waitForResponse(r=>r.request().method()==='GET'&&r.headers()['x-inertia']==='true'); await page.getByRole('button', { name: 'Enregistrer la correction', exact: true }).click(); await correctedResponse; await page.waitForLoadState('networkidle');
        const corrected=await go(page,'/app/dashboard/teacher/assessments?offering='+work.offering+'&resource='+work.resource+'&record='+row.id); check(corrected.record.points===1600,'Note enregistrée et affichée sur la fiche du bon participant');
        await page.getByRole('button', { name: 'Finaliser la correction', exact: true }).click();
        await submitModal(page);
        const finalized = await go(page, page.url());
        check(finalized.record.correction_state === 'finalized', 'Correction finalisée');
        record(`PROF-${faculty}-${student.entry}-CORRECTION`, `Professeur ${faculty}`, 'Consulter copie, noter et finaliser la correction', 'Correction finalisée à 16/20', 'Copie consultée et correction finalisée', [await capture(page, `usk-06-prof-${faculty}-${student.entry}-correction-finalisee`)], faculty);
        }
    }

    async function validateAndRelease(page, faculty, work) {
        await go(page, `/app/dashboard/admin/assessments?offering=${work.offering}&resource=${work.resource}`);
        await page.getByRole('button', { name: 'Valider les corrections', exact: true }).click();
        await submitModal(page);
        const validated = await go(page, page.url());
        check(validated.records.data.every((row) => row.correction_state === 'validated'), 'Corrections validées et transmises');
        await page.getByRole('button', { name: 'Publier les appréciations', exact: true }).click();
        await submitModal(page);
        const published = await go(page, page.url());
        check(published.records.data.every((row) => row.released_at), 'Appréciations publiées');
        const saved = probe('assessment', { resource: work.resource });
        check(saved.is_published && saved.assessment.state === 'closed', 'État du devoir confirmé en base isolée');
        check(saved.assessment.records.length === work.students.length && saved.assessment.records.every((row) => row.points === 1600 && row.correction_state === 'validated' && row.released_at && row.handoffs.length === 1), 'Note validée et transmission unique confirmées en base isolée');
        work.handoff = saved.assessment.records[0].handoffs[0].id;
        work.records = saved.assessment.records.map((row) => ({entry:row.academic_enrollment_id,record:row.id,handoff:row.handoffs[0].id,points:row.points}));
        record(`RESP-${faculty}-TRANSMISSION`, `Responsable ${faculty}`, 'Valider les corrections et publier les appréciations', 'Transmission et appréciation publiées', 'Corrections validées et diffusées', [await capture(page, `usk-06-responsable-${faculty}-corrections-validees`)], faculty);
    }

    for (const faculty of ['med', 'law']) {
        const teacher = pages[`teacher_${faculty}`] = await newPage();
        await login(teacher, fixture.accounts[`teacher_${faculty}`].email);
        const dashboard = await go(teacher, '/app/dashboard/teacher');
        const dashboardProof = await capture(teacher, `usk-06-prof-${faculty}-dashboard`);
        record(`PROF-${faculty}-ESPACE`, `Professeur ${faculty}`, 'Consulter son tableau de bord et ses cours', 'Ses affectations accessibles', 'Dashboard affiché', [dashboardProof], faculty);
        const offering = fixture.offerings[faculty];
        check(dashboard.linked === true, 'Compte professeur rattaché');
        await go(teacher, '/app/dashboard/teacher?view=schedule');
        await capture(teacher, `usk-06-prof-${faculty}-horaire`);
        await go(teacher, `/app/dashboard/teacher?view=courses&offering=${offering}&tab=students`);
        await capture(teacher, `usk-06-prof-${faculty}-public`);
        const work = result[faculty] ??= {offering};
        work.support ??= await makeMaterial(teacher, faculty, offering);
        await fs.writeFile(resultFile, JSON.stringify(result, null, 2));
        if (!work.announced) { await announce(teacher, faculty, offering); work.announced = true; }
        await fs.writeFile(resultFile, JSON.stringify(result, null, 2));
        if (!work.resource) Object.assign(work, await makeAssessment(teacher, faculty, offering));
        await fs.writeFile(resultFile, JSON.stringify(result, null, 2));
        const participants = [fixture.students[faculty]];
        if (faculty === 'med') {
            const candidate = fixture.accounts.candidate;
            const studentData = probe('student', {email:candidate.email});
            const lateEntry = studentData.entries.find((entry) => entry.enrollment_status === 'confirmed');
            check(lateEntry && lateEntry.class_id, 'Candidat tardif confirmé et affecté au groupe de médecine');
            participants.push({entry:lateEntry.id,email:candidate.email});
        }
        const priorStudents = work.students || []; work.students = [];
        for (const participant of participants) {
            const studentPage = await newPage();
            await login(studentPage, participant.email);
            pages[`student_${faculty}_${participant.entry}`] = studentPage;
            pages[`student_${faculty}`] ??= studentPage;
            const priorStudent=priorStudents.find(s=>s.entry===participant.entry); if(priorStudent){await go(studentPage,priorStudent.studentUrl);work.students.push(priorStudent);}else work.students.push(await studentWork(studentPage, faculty, participant, work, work.support));
            await fs.writeFile(resultFile, JSON.stringify(result, null, 2));
        }
        work.studentUrl = work.students[0].studentUrl;
        work.submission = work.students[0].submission;
        const student = pages[`student_${faculty}`];
        await correct(teacher, faculty, work);
        check(await teacher.getByRole('button', { name: 'Valider les corrections', exact: true }).count() === 0, 'La validation reste réservée au responsable habilité');
        await login(student,fixture.students[faculty].email); await go(student, work.studentUrl);
        check(await student.getByRole('heading', { name: 'Correction pédagogique', exact: true }).count() === 0, 'Correction non publiée invisible à l’étudiant');
        const privateFeedbackStatus = await denied(student, `/app/dashboard/student/resources/${work.resource}/feedback?academic=${fixture.students[faculty].entry}`);
        record(`ETUD-${faculty}-CORRECTION-PRIVEE`, `Étudiant ${faculty}`, 'Ouvrir une correction avant validation et publication', 'Appréciation privée indisponible', `Correction masquée et lien direct refusé ${privateFeedbackStatus}`, [], faculty);
        const validator = pages[`validator_${faculty}`] = await newPage();
        await login(validator, fixture.accounts[faculty === 'med' ? 'dean_med' : 'institutional'].email);
        await validateAndRelease(validator, faculty, work);
        await fs.writeFile(resultFile, JSON.stringify(result, null, 2));
        for (const entry of work.students) {
            const reader = pages[`student_${faculty}_${entry.entry}`];
            await go(reader, entry.studentUrl);
            await reader.getByRole('heading', { name: 'Correction pédagogique', exact: true }).waitFor();
            check(await reader.getByText('Résultat pédagogique 16 / 20', { exact: true }).count() > 0, 'Résultat pédagogique étudiant visible');
            check(await reader.getByText(`Correction confidentielle validée pour la recette ${faculty}.`, { exact: true }).count() > 0, 'Appréciation individuelle visible');
            record(`ETUD-${faculty}-${entry.entry}-CORRECTION`, `Étudiant ${faculty}`, 'Lire sa correction autorisée', 'Note 16/20 et appréciation personnelle', 'Note et appréciation affichées', [await capture(reader, `usk-06-etudiant-${faculty}-${entry.entry}-correction`)], faculty);
        }
    }

    for (const faculty of ['med', 'law']) {
        const other = faculty === 'med' ? 'law' : 'med';
        const teacher = pages[`teacher_${faculty}`];
        const student = pages[`student_${faculty}`];
        const foreign = result[other]; await login(teacher,fixture.accounts['teacher_'+faculty].email); await login(student,fixture.students[faculty].email);
        const professorStatus = await denied(teacher, `/app/dashboard/teacher/assessments?resource=${foreign.resource}`);
        const supportStatus = await denied(student, `/app/dashboard/student/materials/${foreign.support}?academic=${fixture.students[faculty].entry}`);
        const feedbackStatus = await denied(student, `/app/dashboard/student/resources/${foreign.resource}/feedback?academic=${fixture.students[faculty].entry}`);
        const submissionStatus = await denied(student, `/app/dashboard/student/submissions/${foreign.submission}/versions/1?academic=${fixture.students[faculty].entry}`);
        record(`ISO-${faculty}-PROF-ETUD`, `Professeur et étudiant ${faculty}`, 'Ouvrir les liens directs de l’autre faculté', 'Accès refusés sans copies ni notes exposées', `Professeur ${professorStatus}, support ${supportStatus}, correction ${feedbackStatus}, copie ${submissionStatus}`, [await capture(student, `usk-06-${faculty}-refus-correction-autre-faculte`)], faculty);
        await go(student, result[faculty].studentUrl);
        await student.setViewportSize({ width: 390, height: 844 });
        await student.getByRole('heading', { name: 'Correction pédagogique', exact: true }).waitFor();
        record(`MOBILE-${faculty}-DEVOIR`, `Étudiant ${faculty}`, 'Consulter sa correction sur mobile', 'Devoir et correction lisibles', 'Écran mobile chargé', [await capture(student, `usk-06-mobile-${faculty}-correction`, { fullPage: true })], faculty);
    }

    await fs.writeFile(resultFile, JSON.stringify(result, null, 2));
    return result;
};
