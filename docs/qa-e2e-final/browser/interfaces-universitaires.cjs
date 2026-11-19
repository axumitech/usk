/* global require, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { run } = require('./scenario.cjs');

async function mobile(page) {
    await page.setViewportSize({ width: 390, height: 844 });
    const size = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
    assert.ok(size.content <= size.width + 1, 'Défilement horizontal sur mobile : ' + JSON.stringify(size));
}

async function palette(element) {
    const style = await element.evaluate((node) => {
        const css = getComputedStyle(node);
        return { background: css.backgroundColor, color: css.color, border: css.borderTopStyle, height: node.getBoundingClientRect().height };
    });
    assert.ok(style.height >= 32 && style.color !== style.background, JSON.stringify(style));
    return style;
}

run('interfaces-universitaires', async ({ login, visit, proof }) => {
    const root = fs.realpathSync(process.env.USK_RECETTE_V2_ROOT);
    assert.match(path.basename(root), /^usk_qa_e2e-/);
    const { password } = JSON.parse(fs.readFileSync(path.join(root, 'final-qa.json'), 'utf8'));
    const db = new DatabaseSync(path.join(root, 'usk-recette-v2.sqlite'), { readOnly: true });
    try {
        const dashboard = '/app/dashboard';
        const portal = dashboard + '/student';
        const student = db
            .prepare(
                `SELECT u.email FROM users u JOIN student_profiles p ON u.id=p.user_id
            JOIN academic_enrollments e ON e.student_profile_id=p.id WHERE u.email LIKE 'etudiant.dpu.%@usk.test'
            GROUP BY p.id,u.email HAVING COUNT(DISTINCT e.academic_year_id)>1
            ORDER BY (p.welcome_seen_at IS NULL) DESC, u.email LIMIT 1`,
            )
            .get();
        assert.ok(student);
        const sp = await login(student.email, password);
        const initial = await visit(sp, portal);
        const entry = initial.academic.id;
        const guide = sp.getByRole('dialog').filter({ hasText: 'Bienvenue dans votre espace étudiant' });
        if (!initial.welcome_pending) await sp.getByRole('button', { name: 'Guide de mon espace' }).click();
        await guide.getByRole('button', { name: 'Faites-moi visiter' }).click();
        for (let i = 0; i < 3; i++) await sp.getByRole('dialog').getByRole('button', { name: 'Continuer' }).click();
        await sp.getByRole('button', { name: 'Découvrir mon espace' }).click();
        await sp.getByRole('dialog').waitFor({ state: 'hidden' });
        assert.equal(new URL(sp.url()).pathname, portal);
        if (initial.welcome_pending) assert.equal(new URL(sp.url()).searchParams.get('academic'), String(entry));
        const saved = await visit(sp, portal + '?academic=' + entry);
        assert.equal(saved.academic.id, entry);
        assert.equal(saved.welcome_pending, false);
        await proof(sp, 'GUIDE', 'Terminer les cinq étapes et recharger le tableau de bord étudiant', {
            premiereVisite: initial.welcome_pending,
            inscription: entry,
        });
        await mobile(sp);
        await sp.emulateMedia({ colorScheme: 'dark' });
        const combo = sp.getByRole('combobox', { name: 'Année académique affichée' }).filter({ visible: true }).first();
        await combo.focus();
        await combo.press('Enter');
        const options = sp.getByRole('option');
        const optionCount = await options.count();
        assert.equal(optionCount, saved.studentChrome.options.length);
        const archive = saved.studentChrome.options.find((option) => option.id !== entry);
        assert.ok(archive);
        const other = options.filter({ hasText: archive.label }).first();
        await other.waitFor();
        const menu = sp.getByRole('listbox');
        const bounds = await menu.boundingBox();
        assert.ok(bounds.width > 200 && bounds.x >= 0 && bounds.x + bounds.width <= 391);
        await proof(sp, 'ANNEES', 'Ouvrir les années au clavier sur mobile en thème sombre', {
            options: optionCount,
            menu: bounds,
            couleur: await palette(other),
        });
        await sp.keyboard.press('Escape');
        await combo.click();
        await other.click();
        await sp.waitForURL((url) => [portal, portal + '/overview'].includes(url.pathname) && url.searchParams.get('academic') === String(archive.id));
        await sp.context().close();

        const rector = await login('rectorat@usk.test', password);
        const reportPath = dashboard + '/delegation';
        const annual = await visit(rector, reportPath);
        const record = annual.report;
        assert.ok(record);
        const counts = db
            .prepare(
                `SELECT COUNT(DISTINCT student_profile_id) AS students,COUNT(*) AS enrollments,
            SUM(CASE WHEN enrollment_status='confirmed' THEN 1 ELSE 0 END) AS confirmed
            FROM academic_enrollments WHERE academic_year_id=?`,
            )
            .get(record.year_id);
        assert.equal(record.students, counts.students);
        assert.equal(record.enrollments, counts.enrollments);
        assert.equal(record.statuses.confirmed, counts.confirmed);
        await rector.getByRole('heading', { name: 'Finances', exact: true }).waitFor();
        await rector.getByRole('heading', { name: 'Résultats et jurys' }).waitFor();
        await rector.getByRole('heading', { name: 'Effectifs par faculté' }).waitFor();
        assert.ok(record.finance.length);
        await proof(rector, 'RECTORAT', 'Comparer les effectifs affichés aux inscriptions et consulter les finances', {
            ...counts,
            finances: record.finance,
            resultats: record.results,
        });
        const previous = annual.years.find((y) => y.id !== record.year_id);
        assert.ok(previous);
        await rector.getByLabel('Année académique', { exact: true }).selectOption(String(previous.id));
        await rector.waitForURL((url) => url.searchParams.get('year') === String(previous.id));
        await rector
            .getByText(previous.title + ' · Clôturée', { exact: true })
            .first()
            .waitFor();
        await rector.emulateMedia({ media: 'print' });
        assert.equal(await rector.getByRole('button', { name: 'Imprimer le rapport' }).isVisible(), false);
        assert.ok(await rector.getByRole('heading', { name: 'Finances', exact: true }).isVisible());
        await proof(rector, 'RAPPORT', 'Afficher le rapport imprimable de l’année précédente', { annee: previous.title });
        await rector.emulateMedia({ media: 'screen', colorScheme: 'dark' });
        await mobile(rector);
        await proof(rector, 'RECTORAT-MOBILE', 'Lire le rapport annuel sur téléphone', { annee: previous.title });
        await rector.context().close();

        const juryPath = dashboard + '/admin/academic-results';
        const dean = await login('dean.dr@usk.test', password);
        const jury = await visit(dean, juryPath);
        await dean.getByRole('heading', { name: 'Comment publier les résultats d’une session ?' }).waitFor();
        const evaluation = dean.getByRole('link', { name: 'Évaluations et corrections pédagogiques' });
        assert.equal(await evaluation.count(), jury.permissions.assessments ? 1 : 0);
        assert.ok(jury.permissions.publish);
        const year = jury.years.at(-1);
        await dean.getByLabel('Année académique', { exact: true }).selectOption(String(year.id));
        await dean.getByRole('button', { name: 'Filtrer', exact: true }).first().click();
        await dean.waitForURL((url) => url.searchParams.get('year') === String(year.id));
        await dean.emulateMedia({ colorScheme: 'dark' });
        await proof(dean, 'JURYS', 'Filtrer les délibérations et lire le circuit de publication', {
            annee: year.title,
            peutPublier: jury.permissions.publish,
        });
        const published = jury.runs.data.find((run) => run.state === 'published');
        assert.ok(published);
        await visit(dean, juryPath + '?run=' + published.id);
        await dean.getByRole('heading', { name: 'Résultats publiés', exact: true }).waitFor();
        assert.equal(await dean.getByRole('button', { name: 'Publier la session', exact: true }).count(), 0);
        await dean.getByRole('heading', { name: 'Résultats publiés' }).scrollIntoViewIfNeeded();
        await proof(dean, 'SESSION', 'Relire une édition publiée avec le compte du doyen', { jury: published.id });
        const admin = await login('admin@usk.test', password);
        await visit(admin, juryPath);
        const link = admin.getByRole('link', { name: 'Évaluations et corrections pédagogiques' });
        await link.waitFor();
        await palette(link);
        await link.click();
        await admin.waitForURL('**/app/dashboard/admin/assessments**');
        await admin.context().close();

        const documentsPath = dashboard + '/admin/official-documents';
        const docs = await visit(dean, documentsPath);
        const docsMain = dean.locator('.official-admin');
        await docsMain.getByRole('heading', { name: 'Catalogue', exact: true }).waitFor();
        await proof(dean, 'DOCUMENTS', 'Vérifier les filtres et les sections documentaires en thème sombre', {
            types: docs.types.data.length,
            filtre: await palette(docsMain.getByRole('button', { name: 'Filtrer' })),
        });
        const kind = docs.types.data[0].kind;
        await docsMain.locator('.official-catalog a').first().click();
        await dean.waitForURL((url) => url.hash === '#modeles' && url.searchParams.get('type') === String(docs.types.data[0].id));
        await docsMain.getByRole('heading', { name: 'Modèles · ' + docs.types.data[0].name }).waitFor();
        await docsMain.getByRole('link', { name: 'Réinitialiser' }).click();
        await dean.waitForURL((url) => url.pathname === documentsPath && !url.search);
        await docsMain.getByLabel('Famille', { exact: true }).selectOption(kind);
        await docsMain.getByRole('button', { name: 'Filtrer' }).click();
        await dean.waitForURL((url) => url.searchParams.get('kind') === kind);
        await docsMain.getByRole('link', { name: 'Réinitialiser' }).click();
        await dean.waitForURL((url) => url.pathname === documentsPath && !url.search);
        await mobile(dean);
        await docsMain.getByRole('link', { name: 'Demandes', exact: true }).click();
        await dean.waitForURL((url) => url.hash === '#demandes');
        await proof(dean, 'DOCUMENTS-MOBILE', 'Réinitialiser les filtres et rejoindre les demandes sur mobile', {
            rubrique: new URL(dean.url()).hash,
        });
        await dean.context().close();
    } finally {
        db.close();
    }
}).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
