/* global process, require, __dirname */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs = require('node:fs');
const path = require('node:path');
const { createHarness } = require('./harness.cjs');

(async () => {
    const handoff = path.join(__dirname, 'teacher-assessment-result.json');
    if (!fs.existsSync(handoff)) throw new Error('Handoff enseignant encore indisponible : aucun scénario de jury exécuté.');
    const assessment = JSON.parse(fs.readFileSync(handoff, 'utf8'));
    if (!assessment.med?.handoff) throw new Error('Transmission des notes Médecine encore incomplète : aucun scénario de jury exécuté.');
    const h = await createHarness('results');
    h.fixture.assessment = assessment;
    let error;
    try {
        await require('./results-documents.cjs').run({ ...h, phase: 'results' });
    } catch (caught) {
        error = caught;
        process.stderr.write(String(caught.stack || caught));
    }
    const out = await h.finish(error);
    process.stdout.write(JSON.stringify({ success: out.success, records: out.records.length, javascript_errors: out.javascript_errors.length, error: out.error }));
    if (!out.success) process.exitCode = 1;
})().catch((error) => {
    process.stderr.write(String(error.stack || error));
    process.exitCode = 1;
});
