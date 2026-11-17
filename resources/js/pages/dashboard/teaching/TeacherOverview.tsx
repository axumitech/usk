import Pagination from '@/components/admin/Pagination';
import ProfessorAvatar from '@/components/teaching/ProfessorAvatar';
import { daySegment } from '@/lib/scheduleCalendar';
import { addDays, dateLabel, localDate, zone } from '@/lib/scheduleDates';
import { Link, router } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowRight,
    ArrowUpRight,
    BookOpen,
    CalendarClock,
    CalendarDays,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ClipboardCheck,
    Clock3,
    FileText,
    GraduationCap,
    Layers3,
    MapPin,
    Megaphone,
    Plus,
    Upload,
    UsersRound,
    Zap,
    type LucideIcon,
} from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import type { TeacherAnnouncement, TeacherCalendarEvent, TeacherCourse, TeacherOverview, TeacherView } from './overviewTypes';

const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: zone });
const weekRange = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: zone });
const slotTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.floor(minutes % 60)).padStart(2, '0')}`;
const number = new Intl.NumberFormat('fr-FR');
export const teacherTitles: Record<TeacherView, string> = {
    home: 'Tableau de bord',
    courses: 'Mes cours',
    schedule: 'Mon emploi du temps',
    students: 'Mes étudiants',
    announcements: 'Annonces de mes cours',
};

function workspaceHref(data: TeacherOverview, view: TeacherView, changes: Record<string, string | number | null> = {}) {
    const filters = { view: view === 'home' ? null : view, year: data.year, semester: data.semester, ...changes };
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
        if (value !== null) search.set(key, String(value));
    }
    return route('dashboard.teaching.index') + (search.size ? `?${search}` : '');
}

function displayDate(value: string) {
    return date.format(new Date(value));
}

export function TeacherCover({
    data,
    view,
    name,
    photoUrl,
    detail,
    detailBack,
}: {
    data: TeacherOverview;
    view: TeacherView;
    name: string;
    photoUrl?: string | null;
    detail?: string;
    detailBack?: { href: string; label: string };
}) {
    const home = view === 'home' && !detail;
    const year = data.years.find((option) => option.id === data.year);
    return (
        <header className="teacher-cover">
            <div className="teacher-campus" aria-hidden="true">
                <img src="/assets/usk/campus-720.webp" alt="" width={720} height={480} fetchPriority={home ? 'high' : 'auto'} />
            </div>
            <div className="teacher-cover-content">
                <div className="teacher-cover-identity">
                    {home && <ProfessorAvatar name={name} photoUrl={photoUrl} />}
                    <div>
                        {home ? (
                            <>
                                <span className="teacher-cover-label">Espace enseignant</span>
                                <h1>{name ? `Bonjour, ${name}` : 'Bonjour'}</h1>
                            </>
                        ) : (
                            <>
                                <Link className="teacher-back" href={detailBack?.href ?? (detail ? workspaceHref(data, 'courses') : data.links.home)}>
                                    <ArrowLeft size={16} aria-hidden="true" /> {detailBack?.label ?? (detail ? 'Mes cours' : 'Tableau de bord')}
                                </Link>
                                <h1>{detail || teacherTitles[view]}</h1>
                            </>
                        )}
                    </div>
                </div>
                {!detail && (data.years.length > 0 || data.semesters.length > 0) && (
                    <div className="teacher-filters">
                        {data.years.length > 0 && (
                            <label className="teacher-filter">
                                <CalendarDays size={22} aria-hidden="true" />
                                <span>
                                    Année académique
                                    <select
                                        value={data.year ?? ''}
                                        onChange={(event) =>
                                            router.visit(workspaceHref(data, view, { year: event.target.value || null, semester: null }))
                                        }
                                    >
                                        {data.years.map((option) => (
                                            <option key={option.id} value={option.id}>
                                                {option.title}
                                            </option>
                                        ))}
                                    </select>
                                </span>
                                <ChevronDown size={16} aria-hidden="true" />
                            </label>
                        )}
                        {data.semesters.length > 0 && (
                            <label className="teacher-filter">
                                <Layers3 size={22} aria-hidden="true" />
                                <span>
                                    Semestre
                                    <select
                                        value={data.semester ?? 'all'}
                                        onChange={(event) => router.visit(workspaceHref(data, view, { semester: event.target.value || null }))}
                                    >
                                        <option value="all">Tous</option>
                                        {data.semesters.map((option) => (
                                            <option key={option.id} value={option.id}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </span>
                                <ChevronDown size={16} aria-hidden="true" />
                            </label>
                        )}
                    </div>
                )}
                {detail && year && <span className="teacher-cover-year">{year.title}</span>}
            </div>
        </header>
    );
}

export function TeacherPanel({
    id,
    title,
    icon: Icon,
    more,
    action,
    children,
    className = '',
}: {
    id: string;
    title: string;
    icon: LucideIcon;
    more?: string | null;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section className={`teacher-panel ${className}`} id={id} aria-labelledby={`${id}-title`}>
            <header className="teacher-panel-heading">
                <h2 id={`${id}-title`}>
                    <Icon size={22} aria-hidden="true" /> {title}
                </h2>
                {more && (
                    <Link href={more} className="teacher-panel-more" aria-label={`Voir tout · ${title}`}>
                        Voir tout <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                )}
                {action}
            </header>
            {children}
        </section>
    );
}

function Empty({ children }: { children: ReactNode }) {
    return <p className="teacher-empty">{children}</p>;
}

const statTiles = [
    ['courses', 'Cours assignés', BookOpen, 'mint'],
    ['students', 'Étudiants inscrits', UsersRound, 'olive'],
    ['assessments', 'Évaluations actives', ClipboardCheck, 'plum'],
    ['resources', 'Supports publiés', Upload, 'gold'],
] as const;

function TeacherStats({ data }: { data: TeacherOverview }) {
    return (
        <dl className="teacher-stats" aria-label="Indicateurs de la période">
            {statTiles.map(([key, label, Icon, tone]) => {
                const value = data.stats[key];
                return (
                    <div key={key} className="teacher-stat" data-tone={tone}>
                        <span className="teacher-symbol">
                            <Icon size={24} aria-hidden="true" />
                        </span>
                        <dt>{label}</dt>
                        <dd>{value === null ? '—' : number.format(value)}</dd>
                    </div>
                );
            })}
        </dl>
    );
}

export function TeacherCourseRows({
    courses,
    studentsView = false,
    selected,
}: {
    courses: TeacherCourse[];
    studentsView?: boolean;
    selected?: number;
}) {
    if (!courses.length) return <Empty>Aucun cours sur cette période.</Empty>;
    return (
        <ul className="teacher-list teacher-course-list">
            {courses.map((course, index) => (
                <li key={course.id}>
                    <Link
                        className="teacher-row teacher-course-row"
                        href={course.url + (studentsView ? '#teacher-roster' : '')}
                        aria-current={course.id === selected ? 'page' : undefined}
                    >
                        <span className="teacher-symbol" data-tone={['mint', 'plum', 'olive', 'gold'][index % 4]}>
                            <BookOpen size={21} aria-hidden="true" />
                        </span>
                        <span className="teacher-row-copy">
                            <strong>{course.title}</strong>
                            <small>{[course.level, course.group].filter(Boolean).join(' · ')}</small>
                            {course.students !== null && (
                                <small className="teacher-row-with-icon">
                                    <UsersRound size={14} aria-hidden="true" /> {number.format(course.students)} étudiant
                                    {course.students === 1 ? '' : 's'}
                                </small>
                            )}
                        </span>
                        <ChevronRight className="teacher-row-chevron" size={18} aria-hidden="true" />
                    </Link>
                </li>
            ))}
        </ul>
    );
}

export function TeacherTimetable({ data, view }: { data: TeacherOverview; view: TeacherView }) {
    const { week } = data;
    const full = view === 'schedule';
    const pickerId = useId();
    const timeId = useId();
    const [datePickerOpen, setDatePickerOpen] = useState(false);
    const selected = week.days.find((day) => day.date === week.selected_day);
    const segments = selected?.sessions.flatMap((session) => daySegment(session, selected.date) ?? []) ?? [];
    const isCurrentWeek = week.today >= week.start && week.today <= week.end;
    const todayHref = workspaceHref(data, view, { week: week.today, day: week.today });
    return (
        <>
            <div className={full ? 'teacher-week-toolbar' : undefined}>
                <div className="teacher-week-heading">
                    <Link
                        href={workspaceHref(data, view, { week: week.previous, day: addDays(week.selected_day, -7) })}
                        aria-label="Semaine précédente"
                        preserveScroll
                    >
                        <ChevronLeft size={18} aria-hidden="true" />
                    </Link>
                    <strong>
                        {full
                            ? weekRange.formatRange(new Date(`${week.start}T12:00:00Z`), new Date(`${week.end}T12:00:00Z`))
                            : `${displayDate(week.start)} – ${displayDate(week.end)}`}
                    </strong>
                    <Link
                        href={workspaceHref(data, view, { week: week.next, day: addDays(week.selected_day, 7) })}
                        aria-label="Semaine suivante"
                        preserveScroll
                    >
                        <ChevronRight size={18} aria-hidden="true" />
                    </Link>
                </div>
                {full && (
                    <div className="teacher-week-actions">
                        {!isCurrentWeek || week.selected_day !== week.today ? (
                            <Link href={todayHref} preserveScroll>
                                Aujourd’hui
                            </Link>
                        ) : null}
                        <button
                            type="button"
                            aria-expanded={datePickerOpen}
                            aria-controls={pickerId}
                            onClick={() => setDatePickerOpen((open) => !open)}
                        >
                            <CalendarClock size={17} aria-hidden="true" /> Choisir une date
                        </button>
                    </div>
                )}
            </div>
            {full && (
                <form
                    className="teacher-week-date-picker"
                    id={pickerId}
                    hidden={!datePickerOpen}
                    onSubmit={(event) => {
                        event.preventDefault();
                        const date = new FormData(event.currentTarget).get('date');
                        if (typeof date !== 'string' || !date) return;
                        setDatePickerOpen(false);
                        router.visit(workspaceHref(data, view, { week: date, day: date }), { preserveScroll: true });
                    }}
                >
                    <label htmlFor={`${pickerId}-input`}>Aller au</label>
                    <input key={week.selected_day} id={`${pickerId}-input`} type="date" name="date" defaultValue={week.selected_day} required />
                    <button type="submit">Afficher</button>
                </form>
            )}
            <nav className="teacher-week-days" aria-label="Choisir un jour">
                {week.days.map((day) => (
                    <Link
                        key={day.date}
                        href={workspaceHref(data, view, { week: week.start, day: day.date })}
                        aria-current={day.date === week.selected_day ? 'date' : undefined}
                        aria-label={`${dateLabel(day.date)}${day.is_today ? ', aujourd’hui' : ''}${full && day.sessions.length ? ', séances prévues' : ''}`}
                        data-today={day.is_today || undefined}
                        preserveScroll
                    >
                        <small>{day.weekday}</small>
                        <strong>{day.day}</strong>
                        {(full ? day.sessions.length > 0 : day.is_today) && <i aria-hidden="true" />}
                    </Link>
                ))}
            </nav>
            {full && (
                <p className="teacher-week-day-label">
                    <strong>{dateLabel(week.selected_day)}</strong>
                    <span>Heure de Kinshasa</span>
                </p>
            )}
            {segments.length ? (
                <ul className="teacher-list teacher-sessions">
                    {segments.map(({ session, start, end }) => {
                        const day = week.selected_day;
                        const startsBefore = localDate(session.starts_at) < day;
                        const followingMidnight = `${addDays(day, 1)}T00:00:00+01:00`;
                        const endsAfter = Date.parse(session.ends_at) > Date.parse(followingMidnight);
                        const continuation = startsBefore ? 'Commencée avant ce jour' : endsAfter ? 'Se poursuit le lendemain' : null;
                        return (
                            <li key={session.id}>
                                <div className="teacher-session-time" id={`${timeId}-${session.id}`}>
                                    <time dateTime={startsBefore ? `${day}T00:00:00+01:00` : session.starts_at}>{slotTime(start)}</time>
                                    <time dateTime={endsAfter ? followingMidnight : session.ends_at}>{slotTime(end)}</time>
                                </div>
                                <Link
                                    className="teacher-row teacher-session-row"
                                    href={session.url}
                                    data-tone={['mint', 'plum', 'olive', 'gold'][session.offering_id % 4]}
                                    aria-describedby={`${timeId}-${session.id}`}
                                >
                                    <span className="teacher-symbol">
                                        <BookOpen size={18} aria-hidden="true" />
                                    </span>
                                    <span className="teacher-row-copy">
                                        <strong>{session.course}</strong>
                                        <small>{[session.level, session.group].filter(Boolean).join(' · ')}</small>
                                        <small className="teacher-row-with-icon">
                                            <MapPin size={13} aria-hidden="true" /> {session.location || session.room || 'Salle à préciser'}
                                        </small>
                                        {session.status !== 'published' && (
                                            <small className="teacher-session-status">
                                                {session.status === 'rescheduled' ? 'Séance reportée' : 'Séance annulée'}
                                            </small>
                                        )}
                                        {continuation && <small>{continuation}</small>}
                                    </span>
                                    <ChevronRight className="teacher-row-chevron" size={17} aria-hidden="true" />
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <Empty>Aucune séance ce jour.</Empty>
            )}
        </>
    );
}

export function TeacherAcademicCalendar({ events = [] }: { events?: TeacherCalendarEvent[] }) {
    if (!events.length) return null;

    return (
        <TeacherPanel id="teacher-calendar" title="Calendrier académique" icon={CalendarDays}>
            <ul className="teacher-list" role="list">
                {events.map((event) => (
                    <li key={event.id} className="teacher-row">
                        <span className="teacher-symbol">
                            <CalendarDays size={17} aria-hidden="true" />
                        </span>
                        <span className="teacher-row-copy">
                            <strong>{event.title}</strong>
                            <small>{event.category_label}</small>
                            <small>
                                {event.start_date === event.end_date ? (
                                    <time dateTime={event.start_date}>{dateLabel(event.start_date)}</time>
                                ) : (
                                    <>
                                        Du <time dateTime={event.start_date}>{dateLabel(event.start_date)}</time> au{' '}
                                        <time dateTime={event.end_date}>{dateLabel(event.end_date)}</time>
                                    </>
                                )}
                            </small>
                        </span>
                    </li>
                ))}
            </ul>
        </TeacherPanel>
    );
}

function QuickActions({ data, onAnnounce }: { data: TeacherOverview; onAnnounce?: () => void }) {
    const actions = [
        { href: data.links.create_assessment, title: 'Créer une évaluation', icon: Plus, tone: 'mint' },
        { href: data.links.publish_resource, title: 'Publier un support', icon: Upload, tone: 'gold' },
        { href: data.links.grades, title: 'Gérer les notes', icon: ClipboardCheck, tone: 'plum' },
        { href: onAnnounce ? null : data.links.students, title: 'Voir mes étudiants', icon: UsersRound, tone: 'olive' },
    ];
    return (
        <TeacherPanel id="teacher-actions" title="Actions rapides" icon={Zap}>
            {onAnnounce || actions.some(({ href }) => href) ? (
                <div className="teacher-actions">
                    {actions.map(({ href, title, icon: Icon, tone }) =>
                        href ? (
                            <Link href={href} key={title}>
                                <span className="teacher-symbol" data-tone={tone}>
                                    <Icon size={20} aria-hidden="true" />
                                </span>
                                <span>{title}</span>
                                <ArrowUpRight size={15} className="teacher-action-arrow" aria-hidden="true" />
                            </Link>
                        ) : null,
                    )}
                    {onAnnounce && (
                        <button type="button" onClick={onAnnounce}>
                            <span className="teacher-symbol" data-tone="olive">
                                <Megaphone size={20} aria-hidden="true" />
                            </span>
                            <span>Envoyer une annonce</span>
                            <ArrowUpRight size={15} className="teacher-action-arrow" aria-hidden="true" />
                        </button>
                    )}
                </div>
            ) : (
                <Empty>Les actions s’affichent selon vos affectations et vos droits.</Empty>
            )}
        </TeacherPanel>
    );
}

function Evaluations({ data }: { data: TeacherOverview }) {
    return (
        <TeacherPanel id="teacher-evaluations" title="Évaluations en cours" icon={ClipboardCheck} more={data.links.assessments}>
            {data.evaluations.length ? (
                <ul className="teacher-list teacher-compact-list">
                    {data.evaluations.map((evaluation) => (
                        <li key={evaluation.id}>
                            <Link className="teacher-row" href={evaluation.url}>
                                <span className="teacher-symbol" data-tone="plum">
                                    <FileText size={18} aria-hidden="true" />
                                </span>
                                <span className="teacher-row-copy">
                                    <strong>{evaluation.title}</strong>
                                    <small>
                                        {[evaluation.course, evaluation.closes_at && `Échéance le ${displayDate(evaluation.closes_at)}`]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </small>
                                </span>
                                <ChevronRight className="teacher-row-chevron" size={17} aria-hidden="true" />
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : (
                <Empty>Aucune évaluation active sur cette période.</Empty>
            )}
        </TeacherPanel>
    );
}

function Submissions({ data }: { data: TeacherOverview }) {
    return (
        <TeacherPanel id="teacher-submissions" title="Dernières soumissions" icon={Upload} more={data.links.grades}>
            {data.submissions.length ? (
                <ul className="teacher-list teacher-compact-list">
                    {data.submissions.map((submission) => (
                        <li key={submission.id}>
                            <Link className="teacher-row" href={submission.url}>
                                <span className="teacher-symbol teacher-submission-avatar" data-tone="mint" aria-hidden="true">
                                    {submission.name
                                        .trim()
                                        .split(/\s+/)
                                        .slice(0, 2)
                                        .map((word) => word[0])
                                        .join('')
                                        .toUpperCase()}
                                </span>
                                <span className="teacher-row-copy">
                                    <strong>{submission.name}</strong>
                                    <small>{[submission.title, submission.course].filter(Boolean).join(' · ')}</small>
                                </span>
                                <time className="teacher-row-date" dateTime={submission.submitted_at}>
                                    {displayDate(submission.submitted_at)}
                                </time>
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : (
                <Empty>Aucun travail remis récemment.</Empty>
            )}
        </TeacherPanel>
    );
}

const activityStyles = {
    resource: { icon: Upload, tone: 'gold' },
    assessment: { icon: ClipboardCheck, tone: 'plum' },
    submission: { icon: FileText, tone: 'mint' },
    grade: { icon: GraduationCap, tone: 'olive' },
};

function Activities({ data }: { data: TeacherOverview }) {
    return (
        <TeacherPanel id="teacher-activity" title="Dernières activités" icon={Clock3}>
            {data.activities.length ? (
                <ul className="teacher-list teacher-compact-list">
                    {data.activities.map((activity) => {
                        const { icon: Icon, tone } = activityStyles[activity.kind];
                        return (
                            <li key={activity.id}>
                                <Link className="teacher-row" href={activity.url}>
                                    <span className="teacher-symbol" data-tone={tone}>
                                        <Icon size={18} aria-hidden="true" />
                                    </span>
                                    <span className="teacher-row-copy">
                                        <strong>{activity.title}</strong>
                                        <small>{activity.detail}</small>
                                    </span>
                                    <time className="teacher-row-date" dateTime={activity.date}>
                                        {displayDate(activity.date)}
                                    </time>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <Empty>Aucune activité récente sur cette période.</Empty>
            )}
        </TeacherPanel>
    );
}

function AnnouncementRows({ items }: { items: TeacherAnnouncement[] }) {
    return (
        <ul className="teacher-list teacher-compact-list">
            {items.map((item) => (
                <li key={item.id}>
                    <Link className="teacher-row" href={item.url}>
                        <span className="teacher-symbol" data-tone="gold">
                            <Megaphone size={18} aria-hidden="true" />
                        </span>
                        <span className="teacher-row-copy">
                            <strong>{item.title}</strong>
                            <small>{[item.course || item.faculty, item.group].filter(Boolean).join(' · ') || 'Annonce de cours'}</small>
                        </span>
                        <time className="teacher-row-date" dateTime={item.date}>
                            {displayDate(item.date)}
                        </time>
                    </Link>
                </li>
            ))}
        </ul>
    );
}

export function TeacherAnnouncements({ data, full = false, onAnnounce }: { data: TeacherOverview; full?: boolean; onAnnounce?: () => void }) {
    const selected = data.selected_announcement;
    const [featured, ...others] = data.announcements;
    return (
        <TeacherPanel
            id="teacher-announcements"
            title="Annonces de mes cours"
            icon={Megaphone}
            more={full ? null : data.links.announcements}
            action={
                full && onAnnounce ? (
                    <button className="teacher-compose-button" type="button" onClick={onAnnounce}>
                        <Plus size={17} aria-hidden="true" /> Envoyer une annonce
                    </button>
                ) : undefined
            }
        >
            {full && selected && (
                <article className="teacher-announcement-detail">
                    <h3>{selected.title}</h3>
                    <p>{[selected.course, selected.group, selected.author, displayDate(selected.date)].filter(Boolean).join(' · ')}</p>
                    {selected.body && <p className="teacher-announcement-text">{selected.body}</p>}
                </article>
            )}
            {featured ? (
                full ? (
                    <>
                        <AnnouncementRows items={data.announcement_page?.data ?? data.announcements} />
                        <Pagination value={data.announcement_page} preserveScroll={false} />
                    </>
                ) : (
                    <>
                        <Link href={featured.url} className="teacher-announcement-feature">
                            <span>
                                <Megaphone size={16} aria-hidden="true" /> {featured.faculty || 'Annonce de cours'}
                            </span>
                            <strong>{featured.title}</strong>
                            <time dateTime={featured.date}>{displayDate(featured.date)}</time>
                            <ArrowUpRight size={19} className="teacher-feature-arrow" aria-hidden="true" />
                        </Link>
                        {others.length > 0 && <AnnouncementRows items={others} />}
                    </>
                )
            ) : (
                <Empty>Aucune annonce publiée pour vos cours sur cette période.</Empty>
            )}
        </TeacherPanel>
    );
}

export function TeacherHome({ data, onAnnounce }: { data: TeacherOverview; onAnnounce?: () => void }) {
    return (
        <>
            <TeacherStats data={data} />
            <div className="teacher-home-grid">
                <div className="teacher-home-main">
                    <TeacherPanel id="teacher-schedule" title="Mon emploi du temps" icon={CalendarDays} more={data.links.schedule}>
                        <TeacherTimetable data={data} view="home" />
                    </TeacherPanel>
                    <TeacherAcademicCalendar events={data.calendar_events} />
                    <TeacherPanel id="teacher-courses" title="Mes cours" icon={BookOpen} more={data.links.courses}>
                        <TeacherCourseRows courses={data.courses} />
                    </TeacherPanel>
                    <Evaluations data={data} />
                    <Submissions data={data} />
                    <Activities data={data} />
                </div>
                <div className="teacher-home-side">
                    <QuickActions data={data} onAnnounce={onAnnounce} />
                    <TeacherAnnouncements data={data} />
                </div>
            </div>
        </>
    );
}
