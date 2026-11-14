import Pagination from '@/components/admin/Pagination';
import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import { presentNotice, type Notice } from '@/components/notifications/noticePresentation';
import { studentHref } from '@/components/student/navigation';
import type { StudentChromeData } from '@/components/student/StudentChrome';
import { formatDate } from '@/lib/studentEnrollment';
import { Head, Link, useForm, usePoll } from '@inertiajs/react';
import { ArrowLeft, ArrowUpRight, Bell, CheckCheck } from 'lucide-react';
import '../../../../css/student-notifications.css';
import '../../../../css/student-portal.css';
import '../../../../css/student-schedule.css';

type Inbox = {
    unread_count: number;
    filter: 'all' | 'unread';
    items: { data: Notice[]; total: number; links: { url: string | null; label: string; active: boolean }[] };
    index_url: string;
    unread_url: string;
    read_all_url: string;
};

function NotificationRow({ notice }: { notice: Notice }) {
    const { title, icon: Icon, action, showFile } = presentNotice(notice);
    const metadata = [notice.reference, showFile && notice.filename, showFile && notice.version !== null && `Version ${notice.version}`].filter(
        Boolean,
    );

    return (
        <li className="student-notice" data-unread={!notice.read_at}>
            <span className="student-notice-icon">
                <Icon size={21} aria-hidden="true" />
            </span>
            <div className="student-notice-content">
                <h2>{title}</h2>
                {metadata.length > 0 && <p className="student-notice-meta">{metadata.join(' · ')}</p>}
                {notice.comment && <p className="student-notice-comment">{notice.comment}</p>}
                <Link href={notice.open_url} method="post" as="button" type="button" className="student-notice-open">
                    {action} <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
            </div>
            <div className="student-notice-status">
                {!notice.read_at && <span>Non lue</span>}
                <time dateTime={notice.created_at}>{formatDate(notice.created_at, true)}</time>
            </div>
        </li>
    );
}

export default function Notifications({ notifications, studentChrome }: { notifications: Inbox; studentChrome: StudentChromeData }) {
    const readAll = useForm({});
    const { filter, items, unread_count: unread } = notifications;
    const selected = studentChrome.options.find((option) => option.id === studentChrome.academic_id);
    const home = selected ? studentHref('overview', selected.id) : '/app/dashboard/enrollments';
    usePoll(30000, { only: ['notifications'] });

    return (
        <Dashboard>
            <Head title="Notifications" />
            <div className="student-portal student-agenda student-notifications">
                <header className="student-agenda-header" data-year-state={selected && !selected.is_current ? 'archive' : 'current'}>
                    <Link
                        className="student-agenda-header-action"
                        href={home}
                        aria-label={selected ? 'Retour à l’accueil étudiant' : 'Retour aux candidatures'}
                    >
                        <ArrowLeft size={22} aria-hidden="true" />
                    </Link>
                    <div className="student-agenda-heading">
                        <h1>Notifications</h1>
                        <p>{unread > 0 ? `${unread} notification${unread === 1 ? ' non lue' : 's non lues'}` : 'Vous êtes à jour'}</p>
                    </div>
                    <Bell className="student-notifications-header-icon" size={24} aria-hidden="true" />
                </header>

                <section className="student-agenda-body" aria-label="Boîte de notifications">
                    <div className="student-notifications-toolbar">
                        <nav className="student-notifications-filters" aria-label="Filtrer les notifications">
                            <Link href={notifications.index_url} aria-current={filter === 'all' ? 'page' : undefined}>
                                Toutes
                            </Link>
                            <Link href={notifications.unread_url} aria-current={filter === 'unread' ? 'page' : undefined}>
                                Non lues
                            </Link>
                        </nav>
                        {unread > 0 && (
                            <button
                                type="button"
                                className="student-notifications-read-all"
                                disabled={readAll.processing}
                                onClick={() => readAll.post(notifications.read_all_url, { preserveScroll: true })}
                            >
                                <CheckCheck size={17} aria-hidden="true" /> Tout marquer comme lu
                            </button>
                        )}
                    </div>
                    {items.data.length > 0 ? (
                        <ul className="student-notifications-list">
                            {items.data.map((notice) => (
                                <NotificationRow key={notice.id} notice={notice} />
                            ))}
                        </ul>
                    ) : (
                        <div className="student-notifications-empty">
                            <span className="student-notice-icon">
                                <Bell size={24} aria-hidden="true" />
                            </span>
                            <h2>{filter === 'unread' ? 'Aucune notification non lue' : 'Aucune notification pour le moment'}</h2>
                            <p>
                                {filter === 'unread'
                                    ? 'Vos notifications lues restent accessibles dans Toutes.'
                                    : 'Les mises à jour de vos cours, de vos démarches et de vos finances apparaîtront ici.'}
                            </p>
                        </div>
                    )}
                    <Pagination value={items} preserveScroll={false} />
                </section>
            </div>
        </Dashboard>
    );
}
