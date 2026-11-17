/* global exports, process, require */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs = require('node:fs/promises');
const path = require('node:path');

const id = (value) => typeof value === 'object' && value !== null ? value.id : value;
const base = '/app/dashboard';

exports.run = async ({ fixture, origin, artifacts, login, capture, check, newPage, record, assertNoErrors }) => {
    check(['127.0.0.1', 'localhost', '::1', '[::1]'].includes(new URL(origin).hostname), 'La recette mobile utilise le serveur local isolé');
    const output = { viewport: { width: 390, height: 844 }, actors: [], failures: [] };
    const accounts = fixture.accounts;
    const actors = [
        ['institutional', 'Administrateur institutionnel', null],
        ['dean_med', 'Doyen Médecine', 'med'],
        ['vice_med', 'Vice-doyen Médecine', 'med'],
        ['registrar_med', 'Appariteur Médecine', 'med'],
        ['finance_med', 'Agent financier Médecine', 'med'],
        ['teacher_med', 'Professeur Médecine', 'med'],
        ['teacher_law', 'Professeur Droit', 'law'],
        ['student_med', 'Étudiant Médecine', 'med'],
        ['student_law', 'Étudiant Droit', 'law'],
        ['candidate', 'Candidat', null],
    ];
    const state = (page) => page.locator('#app').evaluate((element) => JSON.parse(element.getAttribute('data-page')).props);

    function targets(key, faculty) {
        if (key.startsWith('teacher_')) return [
            { key: 'accueil', path: `${base}/teacher`, heading: /^Bonjour/ },
            { key: 'cours', path: `${base}/teacher?view=courses`, heading: 'Mes cours' },
            { key: 'planning', path: `${base}/teacher?view=schedule&year=${id(fixture.year)}&week=${fixture.week}&day=${fixture.session_day}`, heading: 'Mon emploi du temps' },
        ];
        if (key.startsWith('student_')) {
            const entry = id(fixture.students[faculty].entry);
            return [
                { key: 'accueil', path: `${base}/student?academic=${entry}`, heading: /^Bonjour/ },
                { key: 'cours', path: `${base}/student/courses?academic=${entry}`, heading: 'Mes cours' },
                { key: 'planning', path: `${base}/student/schedule?academic=${entry}&week=${fixture.week}&day=${fixture.session_day}`, heading: 'Emploi du temps' },
                { key: 'finances', path: `${base}/student/fees?academic=${entry}`, heading: 'Finances' },
            ];
        }
        if (key === 'candidate') return [
            { key: 'accueil', path: base, heading: /^(Mes candidatures|Bonjour)/ },
            { key: 'candidatures', path: `${base}/enrollments`, heading: 'Mes candidatures' },
        ];
        const pages = [{ key: 'accueil', path: base, heading: 'Vue d’ensemble' }];
        const permissions = accounts[key].permissions || [];
        if (permissions.includes('publish academic content')) {
            pages.push({ key: 'planning', path: `${base}/admin/schedule?academic_year_id=${id(fixture.year)}&week=${fixture.week}`, heading: 'Horaires des cours' });
        }
        if (permissions.includes('manage academic access')) {
            pages.push({ key: 'admissions', path: `${base}/admin/enrollments`, heading: 'Candidatures', level: 2 });
        }
        if (permissions.includes('manage academic finance')) {
            pages.push({ key: 'finances', path: `${base}/admin/finance`, heading: 'Finances universitaires' });
        }
        return pages;
    }

    for (const [key, label, faculty] of actors) {
        const account = accounts[key] || fixture.students[faculty];
        if (!account?.email) {
            output.failures.push({ actor: key, reason: 'Compte de recette absent de la fixture' });
            continue;
        }
        const page = await newPage({ viewport: output.viewport, isMobile: true, hasTouch: true });
        const actor = { key, faculty, pages: [], javascript_errors: [], console_errors: [], failed_requests: [] };
        const proofs = [];
        const redact = (message) => String(message).split(process.env.USK_RECIPE_PASSWORD || '\0').join('[secret]').slice(0, 1000);
        page.on('pageerror', (error) => actor.javascript_errors.push(redact(error.message)));
        page.on('console', (message) => {
            if (message.type() === 'error') actor.console_errors.push(redact(message.text()));
        });
        page.on('requestfailed', (request) => {
            const url = new URL(request.url());
            actor.failed_requests.push({ method: request.method(), path: url.pathname, error: request.failure()?.errorText });
        });

        try {
            await login(page, account.email);
            for (const target of targets(key, faculty)) {
                const response = await page.goto(new URL(target.path, origin).href);
                check(response && response.status() < 400, `${label} ouvre ${target.key} sur mobile`);
                await page.getByRole('heading', { name: target.heading, exact: typeof target.heading === 'string', level: target.level || 1 })
                    .first().waitFor({ state: 'visible' });
                await page.waitForLoadState('networkidle');
                const data = await state(page);
                check(Object.keys(data.errors || {}).length === 0, `${label} consulte ${target.key} sans erreur serveur`);
                if (key.startsWith('student_')) {
                    check(Number(data.academic?.id) === Number(id(fixture.students[faculty].entry)), 'Contexte annuel étudiant conservé');
                    if (target.key === 'cours') {
                        check(data.courses.some((course) => Number(course.course_id) === Number(id(fixture.courses[faculty]))), 'Cours attendu présent dans sa faculté');
                        const other = faculty === 'med' ? 'law' : 'med';
                        check(!data.courses.some((course) => Number(course.course_id) === Number(id(fixture.courses[other]))), 'Cours privé de l’autre faculté absent');
                    }
                    if (target.key === 'planning') {
                        check(data.sessions.some((session) => Number(session.course_id) === Number(id(fixture.courses[faculty]))), 'Séance publiée présente dans le planning étudiant');
                    }
                }
                if (key.startsWith('teacher_') && target.key === 'cours') {
                    const courses = data.offerings?.data || [];
                    check(courses.some((course) => Number(course.id) === Number(id(fixture.offerings[faculty]))), 'Affectation du professeur affichée');
                    const other = faculty === 'med' ? 'law' : 'med';
                    check(!courses.some((course) => Number(course.id) === Number(id(fixture.offerings[other]))), 'Affectation du collègue absente');
                }
                if (key.startsWith('teacher_') && target.key === 'planning') {
                    const sessions = data.overview.week.days.flatMap((day) => day.sessions);
                    check(sessions.some((session) => Number(session.offering_id) === Number(id(fixture.offerings[faculty]))), 'Séance publiée présente dans le planning professeur');
                }
                const dimensions = await page.evaluate(() => ({
                    viewport: innerWidth,
                    document: document.documentElement.scrollWidth,
                    body: document.body.scrollWidth,
                }));
                const proof = await capture(page, `mobile-${key}-${target.key}`);
                proofs.push(proof);
                actor.pages.push({ key: target.key, path: new URL(page.url()).pathname, status: response.status(), dimensions, proof });
                if (assertNoErrors) await assertNoErrors(page);
                check(actor.javascript_errors.length === 0, 'Aucune exception JavaScript pendant le parcours mobile');
            }
            record(`MOBILE-${key}`, label, 'Connexion par formulaire et consultation mobile des écrans essentiels',
                'Pages autorisées accessibles et contexte du compte conservé, sans exception JavaScript',
                `${actor.pages.length} écrans consultés à 390 × 844`, proofs, faculty);
        } catch (error) {
            const proof = await capture(page, `mobile-${key}-interruption`).catch(() => null);
            output.failures.push({ actor: key, reason: redact(error.message), proof });
            record(`MOBILE-${key}-BLOCK`, label, 'Connexion et consultation mobile des écrans essentiels',
                'Pages autorisées accessibles sans exception JavaScript', redact(error.message), proof ? [proof] : [], faculty);
        } finally {
            output.actors.push(actor);
            await page.close();
        }
    }
    await fs.writeFile(path.join(artifacts, 'mobile-roles.json'), JSON.stringify(output, null, 2));
    check(output.failures.length === 0, `Recette mobile achevée, ${output.failures.length} parcours en échec, détails dans mobile-roles.json`);
    return output;
};
