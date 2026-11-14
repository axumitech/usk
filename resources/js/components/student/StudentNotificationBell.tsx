import { Link, usePage, usePoll } from '@inertiajs/react';
import { Bell } from 'lucide-react';
import '../../../css/dashboard/admin-notifications.css';
import { studentHref } from './navigation';

export default function StudentNotificationBell({ academic, active }: { academic?: number | null; active?: boolean }) {
    const { studentNotifications } = usePage<{ studentNotifications?: { unread_count: number } | null }>().props;
    usePoll(30000, { only: ['studentNotifications'] });
    const unread = studentNotifications?.unread_count ?? 0;

    return (
        <div className="admin-notifications">
            <Link
                href={studentHref('notifications', academic ?? undefined)}
                className="admin-notifications-toggle"
                aria-label={unread === 0 ? 'Notifications' : `Notifications, ${unread} non ${unread === 1 ? 'lue' : 'lues'}`}
                aria-current={active ? 'page' : undefined}
            >
                <Bell size={20} aria-hidden="true" />
                {unread > 0 && <span aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
            </Link>
        </div>
    );
}
