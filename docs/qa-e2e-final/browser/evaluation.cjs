/* global require, process, __dirname */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { run } = require('./scenario.cjs');

const teacherEmail = 'professeur.droit@usk.test';
const studentEmail = 'etudiant.droit@usk.test';
const title = 'Devoir noté de recette croisée — Droit';
const room = 'Salle de recette croisée — Droit';
const reason = 'Contrôle du parcours pédagogique de Droit en simulation universitaire locale.';
const feedback = 'Argumentation claire et sources bien identifiées dans la copie fictive.';
const body = 'Copie personnelle fictive : la jurisprudence éclaire l’interprétation de la règle écrite.';
const campusTime = (date) =>
    new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Africa/Kinshasa',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    })
        .format(date)
        .replace(' ', 'T');

async function send(page, button) {
    const [response] = await Promise.all([page.waitForResponse((res) => res.request().method() === 'POST', { timeout: 120000 }), button.click()]);
    assert.ok([302, 303].includes(response.status()), 'Redirection de la mutation : ' + response.status());
}

async function decide(page, button) {
    await page.getByRole('button', { name: button, exact: true }).click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel(/Motif|Justification/).fill(reason);
    await send(page, modal.getByRole('button', { name: 'Enregistrer', exact: true }));
    await modal.waitFor({ state: 'hidden', timeout: 120000 });
}

run('evaluation', async ({ login, visit, proof, check }) => {
    const profile = fs.realpathSync(process.env.USK_RECETTE_V2_ROOT);
    const db = new DatabaseSync(path.join(profile, 'usk-recette-v2.sqlite'), { readOnly: true });
    db.exec('PRAGMA query_only=ON');
    try {
        const audience = db
            .prepare(
                `SELECT e.id AS entry, e.matricule, o.id AS offer, o.academic_year_id AS year FROM academic_enrollments e
            JOIN student_profiles s ON s.id=e.student_profile_id JOIN users u ON u.id=s.user_id
            JOIN academic_course_registrations g ON g.academic_enrollment_id=e.id JOIN academic_offerings o ON o.id=g.academic_offering_id
            JOIN academic_years y ON y.id=o.academic_year_id JOIN professors p ON p.id=o.professor_id JOIN users t ON t.id=p.user_id
            WHERE u.email=? AND t.email=? AND g.withdrawn_at IS NULL AND y.status='open' AND o.is_published=1 AND e.enrollment_status='confirmed'
            ORDER BY o.id LIMIT 1`,
            )
            .get(studentEmail, teacherEmail);
        assert.ok(audience, 'L’étudiant et le professeur doivent partager une offre ouverte.');
        const { entry, offer, year, matricule } = audience;
        const assessment = () =>
            db
                .prepare(
                    `SELECT a.id, r.id AS resource, a.state, a.accepts_until FROM academic_resources r
            JOIN academic_assessments a ON a.academic_resource_id=r.id WHERE r.academic_offering_id=? AND r.title=? ORDER BY r.id DESC LIMIT 1`,
                )
                .get(offer, title);
        const submitted = (resource) =>
            db
                .prepare('SELECT id, version, body, filename FROM academic_submissions WHERE academic_enrollment_id=? AND academic_resource_id=?')
                .get(entry, resource);
        const recordFor = (id) =>
            db
                .prepare(
                    'SELECT id,participation,points,feedback,correction_state,released_at FROM academic_assessment_records WHERE academic_enrollment_id=? AND academic_assessment_id=?',
                )
                .get(entry, id);
        const teacher = await login(teacherEmail);
        const student = await login(studentEmail);
        const staff = await login('admin@usk.test');
        const teacherSpace = '/app/dashboard/teacher/assessments?offering=' + offer;
        let work = assessment();
        await visit(teacher, teacherSpace);
        if (!work) {
            await teacher.getByRole('button', { name: 'Créer une évaluation', exact: true }).click();
            await teacher.getByLabel(/^Titre de l’évaluation/).fill(title);
            await teacher.getByLabel(/^Catégorie/).selectOption('assignment');
            await teacher.getByLabel(/^Consignes/).fill('Comparer la loi et la jurisprudence dans une réponse courte rédigée pour la simulation.');
            await teacher.getByLabel(/^Ouverture des dépôts/).fill(campusTime(new Date(Date.now() - 3600000)));
            await teacher.getByLabel(/^Échéance/).fill(campusTime(new Date(Date.now() + 6 * 60000)));
            await teacher.getByLabel(/^Barème maximal/).fill('20');
            await send(teacher, teacher.getByRole('button', { name: 'Enregistrer le brouillon', exact: true }));
            await teacher.waitForURL((url) => url.searchParams.has('resource'));
            work = assessment();
            assert.equal(work.state, 'draft');
        }
        const assessmentUrl = teacherSpace + '&resource=' + work.resource;
        await visit(teacher, assessmentUrl);
        if (work.state === 'draft') {
            await decide(teacher, 'Publier maintenant');
            work = assessment();
            assert.equal(work.state, 'published');
            await proof(teacher, 'EVA-01', 'Publier le devoir individuel avec sa fenêtre de remise et un barème de 20', {
                offer,
                resource: work.resource,
                deadline: work.accepts_until,
            });
        }
        const list = '/app/dashboard/student/assignments?academic=' + entry;
        await visit(student, list);
        const workLink = student.getByRole('link', { name: new RegExp(title) }).first();
        const studentUrl = new URL(await workLink.getAttribute('href'), student.url()).href;
        await workLink.click();
        await student.waitForURL(studentUrl);
        let copy = submitted(work.resource);
        if (!copy) {
            const summary = student.locator('summary').filter({ hasText: 'Soumettre mon travail' });
            await summary.click();
            await student.getByLabel(/^Votre réponse/).fill(body);
            await student.getByLabel(/^Joindre un fichier/).setInputFiles(path.join(__dirname, 'fixtures', 'illustration.png'));
            await send(student, student.getByRole('button', { name: 'Soumettre mon travail', exact: true }));
            await student.getByText(/Travail transmis.*Version/).waitFor();
            copy = submitted(work.resource);
        }
        assert.equal(copy?.body, body);
        assert.equal(copy.version, 1);
        await proof(student, 'EVA-02', 'Déposer une réponse et une pièce depuis le compte de l’étudiant', {
            entry,
            resource: work.resource,
            submission: copy.id,
            version: copy.version,
        });

        await check(teacher, 'EVA-03', 'Planifier une séance publiée et renseigner la présence du même étudiant', async () => {
            const session = () =>
                db
                    .prepare(
                        'SELECT id,starts_at,attendance_revision FROM academic_sessions WHERE academic_offering_id=? AND room=? AND is_published=1 AND cancelled_at IS NULL ORDER BY id DESC LIMIT 1',
                    )
                    .get(offer, room);
            if (!session()) {
                await visit(staff, '/app/dashboard/admin/schedule?academic_year_id=' + year);
                await staff.getByRole('button', { name: 'Planifier un cours', exact: true }).first().click();
                const modal = staff.getByRole('dialog');
                await modal.locator('select').first().selectOption('single');
                await modal.getByLabel(/Enseignement/).selectOption(String(offer));
                await modal.getByLabel('Début *', { exact: true }).fill(campusTime(new Date(Date.now() - 45 * 60000)));
                await modal.getByLabel('Fin *', { exact: true }).fill(campusTime(new Date(Date.now() - 15 * 60000)));
                await modal.getByLabel('Salle / lieu (facultatif)', { exact: true }).fill(room);
                await modal.getByLabel('Publier dans l’espace étudiant', { exact: true }).check();
                await send(staff, modal.getByRole('button', { name: 'Enregistrer', exact: true }));
                await modal.waitFor({ state: 'hidden', timeout: 120000 });
            }
            const actual = session();
            assert.ok(actual);
            const attendanceUrl = '/app/dashboard/teacher/sessions/' + actual.id + '/attendance';
            const attendance = await visit(teacher, attendanceUrl);
            assert.ok(attendance.canRecord);
            assert.ok(attendance.students.some((row) => row.id === entry));
            const select = teacher.locator('article').filter({ hasText: matricule }).getByRole('combobox');
            if ((await select.inputValue()) !== 'present') {
                await select.selectOption('present');
                await send(teacher, teacher.getByRole('button', { name: 'Enregistrer les présences', exact: true }));
            }
            const updated = await visit(teacher, attendanceUrl);
            assert.equal(updated.students.find((row) => row.id === entry).status, 'present');
            assert.equal(
                db.prepare('SELECT status FROM academic_attendances WHERE academic_session_id=? AND academic_enrollment_id=?').get(actual.id, entry)
                    .status,
                'present',
            );
            return { entry, offer, session: actual.id, status: 'present' };
        });
        await visit(teacher, assessmentUrl);
        work = assessment();
        if (work.state === 'published') {
            const closes = Date.parse(work.accepts_until.replace(' ', 'T') + 'Z');
            assert.ok(Number.isFinite(closes) && closes - Date.now() < 8 * 60000, 'La fenêtre de ce devoir de recette doit être courte.');
            while (Date.now() <= closes + 1000) await new Promise((resolve) => setTimeout(resolve, Math.min(15000, closes + 1100 - Date.now())));
            await visit(teacher, assessmentUrl);
            await decide(teacher, 'Clôturer');
        }
        assert.equal(assessment().state, 'closed');
        let recorded = recordFor(work.id);
        assert.equal(recorded?.participation, 'submitted');
        const recordUrl = assessmentUrl + '&record=' + recorded.id;
        await visit(teacher, recordUrl);
        await teacher.getByText(body, { exact: true }).waitFor();
        if (recorded.correction_state === 'draft') {
            const form = teacher.locator('#assessment-correction');
            await form.getByLabel(/^Note sur 20/).fill('16');
            await form.getByLabel(/^Appréciation privée/).fill(feedback);
            await form.getByLabel(/^Motif/).fill(reason);
            await send(teacher, teacher.getByRole('button', { name: 'Enregistrer la correction', exact: true }));
            assert.equal(recordFor(work.id).points, 1600);
            await visit(teacher, recordUrl);
            await decide(teacher, 'Finaliser la correction');
            recorded = recordFor(work.id);
            assert.equal(recorded.correction_state, 'finalized');
        }
        assert.equal(recorded.points, 1600);
        await proof(teacher, 'EVA-04', 'Consulter la copie et enregistrer puis finaliser la note de 16/20', {
            entry,
            record: recorded.id,
            points: recorded.points,
            feedback: recorded.feedback,
        });
        await visit(student, studentUrl);
        if (!recorded.released_at) {
            assert.equal(await student.getByRole('heading', { name: 'Correction pédagogique', exact: true }).count(), 0);
            await proof(
                student,
                'EVA-05',
                'Relire le devoir avant diffusion des corrections',
                'La rubrique de correction et l’appréciation sont encore privées.',
            );
            const validator = await login('vicedoyen.droit@usk.test');
            const reviewUrl = '/app/dashboard/admin/assessments?offering=' + offer + '&resource=' + work.resource;
            await visit(validator, reviewUrl);
            if (recorded.correction_state !== 'validated') await decide(validator, 'Valider les corrections');
            assert.equal(recordFor(work.id).correction_state, 'validated');
            await visit(validator, reviewUrl);
            await decide(validator, 'Publier les appréciations');
            assert.ok(recordFor(work.id).released_at);
            const handoffs = db
                .prepare('SELECT COUNT(*) AS count FROM academic_assessment_handoffs WHERE academic_assessment_record_id=?')
                .get(recorded.id).count;
            assert.equal(handoffs, 1);
            await proof(validator, 'EVA-06', 'Valider les corrections et publier l’appréciation de l’étudiant', { record: recorded.id, handoffs });
        }
        await visit(student, studentUrl);
        await student.getByRole('heading', { name: 'Correction pédagogique', exact: true }).waitFor();
        await student.getByText(feedback, { exact: true }).waitFor();
        await student.getByText(/Résultat pédagogique 16(?:[.,]00)? \/ 20/).waitFor();
        await proof(student, 'EVA-07', 'Lire la note et l’appréciation individuelles après publication', {
            entry,
            score: '16/20',
            resource: work.resource,
        });
    } finally {
        db.close();
    }
}).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
