/* global require, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./scenario.cjs');
const { probe } = require('./runtime.cjs');

const adminBase = '/app/dashboard/admin';
const studentBase = '/app/dashboard/student';
const tag = Date.now();
const title = 'Réunion fictive des étudiants de Droit L1 ' + tag;
const body = 'Les étudiants du cours se retrouveront pour préparer le prochain atelier de lecture juridique.';
const article = 'Journée universitaire fictive ' + tag;
const articleBody = 'Une journée fictive de présentation des travaux étudiants figure au programme de la recette universitaire.';

run('modules', async ({ login, visit, check, out, origin }) => {
    const academic = probe('documents').entries['etudiant.droit@usk.test'];
    assert.ok(academic);
    const teacher = await login('professeur.droit@usk.test');
    const student = await login('etudiant.droit@usk.test');
    const admin = await login('admin@usk.test');
    const publicPage = await admin
        .context()
        .browser()
        .newPage({ locale: 'fr-FR', viewport: { width: 1410, height: 930 } });
    await publicPage.context().route('**/*', (r) => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
    const reports = adminBase + '/schedule/reports';
    let announcement;

    await check(teacher, 'MOD-01', 'Publier une annonce pour un cours de Droit L1', async () => {
        const { overview } = await visit(teacher, '/app/dashboard/teacher?view=announcements');
        const target = overview.announcement_targets.find((item) => /Fondements.*Droit.*L1/i.test(item.title));
        assert.ok(target, 'Offre de Fondements du droit accessible au professeur.');
        await visit(teacher, '/app/dashboard/teacher?view=courses&offering=' + target.id);
        await teacher.getByRole('button', { name: 'Envoyer une annonce', exact: true }).click();
        const dialog = teacher.getByRole('dialog');
        assert.equal(await dialog.getByRole('combobox').first().inputValue(), String(target.id));
        await dialog.locator('input[type="text"]').fill(title);
        await dialog.locator('textarea').fill(body);
        const submitted = teacher.waitForResponse(
            (r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/teacher/announcements'),
        );
        await dialog.getByRole('button', { name: 'Envoyer l’annonce' }).click();
        assert.equal((await submitted).status(), 303);
        await teacher.waitForURL((u) => u.searchParams.has('announcement'));
        announcement = Number(new URL(teacher.url()).searchParams.get('announcement'));
        assert.ok(announcement);
        await teacher
            .getByText(/Annonce publiée\..*reçu une notification/)
            .filter({ visible: true })
            .first()
            .waitFor();
        await teacher.getByText(title, { exact: true }).filter({ visible: true }).first().waitFor();
        return { offre: target.id, ressource: announcement, cours: target.title, titre: title };
    });

    await check(student, 'MOD-02', 'Retrouver le titre dans la liste, ouvrir le détail et lire le message dans son année', async () => {
        assert.ok(announcement);
        const { announcements } = await visit(student, studentBase + '/announcements?academic=' + academic);
        assert.equal(announcements.academic_id, academic);
        const item = [announcements.featured, ...announcements.items.data].find((row) => row?.id === announcement);
        assert.equal(item?.title, title);
        const link = student.getByRole('link').filter({ hasText: title }).first();
        await link.scrollIntoViewIfNeeded();
        await student.screenshot({ path: path.join(out, 'MOD-02-liste.png') });
        await link.click();
        await student.getByRole('heading', { name: title, exact: true }).waitFor();
        await student.getByText(body, { exact: true }).filter({ visible: true }).first().waitFor();
        return { inscription: academic, ressource: announcement, annee: announcements.year, titre: title, texte: body, liste: 'MOD-02-liste.png' };
    });

    await check(student, 'MOD-03', 'Ouvrir la notification individuelle et vérifier le renvoi au détail de la même annonce', async () => {
        assert.ok(announcement);
        const { notifications } = await visit(student, studentBase + '/notifications?academic=' + academic);
        const notice = notifications.items.data.find((item) => item.title === title);
        assert.equal(notice?.kind, 'announcement');
        const row = student.getByRole('listitem').filter({ has: student.getByRole('heading', { name: title, exact: true }) });
        await row.scrollIntoViewIfNeeded();
        await student.screenshot({ path: path.join(out, 'MOD-03-notification.png') });
        await row.getByRole('button', { name: 'Lire l’annonce' }).click();
        await student.getByRole('heading', { name: title, exact: true }).waitFor();
        await student.getByText(body, { exact: true }).filter({ visible: true }).first().waitFor();
        return { notification: notice.id, inscription: academic, ressource: announcement, boite: 'MOD-03-notification.png' };
    });

    await check(admin, 'MOD-04', 'Filtrer le rapport de présence et télécharger son export CSV', async () => {
        const initial = await visit(admin, reports);
        const year = initial.years.find((y) => y.title === '2026-2027');
        assert.ok(year);
        await admin.locator('form').getByRole('combobox').selectOption(String(year.id));
        await admin.getByRole('button', { name: 'Filtrer' }).click();
        await admin.waitForURL((url) => url.searchParams.get('year') === String(year.id));
        const filtered = await visit(admin, admin.url());
        assert.equal(String(filtered.filters.year), String(year.id));
        const download = admin.waitForEvent('download');
        await admin.getByRole('link', { name: 'Exporter la sélection CSV' }).click();
        const csv = await download;
        assert.equal(csv.suggestedFilename(), 'presences.csv');
        await csv.saveAs(path.join(out, 'MOD-04-presences.csv'));
        const lines = fs.readFileSync(path.join(out, 'MOD-04-presences.csv'), 'utf8').trim().split(/\r?\n/);
        assert.equal(lines.shift(), 'seance,date_utc,cours,saisis,presents,retards,justifies,absents');
        assert.equal(lines.length, Number(filtered.rows.total));
        for (const row of filtered.rows.data) assert.ok(lines.some((line) => line.startsWith(row.id + ',')));
        return { annee: year.title, seances: lines.length, appels_saisis: Number(filtered.total.recorded), export: 'MOD-04-presences.csv' };
    });

    await check(admin, 'MOD-05', 'Modifier la ville dans les paramètres, relire puis restaurer la valeur du profil', async () => {
        const seo = adminBase + '/seo';
        const initial = await visit(admin, seo);
        const original = initial.settings.identity.city || '';
        const testCity = 'Ville fictive QA ' + tag;
        const city = admin
            .locator('.seo-fields label')
            .filter({ hasText: /^\s*Ville/ })
            .locator('textarea');
        async function persist(value) {
            const summary = admin.locator('summary').filter({ hasText: 'Identité et informations officielles à valider' });
            await summary.click();
            await city.fill(value);
            await admin.getByRole('button', { name: 'Enregistrer les paramètres' }).click();
            await admin.getByText('Paramètres enregistrés.', { exact: true }).waitFor();
            return (await visit(admin, seo)).settings.identity.city || '';
        }
        try {
            assert.equal(await persist(testCity), testCity);
            await admin.getByText('Identité et informations officielles à valider', { exact: true }).click();
            await city.scrollIntoViewIfNeeded();
            await admin.screenshot({ path: path.join(out, 'MOD-05-ville-modifiee.png') });
        } finally {
            const current = (await visit(admin, seo)).settings.identity.city || '';
            if (current === testCity) assert.equal(await persist(original), original);
        }
        assert.equal((await visit(admin, seo)).settings.identity.city || '', original);
        return { champ: 'Ville', relecture: testCity, valeur_initiale_retablie: true, preuve_modification: 'MOD-05-ville-modifiee.png' };
    });

    await check(admin, 'MOD-06', 'Publier une actualité institutionnelle depuis la rubrique Communication', async () => {
        await visit(admin, adminBase + '/posts');
        await admin.getByRole('button', { name: 'Créer un article', exact: true }).first().click();
        const dialog = admin.getByRole('dialog');
        await dialog.locator('#post-title').fill(article);
        await dialog.locator('#post-content').fill(articleBody);
        await dialog.locator('#post-status').selectOption('published');
        await dialog.locator('#post-published_at').fill(new Date(Date.now() - 86400000).toISOString().slice(0, 16));
        await dialog.getByRole('button', { name: 'Publier l’actualité' }).click();
        await dialog.waitFor({ state: 'hidden' });
        const { posts } = await visit(admin, adminBase + '/posts?q=' + encodeURIComponent(article));
        const post = posts.data.find((item) => item.title === article);
        assert.equal(post?.status, 'published');
        await admin.getByRole('heading', { name: article, exact: true }).waitFor();
        return { article: post.id, titre: article, statut: post.status };
    });

    await check(publicPage, 'MOD-07', 'Retrouver l’actualité à partir du journal public et lire son contenu sans connexion', async () => {
        await visit(publicPage, '/blog');
        const link = publicPage.getByRole('link').filter({ hasText: article }).first();
        await link.click();
        await publicPage.waitForURL((url) => /^\/blog\/\d+$/.test(url.pathname));
        await publicPage.getByRole('heading', { name: article, exact: true, level: 1 }).filter({ visible: true }).first().waitFor();
        await publicPage.getByText(articleBody, { exact: true }).filter({ visible: true }).first().waitFor();
        return { titre: article, chemin_public: new URL(publicPage.url()).pathname, connexion: false };
    });
}).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
});
