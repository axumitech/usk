/* global require, process, __dirname */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { chromium, chromiumOptions, origin, verify, runDirectory } = require('../browser/runtime.cjs');
const { configureCourses } = require('./structure-cursus.cjs');

// The same catalogue supplies the simulator and the browser forms.
const { execFileSync } = require('node:child_process');
const faculties = JSON.parse(execFileSync('php', ['-r',
    "require 'vendor/autoload.php'; echo json_encode(Database\\Seeders\\FinalQa\\UniversityCatalog::FACULTIES, JSON_THROW_ON_ERROR);",
], { cwd: path.resolve(__dirname, '../../..'), encoding: 'utf8' }));

async function main() {
    const version = await verify();
    assert.equal(version.tracked_changes, false);
    const root = fs.realpathSync(process.env.USK_RECETTE_V2_ROOT);
    assert.match(path.basename(root), /^usk_qa_e2e-structure(?:-[a-z0-9-]+)?$/);
    const privateProfile = JSON.parse(fs.readFileSync(path.join(root, 'final-qa.json')));
    const db = new DatabaseSync(path.join(root, 'usk-recette-v2.sqlite'), { readOnly: true });
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, privateProfile.token);
    const report = { version, actions: [] };
    const directory = runDirectory('structure');
    const browser = await chromium.launch(chromiumOptions);
    let page;
    let current = 'Connexion';
    try {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        page = await context.newPage();
        page.setDefaultTimeout(150000);
        page.setDefaultNavigationTimeout(150000);
        await page.goto(origin + '/app/login', {waitUntil: 'domcontentloaded'});
        await page.locator('input[name=email]').fill('admin@usk.test');
        await page.locator('input[name=password]').fill(privateProfile.password);
        await page.getByRole('button', { name: /se connecter/i }).click();
        await page.waitForURL('**/app/dashboard**');
        async function reference(code, name) {
            const form = page.locator('#structure-reference');
            if (code) {
                await form.getByLabel('Code stable').fill(code);
                await form.getByLabel('Nom officiel').fill(name);
            }
            await form.getByLabel('Motif administratif').fill('Configuration fictive autorisée pour la recette locale USK.');
            await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
            await form.waitFor({ state: 'hidden' });
        }
        current = 'Établissement';
        await page.goto(origin + '/app/dashboard/admin/academic-structure?tab=institution', {waitUntil: 'domcontentloaded'});
        if (!db.prepare('SELECT id FROM universities').get()) {
            await page.getByRole('button', { name: /Configurer l.établissement/ }).click();
            await page.locator('#structure-reference').getByLabel('Sigle').fill('USK-QA');
            await reference('USK-QA', 'Université Simon Kimbangu — simulation fictive');
            assert.ok(db.prepare("SELECT id FROM universities WHERE code='USK-QA'").get());
            report.actions.push(current);
        }
        await page.goto(origin + '/app/dashboard/admin/faculties', {waitUntil: 'domcontentloaded'});
        for (const [facultyCode, [name, departments]] of Object.entries(faculties)) {
            const code = facultyCode.toUpperCase();
            current = 'Création faculté ' + name;
            let faculty = db.prepare('SELECT id, university_id FROM faculties WHERE code=?').get(code);
            if (!faculty) {
                await page.getByRole('button', { name: 'Nouvelle faculté' }).click();
                await page.locator('#faculty-name').fill(name);
                await page.locator('#faculty-code').fill(code);
                await page.locator('#faculty-duration').fill(facultyCode === 'med' ? '6' : '3');
                await page.locator('#faculty-description').fill(('Faculté de simulation pour les tests de gestion universitaire. ').repeat(5).trim());
                await page.getByRole('button', { name: 'Créer la faculté' }).click();
                await page.locator('#faculty-form').waitFor({ state: 'hidden' });
                faculty = db.prepare('SELECT id, university_id FROM faculties WHERE code=?').get(code);
                assert.ok(faculty);
                report.actions.push(current);
            }
            await page.getByRole('button').filter({ has: page.getByText(name, { exact: true }) }).first().click();
            if (!faculty.university_id) {
                current = 'Rattachement ' + name;
                await page.getByRole('button', { name: /Rattacher à l.établissement/ }).click();
                await reference();
                assert.ok(db.prepare('SELECT university_id FROM faculties WHERE id=?').get(faculty.id).university_id);
                report.actions.push(current);
            }
            for (const [depCode, [depName]] of Object.entries(departments)) {
                current = 'Département ' + depName;
                const query = db.prepare('SELECT id FROM academic_departments WHERE faculty_id=? AND code=?');
                if (query.get(faculty.id, depCode.toUpperCase())) continue;
                await page.getByRole('button', { name: 'Ajouter un département' }).click();
                await reference(depCode.toUpperCase(), depName);
                assert.ok(query.get(faculty.id, depCode.toUpperCase()));
                report.actions.push(current);
            }
        }
        report.faculties = db.prepare('SELECT COUNT(*) AS n FROM faculties').get().n;
        report.departments = db.prepare('SELECT COUNT(*) AS n FROM academic_departments').get().n;
        assert.equal(report.faculties, 5);
        assert.equal(report.departments, 10);
        await page.screenshot({ path: path.join(directory, 'facultes.png') });
        await configureCourses({ page, db, faculties, origin, reference, report, directory, step: value => { current = value; } });
    } catch (error) {
        report.error = { action: current, message: error.message.split('\n')[0] };
        if (page) {
            report.formErrors = await page.locator('[role=alert]:visible').allTextContents().catch(() => []);
            await page.screenshot({ path: path.join(directory, 'interruption.png'), timeout: 5000 }).catch(() => {});
        }
        throw error;
    } finally {
        fs.writeFileSync(path.join(directory, 'structure.json'), JSON.stringify(report, null, 2));
        db.close();
        await browser.close();
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
