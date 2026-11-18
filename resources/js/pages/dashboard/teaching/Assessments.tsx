import Pagination from '@/components/admin/Pagination';
import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import { dateTime } from '@/pages/dashboard/teaching/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    BookOpen,
    CalendarClock,
    CalendarDays,
    ClipboardCheck,
    ClipboardList,
    FileText,
    Paperclip,
    Plus,
    Search,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import '../../../../css/dashboard/assessment-detail.css';
import '../../../../css/dashboard/assessment-draft.css';
import '../../../../css/dashboard/assessments.css';
import '../../../../css/dashboard/student-academic.css';
import '../../../../css/student-portal.css';
import AcademicForm, { type Field, type FormSpec } from '../studentAcademic/AcademicForm';

type Page<T> = { data: T[]; total: number };
type Option = { id: number; title: string };
type Session = { id: number; room: string; starts_at: string; is_published: boolean };
type Summary = {
    resource_id: number;
    offering_id: number;
    title: string;
    course: string;
    state: string;
    category: string;
    modality: string;
    session_code: string;
    opens_at: string | null;
    closes_at: string | null;
    scheduled_publish_at: string | null;
    scheduled_publish_blocked: boolean;
    revision: number;
};
type Details = Summary & {
    body: string | null;
    objectives: string | null;
    attempt_limit: number;
    late_minutes: number;
    maximum_points: number | null;
    weight: string | null;
    group_work: boolean;
    feedback_policy: string;
    academic_session_id: number | null;
    academic_content_section_id: number | null;
    rubric: { label: string; maximum: number }[];
    session: (Session & { ends_at: string; cancelled_at: string | null }) | null;
    subject: { filename: string | null; size_bytes: number | null; download_url: string } | null;
    submission_formats: string[];
    submission_max_kb: number;
    scheduled_publish_notify: boolean;
    scheduled_publish_error: string | null;
};
type Participant = {
    id: number;
    name: string | null;
    academic_enrollment_id: number;
    group: string | null;
    group_points: number | null;
    academic_group: string | null;
    matricule: string | null;
    participation: string;
    correction_state: string;
    revision: number;
    points: number | null;
    adjustment: number | null;
    criterion_points: number[] | null;
    feedback: string | null;
    feedback_filename: string | null;
    released_at: string | null;
};
type Group = { id: number; label: string; revision: number; shared_points: number | null; feedback: string | null; leader_enrollment_id: number };
type Props = {
    prefix: string;
    admin: boolean;
    canEdit: boolean;
    offering: number | null;
    offering_title: string | null;
    years: Option[];
    gradebook_url: string | null;
    draft_options: { formats: string[]; default_formats: string[]; maximum_kb: number };
    participant_groups: { value: string; label: string; kind: 'work' | 'class' | 'unassigned' }[];
    filters: Record<string, string | number | undefined>;
    categories: Record<string, string>;
    participation: string[];
    offers: Page<Option>;
    sessions: Page<Session> | null;
    sections: Option[];
    items: Page<Summary>;
    selected: Details | null;
    groups: Page<Group> | null;
    records: Page<Participant> | null;
    candidates: Page<{ id: number; name: string | null }> | null;
    record: Participant | null;
    copy: {
        version: number;
        current_version: number;
        body: string | null;
        received_at: string | null;
        late: boolean | null;
        download_url: string | null;
    } | null;
    history: Page<{
        revision: number;
        created_at: string;
        snapshot: Pick<Participant, 'participation' | 'correction_state' | 'points' | 'feedback'>;
        file_url: string | null;
    }> | null;
    state_counts: Record<string, number>;
    upcoming_count: number;
    open_count: number;
    work_counts: Record<string, number>;
};
const states: Record<string, string> = {
    draft: 'Brouillon',
    published: 'Publié',
    closed: 'Clôturé',
    cancelled: 'Annulé',
    finalized: 'Finalisé',
    validated: 'Validé',
};
const assessmentStatuses = [
    { value: '', label: 'Toutes' },
    { value: 'draft', label: 'Brouillons' },
    { value: 'published', label: 'Publiées' },
    { value: 'closed', label: 'Clôturées' },
    { value: 'cancelled', label: 'Annulées' },
];
const participationLabels: Record<string, string> = {
    unassessed: 'À qualifier',
    submitted: 'Remis',
    late_submission: 'Remis en retard',
    not_submitted: 'Non remis',
    present: 'Présent',
    late: 'Arrivé en retard',
    absent: 'Absent',
    excused: 'Absence justifiée',
    exempt: 'Dispensé',
    interrupted: 'Interrompu',
    invalidated: 'Invalidé',
};
const points = (value: number | null | undefined) => (value == null ? '' : (value / 100).toFixed(2));
const reason: Field = { name: 'reason', label: 'Motif', type: 'textarea', required: true, minLength: 5, help: 'Au moins 5 caractères.' };
const actionUrl = (path: string, filters: Props['filters']) => {
    const url = new URL(path, window.location.origin);
    for (const name of ['year', 'from_gradebook', 'gradebook_semester', 'grades_students_page', 'grades_assessments_page', 'participant_q', 'participant_group'] as const) {
        const value = filters[name];
        if (value !== null && value !== undefined && value !== '') {
            url.searchParams.set(name, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
        }
    }

    return url.href;
};
const checkNotice: Field = { name: 'notify', label: 'Notifier les étudiants concernés', type: 'checkbox' };
const zone = 'Africa/Kinshasa';
const megabytes = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
function dateInput(value: string | null | undefined) {
    if (!value) return '';
    return new Intl.DateTimeFormat('sv-SE', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    })
        .format(new Date(value))
        .replace(' ', 'T');
}

function publicationBadge(item: Summary) {
    if (item.scheduled_publish_blocked) return { state: 'blocked', label: 'Publication bloquée' };
    if (item.scheduled_publish_at) return { state: 'scheduled', label: 'Programmée' };
    return { state: item.state, label: states[item.state] ?? item.state };
}

function Errors({ errors }: { errors: Record<string, string> }) {
    return (
        <>
            {Object.values(errors).map((error, index) => (
                <p role="alert" className="portal-error" key={index}>
                    {error}
                </p>
            ))}
        </>
    );
}

function DraftForm({ props, item, onClose }: { props: Props; item?: Details; onClose: () => void }) {
    const form = useForm({
        title: item?.title ?? '',
        body: item?.body ?? '',
        objectives: item?.objectives ?? '',
        category: item?.category ?? 'assignment',
        session_code: item?.session_code ?? 'ordinaire',
        modality: item?.modality ?? 'submission',
        opens_at: dateInput(item?.opens_at),
        closes_at: dateInput(item?.closes_at),
        scheduled_publish_at: dateInput(item?.scheduled_publish_at),
        scheduled_publish_notify: item?.scheduled_publish_notify ?? false,
        subject: null as File | null,
        remove_subject: false,
        submission_formats: item?.submission_formats ?? props.draft_options.default_formats,
        academic_session_id: item?.academic_session_id?.toString() ?? '',
        academic_content_section_id: item?.academic_content_section_id?.toString() ?? '',
        maximum_points: points(item?.maximum_points),
        weight: item?.weight ?? '',
        attempt_limit: item?.attempt_limit ?? 1,
        late_minutes: item?.late_minutes ?? 0,
        group_work: item?.group_work ?? false,
        feedback_policy: item?.feedback_policy ?? 'validated',
        rubric: item?.rubric?.map((row) => ({ label: row.label, maximum: points(row.maximum) })) ?? [],
        revision: item?.revision,
        reason: '',
    });
    const title = item ? 'Modifier le brouillon' : 'Nouvelle évaluation';
    const course = item?.course ?? props.offering_title;
    const submission = form.data.modality === 'submission';
    const maximumAllowed = props.draft_options.maximum_kb / 1024;
    const [maximum, setMaximum] = useState(String((item?.submission_max_kb ?? props.draft_options.maximum_kb) / 1024));
    const [chosenSession, setChosenSession] = useState<Session | null>(item?.session ?? null);
    const acceptedDocuments = props.draft_options.formats.map((extension) => `.${extension}`).join(',');
    const errorFields: Record<string, string | undefined> = form.errors;
    const errors = Object.values(errorFields).filter(Boolean);
    const errorSummary = useRef<HTMLDivElement | null>(null);
    const focusErrors = () => requestAnimationFrame(() => errorSummary.current?.focus());
    const invalid = (field: string) => Boolean(errorFields[field]) || undefined;
    const sessionLabel = (session: Session) => `${dateTime(session.starts_at)} · ${session.room} · ${session.is_published ? 'Publiée' : 'À publier'}`;

    return (
        <section className="assessment-draft" aria-labelledby="assessment-draft-title">
            <header className="assessment-draft-heading">
                <button type="button" className="assessment-draft-back" onClick={onClose} disabled={form.processing}>
                    <ArrowLeft size={17} aria-hidden="true" /> {item ? 'Retour à l’évaluation' : 'Retour aux évaluations'}
                </button>
                <div className="assessment-draft-title">
                    <span className="assessment-draft-symbol">
                        <ClipboardList size={24} aria-hidden="true" />
                    </span>
                    <div>
                        <h1 id="assessment-draft-title" tabIndex={-1}>
                            {title}
                        </h1>
                        {course && <p>{course}</p>}
                    </div>
                </div>
            </header>
            <form
                className="assessment-draft-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (form.processing) return;
                    if (submission && form.data.submission_formats.length === 0) {
                        form.setError('submission_formats', 'Sélectionnez au moins un format de dépôt.');
                        focusErrors();
                        return;
                    }
                    form.transform(({ submission_formats, ...data }) => ({
                        ...data,
                        group_work: submission && data.group_work,
                        scheduled_publish_notify: Boolean(data.scheduled_publish_at && data.scheduled_publish_notify),
                        ...(submission ? { submission_formats, submission_max_kb: Math.floor(Number(maximum) * 1024) } : {}),
                    }));
                    const target = item ? route(props.prefix + 'edit', item.resource_id) : route(props.prefix + 'store', props.offering!);
                    form.post(actionUrl(target, props.filters), {
                        preserveScroll: true,
                        onSuccess: (page) => {
                            if (page.component === 'dashboard/teaching/Assessments' && typeof page.flash?.dashboardAction === 'string') onClose();
                        },
                        onError: focusErrors,
                    });
                }}
            >
                {errors.length > 0 && (
                    <div className="assessment-draft-errors" role="alert" tabIndex={-1} ref={errorSummary}>
                        <strong>Vérifiez les informations saisies</strong>
                        <ul>
                            {[...new Set(errors)].map((error) => (
                                <li key={error}>{error}</li>
                            ))}
                        </ul>
                    </div>
                )}
                <fieldset className="assessment-draft-fields">
                    <legend>
                        <ClipboardList size={18} aria-hidden="true" /> Informations générales
                    </legend>
                    <label className="assessment-field-wide">
                        <span className="assessment-input-label">Titre de l’évaluation</span>
                        <input
                            placeholder="Ex. Contrôle d’algorithmique"
                            required
                            aria-invalid={invalid('title')}
                            maxLength={180}
                            value={form.data.title}
                            onChange={(e) => form.setData('title', e.target.value)}
                        />
                    </label>
                    <label>
                        <span className="assessment-input-label">Catégorie</span>
                        <select
                            aria-invalid={invalid('category')}
                            value={form.data.category}
                            onChange={(e) => form.setData('category', e.target.value)}
                        >
                            {Object.entries(props.categories).map(([key, value]) => (
                                <option key={key} value={key}>
                                    {value}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        <span className="assessment-input-label">Session</span>
                        <input
                            required
                            aria-invalid={invalid('session_code')}
                            maxLength={60}
                            placeholder="ordinaire ou rattrapage"
                            value={form.data.session_code}
                            onChange={(e) => form.setData('session_code', e.target.value)}
                        />
                    </label>
                    <label className="assessment-field-wide">
                        <span className="assessment-input-label">Section du cours</span>
                        <select
                            aria-invalid={invalid('academic_content_section_id')}
                            value={form.data.academic_content_section_id}
                            onChange={(e) => form.setData('academic_content_section_id', e.target.value)}
                        >
                            <option value="">Aucune</option>
                            {props.sections.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.title}
                                </option>
                            ))}
                        </select>
                    </label>
                </fieldset>
                <fieldset className="assessment-draft-fields">
                    <legend>
                        <Paperclip size={18} aria-hidden="true" /> Consignes et sujet
                    </legend>
                    <label>
                        <span className="assessment-input-label">Consignes</span>
                        <textarea
                            rows={3}
                            maxLength={20000}
                            placeholder="Indiquez le travail attendu"
                            aria-invalid={invalid('body')}
                            value={form.data.body}
                            onChange={(e) => form.setData('body', e.target.value)}
                        />
                    </label>
                    <label>
                        <span className="assessment-input-label">Objectifs</span>
                        <textarea
                            rows={3}
                            maxLength={5000}
                            placeholder="Précisez les compétences évaluées"
                            aria-invalid={invalid('objectives')}
                            value={form.data.objectives}
                            onChange={(e) => form.setData('objectives', e.target.value)}
                        />
                    </label>
                    {item?.subject && (
                        <a className="assessment-subject-file assessment-field-wide" href={item.subject.download_url}>
                            <FileText size={18} aria-hidden="true" /> {item.subject.filename || 'Télécharger le sujet actuel'}
                        </a>
                    )}
                    <label className="assessment-field-wide">
                        <span className="assessment-input-label">{item?.subject ? 'Remplacer le sujet' : 'Joindre le sujet'}</span>
                        <input
                            type="file"
                            accept={acceptedDocuments}
                            aria-describedby="assessment-subject-help"
                            aria-invalid={invalid('subject')}
                            disabled={form.data.remove_subject}
                            onChange={(event) => form.setData('subject', event.currentTarget.files?.[0] ?? null)}
                        />
                        <small id="assessment-subject-help">{megabytes.format(maximumAllowed)} Mo maximum par fichier.</small>
                    </label>
                    {item?.subject && !form.data.subject && (
                        <label className="assessment-draft-check assessment-field-wide">
                            <input
                                type="checkbox"
                                checked={form.data.remove_subject}
                                onChange={(event) => form.setData('remove_subject', event.target.checked)}
                            />
                            Retirer le sujet actuel
                        </label>
                    )}
                </fieldset>
                <fieldset className="assessment-draft-fields">
                    <legend>
                        <CalendarDays size={18} aria-hidden="true" /> Modalité et calendrier
                    </legend>
                    <div className="assessment-modality assessment-field-wide" role="radiogroup" aria-label="Modalité">
                        {[
                            {
                                value: 'submission',
                                label: 'Remise de travail',
                                detail: 'Les étudiants déposent leur travail en ligne.',
                                icon: FileText,
                            },
                            {
                                value: 'in_person',
                                label: 'Épreuve en présentiel',
                                detail: 'L’évaluation est liée à une séance du planning.',
                                icon: CalendarDays,
                            },
                        ].map(({ value, label, detail, icon: Icon }) => (
                            <label key={value}>
                                <input
                                    type="radio"
                                    name="assessment-modality"
                                    value={value}
                                    checked={form.data.modality === value}
                                    onChange={() => form.setData('modality', value)}
                                />
                                <Icon size={20} aria-hidden="true" />
                                <span>
                                    <strong>{label}</strong>
                                    <small>{detail}</small>
                                </span>
                            </label>
                        ))}
                    </div>
                    <label className="assessment-field-wide">
                        <span className="assessment-input-label">Séance du planning</span>
                        <select
                            required={form.data.modality === 'in_person'}
                            aria-invalid={invalid('academic_session_id')}
                            value={form.data.academic_session_id}
                            onChange={(event) => {
                                const value = event.currentTarget.value;
                                form.setData('academic_session_id', value);
                                setChosenSession(props.sessions?.data.find(({ id }) => String(id) === value) ?? null);
                            }}
                        >
                            <option value="">{submission ? 'Aucune séance' : 'Choisir une séance'}</option>
                            {form.data.academic_session_id &&
                                !props.sessions?.data.some(({ id }) => String(id) === form.data.academic_session_id) && (
                                    <option value={form.data.academic_session_id}>
                                        {chosenSession ? sessionLabel(chosenSession) : `Séance n°${form.data.academic_session_id}`}
                                    </option>
                                )}
                            {props.sessions?.data.map((s) => (
                                <option value={s.id} key={s.id}>
                                    {sessionLabel(s)}
                                </option>
                            ))}
                        </select>
                    </label>
                    {props.sessions && props.sessions.total > props.sessions.data.length && (
                        <div className="assessment-draft-session-pages assessment-field-wide">
                            <span>Parcourir les séances du planning</span>
                            <Pagination value={props.sessions} preserveState />
                        </div>
                    )}
                    {submission && (
                        <>
                            <label>
                                <span className="assessment-input-label">Ouverture des dépôts (Kinshasa)</span>
                                <input
                                    type="datetime-local"
                                    required
                                    aria-invalid={invalid('opens_at')}
                                    value={form.data.opens_at}
                                    onInput={(e) => form.setData('opens_at', e.currentTarget.value)}
                                />
                            </label>
                            <label>
                                <span className="assessment-input-label">Échéance (Kinshasa)</span>
                                <input
                                    type="datetime-local"
                                    required
                                    aria-invalid={invalid('closes_at')}
                                    value={form.data.closes_at}
                                    onInput={(e) => form.setData('closes_at', e.currentTarget.value)}
                                />
                            </label>
                            <label>
                                <span className="assessment-input-label">Nombre maximal de remises</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={20}
                                    required
                                    aria-invalid={invalid('attempt_limit')}
                                    value={form.data.attempt_limit}
                                    onChange={(e) => form.setData('attempt_limit', Number(e.target.value))}
                                />
                            </label>
                            <label>
                                <span className="assessment-input-label">Tolérance de retard (minutes)</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={10080}
                                    aria-invalid={invalid('late_minutes')}
                                    value={form.data.late_minutes}
                                    onChange={(e) => form.setData('late_minutes', Number(e.target.value))}
                                />
                            </label>
                            <label className="assessment-draft-check assessment-field-wide">
                                <input
                                    type="checkbox"
                                    checked={form.data.group_work}
                                    onChange={(e) => form.setData('group_work', e.target.checked)}
                                />{' '}
                                Travail de groupe
                            </label>
                        </>
                    )}
                </fieldset>
                {submission && (
                    <fieldset className="assessment-draft-fields">
                        <legend>Règles de dépôt des copies</legend>
                        <div className="assessment-format-field assessment-field-wide" role="group" aria-labelledby="assessment-formats-label">
                            <span id="assessment-formats-label">Formats autorisés</span>
                            <div className="assessment-file-formats">
                                {props.draft_options.formats.map((extension) => (
                                    <label className="assessment-draft-check" key={extension}>
                                        <input
                                            type="checkbox"
                                            checked={form.data.submission_formats.includes(extension)}
                                            onChange={(event) => {
                                                form.clearErrors('submission_formats');
                                                form.setData(
                                                    'submission_formats',
                                                    event.target.checked
                                                        ? [...form.data.submission_formats, extension]
                                                        : form.data.submission_formats.filter((format) => format !== extension),
                                                );
                                            }}
                                        />
                                        {extension.toUpperCase()}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <label>
                            <span className="assessment-input-label">Taille maximale par fichier (Mo)</span>
                            <input
                                type="number"
                                inputMode="decimal"
                                min={1 / 1024}
                                max={maximumAllowed}
                                step="any"
                                required
                                aria-invalid={invalid('submission_max_kb')}
                                value={maximum}
                                onChange={(event) => setMaximum(event.currentTarget.value)}
                            />
                            <small>Limite de la plateforme à {megabytes.format(maximumAllowed)} Mo.</small>
                        </label>
                    </fieldset>
                )}
                <fieldset className="assessment-draft-fields">
                    <legend>
                        <CalendarClock size={18} aria-hidden="true" /> Publication
                    </legend>
                    <label>
                        <span className="assessment-input-label">Date de publication (Kinshasa)</span>
                        <input
                            type="datetime-local"
                            aria-invalid={invalid('scheduled_publish_at')}
                            value={form.data.scheduled_publish_at}
                            onInput={(event) => form.setData('scheduled_publish_at', event.currentTarget.value)}
                        />
                        <small>
                            {submission ? 'Au plus tard à l’ouverture des dépôts.' : 'Avant le début de l’épreuve.'} Laissez la date vide pour publier
                            manuellement.
                        </small>
                    </label>
                    {form.data.scheduled_publish_at && (
                        <label className="assessment-draft-check">
                            <input
                                type="checkbox"
                                checked={form.data.scheduled_publish_notify}
                                onChange={(event) => form.setData('scheduled_publish_notify', event.target.checked)}
                            />
                            Notifier les étudiants à la publication
                        </label>
                    )}
                </fieldset>
                <fieldset className="assessment-draft-fields">
                    <legend>
                        <ClipboardCheck size={18} aria-hidden="true" /> Barème et appréciations
                    </legend>
                    <label>
                        <span className="assessment-input-label">Barème maximal</span>
                        <input
                            inputMode="decimal"
                            placeholder="Ex. 20"
                            aria-invalid={invalid('maximum_points')}
                            value={form.data.maximum_points}
                            onChange={(e) => form.setData('maximum_points', e.target.value)}
                        />
                        <small>Laissez vide pour une appréciation qualitative.</small>
                    </label>
                    <label>
                        <span className="assessment-input-label">Pondération indicative (%)</span>
                        <input
                            inputMode="decimal"
                            placeholder="Ex. 40"
                            aria-invalid={invalid('weight')}
                            value={form.data.weight}
                            onChange={(e) => form.setData('weight', e.target.value)}
                        />
                    </label>
                    <label className="assessment-field-wide">
                        <span className="assessment-input-label">Diffusion des appréciations</span>
                        <select
                            aria-invalid={invalid('feedback_policy')}
                            value={form.data.feedback_policy}
                            onChange={(e) => form.setData('feedback_policy', e.target.value)}
                        >
                            <option value="validated">Après validation pédagogique</option>
                            <option value="finalized">Après finalisation</option>
                        </select>
                    </label>
                    <div className="assessment-rubric assessment-field-wide" role="group" aria-label="Grille de critères facultative">
                        <strong>
                            Grille de critères <small>Facultative</small>
                        </strong>
                        {form.data.rubric.map((row, index) => (
                            <div className="assessment-rubric-row" key={index}>
                                <label>
                                    <span className="assessment-input-label">Critère {index + 1}</span>
                                    <input
                                        required
                                        aria-invalid={invalid(`rubric.${index}.label`)}
                                        value={row.label}
                                        onChange={(e) =>
                                            form.setData(
                                                'rubric',
                                                form.data.rubric.map((r, i) => (i === index ? { ...r, label: e.target.value } : r)),
                                            )
                                        }
                                    />
                                </label>
                                <label>
                                    <span className="assessment-input-label">Points</span>
                                    <input
                                        required
                                        aria-invalid={invalid(`rubric.${index}.maximum`)}
                                        inputMode="decimal"
                                        value={row.maximum}
                                        onChange={(e) =>
                                            form.setData(
                                                'rubric',
                                                form.data.rubric.map((r, i) => (i === index ? { ...r, maximum: e.target.value } : r)),
                                            )
                                        }
                                    />
                                </label>
                                <button
                                    className="assessment-draft-secondary"
                                    type="button"
                                    onClick={() =>
                                        form.setData(
                                            'rubric',
                                            form.data.rubric.filter((_, i) => i !== index),
                                        )
                                    }
                                >
                                    Retirer
                                </button>
                            </div>
                        ))}
                        <button
                            className="assessment-draft-secondary"
                            type="button"
                            disabled={form.data.rubric.length >= 20}
                            onClick={() => form.setData('rubric', [...form.data.rubric, { label: '', maximum: '' }])}
                        >
                            <Plus size={16} aria-hidden="true" /> Ajouter un critère
                        </button>
                    </div>
                </fieldset>
                {item && (
                    <fieldset className="assessment-draft-fields">
                        <legend>Modification du brouillon</legend>
                        <label className="assessment-field-wide">
                            <span className="assessment-input-label">Motif</span>
                            <textarea
                                rows={3}
                                required
                                minLength={5}
                                aria-invalid={invalid('reason')}
                                value={form.data.reason}
                                onChange={(e) => form.setData('reason', e.target.value)}
                            />
                        </label>
                    </fieldset>
                )}
                <footer className="assessment-draft-footer">
                    <span>
                        {form.data.scheduled_publish_at
                            ? 'La publication se déclenchera à la date choisie.'
                            : 'Le brouillon sera visible ici avant publication.'}
                    </span>
                    <div>
                        <button className="assessment-draft-secondary" type="button" onClick={onClose} disabled={form.processing}>
                            Annuler
                        </button>
                        <button className="assessment-draft-submit" type="submit" disabled={form.processing}>
                            {form.processing ? 'Enregistrement…' : 'Enregistrer le brouillon'}
                        </button>
                    </div>
                </footer>
            </form>
        </section>
    );
}

function GroupForm({ props, item }: { props: Props; item: Details }) {
    const form = useForm({ label: '', leader: '', members: '', reason: '', revision: item.revision });
    return (
        <details>
            <summary>Constituer un groupe</summary>
            <p>Le responsable désigné dépose le travail. La composition est conservée pour cette évaluation.</p>
            {props.candidates?.data.map((candidate) => (
                <p key={candidate.id}>
                    {candidate.name} · dossier n°{candidate.id}
                </p>
            ))}
            <Pagination value={props.candidates} />
            <form
                className="portal-form"
                onSubmit={(e) => {
                    e.preventDefault();
                    form.transform((data) => ({ ...data, members: data.members.split(/[\s,]+/).filter(Boolean) }));
                    if (form.processing) return;
                    form.post(actionUrl(route(props.prefix + 'group', item.resource_id), props.filters), {
                        preserveScroll: true,
                        onSuccess: (page) => {
                            if (page.component === 'dashboard/teaching/Assessments' && typeof page.flash?.dashboardAction === 'string') form.reset();
                        },
                    });
                }}
            >
                <label>
                    Nom du groupe <input required value={form.data.label} onChange={(e) => form.setData('label', e.target.value)} />
                </label>
                <label>
                    Numéro du dossier du responsable{' '}
                    <input type="number" required value={form.data.leader} onChange={(e) => form.setData('leader', e.target.value)} />
                </label>
                <label>
                    Numéros des dossiers séparés par des virgules{' '}
                    <input required value={form.data.members} onChange={(e) => form.setData('members', e.target.value)} />
                </label>
                <label>
                    Motif <textarea required minLength={5} value={form.data.reason} onChange={(e) => form.setData('reason', e.target.value)} />
                </label>
                <Errors errors={form.errors} />
                <button disabled={form.processing} className="admin-primary">
                    Constituer le groupe
                </button>
            </form>
        </details>
    );
}

function CorrectionForm({ props, item, row }: { props: Props; item: Details; row: Participant }) {
    const form = useForm({
        participation: row.participation,
        points: row.adjustment == null && !row.criterion_points?.length ? points(row.points) : '',
        adjustment: points(row.adjustment),
        criteria: item.rubric.map((_, index) => points(row.criterion_points?.[index])),
        feedback: row.feedback ?? '',
        file: null as File | null,
        revision: row.revision,
        reason: '',
    });
    const graded = ['submitted', 'late_submission', 'present', 'late'].includes(form.data.participation);
    return (
        <form
            className="portal-form"
            onSubmit={(e) => {
                e.preventDefault();
                form.transform((data) => ({
                    ...data,
                    points: graded ? data.points : null,
                    adjustment: graded ? data.adjustment : null,
                    criteria: graded && data.criteria.some(Boolean) ? data.criteria : null,
                }));
                form.post(actionUrl(route(props.prefix + 'correct', [item.resource_id, row.id]), props.filters), { forceFormData: true, preserveScroll: true });
            }}
        >
            <label>
                Participation{' '}
                <select value={form.data.participation} onChange={(e) => form.setData('participation', e.target.value)}>
                    {props.participation.map((status) => (
                        <option key={status} value={status}>
                            {participationLabels[status]}
                        </option>
                    ))}
                </select>
            </label>
            {graded && item.maximum_points !== null && (
                <>
                    {!item.rubric.length && (
                        <label>
                            Note sur {points(item.maximum_points)}{' '}
                            <input inputMode="decimal" value={form.data.points} onChange={(e) => form.setData('points', e.target.value)} />
                        </label>
                    )}
                    {item.rubric.map((criterion, index) => (
                        <label key={criterion.label}>
                            {criterion.label} sur {points(criterion.maximum)}{' '}
                            <input
                                inputMode="decimal"
                                value={form.data.criteria[index]}
                                onChange={(e) =>
                                    form.setData(
                                        'criteria',
                                        form.data.criteria.map((v, i) => (i === index ? e.target.value : v)),
                                    )
                                }
                            />
                        </label>
                    ))}
                    {row.group_points !== null && (
                        <label>
                            Ajustement par rapport à la note collective de {points(row.group_points)} (laisser la grille et la note vides){' '}
                            <input inputMode="decimal" value={form.data.adjustment} onChange={(e) => form.setData('adjustment', e.target.value)} />
                        </label>
                    )}
                </>
            )}
            <label>
                Appréciation privée <textarea value={form.data.feedback} onChange={(e) => form.setData('feedback', e.target.value)} />
            </label>
            <label>
                Fichier corrigé <input type="file" onChange={(e) => form.setData('file', e.target.files?.[0] ?? null)} />
            </label>
            <label>
                Motif <textarea required minLength={5} value={form.data.reason} onChange={(e) => form.setData('reason', e.target.value)} />
            </label>
            {form.progress && <progress value={form.progress.percentage} max={100} aria-label="Envoi de la correction" />}
            <Errors errors={form.errors} />
            <button className="admin-primary" disabled={form.processing}>
                Enregistrer la correction
            </button>
        </form>
    );
}

type AssessmentLink = (updates: Record<string, number | string | undefined>) => string;

const clearAssessment = {
    resource: undefined,
    record: undefined,
    copy_version: undefined,
    participant_q: undefined,
    participant_group: undefined,
    correction: undefined,
    participation: undefined,
    from_gradebook: undefined,
    gradebook_semester: undefined,
    grades_students_page: undefined,
    grades_assessments_page: undefined,
};

function AssessmentIndex({ props, index, link, teacher }: { props: Props; index: string; link: AssessmentLink; teacher: boolean }) {
    const { filters, offering, offers, items, years, state_counts: stateCounts } = props;
    const hasFilters = Boolean(offering || filters.q || filters.year || filters.state || filters.category);
    const hasYear = years.some((year) => year.id === Number(filters.year));
    const status = assessmentStatuses.find(({ value }) => value === (filters.state ?? ''))?.label ?? 'Toutes';
    const validated = props.work_counts.validated ?? 0;
    return (
        <>
            <section className="assessment-summary-rail" aria-label="Suivi des évaluations">
                <div>
                    <span className="assessments-icon">
                        <FileText size={17} aria-hidden="true" />
                    </span>
                    <div>
                        <p>Brouillons</p>
                        <strong>{stateCounts.draft ?? 0}</strong>
                    </div>
                </div>
                <div>
                    <span className="assessments-icon">
                        <CalendarDays size={17} aria-hidden="true" />
                    </span>
                    <div>
                        <p>Évaluations ouvertes</p>
                        <strong>{props.open_count}</strong>
                        <small>{props.upcoming_count} à venir</small>
                    </div>
                </div>
                <div>
                    <span className="assessments-icon">
                        <ClipboardCheck size={17} aria-hidden="true" />
                    </span>
                    <div>
                        <p>Corrections à traiter</p>
                        <strong>{props.work_counts.draft ?? 0}</strong>
                        <small>
                            {props.work_counts.finalized ?? 0} à valider · {validated} validée{validated > 1 ? 's' : ''}
                        </small>
                    </div>
                </div>
            </section>
            <div className="assessments-grid">
                <section className="assessments-panel assessment-index-panel" aria-labelledby="assessment-list-heading">
                    <div className="assessments-panel-heading">
                        <h2 id="assessment-list-heading">Évaluations</h2>
                        <span className="assessments-count">
                            {items.total} résultat{items.total === 1 ? '' : 's'}
                        </span>
                    </div>
                    {props.offering_title && (
                        <p className="assessment-course-context">
                            <BookOpen size={15} aria-hidden="true" /> {props.offering_title}
                        </p>
                    )}
                    <nav className="assessment-status-nav" aria-label="Filtrer par état">
                        {assessmentStatuses.map(({ value, label }) => (
                            <Link
                                key={value}
                                href={link({ ...clearAssessment, state: value || undefined })}
                                aria-current={(filters.state ?? '') === value ? 'page' : undefined}
                                preserveScroll
                            >
                                {label}
                                {value && <span>{stateCounts[value] ?? 0}</span>}
                            </Link>
                        ))}
                    </nav>
                    <form
                        className="assessment-search"
                        key={JSON.stringify(filters)}
                        onSubmit={(event) => {
                            event.preventDefault();
                            const data = new FormData(event.currentTarget);
                            router.get(
                                index,
                                Object.fromEntries([...data].filter(([, value]) => value !== '').map(([key, value]) => [key, String(value)])),
                            );
                        }}
                    >
                        {offering && <input type="hidden" name="offering" value={offering} />}
                        {filters.state && <input type="hidden" name="state" value={filters.state} />}
                        <label className="assessment-search-query">
                            Titre
                            <span>
                                <Search size={17} aria-hidden="true" />
                                <input name="q" type="search" maxLength={180} placeholder="Rechercher une évaluation" defaultValue={filters.q} />
                            </span>
                        </label>
                        <label>
                            Année académique
                            <select name="year" defaultValue={filters.year ?? ''}>
                                <option value="">Toutes les années</option>
                                {filters.year && !hasYear && <option value={filters.year}>Année indisponible</option>}
                                {years.map((year) => (
                                    <option key={year.id} value={year.id}>
                                        {year.title}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Catégorie
                            <select name="category" defaultValue={filters.category ?? ''}>
                                <option value="">Toutes les catégories</option>
                                {Object.entries(props.categories).map(([key, label]) => (
                                    <option key={key} value={key}>
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <button type="submit" className="assessment-button assessment-button-outline">
                            Filtrer
                        </button>
                        {hasFilters && (
                            <Link className="assessment-clear-filters" href={index}>
                                Effacer les filtres
                            </Link>
                        )}
                    </form>
                    {items.data.length ? (
                        <ul className="assessments-list assessment-index-list">
                            {items.data.map((item) => {
                                const badge = publicationBadge(item);
                                return (
                                    <li key={item.resource_id}>
                                        <Link className="assessments-row" href={link({ ...clearAssessment, resource: item.resource_id })}>
                                            <span className="assessments-icon">
                                                <ClipboardList size={19} aria-hidden="true" />
                                            </span>
                                            <span className="assessments-row-main">
                                                <strong>{item.title}</strong>
                                                <small>
                                                    {item.course} · {props.categories[item.category] ?? item.category}
                                                </small>
                                                {item.state === 'closed' && item.closes_at ? (
                                                    <small>Échéance · {dateTime(item.closes_at)}</small>
                                                ) : (
                                                    item.opens_at && <small>Ouverture · {dateTime(item.opens_at)}</small>
                                                )}
                                            </span>
                                            <span className="assessments-badge" data-state={badge.state}>
                                                {badge.label}
                                            </span>
                                            <ArrowRight className="assessments-row-arrow" size={17} aria-hidden="true" />
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <div className="assessments-empty">
                            <span className="assessments-icon">
                                <ClipboardList size={21} aria-hidden="true" />
                            </span>
                            <strong>
                                {filters.state ? 'Aucune évaluation dans « ' + status.toLowerCase() + ' »' : 'Aucune évaluation à afficher'}
                            </strong>
                            {hasFilters && (
                                <Link className="assessment-clear-filters" href={index}>
                                    Afficher toutes les évaluations
                                </Link>
                            )}
                        </div>
                    )}
                    <Pagination value={items} />
                </section>
                <aside className="assessments-panel assessments-courses" id="assessment-courses" aria-labelledby="assessment-courses-heading">
                    <div className="assessments-panel-heading">
                        <h2 id="assessment-courses-heading">{teacher ? 'Mes cours' : 'Offres de cours'}</h2>
                        <span className="assessments-count">{offers.total}</span>
                    </div>
                    {offers.data.length ? (
                        <ul className="assessments-list assessments-course-list">
                            {offers.data.map((offer) => (
                                <li key={offer.id}>
                                    <Link
                                        className="assessments-course"
                                        aria-current={offering === offer.id ? 'true' : undefined}
                                        href={link({ ...clearAssessment, offering: offer.id })}
                                    >
                                        <BookOpen size={17} aria-hidden="true" />
                                        <span>{offer.title}</span>
                                        <ArrowRight size={15} aria-hidden="true" />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="assessments-muted">{filters.year ? 'Aucun cours pour cette année.' : 'Aucun cours à afficher.'}</p>
                    )}
                    <Pagination value={offers} />
                    {props.admin && (
                        <a className="assessments-export" href={route(props.prefix + 'handoff')}>
                            <FileText size={16} aria-hidden="true" /> Flux JSON des résultats validés
                        </a>
                    )}
                </aside>
            </div>
        </>
    );
}

export default function Assessments(props: Props) {
    const { prefix, selected, record, filters, canEdit, offering, admin, gradebook_url: gradebookUrl } = props;
    const teacher = prefix === 'dashboard.teaching.assessments.';
    const [modal, setModal] = useState<FormSpec | null>(null);
    const [draft, setDraft] = useState<{ mode: 'create' | 'edit'; id: number } | null>(null);
    const gradebookCorrection = useRef<HTMLElement | null>(null);
    const gradebookParticipants = useRef<HTMLHeadingElement | null>(null);
    const assessmentId = selected?.resource_id;
    const recordId = record?.id;
    const draftItem = draft?.mode === 'edit' && selected?.state === 'draft' && draft.id === assessmentId ? selected : undefined;
    const showDraft = Boolean(canEdit && ((draft?.mode === 'create' && draft.id === offering) || draftItem));
    useEffect(() => {
        if (!gradebookUrl || !assessmentId) return;

        const frame = requestAnimationFrame(() => {
            const target = recordId ? gradebookCorrection.current : gradebookParticipants.current;
            target?.scrollIntoView({ block: 'start' });
            target?.focus({ preventScroll: true });
        });
        return () => cancelAnimationFrame(frame);
    }, [assessmentId, gradebookUrl, recordId]);
    useEffect(() => {
        if (!showDraft) return;

        const frame = requestAnimationFrame(() => {
            const title = document.getElementById('assessment-draft-title');
            title?.scrollIntoView({ block: 'start' });
            title?.focus({ preventScroll: true });
        });
        return () => cancelAnimationFrame(frame);
    }, [showDraft]);
    const index = route(prefix + 'index');
    const link: AssessmentLink = (updates) => route(prefix + 'index', { ...filters, ...updates });
    const overview = link(clearAssessment);
    const home = teacher
        ? route('dashboard.teaching.index', { year: filters.year })
        : route('dashboard.admin.teaching.index', offering ? { offering } : {});
    const homeLabel = teacher ? 'Tableau de bord' : 'Enseignements';
    function openDraft(mode: 'create' | 'edit', id: number) {
        setDraft({ mode, id });
    }
    function closeDraft() {
        const focusId = draftItem ? 'assessment-edit' : 'assessment-create';
        setDraft(null);
        requestAnimationFrame(() => {
            (document.getElementById(focusId) ?? document.getElementById('assessment-navigation'))?.focus();
        });
    }
    const action = (title: string, path: string, values: FormSpec['values'], fields: Field[] = [reason]) =>
        setModal({ title, description: 'Vérifiez le contexte et confirmez cette opération pédagogique.', action: actionUrl(path, filters), fields, values, requireSuccessFlash: true });
    const batch = (kind: string, title: string) =>
        selected &&
        action(
            title,
            route(prefix + 'batch', selected.resource_id),
            { action: kind, revision: selected.revision },
            kind === 'release' ? [reason, checkNotice] : [reason],
        );
    const lifecycle = (kind: string, title: string) =>
        selected &&
        action(
            title,
            route(prefix + 'lifecycle', selected.resource_id),
            { action: kind, revision: selected.revision },
            kind === 'close' ? [reason] : [reason, checkNotice],
        );
    const schedulePublication = () => {
        if (!selected) return;
        setModal({
            title: selected.scheduled_publish_at ? 'Modifier la publication programmée' : 'Programmer la publication',
            description: 'Choisissez une date en heure de Kinshasa. Effacez-la pour revenir à une publication manuelle.',
            action: actionUrl(route(prefix + 'lifecycle', selected.resource_id), filters),
            requireSuccessFlash: true,
            eyebrow: teacher ? 'ESPACE ENSEIGNANT' : undefined,
            values: { action: 'schedule', revision: selected.revision },
            fields: [
                {
                    name: 'scheduled_publish_at',
                    label: 'Date de publication (Kinshasa)',
                    type: 'datetime-local',
                    value: dateInput(selected.scheduled_publish_at),
                    help: selected.modality === 'submission' ? 'Au plus tard à l’ouverture des dépôts.' : 'Avant le début de l’épreuve.',
                },
                {
                    name: 'scheduled_publish_notify',
                    label: 'Notifier les étudiants à la publication',
                    type: 'checkbox',
                    value: selected.scheduled_publish_notify,
                },
                reason,
            ],
        });
    };
    const state = (kind: string, title: string) =>
        selected && record && action(title, route(prefix + 'record', [selected.resource_id, record.id]), { action: kind, revision: record.revision });
    const createAction =
        canEdit && offering ? (
            <button
                type="button"
                className="assessment-button assessment-button-primary"
                id="assessment-create"
                aria-controls="assessment-draft"
                aria-expanded={showDraft}
                onClick={() => openDraft('create', offering)}
            >
                <Plus size={18} aria-hidden="true" /> Créer une évaluation
            </button>
        ) : (
            <a className="assessment-button assessment-button-outline" href="#assessment-courses">
                Choisir un cours <ArrowDown size={16} aria-hidden="true" />
            </a>
        );

    if (showDraft) {
        return (
            <Dashboard hideAppsNavigation>
                <Head title={draftItem ? 'Modifier le brouillon' : 'Nouvelle évaluation'} />
                <div className="assessments-workspace assessment-editor-page" id="assessment-draft">
                    <DraftForm key={draftItem?.resource_id ?? offering} props={props} item={draftItem} onClose={closeDraft} />
                </div>
            </Dashboard>
        );
    }

    return (
        <Dashboard hideAppsNavigation>
            <Head title={selected ? selected.title + ' · Évaluations' : 'Évaluations et corrections'} />
            {modal && (
                <AcademicForm
                    spec={modal}
                    onClose={() => setModal(null)}
                    onSuccess={() => setModal(null)}
                />
            )}
            <div className="student-portal academic-administration assessments-workspace">
                {selected ? (
                    <nav className="assessment-detail-nav" aria-label="Navigation de la fiche">
                        <Link className="assessments-back" href={gradebookUrl ?? overview} id="assessment-navigation">
                            <ArrowLeft size={17} aria-hidden="true" /> {gradebookUrl ? 'Retour au carnet de notes' : 'Retour aux évaluations'}
                        </Link>
                        <div className="assessment-detail-nav-actions">
                            {gradebookUrl && (
                                <Link className="assessment-clear-filters" href={overview}>
                                    Voir les évaluations
                                </Link>
                            )}
                            {canEdit && offering && createAction}
                        </div>
                    </nav>
                ) : (
                    <header className="assessment-index-heading">
                        <div>
                            <Link className="assessments-back" href={home} id="assessment-navigation">
                                <ArrowLeft size={16} aria-hidden="true" /> {homeLabel}
                            </Link>
                            <h1>Évaluations et corrections</h1>
                            <p>Préparez les épreuves, retrouvez les copies et suivez les corrections.</p>
                        </div>
                        {createAction}
                    </header>
                )}
                {!selected && <AssessmentIndex props={props} index={index} link={link} teacher={teacher} />}
                {selected && (
                    <section className="assessments-detail" id="assessment-detail" aria-labelledby="assessment-detail-title">
                        <div className="assessment-summary">
                            <header className="assessment-summary-header">
                                <span className="assessment-summary-icon">
                                    <ClipboardList size={25} aria-hidden="true" />
                                </span>
                                <div>
                                    <p>{selected.course}</p>
                                    <h1 id="assessment-detail-title">{selected.title}</h1>
                                </div>
                                <span className="assessments-badge" data-state={publicationBadge(selected).state}>
                                    {publicationBadge(selected).label}
                                </span>
                            </header>
                            <dl className="assessment-summary-facts">
                                <div>
                                    <dt>Catégorie</dt>
                                    <dd>{props.categories[selected.category] ?? selected.category}</dd>
                                    {selected.session_code && <dd className="assessment-summary-note">Session {selected.session_code}</dd>}
                                </div>
                                <div>
                                    <dt>Modalité</dt>
                                    <dd>{selected.modality === 'submission' ? 'Remise en ligne' : 'Épreuve en présentiel'}</dd>
                                    {selected.modality === 'submission' && (
                                        <dd className="assessment-summary-note">
                                            {selected.submission_formats.map((format) => format.toUpperCase()).join(', ')} ·{' '}
                                            {megabytes.format(selected.submission_max_kb / 1024)} Mo par fichier
                                        </dd>
                                    )}
                                </div>
                                <div>
                                    <dt>Barème</dt>
                                    <dd>
                                        {selected.maximum_points == null
                                            ? 'Appréciation qualitative'
                                            : `Sur ${points(selected.maximum_points)} points`}
                                    </dd>
                                    {selected.weight && <dd className="assessment-summary-note">Pondération indicative de {selected.weight} %</dd>}
                                </div>
                            </dl>
                            {(selected.opens_at || selected.closes_at || selected.session) && (
                                <dl className="assessment-summary-dates">
                                    {selected.opens_at && (
                                        <div>
                                            <dt>
                                                <CalendarClock size={17} aria-hidden="true" /> Ouverture
                                            </dt>
                                            <dd>
                                                <time dateTime={selected.opens_at}>{dateTime(selected.opens_at)}</time>
                                            </dd>
                                        </div>
                                    )}
                                    {selected.closes_at && (
                                        <div>
                                            <dt>
                                                <CalendarDays size={17} aria-hidden="true" /> Échéance
                                            </dt>
                                            <dd>
                                                <time dateTime={selected.closes_at}>{dateTime(selected.closes_at)}</time>
                                            </dd>
                                        </div>
                                    )}
                                    {selected.session && (
                                        <div>
                                            <dt>
                                                <CalendarDays size={17} aria-hidden="true" /> Séance {selected.session.cancelled_at && 'annulée'}
                                            </dt>
                                            <dd>
                                                {selected.session.room} · {dateTime(selected.session.starts_at)} –{' '}
                                                {dateTime(selected.session.ends_at)}
                                            </dd>
                                        </div>
                                    )}
                                </dl>
                            )}
                            {(selected.body || selected.objectives) && (
                                <div className="assessment-summary-notes">
                                    {selected.body && (
                                        <section>
                                            <h2>Consignes</h2>
                                            <p>{selected.body}</p>
                                        </section>
                                    )}
                                    {selected.objectives && (
                                        <section>
                                            <h2>Objectifs</h2>
                                            <p>{selected.objectives}</p>
                                        </section>
                                    )}
                                </div>
                            )}
                            {(selected.scheduled_publish_at || selected.scheduled_publish_error) && (
                                <div className="assessment-publication-status" data-error={Boolean(selected.scheduled_publish_error) || undefined}>
                                    <CalendarClock size={18} aria-hidden="true" />
                                    <div>
                                        {selected.scheduled_publish_at && (
                                            <p>
                                                <strong>{selected.scheduled_publish_blocked ? 'Date prévue' : 'Publication programmée'}</strong> ·{' '}
                                                {dateTime(selected.scheduled_publish_at)} (Kinshasa)
                                            </p>
                                        )}
                                        {selected.scheduled_publish_error && (
                                            <p role="alert">Publication non effectuée. {selected.scheduled_publish_error}</p>
                                        )}
                                    </div>
                                </div>
                            )}
                            {selected.subject && (
                                <a className="assessment-subject-file" href={selected.subject.download_url ?? undefined}>
                                    <Paperclip size={17} aria-hidden="true" /> {selected.subject.filename || 'Télécharger le sujet'}
                                </a>
                            )}
                            <div className="assessment-summary-actions">
                                {canEdit && selected.state === 'draft' && (
                                    <>
                                        <button
                                            className="assessment-detail-button"
                                            data-tone="primary"
                                            onClick={() => lifecycle('publish', 'Publier l’évaluation')}
                                        >
                                            Publier maintenant
                                        </button>
                                        <button
                                            className="assessment-detail-button"
                                            id="assessment-edit"
                                            onClick={() => openDraft('edit', selected.resource_id)}
                                        >
                                            Modifier le brouillon
                                        </button>
                                        <button className="assessment-detail-button" onClick={schedulePublication}>
                                            <CalendarClock size={16} aria-hidden="true" />
                                            {selected.scheduled_publish_at ? 'Modifier la programmation' : 'Programmer'}
                                        </button>
                                    </>
                                )}
                                {canEdit && selected.state === 'published' && (
                                    <button
                                        className="assessment-detail-button"
                                        data-tone="primary"
                                        onClick={() => lifecycle('close', 'Clôturer l’évaluation')}
                                    >
                                        Clôturer
                                    </button>
                                )}
                                {canEdit && selected.state === 'closed' && (
                                    <>
                                        {admin && (
                                            <button
                                                className="assessment-detail-button"
                                                data-tone="primary"
                                                onClick={() => batch('validate', 'Valider et transmettre les corrections')}
                                            >
                                                Valider les corrections
                                            </button>
                                        )}
                                        <button
                                            className="assessment-detail-button"
                                            data-tone={admin ? undefined : 'primary'}
                                            onClick={() => batch('release', 'Publier les appréciations autorisées')}
                                        >
                                            Publier les appréciations
                                        </button>
                                    </>
                                )}
                                <Link
                                    className="assessment-detail-button"
                                    href={route(admin ? 'dashboard.admin.learning.index' : 'dashboard.teaching.learning.index', { offering })}
                                >
                                    <BookOpen size={16} aria-hidden="true" /> Supports du cours
                                </Link>
                                {selected.modality === 'in_person' && selected.session?.is_published && !selected.session.cancelled_at && (
                                    <Link
                                        className="assessment-detail-button"
                                        href={route(
                                            admin ? 'dashboard.admin.schedule.attendance' : 'dashboard.teaching.attendance',
                                            selected.session.id,
                                        )}
                                    >
                                        <ClipboardCheck size={16} aria-hidden="true" /> Consulter l’appel
                                    </Link>
                                )}
                                {canEdit && ['draft', 'published'].includes(selected.state) && (
                                    <button
                                        className="assessment-detail-button"
                                        data-tone="danger"
                                        onClick={() => lifecycle('cancel', 'Annuler l’évaluation')}
                                    >
                                        Annuler l’évaluation
                                    </button>
                                )}
                            </div>
                        </div>
                        {selected.group_work && (
                            <section className="assessment-group-panel" aria-labelledby="assessment-group-title">
                                <h2 id="assessment-group-title">Groupes de travail</h2>
                                {canEdit && ['draft', 'published'].includes(selected.state) && (
                                    <GroupForm key={selected.revision} props={props} item={selected} />
                                )}
                                <ul className="assessment-group-list">
                                    {props.groups?.data.map((group) => (
                                        <li key={group.id}>
                                            <div>
                                                <strong>{group.label}</strong>
                                                <p>
                                                    Responsable n°{group.leader_enrollment_id}
                                                    {group.shared_points !== null && ` · Note collective ${points(group.shared_points)}`}
                                                </p>
                                            </div>
                                            {canEdit && selected.state === 'closed' && (
                                                <button
                                                    className="assessment-detail-button"
                                                    onClick={() =>
                                                        action(
                                                            'Correction collective',
                                                            route(prefix + 'group-score', [selected.resource_id, group.id]),
                                                            { revision: group.revision },
                                                            [
                                                                { name: 'points', label: 'Note collective', value: points(group.shared_points) },
                                                                {
                                                                    name: 'feedback',
                                                                    label: 'Appréciation collective',
                                                                    type: 'textarea',
                                                                    value: group.feedback,
                                                                },
                                                                reason,
                                                            ],
                                                        )
                                                    }
                                                >
                                                    Corriger le groupe
                                                </button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                                <Pagination value={props.groups} />
                            </section>
                        )}
                        <section className="assessment-participant-panel" aria-labelledby="assessment-participants">
                            <header className="assessment-participant-header">
                                <div>
                                    <h2
                                        id="assessment-participants"
                                        tabIndex={gradebookUrl && !record ? -1 : undefined}
                                        ref={gradebookUrl && !record ? gradebookParticipants : undefined}
                                    >
                                        Participants et corrections
                                    </h2>
                                    {props.records && (
                                        <p aria-live="polite">
                                            {props.records.total} participant{props.records.total === 1 ? '' : 's'}
                                        </p>
                                    )}
                                </div>
                                <dl aria-label="État des corrections" className="assessment-correction-totals">
                                    <div>
                                        <dt>À traiter</dt>
                                        <dd>{props.work_counts.draft ?? 0}</dd>
                                    </div>
                                    <div>
                                        <dt>Finalisées</dt>
                                        <dd>{props.work_counts.finalized ?? 0}</dd>
                                    </div>
                                    <div>
                                        <dt>Validées</dt>
                                        <dd>{props.work_counts.validated ?? 0}</dd>
                                    </div>
                                </dl>
                            </header>
                            <form
                                className="assessments-filters assessments-participants-filters"
                                key={JSON.stringify([
                                    selected.resource_id,
                                    filters.participant_q,
                                    filters.participant_group,
                                    filters.correction,
                                    filters.participation,
                                ])}
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    const data = new FormData(e.currentTarget);
                                    router.get(
                                        link({
                                            offering: offering ?? undefined,
                                            resource: selected.resource_id,
                                            record: undefined,
                                            copy_version: undefined,
                                            correction: String(data.get('correction') || '') || undefined,
                                            participation: String(data.get('participation') || '') || undefined,
                                            participant_q: String(data.get('participant_q') || '').trim() || undefined,
                                            participant_group: String(data.get('participant_group') || '') || undefined,
                                        }),
                                        {},
                                        { preserveScroll: true },
                                    );
                                }}
                            >
                                <label>
                                    Nom ou matricule
                                    <input
                                        name="participant_q"
                                        type="search"
                                        maxLength={100}
                                        placeholder="Rechercher un étudiant"
                                        defaultValue={filters.participant_q}
                                    />
                                </label>
                                {props.participant_groups.length > 0 && (
                                    <label>
                                        Groupe
                                        <select name="participant_group" defaultValue={filters.participant_group}>
                                            <option value="">Tous les groupes</option>
                                            {props.participant_groups.some(({ kind }) => kind === 'work') && (
                                                <optgroup label="Groupes de travail">
                                                    {props.participant_groups
                                                        .filter(({ kind }) => kind === 'work')
                                                        .map(({ value, label }) => (
                                                            <option value={value} key={value}>
                                                                {label}
                                                            </option>
                                                        ))}
                                                </optgroup>
                                            )}
                                            {props.participant_groups.some(({ kind }) => kind !== 'work') && (
                                                <optgroup label="Groupes pédagogiques">
                                                    {props.participant_groups
                                                        .filter(({ kind }) => kind !== 'work')
                                                        .map(({ value, label }) => (
                                                            <option value={value} key={value}>
                                                                {label}
                                                            </option>
                                                        ))}
                                                </optgroup>
                                            )}
                                        </select>
                                    </label>
                                )}
                                <label>
                                    Correction{' '}
                                    <select name="correction" defaultValue={filters.correction}>
                                        <option value="">Toutes</option>
                                        {['draft', 'finalized', 'validated'].map((s) => (
                                            <option key={s} value={s}>
                                                {states[s]}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    Participation{' '}
                                    <select name="participation" defaultValue={filters.participation}>
                                        <option value="">Toutes</option>
                                        {props.participation.map((s) => (
                                            <option key={s} value={s}>
                                                {participationLabels[s]}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <div className="assessments-filter-actions">
                                    <button className="admin-secondary">
                                        <Search size={16} aria-hidden="true" /> Filtrer les copies
                                    </button>
                                    {(filters.participant_q || filters.participant_group || filters.correction || filters.participation) && (
                                        <Link
                                            href={link({
                                                participant_q: undefined,
                                                participant_group: undefined,
                                                correction: undefined,
                                                participation: undefined,
                                                record: undefined,
                                                copy_version: undefined,
                                            })}
                                            preserveScroll
                                        >
                                            Effacer les filtres
                                        </Link>
                                    )}
                                </div>
                            </form>
                            {props.records?.data.length ? (
                                <ul className="assessment-participant-list">
                                    {props.records.data.map((row) => (
                                        <li key={row.id}>
                                            <Link
                                                className="assessment-participant-row"
                                                aria-current={record?.id === row.id ? 'true' : undefined}
                                                href={`${link({
                                                    offering: offering ?? undefined,
                                                    resource: selected.resource_id,
                                                    record: row.id,
                                                    copy_version: undefined,
                                                })}#assessment-correction`}
                                            >
                                                <span className="assessments-icon">
                                                    <FileText size={17} aria-hidden="true" />
                                                </span>
                                                <span className="assessment-participant-identity">
                                                    <strong>{row.name ?? `Dossier ${row.academic_enrollment_id}`}</strong>
                                                    {(row.matricule || row.academic_group || row.group) && (
                                                        <small>
                                                            {[row.matricule, row.academic_group, row.group && `Groupe de travail ${row.group}`]
                                                                .filter(Boolean)
                                                                .join(' · ')}
                                                        </small>
                                                    )}
                                                </span>
                                                <span className="assessment-participant-status">
                                                    <span>{participationLabels[row.participation]}</span>
                                                    <span className="assessments-badge" data-state={row.correction_state}>
                                                        {states[row.correction_state]}
                                                    </span>
                                                </span>
                                                <ArrowRight size={17} aria-hidden="true" />
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="assessments-empty" role="status">
                                    Aucun participant dans cette vue.
                                </p>
                            )}
                            <Pagination value={props.records} />
                        </section>
                    </section>
                )}
                {selected && record && (
                    <section
                        className="portal-panel"
                        id="assessment-correction"
                        tabIndex={gradebookUrl ? -1 : undefined}
                        ref={gradebookUrl ? gradebookCorrection : undefined}
                    >
                        {gradebookUrl && (
                            <Link className="assessments-gradebook-return" href={gradebookUrl}>
                                <ArrowLeft size={16} aria-hidden="true" /> Retour au carnet de notes
                            </Link>
                        )}
                        <h2>Correction de {record.name ?? `dossier ${record.academic_enrollment_id}`}</h2>
                        <p>
                            {participationLabels[record.participation]} · {states[record.correction_state]}{' '}
                            {record.released_at && '· Feedback publié'}
                        </p>
                        {record.points !== null && (
                            <p>
                                Note pédagogique {points(record.points)} / {points(selected.maximum_points)}
                            </p>
                        )}
                        {record.feedback && <p style={{ whiteSpace: 'pre-wrap' }}>{record.feedback}</p>}
                        {record.feedback_filename && (
                            <a href={route(prefix + 'feedback', [selected.resource_id, record.id])}>Télécharger le fichier corrigé</a>
                        )}
                        {props.copy && (
                            <div>
                                <h3>
                                    Copie · Version {props.copy.version} sur {props.copy.current_version}
                                </h3>
                                {props.copy.received_at && (
                                    <p>
                                        {dateTime(props.copy.received_at)} {props.copy.late && '· Remise tardive'}
                                    </p>
                                )}
                                {props.copy.body && <p style={{ whiteSpace: 'pre-wrap' }}>{props.copy.body}</p>}
                                {props.copy.download_url && <a href={props.copy.download_url}>Télécharger cette version</a>}
                                <div className="student-dossier-links">
                                    {props.copy.version > 1 && <Link href={link({ copy_version: props.copy.version - 1 })}>Version précédente</Link>}
                                    {props.copy.version < props.copy.current_version && (
                                        <Link href={link({ copy_version: props.copy.version + 1 })}>Version suivante</Link>
                                    )}
                                </div>
                            </div>
                        )}
                        {canEdit && selected.state === 'closed' && record.correction_state === 'draft' && (
                            <>
                                <CorrectionForm key={`${record.id}-${record.revision}`} props={props} item={selected} row={record} />
                                <button className="admin-secondary" onClick={() => state('finalize', 'Finaliser la correction')}>
                                    Finaliser la correction
                                </button>
                            </>
                        )}
                        {canEdit && admin && record.correction_state !== 'draft' && (
                            <button className="admin-secondary" onClick={() => state('reopen', 'Rouvrir la correction')}>
                                Rouvrir la correction
                            </button>
                        )}
                        <h3>Historique de correction</h3>
                        <ul>
                            {props.history?.data.map((version) => (
                                <li key={version.revision}>
                                    <details>
                                        <summary>
                                            Révision {version.revision} · {states[version.snapshot.correction_state]} · {dateTime(version.created_at)}
                                        </summary>
                                        {version.snapshot.points !== null && <p>Note {points(version.snapshot.points)}</p>}
                                        {version.snapshot.feedback && <p>{version.snapshot.feedback}</p>}
                                        {version.file_url && <a href={version.file_url}>Fichier de cette révision</a>}
                                    </details>
                                </li>
                            ))}
                        </ul>
                        <Pagination value={props.history} />
                    </section>
                )}
            </div>
        </Dashboard>
    );
}
