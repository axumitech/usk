import { presentNotice, type Notices } from '@/components/notifications/noticePresentation';
import { Link, usePage, usePoll } from '@inertiajs/react';
import { Bell, CheckCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import '../../../css/dashboard/admin-notifications.css';

export default function AdminNotifications({ audience = 'admin' }: { audience?: 'admin' | 'student' | 'teacher' }) {
    const propName = { admin: 'adminNotifications', student: 'studentNotifications', teacher: 'teacherNotifications' } as const;
    const props = usePage<{ adminNotifications: Notices | null; studentNotifications: Notices | null; teacherNotifications: Notices | null }>().props;
    const notices = props[propName[audience]];
    const panelId = `${audience}-notifications-panel`;
    const description = {
        admin: 'Les nouvelles pièces de vos candidats.',
        student: 'Vos inscriptions, démarches et opérations financières.',
        teacher: 'Le suivi de vos séances et de vos enseignements.',
    }[audience];
    const emptyDescription = {
        admin: 'Le remplacement d’un justificatif apparaîtra ici.',
        student: 'Les mises à jour de votre dossier apparaîtront ici.',
        teacher: 'Les mises à jour de vos enseignements apparaîtront ici.',
    }[audience];
    const readAllUrl = {
        admin: '/app/dashboard/admin/notifications/read-all',
        student: '/app/dashboard/notifications/read-all',
        teacher: '/app/dashboard/notifications/read-all?audience=teacher',
    }[audience];
    const [open, setOpen] = useState(false);
    const panel = useRef<HTMLDivElement>(null);
    const toggle = useRef<HTMLButtonElement>(null);
    usePoll(30000, { only: [propName[audience]] });
    useEffect(() => {
        if (!open) return;
        const close = (event: PointerEvent) => {
            if (panel.current && !panel.current.contains(event.target as Node)) setOpen(false);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
                toggle.current?.focus();
            }
        };
        window.addEventListener('pointerdown', close);
        window.addEventListener('keydown', escape);
        return () => {
            window.removeEventListener('pointerdown', close);
            window.removeEventListener('keydown', escape);
        };
    }, [open]);
    if (!notices) return null;
    return (
        <div className="admin-notifications" ref={panel}>
            <button
                type="button"
                ref={toggle}
                className="admin-notifications-toggle"
                aria-label={`Notifications, ${notices.unread_count} non lue(s)`}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen(!open)}
            >
                <Bell size={20} aria-hidden="true" />
                {notices.unread_count > 0 && <span aria-hidden="true">{notices.unread_count > 99 ? '99+' : notices.unread_count}</span>}
            </button>
            {open && (
                <section
                    id={panelId}
                    className="admin-notifications-panel"
                    aria-label={
                        audience === 'teacher'
                            ? 'Notifications enseignantes'
                            : audience === 'admin'
                              ? 'Notifications des inscriptions'
                              : 'Notifications étudiantes'
                    }
                >
                    <header>
                        <div>
                            <h2>Notifications</h2>
                            <p>{description}</p>
                        </div>
                        <button
                            type="button"
                            aria-label="Fermer les notifications"
                            onClick={() => {
                                setOpen(false);
                                toggle.current?.focus();
                            }}
                        >
                            <X size={18} />
                        </button>
                    </header>
                    {notices.unread_count > 0 && (
                        <Link href={readAllUrl} method="post" as="button" preserveScroll className="admin-notifications-read-all">
                            <CheckCheck size={15} />
                            Tout marquer comme lu
                        </Link>
                    )}
                    {notices.items.length ? (
                        <ul>
                            {notices.items.map((notice) => {
                                const { title, icon: Icon, action, showFile } = presentNotice(notice, audience === 'admin' ? 'admin' : 'student');
                                return (
                                    <li key={notice.id} className={notice.read_at ? '' : 'is-unread'}>
                                        <span className="admin-notification-icon">
                                            <Icon size={18} />
                                        </span>
                                        <div>
                                            <strong>{title}</strong>
                                            <p>
                                                {audience === 'admin' && notice.student_name ? `${notice.student_name} · ` : ''}
                                                {notice.reference}
                                            </p>
                                            {showFile && (
                                                <p className="admin-notification-file">
                                                    {notice.filename} · Version {notice.version}
                                                </p>
                                            )}
                                            {notice.comment && <p className="notification-review-comment">{notice.comment}</p>}
                                            <small>
                                                {new Date(notice.created_at).toLocaleString('fr-FR', {
                                                    timeZone: 'Africa/Kinshasa',
                                                    day: '2-digit',
                                                    month: 'short',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}
                                            </small>
                                            <Link
                                                href={notice.open_url}
                                                preserveState={false}
                                                method="post"
                                                as="button"
                                                onSuccess={() => setOpen(false)}
                                                className="admin-notification-open"
                                            >
                                                {action}
                                            </Link>
                                        </div>
                                        {!notice.read_at && <span className="admin-notification-dot" aria-label="Non lue" />}
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <div className="admin-notifications-empty">
                            <Bell size={27} strokeWidth={1.4} />
                            <strong>Vous êtes à jour.</strong>
                            <p>{emptyDescription}</p>
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
