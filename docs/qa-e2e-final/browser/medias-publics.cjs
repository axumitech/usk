/* global require, process, __dirname */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./scenario.cjs');

run('medias-publics', async ({ login, visit, check, out }) => {
    const root = fs.realpathSync(process.env.USK_RECETTE_V2_ROOT);
    assert.match(path.basename(root), /^usk_qa_e2e-rattachement(?:-[a-z0-9_-]+)?$/i);
    const { password } = JSON.parse(fs.readFileSync(path.join(root, 'final-qa.json')));
    const admin = await login('admin@usk.test', password);
    const sitePage = '/app/dashboard/admin/site';
    const media = [
        { id: 'logo', key: 'logoUrl', alt: 'Logo du site', file: 'icon-192.png' },
        { id: 'favicon', key: 'faviconUrl', alt: 'Favicon du site', file: 'apple-touch-icon.png' },
    ].map((item) => {
        const filename = path.resolve(__dirname, '../../../public/pwa', item.file);
        const bytes = fs.readFileSync(filename);
        return {
            ...item,
            filename,
            width: bytes.readUInt32BE(16),
            height: bytes.readUInt32BE(20),
            hash: createHash('sha256').update(bytes).digest('hex'),
        };
    });
    const siteName = 'Portail universitaire fictif — étude des médias';
    const slogan = 'Université fictive de recette — édition textuelle';
    const observed = { source: media.map(({ id, width, height, hash }) => ({ id, width, height, hash })) };
    const persist = () => fs.writeFileSync(path.join(out, 'diagnostic-medias.json'), JSON.stringify(observed, null, 2));
    const edit = () => admin.getByRole('button', { name: 'Modifier les paramètres', exact: true }).click();
    const save = async () => {
        const [response] = await Promise.all([
            admin.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.includes('/admin/site'), { timeout: 120000 }),
            admin.getByRole('button', { name: 'Mettre à jour', exact: true }).click(),
        ]);
        assert.ok([302, 303].includes(response.status()), 'Statut de sauvegarde ' + response.status());
        await admin.getByRole('button', { name: 'Modifier les paramètres', exact: true }).waitFor({ timeout: 120000 });
    };
    const inspect = async (site) => {
        const results = [];
        for (const item of media) {
            const img = admin.getByRole('img', { name: item.alt, exact: true });
            const record = { id: item.id, reference: site?.[item.key] ?? null };
            if (await img.count()) {
                await img.scrollIntoViewIfNeeded();
                record.visible = await img.isVisible();
                Object.assign(
                    record,
                    await img.evaluate(async (el) => {
                        const url = new URL(el.currentSrc || el.src, location.origin);
                        if (url.origin !== location.origin) throw new Error('Le média du témoin doit être local.');
                        const response = await fetch(url.href, { credentials: 'omit', cache: 'no-store', redirect: 'error' });
                        const bytes = await response.arrayBuffer();
                        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (n) =>
                            n.toString(16).padStart(2, '0'),
                        ).join('');
                        const decoded = await el.decode().then(
                            () => true,
                            () => false,
                        );
                        return {
                            path: url.pathname,
                            http: response.status,
                            mime: (response.headers.get('content-type') || '').split(';')[0],
                            bytes: bytes.byteLength,
                            hash,
                            decoded,
                            width: el.naturalWidth,
                            height: el.naturalHeight,
                        };
                    }),
                );
            }
            results.push(record);
        }
        return results;
    };
    const assertMedia = (actual) => {
        for (const [i, row] of actual.entries()) {
            assert.ok(row.reference, row.id + ' : référence absente');
            assert.equal(row.http, 200, row.id + ' : HTTP ' + row.http);
            assert.equal(row.path, '/storage/' + row.reference);
            assert.equal(row.mime, 'image/png');
            assert.equal(row.hash, media[i].hash);
            assert.equal(row.visible, true);
            assert.equal(row.decoded, true);
            assert.equal(row.width, media[i].width);
            assert.equal(row.height, media[i].height);
        }
    };
    const previous = (await visit(admin, sitePage)).site;
    await edit();
    const name = admin.locator('#siteName');
    const settings = await name.evaluate((el) => {
        el.addEventListener('invalid', () => el.setAttribute('data-qa-invalid', 'true'), { once: true });
        return { required: el.required, maxLength: el.maxLength, label: el.labels[0]?.textContent.trim() };
    });
    const writes = [];
    const observeWrite = (request) => {
        if (['POST', 'PUT', 'PATCH'].includes(request.method()) && new URL(request.url()).pathname.includes('/admin/site'))
            writes.push(request.method());
    };
    admin.on('request', observeWrite);
    await name.fill('A'.repeat(255));
    await name.press('End');
    await name.press('B');
    const longueurApres256eFrappe = (await name.inputValue()).length;
    await name.fill('');
    const submit = admin.getByRole('button', { name: 'Mettre à jour', exact: true });
    if (settings.required) {
        await submit.click();
    } else {
        await Promise.all([
            admin.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.includes('/admin/site')),
            submit.click(),
        ]);
        await admin.locator('#siteName + p').waitFor();
    }
    const validation = await name.evaluate((el) => ({
        invalid: el.getAttribute('data-qa-invalid') === 'true',
        valueMissing: el.validity.valueMissing,
        focus: document.activeElement === el,
        message: el.validationMessage,
    }));
    await admin.screenshot({ path: path.join(out, 'IMG-05-champ-vide.png') });
    await name.fill(previous?.siteName ?? '');
    admin.off('request', observeWrite);
    const restored = (await visit(admin, sitePage)).site;
    const result = {
        ...settings,
        ...validation,
        longueurApres256eFrappe,
        requetesEcriture: writes,
        memeFiche: previous?.id === restored?.id,
        donneesInchangees: JSON.stringify(previous) === JSON.stringify(restored),
    };
    fs.writeFileSync(path.join(out, 'validation-nom.json'), JSON.stringify(result, null, 2));
    await check(admin, 'IMG-05', 'Refuser localement le nom vide, conserver la fiche sans requête d’écriture', async () => {
        assert.equal(result.required, true);
        assert.equal(result.maxLength, 255);
        assert.equal(result.longueurApres256eFrappe, 255);
        assert.match(result.label, /obligatoire/i);
        assert.ok(result.invalid && result.valueMissing && result.focus && result.message);
        assert.deepEqual(writes, []);
        assert.deepEqual(restored, previous);
        assert.equal(new URL(admin.url()).pathname, sitePage);
        return result;
    });
    if (process.env.USK_QA_SITE_FIELD_ONLY === 'true') return;
    await edit();
    await admin.locator('#siteName').fill(siteName);
    await admin.locator('#siteTagline').fill('Université fictive de recette — première édition');
    await admin.locator('#contactEmail').fill('communication@usk.test');
    for (const item of media) await admin.locator('#' + item.id).setInputFiles(item.filename);
    await save();
    let site = (await visit(admin, sitePage)).site;
    assert.equal(site.siteName, siteName);
    observed.apres_upload = await inspect(site);
    persist();
    await check(admin, 'IMG-01', 'Téléverser les deux PNG et relire leurs références après sauvegarde', async () => {
        for (const item of media) assert.ok(site[item.key], item.id + ' : référence de stockage absente');
        return observed.apres_upload.map(({ id, reference }) => ({ id, reference }));
    });
    await check(admin, 'IMG-02', 'Charger les deux images publiques sans session et vérifier chaque image effectivement affichée', async () => {
        assertMedia(observed.apres_upload);
        return observed.apres_upload;
    });
    await edit();
    await admin.locator('#siteTagline').fill(slogan);
    for (const item of media) assert.equal(await admin.locator('#' + item.id).evaluate((input) => input.files.length), 0);
    await save();
    site = (await visit(admin, sitePage)).site;
    observed.edition_textuelle = { slogan: site.siteTagline, medias: await inspect(site) };
    persist();
    await check(admin, 'IMG-03', 'Enregistrer un changement de texte sans fichier et vérifier les deux références', async () => {
        assert.equal(site.siteTagline, slogan);
        for (const [i, row] of observed.edition_textuelle.medias.entries()) {
            assert.ok(row.reference, row.id + ' : référence perdue après édition sans fichier');
            assert.equal(row.reference, observed.apres_upload[i].reference);
        }
        return observed.edition_textuelle;
    });
    await check(admin, 'IMG-04', 'Relire les deux fichiers et leurs dimensions après l’édition textuelle', async () => {
        assertMedia(observed.edition_textuelle.medias);
        return observed.edition_textuelle.medias;
    });
}).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
