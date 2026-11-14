import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const icons = new Proxy({}, { get: () => () => null });

async function load(path, resolve) {
    const source = await readFile(new URL(`../../resources/js/${path}`, import.meta.url), 'utf8');
    const module = { exports: {} };
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    });
    vm.runInNewContext(compiled.outputText, {
        module,
        exports: module.exports,
        URLSearchParams,
        require: (name) => resolve?.(name) ?? require(name),
    });
    return module.exports;
}

const dates = await load('lib/scheduleDates.ts');
const navigation = await load('components/student/navigation.ts', (name) => {
    if (name === 'lucide-react') return icons;
    if (name === '@/lib/scheduleDates') return dates;
});

const coursePath = '/app/dashboard/student/courses/8';
const fromSchedule = 'academic=7&from=schedule&return_week=2026-11-02&return_day=2026-11-03&return_view=list&focus_session=42';
const links = {
    Link: ({ children, ...props }) => React.createElement('a', props, children),
    Head: () => null,
    usePage: () => ({ url: `${coursePath}/infos?${fromSchedule}` }),
};
const { default: StudentCourse } = await load('pages/dashboard/student/Course.tsx', (name) => {
    if (name === '@inertiajs/react') return links;
    if (name === 'lucide-react') return icons;
    if (name === '@/lib/scheduleDates') return dates;
    if (name === '@/components/student/navigation') return navigation;
    if (name === '@/components/student/StudentChrome') return { studentChromeHref: navigation.studentHref };
    if (name === '@/components/layouts/Dashboard/Dashboard') return { default: React.Fragment };
    if (name.startsWith('@/components/')) return { default: () => null };
    if (name.endsWith('.css')) return {};
});

function render(props) {
    return renderToStaticMarkup(
        React.createElement(StudentCourse, {
            academic: { id: 7, level: 'Licence 2', year: '2026-2027' },
            course: { id: 8, title: 'Algorithmique', description: 'Structures de données.', credits: 5 },
            week: '2026-11-02',
            permissions: { schedule_view: { allowed: true } },
            organization: [{ teacher: 'Titulaire' }],
            ...props,
        }),
    );
}

test('La fiche d’un créneau affiche sa séance et revient à la vue d’origine de l’emploi du temps', () => {
    const html = render({
        section: 'infos',
        focused_session: {
            id: 42,
            teacher: 'Enseignante de la séance',
            starts_at: '2026-11-03T09:00:00Z',
            ends_at: '2026-11-03T11:00:00Z',
            room: 'Salle 205',
            activity_type: 'TD',
            status: 'published',
        },
    });
    assert.match(html, /Enseignante de la séance/);
    assert.match(html, /10:00–12:00 · Kinshasa/);
    assert.match(html, /Salle 205/);
    assert.match(html, /Travaux dirigés/);
    assert.match(html, /schedule\?academic=7&amp;week=2026-11-02&amp;day=2026-11-03&amp;view=list/);
    assert.match(html, /\/8\/sessions\?[^" ]+focus_session=42/);
});

test('Les séances montrent le taux du cours uniquement quand il est calculable', () => {
    assert.doesNotMatch(render({ section: 'sessions' }), /<progress/);
    const html = render({ section: 'sessions', attendance_summary: { rate: 0, attended: 0, recorded: 2 } });
    assert.match(html, /<progress[^>]*value="0"/);
    assert.match(html, /0 présence sur.*2 séances comptabilisées/);
    assert.match(html, /\/8\/attendance\?[^" ]+focus_session=42/);
});
