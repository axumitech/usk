import Pagination from '@/components/admin/Pagination';
import { formatDate } from '@/lib/studentEnrollment';
import { defaultUploadLimits, documentAccept, proofUploadError, proofUploadHelp, type UploadLimits } from '@/lib/uploadLimits';
import { Link, useForm, usePage } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowRight,
    ArrowUpRight,
    CalendarCheck,
    CalendarDays,
    CalendarX2,
    Check,
    ChevronDown,
    ChevronRight,
    ClipboardList,
    Clock3,
    Download,
    FileText,
    GraduationCap,
    History,
    IdCard,
    Landmark,
    Library,
    LockKeyhole,
    MapPin,
    MessageCircle,
    Paperclip,
    Send,
    Wallet,
} from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import '../../../css/student-schedule.css';
import '../../../css/student-school-services.css';
import { studentHref } from './navigation';
import { StudentYearSelect, type StudentChromeData } from './StudentChrome';
import type { Academic } from './types';

type CategoryId = 'documents' | 'academic' | 'finance' | 'identity' | 'appointments';
type RequestStatus = 'all' | 'open' | 'resolved';
type Procedure = {
    id: string;
    label: string;
    description: string;
    notice?: string | null;
    service: string;
    mode: 'link' | 'request';
    href?: string | null;
    link_label?: string | null;
    attachment?: boolean;
    unavailable_reason?: string | null;
};
type Category = { id: CategoryId; label: string; description: string; procedures: Procedure[] };
type AvailableAppointmentSlot = { date: string; time: string; end_time: string };
type AppointmentSlot = { date: string; time: string; location: string };
type SchoolTicket = {
    id: number;
    category: string;
    category_label?: string;
    service?: string | null;
    procedure: string | null;
    procedure_notice?: string | null;
    subject: string;
    body: string | null;
    status: string;
    status_group: 'open' | 'resolved';
    response: string | null;
    created_at: string;
    updated_at: string | null;
    workflow: 'general' | 'document' | 'result';
    href?: string | null;
    link_label?: string | null;
    appointment_date: string | null;
    appointment_period: string | null;
    appointment_reservation?: AvailableAppointmentSlot | null;
    appointment_confirmed?: AppointmentSlot | null;
    appointment_cancelled?: (AppointmentSlot & { cancelled_at: string; reason: string }) | null;
    attachment: { name: string; url: string } | null;
};

export type SchoolServices = {
    categories: Category[];
    active_category: CategoryId | null;
    active_procedure: string | null;
    status: RequestStatus;
    counts: Record<'total' | 'open' | 'resolved', number>;
    requests: { data: SchoolTicket[]; links: { url: string | null; label: string; active: boolean }[]; total: number };
    selected_request: SchoolTicket | null;
    appointment_slots?: AvailableAppointmentSlot[];
};

const categoryIcons = {
    documents: FileText,
    academic: GraduationCap,
    finance: Wallet,
    identity: IdCard,
    appointments: CalendarDays,
};

const statusLabels: Record<string, string> = {
    open: 'En cours',
    pending: 'En attente',
    review: 'En cours d’examen',
    reviewed: 'Examinée',
    under_review: 'En cours d’examen',
    investigating: 'En instruction',
    admissible: 'Recevable',
    assigned: 'Assignée',
    correction: 'Correction demandée',
    approved: 'Approuvée',
    resolved: 'Traitée',
    issued: 'Document délivré',
    withdrawn: 'Retirée',
    refused: 'Refusée',
    rejected: 'Rejetée',
    accepted: 'Acceptée',
    inadmissible: 'Irrecevable',
    revoked: 'Révoquée',
    cancelled: 'Annulée',
};

const messages: Record<CategoryId, string> = {
    documents: 'Précisez le document recherché, l’année concernée et le motif de votre demande.',
    academic: 'Précisez le cours, la promotion ou la filière concernée, puis expliquez votre demande.',
    finance: 'Indiquez la référence du paiement ou des frais concernés, ainsi que le montant et la date si vous les connaissez.',
    identity: 'Précisez les informations ou les pièces concernées et le motif de la demande.',
    appointments: 'Indiquez brièvement le motif de votre rendez-vous.',
};

const periods: Record<string, string> = { morning: 'Le matin', afternoon: 'L’après-midi' };
const appointmentDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const appointmentSlotValue = (slot: AvailableAppointmentSlot) => `${slot.date}T${slot.time}`;

function servicesHref(academic: number, params: { category?: CategoryId; procedure?: string } = {}) {
    const query = new URLSearchParams();
    if (params.category) query.set('category', params.category);
    if (params.procedure) query.set('procedure', params.procedure);
    return studentHref('services', academic) + (query.size ? `&${query}` : '');
}

function historyHref(academic: number, status: RequestStatus, ticket?: number, page?: string) {
    const query = new URLSearchParams();
    if (status !== 'all') query.set('status', status);
    if (ticket) query.set('request', String(ticket));
    if (page) query.set('requests_page', page);
    return studentHref('requests', academic) + (query.size ? `&${query}` : '');
}

function ServicesCover({
    academic,
    chrome,
    title,
    subtitle,
    back,
    backLabel,
    section,
}: {
    academic: Academic;
    chrome?: StudentChromeData | null;
    title: string;
    subtitle?: string;
    back: string;
    backLabel: string;
    section: string;
}) {
    const archived = chrome?.options.some(({ id, is_current }) => id === academic.id && !is_current);
    return (
        <header className="student-agenda-header school-services-cover" data-year-state={archived ? 'archive' : 'current'}>
            <Link href={back} className="student-agenda-header-action" aria-label={backLabel}>
                <ArrowLeft size={22} aria-hidden="true" />
            </Link>
            <div className="student-agenda-heading">
                <h1>{title}</h1>
                {subtitle ? (
                    <p>{subtitle}</p>
                ) : chrome && chrome.options.length > 1 ? (
                    <label className="student-agenda-year">
                        <CalendarDays size={15} aria-hidden="true" />
                        <span>{academic.year}</span>
                        <ChevronDown size={14} aria-hidden="true" />
                        <StudentYearSelect context={chrome} section={section} />
                    </label>
                ) : (
                    <p>Année académique {academic.year}</p>
                )}
            </div>
            <Landmark className="school-services-cover-icon" size={24} aria-hidden="true" />
        </header>
    );
}

function ServicesOverview({ data, academic }: { data: SchoolServices; academic: Academic }) {
    return (
        <div className="school-services-stack">
            <Link className="school-services-follow" href={historyHref(academic.id, 'all')}>
                <span className="school-services-icon">
                    <ClipboardList size={24} aria-hidden="true" />
                </span>
                <span>
                    <strong>Mes demandes</strong>
                    <small>
                        {data.counts.open === 0
                            ? 'Consulter mes demandes et les réponses reçues'
                            : `${data.counts.open} demande${data.counts.open > 1 ? 's en cours' : ' en cours'}`}
                    </small>
                </span>
                <ArrowRight size={20} aria-hidden="true" />
            </Link>
            <section aria-labelledby="school-services-catalog">
                <h2 id="school-services-catalog" className="school-services-heading">
                    Choisir une démarche
                </h2>
                <div className="school-services-categories">
                    {data.categories.map((category) => {
                        const Icon = categoryIcons[category.id];
                        return (
                            <Link
                                key={category.id}
                                className="school-services-category"
                                data-category={category.id}
                                href={servicesHref(academic.id, { category: category.id })}
                            >
                                <span className="school-services-icon">
                                    <Icon size={25} aria-hidden="true" />
                                </span>
                                <span>
                                    <strong>{category.label}</strong>
                                    <small>{category.description}</small>
                                </span>
                                <ChevronRight size={19} aria-hidden="true" />
                            </Link>
                        );
                    })}
                </div>
            </section>
            <nav className="school-services-quick-links" aria-label="Accès à mon dossier">
                <Link className="school-services-secondary" href={studentHref('enrollments', academic.id)}>
                    <GraduationCap size={18} aria-hidden="true" /> Mes inscriptions
                </Link>
                <Link className="school-services-secondary" href={studentHref('documents', academic.id)}>
                    <Library size={18} aria-hidden="true" /> Mes documents
                </Link>
            </nav>
        </div>
    );
}

function CategoryView({ category, academic }: { category: Category; academic: Academic }) {
    return (
        <div className="school-services-stack">
            <p className="school-services-category-intro">{category.description}</p>
            <ul className="school-services-list" role="list">
                {category.procedures.map((procedure) => (
                    <li key={procedure.id}>
                        <Link className="school-services-row" href={servicesHref(academic.id, { category: category.id, procedure: procedure.id })}>
                            <span>
                                <strong>{procedure.label}</strong>
                                <small>{procedure.description}</small>
                            </span>
                            {procedure.unavailable_reason ? (
                                <LockKeyhole size={19} aria-hidden="true" />
                            ) : (
                                <ChevronRight size={19} aria-hidden="true" />
                            )}
                        </Link>
                    </li>
                ))}
            </ul>
            <Link className="school-services-secondary" href={historyHref(academic.id, 'all')}>
                <ClipboardList size={18} aria-hidden="true" /> Suivre mes demandes
            </Link>
        </div>
    );
}

function AppointmentPicker({
    slots,
    value,
    onChange,
    error,
    disabled,
}: {
    slots: AvailableAppointmentSlot[];
    value: string;
    onChange: (value: string) => void;
    error?: string;
    disabled: boolean;
}) {
    const [requestedDay, setRequestedDay] = useState('');
    const days = [...new Set(slots.map((slot) => slot.date))];
    const day = days.includes(requestedDay) ? requestedDay : days[0];
    const times = slots.filter((slot) => slot.date === day);
    const slotDisappeared = Boolean(value && !slots.some((slot) => appointmentSlotValue(slot) === value));

    return (
        <fieldset
            className="school-services-slot-picker"
            disabled={disabled}
            aria-describedby={error ? 'school-appointment-slot-hint school-appointment-slot-error' : 'school-appointment-slot-hint'}
        >
            <legend>Choisir un créneau</legend>
            <p id="school-appointment-slot-hint">
                <Clock3 size={16} aria-hidden="true" /> Heures de Kinshasa
            </p>
            {day ? (
                <>
                    <label>
                        Jour disponible
                        <select
                            value={day}
                            onChange={(event) => {
                                setRequestedDay(event.currentTarget.value);
                                onChange('');
                            }}
                        >
                            {days.map((date) => (
                                <option key={date} value={date}>
                                    {appointmentDay.format(new Date(`${date}T12:00:00Z`))}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="school-services-slot-times" role="group" aria-label="Heure disponible">
                        {times.map((slot) => {
                            const option = appointmentSlotValue(slot);
                            return (
                                <label key={option}>
                                    <input
                                        type="radio"
                                        name="appointment_slot"
                                        value={option}
                                        checked={value === option}
                                        onChange={() => {
                                            setRequestedDay(slot.date);
                                            onChange(option);
                                        }}
                                    />
                                    <span>
                                        <strong>{slot.time}</strong>
                                        <small>à {slot.end_time}</small>
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </>
            ) : (
                <p role="status">Aucun créneau libre pour ce service dans les 28 prochains jours.</p>
            )}
            {error ? (
                <p id="school-appointment-slot-error" role="alert">
                    {error}
                </p>
            ) : slotDisappeared && day ? (
                <p role="status">Ce créneau est désormais indisponible. Choisissez-en un autre.</p>
            ) : null}
        </fieldset>
    );
}

function ProcedureForm({
    procedure,
    category,
    academic,
    slots,
}: {
    procedure: Procedure;
    category: Category;
    academic: number;
    slots: AvailableAppointmentSlot[];
}) {
    const appointment = category.id === 'appointments';
    const limits = usePage<{ uploadLimits?: UploadLimits }>().props.uploadLimits ?? defaultUploadLimits;
    const operation = useRef<string | undefined>(undefined);
    const form = useForm({
        procedure: procedure.id,
        body: '',
        file: null as File | null,
        appointment_slot: '',
        operation_key: '',
    });
    const hasAvailableSlot = slots.some((slot) => appointmentSlotValue(slot) === form.data.appointment_slot);

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (form.processing) return;
        if (appointment && !hasAvailableSlot) return;
        const error = form.data.file && proofUploadError(form.data.file, limits);
        if (error) {
            form.setError('file', error);
            return;
        }
        operation.current ??= globalThis.crypto?.randomUUID?.();
        form.transform((values) => ({
            procedure: values.procedure,
            body: values.body,
            ...(values.file ? { file: values.file } : {}),
            ...(appointment ? { appointment_slot: values.appointment_slot } : {}),
            ...(operation.current ? { operation_key: operation.current } : {}),
        }));
        form.post(studentHref('requests', academic), {
            preserveScroll: 'errors',
            preserveState: 'errors',
            onError: (errors) => {
                if (errors.appointment_slot) form.setData('appointment_slot', '');
            },
        });
    }

    return (
        <form className="school-services-form" onSubmit={submit} aria-label={procedure.label}>
            {procedure.notice && <p className="school-services-note">{procedure.notice}</p>}
            {appointment && (
                <AppointmentPicker
                    slots={slots}
                    value={form.data.appointment_slot}
                    onChange={(value) => {
                        form.setData('appointment_slot', value);
                        form.clearErrors('appointment_slot');
                    }}
                    error={form.errors.appointment_slot}
                    disabled={form.processing}
                />
            )}
            <label>
                {appointment ? 'Motif du rendez-vous' : 'Détails de ma demande'}
                <small>{messages[category.id]}</small>
                <textarea
                    rows={5}
                    required
                    minLength={10}
                    maxLength={6000}
                    value={form.data.body}
                    aria-invalid={Boolean(form.errors.body)}
                    onChange={(event) => form.setData('body', event.currentTarget.value)}
                />
                {form.errors.body && <span role="alert">{form.errors.body}</span>}
            </label>
            {procedure.attachment && (
                <label className="school-services-file">
                    <span>
                        <Paperclip size={18} aria-hidden="true" /> Justificatif <small>Facultatif. {proofUploadHelp(limits)}</small>
                    </span>
                    <input
                        type="file"
                        accept={documentAccept}
                        disabled={form.processing}
                        aria-invalid={Boolean(form.errors.file)}
                        onChange={(event) => form.setData('file', event.currentTarget.files?.[0] ?? null)}
                    />
                    {form.errors.file && <span role="alert">{form.errors.file}</span>}
                </label>
            )}
            {form.progress && <progress max={100} value={form.progress.percentage} aria-label="Envoi du justificatif" />}
            {(form.errors.procedure || form.errors.operation_key) && <p role="alert">{form.errors.procedure || form.errors.operation_key}</p>}
            <button type="submit" className="school-services-primary" disabled={form.processing || (appointment && !hasAvailableSlot)}>
                <Send size={18} aria-hidden="true" /> {form.processing ? 'Envoi en cours…' : 'Transmettre ma demande'}
            </button>
        </form>
    );
}

function ProcedureView({
    procedure,
    category,
    academic,
    slots,
}: {
    procedure: Procedure;
    category: Category;
    academic: number;
    slots: AvailableAppointmentSlot[];
}) {
    const Icon = categoryIcons[category.id];
    return (
        <div className="school-services-stack">
            <div className="school-services-procedure" data-category={category.id}>
                <span className="school-services-icon">
                    <Icon size={24} aria-hidden="true" />
                </span>
                <div>
                    <p>{procedure.description}</p>
                    <small>Service concerné · {procedure.service}</small>
                </div>
            </div>
            {procedure.unavailable_reason ? (
                <p className="school-services-note">
                    <LockKeyhole size={18} aria-hidden="true" /> {procedure.unavailable_reason}
                </p>
            ) : (
                <>
                    {procedure.href && (
                        <Link href={procedure.href} className={procedure.mode === 'link' ? 'school-services-primary' : 'school-services-secondary'}>
                            {procedure.link_label || 'Ouvrir le service'} <ArrowUpRight size={18} aria-hidden="true" />
                        </Link>
                    )}
                    {procedure.mode === 'request' && (
                        <>
                            {category.id === 'appointments' && slots.length > 0 && (
                                <p className="school-services-note">
                                    <CalendarDays size={18} aria-hidden="true" /> Le créneau vous sera réservé à l’envoi. Vous retrouverez la
                                    confirmation et le lieu dans le suivi de votre demande.
                                </p>
                            )}
                            <ProcedureForm
                                key={`${academic}-${procedure.id}`}
                                procedure={procedure}
                                category={category}
                                academic={academic}
                                slots={slots}
                            />
                        </>
                    )}
                </>
            )}
        </div>
    );
}

function TicketState({ ticket }: { ticket: SchoolTicket }) {
    const label = ticket.appointment_cancelled
        ? 'Annulé'
        : ticket.appointment_confirmed
          ? 'Confirmé'
          : ticket.appointment_reservation
            ? 'À confirmer'
            : statusLabels[ticket.status] || (ticket.status_group === 'resolved' ? 'Traitée' : 'En cours');
    return (
        <span className="school-services-status" data-status={ticket.appointment_cancelled ? 'cancelled' : ticket.status_group}>
            {label}
        </span>
    );
}

function HistoryView({ data, academic, page }: { data: SchoolServices; academic: number; page?: string }) {
    const filters = [
        { id: 'all', label: 'Toutes', count: data.counts.total },
        { id: 'open', label: 'En cours', count: data.counts.open },
        { id: 'resolved', label: 'Clôturées', count: data.counts.resolved },
    ] as const;

    return (
        <div className="school-services-stack">
            <nav className="school-services-filters" aria-label="Statut des demandes">
                {filters.map(({ id, label, count }) => (
                    <Link key={id} aria-current={data.status === id ? 'page' : undefined} href={historyHref(academic, id)}>
                        {label} <span>{count}</span>
                    </Link>
                ))}
            </nav>
            {data.requests.data.length > 0 ? (
                <ul className="school-services-list" role="list">
                    {data.requests.data.map((ticket) => (
                        <li key={ticket.id} id={`student-request-${ticket.id}`}>
                            <Link className="school-services-row school-services-ticket" href={historyHref(academic, data.status, ticket.id, page)}>
                                <span>
                                    {ticket.category_label && <small>{ticket.category_label}</small>}
                                    <strong>{ticket.subject}</strong>
                                    <small>
                                        <time dateTime={ticket.created_at}>{formatDate(ticket.created_at)}</time>
                                    </small>
                                </span>
                                <TicketState ticket={ticket} />
                                <ChevronRight size={17} aria-hidden="true" />
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="school-services-empty">
                    <History size={28} aria-hidden="true" />
                    <p>
                        {data.status === 'all'
                            ? 'Vous n’avez pas encore déposé de demande pour cette inscription.'
                            : 'Aucune demande dans ce filtre.'}
                    </p>
                </div>
            )}
            <Pagination value={data.requests} preserveScroll={false} />
            <Link className="school-services-secondary" href={servicesHref(academic)}>
                <ArrowLeft size={17} aria-hidden="true" /> Choisir une démarche
            </Link>
        </div>
    );
}

function TicketDetail({ ticket }: { ticket: SchoolTicket }) {
    const submitted = formatDate(ticket.created_at, true);
    const appointment = ticket.appointment_date && formatDate(`${ticket.appointment_date.slice(0, 10)}T12:00:00Z`);
    const cancelled = ticket.appointment_cancelled;
    const slot = cancelled ?? ticket.appointment_confirmed;
    const reservation = slot ? null : ticket.appointment_reservation;
    const AppointmentIcon = cancelled ? CalendarX2 : CalendarCheck;
    return (
        <div className="school-services-stack">
            <article className="school-services-detail" aria-labelledby="school-ticket-title">
                <header>
                    <TicketState ticket={ticket} />
                    {ticket.category_label && <p className="school-services-category-intro">{ticket.category_label}</p>}
                    <h2 id="school-ticket-title">{ticket.subject}</h2>
                    <p className="school-services-category-intro">
                        Demande n° {ticket.id} · <time dateTime={ticket.created_at}>{submitted}</time>
                    </p>
                    {ticket.service && <p className="school-services-category-intro">Service concerné · {ticket.service}</p>}
                </header>
                {ticket.procedure_notice && <p className="school-services-note">{ticket.procedure_notice}</p>}
                {reservation && (
                    <section className="school-services-appointment" data-status="pending" aria-labelledby="school-ticket-reservation">
                        <Clock3 size={21} aria-hidden="true" />
                        <div>
                            <h3 id="school-ticket-reservation">Créneau réservé, en attente de confirmation</h3>
                            <p>
                                <time dateTime={appointmentSlotValue(reservation)}>
                                    {formatDate(`${reservation.date}T12:00:00Z`)} de {reservation.time} à {reservation.end_time}
                                </time>{' '}
                                <span>(heure de Kinshasa)</span>
                            </p>
                            <p>Le service vous communiquera le lieu après confirmation.</p>
                        </div>
                    </section>
                )}
                {slot && (
                    <section
                        className="school-services-appointment"
                        data-status={cancelled ? 'cancelled' : 'confirmed'}
                        aria-labelledby="school-ticket-appointment"
                    >
                        <AppointmentIcon size={21} aria-hidden="true" />
                        <div>
                            <h3 id="school-ticket-appointment">{cancelled ? 'Rendez-vous annulé' : 'Rendez-vous confirmé'}</h3>
                            <p>
                                {cancelled && 'Créneau annulé · '}
                                <time dateTime={`${slot.date}T${slot.time}`}>
                                    {formatDate(`${slot.date}T12:00:00Z`)} à {slot.time}
                                </time>{' '}
                                <span>(heure de Kinshasa)</span>
                            </p>
                            <p>
                                <MapPin size={17} aria-hidden="true" /> {slot.location}
                            </p>
                            {cancelled && (
                                <p>
                                    <span>
                                        Annulé le <time dateTime={cancelled.cancelled_at}>{formatDate(cancelled.cancelled_at, true)}</time>
                                    </span>
                                </p>
                            )}
                            {cancelled?.reason && (
                                <p>
                                    <strong>Motif de l’annulation</strong>
                                    <br />
                                    {cancelled.reason}
                                </p>
                            )}
                        </div>
                    </section>
                )}
                {appointment && !reservation && (
                    <p className={slot ? 'school-services-preference' : 'school-services-note'}>
                        <CalendarDays size={18} aria-hidden="true" />
                        <span>
                            Date souhaitée · {appointment}
                            {ticket.appointment_period && periods[ticket.appointment_period] ? ` · ${periods[ticket.appointment_period]}` : ''}
                        </span>
                    </p>
                )}
                {ticket.body && (
                    <section>
                        <h3>Ma demande</h3>
                        <p>{ticket.body}</p>
                    </section>
                )}
                {ticket.attachment && (
                    <a className="school-services-secondary" href={ticket.attachment.url}>
                        <Download size={18} aria-hidden="true" /> {ticket.attachment.name}
                    </a>
                )}
            </article>
            {(ticket.response || (!slot && !reservation)) && (
                <section className="school-services-detail school-services-response" aria-labelledby="school-ticket-response">
                    {ticket.response ? <Check size={22} aria-hidden="true" /> : <Clock3 size={22} aria-hidden="true" />}
                    <div>
                        <h3 id="school-ticket-response">{cancelled ? 'Réponse précédente de l’administration' : 'Réponse de l’administration'}</h3>
                        <p>{ticket.response || 'La réponse du service s’affichera ici.'}</p>
                    </div>
                </section>
            )}
            {ticket.href && (
                <Link href={ticket.href} className="school-services-secondary">
                    {ticket.link_label ?? 'Ouvrir le suivi de cette demande'} <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
            )}
        </div>
    );
}

export default function StudentSchoolServices({
    academic,
    chrome,
    data,
    section,
    page,
}: {
    academic: Academic;
    chrome?: StudentChromeData | null;
    data: SchoolServices;
    section: 'services' | 'requests';
    page?: string;
}) {
    const tracking = section === 'requests';
    const selected = tracking ? data.selected_request : null;
    const category =
        data.categories.find((item) => item.id === data.active_category) ??
        data.categories.find((item) => item.procedures.some(({ id }) => id === data.active_procedure));
    const procedure = category?.procedures.find(({ id }) => id === data.active_procedure);
    const title = tracking ? (selected ? 'Suivi de la demande' : 'Mes demandes') : (procedure?.label ?? category?.label ?? 'Scolarité');
    const back = selected
        ? `${historyHref(academic.id, data.status, undefined, page)}#student-request-${selected.id}`
        : tracking || category
          ? servicesHref(academic.id, procedure && category ? { category: category.id } : undefined)
          : studentHref('overview', academic.id, 'student-shortcuts-title');
    const backLabel = selected ? 'Retour à mes demandes' : tracking || category ? 'Retour aux démarches' : 'Retour aux raccourcis';

    return (
        <div className="student-agenda school-services">
            <ServicesCover
                academic={academic}
                chrome={chrome}
                title={title}
                back={back}
                backLabel={backLabel}
                section={section}
                subtitle={procedure ? category?.label : selected ? `Année académique ${academic.year}` : undefined}
            />
            <div className="student-agenda-body">
                {tracking ? (
                    selected ? (
                        <TicketDetail ticket={selected} />
                    ) : (
                        <HistoryView data={data} academic={academic.id} page={page} />
                    )
                ) : category ? (
                    procedure ? (
                        <ProcedureView procedure={procedure} category={category} academic={academic.id} slots={data.appointment_slots ?? []} />
                    ) : (
                        <CategoryView category={category} academic={academic} />
                    )
                ) : (
                    <ServicesOverview data={data} academic={academic} />
                )}
            </div>
            {!tracking && !category && (
                <Link className="school-services-contact" href={servicesHref(academic.id, { category: 'identity', procedure: 'general-support' })}>
                    <MessageCircle size={17} aria-hidden="true" /> Autre demande d’assistance
                </Link>
            )}
        </div>
    );
}
