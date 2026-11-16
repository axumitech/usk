import Pagination from '@/components/admin/Pagination';
import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import { StudentYearSelect, type StudentChromeData } from '@/components/student/StudentChrome';
import { time, zone } from '@/lib/scheduleDates';
import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowUpRight,
    BarChart3,
    BookOpen,
    CalendarDays,
    Check,
    ChevronDown,
    ChevronRight,
    CircleHelp,
    ClipboardCheck,
    Clock3,
    FileCheck2,
    ListChecks,
    MapPin,
    ScanLine,
    SlidersHorizontal,
    X,
} from 'lucide-react';
import type { CSSProperties, FormEvent } from 'react';
import '../../../../css/student-attendance.css';

type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';
type StatusFilter = AttendanceStatus | 'pending';
type Summary = Record<AttendanceStatus, number> & { recorded: number; attended: number; rate: number | null };
type Course = { id: number; title: string; code: string | null };
type AttendanceRecord = {
    id: number;
    course_id: number;
    course: string;
    starts_at: string;
    ends_at: string;
    room: string | null;
    status: AttendanceStatus | null;
    checked_in_at: string | null;
    source: 'qr' | 'nfc' | 'manual' | null;
};

type Filters = { course: number | null; from: string | null; to: string | null; status: StatusFilter | null };

type Props = {
    studentChrome?: StudentChromeData | null;
    academic: { id: number; year: string; level: string };
    filters: Filters;
    courses: Course[];
    summary: Summary;
    breakdown: (Course & Summary)[];
    trend: ({ month: string } & Summary)[];
    history: { data: AttendanceRecord[]; links: { url: string | null; label: string; active: boolean }[]; total: number };
    links: { attendance: string; schedule: string; absences: string };
};

const statuses = {
    present: { label: 'Présent', metric: 'Présences', icon: Check },
    late: { label: 'En retard', metric: 'Retards', icon: Clock3 },
    absent: { label: 'Absent', metric: 'Absences', icon: X },
    excused: { label: 'Absence justifiée', metric: 'Absences justifiées', icon: FileCheck2 },
    pending: { label: 'En attente', metric: 'En attente', icon: CircleHelp },
};
const summaryStatuses: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];
const sourceLabels = { qr: 'QR de séance', nfc: 'Carte NFC', manual: 'Appel manuel' };
const dayFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: zone, dateStyle: 'medium' });
const monthFormat = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: zone });
const longMonthFormat = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: zone });
const percentFormat = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });

const rateLabel = (rate: number | null) => (rate === null ? '—' : percentFormat.format(rate / 100));
const rateStyle = (rate: number | null) => ({ '--attendance-rate': `${rate ?? 0}%` }) as CSSProperties;

function attendanceHref(base: string, filters: Filters) {
    const [path, query] = base.split('?');
    const params = new URLSearchParams(query);
    for (const [key, value] of Object.entries(filters)) {
        if (value !== null && value !== '') params.set(key, String(value));
        else params.delete(key);
    }
    return `${path}?${params}`;
}

function AttendanceFilters({ filters, courses, href }: { filters: Filters; courses: Course[]; href: string }) {
    const { data, setData, get, processing, errors } = useForm({
        course: filters.course?.toString() ?? '',
        from: filters.from ?? '',
        to: filters.to ?? '',
        status: filters.status ?? '',
    });

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        get(href, { preserveScroll: true });
    };

    return (
        <form className="attendance-filters" onSubmit={submit} aria-label="Période et cours">
            <label className="attendance-filter-course">
                <span>Cours</span>
                <select value={data.course} onChange={(event) => setData('course', event.currentTarget.value)}>
                    <option value="">Tous les cours</option>
                    {courses.map(({ id, title, code }) => (
                        <option key={id} value={id}>
                            {code ? `${code} · ${title}` : title}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                <span>Du</span>
                <input type="date" value={data.from} max={data.to || undefined} onChange={(event) => setData('from', event.currentTarget.value)} />
            </label>
            <label>
                <span>Au</span>
                <input type="date" value={data.to} min={data.from || undefined} onChange={(event) => setData('to', event.currentTarget.value)} />
            </label>
            <div className="attendance-filter-actions">
                <button type="submit" disabled={processing}>
                    <SlidersHorizontal size={16} aria-hidden="true" />
                    Appliquer
                </button>
                {(filters.course !== null || filters.from || filters.to) && (
                    <Link href={attendanceHref(href, { course: null, from: null, to: null, status: filters.status })} preserveScroll>
                        Réinitialiser
                    </Link>
                )}
            </div>
            {Object.keys(errors).length > 0 && (
                <p className="attendance-filter-error" role="alert">
                    {Object.values(errors)[0]}
                </p>
            )}
        </form>
    );
}

function AttendanceHero({ summary, course }: { summary: Summary; course: Course | undefined }) {
    const hasRecords = summary.recorded > 0;
    return (
        <section className="attendance-hero" aria-labelledby="attendance-title">
            <div className="attendance-hero-copy">
                <span className="attendance-hero-icon" aria-hidden="true">
                    <ClipboardCheck size={22} />
                </span>
                <h1 id="attendance-title">Mes présences</h1>
                <p>{course ? course.title : 'Consultez votre assiduité et retrouvez vos pointages par séance.'}</p>
                <div className="attendance-hero-total">
                    {hasRecords ? (
                        <>
                            <strong>
                                {summary.attended} / {summary.recorded}
                            </strong>
                            <span>séances suivies</span>
                        </>
                    ) : (
                        <span>Aucune séance terminée avec un résultat sur cette période.</span>
                    )}
                </div>
            </div>
            <div className="attendance-hero-score">
                <div className="attendance-rate-dial" style={rateStyle(summary.rate)} aria-hidden="true" />
                <div className="attendance-rate-value">
                    <strong>{rateLabel(summary.rate)}</strong>
                    <span>Taux de présence</span>
                </div>
            </div>
        </section>
    );
}

function MonthlyAttendance({ trend }: { trend: Props['trend'] }) {
    return (
        <section className="attendance-panel" aria-labelledby="attendance-trend">
            <div className="attendance-panel-title">
                <span className="attendance-panel-icon">
                    <BarChart3 size={21} aria-hidden="true" />
                </span>
                <div>
                    <h2 id="attendance-trend">Évolution mensuelle</h2>
                    <p>Taux de présence par mois</p>
                </div>
            </div>
            {trend.length > 0 ? (
                <div className="attendance-chart">
                    <div className="attendance-chart-axis" aria-hidden="true">
                        <span>100 %</span>
                        <span>50 %</span>
                        <span>0 %</span>
                    </div>
                    <ol className="attendance-chart-bars" tabIndex={0} aria-label="Graphique des taux de présence mensuels">
                        {trend.map(({ month, rate, attended, recorded }) => {
                            const date = new Date(`${month}-01T12:00:00Z`);
                            const description = `${longMonthFormat.format(date)}, ${rateLabel(rate)} (${attended} sur ${recorded})`;
                            return (
                                <li key={month} title={description}>
                                    <span className="sr-only">{description}</span>
                                    <div className="attendance-chart-column" aria-hidden="true">
                                        <span className="attendance-chart-bar" style={rateStyle(rate)} />
                                    </div>
                                    <small aria-hidden="true">
                                        {monthFormat.format(date)}
                                        <strong>{rateLabel(rate)}</strong>
                                    </small>
                                </li>
                            );
                        })}
                    </ol>
                </div>
            ) : (
                <p className="attendance-empty">L’évolution apparaîtra après la première séance terminée et pointée.</p>
            )}
        </section>
    );
}

function CourseAttendance({ breakdown, filters, href }: { breakdown: Props['breakdown']; filters: Filters; href: string }) {
    return (
        <section className="attendance-panel" aria-labelledby="attendance-courses">
            <div className="attendance-panel-title">
                <span className="attendance-panel-icon">
                    <BookOpen size={20} aria-hidden="true" />
                </span>
                <div>
                    <h2 id="attendance-courses">Par cours</h2>
                    <p>Séances suivies et taux de présence</p>
                </div>
                {filters.course !== null && (
                    <Link className="attendance-all-courses" href={attendanceHref(href, { ...filters, course: null })} preserveScroll>
                        Tous les cours
                    </Link>
                )}
            </div>
            {breakdown.length > 0 ? (
                <ul className="attendance-course-list">
                    {breakdown.map((course) => (
                        <li key={course.id}>
                            <Link
                                className="attendance-course"
                                href={attendanceHref(href, { ...filters, course: course.id })}
                                aria-current={filters.course === course.id ? 'true' : undefined}
                                preserveScroll
                            >
                                <div className="attendance-course-copy">
                                    <strong>{course.title}</strong>
                                    <span>
                                        {course.code && `${course.code} · `}
                                        {course.attended} / {course.recorded} séances
                                    </span>
                                </div>
                                <strong className="attendance-course-rate">{rateLabel(course.rate)}</strong>
                                <ChevronRight size={16} aria-hidden="true" />
                                <div className="attendance-course-track" aria-hidden="true">
                                    <span style={rateStyle(course.rate)} />
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="attendance-empty">Aucune présence par cours pour cette période.</p>
            )}
        </section>
    );
}

function RecordRow({ record }: { record: AttendanceRecord }) {
    const status = record.status ?? 'pending';
    const { label, icon: Icon } = statuses[status];
    return (
        <li className="attendance-record">
            <div className="attendance-record-course">
                <span className="attendance-record-symbol">
                    <BookOpen size={19} aria-hidden="true" />
                </span>
                <div>
                    <strong>{record.course}</strong>
                    {record.room && (
                        <span>
                            <MapPin size={13} aria-hidden="true" />
                            {record.room}
                        </span>
                    )}
                </div>
            </div>
            <div className="attendance-record-time">
                <time dateTime={record.starts_at}>{dayFormat.format(new Date(record.starts_at))}</time>
                <span>
                    {time(record.starts_at)} – {time(record.ends_at)}
                </span>
            </div>
            <div className="attendance-record-checkin">
                {record.source && (
                    <span>
                        <ScanLine size={14} aria-hidden="true" />
                        {sourceLabels[record.source]}
                    </span>
                )}
                {record.checked_in_at && (
                    <small>
                        À <time dateTime={record.checked_in_at}>{time(record.checked_in_at)}</time>
                    </small>
                )}
                {!record.checked_in_at && !record.source && <small>—</small>}
            </div>
            <span className="attendance-record-status" data-status={status}>
                <Icon size={14} aria-hidden="true" />
                {label}
            </span>
        </li>
    );
}

function AttendanceHistory({
    history,
    filters,
    href,
    absencesHref,
}: {
    history: Props['history'];
    filters: Filters;
    href: string;
    absencesHref: string;
}) {
    return (
        <section className="attendance-panel attendance-history" aria-labelledby="attendance-history">
            <div className="attendance-panel-title">
                <span className="attendance-panel-icon">
                    <ListChecks size={22} aria-hidden="true" />
                </span>
                <div>
                    <h2 id="attendance-history">Historique des séances</h2>
                    <p>
                        {history.total} {history.total === 1 ? 'séance' : 'séances'}
                    </p>
                </div>
                <label className="attendance-status-filter">
                    <span className="sr-only">Filtrer l’historique par statut</span>
                    <select
                        value={filters.status ?? ''}
                        onChange={(event) =>
                            router.visit(attendanceHref(href, { ...filters, status: (event.currentTarget.value as StatusFilter) || null }), {
                                preserveScroll: true,
                            })
                        }
                    >
                        <option value="">Tous les statuts</option>
                        {Object.entries(statuses).map(([status, { label }]) => (
                            <option key={status} value={status}>
                                {label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            {history.data.length ? (
                <>
                    <div className="attendance-history-headings" aria-hidden="true">
                        <span>Cours</span>
                        <span>Séance</span>
                        <span>Pointage</span>
                        <span>Statut</span>
                    </div>
                    <ul className="attendance-history-list">
                        {history.data.map((record) => (
                            <RecordRow key={record.id} record={record} />
                        ))}
                    </ul>
                    <Pagination value={history} />
                </>
            ) : (
                <p className="attendance-empty">Aucune séance pour les filtres sélectionnés.</p>
            )}
            <div className="attendance-history-footer">
                <small>Heure de Kinshasa (UTC+1)</small>
                <Link href={absencesHref}>
                    Justifier une absence <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
            </div>
        </section>
    );
}

export default function Attendance({ studentChrome, academic, filters, summary, courses, breakdown, trend, history, links }: Props) {
    const course = courses.find(({ id }) => id === filters.course);
    const filterKey = `${academic.id}:${filters.course}:${filters.from}:${filters.to}:${filters.status}`;
    return (
        <Dashboard>
            <Head title="Mes présences" />
            <div className="student-attendance">
                <div className="attendance-top">
                    <Link className="attendance-back" href={links.schedule}>
                        <ArrowLeft size={17} aria-hidden="true" /> Emploi du temps
                    </Link>
                    <div className="attendance-academic">
                        <CalendarDays size={16} aria-hidden="true" />
                        <span>{academic.year}</span>
                        {studentChrome && studentChrome.options.length > 1 && (
                            <>
                                <ChevronDown size={15} aria-hidden="true" />
                                <StudentYearSelect context={studentChrome} section="attendance" />
                            </>
                        )}
                    </div>
                </div>
                <AttendanceHero key={filterKey} summary={summary} course={course} />
                <AttendanceFilters key={filterKey} courses={courses} filters={filters} href={links.attendance} />
                <section className="attendance-metrics" aria-label="Bilan des présences">
                    {summaryStatuses.map((status) => {
                        const { metric, icon: Icon } = statuses[status];
                        return (
                            <div className="attendance-metric" data-status={status} key={status}>
                                <span className="attendance-metric-icon">
                                    <Icon size={20} aria-hidden="true" />
                                </span>
                                <strong>{summary[status]}</strong>
                                <span>{metric}</span>
                            </div>
                        );
                    })}
                </section>
                <div className="attendance-analysis">
                    <MonthlyAttendance key={`trend-${filterKey}`} trend={trend} />
                    <CourseAttendance breakdown={breakdown} filters={filters} href={links.attendance} />
                </div>
                <AttendanceHistory history={history} filters={filters} href={links.attendance} absencesHref={links.absences} />
                <p className="attendance-method-note">
                    Le taux correspond aux présences et retards, rapportés aux séances terminées dont l’appel a été renseigné.
                </p>
            </div>
        </Dashboard>
    );
}
