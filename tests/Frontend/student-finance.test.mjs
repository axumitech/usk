import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const module = { exports: {} };
const source = await readFile(new URL('../../resources/js/components/student/StudentFinance.tsx', import.meta.url), 'utf8');
vm.runInNewContext(
    ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
        module,
        exports: module.exports,
        require(name) {
            if (name === '@inertiajs/react') {
                return {
                    Link: ({ children, ...props }) => React.createElement('a', props, children),
                    useForm: (data) => ({ data, processing: false, errors: {} }),
                };
            }
            if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
            if (name === '@/lib/studentEnrollment') return { formatDate: (date) => date };
            if (name === '@/components/admin/Pagination') return { default: () => null };
            if (name === './navigation') return { studentHref: (section, academic) => `/app/dashboard/student/${section}?academic=${academic}` };
            if (name === './types') return { labels: {}, money: (cents, currency) => `${(cents / 100).toFixed(2)} ${currency}` };
            if (name.endsWith('.css')) return {};
            return require(name);
        },
    },
);

const renderFinance = (extra) =>
    renderToStaticMarkup(
        React.createElement(module.exports.default, {
            section: 'fees',
            academic: { id: 7, level: 'L3 Informatique', year: '2026-2027' },
            balance: {
                assessed: true,
                currency: 'USD',
                total_cents: 10000,
                waived_cents: 1000,
                due_cents: 9000,
                paid_cents: 6000,
                pending_cents: 2000,
                balance_cents: 4500,
                overdue_cents: 0,
                credit_cents: 1500,
                financial_clearance_status: 'partial',
            },
            ...extra,
        }),
    );

test('La jauge exclut les versements en attente et les crédits non affectés', () => {
    const html = renderFinance();
    assert.match(html, /stroke-dasharray="50 100"/);
    assert.match(html, /45\.00 USD<\/strong><span>sur 90\.00 USD/);
    assert.match(html, /20\.00 USD<\/strong> en attente de confirmation/);
    assert.match(html, /Comment faire enregistrer mon paiement/);
    assert.doesNotMatch(html, /Effectuer un paiement|Payer le solde/);
});

test('La vue des reçus conserve la devise et le contexte de la transaction', () => {
    const html = renderFinance({
        section: 'transactions',
        finance_view: 'receipts',
        payments: [
            {
                id: 4,
                reference: 'REF-FAKE',
                status: 'confirmed',
                amount_cents: 150000,
                currency: 'CDF',
                method: 'bank_transfer',
                receipt_url: '/app/dashboard/student/payments/receipt-test/receipt?academic=7',
            },
        ],
    });
    assert.match(html, /<h1>Reçus et attestations<\/h1>/);
    assert.match(html, /1500\.00 CDF/);
    assert.match(html, /href="\/app\/dashboard\/student\/payments\/receipt-test\/receipt\?academic=7"/);
    assert.match(html, /href="\/app\/dashboard\/student\/documents\?academic=7"/);
});

test('Le compte distingue un solde exact et chaque échéance des frais à établir', () => {
    const tranche = {
        id: 1, kind: 'tuition', kind_title: 'Frais académiques', title: 'Première tranche',
        currency: 'USD', amount_cents: 10000, remaining_cents: 4500, due_at: '2026-12-10', status: 'partial',
    };
    const html = renderFinance({
        finance_schedule: [tranche],
        finance_details: {
            obligations: [{ ...tranche, paid_cents: 4500, waived_cents: 1000 }],
            recent_payments: [], receipt_payments: [],
        },
    });
    assert.match(html, /id="finance-balance">Reste à payer/);
    assert.match(html, /Date limite <time dateTime="2026-12-10">2026-12-10<\/time>/);
    assert.match(html, /Montant prévu<\/dt><dd>100\.00 USD/);
    assert.match(html, /Aides déduites<\/dt><dd>10\.00 USD/);
    assert.match(html, /Reste à payer<\/dt><dd>45\.00 USD/);

    const unassessed = renderFinance({ balance: { currency: 'USD', assessed: false, financial_clearance_status: 'unassessed' } });
    assert.match(unassessed, /aria-live="polite">À établir/);
    assert.match(unassessed, /dès qu’un barème applicable à votre inscription pourra être facturé/);
    assert.doesNotMatch(unassessed, /aria-live="polite">0\.00 USD/);

    const cleared = renderFinance({
        balance: { currency: 'USD', assessed: true, due_cents: 9000, balance_cents: 0, financial_clearance_status: 'cleared' },
    });
    assert.match(cleared, /aria-live="polite">0\.00 USD/);
});

test('Le compte permet le dépôt d’un document et le suivi des décisions', () => {
    const submitted = {
        id: 5, kind_label: 'Frais académiques', amount_cents: 2300, currency: 'USD', method: 'bank_transfer',
        reference: 'VERSEMENT-7', status: 'rejected', submitted_at: '2026-11-18', review_note: 'Document illisible.',
        download_url: '/app/dashboard/student/payment-proofs/5/file',
    };
    const html = renderFinance({
        payment_proofs: {
            submit_url: '/app/dashboard/student/payment-proofs?academic=7',
            max_kb: 5120,
            methods: ['bank_transfer'],
            kinds: [{ id: 'tuition', label: 'Frais académiques' }],
            submissions: [submitted],
        },
    });
    assert.match(html, /Déposer un justificatif/);
    assert.match(html, /Montant réellement versé \(USD\)/);
    assert.match(html, /type="file" accept="\.pdf,\.jpg,\.jpeg,\.png,\.webp"/);
    assert.match(html, /Envoyer le justificatif/);
    assert.match(html, /Refusé/);
    assert.match(html, /Document illisible/);
    assert.match(html, /href="\/app\/dashboard\/student\/payment-proofs\/5\/file"/);
});

test('Les frais de bibliothèque affichent leur date limite et entrent dans le reste à payer', () => {
    const library = {
        id: 6,
        kind: 'library',
        kind_title: 'Frais de bibliothèque',
        title: 'Frais de bibliothèque · Échéance 1',
        currency: 'USD',
        amount_cents: 1250,
        remaining_cents: 1250,
        due_at: '2026-12-01',
        status: 'upcoming',
    };
    const base = { assessed: true, currency: 'USD', due_cents: 80300, paid_cents: 0, balance_cents: 80300, financial_clearance_status: 'unpaid' };
    const eligible = renderFinance({ balance: { ...base, due_cents: 81550, balance_cents: 81550 }, finance_schedule: [library] });
    assert.match(eligible, /Frais de bibliothèque · Échéance 1/);
    assert.match(eligible, /Date limite <time dateTime="2026-12-01">2026-12-01<\/time>/);
    assert.match(eligible, /Reste à payer<\/dt><dd>12\.50 USD/);
    assert.match(eligible, /aria-live="polite">815\.50 USD/);

    const undated = renderFinance({
        balance: { ...base, due_cents: 81550, balance_cents: 81550 },
        finance_schedule: [{ ...library, due_at: null, title: library.kind_title }],
    });
    assert.match(undated, /<h4>Frais de bibliothèque<\/h4><p>Sans date limite<\/p>/);
    assert.match(undated, /aria-live="polite">815\.50 USD/);
    assert.doesNotMatch(undated, /Échéance en retard|Date limite à fixer/);

    const outside = renderFinance({ balance: base, finance_schedule: [] });
    assert.doesNotMatch(outside, /Frais de bibliothèque/);
    assert.match(outside, /aria-live="polite">803\.00 USD/);
});

test('Les frais de l’année regroupent les tranches et autres frais avec un solde par type', () => {
    const tuition = {
        id: 1,
        kind: 'tuition',
        kind_title: 'Frais académiques',
        title: 'Première tranche',
        currency: 'USD',
        amount_cents: 50000,
        remaining_cents: 30000,
        due_at: '2026-12-15',
        status: 'partial',
    };
    const second = { ...tuition, id: 2, title: 'Deuxième tranche', amount_cents: 30300, remaining_cents: 30300, due_at: '2027-03-15' };
    const enrollment = {
        ...tuition,
        id: 3,
        kind: 'new_registrations',
        kind_title: 'Fiche d’enrôlement',
        title: 'Fiche d’enrôlement',
        amount_cents: 1500,
        remaining_cents: 1500,
        due_at: null,
        status: 'upcoming',
    };
    const library = {
        ...enrollment,
        id: 4,
        kind: 'library',
        kind_title: 'Bibliothèque',
        title: 'Bibliothèque',
        remaining_cents: 0,
        status: 'paid',
    };
    const amount = (total, remaining) => ({ due_cents: total, balance_cents: remaining, currency: 'USD' });
    const html = renderFinance({
        section: 'annual-fees',
        balance: { ...amount(83300, 61800), total_cents: 83300, waived_cents: 0, assessed: true, financial_clearance_status: 'partial' },
        finance_schedule: [enrollment, tuition, second, library],
        finance_details: {
            obligations: [enrollment, tuition, second, library],
            kinds: { tuition: amount(80300, 60300), new_registrations: amount(1500, 1500), library: amount(1500, 0) },
            can_submit_proof: true,
        },
    });
    assert.match(renderFinance(), /href="\/app\/dashboard\/student\/annual-fees\?academic=7"/);
    assert.match(html, /<h1>Frais de l’année<\/h1>/);
    assert.match(html, /aria-live="polite">618\.00 USD/);
    assert.match(html, /<h3>Frais académiques<\/h3>.*603\.00 USD.*Première tranche.*2026-12-15.*Deuxième tranche.*2027-03-15/);
    assert.match(html, /<h3>Fiche d’enrôlement<\/h3>.*kind=new_registrations#finance-payment-proofs.*<h4>Fiche d’enrôlement<\/h4><p>Sans date limite/);
    assert.doesNotMatch(html, /kind=library#finance-payment-proofs/);
});

test('Le justificatif préselectionne le type demandé en laissant vide le montant réellement versé', () => {
    const html = renderFinance({
        payment_proofs: {
            submit_url: '/app/dashboard/student/payment-proofs?academic=7',
            max_kb: 5120,
            methods: ['bank_transfer'],
            kinds: [
                { id: 'tuition', label: 'Frais académiques', balance_cents: 4500, currency: 'USD' },
                { id: 'library', label: 'Frais de bibliothèque', balance_cents: 1250, currency: 'USD' },
            ],
            selected_kind: 'library',
            submissions: [],
        },
    });
    assert.match(html, /<option value="tuition">Frais académiques · Reste : 45\.00 USD<\/option>/);
    assert.match(html, /<option value="library" selected="">Frais de bibliothèque · Reste : 12\.50 USD<\/option>/);
    assert.match(html, /Montant réellement versé \(USD\)<input [^>]+value=""/);
});
