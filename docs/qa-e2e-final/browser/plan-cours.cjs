/* global require, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const { run } = require('./scenario.cjs');
const { probe } = require('./runtime.cjs');

const chapterTitle = 'Méthodes de lecture du droit — chapitre QA';
const syllabusTitle = 'Programme de lecture juridique — syllabus QA';
const objectives = 'Identifier les sources du droit, comparer deux décisions et justifier une interprétation.';
async function save(page) {
    const modal = page.getByRole('dialog');
    const [response] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST', { timeout: 120000 }),
        modal.getByRole('button', { name: 'Enregistrer', exact: true }).click(),
    ]);
    assert.ok([302, 303].includes(response.status()));
    await modal.waitFor({ state: 'hidden', timeout: 120000 });
}

run('plan-cours', async ({ login, visit, proof, origin }) => {
    const entry = probe('documents').entries['etudiant.droit@usk.test'];
    assert.ok(entry);
    const teacher = await login('professeur.droit@usk.test');
    const { overview } = await visit(teacher, '/app/dashboard/teacher?view=announcements');
    const target = overview.announcement_targets.find((item) => /Fondements.*Droit.*L1/i.test(item.title));
    assert.ok(target);
    const library = '/app/dashboard/teacher/resources?offering=' + target.id;
    let data = await visit(teacher, library);
    assert.equal(data.canManage, true);
    const modal = teacher.getByRole('dialog');
    let chapter = data.sections.find((item) => item.title === chapterTitle);
    if (!chapter) {
        await teacher.getByRole('button', { name: 'Ajouter un chapitre', exact: true }).click();
        await modal.getByLabel(/^Titre/).fill(chapterTitle);
        await modal.getByLabel(/^Position/).fill('2');
        await save(teacher);
        data = await visit(teacher, library);
        chapter = data.sections.find((item) => item.title === chapterTitle);
    }
    assert.ok(chapter);
    await teacher.getByRole('button', { name: 'Modifier le chapitre ' + chapterTitle }).click();
    await modal.getByLabel(/^Position/).fill('3');
    await save(teacher);
    data = await visit(teacher, library);
    assert.equal(data.sections.find((item) => item.id === chapter.id).position, 3);
    await proof(teacher, 'PLAN-01', 'Créer un chapitre puis enregistrer sa nouvelle position', {
        offre: target.id,
        chapitre: chapter.id,
        position: 3,
    });
    await teacher
        .getByRole('navigation', { name: 'Filtrer les supports par chapitre' })
        .getByRole('link', { name: new RegExp(chapterTitle) })
        .click();
    await teacher.waitForURL((url) => url.searchParams.get('section') === String(chapter.id));
    const filtered = await visit(teacher, teacher.url());
    let resource = filtered.resources.data.find((item) => item.title === syllabusTitle);
    if (!resource) {
        await teacher.getByRole('button', { name: 'Ajouter un support', exact: true }).click();
        assert.equal(await modal.getByLabel(/^Chapitre/).inputValue(), String(chapter.id));
        await modal.getByLabel(/^Type/).selectOption('syllabus');
        await modal.getByLabel(/^Titre/).fill(syllabusTitle);
        await modal.getByLabel('Texte pédagogique').fill(objectives);
        await save(teacher);
        await teacher.waitForURL((url) => url.searchParams.has('resource'));
        resource = (await visit(teacher, teacher.url())).selected;
    }
    assert.equal(resource.kind, 'syllabus');
    assert.equal(resource.academic_content_section_id, chapter.id);
    const selected = library + '&resource=' + resource.id;
    await visit(teacher, selected);
    if (!resource.is_published) {
        await teacher.getByRole('button', { name: 'Publier', exact: true }).click();
        await modal.getByLabel(/Motif|Justification/).fill('Publier le programme du cours fictif de Droit L1.');
        await save(teacher);
    }
    const published = (await visit(teacher, selected)).selected;
    assert.equal(published.is_published, true);
    assert.equal(published.body, objectives);
    await proof(teacher, 'PLAN-02', 'Publier le programme pédagogique dans le chapitre sélectionné', {
        offre: target.id,
        chapitre: chapter.id,
        syllabus: resource.id,
    });
    const student = await login('etudiant.droit@usk.test');
    await visit(student, '/app/dashboard/student/courses?academic=' + entry);
    await student.locator('.student-course-card').filter({ hasText: target.title }).first().click();
    await student
        .getByRole('navigation', { name: 'Rubriques du cours' })
        .getByRole('link', { name: /^Ressources/i })
        .first()
        .click();
    await student.waitForURL((url) => url.pathname.endsWith('/supports') && url.searchParams.get('academic') === String(entry));
    const course = await visit(student, student.url());
    const visible = course.resources.find((item) => item.title === syllabusTitle);
    assert.equal(visible?.kind, 'syllabus');
    assert.equal(visible.section, chapterTitle);
    await student.getByText(objectives, { exact: true }).waitFor();
    await proof(student, 'PLAN-03', 'Lire le syllabus et ses objectifs dans le bon chapitre', {
        inscription: entry,
        syllabus: resource.id,
        chapitre: chapterTitle,
    });
    const other = await login('professeur.med@usk.test');
    const outsideOffer = await other.goto(new URL(selected, origin).href, { waitUntil: 'domcontentloaded' });
    assert.equal(outsideOffer.status(), 404);
    const resourceOnly = new URL(selected, origin);
    resourceOnly.searchParams.delete('offering');
    const outsideResource = await other.goto(resourceOnly.href, { waitUntil: 'domcontentloaded' });
    assert.equal(outsideResource.status(), 403);
    assert.equal(await other.getByText(objectives, { exact: true }).count(), 0);
    await proof(other, 'PLAN-04', 'Ouvrir directement le cours et le syllabus de Droit comme professeur de Médecine', {
        offre: target.id,
        cours_hors_affectation: outsideOffer.status(),
        ressource_hors_affectation: outsideResource.status(),
    });
}).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
