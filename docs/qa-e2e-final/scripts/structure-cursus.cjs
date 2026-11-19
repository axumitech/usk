/* global require, module, __dirname */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

async function configureCourses({ page, db, faculties, origin, reference, report, directory, step }) {
    const cycles = JSON.parse(execFileSync('php', ['-r', "require 'vendor/autoload.php'; echo json_encode(Database\\Seeders\\FinalQa\\UniversityCatalog::CYCLES);"],
        { cwd: path.resolve(__dirname, '../../..'), encoding: 'utf8' }));
    const go = url => page.goto(origin + '/app/dashboard/admin/' + url, {waitUntil: 'domcontentloaded'});
    const form = page.locator('#structure-reference');
    async function create(label, sql, args, act) {
        const query = db.prepare(sql);
        if (query.get(...args)) return;
        step(label);
        await act();
        assert.ok(query.get(...args), label);
        report.actions.push(label);
    }
    await go('academic-years');
    for (const start of [2025, 2026]) {
        const end = start + 1;
        const title = start + '-' + end;
        await create('Année ' + title, 'SELECT id FROM academic_years WHERE title=?', [title], async () => {
            await page.getByRole('button', { name: 'Nouvelle année' }).click();
            await page.locator('#academic-title').fill(title);
            await page.locator('#academic-start_date').fill(start + '-10-01');
            await page.locator('#academic-end_date').fill(end + '-09-30');
            await page.getByRole('button', { name: 'Créer l’année' }).click();
            await page.locator('#academic-year-form').waitFor({state:'hidden'});
        });
    }
    for (const year of db.prepare('SELECT id,title FROM academic_years ORDER BY title').all()) {
        await go('academic-years/semesters?academic_year_id=' + year.id);
        for (const n of [1, 2]) {
            await create(year.title + ' semestre ' + n, 'SELECT id FROM academic_semesters WHERE academic_year_id=? AND number=?', [year.id, n], async () => {
                await page.locator('article').filter({has: page.getByRole('heading', {name: n === 1 ? '1er semestre' : '2e semestre'})}).getByRole('button').click();
                await page.getByRole('button', {name:'Enregistrer la période'}).click();
                await page.locator('#semester-period-form').waitFor({state:'hidden'});
            });
        }
    }
    await go('academic-structure?tab=programs');
    for (const [code, [name, levels]] of Object.entries(cycles)) {
        await create('Cycle ' + name, 'SELECT id FROM academic_cycles WHERE code=?', [code], async () => {
            await page.getByRole('heading', {name:'Cycles académiques'}).locator('..').getByRole('button',{name:'Ajouter'}).click();
            await form.getByLabel(/Durée normale/).fill(String(levels.length));
            await form.getByLabel('Code période 1').fill('AN');
            await form.getByLabel('Nom période 1').fill('Année universitaire fictive');
            await reference(code, name + ' — simulation');
        });
    }
    const departements = [];
    for (const [facultyName, deps] of Object.values(faculties)) {
        for (const [key, [name, cycleCode]] of Object.entries(deps)) {
            departements.push({ key:key.toUpperCase(), name, facultyName, cycle:cycles[cycleCode][0], levels:cycles[cycleCode][1] });
        }
    }
    for (const dep of departements) {
        for (const level of dep.levels) {
            const code = dep.key + '-' + level;
            await create('Niveau ' + code, 'SELECT id FROM levels WHERE code=?', [code], async () => {
                await go('levels');
                await page.getByRole('button', {name:'Nouveau niveau'}).click();
                await page.locator('#level-create-faculty').selectOption({label:dep.facultyName});
                await page.locator('#level-create-code').fill(code);
                await page.locator('#level-create-title').fill(level + ' — ' + dep.name);
                await page.getByRole('button',{name:'Créer le niveau'}).click();
                await page.locator('#level-form').waitFor({state:'hidden'});
            });
        }
        const code = 'QA-' + dep.key;
        await create('Programme ' + code, 'SELECT id FROM academic_programs WHERE code=?', [code], async () => {
            await go('academic-structure?tab=programs');
            await page.getByRole('button',{name:'Nouveau programme'}).click();
            await form.getByLabel('Faculté propriétaire').selectOption({label:dep.facultyName});
            await form.getByLabel('Département responsable').selectOption({label:dep.name});
            await form.getByRole('combobox',{name:/^Cycle/}).selectOption({label:dep.cycle + ' — simulation'});
            await form.getByLabel('Durée normale').fill(String(dep.levels.length));
            for (const level of dep.levels) await form.getByRole('checkbox',{name: new RegExp(dep.key + '-' + level + ' ·')}).check();
            await reference(code, dep.cycle + ' — ' + dep.name);
        });
        const program = db.prepare('SELECT id FROM academic_programs WHERE code=?').get(code);
        const currentYear = db.prepare("SELECT id FROM academic_years WHERE title='2026-2027'").get();
        await create('Promotion ' + code, 'SELECT id FROM academic_promotions WHERE code=?', [code], async () => {
            await go('academic-structure?tab=programs&program=' + program.id);
            await page.getByRole('heading',{name:'Promotions annuelles'}).locator('..').getByRole('button',{name:'Ajouter'}).click();
            await form.getByLabel('Année académique').selectOption(String(currentYear.id));
            await form.getByRole('combobox',{name:/^Niveau/}).selectOption({label: dep.levels[0] + ' — ' + dep.name});
            await reference(code, 'Promotion 2026 — ' + dep.name);
        });
        await create('Maquette ' + code, 'SELECT id FROM curriculum_versions WHERE academic_program_id=? AND academic_year_id=?', [program.id,currentYear.id], async () => {
            await go('academic-structure?tab=curriculum&program=' + program.id);
            await page.getByRole('button',{name:'Nouvelle maquette',exact:true}).first().click();
            const draft = page.locator('#curriculum-create');
            await draft.getByLabel('Code de version').fill('2026-V1');
            await draft.getByLabel('Nom',{exact:true}).fill('Maquette fictive — ' + dep.name);
            await draft.getByLabel('Applicable à une année').selectOption(String(currentYear.id));
            await draft.locator('textarea').fill('Préparation fictive des enseignements pour la nouvelle année.');
            await page.getByRole('button',{name:'Créer le brouillon'}).click();
            await draft.waitFor({state:'hidden'});
        });
    }
    await page.screenshot({path:path.join(directory,'maquette.png')});
}
module.exports = { configureCourses };
