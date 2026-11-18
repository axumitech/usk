import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../../resources/js/components/layouts/Dashboard/Sidebar.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
});
const destinations = {
    home: '/',
    'dashboard.enrollments.index': '/app/dashboard/enrollments',
    'dashboard.teaching.index': '/app/dashboard/teacher',
    'dashboard.teaching.learning.index': '/app/dashboard/teacher/resources',
    'dashboard.teaching.assessments.index': '/app/dashboard/teacher/assessments',
};
const icons = new Proxy({}, { get: () => () => null });
const compile = value => ts.transpileModule(value, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const adminSource = await readFile(new URL('../../resources/js/components/layouts/Dashboard/adminNavigation.ts', import.meta.url), 'utf8');
const admin = { exports: {} };
vm.runInNewContext(compile(adminSource), { module: admin, exports: admin.exports, URL, URLSearchParams, require: name => name === 'lucide-react' ? icons : require(name) });
const studentSource = await readFile(new URL('../../resources/js/components/student/navigation.ts', import.meta.url), 'utf8');
const student = { exports: {} };
vm.runInNewContext(compile(studentSource), { module: student, exports: student.exports, URL, URLSearchParams, require: name => name === 'lucide-react' ? icons : require(name) });
let page;
function sidebarModule(react = React, environment = {}) {
    const module = { exports: {} };
    vm.runInNewContext(outputText, {
    module,
    exports: module.exports,
    URL,
    ...environment,
    require(name) {
        if (name === '@/components/layouts/Dashboard/adminNavigation') return admin.exports;
        if (name === '@/components/student/navigation') return student.exports;
        if (name === '@/utils/sweetAlert') return {};
        if (name === '@inertiajs/react') return { usePage: () => page };
        if (name === 'lucide-react') return icons;
        if (name === 'react') return react;
        if (name.endsWith('.css')) return {};
        if (name === 'ziggy-js') {
            return {
                route: (routeName) => {
                    assert.ok(destinations[routeName], routeName);
                    return destinations[routeName];
                },
            };
        }
        return require(name);
    },
    });
    return module.exports.default;
}
const Sidebar = sidebarModule();

function sidebar(role, menu, { props = {}, url = '/', isMobile = false, isMobileSidebarOpen = false } = {}) {
    page = { props, url };
    return renderToStaticMarkup(
        React.createElement(Sidebar, {
            userRole: [role],
            currentActiveMenu: menu,
            isMobile,
            isMobileSidebarOpen,
            onButtonClick: () => {},
            onCloseMenu: () => {},
            onLogout: () => {},
        }),
    );
}

test('Le menu du rôle professor ouvre les trois espaces enseignants', () => {
    const markup = sidebar('professor', 'teaching', {
        props: { teachingProfileActive: true, auth: { user: { permissions: ['manage courses'] } } },
        url: destinations['dashboard.teaching.index'],
    });
    for (const href of Object.values(destinations).filter((url) => url.startsWith('/app/dashboard/teacher'))) {
        assert.ok(markup.includes(`href="${href}"`), href);
    }
    assert.doesNotMatch(markup, /href="#"/);
    assert.match(markup, /href="\/app\/dashboard\/teacher" aria-current="page"/);
});

test('Un enseignant sans fiche active accède à ses cours et reçoit les instructions de rattachement', () => {
    const markup = sidebar('professor', 'teaching');
    assert.match(markup, /href="\/app\/dashboard\/teacher"/);
    assert.doesNotMatch(markup, /href="\/app\/dashboard\/teacher\//);
});

test('Le lien vers les évaluations exige le droit de gestion des cours', () => {
    const markup = sidebar('professor', 'teaching', { props: { teachingProfileActive: true } });
    assert.match(markup, /href="\/app\/dashboard\/teacher\/resources"/);
    assert.doesNotMatch(markup, /href="\/app\/dashboard\/teacher\/assessments"/);
});

test('Un panneau mobile fermé et les sous-menus inactifs sont inertes', () => {
    const markup = sidebar('candidate', null, { isMobile: true });
    assert.match(markup, /aria-label="Navigation principale" inert=""/);
    assert.match(markup, /id="sidebar-panel-enrollments"[^>]+inert="" aria-hidden="true"/);
});

test('Le lien institutionnel respecte la permission et le périmètre administratif', () => {
    const auth = (permissions, hasAcademicFacultyScope) => ({ auth: { user: { permissions, hasAcademicFacultyScope } } });
    assert.match(sidebar('admin', null, { props: auth(['publish academic content'], false) }), /href="\/app\/dashboard\/admin\/schedule\/resources"/);
    for (const props of [auth([], false), auth(['publish academic content'], true)]) {
        assert.doesNotMatch(sidebar('admin', null, { props }), /href="\/app\/dashboard\/admin\/schedule\/resources"/);
    }
});

const actor = (permissions = [], hasAcademicFacultyScope = false) => ({ permissions, hasAcademicFacultyScope });
const propsFor = value => ({ auth: { user: value } });
const groupFor = (href, user) => admin.exports.visibleAdminNavigation(user).find(group => group.items.some(([, destination]) => destination.href === href));
const buttonTag = (markup, id) => [...markup.matchAll(/<button\b[^>]*>/g)].map(match => match[0]).find(tag => tag.includes(`data-menu="${id}"`));
const linkTag = (markup, href) => [...markup.matchAll(/<a\b[^>]*>/g)].map(match => match[0]).find(tag => tag.includes(`href="${href.replaceAll('&', '&amp;')}"`));

test('Le groupe de la page courante reste identifiable dans le rail fermé après édition', () => {
    const user = actor(['manage academic finance']);
    const group = groupFor('/app/dashboard/admin/finance', user);
    assert.ok(group);
    const markup = sidebar('admin', null, { props: propsFor(user), url: '/app/dashboard/admin/finance/42?view=account' });
    const button = buttonTag(markup, group.id);
    assert.match(button, /aria-current="location"/);
    assert.match(button, /aria-expanded="false"/);
    assert.ok(button.includes(`aria-label="${group.title}"`));
    assert.match(markup, /data-admin-sidebar="rail"/);
});

test('Le panneau ouvert distingue expansion et groupe courant et marque un seul lien actif', () => {
    const user = actor(['manage academic finance', 'manage official documents']);
    const currentGroup = groupFor('/app/dashboard/admin/finance', user);
    const openedGroup = groupFor('/app/dashboard/admin/official-documents', user);
    assert.ok(currentGroup && openedGroup);
    const markup = sidebar('admin', openedGroup.id, { props: propsFor(user), url: '/app/dashboard/admin/finance/42' });
    assert.match(buttonTag(markup, currentGroup.id), /aria-current="location"/);
    assert.match(buttonTag(markup, currentGroup.id), /aria-expanded="false"/);
    assert.match(buttonTag(markup, openedGroup.id), /aria-expanded="true"/);
    assert.doesNotMatch(buttonTag(markup, openedGroup.id), /aria-current/);
    assert.match(linkTag(markup, '/app/dashboard/admin/finance'), /aria-current="page"/);
    assert.equal((markup.match(/aria-current="page"/g) || []).length, 1);
});

test('Les liens et groupes interdits disparaissent au lieu de présenter des actions désactivées', () => {
    const user = actor(['manage academic finance'], true);
    const markup = sidebar('admin', null, { props: propsFor(user), url: '/app/dashboard/admin/finance' });
    assert.ok(linkTag(markup, '/app/dashboard/admin/finance'));
    assert.equal(linkTag(markup, '/app/dashboard/admin/schedule/resources'), undefined);
    assert.equal(linkTag(markup, '/app/dashboard/admin/assessments'), undefined);
    assert.equal(linkTag(markup, '/app/dashboard/admin/official-documents'), undefined);
    assert.doesNotMatch(markup, /Accès restreint|À venir|aria-disabled="true"/);
    const visible = admin.exports.visibleAdminNavigation(user);
    for (const group of admin.exports.adminNavigation) {
        assert.equal(Boolean(buttonTag(markup, group.id)), visible.some(item => item.id === group.id), group.id);
    }
});

test('Le mobile masque un panneau fermé et conserve le lien actif dans le panneau ouvert', () => {
    const user = actor(['manage academic finance']);
    const group = groupFor('/app/dashboard/admin/finance', user);
    const options = { props: propsFor(user), url: '/app/dashboard/admin/finance', isMobile: true };
    const closed = sidebar('admin', group.id, options);
    assert.match(buttonTag(closed, group.id), /aria-expanded="false"/);
    assert.match(closed, new RegExp(`id="sidebar-panel-${group.id}"[^>]+inert="" aria-hidden="true"`));
    const opened = sidebar('admin', group.id, { ...options, isMobileSidebarOpen: true });
    assert.match(buttonTag(opened, group.id), /aria-expanded="true"/);
    assert.match(opened, new RegExp(`id="sidebar-panel-${group.id}"[^>]+aria-hidden="false"`));
    assert.match(linkTag(opened, '/app/dashboard/admin/finance'), /aria-current="page"/);
});

test('Les rôles super admin et admin utilisent les mêmes permissions déléguées', () => {
    const user = actor([], true);
    const markup = sidebar('super admin', null, { props: propsFor(user) });
    assert.equal(linkTag(markup, '/app/dashboard/admin/finance'), undefined);
    assert.equal(linkTag(markup, '/app/dashboard/admin/schedule/resources'), undefined);
});

test('L’espace étudiant conserve les destinations de son année et ses accès propres', () => {
    const markup = sidebar('student', 'academics', { props: { studentPortalActive: true, academic: { id: 7 }, permissions: { courses_view: { allowed: true }, schedule_view: { allowed: true } } }, url: '/app/dashboard/student/courses?academic=7' });
    assert.ok(linkTag(markup, '/app/dashboard/student/courses?academic=7'));
    assert.doesNotMatch(markup, /data-admin-sidebar|\/app\/dashboard\/admin/);
});

function elements(view) {
    if (!view || typeof view !== 'object') return [];
    if (Array.isArray(view)) return view.flatMap(elements);
    return [view, ...elements(view.props?.children)];
}

test('Ouvrir un panneau garde les contrôles clavier existants et Échap restaure le focus', () => {
    const effects = [];
    const listeners = new Map();
    let closeCount = 0, focusedTrigger = 0, focusedClose = 0, clickedGroup = null;
    const user = actor(['manage academic finance']);
    const group = groupFor('/app/dashboard/admin/finance', user);
    page = { props: propsFor(user), url: '/app/dashboard/admin/finance' };
    const component = sidebarModule({
        ...React,
        useState: initial => [initial, () => {}],
        useRef: value => ({ current: value }),
        useCallback: callback => callback,
        useEffect: effect => effects.push(effect),
    }, { document: { addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) } });
    const view = component({ userRole: 'admin', currentActiveMenu: group.id, isMobile: false, isMobileSidebarOpen: false, onButtonClick: (...args) => { clickedGroup = args[1]; }, onCloseMenu: () => closeCount++, onLogout: () => {} });
    const trigger = elements(view).find(item => item.type === 'button' && item.props['data-menu'] === group.id);
    trigger.props.onClick({ preventDefault() {}, stopPropagation() {} });
    assert.equal(clickedGroup, group.id);
    for (const item of elements(view)) {
        if (item.props?.['data-dashboard-rail'] !== undefined) item.props.ref.current = { querySelector: () => ({ focus: () => focusedTrigger++ }) };
        if (typeof item.props?.ref === 'function') item.props.ref({ querySelector: () => ({ focus: () => focusedClose++ }) });
    }
    const cleanup = effects.map(effect => effect());
    assert.equal(focusedClose, 1);
    listeners.get('keydown')({ key: 'Escape', defaultPrevented: false });
    assert.equal(closeCount, 1);
    assert.equal(focusedTrigger, 1);
    listeners.get('keydown')({ key: 'Escape', defaultPrevented: true });
    assert.equal(closeCount, 1);
    for (const dispose of cleanup) dispose?.();
    assert.equal(listeners.size, 0);
});

test('Le rôle candidate accède au suivi de ses candidatures', () => {
    const markup = sidebar('candidate', 'enrollments');
    assert.match(markup, /href="\/app\/dashboard\/enrollments"/);
    assert.doesNotMatch(markup, /href="\/app\/dashboard\/teacher/);
});
