import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../../resources/js/pages/dashboard/teaching/learningPublication.ts', import.meta.url), 'utf8');
const exported = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exported });
const { publicationConfirmation } = exported;
const draft = { id: 16, academic_offering_id: 13, revision: 1, is_published: false, archived_at: null };
const published = { ...draft, revision: 2, is_published: true };
const page = (selected, offering = 13) => ({ component: 'dashboard/teaching/Learning', props: { selected, offering } });

test('Confirme les trois transitions seulement sur la réponse du serveur pour la version suivante', () => {
    assert.equal(publicationConfirmation(page(published), draft, 'publish'), 'Support publié.');
    const withdrawn = { ...draft, revision: 3 };
    assert.equal(publicationConfirmation(page(withdrawn), published, 'withdraw'), 'Support retiré de la publication.');
    assert.equal(publicationConfirmation(page({ ...withdrawn, archived_at: '2026-11-19' }), published, 'archive'), 'Support archivé.');
});

test('Une réponse obsolète, ambiguë ou issue d’une autre fiche ne confirme aucune publication', () => {
    for (const response of [
        page(null), page(draft), page({ ...published, revision: 3 }), page({ ...published, id: 17 }),
        page({ ...published, academic_offering_id: 14 }), page(published, 14),
        page({ ...published, archived_at: '2026-11-19' }), page({ ...published, is_published: false }),
        { ...page(published), component: 'dashboard/teaching/Assessments' },
    ]) assert.equal(publicationConfirmation(response, draft, 'publish'), undefined);
});
