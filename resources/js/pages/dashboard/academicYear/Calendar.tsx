import AdminModal from '@/components/admin/AdminModal';
import DeleteConfirmation from '@/components/admin/DeleteConfirmation';
import FeedbackToast from '@/components/admin/FeedbackToast';
import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import { addDays, dateLabel, localDate } from '@/lib/scheduleDates';
import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    ArrowUpRight,
    BookOpen,
    CalendarDays,
    CalendarRange,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Download,
    MapPin,
    Pencil,
    Plus,
    Trash2,
} from 'lucide-react';
import { useRef, useState } from 'react';
import '../../../../css/dashboard/academic-calendar.css';

type Year = { id: number; title: string; start_date: string; end_date: string };
type CalendarEvent = {
    id: number;
    title: string;
    category: string;
    start_date: string;
    end_date: string;
    location: string | null;
    description: string | null;
    instructions: string | null;
};
type Semester = { id: number; number: number; start_date: string; end_date: string };
type Props = { years: Year[]; year: Year | null; events: CalendarEvent[]; semesters: Semester[]; categories: Record<string, string> };

const days = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'];
const monthLabel = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortMonth = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });
const defaultCalendarRoute = 'dashboard.admin.academic-years.calendar';
const monthDate = (month: string) => new Date(`${month}-01T12:00:00Z`);

function moveMonth(month: string, step: number) {
    const date = monthDate(month);
    date.setUTCMonth(date.getUTCMonth() + step);
    return date.toISOString().slice(0, 7);
}

function eventCount(count: number) {
    return `${count} ${count === 1 ? 'événement' : 'événements'}`;
}

function dateRange(start: string, end: string) {
    return start === end ? dateLabel(start) : `${dateLabel(start)} au ${dateLabel(end)}`;
}

function CalendarHeader({ years, year, onAdd }: { years: Year[]; year: Year | null; onAdd?: () => void }) {
    return (
        <header className="ac-hero">
            <div className="ac-hero-copy">
                <CalendarDays size={26} strokeWidth={1.65} aria-hidden="true" />
                <h1>Calendrier académique</h1>
                <p>Les dates communes à toute l’université.</p>
            </div>
            {year && (
                <div className="ac-controls">
                    <label className="ac-year-field">
                        <span>Année académique</span>
                        <span className="ac-year-select">
                            <select
                                value={year.id}
                                onChange={(event) => router.get(route(`${defaultCalendarRoute}.index`), { academic_year_id: event.target.value })}
                            >
                                {years.map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.title}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={15} aria-hidden="true" />
                        </span>
                    </label>
                    <a className="ac-control" href={route(`${defaultCalendarRoute}.export`, year.id)} download>
                        <Download size={17} aria-hidden="true" /> Exporter (.ics)
                    </a>
                    <button type="button" className="ac-control ac-create" onClick={onAdd}>
                        <Plus size={18} aria-hidden="true" /> Ajouter un événement
                    </button>
                </div>
            )}
        </header>
    );
}

function EventForm({
    year,
    categories,
    day,
    event,
    close,
    onSaved,
}: {
    year: Year;
    categories: Props['categories'];
    day: string;
    event?: CalendarEvent;
    close: () => void;
    onSaved: () => void;
}) {
    const form = useForm({
        title: event?.title ?? '',
        category: event?.category ?? 'exam',
        start_date: event?.start_date ?? day,
        end_date: event?.end_date ?? day,
        location: event?.location ?? '',
        description: event?.description ?? '',
        instructions: event?.instructions ?? '',
    });
    return (
        <AdminModal
            title={event ? 'Modifier l’événement' : 'Ajouter un événement'}
            description={`Calendrier commun de l’année ${year.title}`}
            formId="academic-calendar-event"
            submitLabel="Enregistrer"
            busy={form.processing}
            errors={form.errors}
            onClose={close}
        >
            <form
                id="academic-calendar-event"
                className="admin-modal-form"
                onSubmit={(submitEvent) => {
                    submitEvent.preventDefault();
                    const options = { preserveScroll: true, onSuccess: onSaved };
                    if (event) form.put(route(`${defaultCalendarRoute}.update`, [year.id, event.id]), options);
                    else form.post(route(`${defaultCalendarRoute}.store`, year.id), options);
                }}
            >
                <label className="admin-field">
                    Intitulé *
                    <input required maxLength={160} value={form.data.title} onChange={(e) => form.setData('title', e.target.value)} />
                </label>
                <label className="admin-field">
                    Type *
                    <select value={form.data.category} onChange={(e) => form.setData('category', e.target.value)}>
                        {Object.entries(categories).map(([key, label]) => (
                            <option key={key} value={key}>
                                {label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="admin-field">
                    Date de début *
                    <input
                        type="date"
                        required
                        min={year.start_date}
                        max={year.end_date}
                        value={form.data.start_date}
                        onChange={(e) => {
                            const start_date = e.target.value;
                            form.setData((previous) => ({
                                ...previous,
                                start_date,
                                end_date: previous.end_date < start_date ? start_date : previous.end_date,
                            }));
                        }}
                    />
                </label>
                <label className="admin-field">
                    Date de fin incluse *
                    <input
                        type="date"
                        required
                        min={form.data.start_date}
                        max={year.end_date}
                        value={form.data.end_date}
                        onChange={(e) => form.setData('end_date', e.target.value)}
                    />
                </label>
                <label className="admin-field">
                    Lieu
                    <input maxLength={160} value={form.data.location} onChange={(e) => form.setData('location', e.target.value)} />
                </label>
                <label className="admin-field">
                    Description
                    <textarea rows={3} maxLength={3000} value={form.data.description} onChange={(e) => form.setData('description', e.target.value)} />
                </label>
                <label className="admin-field">
                    Informations importantes
                    <textarea
                        rows={3}
                        maxLength={2000}
                        value={form.data.instructions}
                        onChange={(e) => form.setData('instructions', e.target.value)}
                    />
                </label>
            </form>
        </AdminModal>
    );
}

function YearCalendar({
    years,
    year,
    events,
    semesters,
    categories,
}: {
    years: Year[];
    year: Year;
    events: CalendarEvent[];
    semesters: Semester[];
    categories: Props['categories'];
}) {
    const today = localDate(new Date().toISOString());
    const canJumpToToday = today >= year.start_date && today <= year.end_date;
    const [month, setMonth] = useState(() => (canJumpToToday ? today : year.start_date).slice(0, 7));
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const [editor, setEditor] = useState<{ day: string; event?: CalendarEvent } | null>(null);
    const [deleting, setDeleting] = useState<CalendarEvent | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const deletion = useForm({});
    const agendaHeading = useRef<HTMLHeadingElement>(null);
    const first = month + '-01';
    const next = moveMonth(month, 1) + '-01';
    const offset = (monthDate(month).getUTCDay() + 6) % 7;
    const visibleEvents = events.filter((event) => event.start_date < next && event.end_date >= first);
    const agendaEvents = selectedDay
        ? visibleEvents.filter((event) => event.start_date <= selectedDay && event.end_date >= selectedDay)
        : visibleEvents;
    const slots = Array.from({ length: Math.ceil((offset + Number(addDays(next, -1).slice(8))) / 7) * 7 }, (_, index) =>
        addDays(first, index - offset),
    );
    const defaultDay = today >= first && today < next && canJumpToToday ? today : first < year.start_date ? year.start_date : first;
    const monthName = monthLabel.format(monthDate(month));

    function goToMonth(value: string) {
        setMonth(value);
        setSelectedDay(null);
    }

    function openDelete(event: CalendarEvent) {
        deletion.clearErrors();
        setDeleting(event);
    }

    function showDayAgenda(day: string) {
        setSelectedDay(day);
        agendaHeading.current?.focus();
    }

    return (
        <>
            <CalendarHeader years={years} year={year} onAdd={() => setEditor({ day: selectedDay ?? defaultDay })} />
            <div className="ac-workspace">
                <section className="ac-panel ac-calendar" aria-labelledby="ac-month-title">
                    <header className="ac-panel-header ac-month-header">
                        <h2 id="ac-month-title" aria-live="polite">
                            {monthName}
                        </h2>
                        <div className="ac-month-actions">
                            {canJumpToToday && (
                                <button type="button" className="ac-today-link" onClick={() => goToMonth(today.slice(0, 7))}>
                                    Aujourd’hui
                                </button>
                            )}
                            <div className="ac-month-arrows">
                                <button
                                    type="button"
                                    className="ac-icon-button"
                                    aria-label="Mois précédent"
                                    disabled={month <= year.start_date.slice(0, 7)}
                                    onClick={() => goToMonth(moveMonth(month, -1))}
                                >
                                    <ChevronLeft size={18} aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    className="ac-icon-button"
                                    aria-label="Mois suivant"
                                    disabled={month >= year.end_date.slice(0, 7)}
                                    onClick={() => goToMonth(moveMonth(month, 1))}
                                >
                                    <ChevronRight size={18} aria-hidden="true" />
                                </button>
                            </div>
                        </div>
                    </header>
                    <div className="ac-grid">
                        {days.map((day) => (
                            <span key={day} className="ac-weekday">
                                {day}
                            </span>
                        ))}
                        {slots.map((day) => {
                            const inMonth = day >= first && day < next;
                            const matching = inMonth ? visibleEvents.filter((event) => event.start_date <= day && event.end_date >= day) : [];
                            const semester = semesters.find((period) => inMonth && period.start_date <= day && period.end_date >= day);
                            const inYear = day >= year.start_date && day <= year.end_date;
                            return (
                                <div
                                    key={day}
                                    className="ac-day"
                                    data-outside={!inMonth || undefined}
                                    data-course={Boolean(semester) || undefined}
                                    data-selected={selectedDay === day || undefined}
                                >
                                    {inMonth && (
                                        <>
                                            <div className="ac-day-head">
                                                <button
                                                    type="button"
                                                    className="ac-day-number"
                                                    aria-label={
                                                        dateLabel(day) +
                                                        ', ' +
                                                        eventCount(matching.length) +
                                                        (semester ? ', période de cours du semestre ' + semester.number : '')
                                                    }
                                                    aria-current={day === today ? 'date' : undefined}
                                                    aria-pressed={selectedDay === day}
                                                    aria-controls="ac-agenda"
                                                    disabled={!inYear}
                                                    onClick={() => setSelectedDay(selectedDay === day ? null : day)}
                                                >
                                                    {Number(day.slice(8))}
                                                </button>
                                                {inYear && (
                                                    <button
                                                        type="button"
                                                        className="ac-day-add"
                                                        aria-label={'Ajouter un événement le ' + dateLabel(day)}
                                                        title={'Ajouter un événement le ' + dateLabel(day)}
                                                        tabIndex={selectedDay === day ? 0 : -1}
                                                        onClick={() => setEditor({ day })}
                                                    >
                                                        <Plus size={14} aria-hidden="true" />
                                                    </button>
                                                )}
                                            </div>
                                            <div className="ac-day-events">
                                                {matching.slice(0, 2).map((event) => (
                                                    <button
                                                        type="button"
                                                        key={event.id}
                                                        className="ac-event"
                                                        data-category={event.category}
                                                        title={event.title}
                                                        aria-label={'Modifier ' + event.title + ', ' + dateLabel(day)}
                                                        onClick={() => setEditor({ day, event })}
                                                    >
                                                        <span>{event.title}</span>
                                                    </button>
                                                ))}
                                                {matching.length > 2 && (
                                                    <button
                                                        type="button"
                                                        className="ac-more"
                                                        aria-label={'Voir tous les événements du ' + dateLabel(day)}
                                                        onClick={() => showDayAgenda(day)}
                                                    >
                                                        +{matching.length - 2}
                                                    </button>
                                                )}
                                            </div>
                                            {matching.length > 0 && (
                                                <div className="ac-day-dots" aria-hidden="true">
                                                    {[...new Set(matching.map((event) => event.category))].slice(0, 3).map((category) => (
                                                        <span key={category} className="ac-dot" data-category={category} />
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <ul className="ac-legend" aria-label="Légende du calendrier">
                        {Object.entries({ course: 'Période de cours', ...categories }).map(([key, label]) => (
                            <li key={key}>
                                <span className="ac-dot" data-category={key} aria-hidden="true" /> {label}
                            </li>
                        ))}
                    </ul>
                </section>
                <section id="ac-agenda" className="ac-panel ac-agenda" aria-labelledby="ac-agenda-title">
                    <header className="ac-panel-header ac-agenda-header">
                        <div>
                            <h2 id="ac-agenda-title" ref={agendaHeading} tabIndex={-1}>
                                {selectedDay ? dateLabel(selectedDay) : 'Événements du mois'}
                            </h2>
                            <p aria-live="polite">{eventCount(agendaEvents.length)}</p>
                        </div>
                        {selectedDay && (
                            <button type="button" className="ac-text-button" onClick={() => setSelectedDay(null)}>
                                Tout le mois
                            </button>
                        )}
                    </header>
                    {agendaEvents.length > 0 ? (
                        <ul className="ac-agenda-list">
                            {agendaEvents.map((event) => (
                                <li key={event.id} className="ac-agenda-item" data-category={event.category}>
                                    <div className="ac-date-tile" aria-hidden="true">
                                        <strong>{Number(event.start_date.slice(8))}</strong>
                                        <span>{shortMonth.format(monthDate(event.start_date.slice(0, 7))).replace(/\.$/, '')}</span>
                                    </div>
                                    <div className="ac-agenda-copy">
                                        <span className="ac-category">{categories[event.category]}</span>
                                        <h3>{event.title}</h3>
                                        <p>{dateRange(event.start_date, event.end_date)}</p>
                                        {event.location && (
                                            <p className="ac-location">
                                                <MapPin size={13} aria-hidden="true" /> {event.location}
                                            </p>
                                        )}
                                    </div>
                                    <div className="ac-event-actions">
                                        <button
                                            type="button"
                                            className="ac-icon-button"
                                            aria-label={'Modifier ' + event.title}
                                            title="Modifier"
                                            onClick={() => setEditor({ day: event.start_date, event })}
                                        >
                                            <Pencil size={16} aria-hidden="true" />
                                        </button>
                                        <button
                                            type="button"
                                            className="ac-icon-button ac-remove"
                                            aria-label={'Supprimer ' + event.title}
                                            title="Supprimer"
                                            onClick={() => openDelete(event)}
                                        >
                                            <Trash2 size={16} aria-hidden="true" />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="ac-empty">
                            <CalendarRange size={27} strokeWidth={1.55} aria-hidden="true" />
                            <p>{selectedDay ? 'Aucun événement ce jour-là.' : 'Aucun événement ce mois-ci.'}</p>
                            <button type="button" className="ac-text-button" onClick={() => setEditor({ day: selectedDay ?? defaultDay })}>
                                <Plus size={17} aria-hidden="true" /> Ajouter un événement
                            </button>
                        </div>
                    )}
                </section>
            </div>
            <section className="ac-panel ac-periods" aria-labelledby="ac-periods-title">
                <header className="ac-panel-header">
                    <h2 id="ac-periods-title">Périodes de cours</h2>
                    <Link className="ac-text-button" href={route('dashboard.admin.academic-years.semesters.index', { academic_year_id: year.id })}>
                        Gérer les semestres <ArrowUpRight size={16} aria-hidden="true" />
                    </Link>
                </header>
                <div className="ac-period-grid">
                    {[1, 2].map((number) => {
                        const semester = semesters.find((period) => period.number === number);
                        return (
                            <div key={number} className="ac-period">
                                <BookOpen size={19} strokeWidth={1.6} aria-hidden="true" />
                                <div>
                                    <h3>Semestre {number}</h3>
                                    <p>{semester ? dateRange(semester.start_date, semester.end_date) : 'Période à définir'}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>
            {editor && (
                <EventForm
                    year={year}
                    categories={categories}
                    day={editor.day}
                    event={editor.event}
                    close={() => setEditor(null)}
                    onSaved={() => {
                        setNotice(editor.event ? 'Événement modifié.' : 'Événement ajouté.');
                        setEditor(null);
                    }}
                />
            )}
            {deleting && (
                <DeleteConfirmation
                    title="Supprimer l’événement"
                    name={deleting.title}
                    detail={categories[deleting.category]}
                    explanation="L’événement sera retiré du calendrier commun de l’université."
                    hint={dateRange(deleting.start_date, deleting.end_date)}
                    busy={deletion.processing}
                    errors={deletion.errors}
                    onClose={() => setDeleting(null)}
                    onConfirm={(event) => {
                        event.preventDefault();
                        if (deletion.processing) return;
                        deletion.delete(route(defaultCalendarRoute + '.destroy', [year.id, deleting.id]), {
                            preserveScroll: true,
                            onSuccess: () => {
                                setDeleting(null);
                                setNotice('Événement supprimé.');
                                requestAnimationFrame(() => agendaHeading.current?.focus({ preventScroll: true }));
                            },
                        });
                    }}
                />
            )}
            {notice && <FeedbackToast feedback={{ id: 0, message: notice, tone: 'success' }} onDismiss={() => setNotice(null)} />}
        </>
    );
}

export default function Calendar({ years, year, events, semesters, categories }: Props) {
    return (
        <Dashboard hideAppsNavigation>
            <Head title="Calendrier académique" />
            <div className="ac-page">
                {year ? (
                    <YearCalendar key={year.id} years={years} year={year} events={events} semesters={semesters} categories={categories} />
                ) : (
                    <>
                        <CalendarHeader years={years} year={year} />
                        <section className="ac-panel ac-empty">
                            <CalendarRange size={28} strokeWidth={1.55} aria-hidden="true" />
                            <p>Créez une année académique pour commencer.</p>
                            <Link className="ac-text-button" href={route('dashboard.admin.academic-years.index')}>
                                Gérer les années académiques <ArrowUpRight size={16} aria-hidden="true" />
                            </Link>
                        </section>
                    </>
                )}
            </div>
        </Dashboard>
    );
}
