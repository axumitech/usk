/* global require, module, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, chromiumOptions, origin, runDirectory, verify } = require('./runtime.cjs');

async function run(suite, perform) {
    const version = await verify();
    const out = runDirectory(suite);
    const browser = await chromium.launch(chromiumOptions);
    const rows = [];
    let activePage;
    const login = async (email, password) => {
        assert.ok(email.endsWith('@usk.test'));
        const page = await browser.newPage({ viewport: { width: 1410, height: 930 }, locale: 'fr-FR', timezoneId: 'Africa/Kinshasa' });
        activePage = page;
        page.setDefaultNavigationTimeout(90000);
        page.setDefaultTimeout(35000);
        await page.context().route('**/*', (r) => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
        await page.goto(origin + '/app/login', { waitUntil: 'domcontentloaded' });
        await page.locator('#login-email').fill(email);
        await page.locator('#login-password').fill(password || process.env.USK_QA_PASSWORD || 'password');
        await page.getByRole('button', { name: /se connecter/i }).click();
        await page.waitForURL('**/app/dashboard**');
        return page;
    };
    const visit = async (page, uri) => {
        activePage = page;
        const url = new URL(uri, origin);
        assert.equal(url.origin, origin);
        const response = await page.goto(url.href, { waitUntil: 'domcontentloaded' });
        assert.equal(response.status(), 200);
        await page.locator('#app[data-page]').waitFor({ state: 'attached' });
        return JSON.parse(await page.locator('#app').getAttribute('data-page')).props;
    };
    const proof = async (page, id, action, obtained) => {
        const filename = id + '.png';
        await page.screenshot({ path: path.join(out, filename) });
        rows.push({ id, status: 'VALIDÉ', action, obtained, proof: filename });
    };
    try {
        await perform({ login, visit, proof, out, origin });
    } catch (e) {
        rows.push({ id: suite, status: 'BLOQUÉ', detail: String(e.message).split('\n')[0] });
        if (activePage) await activePage.screenshot({ path: path.join(out, 'blocage.png') }).catch(() => {});
        throw e;
    } finally {
        fs.writeFileSync(path.join(out, 'resume.json'), JSON.stringify({ version, rows }, null, 2));
        await browser.close();
    }
}
module.exports = { run };
