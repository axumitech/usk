import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
async function load(path, imports = {}) {
    const source = await readFile(new URL(`../../resources/js/${path}`, import.meta.url), 'utf8');
    const module = { exports: {} };
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(output, { module, exports: module.exports, route: (name, value) => `/route/${name}?${typeof value === 'object' ? new URLSearchParams(value) : `id=${value}`}`, URLSearchParams, crypto: { randomUUID: () => 'operation-key' }, require(name) {
        if (name in imports) return imports[name];
        if (name.endsWith('.css')) return {};
        if (name === '@inertiajs/react') return { Head: () => null, Link: ({ children, preserveScroll, ...props }) => React.createElement('a', { ...props, 'data-inertia': 'true', 'data-preserve-scroll': preserveScroll || undefined }, children), useForm: data => ({ data, errors: {}, processing: false }), usePage: () => ({ props: {} }) };
        if (name === '@/components/layouts/Dashboard/Dashboard') return { default: ({ children }) => React.createElement('div', {}, children) };
        if (name === '../studentAcademic/AcademicForm' || name === '@/components/admin/AdminModal') return { default: () => null };
        if (name === '@/components/admin/Pagination' || name === '@/components/admin/FeedbackToast') return { default: () => null };
        if (name === '@/hooks/use-panel-fade') return { usePanelFade: React.useRef };
        if (name === '@/components/student/types') return { labels: { confirmed: 'Confirmée' }, money: (value, currency) => `${value} ${currency}` };
        if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
        return require(name);
    } });
    return module.exports;
}

const charts = await load('pages/dashboard/finance/FinanceCharts.tsx');
const overview = await load('pages/dashboard/finance/FinanceOverview.tsx', { './FinanceCharts': charts });
const enrollment = await load('lib/studentEnrollment.ts');
const accountOverview = await load('pages/dashboard/finance/FinanceAccountOverview.tsx', { '@/lib/studentEnrollment': enrollment });
const installmentDetails = await load('components/student/FirstInstallmentDetails.tsx', {
    '@/lib/studentEnrollment': enrollment,
    './types': { money: (value, currency) => `${value} ${currency}` },
});
const installmentImport = { '@/components/student/FirstInstallmentDetails': installmentDetails };
const proofHistory = await load('components/student/PaymentProofHistory.tsx', { './types': { money: (value, currency) => `${value} ${currency}` } });
const accountImports = { ...installmentImport, './FinanceAccountOverview': accountOverview, '@/components/student/PaymentProofHistory': proofHistory };
const account = await load('pages/dashboard/finance/FinanceAccount.tsx', accountImports);
const Confirmations = (await load('pages/dashboard/finance/Confirmations.tsx', installmentImport)).default;
let capturedPaymentForm;
const AccountActions = (await load('pages/dashboard/finance/FinanceAccount.tsx', {
    ...accountImports,
    react: { useState: (value) => [value, (updated) => { capturedPaymentForm = updated; }] },
})).default;
const Finance = (await load('pages/dashboard/finance/Index.tsx', { './FinanceOverview': overview, './FinanceAccount': account })).default;
const AcademicForm = (await load('pages/dashboard/studentAcademic/AcademicForm.tsx', {
    '@/components/admin/AdminModal': { default: ({ children }) => children },
})).default;
let capturedTariffForm;
const TariffActions = (await load('pages/dashboard/finance/Tariffs.tsx', {
    '@/lib/studentEnrollment': enrollment,
    react: { useState: (value) => [value, (updated) => { capturedTariffForm = updated; }] },
})).default;

function findButton(element, text) {
    if (!React.isValidElement(element)) return undefined;
    const children = React.Children.toArray(element.props.children);
    if (element.type === 'button' && children.some((child) => typeof child === 'string' && child.trim() === text)) {
        return element;
    }
    return children.map((child) => findButton(child, text)).find(Boolean);
}

test('Les frais complémentaires exigent un périmètre et ciblent une seule faculté ou un seul niveau', () => {
    const faculty = { id: 2, name: 'Médecine' };
    const level = { id: 3, title: 'Première Licence', faculty_id: 2, faculty };
    const props = {
        tariffs: { data: [], total: 0 },
        filters: { year: 1 },
        years: [{ id: 1, title: '2026-2027' }],
        faculties: [faculty],
        levels: [level],
        programs: [],
        cycles: [],
        currencies: ['USD'],
    };

    const buttonLabel = 'Ajouter des frais complémentaires';
    findButton(TariffActions({ ...props, canScopeUniversity: true }), buttonLabel).props.onClick();
    assert.equal(capturedTariffForm.values.automatic, true);
    assert.equal(capturedTariffForm.values.category, 'all');
    const fields = Object.fromEntries(capturedTariffForm.fields.map((field) => [field.name, field]));
    assert.equal(fields.fee_scope.required, true);
    assert.equal(fields.fee_scope.value, '');
    assert.deepEqual(Array.from(fields.fee_scope.options, ({ value }) => value), ['university', 'faculty', 'level']);
    assert.deepEqual(Array.from(fields.fee_scope.clears), ['faculty_id', 'level_id']);
    assert.equal(fields.faculty_id.required, true);
    assert.equal(fields.faculty_id.visibleFor({ fee_scope: 'faculty' }), true);
    assert.equal(fields.faculty_id.visibleFor({ fee_scope: 'university' }), false);
    assert.equal(fields.level_id.required, true);
    assert.equal(fields.level_id.visibleFor({ fee_scope: 'level' }), true);
    assert.equal(fields.level_id.visibleFor({ fee_scope: 'faculty' }), false);
    assert.equal(fields.valid_from.label, 'Date de début d’application');
    assert.equal(fields.valid_from.required, true);

    const ancillary = renderToStaticMarkup(React.createElement(AcademicForm, { spec: capturedTariffForm }));
    assert.match(ancillary, /Date limite \(facultative\)<input type="date" value=""/);
    assert.match(ancillary, /Montant \(USD\)<input type="number" min="0" step="0\.01" required/);

    findButton(TariffActions({ ...props, canScopeUniversity: true }), 'Créer un barème').props.onClick();
    const tuition = renderToStaticMarkup(React.createElement(AcademicForm, { spec: capturedTariffForm }));
    assert.match(tuition, /Échéance 1<input type="date" required/);

    findButton(TariffActions({ ...props, canScopeUniversity: false }), buttonLabel).props.onClick();
    assert.deepEqual(Array.from(capturedTariffForm.fields.find(({ name }) => name === 'fee_scope').options, ({ value }) => value), ['faculty', 'level']);

    findButton(TariffActions({ ...props, canScopeUniversity: true }), 'Ajouter une fiche d’enrôlement').props.onClick();
    const enrollmentFee = Object.fromEntries(capturedTariffForm.fields.map((field) => [field.name, field]));
    assert.equal(enrollmentFee.title.value, 'Fiche d’enrôlement');
    assert.equal(enrollmentFee.kind.value, 'fiche_enrolement');
    assert.equal(enrollmentFee.fee_scope.value, '');
    assert.equal(enrollmentFee.schedule.value[0].amount, '');
});

test('L’activation d’un frais complémentaire annonce son périmètre', () => {
    const faculty = { id: 2, name: 'Faculté de Médecine' };
    const tariff = {
        id: 2, faculty, title: 'Bibliothèque', kind: 'bibliotheque', category: 'all',
        currency: 'USD', automatic: true, status: 'draft', schedule: [{ amount_cents: 1000, due_at: null }],
        valid_from: '2026-11-16', revision: 'revision',
    };
    const page = TariffActions({
        tariffs: { data: [tariff], total: 1 },
        filters: { year: 1 },
        years: [{ id: 1, title: '2026-2027' }],
        faculties: [faculty],
        levels: [],
        programs: [],
        cycles: [],
        currencies: ['USD'],
        canScopeUniversity: true,
    });
    findButton(page, 'Activer le barème').props.onClick();
    assert.match(capturedTariffForm.description, /^Faculté de Médecine · 1000 USD par inscription\./);
    assert.match(renderToStaticMarkup(page), /Montant 1<\/span><span class="finance-tariff-no-deadline">Sans date limite/);
    findButton(page, 'Modifier').props.onClick();
    const edited = renderToStaticMarkup(React.createElement(AcademicForm, { spec: capturedTariffForm }));
    assert.match(edited, /Date limite \(facultative\)<input type="date" value=""/);
    assert.match(edited, /value="10\.00"/);
});

const page = { entries: {data: []}, selected: null, filters: {}, statement: null, totals: [], cashflow: {start_month: '2025-12', end_month: '2026-11', series: []}, breakdowns: {faculties: [], fee_kinds: []}, obligations: [], adjustments: null, payments: null, refunds: null, tariffs: {data: []}, years: [], faculties: [], programs: [], levels: [], cycles: [], currencies: ['USD', 'CDF'], methods: ['cash', 'bank_transfer'], dualControl: false, preview: null };
const total = (currency, amount) => ({currency, billed_cents: amount, waived_cents: 0, due_cents: amount, gross_cents: 0, refunded_cents: 0, net_cents: 0, balance_cents: amount, overdue_cents: 0, pending_cents: 0, cancelled_cents: 0, legacy_reversal_cents: 0});
test('Le versement permet de choisir les frais facturés et indique le solde de chacun', () => {
    const statement = {
        balance: { currency: 'USD', assessed: true },
        kind_titles: { tuition: 'Frais académiques', fiche_enrolement: 'Fiche d’enrôlement', library: 'Bibliothèque' },
        kinds: {
            tuition: { currency: 'USD', balance_cents: 45000 },
            fiche_enrolement: { currency: 'USD', balance_cents: 1500 },
            library: { currency: 'USD', balance_cents: 0 },
        },
        schedules: {},
        obligations: [],
    };
    const accountPage = AccountActions({
        ...page,
        filters: { q: 'Étudiant', from_proofs: 1, unrelated: 'ignoré' },
        selected: { id: 1, name: 'Étudiant', year: '2026-2027' },
        accountBackUrl: '/finance',
        accountBackLabel: 'Comptes étudiants',
        enrollmentConfirmation: { status: 'confirmed', canConfirm: false },
        pendingPaymentCount: 0,
        statement,
        obligations: [{ kind: 'tuition' }, { kind: 'tuition' }, { kind: 'fiche_enrolement' }, { kind: 'library' }],
    });
    findButton(accountPage, 'Saisir un versement').props.onClick();
    assert.equal(capturedPaymentForm.requireSuccessFlash, true);
    assert.equal(capturedPaymentForm.values.operation_id, 'operation-key');
    assert.equal(capturedPaymentForm.values.finance_return, true);
    assert.equal(capturedPaymentForm.values.q, 'Étudiant');
    assert.equal(capturedPaymentForm.values.from_proofs, 1);
    assert.equal(capturedPaymentForm.values.unrelated, undefined);
    const fields = Object.fromEntries(capturedPaymentForm.fields.map((field) => [field.name, field]));
    assert.equal(fields.kind.value, '');
    assert.equal(fields.amount.value, '');
    assert.deepEqual(Array.from(fields.kind.options, ({ value, label }) => [value, label]), [
        ['tuition', 'Frais académiques · 45000 USD restant à payer'],
        ['fiche_enrolement', 'Fiche d’enrôlement · 1500 USD restant à payer'],
        ['library', 'Bibliothèque · Soldé'],
        ['unallocated', 'Versement général à affecter après confirmation'],
    ]);
});
test('L’export CSV utilise un lien navigateur et conserve les filtres', () => {
    const html = renderToStaticMarkup(React.createElement(Finance, { ...page, filters: { year: 4, currency: 'USD' } }));
    assert.match(html, /<a[^>]*href="\/route\/dashboard\.admin\.finance\.export\?year=4&amp;currency=USD">\s*Exporter les totaux CSV<\/a>/);
});
test('Le classeur Excel est téléchargé depuis le périmètre affiché', () => {
    const html = renderToStaticMarkup(React.createElement(Finance, { ...page, filters: { year: 4, faculty: 2, program: 7, q: 'Kasa' } }));
    assert.match(html, /<a class="finance-export finance-export-xlsx" href="\/route\/dashboard\.admin\.finance\.export-xlsx\?year=4&amp;faculty=2&amp;program=7&amp;q=Kasa">\s*Exporter le rapport Excel<\/a>/);
});
test('Les indicateurs affichent chaque devise sans fabriquer un total converti', () => {
    const html = renderToStaticMarkup(React.createElement(Finance, {...page, totals: [total('USD', 10000), total('CDF', 25000)]}));
    assert.match(html, /10000 USD/); assert.match(html, /25000 CDF/); assert.doesNotMatch(html, /35000/);
});
test('Les flux mensuels présentent les remboursements et un flux net négatif, avec les valeurs en tableau', () => {
    const html = renderToStaticMarkup(React.createElement(Finance, {
        ...page, totals: [total('USD', 10000)],
        cashflow: {
            ...page.cashflow,
            series: [{ currency: 'USD', months: [
                { month: '2026-10', gross_cents: 6000, refunded_cents: 0, net_cents: 6000 },
                { month: '2026-11', gross_cents: 0, refunded_cents: 2400, net_cents: -2400 },
            ] }],
        },
    }));
    assert.match(html, /aria-label="nov 2026" title="novembre 2026"/);
    assert.match(html, /Voir les montants par mois/);
    assert.match(html, /<td>-2400 USD<\/td>/);
    assert.match(html, /Couverture des frais/);
});
test('Les graphiques de recouvrement affichent le détail dans la devise active', () => {
    const row = { ...total('USD', 10000), covered_cents: 4000, balance_cents: 6000, overdue_cents: 2500 };
    const html = renderToStaticMarkup(React.createElement(Finance, {
        ...page, totals: [row, total('CDF', 25000)],
        breakdowns: {
            faculties: [
                { ...row, faculty_id: 2, faculty_name: 'Droit' },
                { ...row, currency: 'CDF', faculty_id: 3, faculty_name: 'Médecine' },
            ],
            fee_kinds: [{ ...row, kind: 'tuition' }],
        },
    }));
    assert.match(html, /data-finance-chart="finance-faculties"/);
    assert.match(html, /data-finance-chart="finance-fees"/);
    assert.match(html, />Droit</);
    assert.doesNotMatch(html, />Médecine</);
    assert.match(html, />Scolarité</);
    assert.match(html, />2500 USD</);
});
test('Le relevé est prévisualisé et exige une sélection explicite avant rapprochement', () => {
    const html = renderToStaticMarkup(React.createElement(Finance, {...page, preview: {account: 'Banque', rows: [{bank_reference: 'OP1', payment_reference: 'PAY1', amount_cents: 5000, currency: 'USD', date: '2026-11-07', state: 'match'}]}}));
    assert.match(html, /Prévisualiser sans modifier les paiements/); assert.match(html, /Confirmer les correspondances sélectionnées/);
    assert.doesNotMatch(html, /checked=""/); assert.match(html, /disabled=""/);
});
test('Le compte ouvre sur les tranches détaillées et la confirmation du versement', () => {
    const balance = {currency: 'USD', assessed: true, total_cents: 10000, due_cents: 10000, paid_cents: 1500, pending_cents: 1000, waived_cents: 0, balance_cents: 8500, credit_cents: 0};
    const first = {id: 1, kind: 'tuition', title: 'Première tranche', currency: 'USD', amount_cents: 6000, remaining_cents: 4500, due_at: '2026-12-10', status: 'partial'};
    const second = {...first, id: 2, title: 'Deuxième tranche', amount_cents: 4000, remaining_cents: 4000, due_at: '2027-02-10', status: 'upcoming'};
    const html = renderToStaticMarkup(React.createElement(Finance, {
        ...page,
        selected: {id: 1, name: 'Étudiant', year: '2026-2027'},
        accountBackUrl: '/confirmations?q=Nom',
        accountBackLabel: 'Inscriptions en attente',
        filters: {from_confirmations: 1},
        enrollmentConfirmation: {status: 'pending_confirmation', canConfirm: false, blocker: 'Première tranche à couvrir'},
        pendingPaymentCount: 1,
        statement: {balance, schedules: {tuition: [first, second]}, obligations: [], kinds: {tuition: balance}, kind_titles: {tuition: 'Frais académiques'}},
        payments: {data: [{id: 1, reference: 'PENDING', amount_cents: 1000, currency: 'USD', kind: 'tuition', method: 'cash', status: 'pending', can_confirm: true, confirmed_at: null}]},
    }));
    assert.match(html, /href="\/confirmations\?q=Nom"/);
    assert.match(html, /Première tranche/);
    assert.match(html, /Deuxième tranche/);
    assert.match(html, /4500 USD/);
    assert.match(html, /1500 USD/);
    assert.match(html, /Confirmer le versement<\/button>/);
    assert.doesNotMatch(html, /Finances universitaires|Consulter le reçu|Demander un remboursement/);
});
test('Le compte distingue les justificatifs à contrôler des versements déjà saisis et explique le solde à établir', () => {
    const proof = {
        kind_label: 'Frais académiques',
        amount_cents: 10000,
        currency: 'USD',
        method: 'bank_transfer',
        status: 'pending',
        submitted_at: '2026-11-16T10:00:00Z',
        review_note: null,
    };
    const html = renderToStaticMarkup(React.createElement(Finance, {
        ...page,
        selected: {id: 1, name: 'Étudiant', year: '2026-2027'},
        accountBackUrl: '/payment-proofs',
        accountBackLabel: 'Justificatifs de paiement',
        filters: {from_proofs: 1},
        enrollmentConfirmation: {status: 'pending_confirmation', canConfirm: false, blocker: 'Première tranche à couvrir'},
        pendingPaymentCount: 1,
        statement: {
            balance: {currency: 'USD', assessed: false, due_cents: 0, balance_cents: 0, credit_cents: 0},
            schedules: {}, obligations: [], kinds: {}, kind_titles: {},
        },
        paymentProofs: [
            {...proof, id: 1, reference: 'EN-ATTENTE', download_url: '/account/proof/1/download', review_url: '/account/proof/1/review', payment_id: null},
            {...proof, id: 2, reference: 'DEJA-SAISI', download_url: '/account/proof/2/download', review_url: null, payment_id: 21},
            {
                ...proof, id: 3, reference: 'ANNULE', status: 'accepted', proof_status: 'accepted', payment_status: 'cancelled',
                download_url: '/account/proof/3/download', review_url: null, payment_id: 22,
                history: [
                    { event: 'proof_submitted', at: '2026-11-16T10:00:00Z' },
                    { event: 'proof_accepted', at: '2026-11-16T11:00:00Z' },
                    { event: 'payment_cancelled', at: '2026-11-17T09:00:00Z' },
                ],
            },
        ],
    }));
    assert.match(html, /href="\/payment-proofs"/);
    assert.match(html, /À établir/);
    assert.match(html, /Aucun barème actif applicable/);
    assert.match(html, /<a class="admin-secondary" href="\/account\/proof\/1\/download"/);
    assert.match(html, /aria-label="Valider le justificatif EN-ATTENTE"/);
    assert.match(html, /aria-label="Refuser le justificatif EN-ATTENTE"/);
    assert.doesNotMatch(html, /aria-label="Valider le justificatif DEJA-SAISI"/);
    assert.match(html, /Versement à confirmer/);
    const cancelled = html.match(/id="justificatif-3"[\s\S]+?<\/li><\/ul>/)?.[0] ?? '';
    assert.match(cancelled, /Justificatif accepté/);
    assert.match(cancelled, /Versement annulé/);
    assert.match(cancelled, /<time dateTime="2026-11-17T09:00:00Z"/);
    assert.doesNotMatch(cancelled, /Justificatif refusé/);
});

test('Le formulaire financier garde les valeurs si le serveur ne confirme pas la réussite', async () => {
    let visit;
    let notice;
    const errors = new Map();
    const Form = (await load('pages/dashboard/studentAcademic/AcademicForm.tsx', {
        react: { useId: () => 'finance-mutation', useRef: (value) => ({ current: value }), useEffect() {} },
        '@inertiajs/react': {
            useForm(data) {
                return {
                    data, errors: { reason: 'Précisez le motif.' }, processing: false,
                    submit(method, url, options) { visit = { method, url, options, data }; },
                    setError(field, error) { errors.set(field, error); },
                    clearErrors(field) { errors.delete(field); },
                };
            },
        },
        '@/components/admin/AdminModal': { default: ({ children }) => children },
    })).default;
    const spec = {
        title: 'Valider le justificatif', description: 'Vérification comptable', action: '/proof/review', requireSuccessFlash: true,
        fields: [{ name: 'reason', label: 'Précisez le motif', type: 'textarea', value: 'Motif saisi', minLength: 10, maxLength: 1000 }],
        values: { decision: 'reject', reason_code: 'other' },
    };
    const element = Form({ spec, onSuccess: (msg) => { notice = msg; } });
    const html = renderToStaticMarkup(element);
    assert.match(html, /<textarea[^>]+aria-describedby="finance-mutation-reason-error"[^>]+minLength="10"/);
    assert.match(html, /id="finance-mutation-reason-error" role="alert">Précisez le motif\./);
    element.props.children.props.onSubmit({ preventDefault() {} });
    assert.equal(visit.data.reason, 'Motif saisi');
    visit.options.onSuccess({ props: {} });
    assert.equal(notice, undefined);
    assert.match(errors.get('_response'), /n’a pas été confirmé/);
    visit.options.onSuccess({ props: { flash: { success: 'Justificatif refusé.' } } });
    assert.equal(notice, 'Justificatif refusé.');
});

test('La file expose le solde de première tranche et respecte le blocage de confirmation', () => {
    const base = {
        id: 7, name: 'Étudiant', level: 'L1', year: '2026-2027', faculty: 'Sciences',
        canConfirm: true, context: 'enrollment-context',
    };
    const tranche = { status: 'due', currency: 'USD', amount_cents: 2500, paid_cents: 0, waived_cents: 0, remaining_cents: 2500 };
    const renderQueue = (entry) => renderToStaticMarkup(React.createElement(Confirmations, {
        entries: { data: [{ ...base, ...entry }], total: 1, current_page: 1 }, filters: {}, requiresPayment: true,
    }));
    const blocked = renderQueue({ blocker: 'Première tranche à couvrir', first_installment: tranche });
    assert.match(blocked, /Reste dû sur cette tranche<\/dt><dd[^>]*>2500 USD/);
    assert.doesNotMatch(blocked, /Confirmer l’inscription<\/button>/);
    assert.match(
        renderQueue({ blocker: null, first_installment: { ...tranche, status: 'covered', paid_cents: 2500, remaining_cents: 0 } }),
        /Confirmer l’inscription<\/button>/,
    );
});

test('La file automatique affiche le seuil et ne propose aucune confirmation académique manuelle', () => {
    const html = renderToStaticMarkup(React.createElement(Confirmations, {
        entries: { data: [{
            id: 7, name: 'Étudiant', level: 'L1', year: '2026-2027', faculty: 'Sciences', canConfirm: true, blocker: null,
            first_installment: {
                status: 'due', currency: 'USD', amount_cents: 10000, paid_cents: 3000, waived_cents: 0, remaining_cents: 7000,
                activation: { automatic: true, percentage: 30, base_cents: 10000, required_cents: 3000, remaining_cents: 0, eligible: true, blocker: null },
            },
        }], total: 1, current_page: 1 }, filters: {}, requiresPayment: true, automaticConfirmation: true,
    }));
    assert.match(html, /Suivez les activations automatiques/);
    assert.match(html, /Seuil d’activation initiale<\/dt><dd[^>]*>30 %/);
    assert.match(html, /Reste dû sur cette tranche<\/dt><dd[^>]*>7000 USD/);
    assert.match(html, /Aucune confirmation manuelle supplémentaire n’est requise/);
    assert.doesNotMatch(html, /Confirmer l’inscription<\/button>|Confirmation réservée aux agents/);
});

test('Le compte automatique conserve la dette et masque le bouton manuel même pour un agent habilité', () => {
    const html = renderToStaticMarkup(React.createElement(Finance, {
        ...page,
        selected: { id: 1, name: 'Étudiant', year: '2026-2027' }, accountBackUrl: '/finance', accountBackLabel: 'Comptes étudiants',
        enrollmentConfirmation: {
            status: 'pending_confirmation', canConfirm: true, blocker: null,
            first_installment: {
                status: 'due', currency: 'USD', amount_cents: 10000, paid_cents: 3000, waived_cents: 0, remaining_cents: 7000,
                activation: { automatic: true, percentage: 30, base_cents: 10000, required_cents: 3000, remaining_cents: 0, eligible: true, blocker: null },
            },
        },
        pendingPaymentCount: 0,
        statement: { balance: { currency: 'USD', assessed: true }, schedules: {}, obligations: [], kinds: {}, kind_titles: {} },
    }));
    assert.match(html, /Activation automatique de l’inscription/);
    assert.match(html, /Le seuil est atteint/);
    assert.match(html, /Reste dû sur cette tranche<\/dt><dd[^>]*>7000 USD/);
    assert.doesNotMatch(html, /Confirmer l’inscription<\/button>|Seul un agent habilité/);
});

test('Le compte signale le réexamen financier tout en affichant l’inscription confirmée', () => {
    const html = renderToStaticMarkup(React.createElement(Finance, {
        ...page,
        selected: { id: 1, name: 'Étudiant', year: '2026-2027' },
        accountBackUrl: '/finance',
        accountBackLabel: 'Comptes étudiants',
        enrollmentConfirmation: {
            status: 'confirmed',
            canConfirm: false,
            first_installment: { status: 'due', currency: 'USD', amount_cents: 2500, paid_cents: 2000, waived_cents: 0, remaining_cents: 500 },
            first_installment_review_required: true,
        },
        pendingPaymentCount: 0,
        statement: { balance: { currency: 'USD', assessed: true }, schedules: {}, obligations: [], kinds: {}, kind_titles: {} },
    }));
    assert.match(html, /Inscription confirmée/);
    assert.match(html, /Reste dû sur cette tranche<\/dt><dd[^>]*>500 USD/);
    assert.match(html, /La couverture de la première tranche nécessite un réexamen administratif/);
    assert.doesNotMatch(html, /Confirmer l’inscription<\/button>/);
});
