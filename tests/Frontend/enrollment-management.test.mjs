import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
async function load(path) {
    const source = await readFile(new URL(`../../resources/js/${path}`, import.meta.url), 'utf8');
    const module = { exports: {} };
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(output, { module, exports: module.exports, route: (name, value) => `/route/${name}?${typeof value === 'object' ? new URLSearchParams(value) : `id=${value}`}`, URLSearchParams, crypto: { randomUUID: () => 'operation-key' }, require(name) {
        if (name.endsWith('.css')) return {};
        if (name === '@inertiajs/react') return { Head: () => null, Link: ({ children, ...props }) => React.createElement('a', props, children), useForm: data => ({ data, errors: {}, processing: false }) };
        if (name === '@/components/layouts/Dashboard/Dashboard') return { default: ({ children }) => React.createElement('div', {}, children) };
        if (name === '@/components/admin/Pagination') return { default: () => null };
        if (name === '@/lib/scheduleDates') return { localDate: () => '2026-11-14' };
        if (name === '@/lib/studentEnrollment') return studentEnrollment;
        if (name === './StudentChrome') return { StudentYearSelect: () => null };
        if (name === '@/components/student/types') return { labels: { confirmed: 'Confirmée' }, money: value => String(value) };
        if (name === './navigation') return navigation;
        if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
        return require(name);
    } });
    return module.exports;
}
const navigation = await load('components/student/navigation.ts');
const studentEnrollment = await load('lib/studentEnrollment.ts');
const MyEnrollments = (await load('pages/dashboard/studentAcademic/MyEnrollments.tsx')).default;
const Landing = (await load('components/student/ModuleLanding.tsx')).default;
const Scolarite = (await load('components/student/StudentSchoolServices.tsx')).default;
const entry = { id: 7, year: '2026-2027', level: 'Niveau 1', status: 'confirmed', matricule: 'PERMANENT', faculty: 'Faculté', program: 'Programme historique', curriculum: 'V1', promotion: 'Promotion annuelle', group: 'Groupe A', requirements: ['Contrôle administratif à terminer.'], renewal: null };

test('L’entrée Inscriptions ouvre la page annuelle et les changements utilisent les demandes existantes', () => {
    const administration = navigation.studentModules.find(item => item.id === 'services');
    assert.equal(administration.items.find(item => item.label === 'Inscriptions').section, 'enrollments');
    const html = renderToStaticMarkup(React.createElement(Scolarite, { section: 'services', academic: entry, data: {
        categories: [{ id: 'academic', label: 'Démarches académiques', description: 'Parcours', procedures: [] }],
        active_category: null, active_procedure: null, counts: { open: 1, resolved: 0, total: 1 },
    } }));
    assert.match(html, /href="\/app\/dashboard\/student\/enrollments"/);
    assert.doesNotMatch(html, /href="\/app\/dashboard\/enrollments"/);
    assert.match(html, /href="\/app\/dashboard\/student\/requests\?academic=7"/);
    assert.match(html, /href="\/app\/dashboard\/student\/services\?academic=7&amp;category=academic"/);
});

test('Le suivi distingue le rendez-vous confirmé du créneau souhaité et conserve la réponse', () => {
    const ticket = {
        id: 12,
        status: 'resolved',
        status_group: 'resolved',
        subject: 'Rendez-vous avec le service financier',
        created_at: '2026-11-14T09:00:00Z',
        appointment_date: '2026-11-18',
        appointment_period: 'morning',
        appointment_confirmed: { date: '2026-11-19', time: '14:30', location: 'Bâtiment B, bureau 04' },
    };
    const renderTicket = (selected) => renderToStaticMarkup(React.createElement(Scolarite, { section: 'requests', academic: entry, data: {
        categories: [], active_category: null, active_procedure: null, status: 'all', selected_request: selected,
    } }));

    const confirmed = renderTicket(ticket);
    assert.match(confirmed, />Confirmé<\/span>/);
    assert.match(confirmed, /Rendez-vous confirmé/);
    assert.match(confirmed, /19 novembre 2026 à 14:30/);
    assert.match(confirmed, /Bâtiment B, bureau 04/);
    assert.match(confirmed, /Date souhaitée · 18 novembre 2026 · Le matin/);
    assert.doesNotMatch(confirmed, /La réponse du service s’affichera ici/);
    assert.match(renderTicket({ ...ticket, response: 'Présentez votre carte étudiante.' }), /Présentez votre carte étudiante/);

    const waiting = renderTicket({ ...ticket, status: 'open', status_group: 'open', appointment_confirmed: null });
    assert.match(waiting, />En cours<\/span>/);
    assert.doesNotMatch(waiting, /Rendez-vous confirmé/);
    assert.match(waiting, /Date souhaitée · 18 novembre 2026 · Le matin/);
    assert.match(waiting, /La réponse du service s’affichera ici/);

    const reserved = renderTicket({
        ...ticket,
        status: 'open',
        status_group: 'open',
        appointment_confirmed: null,
        appointment_reservation: { date: '2026-11-19', time: '14:30', end_time: '15:00' },
    });
    assert.match(reserved, />À confirmer<\/span>/);
    assert.match(reserved, /Créneau réservé, en attente de confirmation/);
    assert.match(reserved, /19 novembre 2026 de 14:30 à 15:00/);
    assert.doesNotMatch(reserved, /Rendez-vous confirmé|Date souhaitée/);

    const cancelled = renderTicket({
        ...ticket,
        status: 'cancelled',
        appointment_confirmed: null,
        appointment_cancelled: { ...ticket.appointment_confirmed, cancelled_at: '2026-11-17T09:00:00Z', reason: 'Fermeture du bureau.' },
        response: 'Présentez votre carte étudiante.',
    });
    assert.match(cancelled, /data-status="cancelled">Annulé<\/span>/);
    assert.match(cancelled, /Rendez-vous annulé/);
    assert.match(cancelled, /Créneau annulé · <time[^>]*>19 novembre 2026 à 14:30/);
    assert.match(cancelled, /Bâtiment B, bureau 04/);
    assert.match(cancelled, /Annulé le <time[^>]*>17 novembre 2026 à 10:00/);
    assert.match(cancelled, /Motif de l’annulation.*Fermeture du bureau\./);
    assert.match(cancelled, /Date souhaitée · 18 novembre 2026 · Le matin/);
    assert.match(cancelled, /Présentez votre carte étudiante/);
    assert.match(cancelled, /Réponse précédente de l’administration/);
    assert.doesNotMatch(cancelled, /Rendez-vous confirmé|La réponse du service s’affichera ici/);
});

test('Une demande de rendez-vous présente les créneaux fournis et empêche un envoi sans sélection', () => {
    const procedure = { id: 'finance-appointment', label: 'Rendez-vous avec le service financier', description: 'Rendez-vous', service: 'Finances', mode: 'request' };
    const renderPicker = (slots) => renderToStaticMarkup(React.createElement(Scolarite, { section: 'services', academic: entry, data: {
        categories: [{ id: 'appointments', label: 'Rendez-vous', description: 'Services', procedures: [procedure] }],
        active_category: 'appointments', active_procedure: procedure.id, appointment_slots: slots,
    } }));
    const picker = renderPicker([
        { date: '2026-11-19', time: '09:00', end_time: '09:30' },
        { date: '2026-11-19', time: '14:30', end_time: '15:00' },
        { date: '2026-11-20', time: '10:00', end_time: '10:30' },
    ]);
    assert.match(picker, /name="appointment_slot" value="2026-11-19T09:00"/);
    assert.match(picker, /name="appointment_slot" value="2026-11-19T14:30"/);
    assert.match(picker, /<option value="2026-11-20">/);
    assert.doesNotMatch(picker, /type="date"|name="appointment_period"/);
    const empty = renderPicker([]);
    assert.match(empty, /Aucun créneau libre pour ce service/);
    assert.match(empty, /<button type="submit"[^>]* disabled=""/);
});

test('Les liens étudiants conservent le contexte des pages et ouvrent les listes transversales', () => {
    const { studentHref, studentModules } = navigation;
    const items = studentModules.flatMap(module => module.items);
    assert.ok(items.every(item => item.section));
    assert.equal(new Set(items.map(item => studentHref(item.section, 7, item.hash))).size, items.length);
    assert.equal(studentHref('overview', 7, 'home-schedule'), '/app/dashboard/student/overview?academic=7#home-schedule');
    assert.equal(studentHref('absences', 7), '/app/dashboard/student/absences');
    assert.equal(studentHref('enrollments', 7), '/app/dashboard/student/enrollments');
});

test('Les onglets du portail distinguent la lecture d’une page et les actions réglementées', () => {
    const { studentSectionAccess } = navigation;
    const permissions = {
        courses_view: { allowed: true },
        assignments_submit: { allowed: false },
        materials_download: { visible: false, allowed: false },
        schedule_view: { allowed: false, reason: 'Horaire fermé.' },
        results_view: { allowed: false },
    };
    assert.equal(studentSectionAccess('assignments', permissions).allowed, true);
    assert.equal(studentSectionAccess('materials', permissions).visible, false);
    assert.equal(studentSectionAccess('schedule', permissions).reason, 'Horaire fermé.');
    assert.equal(studentSectionAccess('results', permissions).allowed, false);
    assert.equal(studentSectionAccess('courses').allowed, false);
    assert.equal(studentSectionAccess('overview').allowed, true);

    const html = renderToStaticMarkup(React.createElement(Landing, { section: 'academics', academic: 7, permissions }));
    assert.match(html, /href="\/app\/dashboard\/student\/assignments\?academic=7"/);
    assert.doesNotMatch(html, /href="\/app\/dashboard\/student\/(?:schedule|materials)\?/);
});

test('La page annuelle présente promotion, groupe et conditions sans proposer une réinscription sans décision', () => {
    const html = renderToStaticMarkup(React.createElement(MyEnrollments, { entries: { data: [entry] }, changes: { data: [] } }));
    for (const text of ['PERMANENT', 'Programme historique', 'Promotion annuelle', 'Groupe A', 'Contrôle administratif à terminer.']) assert.ok(html.includes(text));
    assert.doesNotMatch(html, /Demander ma réinscription/);
});

test('Une décision ouverte propose la demande ; une cible existante ouvre son propre contexte', () => {
    const renewal = { id: 12, year: '2027-2028', level: 'Niveau 2', target_id: null, can_start: true };
    const html = renderToStaticMarkup(React.createElement(MyEnrollments, { entries: { data: [{ ...entry, renewal }] }, changes: { data: [] } }));
    assert.match(html, /Demander ma réinscription/);
    assert.match(html, /2027-2028/);
    const started = renderToStaticMarkup(React.createElement(MyEnrollments, { entries: { data: [{ ...entry, renewal: { ...renewal, target_id: 18, can_start: false } }] }, changes: { data: [] } }));
    assert.match(started, /Consulter la réinscription/);
    assert.match(started, /academic=18/);
    assert.doesNotMatch(started, /Demander ma réinscription/);
});
