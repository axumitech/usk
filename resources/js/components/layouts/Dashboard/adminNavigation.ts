import {
    BookOpen,
    CalendarDays,
    ClipboardCheck,
    FileText,
    Landmark,
    LayoutDashboard,
    Megaphone,
    NotebookPen,
    Settings,
    Wallet,
    type LucideIcon,
} from 'lucide-react';

type Destination = { href: string; anyPermission?: string[]; institutionWide?: boolean; native?: boolean };
type Entry = [label: string, destination: Destination];
type AdminGroup = { id: string; title: string; shortLabel: string; icon: LucideIcon; items: Entry[] };
type AdminActor = { permissions?: string[]; hasAcademicFacultyScope?: boolean; delegatedAreas?: string[] | null };

const dashboard = '/app/dashboard';
const admin = `${dashboard}/admin`;
const access = 'manage academic access';
const publish = 'publish academic content';
const finance = 'manage academic finance';
const settings = 'configure settings';
const destination = (path: string, ...anyPermission: string[]): Destination => ({ href: `${admin}/${path}`, anyPermission });
const institutionWide = (path: string, ...anyPermission: string[]): Destination => ({
    ...destination(path, ...anyPermission),
    institutionWide: true,
});
const studentPermissions = [access, finance, publish];

export const adminNavigation: AdminGroup[] = [
    {
        id: 'tableau-de-bord',
        title: 'Tableau de bord',
        shortLabel: 'Accueil',
        icon: LayoutDashboard,
        items: [['Vue d’ensemble', { href: dashboard }]],
    },
    {
        id: 'structure',
        title: 'Structure institutionnelle',
        shortLabel: 'Structure',
        icon: Landmark,
        items: [
            ['Université', institutionWide('academic-structure?tab=institution', access, publish)],
            ['Facultés et départements', destination('faculties', access, publish, 'faculties.create', 'faculties.update')],
            ['Cycles, programmes et promotions', destination('academic-structure?tab=programs', access, publish)],
            ['Niveaux', destination('levels', access, publish)],
        ],
    },
    {
        id: 'preparation',
        title: 'Préparation académique',
        shortLabel: 'Préparation',
        icon: CalendarDays,
        items: [
            ['Années académiques', destination('academic-years', access, publish)],
            ['Maquettes pédagogiques', destination('academic-structure?tab=curriculum', access, publish)],
            ['Catalogue des cours', destination('course-catalog', access, publish)],
            ['Semestres et périodes', destination('academic-years/semesters', publish)],
            ['Calendrier académique', destination('academic-years/calendar', publish)],
            ['Horaires et séances', destination('schedule', publish)],
            ['Salles et disponibilités', institutionWide('schedule/resources', publish)],
        ],
    },
    {
        id: 'admissions',
        title: 'Admissions et scolarité',
        shortLabel: 'Scolarité',
        icon: ClipboardCheck,
        items: [
            ['Campagnes d’admission', destination('enrollments/campaigns', access)],
            ['Candidatures', destination('enrollments', access)],
            ['Suivi des admissions', destination('enrollments/overview', access)],
            ['Dossiers à traiter', destination('enrollments?queue=new', access)],
            ['Décisions d’admission', destination('enrollments?queue=decisions', access)],
            ['Inscriptions et situations', destination('student-academic/administration', ...studentPermissions)],
            ['Dossiers étudiants', destination('student-academic?tab=students', ...studentPermissions)],
            ['Historique des inscriptions', destination('student-academic?tab=students&history=1', ...studentPermissions)],
            ['Clôture administrative', institutionWide('student-academic/administration/closure', access)],
        ],
    },
    {
        id: 'finances',
        title: 'Finances',
        shortLabel: 'Finances',
        icon: Wallet,
        items: [
            ['Barèmes des frais', destination('finance/tariffs', finance)],
            ['Comptes, échéances et paiements', destination('finance', finance)],
            ['Justificatifs de paiement', destination('finance/payment-proofs', finance)],
            ['Suivi des confirmations', destination('finance/confirmations', finance)],
        ],
    },
    {
        id: 'enseignement',
        title: 'Enseignement',
        shortLabel: 'Enseignement',
        icon: BookOpen,
        items: [
            ['Enseignants et affectations', destination('professors', publish, 'manage users')],
            ['Offres et inscriptions pédagogiques', destination('teaching', access, publish)],
            ['Supports pédagogiques', destination('teaching/resources', publish)],
            ['Rapports de présence', destination('schedule/reports', access, publish)],
            ['Justifications d’absence', destination('schedule/absences', access)],
        ],
    },
    {
        id: 'evaluations',
        title: 'Évaluations et résultats',
        shortLabel: 'Évaluations',
        icon: NotebookPen,
        items: [
            ['Évaluations, devoirs et corrections', destination('assessments', publish)],
            ['Résultats pédagogiques transmis', { ...destination('assessments/handoff', publish), native: true }],
            [
                'Délibérations et résultats officiels',
                destination('academic-results', 'manage academic results', 'deliberate academic results', 'publish official results'),
            ],
            ['Progression académique', destination('progression', access, publish, 'manage academic progression', 'approve academic progression')],
            ['Réinscriptions', destination('student-academic/renewals', ...studentPermissions)],
        ],
    },
    {
        id: 'documents',
        title: 'Documents et services',
        shortLabel: 'Documents',
        icon: FileText,
        items: [
            [
                'Documents officiels',
                destination('official-documents', 'manage official documents', 'approve official documents', 'issue official documents'),
            ],
            ['Modèles de cartes', destination('card-templates', access)],
            ['Demandes de carte et éligibilité', destination('card-requests', access)],
            ['Impression des cartes', destination('card-issuance/printing', access)],
            ['Délivrance des cartes', destination('card-issuance/delivery', access)],
            ['Cartes NFC', destination('card-issuance/nfc', access)],
            ['Demandes de scolarité et d’examen', destination('student-academic?tab=requests', access)],
            ['Agenda des rendez-vous', destination('student-academic/requests/agenda', access)],
        ],
    },
    {
        id: 'communication',
        title: 'Communication',
        shortLabel: 'Communication',
        icon: Megaphone,
        items: [
            ['Annonces et publications', destination('student-academic?tab=teaching', publish)],
            ['Actualités', institutionWide('posts', 'manage content')],
        ],
    },
    {
        id: 'systeme',
        title: 'Administration système',
        shortLabel: 'Système',
        icon: Settings,
        items: [
            ['Règles d’accès académique', destination('student-academic?tab=rules', access)],
            ['Paramètres du site public', institutionWide('site', settings, 'manage content')],
            ['Référencement et pages légales', institutionWide('seo', settings, 'manage content')],
        ],
    },
];

export function visibleAdminNavigation(actor?: AdminActor | null): AdminGroup[] {
    const permissions = new Set(actor?.permissions);
    const permitsArea = (href: string) => {
        if (!actor?.delegatedAreas || href === dashboard) return true;
        const path = href.split('?')[0].slice(admin.length + 1);
        const area = path.startsWith('teaching/resources') ? 'learning' : path.split('/')[0];
        return actor.delegatedAreas.includes(area === 'academic-results' ? 'results' : area);
    };

    return adminNavigation
        .map((group) => ({
            ...group,
            items: group.items.filter(
                ([, item]) =>
                    permitsArea(item.href) &&
                    (!item.institutionWide || !actor?.hasAcademicFacultyScope) &&
                    (!item.anyPermission?.length || item.anyPermission.some((permission) => permissions.has(permission))),
            ),
        }))
        .filter((group) => group.items.length > 0);
}

function navigationContext(pageUrl: string): URL {
    const url = new URL(pageUrl, 'https://navigation.invalid');
    url.pathname = url.pathname.replace(/\/$/, '');
    const tab = url.searchParams.get('tab');

    if (url.pathname === `${admin}/academic-structure` && !tab) {
        url.searchParams.set('tab', url.searchParams.get('version') ? 'curriculum' : 'programs');
    }
    if (url.pathname === `${admin}/student-academic`) {
        if (!tab) url.searchParams.set('tab', 'students');
        if (tab === 'finance') url.pathname = `${admin}/finance`;
    }
    if (url.pathname.startsWith(`${admin}/student-academic/`)) {
        const detail = url.pathname.slice(`${admin}/student-academic/`.length);
        if (/^\d+$/.test(detail) || /^requests\/\d+$/.test(detail)) {
            url.pathname = `${admin}/student-academic`;
            url.searchParams.set('tab', detail.startsWith('requests/') ? 'requests' : 'students');
        } else if (detail === 'requests/availability') {
            url.pathname = `${admin}/student-academic/requests/agenda`;
        }
    }
    if (url.pathname === `${admin}/enrollments`) {
        const queue = url.searchParams.get('queue') ?? '';
        if (url.searchParams.get('reexamination') === '1' || ['review', 'corrections', 'reexamined'].includes(queue))
            url.searchParams.set('queue', 'new');
        if (['admitted', 'refused'].includes(queue)) url.searchParams.set('queue', 'decisions');
    }

    return url;
}

export function activeAdminDestination(groups: AdminGroup[], pageUrl?: string): { groupId: string; href: string } | null {
    if (!pageUrl) return null;
    const current = navigationContext(pageUrl);
    let best: { groupId: string; href: string; specificity: number } | undefined;

    for (const group of groups) {
        for (const [, item] of group.items) {
            const target = new URL(item.href, current);
            const pathMatches =
                target.pathname === current.pathname || (target.pathname !== dashboard && current.pathname.startsWith(`${target.pathname}/`));
            const queryMatches = Array.from(target.searchParams).every(([key, value]) => current.searchParams.get(key) === value);
            if (!pathMatches || !queryMatches) continue;

            const specificity = target.pathname.length + target.searchParams.size;
            if (!best || specificity > best.specificity) best = { groupId: group.id, href: item.href, specificity };
        }
    }

    return best ? { groupId: best.groupId, href: best.href } : null;
}
