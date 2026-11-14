import AdminNotifications from '@/components/admin/AdminNotifications';
import DashboardThemeMenu from '@/components/layouts/Dashboard/DashboardThemeMenu';
import { usk } from '@/lib/usk';
import Alert from '@/utils/sweetAlert';
import { Link } from '@inertiajs/react';
import * as Dialog from '@radix-ui/react-dialog';
import {
    BookOpen,
    CalendarDays,
    ChartNoAxesColumnIncreasing,
    ChevronRight,
    ClipboardCheck,
    House,
    Layers3,
    LayoutGrid,
    LogOut,
    Megaphone,
    Menu,
    UserRound,
    UsersRound,
    X,
} from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import '../../../css/dashboard/professor-portraits.css';
import '../../../css/dashboard/teacher-shell.css';
import ProfessorAvatar from './ProfessorAvatar';

export type TeachingIdentity = { name: string; photo_url: string | null };
export type TeachingPeriod = {
    year: number | null;
    semester: number | null;
    years: { id: number; title: string }[];
    semesters: { id: number; label: string }[];
};
export type TeachingView = 'home' | 'courses' | 'schedule' | 'students' | 'announcements';

const destinations = [
    { id: 'home', label: 'Tableau de bord', short: 'Accueil', icon: House },
    { id: 'courses', label: 'Mes cours', short: 'Cours', icon: BookOpen },
    { id: 'schedule', label: 'Emploi du temps', short: 'Planning', icon: CalendarDays },
    { id: 'assessments', label: 'Évaluations', short: 'Évaluations', icon: ClipboardCheck },
    { id: 'resources', label: 'Supports de cours', short: 'Supports', icon: Layers3 },
    { id: 'students', label: 'Étudiants', short: 'Étudiants', icon: UsersRound },
    { id: 'grades', label: 'Notes et corrections', short: 'Notes', icon: ChartNoAxesColumnIncreasing },
    { id: 'announcements', label: 'Annonces', short: 'Annonces', icon: Megaphone },
    { id: 'profile', label: 'Mon profil', short: 'Profil', icon: UserRound },
] as const;

type Destination = (typeof destinations)[number];
const homeRoute = 'dashboard.teaching.index';
const profileRoute = 'dashboard.teaching.profile';
const mobileDestinations = ['home', 'courses', 'assessments', 'resources'];

export default function TeacherShell({
    url,
    identity,
    accountName,
    permissions,
    overview,
    view,
    onLogout,
    children,
}: {
    url: string;
    identity?: TeachingIdentity | null;
    accountName: string;
    permissions: string[];
    overview?: TeachingPeriod | null;
    view?: TeachingView;
    onLogout: () => void;
    children: ReactNode;
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const mobileMenuTrigger = useRef<HTMLButtonElement | null>(null);
    const current = new URL(url, 'https://workspace.local');
    const path = current.pathname.replace(/\/$/, '');
    const query = current.searchParams;
    const year = query.get('year') ?? overview?.year;
    const semester = query.get('semester') ?? overview?.semester;
    const insideAssessment = path.startsWith('/app/dashboard/teacher/assessments');
    const active = path.endsWith('/profile')
        ? 'profile'
        : insideAssessment
          ? query.get('state') === 'closed'
              ? 'grades'
              : 'assessments'
          : path.startsWith('/app/dashboard/teacher/resources')
            ? 'resources'
            : path.startsWith('/app/dashboard/teacher/sessions')
              ? 'schedule'
              : (view ?? (query.has('offering') ? 'courses' : 'home'));
    const name = identity?.name || accountName || 'Enseignant';
    const ready = Boolean(identity?.photo_url);
    const canAssess = ready && permissions.includes('manage courses');
    const canSeeStudents = ready && permissions.includes('manage students');
    const yearFilter = year ? { year } : {};
    const period = { ...yearFilter, ...(semester ? { semester } : {}) };
    const periodYear = overview?.years.find((item) => item.id === overview.year);
    const periodSemester = overview?.semesters.find((item) => item.id === overview.semester);
    const href = (id: Destination['id']) => {
        switch (id) {
            case 'home':
                return identity && !ready ? route(profileRoute) : route(homeRoute, period);
            case 'profile':
                return identity ? route(profileRoute) : null;
            case 'assessments':
                return canAssess ? route('dashboard.teaching.assessments.index', yearFilter) : null;
            case 'grades':
                return canAssess ? route('dashboard.teaching.assessments.index', { ...yearFilter, state: 'closed' }) : null;
            case 'resources':
                return ready ? route('dashboard.teaching.learning.index', yearFilter) : null;
            case 'students':
                return canSeeStudents ? route(homeRoute, { ...period, view: id }) : null;
            default:
                return ready ? route(homeRoute, { ...period, view: id }) : null;
        }
    };
    const entries = destinations.map((entry) => ({ ...entry, href: href(entry.id) }));
    const mobileEntries = entries.filter((entry) => mobileDestinations.includes(entry.id));
    const menuItems = entries.flatMap((entry) => (entry.href ? [{ ...entry, href: entry.href }] : []));
    const activeMobile = insideAssessment ? 'assessments' : active;
    const brandUrl = href('home') ?? route(homeRoute);

    const openMenu = (trigger: HTMLButtonElement) => {
        mobileMenuTrigger.current = trigger;
        setMenuOpen(true);
    };
    const logout = async () => {
        setMenuOpen(false);
        const result = await Alert.confirm('Voulez-vous vous déconnecter de votre espace enseignant ?');
        if (result.isConfirmed) onLogout();
    };

    const menuLinks = (inDialog = false) =>
        menuItems.map(({ id, label, icon: Icon, href }) => (
            <Link
                className="teacher-shell-nav-link"
                href={href}
                aria-current={active === id ? 'page' : undefined}
                key={id}
                onClick={inDialog ? () => setMenuOpen(false) : undefined}
            >
                <Icon size={20} aria-hidden="true" />
                <span>{label}</span>
                {inDialog && <ChevronRight size={15} aria-hidden="true" />}
            </Link>
        ));

    return (
        <>
            <aside className="teacher-shell-sidebar" aria-label="Espace enseignant">
                <Link href={brandUrl} className="teacher-shell-brand" aria-label={`Tableau de bord · ${usk.name}`}>
                    <img src={usk.logo} width={43} height={43} alt="" />
                    <span>
                        <strong>USK</strong>
                        <small>{usk.name}</small>
                    </span>
                </Link>
                <div className="teacher-shell-identity">
                    {identity ? (
                        <Link href={route(profileRoute)} aria-label="Ouvrir mon profil enseignant">
                            <ProfessorAvatar name={name} photoUrl={identity.photo_url} />
                        </Link>
                    ) : (
                        <ProfessorAvatar name={name} />
                    )}
                    <strong>{name}</strong>
                    <span>Enseignant</span>
                </div>
                <nav className="teacher-shell-sidebar-nav" aria-label="Navigation enseignant">
                    {menuLinks()}
                </nav>
                {periodYear && (
                    <div className="teacher-shell-period">
                        <CalendarDays size={19} aria-hidden="true" />
                        <div>
                            <small>{periodSemester?.label ?? 'Année académique'}</small>
                            <strong>{periodYear.title}</strong>
                        </div>
                    </div>
                )}
                <button type="button" className="teacher-shell-logout" onClick={() => void logout()}>
                    <LogOut size={19} aria-hidden="true" /> Déconnexion
                </button>
            </aside>

            <header className="teacher-shell-header" data-profile={active === 'profile' || undefined}>
                <div className="teacher-shell-header-mobile">
                    <button
                        type="button"
                        className="teacher-shell-menu"
                        aria-label="Ouvrir le menu enseignant"
                        aria-haspopup="dialog"
                        aria-expanded={menuOpen}
                        onClick={(event) => openMenu(event.currentTarget)}
                    >
                        <Menu size={24} aria-hidden="true" />
                    </button>
                    <Link href={brandUrl} className="teacher-shell-brand" aria-label={`Tableau de bord · ${usk.name}`}>
                        <img src={usk.logo} width={38} height={38} alt="" />
                        <span>
                            <strong>USK</strong>
                            <small>{usk.name}</small>
                        </span>
                    </Link>
                </div>
                <div className="teacher-shell-tools">
                    <DashboardThemeMenu />
                    <AdminNotifications audience="teacher" />
                    {identity && (
                        <Link href={route(profileRoute)} className="teacher-shell-profile-link" aria-label="Mon profil enseignant">
                            <ProfessorAvatar name={name} photoUrl={identity.photo_url} />
                        </Link>
                    )}
                </div>
            </header>

            {children}

            <nav className="teacher-shell-tabs" aria-label="Navigation principale de l’espace enseignant">
                <div>
                    {mobileEntries.map(({ id, short, icon: Icon, href }) =>
                        href ? (
                            <Link key={id} href={href} aria-current={activeMobile === id ? 'page' : undefined}>
                                <Icon size={22} aria-hidden="true" />
                                <span>{short}</span>
                            </Link>
                        ) : (
                            <button type="button" key={id} disabled aria-label={`${short} : accès indisponible`}>
                                <Icon size={22} aria-hidden="true" />
                                <span>{short}</span>
                            </button>
                        ),
                    )}
                    <button
                        type="button"
                        aria-haspopup="dialog"
                        aria-expanded={menuOpen}
                        data-current={!mobileDestinations.includes(activeMobile) || undefined}
                        onClick={(event) => openMenu(event.currentTarget)}
                    >
                        <LayoutGrid size={22} aria-hidden="true" />
                        <span>Plus</span>
                    </button>
                </div>
            </nav>

            <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
                <Dialog.Portal>
                    <Dialog.Overlay className="teacher-shell-sheet-overlay" />
                    <Dialog.Content
                        className="teacher-shell-sheet"
                        onCloseAutoFocus={(event) => {
                            event.preventDefault();
                            mobileMenuTrigger.current?.focus();
                        }}
                    >
                        <div className="teacher-shell-sheet-heading">
                            <Dialog.Title>Espace enseignant</Dialog.Title>
                            <Dialog.Close aria-label="Fermer le menu">
                                <X size={23} aria-hidden="true" />
                            </Dialog.Close>
                        </div>
                        <Dialog.Description className="sr-only">Navigation de votre espace enseignant</Dialog.Description>
                        <nav aria-label="Toutes les rubriques de l’espace enseignant">{menuLinks(true)}</nav>
                        <button type="button" className="teacher-shell-logout" onClick={() => void logout()}>
                            <LogOut size={19} aria-hidden="true" /> Déconnexion
                        </button>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </>
    );
}
