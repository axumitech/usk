import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);
const source = readFileSync(new URL('resources/js/components/layouts/Dashboard/adminNavigation.ts', root), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const module = { exports: {} };
vm.runInNewContext(outputText, { exports: module.exports, URL, require: () => ({}) });
const groups = module.exports.adminNavigation;
const { visibleAdminNavigation, activeAdminDestination } = module.exports;
const destinations = new Map(groups.flatMap(({ items }) => items).map(([label, destination]) => [destination.href, { label, ...destination }]));
const base = '/app/dashboard/admin';
const access = 'manage academic access';
const publish = 'publish academic content';
const finance = 'manage academic finance';
const allPermissions = [...new Set([...destinations.values()].flatMap((item) => item.anyPermission ?? []))];
const hrefs = (permissions, hasAcademicFacultyScope = false) => new Set(visibleAdminNavigation({ permissions, hasAcademicFacultyScope })
    .flatMap(({ items }) => items.map(([, item]) => item.href)));

test('Les dix groupes suivent l’ordre de fonctionnement de l’université', () => {
    assert.deepEqual(Array.from(visibleAdminNavigation({ permissions: allPermissions }), ({ title }) => title), [
        'Tableau de bord', 'Structure institutionnelle', 'Préparation académique', 'Admissions et scolarité', 'Finances',
        'Enseignement', 'Évaluations et résultats', 'Documents et services', 'Communication', 'Administration système',
    ]);
});

test('Les rubriques administratives ouvrent des routes GET distinctes et respectent leurs permissions explicites', () => {
    const routes = JSON.parse(
        execFileSync('php', ['artisan', 'route:list', '--json'], {
            cwd: fileURLToPath(root),
            env: { ...process.env, APP_ENV: 'testing', DB_CONNECTION: 'sqlite', DB_DATABASE: ':memory:' },
            encoding: 'utf8',
        }),
    );
    const seen = new Set();

    for (const group of groups) {
        assert.ok(group.items.length, group.title);
        for (const [label, destination] of group.items) {
            assert.ok(destination?.href.startsWith('/'), label);
            assert.ok(!seen.has(destination.href), destination.href);
            seen.add(destination.href);

            const path = destination.href.split(/[?#]/)[0].slice(1);
            const route = routes.find(({ uri, method }) => uri === path && method.split('|').includes('GET'));
            assert.ok(route, `${label} → ${path}`);
            const required = route.middleware.filter((middleware) => middleware.includes('Authorize:')).map((middleware) => middleware.split('Authorize:')[1]);
            for (const permission of required) {
                assert.deepEqual(Array.from(destination.anyPermission ?? []), [permission], destination.href);
            }
        }
    }
});

test('Les entrées limitées au périmètre institutionnel gardent les conditions serveur', () => {
    const expected = [
        ['/app/dashboard/admin/schedule/resources', ['publish academic content']],
        ['/app/dashboard/admin/student-academic/administration/closure', ['manage academic access']],
    ];
    for (const [href, permissions] of expected) {
        const destination = destinations.get(href);
        assert.equal(destination?.institutionWide, true);
        assert.deepEqual(Array.from(destination.anyPermission), permissions);
    }
});

test('Documents et services conserve les demandes de scolarité et l’agenda', () => {
    const items = new Map(groups.find(({ id }) => id === 'documents').items);
    for (const [label, href] of [
        ['Demandes de scolarité et d’examen', '/app/dashboard/admin/student-academic?tab=requests'],
        ['Agenda des rendez-vous', '/app/dashboard/admin/student-academic/requests/agenda'],
    ]) {
        const destination = items.get(label);
        assert.equal(destination?.href, href);
        assert.deepEqual(Array.from(destination.anyPermission), ['manage academic access']);
    }
});

test('Les filtres locaux sont regroupés et les étapes distinctes restent accessibles', () => {
    for (const path of ['finance', 'official-documents', 'academic-results', 'assessments', 'teaching']) {
        assert.equal([...destinations.keys()].filter((href) => href.split(/[?#]/)[0] === `${base}/${path}`).length, 1, path);
    }
    for (const path of ['assessments/handoff', 'finance/tariffs', 'finance/payment-proofs', 'finance/confirmations',
        'student-academic?tab=students&history=1', 'enrollments?queue=decisions', 'card-issuance/nfc', 'student-academic?tab=teaching']) {
        assert.ok(destinations.has(`${base}/${path}`), path);
    }
    assert.equal(destinations.get(`${base}/assessments/handoff`).native, true);
});

test('Les délégations utilisent les permissions du compte et le périmètre de faculté', () => {
    const dean = hrefs([access, publish, 'configure settings', 'manage content'], true);
    assert.ok(dean.has(`${base}/academic-structure?tab=programs`));
    assert.ok(dean.has(`${base}/enrollments?queue=decisions`));
    for (const path of ['academic-structure?tab=institution', 'finance', 'schedule/resources', 'site', 'seo', 'posts', 'student-academic/administration/closure']) {
        assert.ok(!dean.has(`${base}/${path}`), path);
    }
    const viceDean = hrefs([publish, 'manage academic progression'], true);
    assert.ok(viceDean.has(`${base}/academic-structure?tab=curriculum`));
    assert.ok(viceDean.has(`${base}/progression`));
    assert.ok(!viceDean.has(`${base}/enrollments`));

    const registrar = hrefs([access], true);
    assert.ok(registrar.has(`${base}/student-academic?tab=requests`));
    assert.ok(registrar.has(`${base}/card-requests`));
    assert.ok(!registrar.has(`${base}/official-documents`));
    assert.ok(!registrar.has(`${base}/assessments`));

    const accountant = hrefs([finance], true);
    assert.ok(accountant.has(`${base}/finance/payment-proofs`));
    assert.ok(accountant.has(`${base}/student-academic?tab=students`));
    for (const path of ['course-catalog', 'professors', 'teaching', 'assessments', 'academic-structure?tab=curriculum', 'academic-results', 'enrollments']) {
        assert.ok(!accountant.has(`${base}/${path}`), path);
    }
    const documents = hrefs(['issue official documents'], true);
    assert.ok(documents.has(`${base}/official-documents`));
    assert.ok(!documents.has(`${base}/card-issuance/printing`));
});

test('Le menu courant suit les fiches, onglets, filtres et liens historiques', () => {
    const visible = visibleAdminNavigation({ permissions: allPermissions });
    for (const [location, groupId, target] of [
        ['levels/details/5?tab=conditions', 'structure', 'levels'],
        ['academic-structure?version=7&level=5', 'preparation', 'academic-structure?tab=curriculum'],
        ['academic-years/calendar?year=9', 'preparation', 'academic-years/calendar'],
        ['enrollments?reexamination=1', 'admissions', 'enrollments?queue=new'],
        ['enrollments?queue=refused&q=Test', 'admissions', 'enrollments?queue=decisions'],
        ['student-academic/3?history=1', 'admissions', 'student-academic?tab=students&history=1'],
        ['student-academic/requests/8', 'documents', 'student-academic?tab=requests'],
        ['student-academic/requests/availability', 'documents', 'student-academic/requests/agenda'],
        ['student-academic?tab=teaching', 'communication', 'student-academic?tab=teaching'],
        ['student-academic?tab=finance&academic=9', 'finances', 'finance'],
        ['finance?academic=9#reports', 'finances', 'finance'],
        ['finance/payment-proofs?faculty=2&page=3', 'finances', 'finance/payment-proofs'],
        ['academic-results?state=published#recours', 'evaluations', 'academic-results'],
    ]) {
        const active = activeAdminDestination(visible, `${base}/${location}`);
        assert.equal(active?.groupId, groupId, location);
        assert.equal(active?.href, `${base}/${target}`, location);
    }
    assert.equal(activeAdminDestination(visibleAdminNavigation({ permissions: [finance] }), `${base}/teaching`), null);
    assert.equal(activeAdminDestination(visible, '/app/dashboard/teacher'), null);
});

test('Les raccourcis des applications partagent la visibilité de la sidebar', () => {
    const require = createRequire(import.meta.url);
    const source = readFileSync(new URL('resources/js/components/admin/AppsNavigation.tsx', root), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
    const app = { exports: {} };
    const actor = { permissions: [access, publish, 'configure settings', 'manage content'], hasAcademicFacultyScope: true };
    vm.runInNewContext(outputText, { exports: app.exports, require(name) {
        if (name === '@/components/layouts/Dashboard/adminNavigation') return module.exports;
        if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
        if (name === '@inertiajs/react') return {
            Link: ({ children, ...props }) => React.createElement('a', props, children),
            usePage: () => ({ component: 'dashboard/adminEnrollments/Index', props: { auth: { user: actor } } }),
        };
        return require(name);
    } });
    const html = renderToStaticMarkup(React.createElement(app.exports.default));
    assert.match(html, /href="\/app\/dashboard\/admin\/enrollments" aria-current="page">Candidatures/);
    assert.doesNotMatch(html, /\/app\/dashboard\/admin\/(posts|seo)/);
});
