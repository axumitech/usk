/* global require, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, chromiumOptions, origin, verify, runDirectory } = require('../browser/runtime.cjs');

async function main() {
    const version = await verify();
    assert.equal(version.tracked_changes, false);
    const output = runDirectory('navigation');
    const browser = await chromium.launch(chromiumOptions);
    const results = { version, groups: [], pages: [] };
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' });
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        const menu = await context.newPage();
        await menu.goto(origin + '/app/login');
        await menu.locator('input[name=email]').fill('admin@usk.test');
        const privateFile = path.join(process.env.USK_RECETTE_V2_ROOT, 'final-qa.json');
        const password = fs.existsSync(privateFile) ? JSON.parse(fs.readFileSync(privateFile)).password : 'password';
        await menu.locator('input[name=password]').fill(password);
        await menu.getByRole('button', { name: /se connecter/i }).click();
        await menu.waitForURL('**/app/dashboard**');
        const rail = menu.locator('[data-admin-sidebar="rail"] button[data-menu]:not([data-menu=logout])');
        await rail.first().waitFor();
        const buttons = await rail.evaluateAll(items => items.map(x => ({ id: x.dataset.menu, label: x.getAttribute('aria-label') })));
        for (const group of buttons) {
            const button = rail.locator('xpath=self::*[@data-menu="' + group.id + '"]');
            if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
            const links = menu.locator('#sidebar-panel-' + group.id + ' nav a[href]');
            await links.first().waitFor({ timeout: 8000 });
            group.links = await links.evaluateAll(items => items.map(a => ({ title: a.innerText.trim(), href: a.getAttribute('href') })));
            results.groups.push(group);
        }
        await menu.screenshot({ path: path.join(output, 'menu.png') });
        const page = await context.newPage();
        const paths = new Set();
        for (const group of results.groups) {
            for (const link of group.links) {
                const url = new URL(link.href, origin);
                if (paths.has(url.href) || url.origin !== origin) continue;
                paths.add(url.href);
                const row = { group: group.label, title: link.title, route: url.pathname + url.search };
                results.pages.push(row);
                try {
                    const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 22000 });
                    row.http = response.status();
                    row.path = new URL(page.url()).pathname;
                    row.contentType = (await response.allHeaders())['content-type'];
                    if (row.contentType.includes('html')) {
                        await page.locator('h1,h2,main,[data-page]').first().waitFor({ state: 'attached', timeout: 5000 });
                        row.heading = await page.locator('h1,h2').allTextContents();
                        row.heading = row.heading.filter(Boolean).slice(0, 3);
                        row.title = await page.title() || row.title;
                    }
                    row.ok = row.http === 200 && row.path === url.pathname;
                } catch (error) { row.ok = false; row.error = error.message.split('\n')[0]; }
                fs.writeFileSync(path.join(output, 'navigation.json'), JSON.stringify(results, null, 2));
            }
        }
        console.log(JSON.stringify({ groups: results.groups.length, pages: results.pages.length, failed: results.pages.filter(r => !r.ok).map(r => r.route) }));
    } finally {
        fs.writeFileSync(path.join(output, 'navigation.json'), JSON.stringify(results, null, 2));
        await browser.close();
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
