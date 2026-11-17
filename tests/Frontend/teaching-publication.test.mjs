import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as teachingTypes from '../../resources/js/pages/dashboard/teaching/types.ts';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../../resources/js/pages/dashboard/teaching/Index.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
});
const module = { exports: {} };
vm.runInNewContext(outputText, {
    module,
    exports: module.exports,
    route: (name) => '/' + name,
    require(name) {
        if (name === '@inertiajs/react') return {
            Head: () => null,
            Link: ({ href, children }) => React.createElement('a', { href }, children),
            usePage: () => ({ props: {} }),
        };
        if (name === '@/components/layouts/Dashboard/Dashboard') return { default: ({ children }) => children };
        if (name === './Details') return { Context: () => null, Activity: () => null };
        if (name === './types') return teachingTypes;
        if (name === '@/components/admin/Pagination' || name === '../studentAcademic/AcademicForm') return { default: () => null };
        if (name.endsWith('.css')) return {};
        return require(name);
    },
});

const base = () => ({
    filters: {}, offerings: { data: [], total: 0, links: [] }, summary: { total: 0, published: 0, archived: 0 },
    selected: { id: 1, item_id: 2, title: 'Algorithmique', status: 'draft', year_id: 7 },
    canPublish: true, canRegister: true, registrationOpen: false,
    publicationBlocker: null, missingRegistrations: null,
    students: null, candidates: [], sessions: null, resources: null, assignments: null, registrations: null,
    professors: [], years: [], programs: [], versions: [], items: [], groups: [], semesters: [], units: [],
});
const render = (props) => renderToStaticMarkup(React.createElement(module.exports.default, props));

test('Une offre bloquée présente le contrôle manquant et désactive la publication', () => {
    const props = base();
    props.publicationBlocker = 'Affectez un enseignant responsable actif avant de publier.';
    const html = render(props);
    assert.match(html, /Affectez un enseignant responsable actif/);
    assert.match(html, /<button[^>]*disabled=""[^>]*>Publier après contrôle/);
    assert.doesNotMatch(html, /Offre prête à publier/);
});

test('Une offre prête rappelle la publication distincte des séances', () => {
    const html = render(base());
    assert.match(html, /Offre prête à publier\. Les séances sont publiées depuis Horaires/);
    assert.match(html, /<button class="admin-primary">Publier après contrôle/);
});

test('La synchronisation explicite dépend du contexte annuel ouvert', () => {
    const props = base();
    props.selected.status = 'published';
    assert.doesNotMatch(render(props), /Synchroniser le public obligatoire/);
    props.registrationOpen = true;
    props.missingRegistrations = 3;
    const html = render(props);
    assert.match(html, /Synchroniser le public obligatoire/);
    assert.match(html, /3 inscription\(s\) pédagogique\(s\) en attente/);
});
