/* global require, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const { run } = require('./scenario.cjs');

const faculties = '/app/dashboard/admin/faculties';
const levels = '/app/dashboard/admin/levels';
const modify = 'Enregistrer les modifications';

function contrastOfInput(input) {
    return input.evaluate((el) => {
        const style = getComputedStyle(el);
        const rgb = (color) => {
            const values = color.match(/[\d.]+/g)?.map(Number);
            return values?.length === 3 || values?.[3] === 1 ? values.slice(0, 3) : null;
        };
        const luminance = (parts) =>
            parts
                .map((n) => n / 255)
                .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
                .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
        let background;
        for (let node = el; node && !background; node = node.parentElement) {
            const rendered = getComputedStyle(node);
            if (rendered.backgroundImage !== 'none' || Number(rendered.opacity) !== 1) return null;
            if (rendered.backgroundColor === 'transparent' || rendered.backgroundColor === 'rgba(0, 0, 0, 0)') continue;
            background = rgb(rendered.backgroundColor);
            if (!background) return null;
        }
        const fg = rgb(style.color);
        if (!fg || !background) return null;
        const values = [luminance(fg), luminance(background)].sort((a, b) => b - a);
        return Math.round(1000 * ((values[0] + 0.05) / (values[1] + 0.05))) / 1000;
    });
}

run('ux', async ({ login, visit, proof, check, origin }) => {
    const page = await login('admin@usk.test');
    const openFaculty = () => page.getByRole('button', { name: 'Modifier', exact: true }).first().click();
    const modal = page.getByRole('dialog');
    const persist = async (method, pathname, notification) => {
        const mutation = page.waitForResponse((r) => r.request().method() === method && new URL(r.url()).pathname === pathname);
        await modal.getByRole('button', { name: modify, exact: true }).click();
        const response = await mutation;
        assert.equal(response.status(), 303, 'Redirection de la mutation');
        await page.getByText(notification, { exact: true }).filter({ visible: true }).first().waitFor();
        await modal.waitFor({ state: 'hidden' });
        return new URL(response.headers().location, origin);
    };

    await check(page, 'UX-01', 'Enregistrer 1 000 caractères dans la description d’une faculté et relire la valeur', async () => {
        await visit(page, faculties);
        await openFaculty();
        const currentName = await modal.locator('#faculty-name').inputValue();
        const original = await modal.locator('#faculty-description').inputValue();
        const text = 'Présentation fictive de la faculté pour la recette universitaire. '.repeat(20).slice(0, 1000).trimEnd().padEnd(1000, '.');
        const field = modal.locator('#faculty-description');
        assert.equal(await field.getAttribute('maxlength'), '1000');
        await field.fill(text);
        await field.press('End');
        await page.keyboard.type('x');
        assert.equal(await field.inputValue(), text);
        await modal.getByText('1000 / 1 000 caractères').waitFor();
        const current = (await page.locator('#app').evaluate((el) => JSON.parse(el.dataset.page).props)).faculties.find(
            (f) => f.name === currentName,
        );
        assert.ok(current);
        await persist('PUT', faculties + '/' + current.id, 'Faculté mise à jour avec succès.');
        try {
            const fresh = await visit(page, faculties + '?faculty=' + current.id);
            assert.equal(fresh.faculties.find((f) => f.id === current.id).description, text);
            await page.getByText(text, { exact: true }).first().waitFor();
            await proof(page, 'UX-01a', 'Relire la description complète hors du formulaire', {
                faculty: current.id,
                characters: text.length,
                database: 'SQLite',
            });
        } finally {
            await visit(page, faculties + '?faculty=' + current.id);
            await openFaculty();
            assert.equal(await modal.locator('#faculty-name').inputValue(), currentName);
            await modal.locator('#faculty-description').fill(original);
            await persist('PUT', faculties + '/' + current.id, 'Faculté mise à jour avec succès.');
        }
        return { faculty: current.id, characters: text.length, restoredCharacters: original.length };
    });

    await check(page, 'UX-02', 'Modifier un niveau depuis son onglet Enseignants et conserver ce contexte', async () => {
        await visit(page, levels);
        const first = page.locator('a.levels-card').first();
        const canonical = new URL(await first.getAttribute('href'), origin);
        await first.click();
        await page.waitForURL((url) => url.pathname === canonical.pathname);
        const level = (await visit(page, canonical.href)).level;
        await page.getByRole('tab', { name: 'Enseignants', exact: true }).click();
        const button = page.getByRole('button', { name: 'Modifier le niveau' });
        await button.click();
        const id = level.id;
        const tag = modal.locator('#level-create-tag');
        const original = await tag.inputValue();
        const changed = 'Recette UX ' + Date.now();
        await tag.fill(changed);
        const mutation = levels + '/' + id;
        const target = await persist('POST', mutation, 'Niveau mis à jour avec succès.');
        try {
            assert.equal(target.pathname, canonical.pathname);
            assert.equal(target.searchParams.get('tab'), 'prof');
            const current = await visit(page, page.url());
            assert.equal(current.level.id, id);
            assert.equal(current.level.tag, changed);
            assert.equal(await page.getByRole('tab', { name: 'Enseignants' }).getAttribute('aria-selected'), 'true');
            await proof(page, 'UX-02a', 'Relire le niveau et l’onglet après rechargement', {
                id,
                tag: changed,
                location: target.pathname + target.search,
            });
        } finally {
            await visit(page, canonical.pathname + '?tab=prof');
            await button.click();
            await tag.fill(original);
            await persist('POST', mutation, 'Niveau mis à jour avec succès.');
        }
        return { id, location: target.pathname + target.search };
    });

    await check(page, 'UX-03', 'Utiliser les onglets et la modale au clavier', async () => {
        await visit(page, levels);
        await page.locator('a.levels-card').first().click();
        const tabs = page.getByRole('tablist');
        await tabs.getByRole('tab', { name: 'Vue d’ensemble' }).focus();
        await page.keyboard.press('End');
        const cours = tabs.getByRole('tab', { name: 'Cours', exact: true });
        await page.waitForFunction(() => document.activeElement?.id === 'level-tab-cours');
        assert.equal(await cours.getAttribute('aria-selected'), 'true');
        await page.keyboard.press('ArrowLeft');
        await page.waitForFunction(() => document.activeElement?.id === 'level-tab-prof');
        const trigger = page.getByRole('button', { name: 'Modifier le niveau', exact: true });
        await trigger.focus();
        await page.keyboard.press('Enter');
        await modal.waitFor();
        const gap = await modal.locator('#level-create-faculty').evaluate((select) => {
            const icon = select.previousElementSibling.getBoundingClientRect();
            return select.getBoundingClientRect().left + parseFloat(getComputedStyle(select).paddingLeft) - icon.right;
        });
        assert.ok(gap >= 4, 'Le libellé de la faculté chevauche son pictogramme : marge ' + gap + ' px');
        await proof(page, 'UX-03a', 'Vérifier la lisibilité du nom de faculté dans le sélecteur de niveau', { gapPixels: gap });
        for (let i = 0; i < 18; i++) {
            await page.keyboard.press('Tab');
            assert.ok(await modal.evaluate((el) => el.contains(document.activeElement)), 'Le focus reste dans le formulaire');
        }
        await page.keyboard.press('Escape');
        await modal.waitFor({ state: 'hidden' });
        assert.ok(await trigger.evaluate((el) => el === document.activeElement), 'Retour du focus à la commande');
        return { keys: ['End', 'ArrowLeft', 'Enter', 'Tab × 18', 'Escape'] };
    });

    for (const [theme, label] of [
        ['light', 'Clair'],
        ['dark', 'Sombre'],
    ]) {
        await check(page, 'UX-04-' + theme, 'Examiner le formulaire en thème ' + label + ' sur mobile', async () => {
            await page.setViewportSize({ width: 1410, height: 930 });
            await visit(page, faculties);
            await page
                .getByRole('button', { name: /Thème du dashboard/ })
                .filter({ visible: true })
                .first()
                .click();
            await page.getByRole('menuitemradio', { name: label, exact: true }).click();
            await page.locator('[data-dashboard-theme="' + theme + '"]').waitFor();
            await page.setViewportSize({ width: 390, height: 844 });
            await visit(page, faculties);
            await page.locator('[data-dashboard-theme="' + theme + '"]').waitFor();
            await openFaculty();
            await modal.waitFor();
            const contrast = await contrastOfInput(modal.locator('#faculty-name'));
            const bounds = await modal.evaluate((el) => {
                const rect = el.getBoundingClientRect();
                const save = el.querySelector('[type=submit]').getBoundingClientRect();
                return {
                    width: innerWidth,
                    height: innerHeight,
                    bodyWidth: document.documentElement.scrollWidth,
                    modalLeft: rect.left,
                    modalRight: rect.right,
                    modalTop: rect.top,
                    modalBottom: rect.bottom,
                    saveVisible: !!el
                        .querySelector('[type=submit]')
                        .contains(document.elementFromPoint(save.x + save.width / 2, save.y + save.height / 2)),
                };
            });
            assert.ok(
                bounds.bodyWidth <= bounds.width + 1 &&
                    bounds.modalLeft >= -1 &&
                    bounds.modalRight <= bounds.width + 1 &&
                    bounds.modalTop >= -1 &&
                    bounds.modalBottom <= bounds.height + 1,
                JSON.stringify(bounds),
            );
            assert.ok(bounds.saveVisible, 'Le bouton de sauvegarde reçoit les clics dans la zone visible');
            if (contrast !== null) assert.ok(contrast >= 4.5, 'Contraste texte/surface du champ : ' + contrast);
            return { theme, contrast, bounds };
        });
    }
}).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
