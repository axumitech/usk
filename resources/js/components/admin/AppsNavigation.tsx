import { visibleAdminNavigation } from '@/components/layouts/Dashboard/adminNavigation';
import { Link, usePage } from '@inertiajs/react';
import { BookOpen, CalendarDays, Files, GraduationCap, Layers3, Users } from 'lucide-react';
const apps = [
    { component: 'seo', label: 'Référencement', href: '/app/dashboard/admin/seo', icon: BookOpen },
    { component: 'schedule', label: 'Horaires', href: '/app/dashboard/admin/schedule', icon: CalendarDays },
    { component: 'professors', label: 'Enseignants', href: '/app/dashboard/admin/professors', icon: Users },
    {
        component: 'studentAcademic',
        label: 'Nos étudiants',
        href: '/app/dashboard/admin/student-academic?tab=students',
        icon: Files,
    },
    {
        component: 'adminEnrollments',
        label: 'Candidatures',
        href: '/app/dashboard/admin/enrollments',
        icon: Files,
    },
    { component: 'academicYear', label: 'Années académiques', href: '/app/dashboard/admin/academic-years', icon: CalendarDays },
    { component: 'faculties', label: 'Facultés', href: '/app/dashboard/admin/faculties', icon: GraduationCap },
    { component: 'levels', label: 'Niveaux', href: '/app/dashboard/admin/levels', icon: Layers3 },
    { component: 'blog', label: 'Actualités', href: '/app/dashboard/admin/posts', icon: BookOpen },
];
export default function AppsNavigation() {
    const { component, props } = usePage<{ auth?: { user?: { permissions?: string[]; hasAcademicFacultyScope?: boolean } | null } }>();
    const current = component.split('/')[1];
    const allowed = new Set(visibleAdminNavigation(props.auth?.user).flatMap((group) => group.items.map(([, item]) => item.href)));
    const links = apps.filter(({ href }) => allowed.has(href));
    if (!links.length) return null;
    return (
        <div className="admin-apps-context">
            <div className="admin-apps-eyebrow">
                <span /> ADMINISTRATION USK <span className="admin-apps-context-divider">/</span> APPS
            </div>
            <nav aria-label="Applications de l’administration">
                {links.map(({ component: section, label, href, icon: Icon }) => (
                    <Link key={section} href={href} aria-current={section === current ? 'page' : undefined}>
                        <Icon size={16} />
                        {label}
                    </Link>
                ))}
            </nav>
        </div>
    );
}
