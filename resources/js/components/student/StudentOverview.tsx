import { dateLabel, localDate, time, zone } from '@/lib/scheduleDates';
import { Link } from '@inertiajs/react';
import {
    ArrowUpRight,
    BookOpen,
    CalendarCheck,
    CalendarDays,
    ChevronRight,
    CirclePlay,
    ClipboardCheck,
    FileText,
    Image,
    MapPin,
    Megaphone,
    UserRound,
    Wallet,
} from 'lucide-react';
import { studentHref, studentScheduleHref, studentScheduledCourseHref } from './navigation';
import { EmptyState } from './PortalCards';
import { programPeriod } from './programCalendar';
import ScheduleExamPeriods from './ScheduleExamPeriods';
import CoursesBySemester from './StudentCourseCards';
import { money, type Academic, type Balance, type Permission, type PortalProps, type StudentOverviewData } from './types';

const date = (value: string, options: Intl.DateTimeFormatOptions = {}) =>
    new Intl.DateTimeFormat('fr-FR', { timeZone: zone, ...options }).format(new Date(value));

const announcementFormats = {
    text: { icon: Megaphone, label: null },
    photo: { icon: Image, label: 'Photo' },
    video: { icon: CirclePlay, label: 'Vidéo' },
    document: { icon: FileText, label: 'Document' },
};

function LatestAnnouncements({ announcements, academic }: { announcements: StudentOverviewData['announcements']; academic: number }) {
    const href = studentHref('announcements', academic);

    return (
        <section className="overview-home-section" aria-labelledby="home-announcements-title">
            <header>
                <div className="overview-panel-title">
                    <Megaphone size={20} aria-hidden="true" />
                    <h2 id="home-announcements-title">Dernières annonces</h2>
                </div>
                <Link href={href} aria-label="Voir toutes les annonces">
                    Voir tout <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
            </header>
            {announcements.length ? (
                <ul className="overview-announcements" role="list">
                    {announcements.slice(0, 3).map((announcement) => {
                        const kind = announcement.kind ?? 'text';
                        const { icon: Icon, label } = announcementFormats[kind];
                        const published = announcement.date ?? announcement.updated_at;
                        return (
                            <li key={announcement.id}>
                                <Link href={announcement.detail_url ?? `${href}&announcement=${announcement.id}`}>
                                    <span className="overview-announcement-thumbnail" data-kind={kind}>
                                        <Icon size={24} aria-hidden="true" />
                                        {kind === 'photo' && announcement.preview_url && (
                                            <img
                                                key={announcement.preview_url}
                                                src={announcement.preview_url}
                                                alt=""
                                                loading="lazy"
                                                decoding="async"
                                                onError={(event) => {
                                                    event.currentTarget.hidden = true;
                                                }}
                                            />
                                        )}
                                    </span>
                                    <div className="overview-announcement-content">
                                        {label && <span className="overview-announcement-format">{label}</span>}
                                        <h3>{announcement.title}</h3>
                                        {(announcement.faculty || announcement.course) && <p>{announcement.faculty || announcement.course}</p>}
                                        {published && (
                                            <time dateTime={published}>
                                                <CalendarDays size={13} aria-hidden="true" />
                                                {date(published, { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </time>
                                        )}
                                    </div>
                                    <ChevronRight size={17} aria-hidden="true" />
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p className="overview-section-description">Aucune annonce publiée pour cette année académique.</p>
            )}
        </section>
    );
}

export default function StudentOverview({
    data,
    academic,
    balance,
    permissions,
    courses = [],
    calendarEvents,
}: {
    data: StudentOverviewData;
    academic: Academic;
    balance: Balance;
    permissions: Record<string, Permission>;
    courses?: PortalProps['courses'];
    calendarEvents?: PortalProps['calendar_events'];
}) {
    const href = (section: string, hash?: string) => studentHref(section, academic.id, hash);
    const fees = data.fee_summary || [];
    const evaluations = data.ongoing_evaluations || [];
    const evaluationAccess = permissions.evaluations_participate;
    const canSeeSchedule = permissions.schedule_view.allowed;
    const canSeeCourses = permissions.courses_view.allowed;
    const today = localDate(data.generated_at);
    const sessions = data.today_sessions;
    const examsToday = calendarEvents?.filter((event) => event.start_date <= today && today <= event.end_date);
    const events = data.upcoming_events ?? [];
    return (
        <div className="student-overview overview-ordered">
            <section id="home-events" className="overview-home-section" aria-labelledby="home-events-title">
                <header>
                    <div className="overview-panel-title">
                        <CalendarCheck size={20} aria-hidden="true" />
                        <h2 id="home-events-title">Prochains événements</h2>
                    </div>
                    <Link href={href('program')}>
                        Programme <ArrowUpRight size={15} aria-hidden="true" />
                    </Link>
                </header>
                {events.length ? (
                    <ul className="overview-program-events" role="list">
                        {events.map((event) => {
                            const start = `${event.start_date}T12:00:00Z`;
                            const ongoing = event.start_date < today && event.end_date >= today;
                            return (
                                <li key={event.id}>
                                    <Link href={event.detail_url}>
                                        <time
                                            className="overview-program-date"
                                            dateTime={event.start_date}
                                            aria-label={programPeriod(event.start_date, event.start_date)}
                                        >
                                            <strong>{date(start, { day: 'numeric' })}</strong>
                                            <span>{date(start, { month: 'short' })}</span>
                                        </time>
                                        <span className="overview-program-copy">
                                            <strong>{event.title}</strong>
                                            <small>
                                                {ongoing && 'En cours · '}
                                                {event.start_date === event.end_date
                                                    ? event.category_label
                                                    : programPeriod(event.start_date, event.end_date, true)}
                                            </small>
                                        </span>
                                        <ChevronRight size={17} aria-hidden="true" />
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <p className="overview-section-description">Aucun événement à venir dans cette année académique.</p>
                )}
            </section>
            {canSeeCourses && <LatestAnnouncements announcements={data.announcements ?? []} academic={academic.id} />}
            <section id="home-schedule" className="overview-home-section" aria-labelledby="home-schedule-title">
                <header>
                    <div className="overview-panel-title">
                        <CalendarDays size={20} aria-hidden="true" />
                        <h2 id="home-schedule-title">Horaire du jour</h2>
                    </div>
                    <Link href={canSeeSchedule ? studentScheduleHref(academic.id, undefined, today) : href('requests')}>
                        {canSeeSchedule ? 'Horaire complet' : 'Assistance'}
                        <ArrowUpRight size={15} aria-hidden="true" />
                    </Link>
                </header>
                <time className="overview-home-date" dateTime={today}>
                    {dateLabel(today)}
                </time>
                {!canSeeSchedule ? (
                    <EmptyState title="Horaire indisponible." icon={CalendarDays}>
                        {permissions.schedule_view.reason}
                    </EmptyState>
                ) : (
                    <>
                        <ScheduleExamPeriods events={examsToday} />
                        {sessions.length > 0 ? (
                            <ul className="overview-today-sessions" role="list">
                                {sessions.map((session) => {
                                    const courseHref = canSeeCourses && studentScheduledCourseHref(session, academic.id, 'overview');
                                    const details = (
                                        <>
                                            <div className="overview-today-time">
                                                <time dateTime={session.starts_at}>{time(session.starts_at)}</time>
                                                <time dateTime={session.ends_at}>{time(session.ends_at)}</time>
                                            </div>
                                            <div className="overview-today-course">
                                                {session.ongoing && <span>En cours</span>}
                                                <h3>{session.course}</h3>
                                                {session.teacher && (
                                                    <p>
                                                        <UserRound size={14} aria-hidden="true" /> {session.teacher}
                                                    </p>
                                                )}
                                                <p>
                                                    <MapPin size={14} aria-hidden="true" />
                                                    {session.location || session.room || 'Salle à préciser'}
                                                </p>
                                            </div>
                                            {courseHref && <ChevronRight className="overview-today-arrow" size={18} aria-hidden="true" />}
                                        </>
                                    );
                                    return (
                                        <li key={session.id} className={session.ongoing ? 'is-ongoing' : undefined}>
                                            {courseHref ? (
                                                <Link className="overview-today-slot" href={courseHref}>
                                                    {details}
                                                </Link>
                                            ) : (
                                                <div className="overview-today-slot">{details}</div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            !examsToday?.length && <p className="overview-section-description">Aucun cours prévu aujourd’hui.</p>
                        )}
                    </>
                )}
            </section>
            <section className="overview-home-section overview-courses-section" aria-labelledby="home-courses-title">
                <header>
                    <div className="overview-panel-title">
                        <BookOpen size={20} aria-hidden="true" />
                        <h2 id="home-courses-title">Mes cours</h2>
                    </div>
                    <Link href={href(canSeeCourses ? 'courses' : 'requests')}>
                        {canSeeCourses ? 'Tous les cours' : 'Assistance'}
                        <ArrowUpRight size={15} aria-hidden="true" />
                    </Link>
                </header>
                <p className="overview-section-description">
                    {academic.level}
                    {canSeeCourses && ` · ${courses.length} cours`}
                </p>
                {canSeeCourses && courses.length > 0 ? (
                    <CoursesBySemester courses={courses} />
                ) : (
                    <EmptyState title="Aucun enseignement disponible pour le moment." icon={BookOpen}>
                        {canSeeCourses
                            ? 'Les cours publiés pour votre niveau, votre année et votre groupe apparaîtront ici.'
                            : permissions.courses_view.reason}
                    </EmptyState>
                )}
            </section>
            <section className="overview-home-section" aria-labelledby="home-fees-title">
                <header>
                    <div className="overview-panel-title">
                        <Wallet size={20} aria-hidden="true" />
                        <h2 id="home-fees-title">Frais obligatoires</h2>
                    </div>
                    <Link href={href('fees')}>
                        Voir les frais
                        <ArrowUpRight size={15} aria-hidden="true" />
                    </Link>
                </header>
                {fees.length ? (
                    <>
                        <div className="overview-fee-balance">
                            <span>Solde total restant</span>
                            <strong>{money(balance.balance_cents, balance.currency)}</strong>
                        </div>
                        <div className="overview-fee-table">
                            {fees.map((fee) => (
                                <article key={fee.kind}>
                                    <div>
                                        <h3>{fee.title}</h3>
                                        <span className={fee.balance.overdue_cents > 0 ? 'is-overdue' : undefined}>
                                            {fee.balance.overdue_cents > 0
                                                ? `${money(fee.balance.overdue_cents, fee.balance.currency)} en retard`
                                                : fee.balance.balance_cents === 0
                                                  ? 'À jour'
                                                  : 'À régler selon vos échéances'}
                                        </span>
                                    </div>
                                    <p>
                                        <small>Total net dû</small>
                                        {money(fee.balance.due_cents, fee.balance.currency)}
                                    </p>
                                    <p>
                                        <small>Déjà payé</small>
                                        {money(fee.balance.paid_cents, fee.balance.currency)}
                                    </p>
                                    <p>
                                        <small>Solde restant</small>
                                        <strong>{money(fee.balance.balance_cents, fee.balance.currency)}</strong>
                                    </p>
                                </article>
                            ))}
                        </div>
                    </>
                ) : (
                    <EmptyState title="Frais à confirmer par l’administration." icon={Wallet}>
                        Les montants apparaîtront une fois les frais affectés à votre inscription.
                    </EmptyState>
                )}
            </section>
            {evaluationAccess?.visible !== false && (
                <section className="overview-home-section" aria-labelledby="home-evaluations-title">
                    <header>
                        <div className="overview-panel-title">
                            <ClipboardCheck size={20} />
                            <h2 id="home-evaluations-title">Évaluations en cours</h2>
                        </div>
                        <Link href={href('evaluations')}>
                            Voir les évaluations
                            <ArrowUpRight size={15} />
                        </Link>
                    </header>
                    {evaluations.length ? (
                        <div className="overview-active-evaluations">
                            {evaluations.map((item) => (
                                <article key={item.id}>
                                    <div>
                                        <span>{item.course}</span>
                                        <h3>{item.title}</h3>
                                        <p>
                                            {item.closes_at
                                                ? `Clôture le ${date(item.closes_at, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`
                                                : 'Date de clôture non renseignée'}
                                        </p>
                                    </div>
                                    <Link href={evaluationAccess?.allowed ? `${href('evaluations')}&work=${item.id}` : href('fees')}>
                                        {evaluationAccess?.allowed ? 'Consulter' : 'Conditions d’accès'}
                                        <ArrowUpRight size={14} />
                                    </Link>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <p className="overview-section-description">Aucune évaluation en cours.</p>
                    )}
                </section>
            )}
        </div>
    );
}
