import { layoutDay, type CalendarSegment } from '@/lib/scheduleCalendar';
import { addDays, dateLabel, localDate, zone } from '@/lib/scheduleDates';
import { Link, router } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowUpRight,
    BookOpen,
    CalendarCheck,
    CalendarDays,
    CalendarSearch,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    FileText,
    List,
    MapPin,
    UserRound,
} from 'lucide-react';
import { useId, useState } from 'react';
import '../../../css/student-schedule.css';
import { studentHref, studentScheduledCourseHref, studentScheduleHref, type ScheduleView } from './navigation';
import ScheduleExamPeriods from './ScheduleExamPeriods';
import { StudentYearSelect, type StudentChromeData } from './StudentChrome';
import type { Academic, PortalProps, Session } from './types';

type DateGroup = { date: string; sessions: CalendarSegment<Session>[] };

const views = [
    { id: 'week', label: 'Semaine', icon: CalendarDays },
    { id: 'list', label: 'Liste', icon: List },
    { id: 'exams', label: 'Examens', icon: ClipboardList },
] as const;
const weekdayFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: zone, weekday: 'short' });
const weekFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: zone, day: 'numeric', month: 'short', year: 'numeric' });
const toDate = (date: string) => new Date(`${date}T12:00:00Z`);
const slotTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.floor(minutes % 60)).padStart(2, '0')}`;
const sessionKinds: Record<string, string> = {
    CM: 'Cours magistral',
    CMI: 'Cours magistral interactif',
    TD: 'Travaux dirigés',
    TP: 'Travaux pratiques',
};

function weekNumber(monday: string) {
    const thursday = toDate(addDays(monday, 3));
    const firstDay = Date.UTC(thursday.getUTCFullYear(), 0, 1, 12);
    return Math.floor((thursday.getTime() - firstDay) / (7 * 86400000)) + 1;
}

function examSession(session: Session) {
    const kind =
        session.activity_type
            ?.normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z]+/g, ' ') ?? '';
    return /\b(?:exam|examen|examens|rattrapage|rattrapages|epreuve|epreuves|evaluation|evaluations)\b/.test(kind);
}

function listSessions(days: DateGroup[], onlyExams = false): DateGroup[] {
    const shown = new Set<number>();
    return days
        .map(({ date, sessions }) => ({
            date,
            sessions: sessions.filter(({ session }) => {
                if (shown.has(session.id) || (onlyExams && !examSession(session))) return false;
                shown.add(session.id);
                return true;
            }),
        }))
        .filter((group) => group.sessions.length > 0);
}

function ScheduleRows({
    day,
    hrefFor,
    focusedSessionId,
    courseHref,
    embedded = false,
}: {
    day: DateGroup;
    hrefFor?: (session: Session) => string | null;
    focusedSessionId?: number;
    courseHref?: (target: 'sessions' | 'supports', params?: Record<string, string | number>) => string;
    embedded?: boolean;
}) {
    const rowsId = useId();
    return (
        <ul className="student-agenda-rows" role="list">
            {day.sessions.map(({ session, start, end }) => {
                const href = hrefFor?.(session);
                const status = { cancelled: 'Annulée', rescheduled: 'Reportée' }[session.status ?? ''];
                const startDay = localDate(session.starts_at);
                const followingMidnight = `${addDays(day.date, 1)}T00:00:00+01:00`;
                const continues = end === 1440 && Date.parse(session.ends_at) > Date.parse(followingMidnight);
                const startedEarlier = start === 0 && startDay < day.date;
                const Icon = examSession(session) ? ClipboardList : BookOpen;
                const tone = (session.course_id ?? session.id) % 4;
                const timeId = `${rowsId}-${session.id}`;
                const activity = session.activity_type?.trim();
                const hours = (
                    <div className="student-agenda-hours" id={timeId}>
                        <time dateTime={startedEarlier ? `${day.date}T00:00:00+01:00` : session.starts_at}>{slotTime(start)}</time>
                        <span>
                            <span aria-hidden="true">– </span>
                            <span className="sr-only">à </span>
                            <time dateTime={continues ? followingMidnight : session.ends_at}>{slotTime(end)}</time>
                        </span>
                    </div>
                );
                const summary = (
                    <>
                        <span className="student-agenda-row-icon">
                            <Icon size={22} aria-hidden="true" />
                        </span>
                        <span className="student-agenda-row-info">
                            <strong>
                                {embedded ? (activity && (sessionKinds[activity.toUpperCase()] ?? activity)) || 'Séance' : session.course}
                            </strong>
                            {session.teacher && (
                                <span>
                                    <UserRound size={14} aria-hidden="true" /> {session.teacher}
                                </span>
                            )}
                            <span>
                                <MapPin size={14} aria-hidden="true" /> {session.location || session.room || 'Salle à préciser'}
                            </span>
                            {(status || startedEarlier || continues) && (
                                <span className="student-agenda-row-status">
                                    {[status, startedEarlier ? 'Commencée avant ce jour' : null, continues ? 'Se poursuit le lendemain' : null]
                                        .filter(Boolean)
                                        .join(' · ')}
                                </span>
                            )}
                        </span>
                        {href && <ChevronRight className="student-agenda-row-arrow" size={18} aria-hidden="true" />}
                    </>
                );

                return (
                    <li
                        key={session.id}
                        className="student-agenda-row"
                        data-tone={tone}
                        data-status={session.status}
                        data-focused={session.id === focusedSessionId ? '' : undefined}
                    >
                        {!embedded && hours}
                        <div className="student-agenda-row-card">
                            {embedded && hours}
                            {href ? (
                                <Link className="student-agenda-row-main" href={href} aria-describedby={timeId}>
                                    {summary}
                                </Link>
                            ) : (
                                <div className="student-agenda-row-main">{summary}</div>
                            )}
                            {session.resource_url && !hrefFor && (
                                <Link
                                    className="student-agenda-row-resource"
                                    href={courseHref?.('supports', { session: session.id }) ?? session.resource_url}
                                >
                                    <FileText size={14} aria-hidden="true" /> Ressources de la séance
                                    <ArrowUpRight size={14} aria-hidden="true" />
                                </Link>
                            )}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

export default function StudentSchedule({
    sessions,
    week,
    academic,
    promotion,
    courseId,
    calendarEvents = [],
    selectedDay,
    selectedView = 'week',
    absencesHref,
    canOpenCourse = true,
    yearContext,
    courseHref,
    focusedSessionId,
}: {
    promotion: Pick<Academic, 'level' | 'faculty' | 'year' | 'group'>;
    courseId?: number;
    calendarEvents?: PortalProps['calendar_events'];
    sessions: PortalProps['sessions'];
    week: string;
    academic: number;
    selectedDay?: string;
    selectedView?: ScheduleView;
    absencesHref?: string;
    canOpenCourse?: boolean;
    yearContext?: StudentChromeData | null;
    courseHref?: (target: 'sessions' | 'supports', params?: Record<string, string | number>) => string;
    focusedSessionId?: number;
}) {
    const today = localDate(new Date().toISOString());
    const datePickerId = useId();
    const [datePickerOpen, setDatePickerOpen] = useState(false);
    const [courseView, setCourseView] = useState<'week' | 'list'>('week');
    const dayOptions = Array.from({ length: 7 }, (_, index) => addDays(week, index));
    const day = selectedDay && dayOptions.includes(selectedDay) ? selectedDay : dayOptions.includes(today) ? today : week;
    const dayIndex = dayOptions.indexOf(day);
    const groups = dayOptions.map((date) => ({ date, sessions: layoutDay(sessions, date) }));
    const view = courseId ? courseView : selectedView;
    const weekList = view === 'week' ? [] : listSessions(groups, view === 'exams');
    const visibleExams = view === 'week' ? calendarEvents.filter((event) => event.start_date <= day && day <= event.end_date) : calendarEvents;
    const current = yearContext?.options.find((option) => option.id === academic);
    const semesters = [...new Set(sessions.map((session) => session.semester).filter(Boolean))];
    const semester = semesters.length === 1 ? semesters[0] : null;
    const semesterLabel = semester === '1' ? '1er semestre' : semester === '2' ? '2e semestre' : semester;
    const subtitle = [promotion.level, semesterLabel, promotion.group, promotion.year].filter(Boolean).join(' · ');

    function hrefFor(weekDate: string, selected: string, nextView: ScheduleView) {
        if (courseId) {
            return (
                courseHref?.('sessions', { week: weekDate, day: selected }) ??
                `${studentHref(`courses/${courseId}/sessions`, academic)}&week=${weekDate}&day=${selected}`
            );
        }
        return studentScheduleHref(academic, weekDate, selected, nextView);
    }

    const courseLink = (session: Session, date: string) =>
        canOpenCourse ? studentScheduledCourseHref(session, academic, 'schedule', week, view === 'week' ? date : day, view) : null;

    const datePicker = (
        <form
            id={datePickerId}
            className="student-agenda-date-picker"
            onSubmit={(event) => {
                event.preventDefault();
                const date = new FormData(event.currentTarget).get('date');
                if (typeof date !== 'string' || !date) return;
                setDatePickerOpen(false);
                router.visit(hrefFor(date, date, view), { preserveState: Boolean(courseId), preserveScroll: Boolean(courseId) });
            }}
        >
            <label htmlFor={`${datePickerId}-input`}>Choisir une date</label>
            <input key={day} id={`${datePickerId}-input`} name="date" type="date" defaultValue={day} required />
            <button type="submit">Afficher</button>
            <Link href={hrefFor(today, today, view)} preserveState={Boolean(courseId)} onClick={() => setDatePickerOpen(false)}>
                Aujourd’hui
            </Link>
        </form>
    );
    const weekNavigation = (
        <div className="student-agenda-week">
            <Link
                href={hrefFor(addDays(week, -7), addDays(day, -7), view)}
                aria-label="Semaine précédente"
                preserveScroll
                preserveState={Boolean(courseId)}
            >
                <ChevronLeft size={21} aria-hidden="true" />
            </Link>
            <strong>
                <span>Sem. {weekNumber(week)} · </span>
                {weekFormat.formatRange(toDate(week), toDate(dayOptions[6]))}
            </strong>
            <Link
                href={hrefFor(addDays(week, 7), addDays(day, 7), view)}
                aria-label="Semaine suivante"
                preserveScroll
                preserveState={Boolean(courseId)}
            >
                <ChevronRight size={21} aria-hidden="true" />
            </Link>
        </div>
    );

    return (
        <div className="student-agenda" data-embedded={courseId ? '' : undefined}>
            {!courseId && (
                <header className="student-agenda-header" data-year-state={current && !current.is_current ? 'archive' : 'current'}>
                    <Link
                        href={studentHref('overview', academic, 'home-schedule')}
                        className="student-agenda-header-action"
                        aria-label="Retour à l’accueil"
                    >
                        <ArrowLeft size={23} aria-hidden="true" />
                    </Link>
                    <div className="student-agenda-heading">
                        <h1>Emploi du temps</h1>
                        {yearContext && yearContext.options.length > 1 ? (
                            <label className="student-agenda-year">
                                <span aria-hidden="true">{subtitle}</span>
                                <ChevronDown size={13} aria-hidden="true" />
                                <StudentYearSelect context={yearContext} section="schedule" />
                            </label>
                        ) : (
                            <p>{subtitle}</p>
                        )}
                    </div>
                    <button
                        className="student-agenda-header-action"
                        type="button"
                        aria-label="Choisir une date"
                        aria-expanded={datePickerOpen}
                        aria-controls={datePickerOpen ? datePickerId : undefined}
                        onClick={() => setDatePickerOpen((open) => !open)}
                    >
                        <CalendarDays size={23} aria-hidden="true" />
                    </button>
                </header>
            )}
            <div className="student-agenda-body">
                {courseId ? (
                    <>
                        <div className="student-agenda-course-heading">
                            <h2>
                                <CalendarDays size={19} aria-hidden="true" /> Séances du cours
                            </h2>
                            <button
                                type="button"
                                aria-label="Choisir une date"
                                title="Choisir une date"
                                aria-expanded={datePickerOpen}
                                aria-controls={datePickerOpen ? datePickerId : undefined}
                                onClick={() => setDatePickerOpen((open) => !open)}
                            >
                                <CalendarSearch size={18} aria-hidden="true" />
                            </button>
                        </div>
                        <div className="student-agenda-course-controls">
                            {weekNavigation}
                            <div className="student-agenda-views" role="group" aria-label="Vues des séances">
                                <button type="button" aria-pressed={view === 'week'} onClick={() => setCourseView('week')}>
                                    Jour
                                </button>
                                <button type="button" aria-pressed={view === 'list'} onClick={() => setCourseView('list')}>
                                    Semaine
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <nav className="student-agenda-views" aria-label="Vues de l’emploi du temps">
                            {views.map(({ id, label, icon: Icon }) => (
                                <Link key={id} href={hrefFor(week, day, id)} aria-current={id === view ? 'page' : undefined} preserveScroll>
                                    <Icon size={18} aria-hidden="true" /> {label}
                                </Link>
                            ))}
                        </nav>
                        {weekNavigation}
                    </>
                )}
                {datePickerOpen && datePicker}
                {view === 'week' && (
                    <nav className="student-agenda-days" aria-label="Jours de la semaine">
                        {groups.map((group) => {
                            const { date } = group;
                            const active = day === date;
                            const hasEvents =
                                group.sessions.length > 0 || calendarEvents.some((event) => event.start_date <= date && date <= event.end_date);
                            const content = (
                                <>
                                    <span>{weekdayFormat.format(toDate(date)).replace('.', '')}</span>
                                    <strong>{Number(date.slice(-2))}</strong>
                                    {hasEvents && <i aria-hidden="true" />}
                                </>
                            );
                            const label = [dateLabel(date), date === today ? 'aujourd’hui' : null, hasEvents ? 'horaire publié' : null]
                                .filter(Boolean)
                                .join(', ');
                            return (
                                <Link
                                    key={date}
                                    href={hrefFor(week, date, view)}
                                    aria-current={active ? 'date' : undefined}
                                    aria-label={label}
                                    preserveScroll
                                    preserveState={Boolean(courseId)}
                                >
                                    {content}
                                </Link>
                            );
                        })}
                    </nav>
                )}
                {view === 'week' && (
                    <section className="student-agenda-day" aria-label={dateLabel(day)}>
                        <ScheduleExamPeriods events={visibleExams} />
                        {groups[dayIndex].sessions.length > 0 ? (
                            <ScheduleRows
                                day={groups[dayIndex]}
                                hrefFor={courseId ? undefined : (session) => courseLink(session, day)}
                                courseHref={courseHref}
                                focusedSessionId={focusedSessionId}
                                embedded={Boolean(courseId)}
                            />
                        ) : (
                            !visibleExams.length && <p className="student-agenda-empty">Aucune séance prévue ce jour.</p>
                        )}
                    </section>
                )}
                {view !== 'week' && (
                    <section className="student-agenda-week-list" aria-label={view === 'exams' ? 'Examens de la semaine' : 'Séances de la semaine'}>
                        <ScheduleExamPeriods events={visibleExams} />
                        {weekList.length > 0
                            ? weekList.map((group) => (
                                  <section key={group.date} className="student-agenda-day">
                                      <h2>{dateLabel(group.date)}</h2>
                                      <ScheduleRows
                                          day={group}
                                          hrefFor={courseId ? undefined : (session) => courseLink(session, group.date)}
                                          courseHref={courseHref}
                                          focusedSessionId={focusedSessionId}
                                          embedded={Boolean(courseId)}
                                      />
                                  </section>
                              ))
                            : !visibleExams.length && (
                                  <p className="student-agenda-empty">
                                      {view === 'exams' ? 'Aucun examen ni rattrapage prévu cette semaine.' : 'Aucune séance prévue cette semaine.'}
                                  </p>
                              )}
                    </section>
                )}
                <footer className="student-agenda-footer">
                    <small>Heure de Kinshasa (UTC+1)</small>
                    {absencesHref && (
                        <Link href={absencesHref}>
                            <CalendarCheck size={16} aria-hidden="true" /> Consulter et justifier mes absences
                        </Link>
                    )}
                </footer>
            </div>
        </div>
    );
}
