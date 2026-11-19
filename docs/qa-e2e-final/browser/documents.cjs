/* global require, process, __dirname */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium, chromiumOptions, origin, verify, runDirectory } = require('./runtime.cjs');

async function main() {
    const version = await verify();
    const out = runDirectory('documents');
    const profile = fs.realpathSync(process.env.USK_RECETTE_V2_ROOT);
    assert.match(path.basename(profile), /^usk_qa_e2e-/);
    const { password } = JSON.parse(fs.readFileSync(path.join(profile, 'final-qa.json'), 'utf8'));
    assert.ok(typeof password === 'string' && password.length >= 16);
    const fixture = JSON.parse(execFileSync(process.env.USK_QA_PHP || 'php', [path.join(__dirname, 'document-fixtures.php')], {
        encoding: 'utf8', env: { ...process.env, USK_QA_FINAL_ROOT: profile },
    }));
    const rows = [];
    const errors = new WeakMap();
    const browser = await chromium.launch(chromiumOptions);
    async function newPage(settings = {}) {
        const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, locale: 'fr-FR', ...settings });
        page.setDefaultNavigationTimeout(90000);
        await page.context().route('**/*', (route) => (new URL(route.request().url()).origin === origin ? route.continue() : route.abort()));
        errors.set(page, []);
        page.on('pageerror', (e) => errors.get(page).push(e.message));
        return page;
    }
    const login = async (page, email) => {
        await page.goto(origin + '/app/login');
        await page.locator('#login-email').fill(email);
        await page.locator('#login-password').fill(password);
        await page.getByRole('button', { name: /se connecter/i }).click();
        await page.waitForURL('**/app/dashboard**');
    };
    const capture = async (page, name) => {
        const file = path.basename(name) + '.png';
        await page.screenshot({ path: path.join(out, file) });
        return file;
    };
    try {
        const outcome = await require('../../recette-finale/scripts/results-documents.cjs').run({
            fixture,
            origin,
            artifacts: out,
            login,
            newPage,
            capture,
            phase: 'documents',
            check: assert.ok,
            record: (id, actor, action, expected, obtained, proofs) =>
                rows.push({
                    id,
                    actor,
                    action,
                    expected,
                    obtained,
                    proofs: proofs.map((file) => path.basename(file)),
                    status: id.includes('BLOCK') ? 'BLOQUÉ' : 'VALIDÉ',
                }),
            assertNoErrors: (page) => assert.deepEqual(errors.get(page), []),
        });
        if (!outcome.documents.document) throw new Error('Émission documentaire incomplète.');
        const owner = await newPage();
        await login(owner, fixture.students.med.email);
        await owner.goto(origin + '/app/dashboard/student/documents?academic=' + fixture.students.med.entry + '&category=official');
        const link = owner.getByRole('link', { name: /Télécharger.*Attestation SPECIMEN recette 06/ });
        const downloaded = owner.waitForEvent('download');
        await link.click();
        const archive = path.join(out, 'specimen-etudiant.pdf');
        await (await downloaded).saveAs(archive);
        assert.ok(fs.readFileSync(archive).equals(fs.readFileSync(path.join(out, 'usk-06-attestation-specimen.pdf'))));
        rows.push({
            id: 'DOC-05',
            actor: 'Étudiant Médecine',
            action: 'Télécharger le document émis',
            obtained: 'PDF identique à l’archive émise',
            status: 'VALIDÉ',
            proofs: [await capture(owner, 'bibliotheque-etudiant')],
        });
    } finally {
        fs.writeFileSync(path.join(out, 'resume.json'), JSON.stringify({ version, fixture, rows }, null, 2));
        await browser.close();
    }
}
main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
