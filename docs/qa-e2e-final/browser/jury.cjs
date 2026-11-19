/* global require, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { run } = require('./scenario.cjs');

const title = 'Épreuve de rattrapage de Droit privé — QA';
const code = 'QA-RATTRAPAGE-DPR';
const reason = 'Deuxième session de recette universitaire fictive en Droit privé.';
const email = 'etudiant.dpr.04@usk.test';
const body = 'Réponse fictive à la nouvelle épreuve de droit privé en seconde session.';

async function send(page, button) {
    const data = page.waitForResponse((r) => r.request().method() === 'GET' && r.headers()['x-inertia'] === 'true', { timeout: 90000 });
    await button.click();
    const response = await data;
    const state = (await response.json()).props;
    assert.deepEqual(state.errors || {}, {}, 'Le formulaire doit être accepté');
    await page.goto(response.url(), { waitUntil: 'domcontentloaded' });
    return state;
}

async function modal(page, action, extra) {
    await page.getByRole('button', { name: action, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^Motif|^Justification/).fill(reason);
    if (extra) await extra(dialog);
    return send(page, dialog.getByRole('button', { name: 'Enregistrer', exact: true }));
}

run('jury', async ({ origin, login, visit, proof, out }) => {
    assert.equal(origin, 'http://127.0.0.1:8072');
    const root = fs.realpathSync(process.env.USK_RECETTE_V2_ROOT);
    assert.match(path.basename(root), /^usk_qa_e2e-jury(?:-[a-z0-9_-]+)?$/i);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'jury-temoin.json'))).port, 8072);
    const db = new DatabaseSync(path.join(root, 'usk-recette-v2.sqlite'), { readOnly: true });
    db.exec('PRAGMA query_only=ON');
    const get = (sql, ...args) => db.prepare(sql).get(...args);
    const clock = path.join(root, 'jury-epreuve-terminee');
    const alignPageTime = (page) => page.clock.setFixedTime(new Date(fs.existsSync(clock) ? '2026-06-23T08:10:00Z' : '2026-06-23T08:00:00Z'));
    const loginAs = async (who) => {
        const page = await login(who, JSON.parse(fs.readFileSync(path.join(root, 'final-qa.json'))).password);
        page.setDefaultTimeout(90000);
        page.setDefaultNavigationTimeout(120000);
        await alignPageTime(page);
        return page;
    };
    const dump = (name, state) => fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(state, null, 2));
    try {
        const ordinary = () => get('SELECT r.id,r.reference,r.snapshot,r.decision,r.academic_enrollment_id AS entry, a.academic_result_rule_id AS rule FROM academic_official_results r JOIN academic_deliberations a ON a.id=r.academic_deliberation_id WHERE r.decision=? AND a.state=?', 'resit_demo', 'published');
        const first = ordinary();
        assert.ok(first);
        const initial = JSON.parse(first.snapshot);
        const items = initial.units.flatMap((unit) => unit.items);
        const failed = items.find((item) => item.status === 'failed');
        const acquired = items.find((item) => item.status === 'passed');
        assert.equal(Number(failed.grade), 8);
        assert.equal(Number(acquired.grade), 11);
        const scope = get('SELECT e.matricule,e.level_id,e.curriculum_version_id AS version, o.id AS offer FROM academic_enrollments e JOIN academic_course_registrations g ON g.academic_enrollment_id=e.id JOIN academic_offerings o ON o.id=g.academic_offering_id WHERE e.id=? AND o.curriculum_item_id=?', first.entry, failed.id);
        const exam = () => get('SELECT a.id,r.id AS resource,a.state FROM academic_resources r JOIN academic_assessments a ON a.academic_resource_id=r.id WHERE r.academic_offering_id=? AND r.title=? AND a.session_code=?', scope.offer, title, 'rattrapage');
        const copy = () => get('SELECT id,body FROM academic_submissions WHERE academic_enrollment_id=? AND academic_resource_id=?', first.entry, exam().resource);
        const record = () => get('SELECT id,participation,points,correction_state,released_at FROM academic_assessment_records WHERE academic_assessment_id=? AND academic_enrollment_id=?', exam().id, first.entry);
        const newRule = () => get('SELECT id,approved_at FROM academic_result_rules WHERE code=?', code);
        const jury = () => get('SELECT id,state FROM academic_deliberations WHERE academic_result_rule_id=?', newRule().id);
        const outcome = () => get('SELECT reference,id,snapshot,decision FROM academic_official_results WHERE academic_deliberation_id=? AND academic_enrollment_id=?', jury().id, first.entry);
        const base = '/app/dashboard/admin/academic-results';
        const student = await loginAs(email);
        const official = '/app/dashboard/student/results?academic=' + first.entry + '&official=';
        const oldPage = await visit(student, official + first.reference);
        assert.equal(oldPage.official_results.selected.reference, first.reference);
        await proof(student, 'JUR-01', 'Consulter la décision ordinaire avant le rattrapage', 'EC acquis 11/20, EC à reprendre 8/20. Les 10 crédits de l’UE attendent sa validation.');
        const teacher = await loginAs('professeur.dpr@usk.test');
        const teaching = '/app/dashboard/teacher/assessments?offering=' + scope.offer;
        await visit(teacher, teaching);
        if (!exam()) {
            await teacher.getByRole('button', { name: 'Créer une évaluation', exact: true }).click();
            await teacher.getByLabel(/^Titre de l’évaluation/).fill(title);
            await teacher.getByLabel(/^Catégorie/).selectOption('exam');
            await teacher.getByPlaceholder('ordinaire ou rattrapage').fill('rattrapage');
            await teacher.getByLabel(/^Consignes/).fill('Présenter une analyse personnelle du cas fictif de droit privé.');
            await teacher.getByLabel(/^Ouverture des dépôts/).fill('2026-06-23T08:00');
            await teacher.getByLabel(/^Échéance/).fill('2026-06-23T09:05');
            await teacher.getByLabel(/^Barème maximal/).fill('20');
            await send(teacher, teacher.getByRole('button', { name: 'Enregistrer le brouillon', exact: true }));
        }
        const resourceUrl = teaching + '&resource=' + exam().resource;
        await visit(teacher, resourceUrl);
        if (exam().state === 'draft') await modal(teacher, 'Publier maintenant');
        await proof(teacher, 'JUR-02', 'Créer et publier la nouvelle épreuve de la session rattrapage', title);
        const exercise = '/app/dashboard/student/evaluations?academic=' + first.entry + '&work=' + exam().resource;
        await visit(student, exercise);
        if (!copy()) {
            const summary = student.locator('summary').filter({ hasText: 'Soumettre mon travail' });
            await summary.click();
            await student.getByLabel(/^Votre réponse/).fill(body);
            await send(student, student.getByRole('button', { name: 'Soumettre mon travail', exact: true }));
        }
        assert.equal(copy().body, body);
        await proof(student, 'JUR-03', 'Déposer la copie depuis l’espace de l’étudiant concerné', 'Copie fictive reçue dans l’intervalle ouvert le 23 juin à 09 h.');
        if (!fs.existsSync(clock)) fs.writeFileSync(clock, '09:10', { flag: 'wx' });
        await alignPageTime(teacher);
        await alignPageTime(student);
        await visit(teacher, resourceUrl);
        if (exam().state === 'published') await modal(teacher, 'Clôturer');
        assert.equal(exam().state, 'closed');
        assert.equal(record().participation, 'submitted');
        const correctionUrl = resourceUrl + '&record=' + record().id;
        await visit(teacher, correctionUrl);
        if (record().correction_state === 'draft') {
            const form = teacher.locator('#assessment-correction');
            await form.getByLabel(/^Note sur 20/).fill('15');
            await form.getByLabel(/^Appréciation privée/).fill('Analyse corrigée, arguments de droit privé suffisants.');
            await form.getByLabel(/^Motif/).fill(reason);
            await send(teacher, form.getByRole('button', { name: 'Enregistrer la correction', exact: true }));
            await visit(teacher, correctionUrl);
            await modal(teacher, 'Finaliser la correction');
        }
        assert.equal(record().points, 1500);
        await proof(teacher, 'JUR-04', 'Clôturer l’épreuve et finaliser la nouvelle note', '15/20 pour l’EC initialement à 8/20.');
        const admin = await loginAs('admin@usk.test');
        const dean = await loginAs('dean.dr@usk.test');
        const reviewUrl = '/app/dashboard/admin/assessments?offering=' + scope.offer + '&resource=' + exam().resource;
        await visit(admin, reviewUrl);
        if (record().correction_state === 'finalized') await modal(admin, 'Valider les corrections');
        if (!record().released_at) await modal(admin, 'Publier les appréciations');
        const handoff = get('SELECT COUNT(*) AS n FROM academic_assessment_handoffs WHERE academic_assessment_record_id=?', record().id);
        assert.equal(handoff.n, 1);
        await proof(admin, 'JUR-05', 'Valider la correction et transmettre la note au calcul des résultats', 'Une transmission validée de 15/20.');
        await visit(admin, base + '?version=' + scope.version);
        if (!newRule()) {
            await admin.getByText('Créer une version de règlement', { exact: true }).click();
            const form = admin.locator('form').filter({ has: admin.getByRole('button', { name: 'Soumettre pour approbation', exact: true }) });
            await form.getByLabel(/^Niveau/).selectOption(String(scope.level_id));
            await form.getByLabel('Code de version', { exact: true }).fill(code);
            await form.getByLabel('Code de session', { exact: true }).fill('rattrapage');
            await form.getByLabel('Applicable à partir du', { exact: true }).fill('2026-06-23');
            await form.getByLabel('Référence réglementaire', { exact: true }).fill(reason);
            const rules = { scale: 2000, precision: 2, rounding: 'half_up', weighting: 'uniform', ec_pass: 1000, ue_pass: 1000,
                compensation: 'none', credit_label: 'crédits fictifs', allow_equivalence: false, appeal_days: 7, quorum: 2,
                base_rule_id: first.rule, resit_policy: 'replace', resit_eligibility: 'failed_ec', missing_resit: 'retain',
                decisions: { pass_qa: { label: 'Réussite après rattrapage — QA', permits_incomplete: false, permits_eliminatory: false, progression: 'next', minimum_credits: 1000 } },
                items: { [acquired.id]: [], [failed.id]: { [exam().id]: 10000 } } };
            await form.getByLabel('Configuration du règlement', { exact: true }).fill(JSON.stringify(rules));
            await send(admin, form.getByRole('button', { name: 'Soumettre pour approbation', exact: true }));
        }
        const ruleUrl = base + '?rule=' + newRule().id;
        await visit(dean, ruleUrl);
        if (!newRule().approved_at) await modal(dean, 'Approuver');
        assert.ok(newRule().approved_at);
        await proof(dean, 'JUR-06', 'Approuver le règlement spécial rattaché à la session ordinaire', 'Remplacer uniquement la note de l’EC non acquis.');
        const props = await visit(admin, ruleUrl);
        const memberIds = ['admin@usk.test', 'dean.dr@usk.test'].map((who) => get('SELECT id FROM users WHERE email=?', who).id);
        const members = memberIds.map((id) => props.members.find((person) => person.id === id));
        assert.ok(members.every(Boolean));
        if (!jury()) {
            await admin.getByText('Préparer une délibération', { exact: true }).click();
            const form = admin.locator('form').filter({ has: admin.getByRole('button', { name: 'Calculer les dossiers', exact: true }) });
            await form.getByLabel('Date du jury (Kinshasa)', { exact: true }).fill('2026-06-23T09:06');
            await form.getByLabel(/^Président/).selectOption(String(memberIds[0]));
            await form.getByLabel(/^Secrétaire/).selectOption(String(memberIds[1]));
            for (const member of members) await form.getByRole('checkbox', { name: member.name, exact: true }).check();
            await form.getByLabel('Motif', { exact: true }).fill(reason);
            await send(admin, form.getByRole('button', { name: 'Calculer les dossiers', exact: true }));
        }
        const runUrl = base + '?run=' + jury().id;
        await visit(admin, runUrl);
        if (jury().state === 'prepared') {
            await admin.getByText('Faire l’appel et ouvrir le jury', { exact: true }).click();
            const form = admin.locator('form').filter({ has: admin.getByRole('button', { name: 'Ouvrir la délibération', exact: true }) });
            for (const member of members) await form.getByRole('checkbox', { name: member.name, exact: true }).check();
            await form.getByLabel('Motif', { exact: true }).fill(reason);
            await send(admin, form.getByRole('button', { name: 'Ouvrir la délibération', exact: true }));
        }
        const result = outcome();
        const snapshot = JSON.parse(result.snapshot);
        const finalItems = snapshot.units.flatMap((unit) => unit.items);
        assert.equal(Number(finalItems.find((i) => i.id === acquired.id).grade), 11);
        assert.equal(finalItems.find((i) => i.id === acquired.id).selected, 'ordinary');
        assert.equal(Number(finalItems.find((i) => i.id === failed.id).grade), 15);
        assert.equal(snapshot.ordinary_reference, first.reference);
        assert.equal(snapshot.credits.earned, 1000);
        assert.equal(Number(snapshot.annual), 13);
        await visit(admin, runUrl + '&result=' + result.id);
        if (!outcome().decision) await modal(admin, 'Enregistrer une décision', (d) => d.getByLabel(/^Décision réglementaire/).selectOption('pass_qa'));
        await proof(admin, 'JUR-07', 'Délibérer avec les deux membres présents et enregistrer la réussite', '11/20 ordinaire conservé, 15/20 au rattrapage, moyenne de 13/20, dix crédits.');
        await visit(admin, runUrl);
        if (jury().state === 'open') await modal(admin, 'Approuver');
        await visit(dean, runUrl);
        if (jury().state === 'approved') await modal(dean, 'Publier la session');
        assert.equal(jury().state, 'published');
        await proof(dean, 'JUR-08', 'Publier la décision finale du jury de rattrapage', 'Publication confirmée dans le jury et en base.');
        const visible = await visit(student, official + result.reference);
        assert.equal(visible.official_results.selected.reference, result.reference);
        assert.ok(visible.official_results.selected.published_at);
        assert.equal(outcome().decision, 'pass_qa');
        assert.deepEqual(ordinary(), first);
        await proof(student, 'JUR-09', 'Ouvrir le résultat définitif de seconde session comme étudiant', 'Référence distincte et résultat ordinaire conservé.');
        dump('resultats', { simulation: { date: '2026-06-23', timezone: 'Africa/Kinshasa', opening: '09:00', jury: '09:10' }, captured_at_utc: new Date().toISOString(),
            ordinary: { reference: first.reference, decision: first.decision, acquired: 11, failed: 8, credits: initial.credits.earned / 100 },
            resit: { reference: result.reference, decision: outcome().decision, carried_grade: 11, new_grade: 15, annual: snapshot.annual, credits: 10, ordinary_reference: snapshot.ordinary_reference } });
    } finally {
        db.close();
    }
}).catch((error) => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
