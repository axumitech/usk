/* global require, module, process, __dirname, Buffer */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.USK_QA_PLAYWRIGHT || 'playwright');
const repo = path.resolve(__dirname, '../../..');
const origin = 'http://127.0.0.1:' + process.env.USK_RECETTE_V2_PORT;
const mailOrigin = 'http://127.0.0.1:' + (process.env.USK_QA_MAIL_PORT || '8025');
const evidenceRoot = path.resolve(process.env.USK_QA_EVIDENCE || path.join(__dirname, '../preuves'));
const chromiumOptions = {
    headless: false,
    executablePath: process.env.USK_QA_CHROME || chromium.executablePath(),
    args: ['--disable-background-networking', '--no-proxy-server', '--renderer-process-limit=2'],
};

function probe(...args) {
    return JSON.parse(execFileSync(process.env.USK_QA_PHP || 'php', [path.join(__dirname, 'profile.php'), ...args], { cwd: repo, encoding: 'utf8' }));
}

async function verify() {
    const local = probe();
    assert.equal(local.origin, origin);
    const response = await fetch(origin + '/__usk_recipe/version', { redirect: 'error', signal: AbortSignal.timeout(45000) });
    assert.equal(response.status, 200);
    const version = await response.json();
    assert.match(version.revision || '', /^[a-f0-9]{40}$/);
    assert.equal(version.assets.mode, 'build');
    assert.equal(version.assets.revision, version.revision);
    assert.equal(version.assets.manifest_sha256, local.manifest);
    const bundle = await fetch(origin + '/build/' + version.assets.entry, { redirect: 'error' });
    assert.equal(bundle.status, 200);
    assert.equal(
        createHash('sha256')
            .update(Buffer.from(await bundle.arrayBuffer()))
            .digest('hex'),
        version.assets.entry_sha256,
    );
    return version;
}

function runDirectory(suite) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const directory = path.join(evidenceRoot, suite + '-' + stamp);
    fs.mkdirSync(directory, { recursive: true });
    return directory;
}

module.exports = { chromium, chromiumOptions, origin, mailOrigin, evidenceRoot, probe, verify, runDirectory };
