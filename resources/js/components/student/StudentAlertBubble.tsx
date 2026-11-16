import { Link } from '@inertiajs/react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUpRight, ChevronRight, CircleAlert, ListChecks, Megaphone, X } from 'lucide-react';
import '../../../css/dashboard/student-alerts.css';
import { studentHref, studentSectionAccess } from './navigation';
import type { Academic, Permission, StudentOverviewData, StudentProfileCompletion } from './types';

type Props = {
    academic: Academic;
    alerts: StudentOverviewData['alerts'];
    announcements: StudentOverviewData['announcements'];
    permissions: Record<string, Permission>;
    profile?: StudentProfileCompletion | null;
};

function ProfileCompleteness({ profile }: { profile: StudentProfileCompletion }) {
    const count = profile.missing.length;

    return (
        <li className="student-alert-profile" data-severity="profile">
            <div className="student-alert-profile-heading">
                <span className="student-alert-item-icon">
                    <ListChecks size={20} aria-hidden="true" />
                </span>
                <div>
                    <h3>Profil à compléter</h3>
                    <p>{count === 1 ? '1 information à renseigner' : `${count} informations à renseigner`}</p>
                </div>
            </div>
            <div className="student-alert-profile-progress">
                <progress value={profile.completed} max={profile.total} aria-label="Informations du profil renseignées" />
                <span aria-hidden="true">
                    {profile.completed} / {profile.total}
                </span>
            </div>
            <ul className="student-alert-profile-fields" aria-label="Informations à renseigner">
                {profile.missing.map((field) => (
                    <li key={field.key}>
                        <Dialog.Close asChild>
                            <Link href={field.href} aria-label={`Renseigner ${field.label.toLocaleLowerCase('fr-FR')}`}>
                                <span>{field.label}</span>
                                <ChevronRight size={15} aria-hidden="true" />
                            </Link>
                        </Dialog.Close>
                    </li>
                ))}
            </ul>
        </li>
    );
}

export default function StudentAlertBubble({ academic, alerts, announcements, permissions, profile }: Props) {
    const missing = profile?.missing.length ?? 0;
    const count = alerts.length + announcements.length + missing;
    if (!count) return null;

    const critical = alerts.some((alert) => alert.tone === 'critical');
    const profileOnly = count === missing;
    const label = critical ? 'Alerte importante' : profileOnly ? 'Profil à compléter' : 'Infos à consulter';
    const severity = critical ? 'critical' : profileOnly ? 'profile' : 'warning';
    const renderAlert = (alert: Props['alerts'][number]) => {
        const access = studentSectionAccess(alert.section, permissions);
        const application = alert.section === 'application';
        const destination = application
            ? `/app/dashboard/enrollments/${academic.application_uuid}`
            : studentHref(access.allowed && access.visible ? alert.section : 'requests', academic.id);
        return (
            <li key={alert.id} data-severity={alert.tone === 'critical' ? 'critical' : 'warning'}>
                <span className="student-alert-item-icon">
                    <CircleAlert size={18} aria-hidden="true" />
                </span>
                <div>
                    <h3>{alert.title}</h3>
                    <p>{alert.message}</p>
                    <Dialog.Close asChild>
                        <Link href={destination}>
                            {application ? 'Consulter mon dossier' : 'Voir le suivi'}
                            <ArrowUpRight size={14} aria-hidden="true" />
                        </Link>
                    </Dialog.Close>
                </div>
            </li>
        );
    };

    return (
        <Dialog.Root>
            <Dialog.Trigger type="button" className="student-alert-bubble" data-severity={severity}>
                <span key={`${severity}-${count}`} className="student-alert-bubble-icon">
                    {profileOnly ? <ListChecks size={18} aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />}
                </span>
                {label}
                <span className="student-alert-bubble-count">{count}</span>
            </Dialog.Trigger>
            <Dialog.Portal>
                <Dialog.Overlay className="student-alert-overlay" />
                <Dialog.Content className="student-alert-dialog" aria-describedby={undefined}>
                    <header>
                        <Dialog.Title>{missing ? 'Informations de mon espace' : 'Alertes et annonces'}</Dialog.Title>
                        <Dialog.Close type="button" className="student-alert-close" aria-label="Fermer les informations">
                            <X size={21} aria-hidden="true" />
                        </Dialog.Close>
                    </header>
                    <ul>
                        {alerts.filter((alert) => alert.tone === 'critical').map(renderAlert)}
                        {profile && missing > 0 && <ProfileCompleteness profile={profile} />}
                        {alerts.filter((alert) => alert.tone !== 'critical').map(renderAlert)}
                        {announcements.map((announcement) => (
                            <li key={`announcement-${announcement.id}`} data-severity="warning">
                                <span className="student-alert-item-icon">
                                    <Megaphone size={18} aria-hidden="true" />
                                </span>
                                <div>
                                    <h3>{announcement.title}</h3>
                                    {announcement.excerpt && <p>{announcement.excerpt}</p>}
                                    <Dialog.Close asChild>
                                        <Link
                                            href={
                                                announcement.detail_url ??
                                                `${studentHref('announcements', academic.id)}&announcement=${announcement.id}`
                                            }
                                        >
                                            Lire l’annonce <ArrowUpRight size={14} aria-hidden="true" />
                                        </Link>
                                    </Dialog.Close>
                                </div>
                            </li>
                        ))}
                    </ul>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
