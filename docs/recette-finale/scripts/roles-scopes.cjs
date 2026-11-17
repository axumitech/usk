/* global exports, require */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs = require('node:fs/promises');
const path = require('node:path');
const id = (value) => typeof value === 'object' && value !== null ? value.id : value;
const base = '/app/dashboard';

exports.run = async ({ fixture, origin, artifacts, newPage, login, capture, check, record, assertNoErrors }) => {
    const output = { actors: [], failures: [] };
    const props = (page) => page.locator('#app').evaluate((element) => JSON.parse(element.getAttribute('data-page')).props);
    const pages = [];
    const visit = async (page, target, expected = [200]) => {
        const response = await page.goto(new URL(target, origin).href);
        check(response && expected.includes(response.status()), `Route ${target} attend ${expected.join('/')} et reçoit ${response?.status()}`);
        if (response.status() === 200) await page.waitForLoadState('networkidle');
        return response.status();
    };

    const institution = await newPage();
    pages.push(institution);
    await login(institution, fixture.accounts.institutional.email);
    for (const faculty of ['med', 'law']) {
        await visit(institution, `${base}/admin/student-academic/${id(fixture.students[faculty].entry)}`);
        await visit(institution, `${base}/admin/teaching?offering=${id(fixture.offerings[faculty])}`);
        await visit(institution, `${base}/admin/finance?academic=${id(fixture.students[faculty].entry)}`);
    }
    await visit(institution, base);
    const institutional = await props(institution);
    check(institutional.dashboard.scope.label === 'Périmètre institutionnel', 'Compte institutionnel identifié comme tel');
    record('ROLE-INSTITUTION', 'Administrateur institutionnel', 'Consulter dossiers, offres et comptes financiers des deux facultés',
        'Accès aux deux facultés pour le compte institutionnel', 'Six routes accessibles, périmètre institutionnel affiché',
        [await capture(institution, 'roles-institutionnel')]);
    output.actors.push({ key: 'institutional', role: fixture.accounts.institutional.role, faculty: null, assertions: 7 });

    for (const faculty of ['med', 'law']) {
        const other = faculty === 'med' ? 'law' : 'med';
        for (const position of ['dean', 'vice', 'registrar', 'finance']) {
            const key = `${position}_${faculty}`;
            const account = fixture.accounts[key];
            const page = await newPage();
            pages.push(page);
            const observed = { key, role: account.role, faculty: account.faculty, permissions: account.permissions, routes: [] };
            try {
                await login(page, account.email);
                await visit(page, base);
                const dashboard = await props(page);
                check(dashboard.dashboard.scope.label === fixture.faculties[faculty + '_name']
                    || dashboard.dashboard.scope.label.toLowerCase().includes(faculty === 'med' ? 'médecine' : 'droit'), 'Faculté affichée sur son dashboard');
                const ownEntry = `${base}/admin/student-academic/${id(fixture.students[faculty].entry)}`;
                const foreignEntry = `${base}/admin/student-academic/${id(fixture.students[other].entry)}`;
                observed.routes.push({ path: ownEntry, status: await visit(page, ownEntry) });
                observed.routes.push({ path: foreignEntry, status: await visit(page, foreignEntry, [403, 404]) });
                const foreignProof = await capture(page, `roles-${key}-dossier-autre-faculte-refuse`);
                if (position === 'dean' || position === 'vice') {
                    const own = `${base}/admin/teaching?offering=${id(fixture.offerings[faculty])}`;
                    const foreign = `${base}/admin/teaching?offering=${id(fixture.offerings[other])}`;
                    observed.routes.push({ path: own, status: await visit(page, own) });
                    observed.routes.push({ path: foreign, status: await visit(page, foreign, [403, 404]) });
                    observed.routes.push({ path: `${base}/admin/finance`, status: await visit(page, `${base}/admin/finance`, [403, 404]) });
                } else if (position === 'finance') {
                    const own = `${base}/admin/finance?academic=${id(fixture.students[faculty].entry)}`;
                    const foreign = `${base}/admin/finance?academic=${id(fixture.students[other].entry)}`;
                    observed.routes.push({ path: own, status: await visit(page, own) });
                    observed.routes.push({ path: foreign, status: await visit(page, foreign, [403, 404]) });
                    observed.routes.push({ path: `${base}/admin/schedule`, status: await visit(page, `${base}/admin/schedule`, [403, 404]) });
                } else {
                    observed.routes.push({ path: `${base}/admin/finance`, status: await visit(page, `${base}/admin/finance`, [403, 404]) });
                    observed.routes.push({ path: `${base}/admin/schedule`, status: await visit(page, `${base}/admin/schedule`, [403, 404]) });
                }
                await visit(page, base);
                if (assertNoErrors) await assertNoErrors(page);
                record(`ROLE-${key}`, `${position} ${faculty}`, 'Contrôler les liens directs de sa faculté et les accès hors délégation',
                    'Dossier propre accessible, autre faculté refusée et permissions métier respectées',
                    `${observed.routes.length} accès directs contrôlés`, [foreignProof, await capture(page, `roles-${key}-dashboard`)], faculty);
            } catch (error) {
                const proof = await capture(page, `roles-${key}-interruption`).catch(() => null);
                output.failures.push({ key, error: error.message, proof });
                record(`ROLE-${key}-BLOCK`, `${position} ${faculty}`, 'Contrôler les liens directs et les permissions',
                    'Périmètre et permissions respectés', error.message, proof ? [proof] : [], faculty);
            }
            output.actors.push(observed);
        }
    }
    for (const page of pages) if (assertNoErrors) await assertNoErrors(page);
    await fs.writeFile(path.join(artifacts, 'roles-scopes.json'), JSON.stringify(output, null, 2));
    check(output.failures.length === 0, `Contrôles multi-rôles, ${output.failures.length} échec(s), détails dans roles-scopes.json`);
    return output;
};
