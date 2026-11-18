type FacultyOption = { id: number; faculty_id: number };

export function optionsForFaculty<T extends FacultyOption>(options: T[], faculty: string | undefined): T[] {
    return faculty ? options.filter((option) => String(option.faculty_id) === String(faculty)) : options;
}

export function changeFaculty<T extends { level_id?: string; program_id?: string }>(
    filters: T,
    faculty: string,
    levels: FacultyOption[],
    programs: FacultyOption[],
) {
    const retain = (id: string | undefined, options: FacultyOption[]) =>
        optionsForFaculty(options, faculty).some((option) => String(option.id) === String(id)) ? id : '';

    return { ...filters, faculty_id: faculty, level_id: retain(filters.level_id, levels), program_id: retain(filters.program_id, programs) };
}
