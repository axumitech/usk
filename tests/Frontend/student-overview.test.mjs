import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const icons = new Proxy({}, { get: () => () => null });
const source = await readFile(new URL('../../resources/js/components/student/StudentOverview.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
const dateSource = await readFile(new URL('../../resources/js/lib/scheduleDates.ts', import.meta.url), 'utf8');
const dateModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(dateSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: dateModule, exports: dateModule.exports });
const examSource = await readFile(new URL('../../resources/js/components/student/ScheduleExamPeriods.tsx', import.meta.url), 'utf8');
const examModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(examSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, { module: examModule, exports: examModule.exports, require: name => name === '@/lib/scheduleDates' ? dateModule.exports : require(name) });
const programSource = await readFile(new URL('../../resources/js/components/student/programCalendar.ts', import.meta.url), 'utf8');
const programModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(programSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: programModule, exports: programModule.exports });
const navSource = await readFile(new URL('../../resources/js/components/student/navigation.ts', import.meta.url), 'utf8');
const navModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(navSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: navModule, exports: navModule.exports, URLSearchParams, require: name => name === 'lucide-react' ? icons : require(name) });
const cardsSource = await readFile(new URL('../../resources/js/components/student/StudentCourseCards.tsx', import.meta.url), 'utf8');
const cardsModule = { exports: {} };
const link = ({ children, ...props }) => React.createElement('a', props, children);
vm.runInNewContext(ts.transpileModule(cardsSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: cardsModule, exports: cardsModule.exports, require(name) {
        if (name === '@inertiajs/react') return { Link: link };
        if (name === 'lucide-react') return icons;
        if (name.endsWith('.css')) return {};
        return require(name);
    },
});
const module = { exports: {} };
vm.runInNewContext(outputText, { module, exports: module.exports, require(name) {
    if (name === '@inertiajs/react') return { Link: link };
    if (name === 'lucide-react') return icons;
    if (name === './StudentCourseCards') return cardsModule.exports;
    if (name === './PortalCards') return { EmptyState: ({ title, children }) => React.createElement('div', {}, title, children) };
    if (name === '@/lib/scheduleDates') return dateModule.exports;
    if (name === './ScheduleExamPeriods') return examModule.exports;
    if (name === './programCalendar') return programModule.exports;
    if (name === './navigation') return navModule.exports;
    if (name === './types') return { money: value => `${value / 100} USD` };
    return require(name);
} });
const Overview = module.exports.default;
const base = () => ({ academic: { id: 7, application_uuid: 'own-application' }, balance: { assessed: false, overdue_cents: 0 }, permissions: { results_view: { allowed: true }, courses_view: { allowed: true }, schedule_view: { allowed: true } }, data: { schedule_week: '2026-11-02', generated_at: '2026-11-02T23:30:00+01:00', today_count: 0, week_count: 0, course_count: 0, today_sessions: [], week_sessions: [], alerts: [], latest_results: [], announcements: [], upcoming_evaluations: [] } });
test('L’accueil présente l’horaire, les cours, les frais et les évaluations sans inventer de montants', () => {
    const props = base(); props.permissions.evaluations_participate = { allowed: false };
    props.data.upcoming_events = [{ id: 12, title: 'Examens de novembre', start_date: '2026-11-18', end_date: '2026-11-20', detail_url: '/app/dashboard/student/program/12?academic=7' }];
    const html = renderToStaticMarkup(React.createElement(Overview, props));
    assert.match(html, /program\/12\?academic=7[^>]*>.*Examens de novembre/);
    assert.ok(html.indexOf('Horaire du jour') < html.indexOf('Mes cours'));
    assert.ok(html.indexOf('Mes cours') < html.indexOf('Frais obligatoires'));
    assert.ok(html.indexOf('Frais obligatoires') < html.indexOf('Évaluations en cours'));
    assert.match(html, /Frais à confirmer/); assert.doesNotMatch(html, /0 USD/);
    assert.match(html, /schedule\?academic=7/); assert.match(html, /Aucune évaluation en cours/);
});
test('Le rappel affiche les seuls frais affectés et protège les évaluations sous condition', () => {
    const props = base(); props.permissions.evaluations_participate = { allowed: false };
    props.data.fee_summary = [{kind:'tuition',title:'Frais académiques',balance:{due_cents:10000,paid_cents:2500,balance_cents:7500,overdue_cents:0}}];
    props.balance = { assessed:true,balance_cents:7500,currency:'USD' };
    props.data.ongoing_evaluations = [{id:8,title:'Interrogation publiée',course:'Droit',closes_at:'2026-11-03T18:00:00+01:00',excerpt:'Énoncé confidentiel'}];
    const html = renderToStaticMarkup(React.createElement(Overview, props));
    assert.match(html, /100 USD/);assert.match(html, /25 USD/);assert.match(html, /75 USD/);
    assert.match(html, /Conditions d’accès/);assert.doesNotMatch(html, /Énoncé confidentiel/);
    assert.match(html, /fees\?academic=7/);
    props.permissions.evaluations_participate.allowed = true;
    const allowed = renderToStaticMarkup(React.createElement(Overview, props));
    assert.match(allowed, /evaluations\?academic=7&amp;work=8/);
});

test('L’horaire du jour ignore les séances et les examens des autres jours', () => {
    const props = base();
    props.data.generated_at = '2026-11-02T23:30:00Z';
    props.data.today_sessions = [
        { id: 1, course_id: 12, course: 'Droit public', starts_at: '2026-11-02T23:00:00Z', ends_at: '2026-11-03T01:00:00Z', room: 'Salle 12', ongoing: true },
    ];
    props.data.week_sessions = [{ id: 2, course: 'Cours du lendemain' }];
    props.calendarEvents = [
        { id: 1, title: 'Examen du jour', category_label: 'Examens', start_date: '2026-11-03', end_date: '2026-11-03' },
        { id: 2, title: 'Examen du lendemain', category_label: 'Examens', start_date: '2026-11-04', end_date: '2026-11-04' },
    ];
    const html = renderToStaticMarkup(React.createElement(Overview, props));
    assert.match(html, /mardi 3 novembre/);
    assert.match(html, /Droit public/);
    assert.match(html, /Salle 12/);
    assert.match(html, /En cours/);
    assert.match(html, /Examen du jour/);
    assert.match(html, /courses\/12\?academic=7&amp;focus_session=1&amp;from=overview/);
    assert.match(html, /schedule\?academic=7&amp;day=2026-11-03/);
    assert.doesNotMatch(html, /du lendemain/);

    props.permissions.courses_view.allowed = false;
    const restricted = renderToStaticMarkup(React.createElement(Overview, props));
    assert.match(restricted, /Droit public/);
    assert.doesNotMatch(restricted, /focus_session/);
});

test('Les annonces récentes de l’accueil ouvrent leur fiche dans l’année sélectionnée', () => {
    const props = base();
    props.data.announcements = [
        { id: 19, kind: 'photo', title: 'Journée portes ouvertes', faculty: 'Faculté des sciences', date: '2026-11-03T08:00:00+01:00', preview_url: '/announcements/19/photo', detail_url: '/app/dashboard/student/announcements?academic=7&announcement=19' },
        { id: 17, kind: 'document', title: 'Calendrier des examens', course: 'Droit', updated_at: '2026-11-02T08:00:00+01:00' },
    ];
    const html = renderToStaticMarkup(React.createElement(Overview, props));
    assert.match(html, /Dernières annonces/);
    assert.match(html, /announcements\?academic=7&amp;announcement=19[^>]*>.*Journée portes ouvertes/);
    assert.match(html, /src="\/announcements\/19\/photo"[^>]*loading="lazy"/);
    assert.match(html, /Faculté des sciences/);
    assert.match(html, /announcements\?academic=7&amp;announcement=17[^>]*>.*Calendrier des examens/);

    props.permissions.courses_view.allowed = false;
    const restricted = renderToStaticMarkup(React.createElement(Overview, props));
    assert.doesNotMatch(restricted, /Journée portes ouvertes|Calendrier des examens/);
});

test('Les cartes de l’onglet Cours sont regroupées par semestre et ouvrent la fiche dans l’année choisie', () => {
    const course = (id, semester, title, extra = {}) => ({
        id, semester, title, code: `C${id}`, credits: 3, teacher: 'Nadia Kabasele',
        detail_url: `/app/dashboard/student/courses/${id}?academic=7`, ...extra,
    });
    const courses = [
        course(1, null, 'Stage'),
        course(2, '2e semestre', 'Droit public'),
        course(3, '1', 'Introduction au droit', { registered: true }),
        course(4, '1er semestre', 'Institutions', { credits: null, catalog_only: true }),
        course(5, '2e semestre', 'Économie'),
    ];
    const html = renderToStaticMarkup(React.createElement(cardsModule.exports.default, { courses }));
    assert.ok(html.indexOf('1er semestre') < html.indexOf('2e semestre'));
    assert.ok(html.indexOf('2e semestre') < html.indexOf('Semestre à préciser'));
    assert.equal(html.match(/1er semestre/g)?.length, 1);
    assert.match(html, /3 crédits inscrits/);
    assert.match(html, /courses\/3\?academic=7[^>]*class="student-course-card"/);
    assert.match(html, /Au programme/);
    assert.doesNotMatch(html, /null crédits/);
    const overview = renderToStaticMarkup(React.createElement(Overview, { ...base(), courses }));
    assert.equal(overview.match(/class="student-semester-group"/g)?.length, 3);
    assert.equal(overview.match(/class="student-course-card"/g)?.length, courses.length);
    assert.match(overview, /Économie/);
    assert.match(overview, /courses\/3\?academic=7[^>]*class="student-course-card"/);
});

test('L’accueil et Mes cours regroupent les EC et comptent les crédits inscrits de l’UE une seule fois', () => {
    const course = (id, title, extra) => ({
        id, title, semester: '1er semestre', code: `EC${id}`, credits: 4, teacher: null,
        detail_url: `/app/dashboard/student/courses/${id}?academic=7`, ...extra,
    });
    const unit = { unit_id: 9, unit: 'Bases informatiques', unit_code: 'INFO9', unit_credits: 6, unit_registered_credits: 6, unit_component_count: 3, unit_is_composite: true };
    const courses = [
        course(3, 'Algorithmique', { ...unit, registered: true, is_optional: false }),
        course(7, 'Communication', { registered: true, credits: 2 }),
        course(4, 'Structures de données', { ...unit, registered: true, is_optional: false }),
        course(5, 'Projet libre', { ...unit, is_optional: true, catalog_only: true }),
    ];
    for (const [Component, props] of [[cardsModule.exports.default, { courses }], [Overview, { ...base(), courses }]]) {
        const html = renderToStaticMarkup(React.createElement(Component, props));
        const unitCard = html.match(/<section class="student-course-unit-card"[^>]*>(.*?)<\/section>/)?.[1];
        assert.ok(unitCard);
        assert.match(unitCard, /UE composée.*INFO9.*3 cours au programme.*Bases informatiques.*6 crédits pour l’UE/);
        assert.match(unitCard, /courses\/3\?academic=7.*Algorithmique.*courses\/4\?academic=7.*Structures de données/);
        assert.match(unitCard, /Projet libre.*Optionnel.*Au programme/);
        assert.doesNotMatch(unitCard, /Communication/);
        assert.match(html, /8 crédits inscrits/);
    }
});
