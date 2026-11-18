import AdminModal from '@/components/admin/AdminModal';
import { useForm } from '@inertiajs/react';
import { isAxiosError } from 'axios';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
type FormValue = string | number | boolean | null | File | { amount: string; due_at: string }[];
export type Field = {
    name: string;
    label: string;
    type?: string;
    required?: boolean;
    accept?: string;
    options?: { value: string | number; label: string }[];
    optionsFor?: (values: Record<string, FormValue>) => NonNullable<Field['options']>;
    visibleFor?: (values: Record<string, FormValue>, errors: Record<string, string | undefined>) => boolean;
    clears?: string | string[];
    help?: string;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    value?: FormValue;
    scheduleCurrencyField?: string;
    allowZeroScheduleAmount?: boolean;
    optionalScheduleDueDates?: boolean;
};
export type FormSpec = {
    title: string;
    description: string;
    action: string;
    method?: 'post' | 'put';
    fields: Field[];
    values?: Record<string, FormValue>;
    submitLabel?: string;
    eyebrow?: string;
    requireSuccessFlash?: boolean;
};
export default function AcademicForm({ spec, onClose, onSuccess }: { spec: FormSpec; onClose: () => void; onSuccess: (message: string) => void }) {
    const id = useId();
    const submitting = useRef(false);
    const form = useForm<Record<string, FormValue>>({
        ...spec.values,
        ...Object.fromEntries(
            spec.fields.map((field) => [
                field.name,
                field.value ?? (field.type === 'checkbox' ? false : field.type === 'schedule' ? [] : field.type === 'file' ? null : ''),
            ]),
        ),
    });
    const { setError } = form;
    useEffect(() => {
        if (!spec.requireSuccessFlash) return;

        const showNetworkError = (event: Event) => {
            if (!submitting.current) return;
            const error = (event as CustomEvent<{ exception: unknown }>).detail?.exception;
            if (!isAxiosError(error) || error.response || !error.config?.url) return;
            if (!['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(error.code ?? '')) return;
            const requested = new URL(error.config.url, window.location.href);
            const action = new URL(spec.action, window.location.href);
            if (requested.origin !== action.origin || requested.pathname !== action.pathname) return;

            event.preventDefault();
            setError('_response', 'Réponse non reçue. Réessayez ce formulaire ou consultez le compte avant une nouvelle saisie.');
        };
        document.addEventListener('inertia:exception', showNetworkError, true);
        return () => document.removeEventListener('inertia:exception', showNetworkError, true);
    }, [setError, spec.action, spec.requireSuccessFlash]);

    return (
        <AdminModal
            title={spec.title}
            description={spec.description}
            formId={id}
            onClose={onClose}
            submitLabel={spec.submitLabel || 'Enregistrer'}
            eyebrow={spec.eyebrow}
            busy={form.processing}
            wide
            errors={form.errors}
            className="academic-form-modal"
        >
            <form
                id={id}
                className="academic-admin-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (form.processing || submitting.current) return;
                    submitting.current = true;
                    form.clearErrors('_response');

                    form.submit(spec.method ?? 'post', spec.action, {
                        preserveScroll: true,
                        forceFormData: spec.fields.some((field) => field.type === 'file'),
                        onFinish: () => {
                            submitting.current = false;
                        },
                        errorBag: `academic-${id.replace(/\W/g, '')}`,
                        onSuccess: (page) => {
                            const flash = page.props.flash as { success?: string } | undefined;
                            const message = flash?.success ?? page.props.success;
                            if (typeof message === 'string' && message.trim()) {
                                onSuccess(message);
                            } else if (spec.requireSuccessFlash) {
                                form.setError(
                                    '_response',
                                    'Le résultat de cette opération n’a pas été confirmé. Vérifiez le dossier avant de réessayer.',
                                );
                            } else {
                                onSuccess('Modification enregistrée.');
                            }
                        },
                    });
                }}
            >
                <fieldset disabled={form.processing}>
                    {spec.fields.map((field) => {
                        if (field.visibleFor && !field.visibleFor(form.data, form.errors)) return null;

                        const inputId = `${id}-${field.name}`;
                        const errorId = `${inputId}-error`;
                        const fieldError = form.errors[field.name];
                        const fieldErrorProps = {
                            'aria-invalid': fieldError ? true : undefined,
                            'aria-describedby': fieldError ? errorId : undefined,
                        };
                        if (field.type === 'schedule') {
                            const rows = (Array.isArray(form.data[field.name]) ? form.data[field.name] : []) as { amount: string; due_at: string }[];
                            const currency = field.scheduleCurrencyField ? form.data[field.scheduleCurrencyField] : 'USD';
                            const optionalDates = field.optionalScheduleDueDates;
                            return (
                                <section className="academic-plan" key={field.name}>
                                    <h3>{field.label}</h3>
                                    {field.help && <p>{field.help}</p>}
                                    {rows.map((row, index) => (
                                        <div key={index}>
                                            <label>
                                                {optionalDates ? 'Date limite (facultative)' : `Échéance ${index + 1}`}
                                                <input
                                                    type="date"
                                                    required={!optionalDates}
                                                    value={row.due_at}
                                                    onChange={(event) =>
                                                        form.setData(
                                                            field.name,
                                                            rows.map((value, i) => (i === index ? { ...value, due_at: event.target.value } : value)),
                                                        )
                                                    }
                                                />
                                            </label>
                                            <label>
                                                Montant{currency ? ` (${currency})` : ''}
                                                <input
                                                    type="number"
                                                    min={field.allowZeroScheduleAmount ? '0' : '0.01'}
                                                    step="0.01"
                                                    required
                                                    value={row.amount}
                                                    onChange={(event) =>
                                                        form.setData(
                                                            field.name,
                                                            rows.map((value, i) => (i === index ? { ...value, amount: event.target.value } : value)),
                                                        )
                                                    }
                                                />
                                            </label>
                                            <button
                                                type="button"
                                                className="academic-icon-button"
                                                aria-label={optionalDates ? `Retirer la ligne ${index + 1}` : `Retirer l’échéance ${index + 1}`}
                                                onClick={() =>
                                                    form.setData(
                                                        field.name,
                                                        rows.filter((_, i) => i !== index),
                                                    )
                                                }
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        className="admin-secondary"
                                        onClick={() => form.setData(field.name, [...rows, { amount: '', due_at: '' }])}
                                    >
                                        <Plus size={15} />
                                        {optionalDates ? 'Ajouter un montant' : 'Ajouter une échéance'}
                                    </button>
                                </section>
                            );
                        }
                        return (
                            <div className={`academic-field ${field.type === 'checkbox' ? 'is-check' : ''}`} key={field.name}>
                                <label htmlFor={inputId}>
                                    {field.type === 'checkbox' && (
                                        <input
                                            id={inputId}
                                            {...fieldErrorProps}
                                            type="checkbox"
                                            checked={Boolean(form.data[field.name])}
                                            required={field.required}
                                            onChange={(event) => form.setData(field.name, event.target.checked)}
                                        />
                                    )}
                                    {field.label}
                                    {field.required && <span> *</span>}
                                </label>
                                {field.type === 'select' ? (
                                    <select
                                        id={inputId}
                                        {...fieldErrorProps}
                                        value={String(form.data[field.name] ?? '')}
                                        required={field.required}
                                        onChange={(event) =>
                                            form.setData((data) => ({
                                                ...data,
                                                ...Object.fromEntries([field.clears ?? []].flat().map((name) => [name, ''])),
                                                [field.name]: event.target.value,
                                            }))
                                        }
                                    >
                                        <option value="">{field.name === 'academic_department_id' ? 'Tronc commun' : 'Sélectionner…'}</option>
                                        {(field.optionsFor?.(form.data) ?? field.options)?.map((option) => (
                                            <option value={option.value} key={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                ) : field.type === 'textarea' ? (
                                    <textarea
                                        id={inputId}
                                        {...fieldErrorProps}
                                        rows={4}
                                        value={String(form.data[field.name] ?? '')}
                                        required={field.required}
                                        minLength={field.minLength}
                                        maxLength={field.maxLength}
                                        onChange={(event) => form.setData(field.name, event.target.value)}
                                    />
                                ) : field.type === 'file' ? (
                                    <input
                                        id={inputId}
                                        {...fieldErrorProps}
                                        type="file"
                                        accept={field.accept}
                                        onChange={(event) => form.setData(field.name, event.target.files?.[0] || null)}
                                    />
                                ) : (
                                    field.type !== 'checkbox' && (
                                        <input
                                            id={inputId}
                                            {...fieldErrorProps}
                                            type={field.type || 'text'}
                                            value={String(form.data[field.name] ?? '')}
                                            required={field.required}
                                            pattern={field.pattern}
                                            step={field.type === 'number' ? '0.01' : undefined}
                                            onInput={
                                                field.type === 'datetime-local'
                                                    ? (event) => form.setData(field.name, event.currentTarget.value)
                                                    : undefined
                                            }
                                            onChange={
                                                field.type === 'datetime-local'
                                                    ? undefined
                                                    : (event) => form.setData(field.name, event.currentTarget.value)
                                            }
                                        />
                                    )
                                )}
                                {field.help && <small>{field.help}</small>}
                                {fieldError && (
                                    <p id={errorId} role="alert">
                                        {fieldError}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </fieldset>
            </form>
        </AdminModal>
    );
}
