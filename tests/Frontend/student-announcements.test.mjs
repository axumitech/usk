import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../../resources/js/pages/dashboard/student/Announcements.tsx', import.meta.url), 'utf8');
const paginationSource = await readFile(new URL('../../resources/js/components/admin/Pagination.tsx', import.meta.url), 'utf8');
const compile = value => ts.transpileModule(value, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const link = ({ children, ...props }) => {
    delete props.preserveScroll;
    delete props.preserveState;
    return React.createElement('a', props, children);
};
const pagination = { exports: {} };
vm.runInNewContext(compile(paginationSource), { module: pagination, exports: pagination.exports, require: name => name === '@inertiajs/react' ? { Link: link } : require(name) });
const module = { exports: {} };
vm.runInNewContext(compile(source), {
    module, exports: module.exports, URLSearchParams, URL,
    require(name) {
        if (name === '@inertiajs/react') return { Link: link, Head: () => null, usePoll: () => undefined };
        if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
        if (name === '@/components/layouts/Dashboard/Dashboard') return { default: ({ children }) => React.createElement('main', {}, children) };
        if (name === '@/components/admin/Pagination') return pagination.exports;
        if (name === '@/components/student/StudentChrome') return { StudentYearSelect: () => React.createElement('select', { 'aria-label': 'Année académique' }) };
        if (name === '@/components/student/navigation') return { studentHref: (section, academic) => `/app/dashboard/student/${section}?academic=${academic}` };
        if (name === '@/lib/scheduleDates') return { zone: 'Africa/Kinshasa' };
        if (name.endsWith('.css')) return {};
        return require(name);
    },
});
const Announcements = module.exports.default;
const row = overrides => ({
    id: 19, kind: 'text', title: 'Calendrier universitaire', course: 'Informatique', faculty: 'Faculté des sciences',
    date: '2026-11-18T08:30:00+01:00', recent: true, excerpt: null, description: null, filename: null, format: null,
    size_bytes: null, preview_url: null, download_url: null, source_url: null,
    detail_url: '/app/dashboard/student/announcements?academic=7&announcement=19',
    share_url: '/app/dashboard/student/announcements?announcement=19', ...overrides,
});
const base = overrides => ({
    academic_id: 7, year: '2026–2027', faculty: 'Faculté des sciences', filter: 'all', index_url: '/app/dashboard/student/announcements?academic=7',
    stats: { total: 0, recent: 0, media: 0 }, filters: [{ key: 'all', label: 'Toutes', count: 0, url: '/app/dashboard/student/announcements?academic=7' }],
    items: { data: [], links: [], total: 0 }, featured: null, selected: null, related: [], ...overrides,
});
const render = (announcements, studentChrome = null) => renderToStaticMarkup(React.createElement(Announcements, { announcements, studentChrome }));

test('La liste vide explique qu’aucune annonce n’est publiée pour l’inscription', () => {
    assert.match(render(base()), /Aucune annonce publiée pour cette inscription/);
});

test('Le payload absent est signalé sans erreur bloquante ni faux état vide', () => {
    for (const payload of [undefined, null]) {
        const html = render(payload);
        assert.match(html, /role="alert"/);
        assert.match(html, /momentanément indisponibles/);
        assert.doesNotMatch(html, /Aucune annonce publiée/);
    }
});

test('Une annonce textuelle garde son contexte, sa date et les contenus échappés', () => {
    const item = row({ description: 'Texte <script>alert(1)</script> du cours.' });
    const html = render(base({ selected: item }));
    assert.match(html, /Calendrier universitaire/);
    assert.match(html, /Faculté des sciences/);
    assert.match(html, /Informatique/);
    assert.match(html, /dateTime="2026-11-18T08:30:00\+01:00"/);
    assert.match(html, /18 novembre 2026/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /announcements\?academic=7#resource-19/);
});

test('Les types média absents ou inconnus utilisent une annonce textuelle au lieu de planter', () => {
    for (const kind of [null, undefined, 'ancien-format']) {
        const item = row({ kind, date: null });
        const detail = render(base({ selected: item, related: [null, row({ id: 20, kind })] }));
        assert.match(detail, /Calendrier universitaire/);
        assert.match(detail, /data-kind="text"/);
        const listing = render(base({ items: { data: [null, item], links: [], total: 1 } }));
        assert.match(listing, /Calendrier universitaire/);
    }
});

test('Les collections nulles et métadonnées absentes ne bloquent pas l’affichage', () => {
    const html = render(base({ items: null, filters: null, stats: null, related: null }), { options: null });
    assert.match(html, /Aucune annonce publiée pour cette inscription/);
    const detail = render(base({ selected: row({ date: 'date invalide', course: null, faculty: null, description: null }), related: null }));
    assert.doesNotMatch(detail, /<time|Invalid Date/);
});

test('Une photo possède un aperçu privé et un libellé accessible', () => {
    const html = render(base({ selected: row({ kind: 'photo', preview_url: '/app/dashboard/student/resources/19/preview?academic=7', download_url: '/app/dashboard/student/resources/19/download?academic=7' }) }));
    assert.match(html, /<img[^>]*src="\/app\/dashboard\/student\/resources\/19\/preview\?academic=7"/);
    assert.match(html, /alt="Photo associée à l’annonce Calendrier universitaire"/);
    assert.match(html, /Télécharger la photo/);
});

test('Une vidéo locale utilise le lecteur mobile et une vidéo externe un lien sécurisé', () => {
    const local = render(base({ selected: row({ kind: 'video', preview_url: '/app/dashboard/student/resources/19/preview?academic=7' }) }));
    assert.match(local, /<video[^>]*controls=""[^>]*playsInline=""[^>]*preload="metadata"/);
    const external = render(base({ selected: row({ kind: 'video', source_url: 'https://www.youtube.com/watch?v=example' }) }));
    assert.match(external, /href="https:\/\/www.youtube.com\/watch\?v=example"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
    assert.match(external, /Voir la vidéo/);
});

test('Un document affiche ses accès privés et tolère une taille absente', () => {
    const html = render(base({ selected: row({ kind: 'document', filename: 'calendrier.pdf', size_bytes: undefined, preview_url: '/private-preview', download_url: '/private-download' }) }));
    assert.match(html, /calendrier.pdf/);
    assert.match(html, /href="\/private-preview"/);
    assert.match(html, /href="\/private-download"/);
    assert.doesNotMatch(html, /NaN|undefined Mo/);
});

test('Plusieurs annonces conservent leurs liens et l’annonce à la une n’est pas dupliquée', () => {
    const featured = row();
    const second = row({ id: 20, title: 'Deuxième annonce', detail_url: '/app/dashboard/student/announcements?academic=7&announcement=20' });
    const html = render(base({ featured, items: { data: [featured, second], links: [], total: 2 }, stats: { total: 2, recent: 2, media: 0 } }));
    assert.equal((html.match(/Calendrier universitaire/g) || []).length, 1);
    assert.match(html, /announcement=20/);
    assert.match(html, /Deuxième annonce/);
});
