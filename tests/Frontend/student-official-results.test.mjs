import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import uploadLimits from './support/upload-limits.mjs';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../../resources/js/components/student/OfficialResults.tsx', import.meta.url), 'utf8');
const module = { exports: {} };
let flash = {};
vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText, {
    module, exports: module.exports,
    route: (name) => name,
    require(name) {
        if (name === '@/lib/uploadLimits') return uploadLimits;
        if (name === '@inertiajs/react') return {
            Link: ({ children, ...props }) => React.createElement('a', props, children),
            usePage: () => ({ props: { flash } }),
        };
        if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
        if (name === '@/lib/studentEnrollment') return { formatDate: (date) => date };
        if (name === '@/components/admin/Pagination' || name === './StudentResultCelebration') return () => null;
        if (name.endsWith('.css')) return {};
        return require(name);
    },
});

const renderResult = (unit) => renderToStaticMarkup(React.createElement(module.exports.default, {
    academic: { id: 7, name: 'Étudiant', faculty: 'Sciences', level: 'L1', year: '2026-2027' },
    data: {
        items: { data: [] },
        selected: {
            reference: 'REF', context: { level: 'L1', year: '2026-2027', scale: 2000 },
            periods: { s1: { name: 'Premier semestre', grade: '12', units: [unit.id] } },
            units: [unit], appeals: [],
        },
        semesters: [{ number: 1, status: 'published', period_key: 's1', reference: 'REF', passed: false }],
        selected_semester: 1,
    },
}));
const unit = {
    id: 3, code: 'INF3', name: 'Informatique', grade: '12', credits: 600, earned_credits: 0, status: 'failed',
    items: [
        { id: 7, name: 'Algorithmique', grade: '16', credits: 300, coefficient: 1000, status: 'passed' },
        { id: 8, name: 'Bases de données', grade: '8', credits: 300, coefficient: 1000, status: 'failed' },
    ],
};

test('La grille explique pourquoi une UE composée est non validée malgré une moyenne supérieure à 10', () => {
    const html = renderResult({ ...unit, is_composite: true, requires_all_items: true });
    assert.match(html, /tous ses cours requis doivent être validés ou reconnus/);
    assert.match(html, /<tbody>.*UE composée.*1 \/ 2 cours requis validés ou reconnus.*>12<.*>0 \/ 6<.*Non validé.*Algorithmique.*Bases de données.*<\/tbody>/);
});

test('La grille conserve une ancienne compensation sans présenter la nouvelle règle comme sa condition', () => {
    const html = renderResult({ ...unit, earned_credits: 600, status: 'compensated' });
    assert.match(html, /UE composée.*>6 \/ 6<.*Compensé/);
    assert.doesNotMatch(html, /cours requis/);
    const carried = renderResult({ ...unit, is_composite: true, earned_credits: 600, status: 'compensated', ordinary_acquisition_preserved: true });
    assert.match(carried, /Validation acquise lors d’une session précédente/);
});

test('Le recours reçu est annoncé avec sa référence, indépendamment du formulaire', () => {
    flash = { success: 'Recours enregistré · Référence 42' };
    try {
        assert.match(renderResult(unit), /role="status">Recours enregistré · Référence 42<\/p>/);
    } finally {
        flash = {};
    }
});
