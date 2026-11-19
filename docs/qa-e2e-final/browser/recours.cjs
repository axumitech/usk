/* global require, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { run } = require('./scenario.cjs');

const body = 'Je demande la vérification des crédits et de la note conservée de première session dans mon résultat de rattrapage de Droit privé.';
const decision =
    'Après vérification des deux éditions, la note acquise de 11/20 a été conservée et le 15/20 du rattrapage a été pris en compte. La moyenne de 13/20 et les dix crédits sont confirmés.';

run('recours', async ({ login, visit, proof, origin }) => {
    assert.equal(origin, 'http://127.0.0.1:8072');
    const root = fs.realpathSync(process.env.USK_RECETTE_V2_ROOT);
    assert.equal(path.basename(root), 'usk_qa_e2e-jury');
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'jury-temoin.json'), 'utf8')).port, 8072);
    assert.ok(fs.existsSync(path.join(root, 'jury-epreuve-terminee')));
    const { password, token } = JSON.parse(fs.readFileSync(path.join(root, 'final-qa.json'), 'utf8'));
    const db = new DatabaseSync(path.join(root, 'usk-recette-v2.sqlite'), { readOnly: true });
    try {
        assert.equal(db.prepare('PRAGMA user_version').get().user_version, token);
        const results = () =>
            db
                .prepare(
                    `SELECT r.id,r.snapshot,r.reference,r.decision,e.id AS entry,u.id AS user,u.email,
            d.id AS run,d.published_at,json_extract(h.configuration,'$.appeal_days') AS days FROM academic_official_results r
            JOIN academic_deliberations d ON d.id=r.academic_deliberation_id JOIN academic_result_rules h ON h.id=d.academic_result_rule_id
            JOIN academic_enrollments e ON e.id=r.academic_enrollment_id JOIN student_profiles p ON p.id=e.student_profile_id
            JOIN users u ON u.id=p.user_id WHERE u.email='etudiant.dpr.04@usk.test' AND d.state='published' ORDER BY r.id`,
                )
                .all();
        const editions = results();
        const selected = editions.find((row) => row.decision === 'pass_qa');
        assert.ok(selected && editions.length === 2 && selected.days === 7);
        assert.equal(Number(JSON.parse(selected.snapshot).annual), 13);
        const person = (email) => db.prepare('SELECT id,email FROM users WHERE email=?').get(email);
        const manager = person('admin@usk.test');
        const publisher = person('dean.dr@usk.test');
        assert.notEqual(manager.id, publisher.id);
        const access = async (who) => {
            const page = await login(who, password);
            await page.bringToFront();
            page.setDefaultTimeout(90000);
            await page.clock.setFixedTime(new Date('2026-06-23T08:10:00Z'));
            return page;
        };
        const student = await access(selected.email);
        const studentUrl = '/app/dashboard/student/results?academic=' + selected.entry + '&official=' + selected.reference;
        const base = '/app/dashboard/admin/academic-results';
        const staffUrl = base + '?run=' + selected.run;
        const own = () =>
            db
                .prepare(
                    "SELECT id,body,status,result_revision,assigned_to,responded_by,response FROM student_service_requests WHERE academic_official_result_id=? AND result_target='decision'",
                )
                .get(selected.id);
        const first = (await visit(student, studentUrl)).official_results.selected;
        assert.equal(first.reference, selected.reference);
        assert.ok(first.can_appeal);
        assert.equal(new Date(first.deadline).getTime() - new Date(first.published_at).getTime(), selected.days * 86400000);
        const section = student.getByRole('region', { name: 'Recours', exact: true });
        await section.getByText(/Dépôt possible jusqu’au/).waitFor();
        await proof(student, 'REC-01', 'Vérifier l’ouverture du recours sur le résultat publié de rattrapage', {
            inscription: selected.entry,
            reference: selected.reference,
            publication: first.published_at,
            echeance: first.deadline,
            horloge_témoin: '2026-06-23T08:10:00Z',
            moyenne: first.annual,
        });
        async function send(page, button, pathname) {
            const posted = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === pathname, {
                timeout: 120000,
            });
            const returned = page.waitForResponse((r) => r.request().method() === 'GET' && r.headers()['x-inertia'] === 'true', { timeout: 120000 });
            await button.press('Enter');
            const [submission, redirect] = await Promise.all([posted, returned]);
            assert.equal(submission.status(), 303);
            assert.deepEqual((await redirect.json()).props.errors || {}, {});
        }
        if (!own()) {
            await section.getByText('Déposer un recours', { exact: true }).click();
            await section.getByRole('combobox').selectOption('decision');
            await section.getByRole('textbox', { name: /^Motif du recours/ }).fill(body);
            await send(
                student,
                section.getByRole('button', { name: 'Transmettre mon recours' }),
                '/app/dashboard/student/results/official/' + selected.reference + '/appeal',
            );
            const submitted = (await visit(student, studentUrl)).official_results.selected.appeals;
            assert.ok(submitted.some((r) => r.id === own().id && r.status === 'open'));
            await section.getByText('Recours n°' + own().id + ' · Déposé', { exact: true }).waitFor();
            await proof(student, 'REC-02', 'Déposer le recours sur la décision et relire son numéro', {
                demande: own().id,
                etat: own().status,
                motif: body,
            });
        }
        assert.equal(own().body, body);
        const pages = new Map();
        const stages = [
            ['open', 'Vérifier', 'under_review', manager, 'Vérification du rapprochement entre les éditions de première et de seconde session.'],
            [
                'under_review',
                'Déclarer recevable',
                'admissible',
                manager,
                'Le recours a été déposé dans le délai prévu et vise une décision publiée.',
            ],
            [
                'admissible',
                'Affecter à l’instruction',
                'investigating',
                manager,
                'Le service des résultats compare les crédits et les notes des deux éditions du jury.',
            ],
            ['investigating', 'Rejeter', 'rejected', publisher, decision],
        ];
        for (const [index, [from, action, to, actor, reason]] of stages.entries()) {
            if (own().status !== from) continue;
            if (!pages.has(actor.id)) pages.set(actor.id, await access(actor.email));
            const staff = pages.get(actor.id);
            await staff.bringToFront();
            const state = await visit(staff, staffUrl);
            const item = state.appeals.data.find((r) => r.id === own().id);
            assert.ok(item && item.status === from && item.reference === selected.reference);
            const card = staff.locator('#recours article').filter({ has: staff.getByText(body, { exact: true }) });
            await card.getByRole('button', { name: action, exact: true }).press('Enter');
            const modal = staff.getByRole('dialog');
            if (to === 'investigating') await modal.getByRole('spinbutton').fill(String(manager.id));
            await modal.getByRole('textbox', { name: /^Motif/ }).fill(reason);
            await send(staff, modal.getByRole('button', { name: 'Enregistrer', exact: true }), base + '/appeals/' + item.id);
            const after = (await visit(staff, staffUrl)).appeals.data.find((r) => r.id === item.id);
            assert.equal(after.status, to);
            assert.equal(own().status, to);
            await card.scrollIntoViewIfNeeded();
            await proof(staff, 'REC-0' + (index + 3), action, { demande: item.id, actor: actor.email, etat: to, revision: after.result_revision });
        }
        assert.equal(own().status, 'rejected');
        assert.equal(own().assigned_to, manager.id);
        assert.equal(own().responded_by, publisher.id);
        assert.equal(own().response, decision);
        await student.bringToFront();
        const final = (await visit(student, studentUrl)).official_results.selected;
        assert.ok(final.appeals.some((r) => r.id === own().id && r.status === 'rejected' && r.response === decision));
        await section.getByText(decision, { exact: true }).scrollIntoViewIfNeeded();
        assert.deepEqual(results(), editions);
        const audit = db
            .prepare(
                "SELECT action,actor_id FROM academic_audits WHERE entity_type='student_service_requests' AND entity_id=? AND action LIKE 'official_result_appeal_%' ORDER BY id",
            )
            .all(own().id);
        assert.deepEqual(
            audit.map((a) => [a.action, a.actor_id]),
            [['official_result_appeal_filed', selected.user], ...stages.map(([, , to, actor]) => ['official_result_appeal_' + to, actor.id])],
        );
        await proof(student, 'REC-07', 'Relire la décision motivée et vérifier la conservation des deux éditions du jury', {
            demande: own().id,
            motif: decision,
            audits: audit,
            editions_inchangees: editions.map((r) => ({
                reference: r.reference,
                decision: r.decision,
                snapshot_sha256: createHash('sha256').update(r.snapshot).digest('hex'),
            })),
        });
    } finally {
        db.close();
    }
}).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
