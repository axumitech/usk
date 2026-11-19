/* global require, process, __dirname */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { chromium, chromiumOptions, origin, verify, runDirectory } = require('./runtime.cjs');

async function main() {
    const version = await verify();
    const out = runDirectory('documents');
    const profile = fs.realpathSync(process.env.USK_RECETTE_V2_ROOT);
    assert.match(path.basename(profile), /^usk_qa_e2e-/);
    const { password } = JSON.parse(fs.readFileSync(path.join(profile, 'final-qa.json'), 'utf8'));
    assert.ok(typeof password === 'string' && password.length >= 16);
    const fixture = JSON.parse(
        execFileSync(process.env.USK_QA_PHP || 'php', [path.join(__dirname, 'document-fixtures.php')], {
            encoding: 'utf8',
            env: { ...process.env, USK_QA_FINAL_ROOT: profile },
        }),
    );
    const rows = [];
    const errors = new WeakMap();
    const browser = await chromium.launch(chromiumOptions);
    async function newPage(settings = {}) {
        const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, locale: 'fr-FR', ...settings });
        page.setDefaultTimeout(90000);
        page.setDefaultNavigationTimeout(90000);
        await page.context().route('**/*', (route) => (new URL(route.request().url()).origin === origin ? route.continue() : route.abort()));
        errors.set(page, []);
        page.on('pageerror', (e) => errors.get(page).push(e.message));
        return page;
    }
    const login = async (page, email) => {
        await page.bringToFront();
        await page.goto(origin + '/app/login', { waitUntil: 'domcontentloaded' });
        await page.locator('#login-email').fill(email);
        await page.locator('#login-password').fill(password);
        await page.locator('#login-password').press('Enter');
        await page.waitForURL('**/app/dashboard**');
    };
    const capture = async (page, name) => {
        const file = path.basename(name) + '.png';
        await page.screenshot({ path: path.join(out, file) });
        return file;
    };
    try {
        if (fixture.issued) {
            const issued = fixture.issued;
            const entry = fixture.students.med.entry;
            const issuer = await newPage();
            await login(issuer, fixture.accounts.registrar_med.email);
            assert.equal(
                (await issuer.goto(origin + '/app/dashboard/admin/official-documents?academic=' + entry + '&type=' + issued.type)).status(),
                200,
            );
            const data = JSON.parse(await issuer.locator('#app[data-page]').getAttribute('data-page')).props;
            assert.ok(data.type.active && data.templates.data.some((t) => t.id === issued.template && t.approved_at));
            rows.push({
                id: 'DOC-01',
                status: 'VALIDÉ',
                action: 'Relire le type actif et le modèle approuvé',
                obtained: { type: issued.type, modele: issued.template },
                proofs: [await capture(issuer, 'modele-approuve')],
            });
            const doc = data.documents.data.find((d) => d.id === issued.id);
            assert.equal(doc?.number, issued.number);
            assert.equal(doc.validity, 'valid');
            const archive = issuer.waitForEvent('download', { timeout: 90000 });
            await issuer.getByRole('link', { name: 'PDF archivé', exact: true }).click();
            const pdf = path.join(out, 'usk-06-attestation-specimen.pdf');
            await (await archive).saveAs(pdf);
            const bytes = fs.readFileSync(pdf);
            assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
            assert.equal(createHash('sha256').update(bytes).digest('hex'), issued.sha256);
            rows.push({
                id: 'DOC-02',
                status: 'VALIDÉ',
                action: 'Relire la demande émise et télécharger son PDF archivé',
                obtained: { demande: issued.request, document: issued.id, reference: issued.number, octets: bytes.length, sha256: issued.sha256 },
                proofs: [await capture(issuer, 'specimen-emis'), path.basename(pdf)],
            });
            const guest = await newPage();
            assert.equal((await guest.goto(new URL(doc.verify, origin).href)).status(), 200);
            await guest.getByText(issued.number, { exact: false }).filter({ visible: true }).first().waitFor();
            const publicText = await guest.locator('body').innerText();
            assert.ok(publicText.includes('Valide') && !publicText.includes(data.entry.name) && !publicText.includes(data.entry.matricule));
            rows.push({
                id: 'DOC-03',
                status: 'VALIDÉ',
                action: 'Vérifier la référence publique sans session',
                obtained: 'Document valide, identité et matricule absents.',
                proofs: [await capture(guest, 'verification-publique')],
            });
            const outsider = await newPage();
            await login(outsider, fixture.students.law.email);
            const denied = await outsider.goto(
                origin + '/app/dashboard/student/official-documents/' + issued.reference + '?academic=' + fixture.students.law.entry,
            );
            assert.ok([403, 404].includes(denied.status()));
            rows.push({
                id: 'DOC-04',
                status: 'VALIDÉ',
                action: 'Ouvrir le PDF depuis un autre dossier étudiant',
                obtained: { http: denied.status() },
                proofs: [await capture(outsider, 'autre-etudiant-refuse')],
            });
        } else {
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
        }
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
