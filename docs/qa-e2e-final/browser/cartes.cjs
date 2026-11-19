/* global require, process, Buffer */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { probe } = require('./runtime.cjs');
const { run } = require('./scenario.cjs');
run('cartes', async ({ login, visit, proof, out }) => {
    const fixture = probe('carte');
    assert.equal(fixture.cards.length, 0, 'La carte de ce témoin doit être vierge.');
    const { password } = JSON.parse(fs.readFileSync(path.join(process.env.USK_RECETTE_V2_ROOT, 'final-qa.json'), 'utf8'));
    const student = await login('etudiant.dpu.01@usk.test', password);
    const card = '/app/dashboard/student/card?academic=' + fixture.entry;
    await visit(student, card);
    await student.getByRole('link', { name: 'Gérer ma photo de profil' }).click();
    await student.waitForURL((u) => u.pathname.endsWith('/profile'));
    const edit = student.getByRole('button', { name: 'Modifier mes informations', exact: true }).filter({ visible: true }).first();
    if (await edit.isVisible()) await edit.click();
    const portrait = await student.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 190;
        const draw = canvas.getContext('2d');
        draw.fillStyle = '#edf4eb';
        draw.fillRect(0, 0, 160, 190);
        const oval = (x, y, rx, ry, color) => {
            draw.beginPath();
            draw.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
            draw.fillStyle = color;
            draw.fill();
        };
        oval(80, 182, 60, 55, '#214f43');
        oval(80, 82, 39, 51, '#815d47');
        oval(80, 45, 37, 18, '#382b27');
        oval(67, 78, 3, 3, '#242121');
        oval(93, 78, 3, 3, '#242121');
        draw.strokeStyle = '#392923';
        draw.beginPath();
        draw.arc(80, 94, 12, 0.2, Math.PI - 0.2);
        draw.stroke();
        draw.fillStyle = '#fff';
        draw.font = '13px sans-serif';
        draw.fillText('SPÉCIMEN QA', 34, 174);
        return canvas.toDataURL('image/png').split(',')[1];
    });
    await student
        .locator('input[name=photo]')
        .setInputFiles({ name: 'portrait-fictif.png', mimeType: 'image/png', buffer: Buffer.from(portrait, 'base64') });
    const saved = student.waitForResponse((r) => ['POST', 'PUT', 'PATCH'].includes(r.request().method()) && r.url().includes('/profile'));
    await student.getByRole('button', { name: 'Enregistrer mon profil' }).click();
    assert.ok([302, 303].includes((await saved).status()));
    const pending = await visit(student, card);
    assert.equal(pending.card_eligibility.photo_status, 'pending');
    await proof(
        student,
        'CAR-01',
        'Ajouter un portrait fictif depuis sa fiche',
        'Le portrait est enregistré et la demande de vérification est en attente.',
    );
    const staff = await login('registrar.dr@usk.test', password);
    const query = '?q=' + encodeURIComponent(fixture.matricule);
    const requests = '/app/dashboard/admin/card-requests' + query + '&year=' + fixture.year;
    await visit(staff, requests);
    const row = staff.getByRole('row').filter({ hasText: fixture.matricule });
    await row.getByRole('button', { name: 'Examiner' }).click();
    const dialog = staff.getByRole('dialog');
    await dialog.getByRole('combobox').selectOption('approved');
    await dialog.locator('textarea').fill('Portrait synthétique vérifié pour la recette logicielle.');
    await dialog.getByRole('button', { name: 'Enregistrer la décision' }).click();
    await dialog.waitFor({ state: 'hidden' });
    const approved = await visit(student, card);
    assert.equal(approved.card_eligibility.ready, true);
    await proof(student, 'CAR-02', 'Valider la photo et vérifier les critères académiques et financiers', 'Le dossier est prêt pour la gravure.');
    await visit(staff, '/app/dashboard/admin/card-issuance/printing' + query);
    await staff.getByRole('row').filter({ hasText: fixture.matricule }).getByRole('link', { name: 'Aperçu et impression' }).click();
    await staff.waitForURL((u) => u.pathname.endsWith('/printing/' + fixture.entry));
    const previewUrl = staff.url();
    const preview = await visit(staff, previewUrl);
    assert.equal(preview.identity.matricule, fixture.matricule);
    await proof(staff, 'CAR-03', 'Ouvrir le recto et le verso de la carte', 'Le matricule du spécimen correspond à son inscription.');
    // Imprime la mise en page CSS vers un PDF local, sans appeler de périphérique physique.
    let exported;
    await staff.exposeFunction('exporterCarteQa', () => {
        exported = staff.pdf({ path: path.join(out, 'carte-specimen.pdf'), preferCSSPageSize: true, printBackground: true });
    });
    await staff.evaluate(() => {
        window.print = () => window.exporterCarteQa();
    });
    await staff.getByRole('button', { name: 'Imprimer', exact: true }).click();
    const confirm = staff.getByRole('button', { name: 'Confirmer l’impression', exact: true });
    await confirm.waitFor();
    assert.ok(exported);
    await exported;
    assert.equal(fs.readFileSync(path.join(out, 'carte-specimen.pdf')).subarray(0, 4).toString(), '%PDF');
    await confirm.click();
    await staff.waitForURL((u) => u.pathname.endsWith('/delivery'));
    assert.equal(probe('carte').cards.length, 1);
    await proof(staff, 'CAR-04', 'Exporter le badge en PDF local et confirmer sa production', 'Une carte produite est en attente de remise.');
    const delivery = '/app/dashboard/admin/card-issuance/delivery' + query;
    await visit(staff, delivery);
    await staff.getByRole('row').filter({ hasText: fixture.matricule }).getByRole('button', { name: 'Confirmer le retrait' }).click();
    await staff.getByRole('dialog').getByRole('button', { name: 'Confirmer le retrait' }).click();
    await staff.getByRole('dialog').waitFor({ state: 'hidden' });
    const history = await visit(staff, delivery + '&status=collected');
    assert.equal(history.cards.data.filter((c) => c.matricule === fixture.matricule && c.collected_at).length, 1);
    await proof(staff, 'CAR-05', 'Simuler la remise puis consulter son historique', 'Une seule carte délivrée, datée et rattachée au matricule.');
    const stale = await visit(staff, previewUrl);
    assert.equal(new URL(staff.url()).pathname, '/app/dashboard/admin/card-issuance/printing');
    assert.ok(!stale.rows.some((c) => c.id === fixture.entry));
    const final = probe('carte').cards;
    assert.equal(final.length, 1);
    assert.ok(final[0].collected_at);
    await proof(staff, 'CAR-06', 'Revenir au lien d’impression après remise', 'Le serveur renvoie à la liste et la base conserve une seule carte.');
}).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
});
