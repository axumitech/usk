import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import { studentHref, studentSectionLabels } from '@/components/student/navigation';
import { groupProgramEvents, programMonthLabel, programPeriod, type ProgramEvent } from '@/components/student/programCalendar';
import { StudentYearSelect, type StudentChromeData } from '@/components/student/StudentChrome';
import { Head, Link } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowUpRight,
    Bell,
    BookOpen,
    CalendarDays,
    CalendarPlus,
    ChevronDown,
    ChevronRight,
    CircleAlert,
    ClipboardCheck,
    Download,
    FileText,
    GraduationCap,
    Landmark,
    MapPin,
    Palmtree,
    Share2,
} from 'lucide-react';
import { useState } from 'react';
import '../../../../css/student-program.css';
import '../../../../css/student-schedule.css';

export type StudentProgram = {
    academic_id: number;
    year: string;
    today: string;
    events: ProgramEvent[];
    event?: ProgramEvent | null;
    calendar_url: string;
    index_url: string;
};

const eventIcons = {
    exam: GraduationCap,
    resit: ClipboardCheck,
    holiday: Palmtree,
    courses: BookOpen,
    semester: BookOpen,
    other: CalendarDays,
};

const eventIcon = (category: string) => eventIcons[category as keyof typeof eventIcons] ?? CalendarDays;

function ProgramCover({
    program,
    archived,
    studentChrome,
}: {
    program: StudentProgram;
    archived: boolean;
    studentChrome?: StudentChromeData | null;
}) {
    const { event } = program;
    return (
        <header className="student-agenda-header" data-year-state={archived ? 'archive' : 'current'}>
            <Link
                className="student-agenda-header-action"
                href={event ? `${program.index_url}#student-program-event-${event.id}` : studentHref('overview', program.academic_id, 'home-events')}
                aria-label={event ? 'Retour à l’agenda académique' : 'Retour à l’accueil'}
            >
                <ArrowLeft size={22} aria-hidden="true" />
            </Link>
            <div className="student-agenda-heading">
                <h1>{event?.title ?? studentSectionLabels.program}</h1>
                {event ? (
                    <p>
                        {event.category_label} · {program.year}
                    </p>
                ) : studentChrome && studentChrome.options.length > 1 ? (
                    <label className="student-agenda-year">
                        <span>
                            Année académique <span className="whitespace-nowrap">{program.year}</span>
                        </span>
                        <ChevronDown size={14} aria-hidden="true" />
                        <StudentYearSelect context={studentChrome} section="program" />
                    </label>
                ) : (
                    <p>Année académique {program.year}</p>
                )}
            </div>
            {!event && program.events.length > 0 && (
                <a
                    className="student-agenda-header-action"
                    href={program.calendar_url}
                    aria-label="Télécharger le calendrier de l’année"
                    title="Télécharger le calendrier"
                >
                    <Download size={20} aria-hidden="true" />
                </a>
            )}
        </header>
    );
}

const filters = [
    { label: 'Tout', categories: [] },
    { label: 'Cours', categories: ['courses', 'semester'] },
    { label: 'Examens', categories: ['exam', 'resit'] },
    { label: 'Vacances', categories: ['holiday'] },
];

const monthShort = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'Africa/Kinshasa' });

function DateTile({ date }: { date: string }) {
    return (
        <time className="student-program-date-tile" dateTime={date} aria-hidden="true">
            <strong>{Number(date.slice(-2))}</strong>
            <span>{monthShort.format(new Date(`${date}T12:00:00Z`))}</span>
        </time>
    );
}

function ProgramTimeline({ program }: { program: StudentProgram }) {
    const [filter, setFilter] = useState(0);
    const categories = filters[filter].categories;
    const visible = categories.length ? program.events.filter((event) => categories.includes(event.category)) : program.events;
    const months = groupProgramEvents(visible);
    const upcoming = program.events.filter((event) => event.start_date >= program.today);
    const next = upcoming.find((event) => event.category !== 'semester') ?? upcoming[0];

    if (!program.events.length) {
        return (
            <div className="student-program-empty">
                <CalendarDays size={30} aria-hidden="true" />
                <p>Aucune date n’est encore publiée pour cette année académique.</p>
            </div>
        );
    }

    return (
        <div className="student-program-overview">
            {next && (
                <aside className="student-program-highlight" aria-labelledby="program-next">
                    <h2 id="program-next">{next.start_date === program.today ? 'Aujourd’hui' : 'Prochain événement'}</h2>
                    <Link href={next.detail_url}>
                        <DateTile date={next.start_date} />
                        <span>
                            <strong>{next.title}</strong>
                            <small>{programPeriod(next.start_date, next.end_date, true)}</small>
                        </span>
                        <ArrowUpRight size={19} aria-hidden="true" />
                    </Link>
                </aside>
            )}
            <section className="student-program-timeline" aria-labelledby="program-calendar">
                <div className="student-program-calendar-head">
                    <h2 id="program-calendar">Calendrier de l’année</h2>
                    <div className="student-program-filters" role="group" aria-label="Filtrer les événements">
                        {filters.map(({ label }, index) => (
                            <button key={label} type="button" aria-pressed={filter === index} onClick={() => setFilter(index)}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
                {months.map(([month, events]) => (
                    <section className="student-program-month" key={month} aria-labelledby={`student-program-${month}`}>
                        <h3 id={`student-program-${month}`}>{programMonthLabel(month)}</h3>
                        <ol>
                            {events.map((event) => {
                                const Icon = eventIcon(event.category);
                                const active = event.start_date <= program.today && program.today <= event.end_date && event.category !== 'semester';
                                return (
                                    <li key={event.id} id={`student-program-event-${event.id}`}>
                                        <Link href={event.detail_url} className="student-program-row" data-category={event.category}>
                                            <DateTile date={event.start_date} />
                                            <span className="student-program-row-copy">
                                                <strong>{event.title}</strong>
                                                <small>{programPeriod(event.start_date, event.end_date, true)}</small>
                                            </span>
                                            <span className="student-program-row-icon">
                                                {active && <span>En cours</span>}
                                                <Icon size={18} aria-hidden="true" />
                                            </span>
                                            <ChevronRight size={16} className="student-program-row-arrow" aria-hidden="true" />
                                        </Link>
                                    </li>
                                );
                            })}
                        </ol>
                    </section>
                ))}
                {months.length === 0 && (
                    <div className="student-program-empty">
                        <CalendarDays size={26} aria-hidden="true" />
                        <p>Aucun événement dans cette catégorie.</p>
                    </div>
                )}
            </section>
        </div>
    );
}

function EventActions({ event, today }: { event: ProgramEvent; today: string }) {
    const [feedback, setFeedback] = useState('');
    const [manualShare, setManualShare] = useState<string>();

    async function share() {
        const url = new URL(event.share_url ?? event.detail_url.split('?')[0], window.location.origin).href;
        setFeedback('');
        setManualShare(undefined);
        if (navigator.share) {
            try {
                await navigator.share({ title: event.title, url });
                return;
            } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') return;
            }
        }
        try {
            await navigator.clipboard.writeText(url);
            setFeedback('Lien de l’événement copié.');
        } catch {
            setManualShare(url);
        }
    }

    return (
        <>
            <div className="student-program-actions">
                <a href={event.calendar_url} className="student-program-primary">
                    <CalendarPlus size={21} aria-hidden="true" /> Ajouter au calendrier
                </a>
                {event.reminder_url && event.start_date > today && (
                    <a href={event.reminder_url} aria-label="Ajouter au calendrier avec un rappel la veille" title="Rappel la veille">
                        <Bell size={20} aria-hidden="true" /> Ajouter un rappel
                    </a>
                )}
                <button type="button" onClick={share}>
                    <Share2 size={19} aria-hidden="true" /> Partager
                </button>
            </div>
            {feedback && (
                <p className="student-program-feedback" role="status">
                    {feedback}
                </p>
            )}
            {manualShare && (
                <label className="student-program-share-link">
                    Lien de l’événement à copier
                    <input type="url" readOnly value={manualShare} onFocus={(event) => event.currentTarget.select()} />
                </label>
            )}
        </>
    );
}

function ProgramEventDetails({ program, event }: { program: StudentProgram; event: ProgramEvent }) {
    const Icon = eventIcon(event.category);
    const status = event.end_date < program.today ? 'pass' : event.start_date <= program.today ? 'current' : 'next';
    const statusLabel = { pass: 'Terminé', current: 'En cours', next: 'À venir' }[status];
    return (
        <div className="student-program-body student-program-detail">
            <section
                className="student-program-card student-program-event-card"
                data-category={event.category}
                aria-label="Informations de l’événement"
            >
                <header className="student-program-event-heading">
                    <span className="student-program-event-icon">
                        <Icon size={27} aria-hidden="true" />
                    </span>
                    <div>
                        <strong>Année académique {program.year}</strong>
                    </div>
                    <span className="student-program-event-status" data-status={status}>
                        {statusLabel}
                    </span>
                </header>
                <dl className="student-program-event-facts">
                    <div>
                        <dt>
                            <CalendarDays size={18} aria-hidden="true" /> {event.start_date === event.end_date ? 'Date' : 'Période'}
                        </dt>
                        <dd>{programPeriod(event.start_date, event.end_date)}</dd>
                    </div>
                    <div>
                        <dt>
                            <Landmark size={18} aria-hidden="true" /> Périmètre
                        </dt>
                        <dd>Toute l’université</dd>
                    </div>
                    {event.location && (
                        <div>
                            <dt>
                                <MapPin size={18} aria-hidden="true" /> Lieu
                            </dt>
                            <dd>{event.location}</dd>
                        </div>
                    )}
                </dl>
            </section>
            {event.description?.trim() && (
                <section className="student-program-card student-program-note" aria-labelledby="student-program-description">
                    <h2 id="student-program-description">
                        <FileText size={19} aria-hidden="true" /> Description
                    </h2>
                    <p>{event.description}</p>
                </section>
            )}
            {event.instructions?.trim() && (
                <section
                    className="student-program-card student-program-note student-program-important"
                    aria-labelledby="student-program-instructions"
                >
                    <h2 id="student-program-instructions">
                        <CircleAlert size={19} aria-hidden="true" /> Informations importantes
                    </h2>
                    <p>{event.instructions}</p>
                </section>
            )}
            <EventActions key={event.id} event={event} today={program.today} />
        </div>
    );
}

export default function Program({ program, studentChrome }: { program: StudentProgram; studentChrome?: StudentChromeData | null }) {
    const academicYear = studentChrome?.options.find((year) => year.id === program.academic_id);
    return (
        <Dashboard>
            <Head title={program.event?.title ?? studentSectionLabels.program} />
            <div className="student-program student-agenda">
                <ProgramCover program={program} archived={Boolean(academicYear && !academicYear.is_current)} studentChrome={studentChrome} />
                <div className="student-agenda-body student-program-content">
                    {program.event ? (
                        <ProgramEventDetails program={program} event={program.event} />
                    ) : (
                        <ProgramTimeline key={program.academic_id} program={program} />
                    )}
                </div>
            </div>
        </Dashboard>
    );
}
