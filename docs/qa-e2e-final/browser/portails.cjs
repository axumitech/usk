/* global require, process, __dirname */
/* eslint @typescript-eslint/no-require-imports: "off" */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, chromiumOptions, origin, mailOrigin, evidenceRoot, verify } = require('./runtime.cjs');
const work = evidenceRoot;
const testPassword = process.env.USK_QA_PASSWORD || 'password';
const assetOrigin = null;
const allowed = new Set([origin]);
const supported = ['auth', 'account', 'admissions', 'academic'];
const selected = process.argv.slice(2);
assert.ok(
    selected.every((name) => supported.includes(name)),
    'Choix: auth account admissions academic.',
);
const suites = selected.length ? selected : ['auth', 'account', 'academic', 'admissions'];
const start = new Date();
const output = path.join(work, 'portails-' + start.toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(output, { recursive: true });
const startedAt = start.toISOString();
const results = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function append(name, data) {
    fs.appendFileSync(path.join(output, name), JSON.stringify({ at: new Date().toISOString(), ...data }) + '\n', 'utf8');
}

function redactedUrl(raw, base = origin) {
    try {
        const parsed = new URL(raw, base);
        if (/\/email\/verify\/[^/]+\//.test(parsed.pathname)) {
            return parsed.origin + '/app/email/verify/[masque]';
        }
        if (/\/reset-password\/[^/]+/.test(parsed.pathname)) return parsed.origin + '/app/reset-password/[masque]';
        if (parsed.searchParams.has('signature') || parsed.searchParams.has('token')) return parsed.origin + parsed.pathname;
        return parsed.origin + parsed.pathname + parsed.search;
    } catch {
        return '[URL indisponible]';
    }
}

function cleanDiagnostic(error) {
    return String(error?.message || error)
        .split('\n')
        .slice(0, 5)
        .join(' ')
        .replace(/https?:\/\/[^\s"']+\/email\/verify\/[^\s"']+/g, '[lien de vérification masqué]')
        .replace(/https?:\/\/[^\s"']+\/reset-password\/[^\s"']+/g, '[lien de réinitialisation masqué]')
        .slice(0, 750);
}

async function main() {
    const version = await verify();
    fs.writeFileSync(path.join(output, 'version.json'), JSON.stringify(version, null, 2));
    const health = await fetch(new URL('/up', origin), { redirect: 'error', signal: AbortSignal.timeout(7000) });
    assert.equal(health.status, 200);
    assert.equal(new URL(health.url).origin, origin);
    const browser = await chromium.launch({
        ...chromiumOptions,
        args: [...chromiumOptions.args, '--disable-background-mode', '--start-maximized'],
    });

    try {
        const settings = {
            viewport: { width: 1280, height: 900 },
            locale: 'fr-FR',
            timezoneId: 'Africa/Kinshasa',
            acceptDownloads: true,
            serviceWorkers: 'allow',
        };
        const context = await browser.newContext(settings);
        const mailContext = await browser.newContext(settings);
        const noReferrer = new Set();
        let activeCase = null;
        let activeAccount = null;
        const credentials = new Map();
        let failure = null;
        const navigationState = new WeakMap();

        async function setupContext(ctx, required, origins) {
            ctx.setDefaultTimeout(25000);
            ctx.setDefaultNavigationTimeout(120000);
            await ctx.route('**/*', async (route) => {
                const req = route.request();
                const url = new URL(req.url());
                if (['about:', 'data:', 'blob:'].includes(url.protocol)) return route.continue();
                if (!origins.has(url.origin) || url.username || url.password) {
                    append('network.jsonl', { case: activeCase, event: 'blocked', method: req.method(), origin: url.origin, path: url.pathname });
                    if (req.isNavigationRequest()) {
                        try {
                            if (!req.frame().parentFrame()) failure ??= new Error('Navigation interdite vers ' + url.origin);
                        } catch {
                            /* A worker request can have no frame. */
                        }
                    }
                    return route.abort('blockedbyclient');
                }
                if (req.isNavigationRequest() && url.origin !== required) {
                    try {
                        if (!req.frame().parentFrame()) {
                            failure ??= new Error('Navigation interdite vers ' + url.origin);
                            return route.abort('blockedbyclient');
                        }
                    } catch {
                        /* A worker request can have no frame. */
                    }
                }
                if (url.origin === origin && url.pathname === '/app/login' && req.method() === 'POST' && noReferrer.has(req.frame().page())) {
                    const headers = await req.allHeaders();
                    delete headers.referer;
                    append('network.jsonl', { case: activeCase, event: 'login_without_referer', method: req.method(), path: url.pathname });
                    return route.continue({ headers });
                }
                return route.continue();
            });
            ctx.on('response', (response) => {
                const request = response.request();
                const url = new URL(response.url());
                if (!origins.has(url.origin)) return;
                const navigation = request.isNavigationRequest();
                if (url.origin === assetOrigin && url.origin !== origin && response.status() < 400) return;
                const row = {
                    case: activeCase,
                    event: 'response',
                    method: request.method(),
                    status: response.status(),
                    request: redactedUrl(url.href),
                    navigation,
                };
                if (response.headers().location) row.location = redactedUrl(response.headers().location, response.url());
                append('network.jsonl', row);
                if (navigation) {
                    try {
                        if (response.frame() === response.frame().page().mainFrame()) navigationState.set(response.frame().page(), row);
                    } catch {
                        /* A worker request can have no frame. */
                    }
                }
            });
            ctx.on('page', (p) => {
                p.on('pageerror', (error) =>
                    append('network.jsonl', {
                        case: activeCase,
                        event: 'javascript',
                        request: redactedUrl(p.url()),
                        message: cleanDiagnostic(error),
                    }),
                );
                p.on('framenavigated', (frame) => {
                    if (frame !== p.mainFrame() || frame.url() === 'about:blank') return;
                    if (new URL(frame.url()).origin !== required) failure ??= new Error('Une destination est sortie du profil fictif.');
                    append('network.jsonl', { case: activeCase, event: 'url', request: redactedUrl(frame.url()) });
                });
            });
        }

        await setupContext(context, origin, allowed);
        await setupContext(mailContext, mailOrigin, new Set([mailOrigin]));
        const page = await context.newPage();
        const mailPage = await mailContext.newPage();
        const urlFor = (value, expected = origin) => {
            const url = new URL(value, expected);
            assert.equal(url.origin, expected, 'Destination hors du profil.');
            assert.ok(!url.username && !url.password);
            return url.href;
        };

        async function ready(subject = page) {
            if (failure) throw failure;
            const expected = subject === mailPage ? mailOrigin : origin;
            assert.equal(new URL(subject.url()).origin, expected);
            if (subject === mailPage) return;
            const meta = navigationState.get(subject);
            if (meta && meta.status >= 400 && meta.request === redactedUrl(subject.url())) return;
            await subject.locator('#app[data-page]').waitFor({ state: 'attached' });
            await subject.waitForFunction(() => (document.querySelector('#app[data-page]')?.childElementCount || 0) > 0);
        }

        async function goto(value, subject = page) {
            const response = await subject.goto(urlFor(value, subject === mailPage ? mailOrigin : origin), { waitUntil: 'domcontentloaded' });
            await ready(subject);
            return response;
        }

        async function capture(id, subject = page, options = {}) {
            const file = path.join(output, id.replace(/[^a-zA-Z0-9_.-]/g, '-') + '.png');
            await subject.screenshot({ path: file, animations: 'disabled', timeout: 11000, ...options });
            return path.basename(file);
        }

        const outcome = (id, actor, action, expected, observed, status, proof = null) => {
            const current = { id, actor, action, expected, observed, status, proof, url: redactedUrl(page.url()) };
            results.push(current);
            append('matrice.jsonl', current);
            console.log(status + ' ' + id + ' ' + observed);
            return status === 'VALIDÉ';
        };

        async function step(id, actor, action, expected, run) {
            activeCase = id;
            console.log('CONTRÔLE ' + id + ' ' + action);
            try {
                if (failure) throw failure;
                await page.bringToFront();
                const observed = await run();
                if (failure) throw failure;
                await ready();
                const proof = observed?.proof || (await capture(id, observed?.page || page));
                return outcome(
                    id,
                    actor,
                    action,
                    expected,
                    typeof observed === 'string' ? observed : observed?.observed || 'État vérifié.',
                    'VALIDÉ',
                    proof,
                );
            } catch (error) {
                return outcome(
                    id,
                    actor,
                    action,
                    expected,
                    cleanDiagnostic(error),
                    error?.name === 'TimeoutError' && !failure ? 'BLOQUÉ' : 'ÉCHEC',
                    await capture(id + '-observation').catch(() => null),
                );
            } finally {
                activeCase = null;
            }
        }

        const block = (id, actor, action, expected, reason) => outcome(id, actor, action, expected, reason, 'BLOQUÉ');
        const props = async (subject = page) => subject.locator('#app[data-page]').evaluate((el) => JSON.parse(el.getAttribute('data-page')).props);
        const postResponse = (method, pathname, subject = page) =>
            subject.waitForResponse(
                (response) => {
                    const url = new URL(response.url());
                    return url.origin === origin && url.pathname === pathname && response.request().method() === method;
                },
                { timeout: 18000 },
            );

        async function logout(strict = true) {
            if (!new URL(page.url()).pathname.startsWith('/app/dashboard')) {
                await goto('/app/dashboard');
                if (!new URL(page.url()).pathname.startsWith('/app/dashboard')) {
                    activeAccount = null;
                    if (strict) throw new Error('Aucune session active au moment de la déconnexion.');
                    return false;
                }
            }
            let trigger = page
                .getByRole('button', { name: /^(déconnexion|se déconnecter)$/i })
                .filter({ visible: true })
                .first();
            if (!(await trigger.isVisible())) {
                const profile = page
                    .getByRole('link', { name: /^(profil|mon profil)$/i })
                    .filter({ visible: true })
                    .first();
                if (await profile.isVisible()) {
                    await profile.click();
                    trigger = page
                        .getByRole('button', { name: /^(déconnexion|se déconnecter)$/i })
                        .filter({ visible: true })
                        .first();
                    await trigger.waitFor({ state: 'visible' });
                }
            }
            if (!(await trigger.isVisible()))
                trigger = page
                    .getByRole('link', { name: /^(déconnexion|se déconnecter)$/i })
                    .filter({ visible: true })
                    .first();
            await trigger.waitFor({ state: 'visible' });
            const sent = postResponse('POST', '/app/logout');
            await trigger.click();
            const dialog = page.locator('.swal2-confirm').filter({ visible: true });
            if (await dialog.isVisible()) await dialog.click();
            const response = await sent;
            assert.ok([302, 303].includes(response.status()), 'Réponse de déconnexion inattendue.');
            await page.waitForURL((url) => !url.pathname.startsWith('/app/dashboard'));
            activeAccount = null;
            return true;
        }

        async function login(account) {
            const local = account.replace(/@usk\.test$/i, '');
            assert.match(local, /^[a-z0-9.]+$/);
            if (activeAccount === local && new URL(page.url()).pathname.startsWith('/app/dashboard')) return;
            if (activeAccount || new URL(page.url()).pathname.startsWith('/app/dashboard')) {
                await logout(false).catch(async () => {
                    await context.clearCookies();
                    activeAccount = null;
                });
            }
            await goto('/app/login');
            if (!(await page.locator('#login-email').isVisible())) {
                await context.clearCookies();
                await goto('/app/login');
            }
            await page.locator('#login-email').fill(local + '@usk.test');
            await page.locator('#login-password').fill(credentials.get(local) || testPassword);
            const sent = postResponse('POST', '/app/login');
            await page.locator('form:has(#login-email) button[type=submit]').click();
            const response = await sent;
            assert.ok([302, 303].includes(response.status()), 'La connexion fictive doit rediriger.');
            await page.waitForURL((url) => url.pathname.startsWith('/app/dashboard'), { timeout: 120000 });
            await ready();
            activeAccount = local;
        }

        const h = {
            page,
            mailPage,
            context,
            browser,
            work: output,
            origin,
            mailOrigin,
            startedAt,
            fixtures: { pdf: path.join(__dirname, 'fixtures/specimen.pdf'), png: path.join(__dirname, 'fixtures/illustration.png') },
            goto,
            login,
            logout,
            capture,
            step,
            block,
            sleep,
        };

        async function auth() {
            await step(
                'AUTH-01',
                'Candidat fictif',
                'Saisir un mauvais mot de passe avec le site public ouvert dans un second onglet',
                'POST sans Referer, Location /app/login et erreur associée au champ',
                async () => {
                    await context.clearCookies();
                    await goto('/app/login');
                    const second = await context.newPage();
                    try {
                        await goto('/', second);
                        await page.bringToFront();
                        await page.evaluate(() => {
                            const policy = document.createElement('meta');
                            policy.name = 'referrer';
                            policy.content = 'no-referrer';
                            document.head.append(policy);
                        });
                        await page.locator('#login-email').fill('candidat.med@usk.test');
                        await page.locator('#login-password').fill('incorrect-local-usktest');
                        noReferrer.add(page);
                        try {
                            const sent = postResponse('POST', '/app/login');
                            await page.locator('form:has(#login-email) button[type=submit]').click();
                            const response = await sent;
                            assert.ok([302, 303].includes(response.status()), 'Statut HTTP du refus: ' + response.status());
                            const location = response.headers().location;
                            assert.ok(location, 'Location de refus absente.');
                            assert.equal(new URL(location, origin).pathname, '/app/login', 'La destination de refus doit être la connexion.');
                            const field = page.locator('form:has(#login-email) input[aria-invalid=true]').first();
                            await field.waitFor({ state: 'visible' });
                            const describedBy = await field.getAttribute('aria-describedby');
                            assert.ok(describedBy);
                            const error = await page.locator('[id=' + JSON.stringify(describedBy) + ']').innerText();
                            assert.match(error, /identifiant|mot de passe|adresse|incorrect|connexion/i);
                            assert.doesNotMatch(error, /^auth\.|^validation\./);
                            assert.equal(new URL(page.url()).pathname, '/app/login');
                            return 'Refus HTTP ' + response.status() + ' vers la connexion. ' + error;
                        } finally {
                            noReferrer.delete(page);
                        }
                    } finally {
                        await second.close();
                    }
                },
            );
            await step(
                'AUTH-02',
                'Candidat fictif',
                'Se connecter, se déconnecter puis ouvrir une page privée',
                'POST logout, message visible puis nouvelle demande de connexion',
                async () => {
                    await login('candidat.med');
                    await logout();
                    await page
                        .getByRole('status')
                        .filter({ hasText: /déconnexion réussie|déconnecté/i })
                        .first()
                        .waitFor({ state: 'visible' });
                    const feedback = await capture('AUTH-02-retour-logout');
                    await goto('/app/dashboard/enrollments');
                    assert.equal(new URL(page.url()).pathname, '/app/login');
                    return { observed: 'Déconnexion confirmée à l’écran. La page privée exige de se reconnecter.', proof: feedback };
                },
            );
        }

        async function account() {
            const email = 'qa.' + String(start.valueOf()) + '@usk.test';
            const created = await step(
                'EMAIL-01',
                'Nouveau candidat fictif',
                'Créer un compte avec le formulaire public',
                'POST /app/register suivi de la vérification email',
                async () => {
                    await context.clearCookies();
                    activeAccount = null;
                    await goto('/app/register');
                    await page.getByRole('heading', { name: 'Créer un compte' }).waitFor();
                    await page.locator('[name=last_name]').fill('Recette');
                    await page.locator('[name=first_name]').fill('Compte Fictif');
                    await page.locator('[name=post_name]').fill('Stabilisation');
                    await page.locator('[name=gender]').selectOption('other');
                    await page.locator('[name=nationality_code]').selectOption('CD');
                    await page.locator('[name=email]').fill(email);
                    await page.locator('[name=password]').fill(testPassword);
                    await page.locator('[name=password_confirmation]').fill(testPassword);
                    const sent = postResponse('POST', '/app/register');
                    await page.locator('button[type=submit]').click();
                    const response = await sent;
                    assert.ok([302, 303].includes(response.status()));
                    await page.waitForURL((url) => url.pathname === '/app/email/verify');
                    const guarded = await goto('/app/dashboard/enrollments');
                    assert.ok(
                        guarded && new URL(page.url()).pathname === '/app/email/verify',
                        'Le candidat non vérifié ne doit pas accéder au dossier.',
                    );
                    return 'Inscription fictive acceptée. Le portail reste derrière la vérification email.';
                },
            );
            if (!created) {
                block(
                    'EMAIL-02',
                    'MailHog local',
                    'Confirmer l’adresse',
                    'Courriel de vérification réellement reçu et utilisé',
                    'Création préalable indisponible.',
                );
                return;
            }
            await step(
                'EMAIL-02',
                'Nouveau candidat et MailHog local',
                'Lire le courriel et utiliser son lien signé',
                'Destinataire fictif, lien loopback, accès au portail après HTTP de vérification',
                async () => {
                    await mailPage.bringToFront();
                    await goto('/', mailPage);
                    const message = mailPage
                        .locator('.msglist-message')
                        .filter({ hasText: email })
                        .filter({ hasText: /adresse email|adresse e-mail/i })
                        .first();
                    await message.waitFor({ state: 'visible', timeout: 18000 });
                    await message.click();
                    const preview = mailPage.locator('.preview').filter({ visible: true });
                    assert.match(await preview.innerText(), /noreply@usk\.test/i);
                    const frame = mailPage.frameLocator('#preview-html');
                    const link = frame.locator('a[href*="/email/verify/"]').first();
                    await link.waitFor({ state: 'visible', timeout: 14000 });
                    const signed = new URL(await link.getAttribute('href'), origin);
                    assert.equal(signed.origin, origin);
                    assert.match(signed.pathname, /^\/app\/email\/verify\/\d+\/[^/]+$/);
                    assert.ok(signed.searchParams.get('signature'), 'Lien de vérification incomplet.');
                    const proof = await capture('EMAIL-02-message', mailPage, {
                        mask: [frame.locator('a[href*="/email/verify/"]').filter({ hasText: /^https?:/ })],
                        maskColor: '#31544f',
                    });
                    await page.bringToFront();
                    await goto(signed.href);
                    assert.match(new URL(page.url()).pathname, /^\/app\/dashboard/);
                    await goto('/app/dashboard/enrollments');
                    assert.match(new URL(page.url()).pathname, /^\/app\/dashboard\/enrollments/);
                    assert.equal((await props()).auth.user.email, email);
                    activeAccount = email.replace(/@usk\.test$/, '');
                    h.candidateEmail = email;
                    await capture('EMAIL-02-portail-verifie');
                    return { observed: 'Courriel reçu de noreply@usk.test. Lien signé vérifié par Laravel et accès candidat ouvert.', proof };
                },
            );
            if (process.env.USK_QA_RESET_PASSWORD !== 'false') await passwordReset(email);
        }

        async function passwordReset(email) {
            await step(
                'EMAIL-03',
                'Compte fictif vérifié',
                'Demander puis réinitialiser le mot de passe depuis MailHog',
                'Contexte conservé et nouveau secret utilisable',
                async () => {
                    if (activeAccount) await logout();
                    await goto('/app/forgot-password');
                    const second = await context.newPage();
                    await second.goto(origin + '/', { waitUntil: 'domcontentloaded' });
                    await second.close();
                    const input = page.locator('#reset-request-email');
                    await input.fill(email);
                    const post = postResponse('POST', '/app/forgot-password');
                    await input.press('Enter');
                    const received = await post;
                    assert.equal(received.status(), 303);
                    assert.equal(new URL(received.headers().location, origin).pathname, '/app/forgot-password');
                    await page
                        .getByRole('status')
                        .getByText(/Si un compte correspond/)
                        .waitFor();
                    await mailPage.bringToFront();
                    await goto('/', mailPage);
                    const row = mailPage
                        .locator('.msglist-message')
                        .filter({ hasText: email })
                        .filter({ hasText: /Réinitialisez votre mot de passe/i })
                        .first();
                    await row.click({ timeout: 30000 });
                    const link = mailPage.frameLocator('#preview-html').locator('a[href*="/reset-password/"]').first();
                    const target = new URL(await link.getAttribute('href'), origin);
                    assert.equal(target.origin, origin);
                    const proof = await capture('EMAIL-03-mailhog', mailPage, {
                        mask: [mailPage.frameLocator('#preview-html').locator('a[href*="/reset-password/"]')],
                        maskColor: '#31544f',
                    });
                    await page.bringToFront();
                    await goto(target.href);
                    const secret = 'Recette-' + require('node:crypto').randomBytes(18).toString('hex') + '-m!';
                    await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(secret);
                    const confirmation = page.getByLabel('Confirmer le nouveau mot de passe', { exact: true });
                    await confirmation.fill('différent');
                    await confirmation.press('Enter');
                    await page.getByText('Les mots de passe ne correspondent pas.', { exact: true }).waitFor();
                    await confirmation.fill(secret);
                    const resetPost = postResponse('POST', '/app/reset-password');
                    await confirmation.press('Enter');
                    const reset = await resetPost;
                    assert.equal(reset.status(), 303);
                    assert.equal(new URL(reset.headers().location, origin).pathname, '/app/login');
                    await page.getByRole('status').getByText('Mot de passe réinitialisé.', { exact: true }).waitFor();
                    await page.locator('#login-email').fill(email);
                    credentials.set(email.split('@')[0], secret);
                    await page.locator('#login-password').fill(secret);
                    await page.locator('form:has(#login-email) button[type=submit]').click();
                    await page.waitForURL((url) => url.pathname.startsWith('/app/dashboard/'));
                    return {
                        observed:
                            'Demande et confirmation HTTP 303, lien fictif dans MailHog, validation de la confirmation au clavier et nouvelle connexion.',
                        proof,
                    };
                },
            );
        }

        async function admissions() {
            await require('./admissions.cjs').run(h);
        }

        async function academic() {
            let currentCourse;
            let supportDownload;
            await step(
                'ACAD-01',
                'Étudiant Droit',
                'Ouvrir Mes cours puis le détail',
                'Détail et lien de retour conservent le contexte annuel',
                async () => {
                    await login('etudiant.droit');
                    await goto('/app/dashboard/student/courses');
                    const links = await page
                        .locator('.student-course-card')
                        .evaluateAll((items) => items.map((item) => item.getAttribute('href')).filter(Boolean));
                    assert.ok(links.length, 'Aucun cours pédagogique pour ce compte de recette.');
                    let best = null;
                    for (const href of links) {
                        await goto(href);
                        const info = await props();
                        const value = Number(info.counts?.files > 0) + Number(info.counts?.evaluations > 0);
                        if (!best || value > best.value) best = { href, value };
                        if (value === 2) break;
                    }
                    assert.ok(best);
                    await goto('/app/dashboard/student/courses');
                    const card = page.locator('.student-course-card[href=' + JSON.stringify(best.href) + ']');
                    await card.click();
                    await page.waitForURL((url) => /\/courses\/\d+/.test(url.pathname));
                    const parsed = new URL(best.href, origin);
                    const id = parsed.pathname.match(/\/courses\/(\d+)/)[1];
                    const academic = parsed.searchParams.get('academic') || new URL(page.url()).searchParams.get('academic');
                    assert.ok(academic, 'Identifiant de contexte académique absent du détail du cours.');
                    currentCourse = { id, academic, href: best.href };
                    const back = page.getByRole('link', { name: 'Retour à mes cours' });
                    assert.equal(new URL(await back.getAttribute('href'), origin).searchParams.get('academic'), academic);
                    return 'Le cours ' + id + ' a été ouvert via la carte. Son retour conserve l’inscription ' + academic + '.';
                },
            );
            if (currentCourse)
                await step(
                    'ACAD-02',
                    'Étudiant Droit',
                    'Ouvrir les supports, vérifier un téléchargement privé et naviguer aux évaluations',
                    'HTTP 200, contexte inchangé et fichiers liés au cours',
                    async () => {
                        await page
                            .getByRole('navigation', { name: 'Rubriques du cours' })
                            .getByRole('link', { name: /^Ressources/i })
                            .first()
                            .click();
                        await page.waitForURL((url) => /\/courses\/\d+\/supports$/.test(url.pathname));
                        const supportUrl = page.url();
                        assert.equal(new URL(supportUrl).searchParams.get('academic'), currentCourse.academic);
                        await goto(supportUrl);
                        const supports = await props();
                        assert.ok(supports.resources?.length, 'Ce cours n’a aucun support publié pour cette inscription.');
                        const downloadable = supports.resources.find((item) => item.download_url);
                        if (downloadable) {
                            supportDownload = downloadable.download_url;
                            const file = await page.request.get(urlFor(supportDownload), { maxRedirects: 0 });
                            assert.equal(file.status(), 200);
                            assert.ok((await file.body()).length > 0);
                            append('network.jsonl', {
                                case: activeCase,
                                event: 'verified_download',
                                status: file.status(),
                                request: redactedUrl(supportDownload),
                            });
                        }
                        await capture('ACAD-02-supports');
                        const evaluation = page
                            .getByRole('navigation', { name: 'Suivi du cours' })
                            .getByRole('link', { name: /Évaluations/i })
                            .first();
                        await evaluation.click();
                        await page.waitForURL((url) => /\/courses\/\d+\/evaluations$/.test(url.pathname));
                        await goto(page.url());
                        const data = await props();
                        assert.equal(String(data.academic.id), currentCourse.academic);
                        assert.equal(String(data.course.id), currentCourse.id);
                        assert.ok(data.resources?.length, 'Aucune évaluation publiée dans ce cours de recette.');
                        await capture('ACAD-02-evaluations-liste');
                        const work = data.resources.find((item) => item.work_url);
                        assert.ok(work, 'Aucun lien de détail vers un travail publié.');
                        const link = page
                            .locator('a[href=' + JSON.stringify(work.work_url) + ']')
                            .filter({ visible: true })
                            .first();
                        await link.click();
                        await page.waitForURL((url) => url.searchParams.get('work') === String(work.id));
                        assert.equal(new URL(page.url()).searchParams.get('academic'), currentCourse.academic);
                        await page.getByText(work.title, { exact: true }).first().waitFor({ state: 'visible' });
                        return (
                            supports.resources.length +
                            ' support(s), ' +
                            data.resources.length +
                            ' travail/travaux et consignes ouvertes dans le même dossier.'
                        );
                    },
                );
            else block('ACAD-02', 'Étudiant Droit', 'Ouvrir ressources et évaluations', 'Accès au même cours', 'Détail indisponible.');

            if (currentCourse && supportDownload)
                await step(
                    'ACAD-03',
                    'Candidat hors espace étudiant',
                    'Contrôler le refus du support privé',
                    'Le média hors espace étudiant n’est pas délivré',
                    async () => {
                        await login('candidat.droit');
                        const response = await page.request.get(urlFor(supportDownload), { maxRedirects: 0 });
                        append('network.jsonl', {
                            case: activeCase,
                            event: 'denied_download',
                            status: response.status(),
                            request: redactedUrl(supportDownload),
                        });
                        assert.ok([302, 303, 403, 404].includes(response.status()), 'Un compte candidat ne doit recevoir aucun support privé.');
                        return 'Le téléchargement privé est refusé au candidat (HTTP ' + response.status() + ').';
                    },
                );
            else block('ACAD-03', 'Candidat', 'Refus du support privé', 'Support contrôlé', 'Aucun support téléchargeable vérifié.');
            if (currentCourse)
                await step(
                    'ACAD-04',
                    'Étudiant Droit sur mobile',
                    'Revenir du dossier de cours au clavier',
                    'Retour correctement nommé, inscription conservée et écran à 390 px sans débordement',
                    async () => {
                        await login('etudiant.droit');
                        await page.setViewportSize({ width: 390, height: 844 });
                        try {
                            await goto(currentCourse.href);
                            assert.equal(
                                await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
                                true,
                                'Débordement horizontal du dossier de cours mobile.',
                            );
                            const back = page.getByRole('link', { name: 'Retour à mes cours' });
                            await back.focus();
                            const focused = await back.evaluate((element) => document.activeElement === element);
                            assert.ok(focused);
                            const proof = await capture('ACAD-04-mobile-focus');
                            await back.press('Enter');
                            await page.waitForURL((url) => /\/student\/courses$/.test(url.pathname));
                            assert.equal(new URL(page.url()).searchParams.get('academic'), currentCourse.academic);
                            return { observed: 'À 390 px, le retour au clavier conserve le contexte et le dossier ne déborde pas.', proof };
                        } finally {
                            await page.setViewportSize(settings.viewport);
                        }
                    },
                );
            else block('ACAD-04', 'Étudiant Droit sur mobile', 'Retour au clavier', 'Contexte de cours', 'Détail indisponible.');
        }

        try {
            await goto('/app/login');
            await capture('00-controle-Chrome');
        } catch (error) {
            outcome('PRE-01', 'Navigateur', 'Charger le portail compilé', 'Page de connexion affichée', cleanDiagnostic(error), 'BLOQUÉ');
            throw error;
        }
        for (const name of suites) {
            try {
                if (name === 'auth') await auth();
                if (name === 'account') await account();
                if (name === 'admissions') await admissions();
                if (name === 'academic') await academic();
            } catch (error) {
                outcome(name, 'Recette isolée', 'Exécuter la suite', 'Terminaison attendue', cleanDiagnostic(error), 'ÉCHEC');
                if (failure) break;
            }
        }
    } finally {
        await browser.close();
        fs.writeFileSync(path.join(output, 'resume.json'), JSON.stringify({ origin, startedAt, suites, headless: false, results }, null, 2));
        console.log('PREUVES ' + output);
    }

    if (results.some((result) => result.status !== 'VALIDÉ')) process.exitCode = 1;
}

main().catch((error) => {
    console.error(cleanDiagnostic(error));
    process.exitCode = 1;
});
