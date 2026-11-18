import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const hookSource = await readFile(new URL('../../resources/js/components/section/dashboard/enrollement/hooks/useEnrollmentForm.ts', import.meta.url), 'utf8');
const hookCode = ts.transpileModule(hookSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function mount(initial, post, visits = [], replacements = []) {
    const slots = [];
    let cursor = 0;
    const state = (initialValue) => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = typeof initialValue === 'function' ? initialValue() : initialValue;
        return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    };
    const module = { exports: {} };
    vm.runInNewContext(hookCode, {
        module, exports: module.exports, URL, FormData,
        route: (name, uuid) => `/app/dashboard/enrollments/${uuid}/${name.endsWith('.submit') ? 'submit' : name.endsWith('.edit') ? 'edit' : name}`,
        require(name) {
            if (name === 'react') return { useState: state, useRef: value => state({ current: value })[0], useEffect: () => undefined };
            if (name === 'axios') return { default: { post, isAxiosError: error => error?.isAxiosError === true } };
            if (name === '@inertiajs/react') return { router: { visit: url => visits.push(url), replace: options => replacements.push(options) } };
            throw new Error(`Unexpected hook import ${name}`);
        },
    });
    return { render() { cursor = 0; return module.exports.useEnrollmentForm(initial); } };
}

test('Le vrai hook sauvegarde puis reprend un brouillon dont le serveur a normalisé program en null', async () => {
    const requests = [];
    const document = { uuid: 'document-fictif-conserve', filename: 'identite-fictive.pdf', mime: 'application/pdf', size_bytes: 24 };
    const post = async (url, payload) => {
        requests.push({ url, payload });
        return { data: { ok: true, draft: { uuid: 'dossier-fictif-unique', last_step: payload.last_step, form_snapshot: { ...payload.form_snapshot, program: null } } } };
    };
    const replacements = [];
    const start = mount({ faculty_id: '1', level_id: '2', year_id: '3', academic_program_id: '', name: 'Candidat Fictif', email: 'candidat@example.test', program: '', documents: { identity: document } }, post, [], replacements);
    assert.equal(await start.render().saveProgress(2), true);
    const auth = { user: { email: 'candidat@example.test' } };
    const catalogs = [{ year_id: 3, faculty_id: 1, academic_program_id: null, level_id: 2 }];
    const history = replacements[0].props({ auth, admissionContexts: catalogs, draft: null });
    assert.equal(history.auth, auth);
    assert.equal(history.admissionContexts, catalogs);
    assert.equal(history.draft.uuid, 'dossier-fictif-unique');
    assert.equal(history.draft.last_step, 2);
    assert.equal(history.draft.form_snapshot.program, null);
    const saved = { ...history.draft.form_snapshot, uuid: history.draft.uuid, last_step: history.draft.last_step };
    const resumed = mount(saved, post, [], replacements);
    assert.equal(await resumed.render().saveProgress(3), true, 'Une valeur nullable serveur ne doit pas faire échouer la sauvegarde du brouillon repris.');
    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, '/app/dashboard/enrollments/save-progress');
    assert.equal(requests[1].url, '/app/dashboard/enrollments/save-progress');
    assert.equal(requests[0].payload.uuid, null);
    assert.equal(requests[1].payload.uuid, 'dossier-fictif-unique');
    assert.equal(requests[1].payload.form_snapshot.program, '');
    assert.equal(requests[1].payload.form_snapshot.academic_program_id, '');
    assert.equal(requests[1].payload.form_snapshot.documents.identity.uuid, document.uuid);
    assert.equal(requests[1].payload.form_snapshot.year_id, '3');
    assert.equal(replacements.length, 2);
    assert.equal(replacements[0].url, '/app/dashboard/enrollments/dossier-fictif-unique/edit');
    assert.equal(replacements[0].preserveState, true);
    assert.equal(replacements[0].preserveScroll, true);
    const lastHistory = replacements[1].props(history);
    assert.equal(lastHistory.draft.last_step, 3);
    const backNavigation = mount({ ...lastHistory.draft.form_snapshot, uuid: lastHistory.draft.uuid }, post).render();
    assert.equal(backNavigation.formData.name, 'Candidat Fictif');
    assert.equal(backNavigation.formData.documents.identity.uuid, document.uuid);
    assert.equal(backNavigation.uuid, 'dossier-fictif-unique');
});

test('Deux sauvegardes successives du même hook réutilisent immédiatement l’UUID attribué', async () => {
    const requests = [];
    const form = mount({}, async (url, payload) => {
        requests.push(payload);
        return { data: { ok: true, draft: { uuid: 'uuid-sans-doublon', form_snapshot: payload.form_snapshot } } };
    });
    const hook = form.render();
    assert.equal(await hook.saveProgress(1), true);
    assert.equal(await hook.saveProgress(1), true);
    assert.equal(requests[0].uuid, null);
    assert.equal(requests[1].uuid, 'uuid-sans-doublon');
});

test('Les libellés historiques restent liés à leurs identifiants après sauvegarde dans l’historique Inertia', async () => {
    const replacements = [];
    const snapshot = { year_id: '3', faculty_id: '1', academic_program_id: '', level_id: '2', program: 'Formation historique' };
    const context = { year: 'Année fermée', faculty: 'Faculté historique', program: null, level: 'Niveau historique', unavailable_reason: 'Campagne fermée.' };
    const history = { draft: { uuid: 'brouillon-historique', form_snapshot: snapshot, context } };
    const form = mount({ ...snapshot, uuid: 'brouillon-historique' }, async (url, payload) => ({ data: { ok: true, draft: { uuid: 'brouillon-historique', last_step: 1, form_snapshot: payload.form_snapshot } } }), [], replacements);
    const hook = form.render();
    assert.equal(await hook.saveProgress(1), true);
    assert.equal(replacements[0].props(history).draft.context, context);
    assert.equal(await hook.saveProgress(1, { ...hook.formData, year_id: '4' }), true);
    assert.equal('context' in replacements[1].props(history).draft, false, 'Les anciens libellés ne doivent pas désigner une nouvelle formation.');
});

test('Une erreur422 reste compréhensible près du champ et conserve les données du brouillon', async () => {
    const form = mount({ uuid: 'brouillon-422', name: 'Nom conservé', documents: { identity: { uuid: 'piece-conservee' } } }, async () => {
        throw { isAxiosError: true, response: { data: { errors: { 'form_snapshot.level_id': ['Ce niveau n’est plus disponible.'], 'form_snapshot.documents.identity.uuid': ['Vérifiez cette pièce.'] } } } };
    });
    assert.equal(await form.render().saveProgress(2), false);
    const current = form.render();
    assert.equal(current.fieldErrors.level_id, 'Ce niveau n’est plus disponible.');
    assert.equal(current.fieldErrors.identity, 'Vérifiez cette pièce.');
    assert.equal(current.formData.name, 'Nom conservé');
    assert.equal(current.formData.documents.identity.uuid, 'piece-conservee');
});

test('Le vrai hook accepte une sauvegarde partielle avec nom et email null sans validation finale', async () => {
    const requests = [];
    const post = async (url, payload) => {
        requests.push({ url, payload });
        return { data: { ok: true, draft: { uuid: 'brouillon-partiel', form_snapshot: payload.form_snapshot } } };
    };
    const form = mount({ uuid: 'brouillon-partiel', name: null, email: null, program: null, documents: null }, post);
    assert.equal(await form.render().saveProgress(1), true);
    assert.equal(requests[0].payload.form_snapshot.name, '');
    assert.equal(requests[0].payload.form_snapshot.email, '');
    assert.equal(requests[0].payload.form_snapshot.program, '');
    assert.deepEqual(Object.keys(requests[0].payload.form_snapshot.documents), []);
    assert.equal(requests[0].payload.last_step, 1);
});

test('Le vrai hook conserve POST pour sauvegarde et soumission du même UUID sans retour à la landing', async () => {
    const requests = [], visits = [];
    const post = async (url, payload) => {
        requests.push({ url, payload });
        return { data: url.endsWith('/submit') ? { ok: true, redirect: '/app/dashboard/enrollments/dossier-repris' } : { ok: true, draft: { uuid: 'dossier-repris', form_snapshot: payload.form_snapshot } } };
    };
    const form = mount({ uuid: 'dossier-repris', name: 'Fictif', email: 'fictif@example.test', program: 'Legacy' }, post, visits);
    assert.equal(await form.render().submitEnrollment(), true);
    assert.deepEqual(requests.map(request => request.url), ['/app/dashboard/enrollments/save-progress', '/app/dashboard/enrollments/dossier-repris/submit']);
    assert.equal(requests[0].payload.uuid, 'dossier-repris');
    assert.deepEqual(visits, ['/app/dashboard/enrollments/dossier-repris']);
});
