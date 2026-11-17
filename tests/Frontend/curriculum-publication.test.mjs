import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../../resources/js/pages/dashboard/academicStructure/VersionDialogs.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
});
const module = { exports: {} };
vm.runInNewContext(outputText, {
    module,
    exports: module.exports,
    route: (name, params) => '/' + name + '?year=' + params.year,
    require(name) {
        if (name === '@inertiajs/react') return {
            Link: ({ href, children }) => React.createElement('a', { href }, children),
            useForm: (data) => ({ data, errors: {}, processing: false }),
        };
        if (name === '@/components/admin/AdminModal') return { default: ({ description, children }) => React.createElement('section', null, description, children) };
        if (name === './types') return { messages: () => [] };
        return require(name);
    },
});

const version = { id: 2, code: 'V1', name: 'Programme annuel', academic_program_id: 7, academic_year_id: 4, revision: 1 };
const render = (schedule) => renderToStaticMarkup(React.createElement(module.exports.Transition, {
    action: 'publish', version, onClose: () => {},
    context: { activeVersions: [], levelWorkspace: [{ title: 'Licence 1', schedule }] },
}));

test('La publication de maquette annonce uniquement les offres revues ayant des séances', () => {
    const html = render([
        { id: 8, course: 'Biologie', audience: 'Groupe A', sessions: [{ id: 1 }, { id: 2 }] },
        { id: 9, course: 'Cours sans séance', audience: 'Groupe B', sessions: [] },
    ]);
    assert.match(html, /1 offre\(s\) historique\(s\) et 2.*séance\(s\) associée\(s\)/);
    assert.match(html, /Biologie · Licence 1 · Groupe A · 2 séance\(s\)/);
    assert.doesNotMatch(html, /Cours sans séance/);
    assert.match(html, /programme reste ambigu/);
    assert.match(html, /year=4/);
    assert.match(html, /Vérifier les enseignements de l’année/);
});

test('Une maquette sans séance historique conserve la publication du référentiel', () => {
    const html = render([]);
    assert.match(html, /référence pédagogique du programme/);
    assert.match(html, /0 offre\(s\) historique\(s\) et 0.*séance\(s\) associée\(s\)/);
    assert.match(html, /offres versionnées et leurs inscriptions pédagogiques/);
});
