/* global require, process, __dirname */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { run } = require('./scenario.cjs');

run('annuaire-enseignants', async ({ login, visit, proof, origin }) => {
    assert.equal(origin, 'http://127.0.0.1:8075');
    const root = fs.realpathSync(process.env.USK_RECETTE_V2_ROOT);
    assert.equal(path.basename(root), 'usk_qa_e2e-livraison');
    const config = JSON.parse(fs.readFileSync(path.join(root, 'final-qa.json'), 'utf8'));
    const db = new DatabaseSync(path.join(root, 'usk-recette-v2.sqlite'), { readOnly: true });
    const base = '/app/dashboard/admin/professors';
    const deputy = 'vice-dean.dr@usk.test';
    try {
        assert.equal(db.prepare('PRAGMA user_version').get().user_version, config.token);
        const repo = fs.realpathSync(process.env.USK_QA_SERVER_REPO || path.resolve(__dirname, '../../..'));
        const revision = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
        const version = await (await fetch(origin + '/__usk_recipe/version')).json();
        assert.equal(version.revision, revision);
        assert.equal(version.assets.revision, revision);
        assert.equal(version.tracked_changes, false);
        const mandate = db
            .prepare(
                "SELECT f.id, f.name FROM faculties f JOIN academic_staff_faculties s ON s.faculty_id=f.id JOIN users u ON u.id=s.user_id JOIN model_has_roles m ON m.model_id=u.id JOIN roles r ON r.id=m.role_id WHERE u.email=? AND r.name='vice-dean'",
            )
            .all(deputy);
        assert.equal(mandate.length, 1);
        assert.equal(mandate[0].name, 'Droit');
        const teachers = db
            .prepare('SELECT p.id,p.first_name,p.last_name,u.email FROM professors p JOIN users u ON u.id=p.user_id ORDER BY p.id')
            .all();
        const law = teachers.find((t) => t.email === 'professeur.dpu@usk.test');
        const medical = teachers.find((t) => t.email === 'professeur.scl@usk.test');
        assert.ok(law && medical && law.id !== medical.id);
        const affiliations = db
            .prepare(
                "SELECT DISTINCT o.professor_id AS id,f.id AS faculty,f.name FROM academic_offerings o JOIN levels l ON l.id=o.level_id JOIN faculties f ON f.id=l.faculty_id JOIN academic_years y ON y.id=o.academic_year_id WHERE y.status='open' AND o.archived_at IS NULL ORDER BY o.professor_id,f.id",
            )
            .all();
        const own = new Set(affiliations.filter((row) => row.faculty === mandate[0].id).map((row) => row.id));
        assert.ok(own.has(law.id) && !own.has(medical.id));
        const fullName = (t) => t.first_name + ' ' + t.last_name;
        const deputyPage = await login(deputy, config.password);
        const facultyList = await visit(deputyPage, base);
        await deputyPage.getByRole('heading', { name: 'Enseignants', exact: true }).waitFor();
        assert.equal(facultyList.canManageProfiles, false);
        assert.deepEqual(new Set(facultyList.professors.data.map((t) => t.id)), own);
        assert.equal(facultyList.stats.total, own.size);
        assert.ok(facultyList.catalog.length > 0 && facultyList.catalog.every((c) => c.level.faculty.id === mandate[0].id));
        assert.equal(await deputyPage.getByRole('button', { name: 'Ajouter un enseignant', exact: true }).count(), 0);
        assert.equal(await deputyPage.getByRole('button', { name: 'Modifier', exact: true }).count(), 0);
        assert.equal(await deputyPage.getByRole('link', { name: 'Voir le profil de ' + fullName(medical), exact: true }).count(), 0);
        await proof(deputyPage, 'ANN-01', 'Ouvrir l’annuaire avec le mandat de vice-doyen de Droit.', {
            faculte: mandate[0].name,
            enseignants: [...own],
            cours: facultyList.catalog.length,
            modification_identite: false,
        });
        await deputyPage.getByRole('link', { name: 'Voir le profil de ' + fullName(law), exact: true }).click();
        await deputyPage.waitForURL('**/professors/' + law.id);
        const detail = await visit(deputyPage, base + '/' + law.id);
        await deputyPage.getByRole('heading', { name: fullName(law), exact: true }).waitFor();
        assert.equal(detail.canLinkAccount, false);
        assert.equal(detail.canAssign, true);
        assert.ok(detail.assignments.length > 0 && detail.assignments.every((a) => a.level.faculty.id === mandate[0].id));
        assert.equal(await deputyPage.getByRole('button', { name: 'Modifier la fiche', exact: true }).count(), 0);
        await proof(deputyPage, 'ANN-02', 'Ouvrir la fiche de Droit public et vérifier les actions du vice-doyen.', {
            enseignant: law.id,
            affectations_en_droit: detail.assignments.length,
            gerer_affectation: detail.canAssign,
            rattacher_compte: detail.canLinkAccount,
        });
        const shared = affiliations.find((row) => own.has(row.id) && row.faculty !== mandate[0].id);
        if (shared) {
            const detailShared = await visit(deputyPage, base + '/' + shared.id);
            assert.ok(detailShared.assignments.length && detailShared.assignments.every((a) => a.level.faculty.id === mandate[0].id));
            await proof(deputyPage, 'ANN-PARTAGE', 'Consulter côté faculté une personne qui enseigne dans deux facultés.', {
                enseignant: shared.id,
                affectations_visibles: detailShared.assignments.length,
            });
        }
        await deputyPage.context().close();

        const admin = await login('admin@usk.test', config.password);
        const directory = await visit(admin, base);
        await admin.getByRole('button', { name: 'Ajouter un enseignant', exact: true }).waitFor();
        assert.equal(directory.canManageProfiles, true);
        assert.equal(directory.stats.total, teachers.length);
        assert.ok(directory.professors.data.some((t) => t.id === law.id) && directory.professors.data.some((t) => t.id === medical.id));
        const allFaculties = [...new Set(directory.catalog.map((c) => c.level.faculty.name))];
        assert.equal(allFaculties.length, db.prepare('SELECT COUNT(*) AS n FROM faculties').get().n);
        await proof(admin, 'ANN-03', 'Comparer l’annuaire institutionnel et ses facultés au périmètre du vice-doyen.', {
            enseignants: directory.stats.total,
            facultes: allFaculties,
            revision,
        });
        await admin.getByRole('link', { name: 'Voir le profil de ' + fullName(medical), exact: true }).click();
        await admin.waitForURL('**/professors/' + medical.id);
        await admin.getByRole('button', { name: 'Modifier la fiche', exact: true }).click();
        const form = admin.locator('#professor-form');
        await form.waitFor();
        assert.equal(await form.locator('input[type=email]').inputValue(), medical.email);
        await proof(admin, 'ANN-04', 'Ouvrir le formulaire institutionnel de Sciences cliniques et vérifier la fiche préremplie.', {
            enseignant: medical.id,
            formulaire_edition: true,
            enregistrement: false,
        });
        await admin.context().close();

        for (const [id, teacher] of [
            ['ANN-05', law],
            ['ANN-06', medical],
        ]) {
            const page = await login(teacher.email, config.password);
            const profile = await visit(page, '/app/dashboard/teacher/profile');
            assert.equal(profile.name, fullName(teacher));
            await page.getByText(profile.name, { exact: true }).first().waitFor();
            await proof(page, id, 'Ouvrir le profil personnel de l’enseignant depuis une session indépendante.', {
                enseignant: teacher.id,
                nom: profile.name,
                facultes: affiliations.filter((a) => a.id === teacher.id).map((a) => a.name),
            });
            await page.context().close();
        }
    } finally {
        db.close();
    }
}).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
