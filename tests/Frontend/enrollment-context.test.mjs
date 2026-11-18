import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = await readFile(new URL('../../resources/js/components/section/dashboard/enrollement/utils/admissionContexts.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { admissionOptions, changeAdmissionContext } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const contexts = [
    { year_id: 1, faculty_id: 1, academic_program_id: 10, level_id: 100 },
    { year_id: 1, faculty_id: 1, academic_program_id: null, level_id: 101 },
    { year_id: 2, faculty_id: 1, academic_program_id: 10, level_id: 100 },
    { year_id: 2, faculty_id: 2, academic_program_id: null, level_id: 200 },
    { year_id: 3, faculty_id: 1, academic_program_id: 10, level_id: 102 },
];
const form = { year_id: '1', faculty_id: '1', academic_program_id: '10', level_id: '100', program: 'Projet conservé', name: 'Nom conservé', email: 'fictif@example.test', documents: { identity: { uuid: 'piece-conservee' } } };

test('La cascade utilise les combinaisons de campagne et non le seul catalogue des niveaux', () => {
    const unselected = admissionOptions(contexts, { ...form, academic_program_id: '', level_id: '' }, false);
    assert.deepEqual(unselected.facultyIds, ['1']);
    assert.deepEqual(unselected.programIds, ['10']);
    assert.equal(unselected.allowsLegacy, true);
    assert.equal(unselected.hasProgramChoice, false);
    assert.deepEqual(unselected.levelIds, []);
    assert.deepEqual(admissionOptions(contexts, form, false).levelIds, ['100']);
    assert.equal(admissionOptions(contexts, { ...form, level_id: '101' }, false).valid, false);
});

test('Un changement d’année préserve tous les choix encore valides et les pièces', () => {
    const changed = changeAdmissionContext(form, 'year_id', '2', contexts, false);
    assert.equal(changed.form.faculty_id, '1');
    assert.equal(changed.form.academic_program_id, '10');
    assert.equal(changed.form.level_id, '100');
    assert.equal(changed.form.documents, form.documents);
    assert.equal(changed.form.name, form.name);
    assert.deepEqual(changed.cleared, []);
});

test('Seul le niveau devenu indisponible est vidé après changement de campagne', () => {
    const changed = changeAdmissionContext(form, 'year_id', '3', contexts, false);
    assert.equal(changed.form.faculty_id, '1');
    assert.equal(changed.form.academic_program_id, '10');
    assert.equal(changed.form.level_id, '');
    assert.equal(changed.form.program, form.program);
    assert.equal(changed.form.documents, form.documents);
    assert.deepEqual(changed.cleared, ['niveau']);
});

test('Une formation sans programme officiel reste un choix explicite dans une faculté mixte', () => {
    const changed = changeAdmissionContext(form, 'academic_program_id', '', contexts, false);
    assert.equal(changed.legacySelected, true);
    assert.equal(changed.form.academic_program_id, '');
    assert.equal(changed.form.level_id, '');
    assert.deepEqual(admissionOptions(contexts, changed.form, true).levelIds, ['101']);
    assert.equal(admissionOptions(contexts, { ...changed.form, level_id: '101' }, true).valid, true);
});

test('Un ancien contexte ne remplace jamais son année à la simple lecture', () => {
    const saved = { ...form, year_id: '99' };
    assert.equal(admissionOptions(contexts, saved, false).valid, false);
    assert.equal(saved.year_id, '99');
    assert.equal(saved.faculty_id, '1');
    assert.equal(saved.documents.identity.uuid, 'piece-conservee');
});

const require = createRequire(import.meta.url);
async function load(name) {
    const code = ts.transpileModule(await readFile(new URL(`../../resources/js/components/section/dashboard/enrollement/components/Steps/${name}.tsx`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, require(name) {
        if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
        if (name === '../DocumentUpload') return { default: ({ doc }) => React.createElement('div', {}, doc.label) };
        return require(name);
    } });
    return module.exports.default;
}
const Step1 = await load('Step1Faculty');
const Step2 = await load('Step2Personal');
const Step3 = await load('Step3Academic');

test('La première étape affiche année, faculté, programme puis niveau et propose la voie sans programme officiel', () => {
    const html = renderToStaticMarkup(React.createElement(Step1, {
        years: [{ id: '1', name: 'Année ouverte' }], faculties: [{ id: '1', name: 'Faculté' }], availablePrograms: [{ id: 10, name: 'Programme', code: 'P10' }],
        availableLevels: [{ id: '100', name: 'Niveau' }], allowsLegacy: true, hasProgramChoice: true, formData: form, errors: {},
        onContextChange: () => undefined, onProgramTextChange: () => undefined,
    }));
    assert.ok(html.indexOf('id="year_id"') < html.indexOf('id="faculty_id"'));
    assert.ok(html.indexOf('id="faculty_id"') < html.indexOf('id="academic_program_id"'));
    assert.ok(html.indexOf('id="academic_program_id"') < html.indexOf('id="level_id"'));
    assert.match(html, /<option value="">Sans programme officiel/);
    assert.doesNotMatch(html, /id="program"/);
});

test('Les coordonnées et les pièces ne sont pas demandées deux fois', () => {
    const props = { formData: form, errors: {}, requirements: { personal_info: [{ key: 'identity', label: 'Identité requise' }], academic_info: [{ key: 'diploma', label: 'Diplôme requis' }] },
        handleFieldChange: () => undefined, handleFileChange: () => () => undefined, removeFile: () => undefined, previews: {}, uploadingKeys: [] };
    const personal = renderToStaticMarkup(React.createElement(Step2, props));
    const documents = renderToStaticMarkup(React.createElement(Step3, props));
    assert.match(personal, /id="name"/);
    assert.doesNotMatch(personal, /Identité requise|Diplôme requis/);
    assert.match(documents, /Identité requise/);
    assert.match(documents, /Diplôme requis/);
    assert.doesNotMatch(documents, /id="program"|id="name"|id="email"/);
});
