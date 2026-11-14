import { Link } from '@inertiajs/react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUpRight, CircleAlert, Megaphone, X } from 'lucide-react';
import '../../../css/dashboard/student-alerts.css';
import { studentHref, studentSectionAccess } from './navigation';
import type { Academic, Permission, StudentOverviewData } from './types';

type Props = {
    academic: Academic;
    alerts: StudentOverviewData['alerts'];
    announcements: StudentOverviewData['announcements'];
    permissions: Record<string, Permission>;
};

export default function StudentAlertBubble({ academic, alerts, announcements, permissions }: Props) {
    const count = alerts.length + announcements.length;
    if (!count) return null;

    const critical = alerts.some((alert) => alert.tone === 'critical');
    const label = critical ? 'Alerte importante' : 'Infos à consulter';
    const orderedAlerts = [...alerts.filter((alert) => alert.tone === 'critical'), ...alerts.filter((alert) => alert.tone !== 'critical')];

    return (
        <Dialog.Root>
            <Dialog.Trigger type="button" className="student-alert-bubble" data-severity={critical ? 'critical' : 'warning'}>
                <span key={`${critical}-${count}`} className="student-alert-bubble-icon">
                    <CircleAlert size={18} aria-hidden="true" />
                </span>
                {label}
                <span className="student-alert-bubble-count">{count}</span>
            </Dialog.Trigger>
            <Dialog.Portal>
                <Dialog.Overlay className="student-alert-overlay" />
                <Dialog.Content className="student-alert-dialog" aria-describedby={undefined}>
                    <header>
                        <Dialog.Title>Alertes et annonces</Dialog.Title>
                        <Dialog.Close type="button" className="student-alert-close" aria-label="Fermer les alertes">
                            <X size={21} aria-hidden="true" />
                        </Dialog.Close>
                    </header>
                    <ul>
                        {orderedAlerts.map((alert) => {
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
                        })}
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
