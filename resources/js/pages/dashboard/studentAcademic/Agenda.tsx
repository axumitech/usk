import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import { addDays, dateLabel, zone } from '@/lib/scheduleDates';
import { Head, Link, router } from '@inertiajs/react';
import { ArrowLeft, CalendarCheck, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, UserRound } from 'lucide-react';
import '../../../../css/dashboard/school-appointment-agenda.css';

type Appointment = {
    id: number;
    subject: string;
    service: string;
    service_key: string;
    date: string;
    time: string;
    location: string;
    student_name: string;
    matricule: string | null;
    detail_url: string;
};

type AgendaData = {
    week: string;
    end: string;
    today: string;
    timezone: string;
    service: string | null;
    services: { key: string; label: string }[];
    appointments: Appointment[];
    previous_url: string;
    next_url: string;
    today_url: string;
    index_url: string;
    requests_url: string;
    availability_url?: string | null;
};

const shortDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: zone });
const shortMonth = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: zone });
const weekDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: zone });
const dateAtNoon = (date: string) => new Date(`${date}T12:00:00Z`);
const countLabel = (count: number) => `${count} rendez-vous`;
const dayTarget = (date: string) => `agenda-appointments-${date}`;

function filterHref(indexUrl: string, week: string, service?: string) {
    const [path, search] = indexUrl.split('?');
    const query = new URLSearchParams(search);
    query.set('week', week);
    if (service) query.set('service', service);
    else query.delete('service');
    return `${path}?${query}`;
}

function AppointmentCard({ appointment }: { appointment: Appointment }) {
    const id = `agenda-appointment-${appointment.id}`;
    return (
        <li>
            <Link
                className="school-agenda-slot"
                data-service={appointment.service_key}
                href={appointment.detail_url}
                aria-labelledby={`${id}-title ${id}-student ${id}-time`}
            >
                <time id={`${id}-time`} className="school-agenda-slot-time" dateTime={`${appointment.date}T${appointment.time}+01:00`}>
                    {appointment.time}
                </time>
                <div className="school-agenda-slot-copy">
                    <span className="school-agenda-service">{appointment.service}</span>
                    <h3 id={`${id}-title`}>{appointment.subject}</h3>
                    <div className="school-agenda-slot-meta">
                        <span>
                            <UserRound size={15} aria-hidden="true" /> <strong id={`${id}-student`}>{appointment.student_name}</strong>
                            {appointment.matricule && <small>{appointment.matricule}</small>}
                        </span>
                        <span>
                            <MapPin size={15} aria-hidden="true" /> {appointment.location}
                        </span>
                    </div>
                </div>
                <ChevronRight className="school-agenda-slot-arrow" size={20} aria-hidden="true" />
            </Link>
        </li>
    );
}

export default function Agenda({ agenda }: { agenda: AgendaData }) {
    const groups = new Map<string, Appointment[]>();
    for (const appointment of agenda.appointments) {
        const day = groups.get(appointment.date);
        if (day) day.push(appointment);
        else groups.set(appointment.date, [appointment]);
    }
    const days = Array.from({ length: 7 }, (_, index) => addDays(agenda.week, index));
    const period = weekDate.formatRange(dateAtNoon(agenda.week), dateAtNoon(agenda.end));
    const serviceName = agenda.services.find(({ key }) => key === agenda.service)?.label;
    const currentWeek = agenda.today >= agenda.week && agenda.today <= agenda.end;

    return (
        <Dashboard hideAppsNavigation>
            <Head title="Agenda des rendez-vous · Scolarité" />
            <div className="school-agenda">
                <div className="school-agenda-top-actions">
                    <Link className="school-agenda-button school-agenda-back" href={agenda.requests_url}>
                        <ArrowLeft size={18} aria-hidden="true" /> Retour aux demandes
                    </Link>
                    {agenda.availability_url && (
                        <Link className="school-agenda-button" href={agenda.availability_url}>
                            <CalendarClock size={18} aria-hidden="true" /> Gérer les disponibilités
                        </Link>
                    )}
                </div>
                <header className="school-agenda-hero">
                    <div>
                        <p className="school-agenda-section">
                            <CalendarDays size={18} aria-hidden="true" /> Scolarité
                        </p>
                        <h1>Agenda des rendez-vous</h1>
                        <p className="school-agenda-clock">
                            <Clock3 size={15} aria-hidden="true" /> Heure de Kinshasa
                        </p>
                    </div>
                    <div className="school-agenda-total">
                        <strong>{agenda.appointments.length.toLocaleString('fr-FR')}</strong>
                        <span>{agenda.appointments.length === 1 ? 'Rendez-vous confirmé' : 'Rendez-vous confirmés'}</span>
                    </div>
                </header>
                <nav className="school-agenda-services" aria-label="Filtrer par service">
                    <Link href={filterHref(agenda.index_url, agenda.week)} aria-current={!agenda.service ? 'page' : undefined}>
                        Tous les services
                    </Link>
                    {agenda.services.map(({ key, label }) => (
                        <Link
                            key={key}
                            href={filterHref(agenda.index_url, agenda.week, key)}
                            aria-current={key === agenda.service ? 'page' : undefined}
                        >
                            {label}
                        </Link>
                    ))}
                </nav>
                <section className="school-agenda-calendar" aria-labelledby="school-agenda-week">
                    <div className="school-agenda-week-controls">
                        <Link href={agenda.previous_url} className="school-agenda-button" aria-label="Semaine précédente">
                            <ChevronLeft size={22} aria-hidden="true" />
                        </Link>
                        <h2 id="school-agenda-week">{period}</h2>
                        <Link href={agenda.next_url} className="school-agenda-button" aria-label="Semaine suivante">
                            <ChevronRight size={22} aria-hidden="true" />
                        </Link>
                        {!currentWeek && (
                            <Link href={agenda.today_url} className="school-agenda-button school-agenda-today">
                                Aujourd’hui
                            </Link>
                        )}
                    </div>
                    <form
                        className="school-agenda-jump"
                        onSubmit={(event) => {
                            event.preventDefault();
                            const date = new FormData(event.currentTarget).get('week');
                            if (typeof date === 'string' && date) router.get(filterHref(agenda.index_url, date, agenda.service ?? undefined));
                        }}
                    >
                        <label>
                            Aller à une date
                            <input type="date" name="week" required key={agenda.week} defaultValue={agenda.week} />
                        </label>
                        <button type="submit" className="school-agenda-button">
                            Afficher
                        </button>
                    </form>
                    <ul className="school-agenda-days" aria-label="Jours de la semaine" role="list">
                        {days.map((date) => {
                            const count = groups.get(date)?.length ?? 0;
                            const parsed = dateAtNoon(date);
                            const label = dateLabel(date);
                            const contents = (
                                <>
                                    <span>{shortDay.format(parsed)}</span>
                                    <strong>{Number(date.slice(8))}</strong>
                                    {count > 0 && <small>{count}</small>}
                                </>
                            );
                            return (
                                <li key={date} data-today={date === agenda.today || undefined} data-occupied={count > 0 || undefined}>
                                    {count > 0 ? (
                                        <a
                                            href={`#${dayTarget(date)}`}
                                            aria-label={`${label} · ${countLabel(count)}`}
                                            aria-current={date === agenda.today ? 'date' : undefined}
                                        >
                                            {contents}
                                        </a>
                                    ) : (
                                        <time
                                            dateTime={date}
                                            aria-label={`${label} · Aucun rendez-vous`}
                                            aria-current={date === agenda.today ? 'date' : undefined}
                                        >
                                            {contents}
                                        </time>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </section>
                {agenda.appointments.length > 0 ? (
                    days.map((date) => {
                        const appointments = groups.get(date);
                        if (!appointments?.length) return null;
                        return (
                            <section className="school-agenda-day" key={date} aria-labelledby={dayTarget(date)}>
                                <header>
                                    <time className="school-agenda-day-tile" dateTime={date} aria-hidden="true">
                                        <strong>{Number(date.slice(8))}</strong>
                                        <span>{shortMonth.format(dateAtNoon(date))}</span>
                                    </time>
                                    <h2 id={dayTarget(date)} tabIndex={-1}>
                                        {dateLabel(date)}
                                    </h2>
                                    <p>{countLabel(appointments.length)}</p>
                                </header>
                                <ul className="school-agenda-slots" role="list">
                                    {appointments.map((appointment) => (
                                        <AppointmentCard key={appointment.id} appointment={appointment} />
                                    ))}
                                </ul>
                            </section>
                        );
                    })
                ) : (
                    <div className="school-agenda-empty">
                        <CalendarCheck size={28} aria-hidden="true" />
                        <p>
                            {serviceName
                                ? `Aucun rendez-vous confirmé pour ${serviceName} cette semaine.`
                                : 'Aucun rendez-vous confirmé cette semaine.'}
                        </p>
                    </div>
                )}
            </div>
        </Dashboard>
    );
}
