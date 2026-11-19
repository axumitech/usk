/* global require, process, __dirname */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { run } = require('./scenario.cjs');

run('rattachement', async ({ login, visit, proof, origin }) => {
    const root = fs.realpathSync(process.env.USK_RECETTE_V2_ROOT);
    assert.match(path.basename(root), /^usk_qa_e2e-rattachement(?:-[a-z0-9_-]+)?$/i);
    const profile = JSON.parse(fs.readFileSync(path.join(root, 'final-qa.json')));
    const fixture = JSON.parse(fs.readFileSync(path.join(root, 'rattachement-temoin.json')));
    const database = new DatabaseSync(path.join(root, 'usk-recette-v2.sqlite'), { readOnly: true });
    try {
        assert.equal(database.prepare('PRAGMA user_version').get().user_version, profile.token);
        const workspace = path.resolve(__dirname, '../../..');
        const server = fs.realpathSync(process.env.USK_QA_SERVER_REPO || workspace);
        const service = path.join('app', 'Modules', 'AcademicStructure', 'Application', 'Services', 'StructureService.php');
        const hash = (dir) =>
            createHash('sha256')
                .update(fs.readFileSync(path.join(dir, service), 'utf8').replace(/\r\n/g, '\n'))
                .digest('hex');
        const revision = execFileSync('git', ['-C', server, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
        const version = await (await fetch(origin + '/__usk_recipe/version')).json();
        assert.equal(version.revision, revision);
        assert.equal(version.assets.revision, revision);
        assert.equal(version.tracked_changes, false);
        assert.equal(hash(server), hash(workspace));

        const state = database.prepare(`SELECT c.academic_promotion_id AS promotion, c.level_id AS niveau, c.faculty_id AS faculte,
            o.academic_year_id AS annee, v.academic_program_id AS programme_maquette, v.id AS maquette,
            (SELECT count(*) FROM academic_enrollments e WHERE e.class_id=c.id) AS inscriptions,
            (SELECT count(*) FROM academic_audits a WHERE a.action='promotion_group_attached' AND a.entity_type='classes' AND a.entity_id=c.id) AS audits
            FROM classes c JOIN academic_offerings o ON o.class_id=c.id
            LEFT JOIN curriculum_items i ON i.id=o.curriculum_item_id LEFT JOIN curriculum_units u ON u.id=i.curriculum_unit_id
            LEFT JOIN curriculum_versions v ON v.id=u.curriculum_version_id WHERE c.id=? AND o.id=?`);
        const read = (group) => ({ ...state.get(group.id, group.offre) });
        const bound = fixture.groupes.versionne;
        const legacy = fixture.groupes.historique;
        const initial = read(bound);
        assert.deepEqual(initial, {
            promotion: null,
            niveau: fixture.niveau,
            faculte: fixture.faculte,
            annee: fixture.annee,
            programme_maquette: fixture.programme.id,
            maquette: fixture.maquette,
            inscriptions: 0,
            audits: 0,
        });
        assert.equal(read(legacy).programme_maquette, null);
        assert.equal(read(legacy).promotion, null);
        const page = await login('admin@usk.test', profile.password);
        const assign = async (group, program, error) => {
            const url = '/app/dashboard/admin/academic-structure?tab=programs&program=' + program.id;
            await visit(page, url);
            const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: program.code, exact: true }) });
            await row.getByRole('button', { name: 'Associer un groupe', exact: true }).click();
            const modal = page.getByRole('dialog');
            await modal.getByLabel('Groupe existant').selectOption(String(group.id));
            await modal.getByLabel('Motif administratif').fill('Vérification du contexte historique de l’offre dans le profil fictif.');
            const [res] = await Promise.all([
                page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/group-promotion/' + group.id), {
                    timeout: 120000,
                }),
                modal.getByRole('button', { name: 'Enregistrer', exact: true }).click(),
            ]);
            assert.ok([302, 303].includes(res.status()));
            if (error) await modal.getByText(error, { exact: true }).first().waitFor({ timeout: 120000 });
            else {
                await modal.waitFor({ state: 'hidden', timeout: 120000 });
                await visit(page, url);
                assert.equal(read(group).promotion, program.promotion);
                assert.equal(read(group).audits, 1);
            }
        };
        const error = 'Une offre de ce groupe relève déjà de la maquette d’un autre programme.';
        await assign(bound, fixture.autre, error);
        assert.deepEqual(read(bound), initial);
        await proof(page, 'RAT-01', 'Essayer une promotion de même faculté, même niveau et même année mais d’un autre programme', {
            groupe: bound.id,
            offre: bound.offre,
            programme_tente: fixture.autre.id,
            message: error,
            etat_avant_et_apres: initial,
            commit_serveur: revision,
            sha256_service: hash(server),
        });
        await assign(bound, fixture.programme);
        await proof(page, 'RAT-02', 'Rattacher le même groupe à la promotion du programme de son offre', { groupe: bound.id, etat: read(bound) });
        await assign(legacy, fixture.autre);
        await proof(page, 'RAT-03', 'Rattacher le groupe historique dont l’offre ne comporte aucune maquette', {
            groupe: legacy.id,
            etat: read(legacy),
        });
    } finally {
        database.close();
    }
}).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
