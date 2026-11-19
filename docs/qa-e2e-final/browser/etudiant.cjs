/* global require, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, chromiumOptions, origin, runDirectory, verify } = require('./runtime.cjs');

async function main() {
    const version = await verify();
    const out = runDirectory('etudiant');
    const browser = await chromium.launch(chromiumOptions);
    const rows = [];
    try {
        const ctx = await browser.newContext({ viewport: { width: 1365, height: 900 }, locale: 'fr-FR', timezoneId: 'Africa/Kinshasa' });
        await ctx.route('**/*', (r) => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
        const page = await ctx.newPage();
        page.setDefaultTimeout(10000);
        page.setDefaultNavigationTimeout(90000);
        const jsErrors = [];
        page.on('pageerror', (e) => jsErrors.push(e.message));
        await page.goto(origin + '/app/login');
        await page.locator('#login-email').fill('etudiant.med@usk.test');
        await page.locator('#login-password').fill(process.env.USK_QA_PASSWORD || 'password');
        await page.getByRole('button', { name: /se connecter/i }).click();
        await page.waitForURL('**/app/dashboard**');
        const sections = [
            'overview',
            'profile',
            'academics',
            'courses',
            'schedule',
            'materials',
            'assignments',
            'evaluations',
            'results',
            'annual-fees',
            'transactions',
            'documents',
            'requests',
            'services',
            'announcements',
            'notifications',
            'card',
        ];
        for (const section of sections) {
            const academic = rows.find((row) => row.entry)?.entry;
            const url = origin + '/app/dashboard/student/' + section + (academic ? '?academic=' + academic : '');
            try {
                const res = await page.goto(url);
                assert.equal(res.status(), 200);
                const root = page.locator('#app[data-page]');
                await root.locator('main').first().waitFor({ state: 'visible' });
                const data = JSON.parse(await root.getAttribute('data-page')).props;
                assert.equal(data.auth.user.email, 'etudiant.med@usk.test');
                if (data.academic && academic) assert.equal(data.academic.id, academic);
                const headings = await page.getByRole('heading').allTextContents();
                assert.ok(headings.some((t) => t.trim()));
                const feedback = {
                    section,
                    status: 'VALIDÉ',
                    entry: data.academic?.id,
                    headings: headings.slice(0, 4),
                    purpose: 'Consultation',
                    http: res.status(),
                };
                if (section === 'card') {
                    const more = page.getByRole('link', { name: 'Gérer ma photo de profil' });
                    await more.waitFor();
                    await page.screenshot({ path: path.join(out, 'carte-initiale.png') });
                    await more.click();
                    await page.waitForURL((u) => u.pathname.endsWith('/profile'));
                    await page.getByText('Photo de profil', { exact: true }).first().waitFor();
                    feedback.purpose = 'Ouvrir la carte puis la gestion de la photo';
                }
                assert.deepEqual(jsErrors, []);
                const proof = section + '.png';
                await page.screenshot({ path: path.join(out, proof) });
                rows.push({ ...feedback, proof });
            } catch (error) {
                await page.screenshot({ path: path.join(out, section + '-diagnostic.png') }).catch(() => {});
                rows.push({ section, status: 'ÉCHEC', detail: String(error.message).split('\n')[0] });
            }
        }
    } finally {
        fs.writeFileSync(path.join(out, 'resume.json'), JSON.stringify({ version, rows }, null, 2));
        await browser.close();
    }
    if (rows.some((row) => row.status !== 'VALIDÉ')) process.exitCode = 1;
}
main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
