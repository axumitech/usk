/* global require, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, chromiumOptions, origin, verify, runDirectory } = require('./runtime.cjs');
const out = runDirectory('enseignement');
const trace = { events: [], checks: [] };
const reason = 'Vérification pédagogique avec des données de recette exclusivement fictives.';
const localDateOffset = (hours) =>
    new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Africa/Kinshasa',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    })
        .format(new Date(Date.now() + hours * 3600000))
        .replace(' ', 'T');
const props = (page) => page.locator('#app[data-page]').evaluate((el) => JSON.parse(el.getAttribute('data-page')).props);
(async () => {
    const verified = await verify();
    fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify(verified, null, 2));
    const browser = await chromium.launch(chromiumOptions);
    let page;
    try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'fr-FR', timezoneId: 'Africa/Kinshasa' });
        ctx.setDefaultTimeout(120000);
        ctx.setDefaultNavigationTimeout(120000);
        await ctx.route('**/*', (route) => (new URL(route.request().url()).origin === origin ? route.continue() : route.abort()));
        ctx.on('response', async (r) => {
            const u = new URL(r.url()),
                method = r.request().method();
            if (method === 'POST' || u.pathname.startsWith('/app/dashboard/teacher'))
                trace.events.push({ method, status: r.status(), url: u.pathname + u.search, location: r.headers().location ?? null });
            if (method === 'GET' && u.searchParams.has('resource') && r.headers()['x-inertia'] === 'true') {
                const inertia = await r.json().catch(() => null);
                const selected = inertia?.props?.selected;
                if (selected)
                    trace.events.push({
                        url: u.pathname + u.search,
                        component: inertia.component,
                        offering: inertia.props.offering,
                        selected: {
                            id: selected.id,
                            academic_offering_id: selected.academic_offering_id,
                            revision: selected.revision,
                            is_published: selected.is_published,
                            archived_at: selected.archived_at,
                            state: selected.state,
                        },
                        flashSuccess: !!inertia.props.flash?.success,
                        errors: Object.keys(inertia.props.errors || {}),
                    });
            }
        });
        ctx.on('requestfailed', (request) => {
            const url = new URL(request.url());
            if (url.origin === origin && url.pathname.startsWith('/app/dashboard/teacher')) {
                trace.events.push({ method: request.method(), url: url.pathname + url.search, failed: request.failure()?.errorText });
            }
        });
        page = await ctx.newPage();
        await page.goto(origin + '/app/login', { waitUntil: 'domcontentloaded' });
        await page.locator('#login-email').fill('professeur.droit@usk.test');
        await page.locator('#login-password').fill('password');
        await page.getByRole('button', { name: /se connecter/i }).click();
        await page.waitForURL('**/app/dashboard/teacher**');
        const version = await (await page.request.get(origin + '/__usk_recipe/version')).json();
        assert.equal(version.revision, version.assets.revision);

        trace.version = version;
        const links = '/app/dashboard/teacher/resources';
        await page.goto(origin + links, { waitUntil: 'domcontentloaded' });
        let offer;
        for (const choice of (await props(page)).offers.data) {
            await page.goto(origin + links + '?offering=' + choice.id, { waitUntil: 'domcontentloaded' });
            if ((await props(page)).canManage) {
                offer = choice.id;
                break;
            }
        }
        assert(offer, 'Le professeur dispose d’une offre ouverte dans le profil.');
        const tab = await ctx.newPage();
        const byTitle = (kind) => 'Contrôle ' + kind + ' ' + Date.now();
        const modal = page.getByRole('dialog');
        const resume = process.env.USK_QA_RESUME_SUPPORT;
        if (resume) {
            assert.match(resume, /^\d+$/);
            await page.goto(origin + links + '?offering=' + offer + '&resource=' + resume, { waitUntil: 'domcontentloaded' });
            const current = (await props(page)).selected;
            assert.equal(current?.id, Number(resume));
            assert.equal(current.academic_offering_id, offer);
            assert.match(current.title, /^Contrôle support \d+$/);
            if (current.is_published) {
                await page.getByRole('button', { name: 'Retirer', exact: true }).click();
                await modal
                    .getByLabel(/Motif|Justification/)
                    .fill('Rejeu de la publication du support fictif après contrôle de son état enregistré.');
                await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click();
                await modal.waitFor({ state: 'hidden' });
                await page.getByRole('button', { name: 'Publier', exact: true }).waitFor();
            }
        } else {
            await page.getByRole('button', { name: 'Ajouter un support', exact: true }).click();
            await modal.getByLabel(/^Type/).selectOption('material');
            await modal.getByLabel(/^Titre/).fill(byTitle('support'));
            await modal.getByLabel('Texte pédagogique').fill('Support de recette pour la vérification du parcours de publication.');
            await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click();
            await page.waitForURL((url) => url.searchParams.has('resource'));
            await page.getByText('Support enregistré.', { exact: true }).waitFor();
        }
        const resource = new URL(page.url()).searchParams.get('resource');
        await tab.goto(origin + '/app/dashboard', { waitUntil: 'domcontentloaded' });
        await page.bringToFront();
        await page.getByRole('button', { name: 'Publier', exact: true }).click();
        await modal.getByLabel(/Motif|Justification/).fill(reason);
        const [publishedSupport] = await Promise.all([
            page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/publication')),
            page.waitForResponse(
                (r) => r.request().method() === 'GET' && r.status() === 200 && new URL(r.url()).searchParams.get('resource') === resource,
            ),
            page.getByText('Support publié.', { exact: true }).filter({ visible: true }).first().waitFor(),
            modal.getByRole('button', { name: 'Enregistrer', exact: true }).click(),
        ]);
        assert.equal(publishedSupport.status(), 303);
        assert.equal(new URL(publishedSupport.headers().location, origin).searchParams.get('resource'), resource);
        const supportProof = path.join(out, '01-support-publie.png');
        await page.screenshot({ path: supportProof });
        const supportUrl = page.url();
        await page.reload({ waitUntil: 'domcontentloaded' });
        assert.equal((await props(page)).selected.is_published, true);
        trace.checks.push({ name: 'Support publié', status: 303, url: supportUrl, proof: supportProof });
        const evaluation = '/app/dashboard/teacher/assessments?offering=' + offer;
        await page.goto(origin + evaluation, { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: 'Créer une évaluation', exact: true }).click();
        await page.getByLabel(/^Titre de l’évaluation/).fill(byTitle('évaluation'));
        await page.getByLabel(/^Catégorie/).selectOption('assignment');
        await page.getByLabel(/^Consignes/).fill('Consigne fictive pour la recette finale.');
        await page.getByLabel(/^Ouverture des dépôts \(Kinshasa\)/).fill(localDateOffset(-1));
        await page.getByLabel(/^Échéance \(Kinshasa\)/).fill(localDateOffset(24));
        await page.getByLabel(/^Barème maximal/).fill('20');
        await page.getByRole('button', { name: 'Enregistrer le brouillon', exact: true }).click();
        await page.waitForURL((url) => url.searchParams.has('resource'));
        const assessment = new URL(page.url()).searchParams.get('resource');
        await tab.goto(origin + '/app/dashboard', { waitUntil: 'domcontentloaded' });
        await page.bringToFront();
        await page.getByRole('button', { name: 'Publier maintenant', exact: true }).click();
        await modal.getByLabel(/Motif|Justification/).fill(reason);
        const assessmentResponse = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/lifecycle'));
        await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click();
        const publishedAssessment = await assessmentResponse;
        assert.equal(publishedAssessment.status(), 303);
        assert.equal(new URL(publishedAssessment.headers().location, origin).searchParams.get('resource'), assessment);
        await page.getByText('Évaluation publiée.', { exact: true }).waitFor();
        const assessmentProof = path.join(out, '02-evaluation-publiee.png');
        await page.screenshot({ path: assessmentProof });
        const assessmentUrl = page.url();
        await page.reload({ waitUntil: 'domcontentloaded' });
        assert.equal((await props(page)).selected.state, 'published');
        trace.checks.push({ name: 'Évaluation publiée', status: 303, url: assessmentUrl, proof: assessmentProof });
        console.log('Edge : support et évaluation publiés, avec fiche conservée, toast visible et état vérifié après rechargement.');
    } catch (error) {
        trace.error = error.message.split('\n')[0];
        if (page) {
            const selected = await page
                .evaluate(() => {
                    const data = JSON.parse(document.querySelector('#app').dataset.page);
                    const item = data.props.selected;
                    return {
                        component: data.component,
                        offering: data.props.offering,
                        errors: data.props.errors,
                        resource: item && {
                            id: item.id,
                            academic_offering_id: item.academic_offering_id,
                            resource_id: item.resource_id,
                            revision: item.revision,
                            state: item.state,
                            is_published: item.is_published,
                            archived_at: item.archived_at,
                        },
                        feedback: Array.from(document.querySelectorAll('[role=alert]'))
                            .map((el) => el.textContent?.trim())
                            .filter(Boolean),
                        submitting: document.querySelector('[role=dialog] button[type=submit]')?.textContent?.trim(),
                    };
                })
                .catch(() => ({}));
            trace.documentAndVisibleFeedback = selected;
            await page.screenshot({ path: path.join(out, 'diagnostic.png') }).catch(() => {});
        }
        throw error;
    } finally {
        fs.writeFileSync(path.join(out, 'trace.json'), JSON.stringify(trace, null, 2));
        await browser.close();
    }
})().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
