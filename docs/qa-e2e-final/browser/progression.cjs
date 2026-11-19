/* global require, process, __dirname */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { run } = require('./scenario.cjs');

function inspect() {
    return JSON.parse(execFileSync(process.env.USK_QA_PHP || 'php', [path.join(__dirname, 'progression-probe.php')], { encoding: 'utf8' }));
}

async function submit(page, button, pathname) {
    const [response] = await Promise.all([
        page.waitForResponse((r) => new URL(r.url()).pathname === pathname && r.request().method() === 'POST'),
        button.click(),
    ]);
    assert.ok([302, 303].includes(response.status()), 'Réponse HTTP du formulaire : ' + response.status());
}

function validate(row, previous, kind) {
    assert.deepEqual(row.source, previous.source);
    assert.deepEqual(row.official, previous.official);
    assert.ok(previous.past_payments.some((payment) => payment.status === 'confirmed' && payment.amount_cents > 0));
    assert.deepEqual(row.past_payments, previous.past_payments);
    assert.equal(row.target_tuition.length, 1);
    assert.equal(row.target_tuition[0].installment, 1);
    assert.equal(row.target_tuition[0].amount_cents, 10000);
    assert.equal(row.target_tuition[0].currency, 'USD');
    assert.equal(row.decision.kind, kind);
    assert.equal(row.decision.academic_official_result_id, row.official.id);
    assert.equal(row.decision.source_enrollment_id, row.source.id);
    assert.equal(row.decision.target_enrollment_id, row.target.id);
    assert.notEqual(row.target.id, row.source.id);
    assert.equal(row.target.matricule, row.source.matricule);
    assert.ok(row.source.admission_cohort_id);
    assert.equal(row.target.admission_cohort_id, row.source.admission_cohort_id);
    assert.equal(row.target.academic_promotion_id, row.destination.promotion_id);
    assert.notEqual(row.target.academic_promotion_id, row.source.academic_promotion_id);
    assert.equal(row.target.academic_year_id, row.destination.year_id);
    assert.equal(row.target.curriculum_version_id, row.destination.version_id);
    assert.equal(row.target.level_id, row.destination.level_id);
    assert.equal(row.target.enrollment_status, 'pending_confirmation');
}

run('progression', async ({ login, visit, proof, origin, out }) => {
    assert.equal(origin, 'http://127.0.0.1:8071');
    const before = inspect();
    fs.writeFileSync(path.join(out, 'avant.json'), JSON.stringify(before, null, 2));
    const { password } = JSON.parse(fs.readFileSync(path.join(process.env.USK_RECETTE_V2_ROOT, 'final-qa.json'), 'utf8'));
    const admin = await login('admin@usk.test', password);
    for (const [kind, row] of Object.entries(before)) {
        const id = kind === 'advance' ? 'passage' : 'redoublement';
        assert.equal(row.official.decision, kind === 'advance' ? 'pass_demo' : 'repeat_demo');
        const dossier = '/app/dashboard/admin/student-academic/' + row.source.id;
        const props = await visit(admin, dossier + '?section=Parcours');
        assert.equal(props.student.matricule, row.source.matricule);
        if (!row.decision) {
            assert.equal(props.progressionOptions.officialResultId, row.official.id);
            assert.equal(props.progressionOptions.mode, kind === 'advance' ? 'next' : 'same');
            assert.deepEqual(props.progressionOptions.levels.map((l) => l.id), [row.destination.level_id]);
            await admin.getByLabel('Niveau de destination').selectOption(String(row.destination.level_id));
            await admin.getByLabel('Nouvelle année académique').selectOption(String(row.destination.year_id));
            await admin.getByLabel(/Maquette cible/).fill(String(row.destination.version_id));
            await admin.getByLabel(/Référence ou motif/).fill('Décision fictive du jury de Droit privé pour la recette du ' + id + '.');
            const button = admin.getByRole('button', { name: 'Publier le passage' });
            await button.scrollIntoViewIfNeeded();
            await proof(admin, id + '-01', 'Préparer la destination depuis le résultat officiel', row.destination.level);
            await submit(admin, button, dossier + '/progression');
            await admin.getByText('En attente de la démarche de l’étudiant.').waitFor();
            await proof(admin, id + '-02', 'Publier la décision depuis le dossier institutionnel', 'En attente de la démarche de l’étudiant.');
        }

        const approved = inspect()[kind];
        assert.equal(approved.decision.academic_official_result_id, row.official.id);
        assert.equal(approved.decision.kind, kind);
        const student = await login(row.email, password);
        const url = '/app/dashboard/student/enrollments';
        const history = await visit(student, url);
        const source = history.entries.data.find((e) => e.id === row.source.id);
        assert.equal(source.renewal.id, approved.decision.id);
        const panel = student.getByRole('region', { name: 'Réinscription', exact: true });
        await panel.getByRole('heading', { name: new RegExp(row.destination.level) }).waitFor();
        if (!approved.target) {
            assert.equal(source.renewal.can_start, true);
            const button = panel.getByRole('button', { name: 'Demander ma réinscription' });
            await button.scrollIntoViewIfNeeded();
            await proof(student, id + '-03', 'Consulter la décision dans Mes inscriptions', row.destination.level + ' · 2026-2027');
            await submit(student, button, '/app/dashboard/student/renewals/' + approved.decision.id);
            await student.waitForURL((u) => u.pathname.endsWith('/fees') || u.searchParams.get('section') === 'fees');
        }

        const after = inspect()[kind];
        validate(after, row, kind);
        const confirmed = await visit(student, url);
        assert.equal(confirmed.entries.data.length, 2);
        const target = confirmed.entries.data.find((e) => e.id === after.target.id);
        assert.equal(target.status, 'pending_confirmation');
        assert.equal(target.level, row.destination.level);
        assert.equal(target.year, '2026-2027');
        assert.ok(target.promotion);
        const old = confirmed.entries.data.find((e) => e.id === row.source.id);
        assert.equal(old.renewal.target_id, after.target.id);
        assert.equal(await student.getByRole('button', { name: 'Demander ma réinscription' }).count(), 0);
        const card = student.getByRole('article').filter({ has: student.getByText('2026-2027', { exact: true }) });
        await card.scrollIntoViewIfNeeded();
        await proof(student, id + '-04', 'Relire le dossier annuel et conserver le matricule', target.level + ' · ' + target.year + ' · ' + target.matricule);
        await student.context().close();
    }
    const after = inspect();
    fs.writeFileSync(path.join(out, 'apres.json'), JSON.stringify(after, null, 2));
}).catch((error) => {
    process.stderr.write(String(error.message) + '\n');
    process.exitCode = 1;
});
