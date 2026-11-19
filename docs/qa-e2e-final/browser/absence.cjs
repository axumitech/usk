/* global require, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { run } = require('./scenario.cjs');

const withFile = process.argv.includes('--piece') || process.env.USK_QA_ABSENCE_PIECE === '1';

run(withFile ? 'absence-piece' : 'absence', async ({ login, visit, proof, out, origin }) => {
    const directory = fs.realpathSync(process.env.USK_RECETTE_V2_ROOT);
    assert.equal(path.basename(directory), 'usk_qa_e2e-rectorat');
    const { token, password } = JSON.parse(fs.readFileSync(path.join(directory, 'final-qa.json'), 'utf8'));
    const db = new DatabaseSync(path.join(directory, 'usk-recette-v2.sqlite'), { readOnly: true });
    try {
        assert.equal(db.prepare('PRAGMA user_version').get().user_version, token);
        const mark = db
            .prepare(
                `SELECT a.id,a.status,a.academic_session_id AS session,e.id AS entry,u.email,u.id AS student
            FROM academic_attendances a JOIN academic_enrollments e ON e.id=a.academic_enrollment_id
            JOIN student_profiles p ON p.id=e.student_profile_id JOIN users u ON u.id=p.user_id
            JOIN academic_sessions s ON s.id=a.academic_session_id
            WHERE a.id=? AND a.status='absent' AND s.is_published=1 AND s.cancelled_at IS NULL AND s.ends_at<=datetime('now')`,
            )
            .get(withFile ? 11 : 6);
        assert.equal(mark?.email, withFile ? 'etudiant.dpu.11@usk.test' : 'etudiant.dpu.06@usk.test');
        const reason = 'Absence à la séance de droit public pour un déplacement familial fictif. Recette USK, appel numéro ' + mark.id + '.';
        const decision = 'Justification acceptée après vérification du motif déclaré pour la séance du 12 mai 2026.';
        const studentUrl = '/app/dashboard/student/absences?academic=' + mark.entry;
        const staffUrl = '/app/dashboard/admin/schedule/absences?status=submitted';
        const findRecord = (data) => data.records.data.find((r) => r.id === mark.id);
        function panel(page, data) {
            const index = data.records.data.findIndex((r) => r.id === mark.id);
            assert.ok(index >= 0, 'L’absence doit figurer sur cette page.');
            return page.locator('main.student-portal > section.portal-panel').nth(index);
        }
        async function submit(page, pathname) {
            const sent = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === pathname, { timeout: 120000 });
            await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer', exact: true }).press('Enter');
            assert.equal((await sent).status(), 303);
            await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 120000 });
        }
        const student = await login(mark.email, password);
        await student.bringToFront();
        let data = await visit(student, studentUrl);
        assert.equal(data.staff, false);
        const record = findRecord(data);
        assert.ok(record, 'Absence initiale non trouvée dans les relevés de cet étudiant.');
        let original;
        if (withFile) {
            assert.equal(data.records.data[1]?.id, mark.id, 'Le contrôle porte sur la deuxième ligne de la liste.');
            assert.equal(record.student, null, 'La projection de la deuxième ligne doit rester étudiante.');
        }
        if (!record.case) {
            await panel(student, data).getByText('Absence constatée', { exact: false }).waitFor();
            await proof(student, 'ABS-01', 'Ouvrir le relevé initial de l’étudiant', { ...mark, cours: record.course, date: record.date });
            await panel(student, data).getByRole('button', { name: 'Déposer une justification' }).press('Enter');
            await student
                .getByRole('dialog')
                .getByRole('textbox', { name: /^Motif/ })
                .fill(reason);
            if (withFile) {
                const attachment = await student.context().browser().newPage();
                try {
                    await attachment.setContent(
                        '<article style="width:480px;padding:24px;background:white;color:black;font:18px Arial"><h2>Justification d’absence</h2><p>SPECIMEN — Recette locale USK</p><p>Séance du 12 mai 2026 · Droit public</p><p>Déplacement familial fictif · Appel 11</p></article>',
                    );
                    original = await attachment.locator('article').screenshot({ type: 'png' });
                } finally {
                    await attachment.close();
                }
                await student.bringToFront();
                await student
                    .getByRole('dialog')
                    .locator('input[type=file]')
                    .setInputFiles({ name: 'justification-specimen.png', mimeType: 'image/png', buffer: original });
            }
            await submit(student, '/app/dashboard/student/absences/' + mark.id);
            data = await visit(student, studentUrl);
        }
        let item = findRecord(data)?.case;
        assert.equal(item?.reason, reason);
        assert.ok(['submitted', 'accepted'].includes(item.status));
        const reviewer = db.prepare("SELECT id,email FROM users WHERE email='admin@usk.test'").get();
        const caseId = item.id;
        if (item.status === 'submitted') {
            assert.equal(item.revision, 1);
            await panel(student, data).getByText(reason, { exact: true }).waitFor();
            await proof(student, 'ABS-02', 'Déposer la justification et relire son état soumis', {
                absence: mark.id,
                demande: caseId,
                etat: item.status,
            });
            const staff = await login(reviewer.email, password);
            await staff.bringToFront();
            const list = await visit(staff, staffUrl);
            assert.equal(list.staff, true);
            assert.equal(findRecord(list)?.case?.id, caseId);
            await panel(staff, list).getByText(reason, { exact: true }).waitFor();
            await panel(staff, list).getByRole('button', { name: 'Examiner' }).press('Enter');
            const dialog = staff.getByRole('dialog');
            await dialog.getByRole('combobox').selectOption('accepted');
            await dialog.getByRole('textbox', { name: /^Motif communiqué à l’étudiant/ }).fill(decision);
            await proof(staff, 'ABS-03', 'Examiner la demande et motiver l’acceptation', { demande: caseId, agent: reviewer.email, decision });
            await submit(staff, '/app/dashboard/admin/schedule/absences/' + caseId + '/decision');
        }
        await student.bringToFront();
        data = await visit(student, studentUrl);
        item = findRecord(data).case;
        assert.equal(item.id, caseId);
        assert.equal(item.status, 'accepted');
        assert.equal(item.decision_reason, decision);
        assert.equal(item.revision, 2);
        const row = panel(student, data);
        await row.getByText(/· Acceptée$/u).waitFor();
        await row.getByText('Décision · ' + decision, { exact: true }).waitFor();
        const events = db
            .prepare("SELECT action,actor_id FROM academic_audits WHERE entity_type='academic_absence_justifications' AND entity_id=? ORDER BY id")
            .all(caseId);
        assert.deepEqual(
            events.map((event) => [event.action, event.actor_id]),
            [
                ['absence_justification_submitted', mark.student],
                ['absence_justification_reviewed', reviewer.id],
            ],
        );
        await proof(student, 'ABS-04', 'Relire la décision et son motif dans le même espace étudiant', {
            absence: mark.id,
            demande: caseId,
            inscription: mark.entry,
            etat: item.status,
            motif: item.decision_reason,
            revision: item.revision,
            audit: events,
        });
        if (withFile) {
            assert.equal(data.records.data[1].student, null);
            const link = row.getByRole('link', { name: 'Télécharger la pièce privée' });
            const url = new URL(await link.getAttribute('href'), origin);
            assert.equal(url.origin, origin);
            assert.equal(url.pathname, '/app/dashboard/student/absences/' + caseId + '/file');
            const dbPath = db.prepare('SELECT path FROM academic_absence_justifications WHERE id=?').get(caseId).path;
            assert.match(dbPath, /^absence-justifications\/[a-zA-Z0-9]+\.png$/);
            const stored = fs.readFileSync(path.join(directory, 'storage/app/private', dbPath));
            if (original) assert.deepEqual(stored, original);
            const wait = student.waitForEvent('download');
            await link.press('Enter');
            const file = path.join(out, 'justification-etudiant.png');
            await (await wait).saveAs(file);
            const bytes = fs.readFileSync(file);
            assert.deepEqual(bytes, stored);
            await proof(student, 'ABS-05', 'Télécharger la pièce privée depuis la deuxième ligne étudiante', {
                ligne: 2,
                demande: caseId,
                route: url.pathname,
                octets: bytes.length,
                sha256: createHash('sha256').update(bytes).digest('hex'),
            });
            const outsider = await login('etudiant.dpu.06@usk.test', password);
            const denied = await outsider.goto(url.href, { waitUntil: 'domcontentloaded' });
            assert.equal(denied.status(), 404);
            await proof(outsider, 'ABS-06', 'Vérifier la protection de la pièce depuis un autre compte étudiant', {
                demande: caseId,
                http: denied.status(),
            });
        }
    } finally {
        db.close();
    }
}).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
