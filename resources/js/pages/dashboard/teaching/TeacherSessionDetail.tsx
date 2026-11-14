import { dateLabel, localDate, time } from '@/lib/scheduleDates';
import { Link } from '@inertiajs/react';
import { ArrowRight, BookOpen, CalendarDays, ClipboardCheck, Clock3, GraduationCap, MapPin, UserRound, UsersRound } from 'lucide-react';
import '../../../../css/dashboard/teacher-schedule.css';
import type { TeacherScheduledSession } from './overviewTypes';
import { TeacherPanel } from './TeacherOverview';
import { dateTime } from './types';

const activityTypes: Record<string, string> = {
    CM: 'Cours magistral',
    CMI: 'Cours magistral interactif',
    TD: 'Travaux dirigés',
    TP: 'Travaux pratiques',
};

export default function TeacherSessionDetail({ session }: { session: TeacherScheduledSession }) {
    const startDay = localDate(session.starts_at);
    const endDay = localDate(session.ends_at);
    const activity = session.activity_type?.trim();
    const facts = [
        {
            label: 'Date et horaire',
            icon: CalendarDays,
            value:
                startDay === endDay
                    ? `${dateLabel(startDay)} · ${time(session.starts_at)} – ${time(session.ends_at)}`
                    : `${dateTime(session.starts_at)} – ${dateTime(session.ends_at)}`,
        },
        { label: 'Lieu', icon: MapPin, value: session.location || session.room || 'Salle à préciser' },
        { label: 'Niveau', icon: GraduationCap, value: [session.level, session.faculty].filter(Boolean).join(' · ') },
        { label: 'Groupe', icon: UsersRound, value: session.group || 'Tous les groupes du cours' },
        ...(activity ? [{ label: 'Type de séance', icon: BookOpen, value: activityTypes[activity.toUpperCase()] ?? activity }] : []),
        ...(session.teacher ? [{ label: 'Enseignant', icon: UserRound, value: session.teacher }] : []),
    ];
    const changed = session.status !== 'published';
    const attendanceMessage =
        session.attendance_status === 'upcoming'
            ? 'La saisie sera disponible à partir du début de la séance.'
            : session.attendance_status === 'read_only'
              ? 'La feuille de présence est accessible en lecture seule.'
          : 'La feuille de présence est réservée aux enseignants habilités.';

    return (
        <div className="teacher-session-details">
            <TeacherPanel
                id="teacher-session-details"
                title="Détails de la séance"
                icon={CalendarDays}
                action={
                    changed && (
                        <span className="teacher-session-badge" data-state={session.status}>
                            {session.status === 'rescheduled' ? 'Reportée' : 'Annulée'}
                        </span>
                    )
                }
            >
                <dl className="teacher-session-facts">
                    {facts.map(({ label, icon: Icon, value }) => (
                        <div key={label}>
                            <span className="teacher-symbol" aria-hidden="true">
                                <Icon size={17} />
                            </span>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                        </div>
                    ))}
                </dl>
                {session.replacement_starts_at && (
                    <div className="teacher-session-change">
                        <p>Nouveau créneau le {dateTime(session.replacement_starts_at)}.</p>
                        {session.replacement_url && (
                            <Link href={session.replacement_url}>
                                Voir le nouveau créneau <ArrowRight size={16} aria-hidden="true" />
                            </Link>
                        )}
                    </div>
                )}
                <Link className="teacher-schedule-action" href={session.course_url}>
                    Voir la fiche du cours <ArrowRight size={16} aria-hidden="true" />
                </Link>
            </TeacherPanel>
            {!changed && (
                <TeacherPanel id="teacher-session-attendance" title="Appel" icon={ClipboardCheck}>
                    {!session.can_record_attendance && (
                        <p className="teacher-attendance-note">
                            <Clock3 size={16} aria-hidden="true" /> {attendanceMessage}
                        </p>
                    )}
                    {session.attendance_url && (
                        <Link className="teacher-schedule-action teacher-schedule-primary" href={session.attendance_url}>
                            <ClipboardCheck size={18} aria-hidden="true" />{' '}
                            {session.can_record_attendance ? 'Faire l’appel' : 'Consulter la feuille de présence'}
                        </Link>
                    )}
                </TeacherPanel>
            )}
        </div>
    );
}
