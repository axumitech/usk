import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);

async function load(path, overrides = {}) {
    const source = await readFile(new URL(`../../resources/js/${path}.tsx`, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    });
    const module = { exports: {} };
    vm.runInNewContext(outputText, {
        module,
        exports: module.exports,
        route: (name) => `/app/${name}`,
        window: { confirm: () => assert.fail('La déconnexion étudiante ne demande pas de confirmation.') },
        require(name) {
            if (name in overrides) return overrides[name];
            if (name.endsWith('.css')) return {};
            if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
            return require(name);
        },
    });
    return module.exports.default;
}

function find(element, predicate) {
    if (!element || typeof element !== 'object') return undefined;
    if (predicate(element)) return element;
    for (const child of React.Children.toArray(element.props?.children)) {
        const found = find(child, predicate);
        if (found) return found;
    }
    return undefined;
}

async function studentLogout(phase = null) {
    const calls = [];
    const Heading = await load('components/student/ProfilePageHeading', {
        react: { ...React, useContext: () => ({ phase, logout: (animate) => calls.push(animate) }), useState: () => [undefined, () => {}] },
        '@inertiajs/react': { Link: () => null },
        '@/components/layouts/Dashboard/DashboardThemeMenu': { default: () => null },
        '@/components/system/DashboardDeparture': { DashboardDepartureContext: {} },
        './navigation': { studentHref: (section, academic) => `/app/dashboard/student/${section}?academic=${academic}` },
        './StudentChrome': { StudentYearSelect: () => null },
        './types': { labels: {} },
    });
    const tree = Heading({ academic: { id: 7, name: 'Étudiant de test', level: 'Licence 1', year: '2026-2027', student_status: 'active', enrollment_status: 'confirmed' }, yearCount: 1 });
    const button = find(tree, (element) => element.type === 'button' && element.props.className === 'sp-row sp-logout');
    assert.ok(button, 'Le bouton étudiant doit rester accessible dans le profil.');
    return { button, calls };
}

test('Le bouton étudiant déclenche immédiatement la déconnexion partagée sans dialogue', async () => {
    const { button, calls } = await studentLogout();
    assert.equal(button.props.disabled, false);
    button.props.onClick();
    assert.deepEqual(calls, [false]);
});

test('Le bouton étudiant est désactivé pendant la déconnexion', async () => {
    const { button } = await studentLogout('immediate');
    assert.equal(button.props.disabled, true);
});

test('La déconnexion partagée conserve POST, le contrôle Inertia et la protection contre les clics multiples', async () => {
    const requests = [];
    const Departure = await load('components/system/DashboardDeparture', {
        react: { ...React, useCallback: (callback) => callback, useEffect: () => {}, useRef: (current) => ({ current }), useState: (state) => [state, () => {}] },
        '@inertiajs/react': { router: { post: (...args) => requests.push(args) } },
        './DashboardArrival': { DashboardCurtain: () => null },
    });
    const departure = Departure({ children: null }).props.value;
    departure.logout(false);
    departure.logout(false);
    assert.equal(requests.length, 1);
    assert.equal(requests[0][0], '/app/logout');
    assert.equal(Object.keys(requests[0][1]).length, 0);
    assert.equal(typeof requests[0][2].onFinish, 'function');
    requests[0][2].onFinish();
    departure.logout(false);
    assert.equal(requests.length, 2, 'Une requête terminée ne doit pas laisser le bouton bloqué.');
});

test('La page de connexion présente le message de déconnexion dans son retour de succès existant', async () => {
    const Login = await load('components/section/dashboard/auth/DashboardLogin', {
        '@inertiajs/react': {
            Link: ({ children, href }) => React.createElement('a', { href }, children),
            usePage: () => ({ props: { flash: { success: 'Déconnexion réussie.' } } }),
            useForm: (data) => ({ data, setData: () => {}, post: () => {}, processing: false, errors: {} }),
        },
        '@/utils/sweetAlert': { default: {} },
    });
    const html = renderToStaticMarkup(React.createElement(Login));
    assert.match(html, /role="status"[^>]*>Déconnexion réussie\.<\/p>/);
});
