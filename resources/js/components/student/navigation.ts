import { BookOpen, ClipboardCheck, House, Landmark, Library, MessagesSquare, UserRound, Wallet } from 'lucide-react';
import type { Permission, Session } from './types';

export type ScheduleView = 'week' | 'list' | 'exams';

type StudentNavigationItem = { label: string; section: string; hash?: string };
type StudentModule = {
    id: string;
    title: string;
    icon: typeof House;
    description: string;
    sections: string[];
    items: StudentNavigationItem[];
};

export const studentModules: StudentModule[] = [
    {
        id: 'overview',
        title: 'Vue d’ensemble',
        icon: House,
        description: 'Vos priorités et votre journée.',
        sections: ['overview'],
        items: [
            { label: 'Tableau de bord', section: 'overview' },
            { label: 'Horaire sur le tableau de bord', section: 'overview', hash: 'home-schedule' },
        ],
    },
    {
        id: 'academics',
        title: 'Mes études',
        icon: BookOpen,
        description: 'Votre programme et vos enseignements.',
        sections: ['academics', 'courses', 'schedule', 'program', 'attendance', 'absences', 'assignments', 'evaluations'],
        items: [
            { label: 'Programme de formation', section: 'academics' },
            { label: 'Mes cours', section: 'courses' },
            { label: 'Emploi du temps', section: 'schedule' },
            { label: 'Agenda académique', section: 'program' },
            { label: 'Mes présences', section: 'attendance' },
            { label: 'Justification des absences', section: 'absences' },
            { label: 'Devoirs et travaux', section: 'assignments' },
            { label: 'Évaluations', section: 'evaluations' },
        ],
    },
    {
        id: 'assessments',
        title: 'Résultats',
        icon: ClipboardCheck,
        description: 'Notes, crédits et décisions du jury.',
        sections: ['results', 'assessments'],
        items: [
            { label: 'Notes et bulletins', section: 'results' },
            { label: 'Évaluations et résultats', section: 'assessments' },
        ],
    },
    {
        id: 'services',
        title: 'Administration',
        icon: Landmark,
        description: 'Vos inscriptions et démarches.',
        sections: ['services', 'enrollments', 'documents', 'requests'],
        items: [
            { label: 'Scolarité', section: 'services' },
            { label: 'Inscriptions', section: 'enrollments' },
            { label: 'Documents', section: 'documents' },
            { label: 'Mes demandes', section: 'requests' },
        ],
    },
    {
        id: 'fees',
        title: 'Finances',
        icon: Wallet,
        description: 'Votre situation et vos paiements.',
        sections: ['fees', 'annual-fees', 'transactions'],
        items: [
            { label: 'Situation financière et échéancier', section: 'fees' },
            { label: 'Frais de l’année', section: 'annual-fees' },
            { label: 'Historique des paiements et reçus', section: 'transactions' },
        ],
    },
    {
        id: 'communication',
        title: 'Communication',
        icon: MessagesSquare,
        description: 'Les annonces de votre établissement.',
        sections: ['announcements'],
        items: [{ label: 'Annonces', section: 'announcements' }],
    },
    {
        id: 'resources',
        title: 'Ressources',
        icon: Library,
        description: 'Les supports de vos enseignements.',
        sections: ['materials'],
        items: [{ label: 'Supports de cours', section: 'materials' }],
    },
    {
        id: 'profile',
        title: 'Mon compte',
        icon: UserRound,
        description: 'Votre profil, votre parcours et votre carte étudiante.',
        sections: ['profile', 'pathway', 'card'],
        items: [
            { label: 'Profil', section: 'profile' },
            { label: 'Parcours académique', section: 'pathway' },
            { label: 'Carte étudiante NFC', section: 'card' },
        ],
    },
];

export const studentSectionLabels: Record<string, string> = {
    overview: 'Tableau de bord',
    profile: 'Profil',
    pathway: 'Parcours académique',
    card: 'Carte étudiante NFC',
    documents: 'Documents',
    program: 'Agenda académique',
    academics: 'Programme de formation',
    courses: 'Mes cours',
    schedule: 'Emploi du temps',
    attendance: 'Mes présences',
    absences: 'Justification des absences',
    materials: 'Supports de cours',
    assignments: 'Devoirs et travaux',
    assessments: 'Résultats',
    evaluations: 'Évaluations',
    results: 'Notes et bulletins',
    fees: 'Situation financière',
    'annual-fees': 'Frais de l’année',
    transactions: 'Historique des paiements et reçus',
    services: 'Scolarité',
    enrollments: 'Mes inscriptions académiques',
    requests: 'Mes demandes',
    announcements: 'Annonces',
    notifications: 'Notifications',
};

// Match the student page access decisions.
const pagePermissions: Record<string, string> = {
    courses: 'courses_view',
    schedule: 'schedule_view',
    attendance: 'schedule_view',
    materials: 'courses_view',
    assignments: 'courses_view',
    evaluations: 'courses_view',
    announcements: 'courses_view',
    results: 'results_view',
};

const sectionVisibility: Record<string, string> = {
    materials: 'materials_download',
    assignments: 'assignments_submit',
    evaluations: 'evaluations_participate',
};

export function studentSectionAccess(section: string, permissions?: Record<string, Permission>) {
    const pagePermission = pagePermissions[section];
    const decision = permissions?.[pagePermission];
    const visibility = permissions?.[sectionVisibility[section]];
    return {
        visible: decision?.visible !== false && visibility?.visible !== false,
        allowed: !pagePermission || decision?.allowed === true,
        reason: decision?.reason ?? (pagePermission && !decision ? 'Consultez la vue d’ensemble pour vérifier votre accès.' : null),
    };
}

export function studentHref(section: string, academic?: number, hash?: string) {
    const accountWide = section === 'enrollments' || section === 'absences';
    const context = academic !== undefined && !accountWide ? `?academic=${academic}` : '';
    return `/app/dashboard/student/${section}${context}${hash ? `#${hash}` : ''}`;
}

export function studentScheduleHref(academic: number, week?: string, day?: string, view?: ScheduleView) {
    const query = new URLSearchParams({ academic: String(academic) });
    if (week) query.set('week', week);
    if (day) query.set('day', day);
    if (view && view !== 'week') query.set('view', view);
    return `${studentHref('schedule')}?${query}`;
}

export function studentScheduledCourseHref(
    session: Session,
    academic: number,
    from: 'schedule' | 'overview',
    week?: string,
    day?: string,
    view?: ScheduleView,
) {
    if (!session.course_id) return null;
    const query = new URLSearchParams({ academic: String(academic), focus_session: String(session.id), from });
    if (week) query.set('return_week', week);
    if (day) query.set('return_day', day);
    if (view) query.set('return_view', view);
    return `${studentHref(`courses/${session.course_id}`)}?${query}`;
}
