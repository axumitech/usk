import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const source = await readFile(new URL('../../resources/js/pages/dashboard/adminEnrollments/DocumentReview.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
const reasons = { unreadable: 'Document illisible.', incomplete: 'Document incomplet.', expired: 'Document expiré.', incorrect: 'Document incorrect.', inconsistent: 'Informations incohérentes.', non_compliant: 'Document non conforme.', other: 'Autre motif.' };
const labels = { pending: 'À examiner', accepted: 'Acceptée', rejected: 'Refusée', correction_requested: 'À corriger' };
const confirmedReview = {
    component: 'dashboard/adminEnrollments/Show',
    props: { enrollment: { id: 42 }, success: 'L’examen de cette pièce a été enregistré.' },
};

function elements(view) {
    if (!view || typeof view !== 'object') return [];
    if (Array.isArray(view)) return view.flatMap(elements);
    return [view, ...elements(view.props?.children)];
}

function setup({ processing = false, document: values = {}, enabled = true, closed = false } = {}) {
    const feedback = [];
    const requests = [];
    let form;
    const useForm = initial => {
        if (form) return form;
        let transform = data => data;
        form = {
            data: initial, processing, errors: {},
            setData(field, value) { this.data = { ...this.data, [field]: value }; },
            setError(field, message) { this.errors[field] = message; },
            clearErrors(...fields) { if (fields.length) fields.forEach(field => delete this.errors[field]); else this.errors = {}; },
            transform(callback) { transform = callback; },
            post(url, options) { requests.push({ url, options, payload: JSON.parse(JSON.stringify(transform(this.data))) }); },
        };
        return form;
    };
    const module = { exports: {} };
    vm.runInNewContext(outputText, { module, exports: module.exports, require(name) {
        if (name === '@inertiajs/react') return { useForm };
        if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
        if (name === './types') return { documentReviewLabels: labels };
        return require(name);
    } });
    const document = { uuid: 'proof-test', filename: 'Diplôme.pdf', review_status: 'pending', version: 1, ...values };
    const render = () => module.exports.default({ document, enrollmentId: 42, enabled, closed, reasons, onFeedback: (message, tone) => feedback.push({ message, tone }) });
    const find = predicate => elements(render()).find(predicate);
    render();
    return {
        feedback, requests, form, render, find,
        markup: () => renderToStaticMarkup(render()),
        verdict: value => find(item => item.type === 'input' && item.props.type === 'radio' && item.props.value === value).props.onChange(),
        reason: (code, checked = true) => find(item => item.type === 'input' && item.props.type === 'checkbox' && item.props.value === code).props.onChange({ target: { checked } }),
        detail: value => find(item => item.type === 'textarea').props.onChange({ target: { value } }),
        submit: () => find(item => item.type === 'form').props.onSubmit({ preventDefault() {} }),
    };
}
test('Le toast de succès attend la confirmation serveur du verdict', () => {
    const view = setup();
    view.verdict('accepted');
    view.submit();
    assert.equal(view.feedback.length, 0);
    assert.equal(view.requests[0].url, '/app/dashboard/admin/enrollments/42/documents/proof-test/review');
    view.requests[0].options.onSuccess(confirmedReview);
    assert.deepEqual(view.feedback, [{ message: confirmedReview.props.success, tone: 'success' }]);
});
test('Un retour vers un autre dossier ou sans message ne confirme pas le verdict', () => {
    const view = setup();
    view.verdict('accepted');
    view.submit();
    view.requests[0].options.onSuccess({ ...confirmedReview, props: { ...confirmedReview.props, enrollment: { id: 43 } } });
    view.requests[0].options.onSuccess({ ...confirmedReview, props: { enrollment: { id: 42 } } });
    assert.equal(view.feedback.length, 2);
    assert.ok(view.feedback.every(item => item.tone === 'error'));
    assert.match(view.render().props.className, /is-pending/);
    assert.equal(view.form.data.verdict, 'accepted');
});
test('Un échec affiche le motif et conserve la pièce dans son état enregistré', () => {
    const view = setup();
    view.verdict('accepted');
    view.submit();
    view.requests[0].options.onError({ review: 'Le dossier a été clôturé.' });
    assert.deepEqual(view.feedback, [{ message: 'Le dossier a été clôturé.', tone: 'error' }]);
    assert.match(view.render().props.className, /is-pending/);
});
test('Chaque enregistrement réussi peut déclencher une nouvelle confirmation', () => {
    const view = setup();
    view.submit();
    view.requests[0].options.onSuccess(confirmedReview);
    view.requests[0].options.onSuccess(confirmedReview);
    assert.equal(view.feedback.length, 2);
    assert.ok(view.feedback.every(item => item.tone === 'success'));
});
test('Un enregistrement en cours bloque les soumissions supplémentaires', () => {
    const view = setup({ processing: true });
    view.submit();
    assert.equal(view.requests.length, 0);
    assert.equal(view.feedback.length, 0);
});

test('Demander une correction permet plusieurs motifs prédéfinis sans imposer de texte', () => {
    const view = setup();
    view.verdict('correction_requested');
    assert.equal(elements(view.render()).filter(item => item.type === 'input' && item.props.type === 'checkbox').length, 7);
    view.reason('unreadable');
    view.reason('incomplete');
    assert.equal(view.find(item => item.type === 'textarea'), undefined);
    view.submit();
    assert.deepEqual(view.requests[0].payload, { verdict: 'correction_requested', reason_codes: ['unreadable', 'incomplete'], reason: null });
});

test('Autre motif affiche le texte nécessaire et ne transmet plus son contenu lorsqu’il est décoché', () => {
    const view = setup();
    view.verdict('rejected');
    view.reason('other');
    assert.ok(view.find(item => item.type === 'textarea').props.required);
    view.detail('  Justification particulière.  ');
    view.submit();
    assert.deepEqual(view.requests[0].payload, { verdict: 'rejected', reason_codes: ['other'], reason: 'Justification particulière.' });
    view.reason('other', false);
    view.reason('expired');
    assert.equal(view.find(item => item.type === 'textarea'), undefined);
    view.submit();
    assert.deepEqual(view.requests[1].payload, { verdict: 'rejected', reason_codes: ['expired'], reason: null });
});

test('Refus sans motif affiche une erreur inline et un toast avant tout POST', () => {
    const view = setup();
    view.verdict('rejected');
    view.submit();
    assert.equal(view.requests.length, 0);
    assert.equal(view.form.errors.reason_codes, 'Sélectionnez au moins un motif.');
    assert.match(view.markup(), /role="alert"[^>]*>Sélectionnez au moins un motif/);
    assert.equal(view.feedback[0].tone, 'error');
});

test('Le texte Autre motif respecte les limites de trois à mille caractères', () => {
    const view = setup();
    view.verdict('rejected');
    view.reason('other');
    for (const detail of ['  a ', 'x'.repeat(1001)]) {
        view.detail(detail);
        view.submit();
        assert.equal(view.requests.length, 0);
        assert.equal(view.form.errors.reason, 'Précisez l’autre motif en 3 à 1000 caractères.');
        assert.match(view.markup(), /role="alert"[^>]*>Précisez l’autre motif/);
    }
    view.detail('Cas');
    view.submit();
    assert.equal(view.requests.length, 1);
});

test('Accepter et À examiner ne demandent aucun texte et ne transmettent aucun choix masqué', () => {
    const view = setup({ document: { review_status: 'rejected', review_reason_codes: ['other', 'incorrect'], review_reason_detail: 'Détail conservé' } });
    for (const verdict of ['accepted', 'pending']) {
        view.verdict(verdict);
        assert.equal(view.find(item => item.type === 'textarea'), undefined);
        assert.equal(view.find(item => item.type === 'input' && item.props.type === 'checkbox'), undefined);
        view.submit();
        assert.deepEqual(view.requests.at(-1).payload, { verdict, reason_codes: [], reason: null });
    }
});

test('Une ancienne décision garde son commentaire visible sans le transformer en saisie ou motif choisi', () => {
    const view = setup({ document: { review_status: 'rejected', review_comment: 'Ancien commentaire conservé.' } });
    assert.match(view.markup(), /Ancien commentaire conservé/);
    assert.equal(view.form.data.reason, '');
    assert.equal(view.form.data.reason_codes.length, 0);
    assert.equal(view.find(item => item.type === 'textarea'), undefined);
    view.submit();
    assert.equal(view.requests.length, 0);
    view.reason('incorrect');
    view.submit();
    assert.deepEqual(view.requests[0].payload, { verdict: 'rejected', reason_codes: ['incorrect'], reason: null });
});

test('Les motifs structurés enregistrés sont repris sans réutiliser le commentaire composé', () => {
    const view = setup({ document: { review_status: 'correction_requested', review_comment: 'Document illisible. Autre motif : exemple.', review_reason_codes: ['unreadable', 'other'], review_reason_detail: 'Exemple précis' } });
    assert.equal(view.find(item => item.type === 'input' && item.props.value === 'unreadable').props.checked, true);
    assert.equal(view.find(item => item.type === 'textarea').props.value, 'Exemple précis');
    view.submit();
    assert.deepEqual(view.requests[0].payload, { verdict: 'correction_requested', reason_codes: ['unreadable', 'other'], reason: 'Exemple précis' });
});

test('Un dossier clôturé conserve le commentaire historique en lecture seule', () => {
    const view = setup({ enabled: false, closed: true, document: { review_status: 'rejected', review_comment: 'Décision historique lisible.' } });
    assert.match(view.markup(), /Décision historique lisible/);
    assert.equal(view.find(item => item.type === 'form'), undefined);
});
