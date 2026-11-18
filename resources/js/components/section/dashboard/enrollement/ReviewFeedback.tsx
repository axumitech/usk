import type { StudentDocument as Document } from '@/lib/studentEnrollment';
import { defaultUploadLimits, documentAccept, proofUploadError, proofUploadHelp, type UploadLimits } from '@/lib/uploadLimits';
import { useForm, usePage } from '@inertiajs/react';
import { FileUp, Upload } from 'lucide-react';
import { useRef } from 'react';
import '../../../../../css/admin-enrollments.css';
export function ReplacementForm({ document }: { document: Document }) {
    const form = useForm<{ file: File | null }>({ file: null });
    const limits = usePage<{ uploadLimits?: UploadLimits }>().props.uploadLimits ?? defaultUploadLimits;
    const input = useRef<HTMLInputElement>(null);
    const validate = (file: File | null) => {
        if (!file) return 'Choisissez d’abord le fichier corrigé à transmettre.';
        return proofUploadError(file, limits);
    };
    return (
        <form
            className="review-replacement-form"
            onSubmit={(event) => {
                event.preventDefault();
                if (form.processing) return;
                const file = input.current?.files?.[0] || null;
                form.clearErrors();
                const error = validate(file);
                if (error) {
                    form.setError('file', error);
                    input.current?.focus();
                    return;
                }
                form.transform(() => ({ file }));
                form.post(`/app/dashboard/enrollments/documents/${document.uuid}/replace`, {
                    forceFormData: true,
                    preserveScroll: true,
                    errorBag: `replacement-${document.uuid}`,
                    onSuccess: () => {
                        form.reset();
                        if (input.current) input.current.value = '';
                    },
                });
            }}
        >
            <label htmlFor={`replacement-${document.uuid}`}>Remplacer ce justificatif</label>
            <input
                ref={input}
                id={`replacement-${document.uuid}`}
                type="file"
                accept={documentAccept}
                disabled={form.processing}
                aria-invalid={!!form.errors.file}
                aria-describedby={`replacement-help-${document.uuid} replacement-error-${document.uuid}`}
                onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    form.clearErrors();
                    form.setData('file', file);
                    if (file) {
                        const error = validate(file);
                        if (error) form.setError('file', error);
                    }
                }}
            />
            <small id={`replacement-help-${document.uuid}`}>
                {proofUploadHelp(limits)}
            </small>
            {form.data.file && (
                <p className="review-selected-file">
                    <FileUp size={15} />
                    {form.data.file.name}
                </p>
            )}
            <p id={`replacement-error-${document.uuid}`} className="review-error" role={form.errors.file ? 'alert' : undefined}>
                {form.errors.file}
            </p>
            {form.progress && <p role="status">Envoi : {form.progress.percentage}%</p>}
            <button className="admin-primary" type="submit" disabled={form.processing}>
                <Upload size={16} />
                {form.processing ? 'Envoi en cours…' : 'Envoyer le justificatif corrigé'}
            </button>
        </form>
    );
}
