/* global require, process, Buffer */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { probe } = require('./runtime.cjs');
const { run } = require('./scenario.cjs');
run('cartes', async ({ login, visit, proof, check, out }) => {
    const fixture = probe('carte');
    const { password } = JSON.parse(fs.readFileSync(path.join(process.env.USK_RECETTE_V2_ROOT, 'final-qa.json'), 'utf8'));
    const student = await login('etudiant.dpu.01@usk.test', password);
    const card = '/app/dashboard/student/card?academic=' + fixture.entry;
    let state = await visit(student, card);
    if (!fixture.photo) {
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
        state = await visit(student, card);
        assert.equal(state.card_eligibility.photo_status, 'pending');
        await proof(
            student,
            'CAR-01',
            'Ajouter un portrait fictif depuis sa fiche',
            'Le portrait est enregistré et la demande de vérification est en attente.',
        );
    }
    const staff = await login('registrar.dr@usk.test', password);
    const query = '?q=' + encodeURIComponent(fixture.matricule);
    const requests = '/app/dashboard/admin/card-requests' + query + '&year=' + fixture.year;
    if (state.card_eligibility.photo_status !== 'approved') {
        await visit(staff, requests);
        const row = staff.getByRole('row').filter({ hasText: fixture.matricule });
        await row.getByRole('button', { name: 'Examiner' }).click();
        const dialog = staff.getByRole('dialog');
        await dialog.getByRole('combobox').selectOption('approved');
        await dialog.locator('textarea').fill('Portrait synthétique vérifié pour la recette logicielle.');
        await dialog.getByRole('button', { name: 'Enregistrer la décision' }).click();
        await dialog.waitFor({ state: 'hidden' });
    }
    const approved = await visit(student, card);
    assert.equal(approved.card_eligibility.photo_status, 'approved');
    assert.equal(approved.card_eligibility.ready, true);
    await proof(
        student,
        'CAR-02',
        'Relire la photo approuvée et les conditions de délivrance',
        'Le portrait et les conditions financières et académiques sont validés.',
    );

    const official = '/app/dashboard/admin/official-documents?academic=' + fixture.entry + '&kind=card';
    const fresh = await visit(staff, official);
    if (!fresh.documents.data.length) {
        await visit(staff, '/app/dashboard/admin/card-issuance/printing' + query);
        await staff.getByRole('row').filter({ hasText: fixture.matricule }).getByRole('link', { name: 'Aperçu et impression' }).click();
        await staff.waitForURL(
            (url) =>
                url.pathname.endsWith('/official-documents') &&
                url.searchParams.get('academic') === String(fixture.entry) &&
                url.searchParams.get('kind') === 'card',
        );
    }
    let center = await visit(staff, official);
    assert.equal(center.entry.matricule, fixture.matricule);
    const type = center.types.data.find((item) => item.kind === 'card' && item.code === 'CAR' && item.active);
    assert.ok(type, 'Type CAR actif requis pour le circuit documentaire de la faculté.');
    const open = () => staff.getByRole('button', { name: 'Ouvrir · ' + type.name, exact: true });
    const submit = async (page, trigger, reason, failure) => {
        await trigger.click();
        const modal = page.getByRole('dialog');
        const field = modal.getByLabel(/^Motif/);
        if (await field.count()) await field.fill(reason);
        const response = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/official-documents/'), {
            timeout: 120000,
        });
        await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click();
        assert.ok([302, 303].includes((await response).status()));
        if (failure) await modal.getByText(failure).first().waitFor({ timeout: 120000 });
        else await modal.waitFor({ state: 'hidden', timeout: 120000 });
    };
    const ticketFor = (data) => data.requests.data.find((row) => row.type_id === type.id && row.academic_enrollment_id === fixture.entry);
    const activeDocs = (data) =>
        data.documents.data.filter(
            (item) => item.official_document_type_id === type.id && item.academic_enrollment_id === fixture.entry && item.status === 'issued',
        );
    let ticket = ticketFor(center);
    if (!ticket) {
        await submit(staff, open(), 'Première carte universitaire de simulation.');
        center = await visit(staff, official);
        ticket = ticketFor(center);
        assert.equal(ticket?.status, 'open');
    }
    const action = (page, caption) => page.locator('article').filter({ hasText: ticket.subject }).getByRole('button', { name: caption, exact: true });
    if (ticket.status === 'open') {
        await submit(staff, action(staff, 'Contrôler'), 'Identité et conditions de la carte contrôlées.');
        ticket = ticketFor(await visit(staff, official));
        assert.equal(ticket.status, 'reviewed');
    }
    if (['reviewed', 'approved'].includes(ticket.status)) {
        await check(staff, 'CAR-03a', 'Ouvrir l’aperçu provisoire de la carte avant son émission', async () => {
            const link = staff.locator('article').filter({ hasText: ticket.subject }).getByRole('link', { name: 'Aperçu provisoire' });
            const [preview] = await Promise.all([staff.waitForEvent('download', { timeout: 120000 }), link.click()]);
            assert.equal(preview.suggestedFilename(), 'apercu-provisoire.pdf');
            const location = path.join(out, 'carte-apercu-provisoire.pdf');
            await preview.saveAs(location);
            const bytes = fs.readFileSync(location);
            assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
            return { demande: ticket.id, octets: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
        });
        await visit(staff, official);
    }
    if (ticket.status === 'reviewed') {
        const dean = await login('dean.dr@usk.test', password);
        const signer = await visit(dean, official);
        assert.equal(ticket.signer_id, signer.actor);
        await submit(dean, action(dean, 'Approuver'), 'Le signataire approuve la carte de simulation.');
        ticket = ticketFor(await visit(dean, official));
        assert.equal(ticket.status, 'approved');
        await proof(
            dean,
            'CAR-03',
            'Contrôler puis approuver la demande officielle de carte',
            'Demande ' + ticket.id + ' approuvée par le signataire après contrôle de la scolarité.',
        );
    }
    center = await visit(staff, official);
    ticket = ticketFor(center);
    if (ticket.status === 'approved') {
        await submit(staff, action(staff, 'Émettre'));
        center = await visit(staff, official);
        const limit = Date.now() + 120000;
        while (ticketFor(center).status === 'approved' && Date.now() < limit) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            center = await visit(staff, official);
        }
    }
    assert.equal(ticketFor(center).status, 'issued');
    assert.equal(activeDocs(center).length, 1);
    let [document] = activeDocs(center);
    const archive = staff.locator('article').filter({ hasText: document.number });
    const [downloaded] = await Promise.all([
        staff.waitForEvent('download', { timeout: 120000 }),
        archive.getByRole('link', { name: 'PDF archivé' }).click(),
    ]);
    const file = path.join(out, 'carte-specimen.pdf');
    await downloaded.saveAs(file);
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
    if (!document.printed_at) {
        await submit(staff, archive.getByRole('button', { name: 'Confirmer l’impression' }), 'Impression simulée depuis le PDF archivé.');
        [document] = activeDocs(await visit(staff, official));
    }
    assert.ok(document.printed_at);
    await proof(
        staff,
        'CAR-04',
        'Télécharger la carte officielle et enregistrer son impression logicielle',
        document.number +
            ' · PDF ' +
            bytes.length +
            ' octets · SHA-256 ' +
            createHash('sha256').update(bytes).digest('hex') +
            ' · impression ' +
            document.printed_at,
    );
    if (!document.delivered_at) {
        await submit(staff, archive.getByRole('button', { name: 'Confirmer la remise' }), 'Remise logicielle au titulaire fictif identifié.');
        [document] = activeDocs(await visit(staff, official));
    }
    assert.ok(document.delivered_at);
    await proof(
        staff,
        'CAR-05',
        'Consigner la remise logicielle de la carte',
        document.number + ' · impression ' + document.printed_at + ' · remise ' + document.delivered_at,
    );
    await submit(staff, open(), 'Nouvelle émission initiale pour le contrôle du doublon.', /Utilisez le duplicata ou le remplacement/);
    await proof(
        staff,
        'CAR-06',
        'Demander une deuxième émission initiale après remise',
        'Le serveur refuse la seconde carte et propose une procédure de remplacement.',
    );
    const end = await visit(staff, official);
    assert.equal(activeDocs(end).length, 1);
    assert.equal(activeDocs(end)[0].id, document.id);
    assert.equal(end.requests.data.filter((item) => item.type_id === type.id).length, 1);
}).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
});
