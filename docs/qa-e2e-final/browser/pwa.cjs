/* global require, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, chromiumOptions, origin, verify, runDirectory } = require('./runtime.cjs');
const out = runDirectory('pwa');
(async () => {
    const verified = await verify();
    fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify(verified, null, 2));
    const browser = await chromium.launch(chromiumOptions);
    try {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR' });
        await ctx.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        const page = await ctx.newPage();
        page.setDefaultTimeout(45000);
        page.setDefaultNavigationTimeout(90000);
        const response = await page.goto(origin + '/app/login', { waitUntil: 'domcontentloaded' });
        assert.equal(response.status(), 200);
        await page.locator('#login-email').waitFor();
        const metadata = await (await page.request.get(origin + '/__usk_recipe/version')).json();
        assert.equal(metadata.revision, metadata.assets.revision);

        const observed = await page.evaluate(
            (entry) => performance.getEntriesByType('resource').some((resource) => new URL(resource.name).pathname === '/build/' + entry),
            metadata.assets.entry,
        );
        assert(observed);
        const bytes = await (await page.request.get(origin + '/build/' + metadata.assets.entry)).body();
        assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.assets.entry_sha256);
        await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
        const state = await page.evaluate(async () => {
            const names = await caches.keys();
            const entries = [];
            for (const name of names) for (const req of await (await caches.open(name)).keys()) entries.push(new URL(req.url).pathname);
            return { worker: navigator.serviceWorker.controller.scriptURL, entries };
        });
        assert.equal(new URL(state.worker).pathname, '/app/sw.js');
        assert.deepEqual(state.entries, ['/pwa/offline.html']);
        const sw = await page.request.get(origin + '/app/sw.js');
        assert.equal(sw.status(), 200);
        await page.screenshot({ path: path.join(out, '01-connexion-version-verifiee.png') });
        await ctx.setOffline(true);
        await page.goto(origin + '/app/login?audit-offline=1', { waitUntil: 'domcontentloaded' });
        assert.match(await page.locator('body').innerText(), /hors connexion|connexion internet|connexion indisponible/i);
        assert.equal(await page.locator('#login-email').count(), 0);
        await page.screenshot({ path: path.join(out, '02-secours-hors-ligne.png') });
        const record = { metadata, observed, assetHashMatch: true, serviceWorker: state, scriptHttp: sw.status(), offlineFallback: true };
        fs.writeFileSync(path.join(out, 'trace.json'), JSON.stringify(record, null, 2));
        console.log('Chrome a chargé l’asset attesté de cette révision, installé le service worker et affiché le secours hors connexion.');
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
