import type { AdmissionContext, FormData } from '../types';

export function admissionOptions(contexts: AdmissionContext[], form: FormData, legacySelected: boolean) {
    const year = contexts.filter((row) => String(row.year_id) === form.year_id);
    const faculty = year.filter((row) => String(row.faculty_id) === form.faculty_id);
    const programIds = [...new Set(faculty.flatMap((row) => (row.academic_program_id === null ? [] : [String(row.academic_program_id)])))];
    const allowsLegacy = faculty.some((row) => row.academic_program_id === null);
    const hasProgramChoice = Boolean(form.academic_program_id) || (allowsLegacy && (legacySelected || programIds.length === 0));
    const selected = hasProgramChoice
        ? faculty.filter((row) => String(row.academic_program_id ?? '') === (form.academic_program_id ?? ''))
        : [];
    const levelIds = [...new Set(selected.map((row) => String(row.level_id)))];

    return {
        facultyIds: [...new Set(year.map((row) => String(row.faculty_id)))],
        programIds,
        allowsLegacy,
        hasProgramChoice,
        levelIds,
        valid: Boolean(form.year_id && form.faculty_id && form.level_id && levelIds.includes(form.level_id)),
    };
}

export function changeAdmissionContext(
    form: FormData,
    field: 'year_id' | 'faculty_id' | 'academic_program_id' | 'level_id',
    value: string,
    contexts: AdmissionContext[],
    legacySelected: boolean,
) {
    const next = { ...form, [field]: value };
    const cleared: string[] = [];
    if (field === 'academic_program_id') legacySelected = value === '';
    let options = admissionOptions(contexts, next, legacySelected);
    if (next.faculty_id && !options.facultyIds.includes(next.faculty_id)) {
        next.faculty_id = '';
        cleared.push('faculté');
        options = admissionOptions(contexts, next, legacySelected);
    }
    if (next.academic_program_id && !options.programIds.includes(next.academic_program_id)) {
        next.academic_program_id = '';
        legacySelected = false;
        cleared.push('programme');
    }
    if (!options.allowsLegacy) legacySelected = false;
    options = admissionOptions(contexts, next, legacySelected);
    if (next.level_id && !options.levelIds.includes(next.level_id)) {
        next.level_id = '';
        cleared.push('niveau');
    }

    return { form: next, legacySelected, cleared };
}
