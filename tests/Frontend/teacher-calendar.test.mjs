import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as scheduleDates from '../../resources/js/lib/scheduleDates.ts';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../../resources/js/pages/dashboard/teaching/TeacherOverview.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
});
const module = { exports: {} };
vm.runInNewContext(outputText, {
    module,
    exports: module.exports,
    require(name) {
        if (name === '@/lib/scheduleDates') return scheduleDates;
        if (name === '@inertiajs/react') return {};
        if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
        if (name.startsWith('@/')) return {};
        return require(name);
    },
});

const calendar = (events) => renderToStaticMarkup(React.createElement(module.exports.TeacherAcademicCalendar, { events }));

test('Le calendrier professeur expose le libellé et les dates inclusives des événements publiés', () => {
    const html = calendar([
        { id: 1, title: 'Examens B1', category: 'exam', category_label: 'Examens', start_date: '2026-11-02', end_date: '2026-11-04' },
        {
            id: 'semestre-2',
            title: 'Période de cours',
            category: 'courses',
            category_label: 'Cours',
            start_date: '2026-11-06',
            end_date: '2026-11-06',
        },
    ]);
    assert.match(html, /Calendrier académique/);
    assert.match(
        html,
        /Examens B1.*<small>Examens<\/small>.*Du <time dateTime="2026-11-02">lundi 2 novembre<\/time> au <time dateTime="2026-11-04">mercredi 4 novembre<\/time>/,
    );
    assert.match(html, /Période de cours.*<small><time dateTime="2026-11-06">vendredi 6 novembre<\/time><\/small>/);
    assert.doesNotMatch(html, /href=|teacher-sessions/);
});

test('Le panneau ne s’affiche pas sans événement pour la période', () => {
    assert.equal(calendar(), '');
    assert.equal(calendar([]), '');
});
