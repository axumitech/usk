import { useForm } from '@inertiajs/react';
import { CheckCircle2, Clock3, FilePenLine, LoaderCircle, Save, XCircle } from 'lucide-react';
import { documentReviewLabels, type Dossier } from './types';
type ReviewDocument = NonNullable<Dossier['documents']>[number];
const options = [
    { value: 'pending', label: 'À examiner', icon: Clock3 },
    { value: 'accepted', label: 'Accepter', icon: CheckCircle2 },
    { value: 'correction_requested', label: 'À corriger', icon: FilePenLine },
    { value: 'rejected', label: 'Refuser la pièce', icon: XCircle },
] as const;
export default function DocumentReview({
    document,
    enrollmentId,
    enabled,
    onFeedback,
    reasons,
    closed = false,
}: {
    document: ReviewDocument;
    enrollmentId: number;
    enabled: boolean;
    reasons: Record<string, string>;
    closed?: boolean;
    onFeedback: (message: string, tone: 'success' | 'error') => void;
}) {
    const form = useForm({
        verdict: document.review_status || 'pending',
        reason_codes: (document.review_reason_codes || []).filter((code) => Object.hasOwn(reasons, code)),
        reason: document.review_reason_detail || '',
    });
    const requiresReason = ['rejected', 'correction_requested'].includes(form.data.verdict);
    const hasOtherReason = form.data.reason_codes.includes('other');
    const reasonCodesError = Object.entries(form.errors).find(([key]) => key === 'reason_codes' || key.startsWith('reason_codes.'))?.[1];
    return (
        <section className={`review-proof-decision is-${document.review_status}`} aria-label="Décision sur la pièce sélectionnée">
            <header>
                <div>
                    <span>EXAMEN DU JUSTIFICATIF · VERSION {document.version}</span>
                    <h3>{document.needs_reexamination ? 'Nouvelle version : enregistrez un nouveau verdict.' : 'Quelle suite pour cette pièce ?'}</h3>
                </div>
                <span className={`review-proof-status is-${document.review_status}`}>{documentReviewLabels[document.review_status]}</span>
            </header>
            {enabled && document.review_comment && (
                <div className="review-proof-readonly">
                    <strong>Motif enregistré lors du dernier examen</strong>
                    <p>{document.review_comment}</p>
                </div>
            )}
            {enabled ? (
                <form
                    noValidate
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (form.processing) return;
                        form.clearErrors();
                        const codes = requiresReason ? form.data.reason_codes.filter((code) => Object.hasOwn(reasons, code)) : [];
                        const detail = requiresReason && hasOtherReason ? form.data.reason.trim() : null;
                        if (requiresReason && codes.length === 0) {
                            const message = 'Sélectionnez au moins un motif.';
                            form.setError('reason_codes', message);
                            onFeedback(message, 'error');
                            return;
                        }
                        if (detail !== null && (detail.length < 3 || detail.length > 1000)) {
                            const message = 'Précisez l’autre motif en 3 à 1000 caractères.';
                            form.setError('reason', message);
                            onFeedback(message, 'error');
                            return;
                        }
                        form.transform((data) => ({ ...data, reason_codes: codes, reason: detail }));
                        form.post(`/app/dashboard/admin/enrollments/${enrollmentId}/documents/${document.uuid}/review`, {
                            preserveScroll: true,
                            onSuccess: (page) => {
                                if (
                                    page.component === 'dashboard/adminEnrollments/Show' &&
                                    (page.props.enrollment as Dossier | undefined)?.id === enrollmentId &&
                                    typeof page.props.success === 'string' &&
                                    page.props.success
                                ) {
                                    onFeedback(page.props.success, 'success');
                                } else {
                                    onFeedback('Le résultat du contrôle n’a pas été confirmé. Vérifiez le dossier avant de réessayer.', 'error');
                                }
                            },
                            onError: (errors) =>
                                onFeedback(Object.values(errors)[0] || 'Le verdict n’a pas pu être enregistré. Veuillez réessayer.', 'error'),
                        });
                    }}
                >
                    <fieldset disabled={form.processing}>
                        <legend className="sr-only">Choisir un verdict pour cette pièce</legend>
                        <div className="review-verdict-options">
                            {options.map((option) => (
                                <label key={option.value}>
                                    <input
                                        type="radio"
                                        name={`verdict-${document.uuid}`}
                                        value={option.value}
                                        checked={form.data.verdict === option.value}
                                        onChange={() => form.setData('verdict', option.value)}
                                    />
                                    <span>
                                        <option.icon size={17} />
                                        {option.label}
                                    </span>
                                </label>
                            ))}
                        </div>
                        {requiresReason && (
                            <fieldset
                                className="review-reason-options"
                                aria-describedby={`proof-reasons-help-${document.uuid}${reasonCodesError ? ` proof-reasons-error-${document.uuid}` : ''}`}
                            >
                                <legend className="review-proof-label">Motifs communiqués au candidat (au moins un)</legend>
                                <div className="review-reason-choices">
                                    {Object.entries(reasons).map(([code, label]) => (
                                        <label key={code}>
                                            <input
                                                type="checkbox"
                                                name={`reason-codes-${document.uuid}`}
                                                value={code}
                                                checked={form.data.reason_codes.includes(code)}
                                                aria-invalid={!!reasonCodesError}
                                                onChange={(event) => {
                                                    form.setData(
                                                        'reason_codes',
                                                        event.target.checked
                                                            ? [...form.data.reason_codes, code]
                                                            : form.data.reason_codes.filter((selected) => selected !== code),
                                                    );
                                                    form.clearErrors('reason_codes', 'reason');
                                                }}
                                            />
                                            <span>{label}</span>
                                        </label>
                                    ))}
                                </div>
                                <small id={`proof-reasons-help-${document.uuid}`}>
                                    Plusieurs motifs peuvent être sélectionnés. Une précision est nécessaire uniquement pour « Autre motif ».
                                </small>
                                {reasonCodesError && (
                                    <p id={`proof-reasons-error-${document.uuid}`} className="review-error" role="alert">
                                        {reasonCodesError}
                                    </p>
                                )}
                                {hasOtherReason && (
                                    <>
                                        <label className="review-proof-label" htmlFor={`proof-reason-${document.uuid}`}>
                                            Précisez l’autre motif (obligatoire)
                                        </label>
                                        <textarea
                                            id={`proof-reason-${document.uuid}`}
                                            value={form.data.reason}
                                            onChange={(event) => {
                                                form.setData('reason', event.target.value);
                                                form.clearErrors('reason');
                                            }}
                                            rows={3}
                                            maxLength={1000}
                                            required
                                            minLength={3}
                                            aria-invalid={!!form.errors.reason}
                                            aria-describedby={form.errors.reason ? `proof-reason-error-${document.uuid}` : undefined}
                                            placeholder="Expliquez ce que le candidat doit corriger…"
                                        />
                                        {form.errors.reason && (
                                            <p id={`proof-reason-error-${document.uuid}`} className="review-error" role="alert">
                                                {form.errors.reason}
                                            </p>
                                        )}
                                    </>
                                )}
                            </fieldset>
                        )}
                        <small>Le candidat est averti du verdict. Le compte rendu est envoyé une fois toutes les pièces examinées.</small>
                        {Object.entries(form.errors)
                            .filter(([key]) => key !== 'reason' && key !== 'reason_codes' && !key.startsWith('reason_codes.'))
                            .map(([key, error]) => (
                                <p key={key} role="alert" className="review-error">
                                    {error}
                                </p>
                            ))}
                        <button className="review-secondary" disabled={form.processing} type="submit">
                            {form.processing ? <LoaderCircle className="review-saving-spinner" size={15} /> : <Save size={15} />}
                            {form.processing
                                ? 'Enregistrement…'
                                : form.data.verdict === 'accepted'
                                  ? 'Accepter cette pièce'
                                  : form.data.verdict === 'correction_requested'
                                    ? 'Demander une correction'
                                    : form.data.verdict === 'rejected'
                                      ? 'Enregistrer le refus'
                                      : 'Enregistrer le verdict'}
                        </button>
                    </fieldset>
                </form>
            ) : (
                <div className="review-proof-readonly">
                    <p>
                        {document.review_comment ||
                            (closed
                                ? 'Ce dossier est clôturé. Les pièces et leurs verdicts restent consultables.'
                                : 'Commencez l’analyse pour examiner cette pièce.')}
                    </p>
                </div>
            )}
        </section>
    );
}
