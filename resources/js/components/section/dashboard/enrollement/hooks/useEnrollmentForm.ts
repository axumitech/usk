import { router } from '@inertiajs/react';
import axios from 'axios';
import { useEffect, useRef, useState, type SetStateAction } from 'react';
import type { DocumentMeta, DraftContext, DraftSnapshot, FormData as EnrollmentFormData, SaveStatus } from '../types';

type DraftHistoryProps = {
    draft?: { uuid: string; form_snapshot: DraftSnapshot; context?: DraftContext } | null;
    [key: string]: unknown;
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const fields = ['faculty_id', 'level_id', 'year_id', 'academic_program_id', 'name', 'email', 'program', 'confirmed'];
const formErrors = (errors: Record<string, string | string[]> = {}): Record<string, string> =>
    Object.fromEntries(Object.entries(errors).flatMap(([key, messages]) => {
        const field = key.replace(/^form_snapshot\./, '');
        const name = field.startsWith('documents.') ? field.split('.')[1] : field;
        return fields.includes(name) || field.startsWith('documents.') ? [[name, Array.isArray(messages) ? messages[0] : messages]] : [];
    }));

export function useEnrollmentForm(initial: DraftSnapshot & { uuid?: string; last_step?: number }) {
    const [formData, setFormData] = useState<EnrollmentFormData>({
        name: text(initial.name),
        email: text(initial.email),
        program: text(initial.program),
        documents: initial.documents ?? {},
        faculty_id: String(initial.faculty_id ?? ''),
        level_id: String(initial.level_id ?? ''),
        year_id: String(initial.year_id ?? ''),
        academic_program_id: String(initial.academic_program_id ?? ''),
    });
    const [uuid, setUuid] = useState<string | null>(initial.uuid || null);
    const uuidRef = useRef<string | null>(initial.uuid || null);
    const [isConfirmed, setIsConfirmed] = useState(!!initial.isConfirmed);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [saveError, setSaveError] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [uploadingKeys, setUploadingKeys] = useState<string[]>([]);
    const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
    const [previews, setPreviews] = useState<Record<string, string>>({});
    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const previewUrls = useRef<Record<string, string>>({});
    const busy = useRef(false);
    useEffect(
        () => () => {
            Object.values(previewUrls.current).forEach((url) => URL.revokeObjectURL(url));
        },
        [],
    );
    const updatePreview = (key: string, file?: File) => {
        if (previewUrls.current[key]) URL.revokeObjectURL(previewUrls.current[key]);
        delete previewUrls.current[key];
        if (file) previewUrls.current[key] = URL.createObjectURL(file);
        setPreviews({ ...previewUrls.current });
    };
    const updateFormData = (update: SetStateAction<EnrollmentFormData>) => {
        setFormData(update);
        setSaveStatus('idle');
        setFieldErrors({});
        setIsConfirmed(false);
    };
    const handleFieldChange = (field: keyof EnrollmentFormData, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        setSaveStatus('idle');
        setFieldErrors((previous) => ({ ...previous, [field]: '' }));
        setIsConfirmed(false);
    };
    const removeFile = (key: string) => {
        updatePreview(key);
        setFormData((prev) => {
            const documents = { ...prev.documents };
            delete documents[key];
            return { ...prev, documents };
        });
        setUploadErrors((prev) => ({ ...prev, [key]: '' }));
        setIsConfirmed(false);
        setSaveStatus('idle');
    };
    const handleFileChange = (key: string) => async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setUploadErrors((prev) => ({ ...prev, [key]: '' }));
        if (file.size > 10 * 1024 * 1024) {
            setUploadErrors((prev) => ({ ...prev, [key]: 'Ce fichier dépasse 10 Mo. Choisissez un fichier plus léger.' }));
            event.target.value = '';
            return;
        }
        updatePreview(key, file);
        setUploadingKeys((prev) => [...prev, key]);
        const body = new FormData();
        body.append('key', key);
        body.append('file', file);
        try {
            const { data } = await axios.post('/app/dashboard/enrollments/documents/upload', body);
            const document: DocumentMeta | undefined = data.temp
                ? {
                      temp: { token: data.temp.token, path: data.temp.path },
                      filename: data.temp.filename,
                      mime: data.temp.mime,
                      size_bytes: data.temp.size_bytes,
                  }
                : data.document;
            if (!data.ok || !document) throw new Error('Le transfert n’a pas abouti. Réessayez.');
            setFormData((prev) => ({ ...prev, documents: { ...prev.documents, [key]: document } }));
            setIsConfirmed(false);
            setSaveStatus('idle');
        } catch (error) {
            updatePreview(key);
            setUploadErrors((prev) => ({
                ...prev,
                [key]: axios.isAxiosError(error)
                    ? error.response?.data?.errors?.file?.[0] || 'Impossible de transférer le fichier. Vérifiez votre connexion et réessayez.'
                    : 'Impossible de transférer le fichier. Réessayez.',
            }));
        } finally {
            setUploadingKeys((prev) => prev.filter((item) => item !== key));
        }
    };
    const saveProgress = async (step = 1, snapshot = formData): Promise<boolean> => {
        if (busy.current || uploadingKeys.length) return false;
        busy.current = true;
        setSaveStatus('saving');
        setSaveError('');
        setFieldErrors({});
        try {
            const { data } = await axios.post('/app/dashboard/enrollments/save-progress', {
                uuid: uuidRef.current,
                last_step: step,
                form_snapshot: {
                    faculty_id: snapshot.faculty_id,
                    level_id: snapshot.level_id,
                    academic_program_id: snapshot.academic_program_id,
                    year_id: snapshot.year_id,
                    name: text(snapshot.name).trim(),
                    email: text(snapshot.email).trim(),
                    program: text(snapshot.program).trim(),
                    documents: snapshot.documents ?? {},
                    isConfirmed,
                },
            });
            if (!data.ok || !data.draft?.uuid) throw new Error('Sauvegarde non confirmée.');
            uuidRef.current = data.draft.uuid;
            setUuid(data.draft.uuid);
            setFormData((prev) => ({ ...prev, documents: data.draft.form_snapshot?.documents ?? prev.documents }));
            setSaveStatus('saved');
            router.replace<DraftHistoryProps>({
                url: route('dashboard.enrollments.edit', data.draft.uuid), preserveState: true, preserveScroll: true,
                props: (current) => {
                    const previous = current.draft;
                    const unchanged = previous && previous.uuid === data.draft.uuid && (['year_id', 'faculty_id', 'academic_program_id', 'level_id'] as const)
                        .every((field) => String(previous.form_snapshot[field] ?? '') === String(data.draft.form_snapshot?.[field] ?? ''));
                    const context = data.draft.context ?? (unchanged ? previous?.context : undefined);

                    return { ...current, draft: { ...data.draft, ...(context ? { context } : {}) } };
                },
            });
            return true;
        } catch (error) {
            const response = axios.isAxiosError(error) ? error.response?.data : null;
            const firstError = response?.errors ? Object.values(response.errors).flat()[0] : null;
            setFieldErrors(formErrors(response?.errors));
            setSaveError(String(firstError || response?.message || 'Votre dossier n’a pas été sauvegardé. Vérifiez votre connexion et réessayez.'));
            setSaveStatus('idle');
            return false;
        } finally {
            busy.current = false;
        }
    };
    const submitEnrollment = async (snapshot = formData): Promise<boolean> => {
        if (!uuidRef.current || !(await saveProgress(4, snapshot))) return false;
        try {
            const { data } = await axios.post<{ ok: boolean; redirect: string }>(route('dashboard.enrollments.submit', uuidRef.current));
            router.visit(data.redirect);
            return true;
        } catch (error) {
            const response = axios.isAxiosError(error) ? error.response?.data : null;
            setFieldErrors(formErrors(response?.errors));
            setSaveError(response?.message || 'La soumission a échoué. Réessayez.');
            return false;
        }
    };
    return {
        uuid,
        formData,
        setFormData: updateFormData,
        isConfirmed,
        setIsConfirmed,
        saveStatus,
        saveError,
        fieldErrors,
        uploadingKeys,
        uploadErrors,
        previews,
        fileInputRefs,
        handleFieldChange,
        handleFileChange,
        removeFile,
        saveProgress,
        submitEnrollment,
    };
}
