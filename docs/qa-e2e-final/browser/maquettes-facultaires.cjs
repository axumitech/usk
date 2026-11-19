/* global require, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./scenario.cjs');

run('maquettes-facultaires', async ({ login, visit, proof }) => {
    const root = fs.realpathSync(process.env.USK_RECETTE_V2_ROOT);
    assert.match(path.basename(root), /^usk_qa_e2e-/);
    const { password } = JSON.parse(fs.readFileSync(path.join(root, 'final-qa.json'), 'utf8'));
    const actors = [
        { email: 'dean.dr@usk.test', expected: /Droit/i, count: 1, id: 'FAC-DOYEN' },
        { email: 'vice-dean.med@usk.test', expected: /Médecine/i, count: 1, id: 'FAC-VICE-DOYEN' },
        { email: 'admin@usk.test', count: 5, id: 'FAC-INSTITUTION' },
    ];
    for (const actor of actors) {
        const page = await login(actor.email, password);
        const data = await visit(page, '/app/dashboard/admin/academic-structure?tab=curriculum');
        assert.equal(data.facultyPack.length, actor.count);
        assert.equal(data.faculties.length, actor.count);
        const visible = new Set(data.faculties.map((faculty) => Number(faculty.id)));
        for (const faculty of data.facultyPack) {
            assert.ok(visible.has(Number(faculty.id)));
            assert.ok(faculty.versions.length > 0);
            if (actor.expected) assert.match(faculty.name, actor.expected);
        }
        for (const department of data.departments) assert.ok(visible.has(Number(department.faculty_id)));
        await proof(page, actor.id, 'Ouvrir les maquettes annuelles avec son mandat universitaire.', {
            facultes: data.facultyPack.map((faculty) => faculty.name),
            programmes: data.programs.data.length,
        });
        await page.context().close();
    }
}).catch((error) => { console.error(error.message); process.exitCode = 1; });
