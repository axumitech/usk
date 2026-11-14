import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);
const source = readFileSync(new URL('resources/js/components/layouts/Dashboard/adminNavigation.ts', root), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const module = { exports: {} };
vm.runInNewContext(outputText, { exports: module.exports, require: () => ({}) });
const groups = module.exports.adminNavigation;
const destinations = new Map(groups.flatMap(({ items }) => items).map(([label, destination]) => [destination.href, { label, ...destination }]));

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

test('Les entrées limitées au périmètre institutionnel et les recours reprennent les conditions serveur', () => {
    const expected = [
        ['/app/dashboard/admin/schedule/resources', ['publish academic content']],
        ['/app/dashboard/admin/student-academic/administration/closure', ['manage academic access']],
    ];
    for (const [href, permissions] of expected) {
        const destination = destinations.get(href);
        assert.equal(destination?.institutionWide, true);
        assert.deepEqual(Array.from(destination.anyPermission), permissions);
    }
    assert.deepEqual(Array.from(destinations.get('/app/dashboard/admin/academic-results#recours').anyPermission), [
        'manage academic results',
        'publish official results',
    ]);
});

test('Le menu Étudiants donne accès aux demandes de scolarité et à l’agenda', () => {
    const items = new Map(groups.find(({ id }) => id === 'etudiants').items);
    for (const [label, href] of [
        ['Demandes de scolarité', '/app/dashboard/admin/student-academic?tab=requests'],
        ['Agenda des rendez-vous', '/app/dashboard/admin/student-academic/requests/agenda'],
    ]) {
        const destination = items.get(label);
        assert.equal(destination?.href, href);
        assert.deepEqual(Array.from(destination.anyPermission), ['manage academic access']);
    }
});

test('Les liens vers un panneau administratif ciblent les ancres des pages existantes', () => {
    const pages = {
        '/app/dashboard/admin/academic-results': 'results/Administration.tsx',
        '/app/dashboard/admin/finance': 'finance/Index.tsx',
        '/app/dashboard/admin/teaching': 'teaching/Index.tsx',
    };
    for (const href of destinations.keys()) {
        const [path, fragment] = href.split('#');
        if (!fragment) continue;
        assert.ok(pages[path], path);
        const page = readFileSync(new URL(`resources/js/pages/dashboard/${pages[path]}`, root), 'utf8');
        assert.ok(page.includes(`id="${fragment}"`), href);
    }
});
