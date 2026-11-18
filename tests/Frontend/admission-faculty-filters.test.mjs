import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../../resources/js/pages/dashboard/adminEnrollments/facultyFilters.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { optionsForFaculty, changeFaculty } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('Changer de faculté masque les options incompatibles et conserve les autres filtres', () => {
    const levels = [{ id: 1, faculty_id: 10 }, { id: 2, faculty_id: 20 }];
    const programs = [{ id: 3, faculty_id: 10 }, { id: 4, faculty_id: 20 }];
    const filters = { faculty_id: '10', level_id: '1', program_id: '3', year_id: '8', q: 'Dossier', queue: 'review' };

    assert.deepEqual(changeFaculty(filters, '20', levels, programs), { ...filters, faculty_id: '20', level_id: '', program_id: '' });
    assert.deepEqual(optionsForFaculty(levels, '20'), [levels[1]]);
    assert.deepEqual(optionsForFaculty(programs, '20'), [programs[1]]);
    assert.deepEqual(changeFaculty(filters, '', levels, programs), { ...filters, faculty_id: '' });
    assert.deepEqual(changeFaculty(filters, '10', levels, programs), filters);
});
