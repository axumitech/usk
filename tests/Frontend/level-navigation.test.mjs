import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
async function compile(path) {
    const source = await readFile(new URL(`../../resources/js/${path}`, import.meta.url), 'utf8');
    return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
}
const popupSource = await compile('components/form/LevelPopup.tsx');
const modalsSource = await compile('pages/dashboard/levels/hooks/useLevelModals.tsx');
const route = (name, params) => params ? `${name}/${params.id}?tab=${params.tab}` : name;

function load(source, imports) {
    const exports = {};
    vm.runInNewContext(source, {
        exports, File, FormData, route,
        require(name) {
            if (name.endsWith('.css')) return {};
            return imports[name] ?? require(name);
        },
    });
    return exports;
}
function find(node, predicate) {
    if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
    if (!node || typeof node !== 'object' || !node.props) return undefined;
    return predicate(node) ? node : find(node.props.children, predicate);
}

test('Modifier un niveau conserve son onglet, utilise PUT multipart et affiche une seule notification au succès', () => {
    let submission;
    let transform;
    let closed = 0;
    const notices = [];
    const { default: LevelPopup } = load(popupSource, {
        '@/components/admin/AdminModal': { default: () => null },
        '@/utils/sweetAlert': { default: { success: (message) => notices.push(message) } },
        'lucide-react': { Building2: () => null, GraduationCap: () => null, ImageIcon: () => null, Info: () => null, Upload: () => null, X: () => null },
        react: { useEffect() {}, useState: (initial) => [initial, () => {}], useRef: () => ({ current: null }) },
        '@inertiajs/react': { useForm: (data) => ({
            data, errors: {}, processing: false, clearErrors() {}, setError() {}, setData() {},
            transform: (callback) => { transform = callback; },
            post: (url, options) => { submission = { url, options, data: transform(data) }; },
        }) },
    });
    const page = LevelPopup({
        level: { id: 21, faculty_id: 7, title: 'Licence modifiée', code: 'L1', is_active: true },
        faculties: { data: [{ id: 7, name: 'Droit' }] }, returnTab: 'prof', onClose: () => { closed++; },
    });
    find(page, (node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(submission.url, 'dashboard.admin.levels.update/21?tab=prof');
    assert.equal(submission.options.forceFormData, true);
    assert.equal(submission.options.preserveScroll, true);
    assert.equal(submission.data._method, 'PUT');
    assert.equal(submission.data.title, 'Licence modifiée');
    assert.equal(closed, 0);
    assert.equal(notices.length, 0);
    submission.options.onSuccess({ props: { flash: { success: 'Niveau enregistré.' } } });
    assert.equal(closed, 1);
    assert.deepEqual(notices, ['Niveau enregistré.']);
});

test('Une erreur de détail laisse le formulaire ouvert, conserve le brouillon et ne produit aucun toast de succès', () => {
    const states = [];
    let cursor;
    let submission;
    const notices = [];
    const { useLevelModals: runModals } = load(modalsSource, {
        '../utils/levelUtils': { processOptionsValue: () => [] },
        '@/utils/sweetAlert': { default: { success: (message) => notices.push(message) } },
        react: { useState(initial) {
            const index = cursor++;
            if (!(index in states)) states[index] = initial;
            return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
        } },
        '@inertiajs/react': {
            useForm: (data) => ({ data }),
            router: { post: (url, data, options) => { submission = { url, data, options }; } },
        },
    });
    const render = () => { cursor = 0; return runModals({ id: 73, level_id: 21, faculty_id: 7 }, 'infos'); };
    const draft = { level_id: 21, language: 'Langue saisie', has_certificate: false, options: [] };
    render().openEditModal('language');
    render().saveEdit({ draft });
    assert.equal(submission.url, 'dashboard.admin.levels.details.update/73?tab=infos');
    assert.equal(submission.data.get('level_id'), '21');
    assert.equal(submission.data.get('language'), 'Langue saisie');
    submission.options.onStart();
    assert.equal(render().editSaving, true);
    submission.options.onError({ language: 'La langue dépasse la limite.' });
    submission.options.onFinish();
    assert.equal(render().isEditModalOpen, true);
    assert.equal(render().editSaving, false);
    assert.equal(render().editErrors.language, 'La langue dépasse la limite.');
    assert.equal(draft.language, 'Langue saisie');
    assert.equal(notices.length, 0);
    render().saveEdit({ draft });
    submission.options.onSuccess({ props: { flash: { success: 'Détail enregistré.' } } });
    assert.equal(render().isEditModalOpen, false);
    assert.deepEqual(notices, ['Détail enregistré.']);
});
