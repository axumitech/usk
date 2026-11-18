import AdminModal from '@/components/admin/AdminModal';
import FeedbackToast from '@/components/admin/FeedbackToast';
import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import { formatDate } from '@/lib/studentEnrollment';
import { Head, Link, useForm } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowUpRight,
    CalendarCheck,
    CalendarDays,
    CalendarX,
    CheckCircle2,
    ClipboardList,
    Clock3,
    Download,
    Eye,
    FileText,
    MapPin,
    MessageSquare,
    Paperclip,
    Send,
    UserRound,
} from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import '../../../../css/dashboard/student-request-detail.css';
import type { StaffRequest } from './StaffRequestDetails';

type AppointmentSlot = { date: string; time: string; location: string };
type ConfirmedAppointment = AppointmentSlot & { confirmed_at: string };
type AppointmentCancellation = AppointmentSlot & { reason: string; cancelled_at: string };
type BookableSlot = { date: string; time: string; end_time: string };
type Ticket = StaffRequest & {
    updated_at: string | null;
    is_appointment: boolean;
    appointment: ConfirmedAppointment | null;
    appointment_cancellation: AppointmentCancellation | null;
    appointment_revision: number;
    attachment_preview_url: string | null;
    responder_name: string | null;
};
type Props = {
    ticket: Ticket;
    student: { id: number; name: string; matricule: string | null; year: string; level: string; faculty: string; dossier_url: string };
    actions: { reply_url: string | null; confirm_url: string | null; cancel_url: string | null; specialized_url: string | null };
    back_url: string;
    back_label: string;
    success?: string | null;
    today: string;
    appointment_slots?: BookableSlot[] | null;
};

const periods: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi' };
const statusLabels: Record<string, string> = {
    open: 'En cours',
    resolved: 'Traitée',
    under_review: 'En cours d’examen',
    investigating: 'En instruction',
    reviewed: 'Examinée',
    assigned: 'Assignée',
    approved: 'Approuvée',
    accepted: 'Acceptée',
    rejected: 'Rejetée',
    refused: 'Refusée',
    inadmissible: 'Irrecevable',
    issued: 'Document délivré',
    withdrawn: 'Retirée',
    correction: 'Correction demandée',
    cancelled: 'Annulée',
    revoked: 'Révoquée',
};
const terminal = ['resolved', 'accepted', 'rejected', 'refused', 'inadmissible', 'issued', 'withdrawn', 'revoked', 'cancelled'];

function requestStatus(ticket: Ticket) {
    if (ticket.appointment_cancellation) return { text: 'Rendez-vous annulé', tone: 'cancelled' };
    if (ticket.appointment) return { text: 'Rendez-vous confirmé', tone: 'confirmed' };
    if (ticket.appointment_reservation) return { text: 'Créneau réservé · À confirmer', tone: 'pending' };
    if (ticket.is_appointment && ticket.status === 'open') return { text: 'Créneau à confirmer', tone: 'pending' };
    return { text: statusLabels[ticket.status] ?? 'En cours', tone: terminal.includes(ticket.status) ? 'closed' : 'pending' };
}

function appointmentDate(date: string) {
    return formatDate(`${date.slice(0, 10)}T12:00:00Z`);
}

function PanelTitle({ title, icon: Icon }: { title: string; icon: typeof UserRound }) {
    return (
        <h2 className="staff-request-panel-title">
            <Icon size={19} aria-hidden="true" /> {title}
        </h2>
    );
}

function Attachment({ ticket }: { ticket: Ticket }) {
    return (
        <section className="staff-request-panel">
            <PanelTitle title="Justificatifs" icon={Paperclip} />
            {ticket.attachment_url ? (
                <div className="staff-request-file">
                    <span className="staff-request-file-icon">
                        <FileText size={23} aria-hidden="true" />
                    </span>
                    <strong>{ticket.attachment_name || 'Pièce jointe'}</strong>
                    <div>
                        {ticket.attachment_preview_url && (
                            <a className="staff-request-button" href={ticket.attachment_preview_url} target="_blank" rel="noopener noreferrer">
                                <Eye size={17} aria-hidden="true" /> Aperçu <ArrowUpRight size={13} aria-hidden="true" />
                            </a>
                        )}
                        <a className="staff-request-button" href={ticket.attachment_url}>
                            <Download size={17} aria-hidden="true" /> Télécharger
                        </a>
                    </div>
                </div>
            ) : (
                <p className="staff-request-muted">Aucun justificatif joint.</p>
            )}
        </section>
    );
}

function AppointmentFacts({ slot, cancelled = false }: { slot: AppointmentSlot; cancelled?: boolean }) {
    return (
        <dl className="staff-request-confirmed" data-cancelled={cancelled || undefined}>
            <div>
                <dt>
                    {cancelled ? <CalendarX size={17} aria-hidden="true" /> : <CalendarCheck size={17} aria-hidden="true" />}
                    {cancelled ? 'Date du créneau annulé' : 'Date confirmée'}
                </dt>
                <dd>
                    <time dateTime={slot.date}>{appointmentDate(slot.date)}</time>
                </dd>
            </div>
            <div>
                <dt>
                    <Clock3 size={17} aria-hidden="true" /> Heure de Kinshasa
                </dt>
                <dd>
                    <time dateTime={slot.time}>{slot.time}</time>
                </dd>
            </div>
            <div>
                <dt>
                    <MapPin size={17} aria-hidden="true" /> Lieu
                </dt>
                <dd>{slot.location}</dd>
            </div>
        </dl>
    );
}

function AppointmentSummary({ ticket }: { ticket: Ticket }) {
    const cancellation = ticket.appointment_cancellation;
    return (
        <section className="staff-request-panel staff-request-appointment">
            <PanelTitle title="Rendez-vous" icon={CalendarDays} />
            {ticket.appointment_reservation && !ticket.appointment && !cancellation ? (
                <p className="staff-request-preference">
                    <Clock3 size={17} aria-hidden="true" />
                    <span>
                        <strong>Créneau réservé par l’étudiant</strong>
                        <br />
                        {appointmentDate(ticket.appointment_reservation.date)} · {ticket.appointment_reservation.time}–
                        {ticket.appointment_reservation.end_time}
                    </span>
                </p>
            ) : (
                ticket.appointment_date && (
                    <p className="staff-request-preference">
                        <Clock3 size={17} aria-hidden="true" />
                        <span>
                            <strong>Préférence de l’étudiant</strong>
                            <br />
                            {appointmentDate(ticket.appointment_date)}
                            {ticket.appointment_period && periods[ticket.appointment_period] ? ` · ${periods[ticket.appointment_period]}` : ''}
                        </span>
                    </p>
                )
            )}
            {cancellation ? (
                <>
                    <AppointmentFacts slot={cancellation} cancelled />
                    <div className="staff-request-cancellation">
                        <strong>Motif de l’annulation</strong>
                        <p className="staff-request-text">{cancellation.reason}</p>
                        <p className="staff-request-muted">
                            Annulé le <time dateTime={cancellation.cancelled_at}>{formatDate(cancellation.cancelled_at, true)}</time>
                        </p>
                    </div>
                </>
            ) : (
                ticket.appointment && <AppointmentFacts slot={ticket.appointment} />
            )}
        </section>
    );
}

function AppointmentCancellationAction({ ticket, action }: { ticket: Ticket; action: string }) {
    const [open, setOpen] = useState(false);
    const formId = useId();
    const form = useForm({ reason: '', expected_revision: ticket.appointment_revision });

    return (
        <>
            <button type="button" className="staff-request-button staff-request-danger" onClick={() => setOpen(true)} aria-haspopup="dialog">
                <CalendarX size={17} aria-hidden="true" /> Annuler le rendez-vous
            </button>
            {open && (
                <AdminModal
                    title="Annuler le rendez-vous"
                    description="Le créneau sera retiré de l’agenda. L’étudiant sera notifié et pourra consulter le motif."
                    formId={formId}
                    submitLabel="Confirmer l’annulation"
                    busy={form.processing}
                    errors={form.errors}
                    className="staff-request-cancel-modal"
                    onClose={() => {
                        form.reset();
                        form.clearErrors();
                        setOpen(false);
                    }}
                >
                    <form
                        id={formId}
                        onSubmit={(event) => {
                            event.preventDefault();
                            form.post(action, { preserveScroll: true, preserveState: 'errors', errorBag: 'cancellation' });
                        }}
                    >
                        <label htmlFor={`${formId}-reason`}>Motif communiqué à l’étudiant *</label>
                        <textarea
                            id={`${formId}-reason`}
                            required
                            minLength={5}
                            maxLength={6000}
                            rows={4}
                            value={form.data.reason}
                            disabled={form.processing}
                            aria-invalid={Boolean(form.errors.reason)}
                            onChange={(event) => form.setData('reason', event.currentTarget.value)}
                        />
                        {form.errors.expected_revision && (
                            <button type="button" className="staff-request-cancel-reload" onClick={() => window.location.reload()}>
                                Actualiser la fiche
                            </button>
                        )}
                    </form>
                </AdminModal>
            )}
        </>
    );
}

function AppointmentForm({
    ticket,
    action,
    cancelAction,
    today,
    slots,
}: {
    ticket: Ticket;
    action: string;
    cancelAction: string | null;
    today: string;
    slots: BookableSlot[] | null;
}) {
    const [editing, setEditing] = useState(!ticket.appointment);
    const current = ticket.appointment ?? ticket.appointment_reservation;
    const form = useForm({
        date: current?.date ?? (ticket.appointment_date && ticket.appointment_date >= today ? ticket.appointment_date : ''),
        time: current?.time ?? '',
        location: ticket.appointment?.location ?? '',
        response: '',
        expected_revision: ticket.appointment_revision,
    });
    const slotError =
        (form.errors as Record<string, string | undefined>).appointment_slot ?? (slots !== null ? form.errors.time || form.errors.date : undefined);
    const selectedSlot = slots?.find(({ date, time }) => date === form.data.date && time === form.data.time);
    const availableDates = [...new Set(slots?.map(({ date }) => date))];
    const selectedDate = availableDates.includes(form.data.date) ? form.data.date : '';
    const title = ticket.appointment ? (editing ? 'Déplacer le rendez-vous' : 'Gérer le rendez-vous') : 'Confirmer le rendez-vous';

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        form.transform((data) => ({
            ...data,
            date: String(values.get('date') ?? data.date),
            time: String(values.get('time') ?? data.time),
        }));
        form.post(action, { preserveScroll: 'errors', preserveState: 'errors', errorBag: 'appointment' });
    }

    return (
        <section className="staff-request-panel staff-request-editor">
            <PanelTitle title={title} icon={CalendarCheck} />
            {editing ? (
                <form onSubmit={submit} aria-label={title}>
                    <fieldset disabled={form.processing}>
                        {slots === null ? (
                            <div className="staff-request-date-fields">
                                <label>
                                    Date
                                    <input
                                        name="date"
                                        type="date"
                                        required
                                        min={today}
                                        defaultValue={form.data.date}
                                        aria-invalid={Boolean(form.errors.date)}
                                    />
                                    {form.errors.date && <span role="alert">{form.errors.date}</span>}
                                </label>
                                <label>
                                    Heure de Kinshasa
                                    <input name="time" type="time" required defaultValue={form.data.time} aria-invalid={Boolean(form.errors.time)} />
                                    {form.errors.time && <span role="alert">{form.errors.time}</span>}
                                </label>
                            </div>
                        ) : slots.length ? (
                            <div className="staff-request-date-fields">
                                <label>
                                    Date du créneau
                                    <select
                                        required
                                        value={selectedDate}
                                        onChange={(event) => form.setData((data) => ({ ...data, date: event.target.value, time: '' }))}
                                    >
                                        <option value="">Choisir une date</option>
                                        {availableDates.map((date) => (
                                            <option key={date} value={date}>
                                                {appointmentDate(date)}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    Heure de Kinshasa
                                    <select
                                        required
                                        disabled={!selectedDate}
                                        value={selectedSlot?.time ?? ''}
                                        onChange={(event) => form.setData('time', event.target.value)}
                                        aria-invalid={Boolean(slotError)}
                                    >
                                        <option value="">Choisir une heure</option>
                                        {slots
                                            .filter(({ date }) => date === selectedDate)
                                            .map(({ date, time }) => (
                                                <option key={time} value={time}>
                                                    {time}
                                                    {date === current?.date && time === current.time ? ' · Créneau actuel' : ''}
                                                </option>
                                            ))}
                                    </select>
                                </label>
                            </div>
                        ) : (
                            <p className="staff-request-muted">Aucun créneau libre pour ce service dans les quatre prochaines semaines.</p>
                        )}
                        {slotError && <p role="alert">{slotError}</p>}
                        <label>
                            Lieu du rendez-vous
                            <input
                                value={form.data.location}
                                maxLength={180}
                                required
                                aria-invalid={Boolean(form.errors.location)}
                                onChange={(event) => form.setData('location', event.currentTarget.value)}
                            />
                            {form.errors.location && <span role="alert">{form.errors.location}</span>}
                        </label>
                        <label>
                            Message à l’étudiant <small>Facultatif</small>
                            <textarea
                                value={form.data.response}
                                rows={3}
                                maxLength={6000}
                                aria-invalid={Boolean(form.errors.response)}
                                onChange={(event) => form.setData('response', event.currentTarget.value)}
                            />
                            {form.errors.response && <span role="alert">{form.errors.response}</span>}
                        </label>
                        {form.errors.expected_revision && (
                            <p className="staff-request-error" role="alert">
                                {form.errors.expected_revision}{' '}
                                <button type="button" onClick={() => window.location.reload()}>
                                    Actualiser la fiche
                                </button>
                            </p>
                        )}
                        <div className="staff-request-actions">
                            <button type="submit" disabled={slots !== null && !selectedSlot} className="staff-request-button staff-request-primary">
                                <CalendarCheck size={17} aria-hidden="true" />{' '}
                                {form.processing
                                    ? 'Enregistrement…'
                                    : ticket.appointment
                                      ? 'Enregistrer le nouveau créneau'
                                      : 'Confirmer le rendez-vous'}
                            </button>
                            {ticket.appointment && (
                                <button
                                    type="button"
                                    className="staff-request-button"
                                    onClick={() => {
                                        form.reset();
                                        form.clearErrors();
                                        setEditing(false);
                                    }}
                                >
                                    Fermer
                                </button>
                            )}
                        </div>
                    </fieldset>
                </form>
            ) : (
                <div className="staff-request-actions">
                    <button className="staff-request-button" type="button" onClick={() => setEditing(true)}>
                        <CalendarDays size={17} aria-hidden="true" /> Déplacer le rendez-vous
                    </button>
                    {cancelAction && <AppointmentCancellationAction ticket={ticket} action={cancelAction} />}
                </div>
            )}
        </section>
    );
}

function ReplyForm({ ticket, action }: { ticket: Ticket; action: string }) {
    const form = useForm({ response: ticket.response || '', status: ticket.status === 'resolved' ? 'resolved' : 'open' });
    const title = ticket.response ? 'Modifier la réponse' : 'Répondre à l’étudiant';

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        form.post(action, { preserveScroll: 'errors', preserveState: 'errors', errorBag: 'reply' });
    }

    return (
        <section className="staff-request-panel staff-request-editor">
            <PanelTitle title={title} icon={MessageSquare} />
            <form onSubmit={submit} aria-label={title}>
                <fieldset disabled={form.processing}>
                    <label>
                        Réponse visible par l’étudiant
                        <textarea
                            rows={5}
                            value={form.data.response}
                            required
                            minLength={5}
                            maxLength={6000}
                            aria-invalid={Boolean(form.errors.response)}
                            onChange={(event) => form.setData('response', event.currentTarget.value)}
                        />
                        {form.errors.response && <span role="alert">{form.errors.response}</span>}
                    </label>
                    {!ticket.appointment && (
                        <label>
                            Statut de la demande
                            <select
                                value={form.data.status}
                                aria-invalid={Boolean(form.errors.status)}
                                onChange={(event) => form.setData('status', event.currentTarget.value)}
                            >
                                <option value="open">En cours</option>
                                <option value="resolved">Traitée</option>
                            </select>
                        </label>
                    )}
                    {form.errors.status && <p role="alert">{form.errors.status}</p>}
                    <button type="submit" className="staff-request-button staff-request-primary">
                        <Send size={17} aria-hidden="true" /> {form.processing ? 'Publication…' : 'Publier la réponse'}
                    </button>
                </fieldset>
            </form>
        </section>
    );
}

export default function RequestDetail({ ticket, student, actions, back_url, back_label, success, today, appointment_slots }: Props) {
    const status = requestStatus(ticket);
    const [dismissed, setDismissed] = useState<string | null>(null);

    return (
        <Dashboard hideAppsNavigation>
            <Head title={`Demande n° ${ticket.id} · Scolarité`} />
            {success && success !== dismissed && (
                <FeedbackToast feedback={{ id: ticket.id, tone: 'success', message: success }} onDismiss={() => setDismissed(success)} />
            )}
            <div className="staff-request-detail">
                <Link href={back_url} className="staff-request-back">
                    <ArrowLeft size={18} aria-hidden="true" /> {back_label ?? 'Retour aux demandes'}
                </Link>
                <header className="staff-request-hero">
                    <div>
                        <p>
                            <ClipboardList size={17} aria-hidden="true" /> Scolarité <span aria-hidden="true">/</span> Demande n° {ticket.id}
                        </p>
                        <h1>{ticket.subject}</h1>
                        <p>
                            {ticket.category_label}
                            {ticket.service ? ` · ${ticket.service}` : ''}
                        </p>
                    </div>
                    <span className="staff-request-status" data-tone={status.tone}>
                        {status.text}
                    </span>
                </header>
                <div className="staff-request-columns">
                    <div className="staff-request-stack">
                        <section className="staff-request-panel">
                            <PanelTitle title="Demande de l’étudiant" icon={ClipboardList} />
                            <p className="staff-request-muted">
                                Reçue le <time dateTime={ticket.created_at}>{formatDate(ticket.created_at, true)}</time>
                            </p>
                            {ticket.procedure_label && ticket.procedure_label !== ticket.subject && (
                                <p className="staff-request-muted">{ticket.procedure_label}</p>
                            )}
                            {ticket.procedure_notice && <p className="staff-request-muted">{ticket.procedure_notice}</p>}
                            <p className="staff-request-text">{ticket.body}</p>
                        </section>
                        <Attachment ticket={ticket} />
                        {ticket.is_appointment && <AppointmentSummary ticket={ticket} />}
                        {actions.confirm_url && (
                            <AppointmentForm
                                key={`appointment-${ticket.id}-${ticket.appointment_revision}`}
                                ticket={ticket}
                                action={actions.confirm_url}
                                cancelAction={actions.cancel_url}
                                today={today}
                                slots={appointment_slots ?? null}
                            />
                        )}
                        {ticket.response && (
                            <section className="staff-request-panel staff-request-response">
                                <PanelTitle title={ticket.appointment_cancellation ? 'Réponse précédente' : 'Réponse publiée'} icon={CheckCircle2} />
                                {ticket.responder_name && <p className="staff-request-muted">{ticket.responder_name}</p>}
                                <p className="staff-request-text">{ticket.response}</p>
                            </section>
                        )}
                    </div>
                    <div className="staff-request-stack">
                        <section className="staff-request-panel">
                            <PanelTitle title="Dossier étudiant" icon={UserRound} />
                            <p className="staff-request-student">{student.name}</p>
                            <dl className="staff-request-facts">
                                {student.matricule && (
                                    <div>
                                        <dt>Matricule</dt>
                                        <dd>{student.matricule}</dd>
                                    </div>
                                )}
                                <div>
                                    <dt>Année académique</dt>
                                    <dd>{student.year}</dd>
                                </div>
                                <div>
                                    <dt>Niveau</dt>
                                    <dd>{student.level}</dd>
                                </div>
                                <div>
                                    <dt>Faculté</dt>
                                    <dd>{student.faculty}</dd>
                                </div>
                            </dl>
                            <Link href={student.dossier_url} className="staff-request-button">
                                Ouvrir le dossier étudiant <ArrowUpRight size={17} aria-hidden="true" />
                            </Link>
                        </section>
                        {actions.reply_url && (
                            <ReplyForm key={`reply-${ticket.id}-${ticket.updated_at}`} ticket={ticket} action={actions.reply_url} />
                        )}
                        {actions.specialized_url && (
                            <section className="staff-request-panel">
                                <PanelTitle title="Traitement spécialisé" icon={FileText} />
                                <Link href={actions.specialized_url} className="staff-request-button">
                                    Ouvrir le suivi spécialisé <ArrowUpRight size={17} aria-hidden="true" />
                                </Link>
                            </section>
                        )}
                    </div>
                </div>
            </div>
        </Dashboard>
    );
}
