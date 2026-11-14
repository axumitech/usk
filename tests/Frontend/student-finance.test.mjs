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
            if (name === '@inertiajs/react') return { Link: ({ children, ...props }) => React.createElement('a', props, children) };
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
