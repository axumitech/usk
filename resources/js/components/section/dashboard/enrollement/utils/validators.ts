import type { FormData, Requirements } from '../types';
export function validateStep(
    step: number,
    formData: FormData,
    requirements: Requirements,
    noLevelsForSelectedFaculty: boolean,
    isConfirmed: boolean,
    availableProgramCount = 0,
    legacyProgram = availableProgramCount === 0,
    contextAvailable = true,
) {
    const errors: Record<string, string> = {};
    const validateDocuments = (documents: Requirements['personal_info']) => {
        documents
            .filter((doc) => doc.required)
            .forEach((doc) => {
                const value = formData.documents[doc.key];
                if (!value?.uuid && !value?.temp?.token) errors[doc.key] = `Ajoutez le document « ${doc.label} » pour continuer.`;
            });
    };
    if (step === 1) {
        if (!formData.year_id) errors.year_id = 'Choisissez une année académique.';
        if (!formData.faculty_id) errors.faculty_id = 'Choisissez une faculté.';
        if (availableProgramCount > 0 && !formData.academic_program_id && !legacyProgram) errors.academic_program_id = 'Choisissez votre programme officiel ou la formation sans programme officiel proposée.';
        if (legacyProgram && !formData.program.trim()) errors.program = 'Indiquez votre programme ou filière souhaitée.';
        if (!formData.level_id || noLevelsForSelectedFaculty) errors.level_id = 'Choisissez un niveau disponible.';
        if (formData.year_id && formData.faculty_id && formData.level_id && !contextAvailable) errors.level_id = 'Vérifiez la formation disponible pour l’année sélectionnée.';
    }
    if (step === 2) {
        if (!formData.name.trim()) errors.name = 'Indiquez votre nom complet.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) errors.email = 'Indiquez une adresse email valide.';
    }
    if (step === 3) {
        validateDocuments([...requirements.personal_info, ...requirements.academic_info]);
    }
    if (step === 4 && !isConfirmed) errors.confirmed = 'Confirmez l’exactitude des informations avant de soumettre votre dossier.';
    return errors;
}
