import { AlertCircle, BookOpen, Building2, Calendar, GraduationCap } from 'lucide-react';
import type { DraftContext, DraftSnapshot, Faculty, FormData, Level, Year } from '../../types';

type ContextField = 'year_id' | 'faculty_id' | 'academic_program_id' | 'level_id';
type Props = {
    faculties: Faculty[];
    years: Year[];
    availableLevels: Level[];
    availablePrograms: { id: number; name: string; code: string }[];
    allowsLegacy: boolean;
    hasProgramChoice: boolean;
    noLevelsForSelectedFaculty: boolean;
    formData: FormData;
    historicalContext?: DraftContext;
    historicalValues?: DraftSnapshot;
    onContextChange: (field: ContextField, value: string) => void;
    onProgramTextChange: (value: string) => void;
    errors: Record<string, string>;
};

export default function Step1Faculty({ faculties, years, availableLevels, availablePrograms, allowsLegacy, hasProgramChoice,
    noLevelsForSelectedFaculty, formData, historicalContext, historicalValues, onContextChange, onProgramTextChange, errors }: Props) {
    const historical = { year_id: historicalContext?.year, faculty_id: historicalContext?.faculty, level_id: historicalContext?.level };
    const select = (key: 'year_id' | 'faculty_id' | 'level_id', label: string, Icon: typeof Calendar, options: (Faculty | Level | Year)[], placeholder: string, help: string, disabled: boolean) => (
        <div key={key} className="enrollment-field">
            <label htmlFor={key}><Icon size={17} />{label}<span className="enrollment-required">*</span></label>
            <select id={key} value={formData[key]} disabled={disabled} required aria-invalid={!!errors[key]}
                aria-describedby={`${key}-help${errors[key] ? ` ${key}-error` : ''}`} onChange={(event) => onContextChange(key, event.target.value)}>
                <option value="">{placeholder}</option>
                {formData[key] && !options.some((option) => String(option.id) === formData[key]) && (
                    <option value={formData[key]} disabled>{(String(historicalValues?.[key] ?? '') === formData[key] && historical[key]) || `${label} sauvegardé`} — indisponible pour cette candidature</option>
                )}
                {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
            <p id={`${key}-help`} className="enrollment-field-help">{help}</p>
            {errors[key] && <p id={`${key}-error`} className="enrollment-field-error" role="alert">{errors[key]}</p>}
        </div>
    );

    return (
        <div className="enrollment-fields">
            {select('year_id', 'Année académique', Calendar, years, 'Sélectionnez une année', 'Seules les années admissibles à la candidature sont proposées.', false)}
            {select('faculty_id', 'Votre faculté', Building2, faculties, !formData.year_id ? 'Choisissez d’abord votre année' : 'Sélectionnez une faculté', 'Les facultés dépendent des campagnes disponibles pour cette année.', !formData.year_id)}
            {(availablePrograms.length > 0 || !!formData.academic_program_id) && (
                <div className="enrollment-field">
                    <label htmlFor="academic_program_id"><BookOpen size={17} />Programme ou filière<span className="enrollment-required">*</span></label>
                    <select id="academic_program_id" value={formData.academic_program_id || (hasProgramChoice ? '' : '__choose_program__')}
                        disabled={!formData.faculty_id} required={!allowsLegacy} aria-invalid={!!errors.academic_program_id}
                        aria-describedby={`academic-program-help${errors.academic_program_id ? ' academic-program-error' : ''}`}
                        onChange={(event) => onContextChange('academic_program_id', event.target.value)}>
                        <option value="__choose_program__">Sélectionnez un programme ou une filière</option>
                        {formData.academic_program_id && !availablePrograms.some((program) => String(program.id) === formData.academic_program_id) && (
                            <option value={formData.academic_program_id} disabled>{(String(historicalValues?.academic_program_id ?? '') === formData.academic_program_id && historicalContext?.program) || 'Programme sauvegardé'} — indisponible</option>
                        )}
                        {availablePrograms.map((program) => <option key={program.id} value={program.id}>{program.code} · {program.name}</option>)}
                        {allowsLegacy && <option value="">Sans programme officiel — formation à préciser</option>}
                    </select>
                    <p id="academic-program-help" className="enrollment-field-help">Les niveaux seront proposés après ce choix.</p>
                    {errors.academic_program_id && <p id="academic-program-error" role="alert" className="enrollment-field-error">{errors.academic_program_id}</p>}
                </div>
            )}
            {formData.faculty_id && !formData.academic_program_id && hasProgramChoice && (
                <div className="enrollment-field">
                    <label htmlFor="program"><BookOpen size={17} />Programme ou filière souhaitée<span className="enrollment-required">*</span></label>
                    <input id="program" value={formData.program} required placeholder="Précisez votre formation" aria-invalid={!!errors.program}
                        aria-describedby={`program-help${errors.program ? ' program-error' : ''}`} onChange={(event) => onProgramTextChange(event.target.value)} />
                    <p id="program-help" className="enrollment-field-help">Ce niveau ne demande pas de programme officiel. Précisez ici votre projet d’études.</p>
                    {errors.program && <p id="program-error" className="enrollment-field-error" role="alert">{errors.program}</p>}
                </div>
            )}
            {select('level_id', 'Niveau académique', GraduationCap, availableLevels,
                !formData.faculty_id ? 'Choisissez d’abord votre faculté' : !hasProgramChoice ? 'Choisissez d’abord votre programme' : 'Sélectionnez un niveau',
                'Les niveaux proposés respectent l’année, la faculté et le programme choisis.',
                !formData.year_id || !formData.faculty_id || !hasProgramChoice || noLevelsForSelectedFaculty)}
            {(!years.length || (formData.year_id && !faculties.length) || noLevelsForSelectedFaculty) && (
                <p className="enrollment-info"><AlertCircle size={19} />
                    {!years.length ? 'Aucune année académique n’est ouverte à la candidature.' : !faculties.length ? 'Aucune faculté n’est disponible pour cette année.' : 'Aucun niveau n’est disponible pour cette sélection.'}{' '}
                    Contactez le service des inscriptions pour être accompagné.
                </p>
            )}
        </div>
    );
}
