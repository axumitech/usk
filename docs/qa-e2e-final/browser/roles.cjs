/* global require, process, __dirname */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium, chromiumOptions, origin, runDirectory, verify } = require('./runtime.cjs');

async function main() {
    const version = await verify();
    const profile = fs.realpathSync(process.env.USK_RECETTE_V2_ROOT);
    assert.ok(path.basename(profile).startsWith('usk_qa_e2e-'));
    assert.equal(new URL(origin).hostname, '127.0.0.1');
    const { password } = JSON.parse(fs.readFileSync(path.join(profile, 'final-qa.json'), 'utf8'));
    assert.ok(typeof password === 'string' && password.length >= 16);
    const fixtures = JSON.parse(execFileSync(process.env.USK_QA_PHP || 'php', [path.join(__dirname, 'role-fixtures.php')], {
        encoding: 'utf8', env: { ...process.env, USK_QA_FINAL_ROOT: profile },
    }));
    const output = runDirectory('roles');
    const browser = await chromium.launch(chromiumOptions);
    const results = [];
    const dashboard = '/app/dashboard';
    const admin = dashboard + '/admin';
    const platform = dashboard + '/platform';
    const delegation = dashboard + '/delegation';
    const message = 'Réunion fictive de promotion QA ' + Date.now() + '.';
    const users = [
        ['plateforme', 'plateforme', platform, admin + '/finance'],
        ['institution', 'admin', dashboard, platform],
        ['rectorat', 'rectorat', delegation, admin + '/enrollments'],
        ['secretariat', 'academique', admin + '/enrollments', platform],
        ['doyen', 'dean.dr', admin + '/enrollments', admin + '/levels/details/' + fixtures.foreignLevel],
        ['vice-doyen', 'vice-dean.dr', admin + '/teaching', admin + '/finance'],
        ['appariteur', 'registrar.dr', admin + '/student-academic', admin + '/finance'],
        ['admissions', 'admissions-officer.dr', admin + '/enrollments', admin + '/finance'],
        ['comptabilite', 'finance-officer.dr', admin + '/finance', admin + '/teaching'],
        ['departement', 'department-head.dpu', delegation, admin + '/student-academic'],
        ['professeur', 'professeur.dpu', dashboard + '/teacher', admin + '/finance'],
        ['chef-promotion', fixtures.representative, delegation, admin + '/enrollments'],
        ['etudiant', fixtures.student, dashboard + '/student', admin + '/student-academic'],
        ['candidat', 'candidat', dashboard + '/enrollments', admin + '/enrollments'],
    ];
    fs.writeFileSync(path.join(output, 'version.json'), JSON.stringify(version, null, 2));
    try {
        for (const [role, login, home, denied] of users) {
            const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, locale: 'fr-FR', timezoneId: 'Africa/Kinshasa', serviceWorkers: 'block' });
            await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
            const page = await context.newPage();
            const account = login.includes('@') ? login : login + '@usk.test';
            assert.ok(account.endsWith('@usk.test'));
            const record = { role, account, allowed: home, forbidden: denied, status: 'EN COURS', javascriptErrors: [] };
            page.on('pageerror', (error) => record.javascriptErrors.push(error.name));
            try {
                await page.goto(origin + '/app/login', { waitUntil: 'domcontentloaded' });
                await page.locator('input[name=email]').fill(account);
                await page.locator('input[name=password]').fill(password);
                await page.getByRole('button', { name: /se connecter/i }).click();
                await page.waitForURL((url) => home === dashboard ? url.pathname === dashboard : url.pathname.startsWith(home), { timeout: 45000 });
                const allowed = await page.goto(origin + home, { waitUntil: 'domcontentloaded' });
                record.allowedStatus = allowed.status();
                assert.equal(record.allowedStatus, 200);
                await page.locator('h1, h2').first().waitFor();
                record.bundle = await page.evaluate((entry) => [...document.scripts].some((s) => s.src.endsWith('/build/' + entry)), version.assets.entry);
                assert.equal(record.bundle, true);
                if (role === 'plateforme') {
                    await page.getByRole('heading', { name: 'Administration de la plateforme' }).waitFor();
                    await page.getByLabel('Motif de maintenance').fill('Vérification du cache dans la simulation universitaire.');
                    await page.getByRole('button', { name: 'Actualiser le cache' }).click();
                    await page.getByText('Cache des permissions actualisé', { exact: false }).first().waitFor();
                    record.operation = 'Actualisation du cache enregistrée.';
                }
                if (role === 'rectorat') await page.getByText('Facultés actives', { exact: true }).waitFor();
                if (role === 'departement') {
                    await page.getByRole('heading', { name: 'Programmes de vos départements' }).waitFor();
                    assert.match(await page.locator('main').last().innerText(), /Droit public/i);
                    assert.doesNotMatch(await page.locator('main').last().innerText(), /Droit privé/i);
                }
                if (role === 'chef-promotion') {
                    await page.getByLabel('Message', { exact: true }).fill(message);
                    const response = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === delegation + '/promotion');
                    await page.getByRole('button', { name: 'Envoyer à ma promotion' }).click();
                    record.publishedStatus = (await response).status();
                    assert.equal(record.publishedStatus, 303);
                }
                if (role === 'etudiant') {
                    await page.goto(origin + dashboard + '/student/notifications', { waitUntil: 'domcontentloaded' });
                    await page.getByText(message, { exact: true }).first().waitFor();
                    record.operation = 'Message du chef de promotion lu dans la boîte étudiante.';
                }
                await page.screenshot({ path: path.join(output, role + '.png') });
                const blocked = await page.goto(origin + denied, { waitUntil: 'domcontentloaded' });
                record.forbiddenStatus = blocked.status();
                assert.equal(record.forbiddenStatus, 403);
                assert.equal(record.javascriptErrors.length, 0);
                record.status = 'VALIDÉ';
            } catch (error) {
                record.status = 'ÉCHEC';
                record.reason = String(error.message).split('\n')[0].replaceAll(password, '[masqué]').slice(0, 240);
                process.exitCode = 1;
            } finally {
                await context.close();
                results.push(record);
                fs.writeFileSync(path.join(output, 'matrice.json'), JSON.stringify(results, null, 2));
                console.log(role + ' ' + record.status);
            }
        }
    } finally {
        await browser.close();
    }
}
main().catch((error) => { console.error(error.message.split('\n')[0]); process.exitCode = 1; });
