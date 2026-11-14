import Pagination from '@/components/admin/Pagination';
import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import DesktopCourseInfo from '@/components/student/DesktopCourseInfo';
import { studentScheduleHref, type ScheduleView } from '@/components/student/navigation';
import { studentChromeHref } from '@/components/student/StudentChrome';
import StudentSchedule from '@/components/student/StudentSchedule';
import type { Permission, PortalProps } from '@/components/student/types';
import { dateLabel, localDate, time } from '@/lib/scheduleDates';
import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowUpRight,
    BookOpen,
    CalendarDays,
    ChevronRight,
    ClipboardCheck,
    Download,
    Files,
    GraduationCap,
    Info,
    Layers,
    LockKeyhole,
    MapPin,
    UserRound,
} from 'lucide-react';
import '../../../../css/student-course-desktop.css';
import '../../../../css/student-course.css';
import '../../../../css/student-portal.css';

type Attendance = { id: number; starts_at: string; ends_at: string; room: string | null; status: string | null };
type FocusedSession = {
    id: number;
    starts_at: string;
    ends_at: string;
    room: string | null;
    location?: string | null;
    teacher: string | null;
    activity_type: string | null;
    status: 'published' | 'cancelled' | 'rescheduled';
    has_resources?: boolean;
};
type AttendanceSummary = { rate: number | null; recorded: number; attended: number };
type CourseLink = (target: string, params?: Record<string, string | number>) => string;
type Resource = {
    id: number;
    title: string;
    body: string | null;
    kind?: string;
    section?: string | null;
    session_date?: string | null;
    work_title?: string | null;
    preview_url?: string | null;
    url: string | null;
    download_url: string | null;
    work_url: string | null;
    filename: string | null;
    opens_at: string | null;
    closes_at: string | null;
};
type Props = {
    section: string;
    registered?: boolean;
    academic: { id: number; level: string; faculty: string; year: string; group: string | null };
    course: {
        id: number;
        title: string;
        teacher?: string | null;
        code: string | null;
        description: string | null;
        credits: number | null;
        coefficient?: number | null;
        unit?: string;
        unit_code?: string | null;
        unit_is_composite?: boolean;
        is_optional?: boolean;
        semester: number | string | null;
        cmi_hours: number | null;
        td_hours: number | null;
        tp_hours: number | null;
        pedagogical_content: string | null;
    };
    organization: {
        id: number;
        teacher: string | null;
        assistant: string | null;
        instructors?: string[];
        leader: string | null;
        group: string | null;
        delivery_mode: string;
    }[];
    permissions: Record<string, Permission>;
    resources: Resource[];
    resource_filters?: { q: string; session: number | null; session_date: string | null };
    resource_pagination?: { links: { url: string | null; label: string; active: boolean }[] } | null;
    week: string;
    sessions: PortalProps['sessions'];
    attendance: { data: Attendance[]; links: { url: string | null; label: string; active: boolean }[] } | null;
    attendance_stats: Record<string, number>;
    attendance_summary?: AttendanceSummary | null;
    focused_session?: FocusedSession | null;
    period: { start_date: string | null; end_date: string | null } | null;
};
const supportFilters = [
    { id: 'supports', label: 'Tous' },
    { id: 'files', label: 'Fichiers' },
    { id: 'online', label: 'Cours en ligne' },
    { id: 'videos', label: 'Vidéos' },
];
const supportSections = supportFilters.map(({ id }) => id);
const resourceKinds: Record<string, string> = {
    material: 'Fichier',
    syllabus: 'Syllabus',
    online: 'Cours en ligne',
    audio: 'Audio',
    video: 'Vidéo',
};
const tabs = [
    { id: 'infos', label: 'Informations', icon: Info, activeSections: ['infos'], tone: 'mint' },
    { id: 'sessions', label: 'Séances', icon: CalendarDays, activeSections: ['sessions', 'attendance'], tone: 'sky' },
    { id: 'supports', label: 'Ressources', icon: Files, activeSections: supportSections, tone: 'lilac' },
];
const statuses: Record<string, string> = { present: 'Présent', absent: 'Absent', late: 'En retard', excused: 'Excusé' };
const activityLabels: Record<string, string> = {
    cm: 'Cours magistral',
    cmi: 'Cours magistral interactif',
    td: 'Travaux dirigés',
    tp: 'Travaux pratiques',
};
const scheduleOrigins: ScheduleView[] = ['week', 'list', 'exams'];

function scheduleDate(value: string | null) {
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function courseOrigin(query: URLSearchParams, academic: number) {
    const source = query.get('from');
    if (source === 'overview')
        return { url: `${studentChromeHref('overview', academic)}#home-schedule`, label: 'Horaire du jour', back: 'Retour à l’horaire du jour' };
    if (source === 'schedule') {
        const view = scheduleOrigins.find((name) => name === query.get('return_view'));
        return {
            url: studentScheduleHref(academic, scheduleDate(query.get('return_week')), scheduleDate(query.get('return_day')), view),
            label: 'Emploi du temps',
            back: 'Retour à l’emploi du temps',
        };
    }
    return { url: studentChromeHref('courses', academic), label: 'Mes cours', back: 'Retour à mes cours' };
}

function CourseQuickInfo({
    course,
    organization,
    focused,
    href,
    sessionsHref,
}: {
    course: Props['course'];
    organization: Props['organization'];
    focused?: FocusedSession | null;
    href: CourseLink;
    sessionsHref: string | null;
}) {
    const teachers = [...new Set(organization.map(({ teacher }) => teacher?.trim()).filter(Boolean))];
    const teacher = focused?.teacher?.trim() || teachers.join(', ') || course.teacher?.trim();
    const activity = focused?.activity_type?.trim();
    const type = activity ? (activityLabels[activity.toLocaleLowerCase('fr')] ?? activity) : null;
    const rows = [
        { label: 'Enseignant', icon: UserRound, value: teacher ?? 'À confirmer' },
        {
            label: 'Créneau',
            icon: CalendarDays,
            value: focused ? (
                <>
                    <span>{dateLabel(localDate(focused.starts_at))}</span>
                    <small>
                        {time(focused.starts_at)}–{time(focused.ends_at)} · Kinshasa
                    </small>
                </>
            ) : sessionsHref ? (
                <Link href={sessionsHref}>
                    Voir les séances <ChevronRight size={14} aria-hidden="true" />
                </Link>
            ) : (
                'Non renseigné'
            ),
        },
        { label: 'Localisation', icon: MapPin, value: focused?.location || focused?.room || 'À préciser' },
        { label: 'Crédits', icon: Layers, value: course.credits ?? 'Non renseignés', mobileOnly: true },
        { label: 'Type de séance', icon: GraduationCap, value: type ? <span className="course-activity-type">{type}</span> : 'Non renseigné' },
    ];

    return (
        <div className="course-quick-info">
            {focused && focused.status !== 'published' && (
                <p className="course-session-note">{focused.status === 'rescheduled' ? 'Séance reportée' : 'Séance annulée'}</p>
            )}
            <dl className="course-facts" aria-label="Informations du cours">
                {rows.map(({ label, icon: Icon, value, mobileOnly }) => (
                    <div key={label} className={mobileOnly ? 'course-mobile-fact' : undefined}>
                        <dt>
                            <Icon size={19} aria-hidden="true" /> {label}
                        </dt>
                        <dd>{value}</dd>
                    </div>
                ))}
            </dl>
            {course.description?.trim() && (
                <section className="course-description" aria-labelledby="course-description-heading">
                    <Info size={21} aria-hidden="true" />
                    <div>
                        <h2 id="course-description-heading">Description</h2>
                        <p>{course.description}</p>
                    </div>
                </section>
            )}
            {focused?.has_resources && (
                <Link className="course-session-resource" href={href('supports', { session: focused.id })}>
                    <Files size={17} aria-hidden="true" /> Ressources de cette séance <ChevronRight size={16} aria-hidden="true" />
                </Link>
            )}
        </div>
    );
}

function CourseAttendanceSummary({ summary, attendanceHref }: { summary: AttendanceSummary | null; attendanceHref?: string }) {
    const rate = summary?.rate ?? null;
    return (
        <section className="course-attendance-summary" aria-labelledby="course-attendance-heading">
            <span className="course-attendance-icon">
                <ClipboardCheck size={23} aria-hidden="true" />
            </span>
            <div className="course-attendance-details">
                <h2 id="course-attendance-heading">Taux de présence</h2>
                <p>
                    {summary && rate !== null ? (
                        <>
                            <strong>{rate.toLocaleString('fr-CD')} %</strong> · {summary.attended} présence{summary.attended > 1 ? 's' : ''} sur{' '}
                            {summary.recorded} séance{summary.recorded === 1 ? ' comptabilisée' : 's comptabilisées'}
                        </>
                    ) : (
                        'Aucun taux disponible pour ce cours.'
                    )}
                </p>
                {rate !== null && <progress max={100} value={rate} aria-label="Taux de présence, retards inclus" />}
            </div>
            {attendanceHref && (
                <Link href={attendanceHref}>
                    Mes présences <ChevronRight size={16} aria-hidden="true" />
                </Link>
            )}
        </section>
    );
}

export default function StudentCourse(props: Props) {
    const { course, academic, section, organization, permissions, attendance_stats: stats } = props;
    const query = new URLSearchParams(usePage().url.split('?')[1]?.split('#')[0]);
    const base = `/app/dashboard/student/courses/${course.id}`;
    const origin = courseOrigin(query, academic.id);
    const navigationParams: Record<string, string | number> = { academic: academic.id };
    for (const key of ['from', 'return_week', 'return_day', 'return_view', 'focus_session', 'week', 'day']) {
        const value = query.get(key);
        if (value) navigationParams[key] = value;
    }
    const href: CourseLink = (target, params) => {
        const next = { ...navigationParams, ...params };
        return `${base}/${target}?${new URLSearchParams(Object.entries(next).map(([name, value]) => [name, String(value)]))}`;
    };
    const selectedScheduleDay = query.get('return_view') === 'week' ? scheduleDate(query.get('return_day')) : undefined;
    const focusedDay = props.focused_session ? localDate(props.focused_session.starts_at) : undefined;
    const sessionDay = scheduleDate(query.get('day')) ?? selectedScheduleDay ?? focusedDay;
    const sessionsHref = href('sessions', {
        week: scheduleDate(query.get('week')) ?? sessionDay ?? props.week,
        ...(sessionDay ? { day: sessionDay } : {}),
        ...(props.focused_session ? { focus_session: props.focused_session.id } : {}),
    });
    const attendanceHref = href('attendance');
    const showSupports = supportSections.includes(section);
    const sessionFilter = props.resource_filters?.session;
    const canSeeSessions = permissions.schedule_view?.allowed === true;
    const canDownload = permissions.materials_download?.allowed === true;
    const semester = String(course.semester ?? '').trim();
    const semesterLabel = semester === '1' ? '1er semestre' : semester === '2' ? '2e semestre' : semester;
    const title = tabs.find(({ activeSections }) => activeSections.includes(section))?.label ?? 'Évaluations';
    const evaluationLink = permissions.evaluations_participate?.allowed && (
        <nav className="course-secondary-links" aria-label="Suivi du cours">
            <Link href={href('evaluations')} aria-current={section === 'evaluations' ? 'page' : undefined}>
                <ClipboardCheck size={17} aria-hidden="true" /> Évaluations
            </Link>
        </nav>
    );

    return (
        <Dashboard>
            <Head title={`${course.title} · ${title}`} />
            <div className={`student-portal student-course-page is-${section}`}>
                <header className="course-heading">
                    <div className="course-heading-bar">
                        <Link href={origin.url} className="course-back" aria-label={origin.back}>
                            <ArrowLeft size={20} aria-hidden="true" /> <span>{origin.label}</span>
                        </Link>
                        <p>Détails du cours</p>
                    </div>
                    <div className="course-hero">
                        <span className="course-hero-icon">
                            <BookOpen size={25} aria-hidden="true" />
                        </span>
                        <div>
                            {(course.code || semesterLabel) && (
                                <p className="course-hero-meta">{[course.code, semesterLabel].filter(Boolean).join(' · ')}</p>
                            )}
                            <h1>{course.title}</h1>
                            <p>{[academic.level, academic.group, academic.year].filter(Boolean).join(' · ')}</p>
                            {course.unit_is_composite && (
                                <p className="course-hero-unit">
                                    <Layers size={16} aria-hidden="true" />
                                    <span>
                                        <strong>UE composée</strong> · {course.unit || course.unit_code}
                                        {course.is_optional === true && ' · Cours optionnel'}
                                    </span>
                                </p>
                            )}
                        </div>
                    </div>
                </header>
                <nav className="course-shortcuts" aria-label="Rubriques du cours">
                    {tabs.map(({ id, label, icon: Icon, activeSections, tone }) => {
                        const icon = (
                            <span className="student-shortcut-icon" data-color={tone}>
                                <Icon size={21} aria-hidden="true" />
                            </span>
                        );
                        const content = (
                            <>
                                {icon}
                                <strong>{label}</strong>
                            </>
                        );
                        if (id === 'sessions' && !canSeeSessions) {
                            return (
                                <span key={id} aria-disabled="true">
                                    {content}
                                    <LockKeyhole size={13} aria-label="Accès indisponible" />
                                </span>
                            );
                        }
                        const current = activeSections.includes(section) ? (id === section ? 'page' : 'location') : undefined;
                        return (
                            <Link key={id} href={id === 'sessions' ? sessionsHref : href(id)} aria-current={current}>
                                {content}
                            </Link>
                        );
                    })}
                </nav>
                {!canSeeSessions && permissions.schedule_view?.visible !== false && (
                    <p className="course-access-note">
                        {permissions.schedule_view?.reason || 'Les séances sont indisponibles pour cette inscription.'}
                    </p>
                )}
                {section === 'infos' && (
                    <CourseQuickInfo
                        course={course}
                        organization={organization}
                        focused={props.focused_session}
                        href={href}
                        sessionsHref={canSeeSessions ? sessionsHref : null}
                    />
                )}
                {section !== 'sessions' && evaluationLink}
                {section === 'infos' && (
                    <DesktopCourseInfo
                        course={course}
                        registered={props.registered}
                        academic={academic}
                        organization={organization}
                        period={props.period}
                        stats={stats}
                        attendanceHref={canSeeSessions ? attendanceHref : null}
                        descriptionInSummary
                    />
                )}
                {section === 'sessions' && (
                    <div className="course-sessions-layout">
                        <CourseAttendanceSummary summary={props.attendance_summary ?? null} attendanceHref={attendanceHref} />
                        <StudentSchedule
                            key={course.id}
                            sessions={props.sessions}
                            week={props.week}
                            academic={academic.id}
                            promotion={academic}
                            courseId={course.id}
                            courseHref={href}
                            focusedSessionId={props.focused_session?.id}
                            selectedDay={sessionDay}
                        />
                        {evaluationLink}
                    </div>
                )}
                {section === 'attendance' && (
                    <>
                        <CourseAttendanceSummary summary={props.attendance_summary ?? null} />
                        <section className="course-content">
                            <h2>Mes présences par séance</h2>
                            <Link href={studentChromeHref('absences', academic.id)}>Consulter et justifier mes absences</Link>
                            <div className="course-attendance-stats">
                                {Object.entries(statuses).map(([key, label]) => (
                                    <span key={key}>
                                        {label} : <strong>{stats[key] ?? 0}</strong>
                                    </span>
                                ))}
                            </div>
                            {props.attendance?.data.length ? (
                                <>
                                    <div className="course-attendance-list">
                                        {props.attendance.data.map((item) => (
                                            <article key={item.id}>
                                                <div>
                                                    <strong>{dateLabel(localDate(item.starts_at))}</strong>
                                                    <p>
                                                        {time(item.starts_at)}–{time(item.ends_at)} · {item.room}
                                                    </p>
                                                </div>
                                                <span className={`attendance-status is-${item.status ?? 'pending'}`}>
                                                    {item.status ? statuses[item.status] : 'Non renseigné'}
                                                </span>
                                            </article>
                                        ))}
                                    </div>
                                    <Pagination value={props.attendance} />
                                </>
                            ) : (
                                <p>Aucune séance passée publiée pour ce cours.</p>
                            )}
                        </section>
                    </>
                )}
                {(showSupports || section === 'evaluations') && (
                    <section className="course-content">
                        <h2>
                            {props.resource_filters?.session_date
                                ? `Ressources de la séance du ${dateLabel(localDate(props.resource_filters.session_date))}`
                                : title}
                        </h2>
                        {showSupports && !sessionFilter && (
                            <nav className="course-support-filters" aria-label="Types de supports">
                                {supportFilters
                                    .filter(({ id }) => id !== 'files' || canDownload)
                                    .map(({ id, label }) => (
                                        <Link
                                            key={id}
                                            href={href(id, props.resource_filters?.q ? { q: props.resource_filters.q } : undefined)}
                                            aria-current={section === id ? 'page' : undefined}
                                        >
                                            {label}
                                        </Link>
                                    ))}
                            </nav>
                        )}
                        {showSupports && sessionFilter && (
                            <Link className="course-back" href={href('supports')}>
                                <ArrowLeft size={16} aria-hidden="true" /> Tous les supports du cours
                            </Link>
                        )}
                        {showSupports && !canDownload && permissions.materials_download?.visible !== false && (
                            <p className="course-access-note">
                                {permissions.materials_download?.reason || 'Les fichiers sont indisponibles pour cette inscription.'}
                            </p>
                        )}
                        {showSupports && (
                            <form
                                key={`${section}-${sessionFilter ?? ''}-${props.resource_filters?.q ?? ''}`}
                                className="course-support-search"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    const q = String(new FormData(event.currentTarget).get('q') ?? '').trim();
                                    router.get(
                                        href(section, {
                                            ...(q ? { q } : {}),
                                            ...(props.resource_filters?.session ? { session: props.resource_filters.session } : {}),
                                        }),
                                    );
                                }}
                            >
                                <label>
                                    Rechercher par titre <input type="search" name="q" maxLength={180} defaultValue={props.resource_filters?.q} />
                                </label>
                                <button type="submit" className="portal-secondary">
                                    Rechercher
                                </button>
                            </form>
                        )}
                        {props.resources.length ? (
                            <div className="course-resource-list">
                                {props.resources.map((item, index, items) => (
                                    <div key={item.id}>
                                        {section !== 'evaluations' && (index === 0 || item.section !== items[index - 1].section) && (
                                            <h3>{item.section ?? 'Ressources générales'}</h3>
                                        )}
                                        <article>
                                            {showSupports && item.kind && resourceKinds[item.kind] && (
                                                <span className="course-resource-type">{resourceKinds[item.kind]}</span>
                                            )}
                                            <h4>{item.title}</h4>
                                            {item.body && <p style={{ whiteSpace: 'pre-wrap' }}>{item.body}</p>}
                                            {item.session_date && <p>Séance du {dateLabel(localDate(item.session_date))}</p>}
                                            {item.work_title && <p>Support associé à {item.work_title}</p>}
                                            {item.preview_url && item.kind === 'video' && (
                                                <video
                                                    aria-label={item.title}
                                                    controls
                                                    preload="none"
                                                    src={item.preview_url}
                                                    style={{ maxWidth: '100%' }}
                                                />
                                            )}
                                            {item.preview_url && item.kind === 'audio' && (
                                                <audio aria-label={item.title} controls preload="none" src={item.preview_url} />
                                            )}
                                            {item.closes_at && (
                                                <small>
                                                    Clôture : {dateLabel(localDate(item.closes_at))} à {time(item.closes_at)}
                                                </small>
                                            )}
                                            <div>
                                                {item.preview_url && !['video', 'audio'].includes(item.kind ?? '') && (
                                                    <a href={item.preview_url} target="_blank" rel="noopener noreferrer">
                                                        Consulter le fichier
                                                    </a>
                                                )}
                                                {item.download_url && (
                                                    <a href={item.download_url}>
                                                        <Download size={16} /> Télécharger {item.filename || 'le fichier'}
                                                    </a>
                                                )}
                                                {item.url && (
                                                    <a href={item.url} target="_blank" rel="noopener noreferrer">
                                                        {item.kind === 'video' ? 'Voir la vidéo externe' : 'Ouvrir le lien externe'}
                                                        <ArrowUpRight size={16} />
                                                    </a>
                                                )}
                                                {item.work_url && (
                                                    <Link href={item.work_url}>
                                                        Consulter les consignes et déposer mon travail
                                                        <ArrowUpRight size={16} />
                                                    </Link>
                                                )}
                                            </div>
                                        </article>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p>
                                {props.resource_filters?.q
                                    ? 'Aucun résultat pour cette recherche.'
                                    : showSupports
                                      ? 'Aucun support disponible dans cette rubrique.'
                                      : 'Aucune évaluation publiée pour ce cours.'}
                            </p>
                        )}
                        <Pagination value={props.resource_pagination} />
                    </section>
                )}
            </div>
        </Dashboard>
    );
}
