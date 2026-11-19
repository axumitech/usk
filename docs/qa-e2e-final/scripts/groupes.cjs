/* global require, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { chromium, chromiumOptions, origin, runDirectory, verify } = require('../browser/runtime.cjs');

async function main() {
    const version = await verify();
    assert.equal(version.tracked_changes, false);
    const root = fs.realpathSync(process.env.USK_RECETTE_V2_ROOT);
    assert.match(path.basename(root), /^usk_qa_e2e-structure(?:-[a-z0-9-]+)?$/);
    const profile = JSON.parse(fs.readFileSync(path.join(root, 'final-qa.json')));
    const db = new DatabaseSync(path.join(root, 'usk-recette-v2.sqlite'), { readOnly: true });
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, profile.token);
    const promotion = db.prepare(`SELECT p.id,p.name,p.code,p.level_id,p.academic_program_id,p.academic_year_id,l.title AS level,l.faculty_id
        FROM academic_promotions p JOIN levels l ON l.id=p.level_id JOIN academic_years y ON y.id=p.academic_year_id
        WHERE p.is_active=1 AND l.is_active=1 AND y.title='2026-2027' AND y.status!='closed' ORDER BY p.id LIMIT 1`).get();
    assert.ok(promotion, 'Créer d’abord une promotion active dans le profil de structure.');
    const label = 'Groupe pratique QA ' + Date.now();
    const output = runDirectory('groupes');
    const report = { version, role: 'admin', promotion, label, status: 'EN COURS', steps: [] };
    const browser = await chromium.launch(chromiumOptions);
    let page;
    try {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
        await context.route('**/*', (r) => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
        page = await context.newPage();
        page.setDefaultTimeout(45000);
        await page.goto(origin + '/app/login', { waitUntil: 'domcontentloaded' });
        await page.locator('input[name=email]').fill('admin@usk.test');
        await page.locator('input[name=password]').fill(profile.password);
        await page.getByRole('button', { name: /se connecter/i }).click();
        await page.waitForURL('**/app/dashboard**');
        const admin = origin + '/app/dashboard/admin';
        const programPage = admin + '/academic-structure?tab=programs&program=' + promotion.academic_program_id;
        await page.goto(programPage, { waitUntil: 'domcontentloaded' });
        const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: promotion.code, exact: true }) });
        const form = page.locator('#promotion-group');
        for (const attempt of ['création', 'répétition']) {
            await row.getByRole('button', { name: 'Créer un groupe', exact: true }).click();
            await form.getByLabel('Nom du groupe').fill(label);
            await form.getByLabel(/Capacité maximale/).fill('24');
            await page.getByRole('button', { name: 'Créer le groupe', exact: true }).click();
            await form.waitFor({ state: 'hidden' });
            assert.equal(new URL(page.url()).searchParams.get('program'), String(promotion.academic_program_id));
            await row.getByText(new RegExp(label)).waitFor();
            const groups = db.prepare(`SELECT c.id,c.level_id,c.faculty_id,c.capacity,c.academic_promotion_id,i.name
                FROM classes c JOIN intakes i ON i.id=c.intake_id WHERE c.academic_promotion_id=? AND i.name=?`)
                .all(promotion.id, label + ' · promotion ' + promotion.id);
            assert.equal(groups.length, 1);
            const group = groups[0];
            assert.equal(group.level_id, promotion.level_id);
            assert.equal(group.faculty_id, promotion.faculty_id);
            assert.equal(group.capacity, 24);
            assert.equal(db.prepare("SELECT COUNT(*) AS total FROM academic_audits WHERE entity_type='classes' AND entity_id=? AND action='promotion_group_created'").get(group.id).total, 1);
            report.steps.push({ action: attempt, group: group.id, level: group.level_id, faculty: group.faculty_id, capacity: group.capacity });
        }
        await page.screenshot({ path: path.join(output, 'groupes-promotion.png') });
        await row.getByRole('button', { name: 'Associer un groupe', exact: true }).click();
        const picker = page.locator('#structure-reference').getByLabel('Groupe existant');
        const options = await picker.locator('option').evaluateAll((nodes) => nodes.filter((node) => node.value).map((node) => Number(node.value)));
        assert.ok(options.includes(report.steps[0].group));
        for (const id of options) {
            const group = db.prepare('SELECT faculty_id,level_id,academic_promotion_id FROM classes WHERE id=?').get(id);
            assert.equal(group.level_id, promotion.level_id);
            assert.equal(group.faculty_id, promotion.faculty_id);
            assert.ok(group.academic_promotion_id === null || group.academic_promotion_id === promotion.id);
        }
        await picker.selectOption(String(report.steps[0].group));
        await page.locator('#structure-reference').getByLabel('Motif administratif').fill('Vérification de l’affectation existante en recette fictive.');
        await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
        await page.locator('#structure-reference').waitFor({ state: 'hidden' });
        await page.goto(admin + '/levels/' + promotion.level_id, { waitUntil: 'domcontentloaded' });
        await page.waitForURL('**/levels/details/' + promotion.level_id);
        await page.getByText(promotion.level, { exact: false }).first().waitFor();
        await page.screenshot({ path: path.join(output, 'niveau-du-groupe.png') });
        report.steps.push({ action: 'sélecteur limité au même niveau et à la même faculté', options: options.length, levelPage: new URL(page.url()).pathname });
        report.status = 'VALIDÉ';
    } catch (error) {
        report.status = 'ÉCHEC';
        report.reason = String(error.message).split('\n')[0].replaceAll(profile.password, '[masqué]').slice(0, 240);
        process.exitCode = 1;
    } finally {
        await browser.close();
        db.close();
        fs.writeFileSync(path.join(output, 'matrice.json'), JSON.stringify(report, null, 2));
        console.log(report.status + ' ' + output);
    }
}
main().catch((error) => { console.error(error.message.split('\n')[0]); process.exitCode = 1; });
