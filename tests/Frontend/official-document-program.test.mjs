import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
async function compile(path) {
    const source = await readFile(new URL(`../../resources/js/${path}`, import.meta.url), 'utf8');
    return ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
}
const administration = await compile('pages/dashboard/officialDocuments/Administration.tsx');
const academicForm = await compile('pages/dashboard/studentAcademic/AcademicForm.tsx');
const placeholder = () => null;

function load(source, mocks) {
    const module = { exports: {} };
    vm.runInNewContext(source, {
        module, exports: module.exports, route: (name) => name,
        require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    });
    return module.exports.default;
}
function elements(node, predicate) {
    if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
    if (!node || typeof node !== 'object' || !node.props) return [];
    return [...(predicate(node) ? [node] : []), ...elements(node.props.children, predicate)];
}

function catalog() {
    let spec;
    const Administration = load(administration, {
        react: { useState: (initial) => [initial, (value) => { spec = value; }] },
        '@inertiajs/react': { Head: placeholder, Link: placeholder, router: {} },
        '@/components/admin/PageHeading': placeholder,
        '@/components/admin/Pagination': placeholder,
        '@/components/layouts/Dashboard/Dashboard': placeholder,
        '@/pages/dashboard/studentAcademic/AcademicForm': placeholder,
        '@/components/student/OfficialDocumentCenter': { documentLabels: {}, documentReason: { name: 'reason', label: 'Motif' } },
    });
    const page = Administration({
        actor: 1, permissions: { manage: true, approve: false, issue: false },
        universities: [
            { id: 1, name: 'Université A', faculties: [{ id: 10, name: 'Droit' }, { id: 11, name: 'Médecine' }] },
            { id: 2, name: 'Université B', faculties: [{ id: 20, name: 'Sciences' }] },
        ],
        programs: [
            { id: 100, faculty_id: 10, name: 'Droit actuel' },
            { id: 101, faculty_id: 10, name: 'Droit historique' },
            { id: 110, faculty_id: 11, name: 'Médecine' },
            { id: 200, faculty_id: 20, name: 'Sciences' },
        ],
        types: { data: [] }, type: null, templates: null, filters: {}, entry: null, counts: {},
        requests: { data: [] }, documents: { data: [] }, archive_counts: {}, audit: [], result_archives: null,
    });
    const [add] = elements(page, (node) => node.type === 'button' && node.props.children === 'Ajouter un type');
    assert.ok(add, 'Le catalogue doit proposer la création du type documentaire.');
    add.props.onClick();

    let data;
    const submissions = [];
    const form = {
        get data() { return data; }, errors: {}, processing: false,
        setData(key, value) { data = typeof key === 'function' ? key(data) : { ...data, [key]: value }; },
        clearErrors() {},
        submit(method, action) { submissions.push({ method, action, data: { ...data } }); },
    };
    const AcademicForm = load(academicForm, {
        react: { useId: () => 'catalog-form', useRef: (value) => ({ current: value }), useEffect() {} },
        '@inertiajs/react': { useForm: (initial) => { data ??= initial; return form; } },
        '@/components/admin/AdminModal': placeholder,
        'lucide-react': { Plus: placeholder, Trash2: placeholder },
    });
    const render = () => AcademicForm({ spec, onClose() {}, onSuccess() {} });
    function input(name) {
        return elements(render(), (node) => node.props.id === `catalog-form-${name}`)[0];
    }
    const change = (name, value) => input(name).props.onChange({ target: { value }, currentTarget: { value } });
    const options = (name) => elements(input(name), (node) => node.type === 'option' && node.props.value !== '').map((node) => node.props.children);
    return {
        input, change, options, form, submissions,
        submit() { elements(render(), (node) => node.type === 'form')[0].props.onSubmit({ preventDefault() {} }); },
    };
}

test('Le catalogue propose les programmes nommés de la faculté choisie, y compris les historiques', () => {
    const dialog = catalog();
    assert.equal(dialog.input('program_id').type, 'select');
    assert.equal(dialog.input('program_id').props.required, false);
    assert.deepEqual(dialog.options('program_id'), []);
    dialog.change('university_id', '1');
    assert.deepEqual(dialog.options('faculty_id'), ['Droit', 'Médecine']);
    dialog.change('faculty_id', '10');
    assert.deepEqual(dialog.options('program_id'), ['Droit actuel', 'Droit historique']);
    dialog.change('program_id', '101');
    dialog.submit();
    assert.equal(dialog.submissions[0].method, 'post');
    assert.equal(dialog.submissions[0].action, 'dashboard.admin.official-documents.type');
    assert.equal(dialog.submissions[0].data.program_id, '101');
});

test('Changer de faculté ou établissement efface le programme sans perdre les autres saisies', () => {
    const dialog = catalog();
    dialog.change('name', 'Attestation institutionnelle');
    dialog.change('university_id', '1');
    dialog.change('faculty_id', '10');
    dialog.change('program_id', '100');
    dialog.change('faculty_id', '11');
    assert.equal(dialog.form.data.program_id, '');
    assert.deepEqual(dialog.options('program_id'), ['Médecine']);
    dialog.change('program_id', '110');
    dialog.change('university_id', '2');
    assert.equal(dialog.form.data.faculty_id, '');
    assert.equal(dialog.form.data.program_id, '');
    assert.deepEqual(dialog.options('faculty_id'), ['Sciences']);
    assert.deepEqual(dialog.options('program_id'), []);
    assert.equal(dialog.form.data.name, 'Attestation institutionnelle');
    dialog.change('faculty_id', '20');
    assert.deepEqual(dialog.options('program_id'), ['Sciences']);
    dialog.submit();
    assert.equal(dialog.submissions[0].data.program_id, '');
});

test('Une faculté incohérente avec l’établissement ne révèle aucune option de programme', () => {
    const dialog = catalog();
    dialog.change('university_id', '1');
    dialog.form.setData('faculty_id', '20');
    assert.deepEqual(dialog.options('program_id'), []);
});
