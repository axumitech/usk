/* global require, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { run } = require('../browser/scenario.cjs');

run('maquette', async ({ login, visit, proof, out }) => {
    const profile = fs.realpathSync(process.env.USK_RECETTE_V2_ROOT);
    assert.match(path.basename(profile), /^usk_qa_e2e-structure(?:-[a-z0-9-]+)?$/);
    const { token, password } = JSON.parse(fs.readFileSync(path.join(profile, 'final-qa.json'), 'utf8'));
    const db = new DatabaseSync(path.join(profile, 'usk-recette-v2.sqlite'), { readOnly: true });
    const trace = { actions: [] };
    const admin = '/app/dashboard/admin';
    try {
        assert.equal(db.prepare('PRAGMA user_version').get().user_version, token);
        const version = db
            .prepare(
                `SELECT v.*, p.code AS program FROM curriculum_versions v
            JOIN academic_programs p ON p.id=v.academic_program_id JOIN academic_years y ON y.id=v.academic_year_id
            WHERE p.code='QA-DPU' AND y.title='2026-2027' AND v.code='2026-V1'`,
            )
            .get();
        assert.ok(version, 'Brouillon de Droit public 2026–2027 requis.');
        const levels = db
            .prepare(
                `SELECT l.id,l.title,l.code,l.faculty_id FROM academic_program_levels p
            JOIN levels l ON l.id=p.level_id WHERE p.academic_program_id=? ORDER BY p.position`,
            )
            .all(version.academic_program_id);
        assert.ok(levels.length);
        const current = () => db.prepare('SELECT id,status,revision,published_at,validated_at FROM curriculum_versions WHERE id=?').get(version.id);
        const edition = admin + '/academic-structure?tab=curriculum&program=' + version.academic_program_id + '&version=' + version.id;
        const credits = (id) => db.prepare('SELECT credit_required FROM level_details WHERE level_id=?').get(id)?.credit_required;
        const reason = 'Préparation pédagogique fictive de la maquette de Droit public pour la recette locale USK.';
        const page = await login('admin@usk.test', password);
        if (current().status === 'draft') {
            for (const level of levels) {
                const courseCode = 'EC-QA-' + level.code;
                const unitCode = 'UE-QA-' + level.code;
                const name = 'Atelier de droit public · ' + level.code;
                const unitName = 'Pratique du droit public · ' + level.code;
                const courseRow = () => db.prepare('SELECT id,title,credits FROM courses WHERE level_id=? AND code=?').get(level.id, courseCode);
                if (credits(level.id) === null || credits(level.id) === undefined) {
                    trace.step = 'Configurer les crédits du niveau ' + level.code;
                    await visit(page, admin + '/levels/details/' + level.id + '?tab=infos');
                    await page.getByRole('button', { name: 'Modifier : Crédits requis' }).click();
                    const dialog = page.getByRole('dialog');
                    await dialog.getByRole('spinbutton').fill('60');
                    await dialog.getByRole('button', { name: 'Enregistrer la modification' }).click();
                    await dialog.waitFor({ state: 'hidden' });
                    assert.equal(credits(level.id), 60);
                    trace.actions.push({ niveau: level.code, plafond_fictif: 60 });
                }
                if (!courseRow()) {
                    trace.step = 'Créer la matière de catalogue ' + courseCode;
                    await visit(page, admin + '/course-catalog');
                    await page.getByRole('button', { name: 'Ajouter un cours' }).click();
                    const dialog = page.getByRole('dialog');
                    await dialog.getByLabel(/^Faculté/).selectOption(String(level.faculty_id));
                    await dialog.getByLabel(/^Niveau/).selectOption(String(level.id));
                    await dialog.getByLabel(/^Intitulé du cours/).fill(name);
                    await dialog.getByLabel('Code', { exact: true }).fill(courseCode);
                    await dialog.getByLabel(/^Crédits/).fill('3');
                    await dialog.getByLabel(/^Semestre/).selectOption('1');
                    await dialog.getByLabel(/^CMI/).fill('15');
                    await dialog.getByLabel(/^TD/).fill('8');
                    await dialog.getByRole('button', { name: 'Ajouter le cours' }).click();
                    await dialog.waitFor({ state: 'hidden' });
                    assert.equal(courseRow()?.credits, 3);
                    trace.actions.push({ niveau: level.code, cours: courseRow().id });
                }
                const course = courseRow();
                const itemRow = () =>
                    db
                        .prepare(
                            `SELECT i.id,i.credits,i.coefficient,i.cmi_hours,i.td_hours,u.code AS ue
                    FROM curriculum_items i JOIN curriculum_units u ON u.id=i.curriculum_unit_id
                    WHERE i.curriculum_version_id=? AND i.source_course_id=?`,
                        )
                        .get(version.id, course.id);
                let state = await visit(page, edition + '&level=' + level.id);
                if (!itemRow()) {
                    trace.step = 'Rattacher l’EC à sa nouvelle UE ' + unitCode;
                    const subjects = page.getByRole('form', { name: 'Matières du niveau' });
                    await subjects.getByRole('button', { name: 'Ajouter une unité d’enseignement' }).click();
                    await subjects.getByLabel('Code UE', { exact: true }).last().fill(unitCode);
                    await subjects.getByLabel('Nom de l’unité', { exact: true }).last().fill(unitName);
                    await subjects
                        .getByLabel(/Crédits attendus/)
                        .last()
                        .fill('3');
                    await subjects.getByLabel('Ajouter un cours seul depuis le catalogue').selectOption(String(course.id));
                    await subjects.getByLabel('Déplacer ' + name + ' vers une autre UE').selectOption({ label: unitName });
                    await subjects.getByLabel(name + ' · coefficient', { exact: true }).fill('1');
                    await subjects.getByLabel('Motif de modification').fill(reason);
                    const saved = page.waitForResponse((res) => res.request().method() === 'GET' && res.headers()['x-inertia'] === 'true');
                    await subjects.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
                    assert.deepEqual((await (await saved).json()).props.errors || {}, {});
                    state = await visit(page, edition + '&level=' + level.id);
                    assert.equal(itemRow()?.ue, unitCode);
                    await proof(page, 'MAQ-' + level.code, 'Enregistrer l’UE composée et son EC', {
                        version: version.id,
                        niveau: level.code,
                        ...itemRow(),
                    });
                }
                assert.equal(itemRow()?.ue, unitCode);
                assert.equal(Number(itemRow().credits), 3);
                assert.equal(Number(itemRow().coefficient), 1);
                assert.equal(Number(itemRow().cmi_hours), 15);
                assert.equal(Number(itemRow().td_hours), 8);
                const review = state.levelWorkspace.find((item) => Number(item.id) === level.id);
                assert.ok(review);
                if (!review.approved) {
                    trace.step = 'Valider le niveau ' + level.code;
                    await page.getByRole('button', { name: 'Validation', exact: true }).click();
                    const accepted = page.waitForResponse((res) => res.request().method() === 'GET' && res.headers()['x-inertia'] === 'true');
                    await page.getByRole('button', { name: 'Valider ce niveau', exact: true }).click();
                    assert.deepEqual((await (await accepted).json()).props.errors || {}, {});
                    state = await visit(page, edition + '&level=' + level.id);
                    assert.ok(state.levelWorkspace.find((item) => Number(item.id) === level.id)?.approved);
                    trace.actions.push({ niveau_valide: level.id });
                }
            }
        }
        for (const [from, action, target] of [
            ['draft', 'Valider la maquette', 'validated'],
            ['validated', 'Publier la maquette', 'published'],
        ]) {
            await visit(page, edition);
            if (current().status !== from) continue;
            trace.step = action;
            await page.getByRole('button', { name: action, exact: true }).first().click();
            const dialog = page.getByRole('dialog');
            assert.equal(
                await dialog.getByLabel('Version publiée à remplacer').count(),
                0,
                'La recette publie le premier référentiel de ce contexte.',
            );
            await dialog.getByLabel('Motif officiel').fill(reason);
            await dialog.getByRole('button', { name: 'Confirmer la décision' }).click();
            await dialog.waitFor({ state: 'hidden' });
            assert.equal(current().status, target);
            trace.actions.push({ action, ...current() });
        }
        const last = await visit(page, edition);
        assert.equal(last.selectedVersion.status, 'published');
        assert.ok(last.levelWorkspace.length === levels.length && last.levelWorkspace.every((level) => level.approved));
        assert.ok(current().published_at && current().validated_at);
        await proof(page, 'MAQ-publiee', 'Relire la version publiée et les validations de niveau', {
            ...current(),
            niveaux: levels.length,
            programme: version.program,
        });
    } finally {
        db.close();
        fs.writeFileSync(path.join(out, 'actions.json'), JSON.stringify(trace, null, 2));
    }
}).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
