import StudentNotificationBell from '@/components/student/StudentNotificationBell';
import { usk } from '@/lib/usk';
import { Link, router } from '@inertiajs/react';
import * as Dialog from '@radix-ui/react-dialog';
import { BookOpen, CalendarDays, ChevronDown, ClipboardCheck, House, LockKeyhole, UserRound, Wallet, X } from 'lucide-react';
import { useState } from 'react';
import '../../../css/student-chrome.css';
import { studentHref, studentSectionAccess } from './navigation';
import type { Permission } from './types';

export type StudentChromeData = {
    name: string;
    matricule: string | null;
    photo_url: string | null;
    academic_id: number | null;
    current_year_id: number | null;
    options: { id: number; year_id: number; year: string; label: string; is_current: boolean }[];
    permissions: Record<string, Permission>;
};

const tabs = [
    { section: 'overview', label: 'Accueil', icon: House },
    { section: 'courses', label: 'Cours', icon: BookOpen },
    { section: 'results', label: 'Résultats', icon: ClipboardCheck },
    { section: 'fees', label: 'Finances', icon: Wallet },
    { section: 'profile', label: 'Profil', icon: UserRound },
];

const tabGroups: Record<string, string[]> = {
    overview: ['announcements', 'notifications', 'services', 'requests'],
    courses: ['program', 'academics', 'schedule', 'absences', 'materials', 'assignments', 'evaluations', 'course-detail'],
    results: ['assessments'],
    fees: ['transactions'],
    profile: ['card', 'documents', 'pathway'],
};

export function studentChromeHref(section: string, academic?: number | null) {
    if (academic != null && (section === 'enrollments' || section === 'absences')) {
        return `/app/dashboard/student/${section}?academic=${academic}`;
    }
    return studentHref(section, academic ?? undefined);
}

export function studentChromeSection(url: string) {
    const [, section = 'overview'] = url.split(/[?#]/, 1)[0].split('/student/');
    if (!section) return 'overview';
    if (/^courses\/[^/]/.test(section)) return 'course-detail';
    if (/^(program|materials)\//.test(section)) return section.split('/')[0];
    if (section.startsWith('submissions/')) return 'assignments';
    return section.replace(/\/$/, '');
}

function yearDestination(section: string) {
    // Keep the selected module when it has an entry point for the new year.
    const destinations = [
        'overview',
        'program',
        'academics',
        'services',
        'schedule',
        'materials',
        'assignments',
        'evaluations',
        'announcements',
        'notifications',
        'enrollments',
        'absences',
        'fees',
        'transactions',
        'profile',
        'pathway',
        'card',
        'documents',
        'requests',
    ];
    return destinations.includes(section) ? section : section === 'course-detail' ? 'academics' : 'overview';
}

export function StudentYearSelect({ context, section, className }: { context: StudentChromeData; section: string; className?: string }) {
    const [pending, setPending] = useState(false);
    return (
        <select
            className={className}
            aria-label="Année académique affichée"
            value={context.academic_id ?? ''}
            disabled={pending}
            onChange={(event) => {
                setPending(true);
                router.visit(studentChromeHref(yearDestination(section), Number(event.target.value)), {
                    onFinish: () => setPending(false),
                });
            }}
        >
            {context.options.map((option) => (
                <option key={option.id} value={option.id}>
                    {option.label}
                    {option.is_current ? ' (année en cours)' : ''}
                </option>
            ))}
        </select>
    );
}

export function StudentTopHeader({ context, section, layout }: { context: StudentChromeData; section: string; layout?: 'profile' }) {
    const selected = context.options.find((option) => option.id === context.academic_id);
    const sameYearCount = context.options.filter((option) => option.year_id === selected?.year_id).length;
    const archived = Boolean(selected && !selected.is_current);
    const initials = context.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();
    const [brokenPhoto, setBrokenPhoto] = useState<string | null>(null);

    if (layout === 'profile') {
        return (
            <header className="student-app-header student-app-profile-header" data-year-state={archived ? 'archive' : 'current'}>
                <div className="student-app-header-inner">
                    <Link className="student-app-brand" href={studentChromeHref('overview', context.academic_id)}>
                        <img src={usk.logo} alt="" width={42} height={42} />
                        <span>
                            <strong>USK</strong>
                            <small>{usk.name}</small>
                        </span>
                    </Link>
                    <StudentNotificationBell academic={context.academic_id} active={section === 'notifications'} />
                </div>
            </header>
        );
    }

    return (
        <header className="student-app-header" data-year-state={archived ? 'archive' : 'current'}>
            <div className="student-app-header-inner">
                <Link className="student-app-avatar" href={studentChromeHref('profile', context.academic_id)} aria-label="Voir mon profil">
                    {context.photo_url && brokenPhoto !== context.photo_url ? (
                        <img src={context.photo_url} alt="" width={48} height={48} onError={() => setBrokenPhoto(context.photo_url)} />
                    ) : (
                        initials || <UserRound size={23} aria-hidden="true" />
                    )}
                </Link>
                <div className="student-app-identity">
                    <strong>{context.name}</strong>
                    <span>{context.matricule ? `Matricule · ${context.matricule}` : 'Matricule non attribué'}</span>
                </div>
                <StudentNotificationBell academic={context.academic_id} active={section === 'notifications'} />
                {selected && (
                    <label className="student-app-year">
                        <CalendarDays size={17} aria-hidden="true" />
                        <span>
                            <small>
                                {selected.is_current
                                    ? 'Année en cours'
                                    : context.current_year_id === null
                                      ? 'Aucune année ouverte'
                                      : 'Année hors période active'}
                            </small>
                            <strong aria-hidden="true">{sameYearCount > 1 ? selected.label : selected.year}</strong>
                        </span>
                        <ChevronDown size={15} aria-hidden="true" />
                        <StudentYearSelect context={context} section={section} />
                    </label>
                )}
            </div>
        </header>
    );
}

export function StudentBottomNav({ context, section }: { context: StudentChromeData; section: string }) {
    const [locked, setLocked] = useState<{ label: string; reason: string | null } | null>(null);
    const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);

    return (
        <>
            <nav className="student-bottom-nav" aria-label="Navigation principale de l’espace étudiant">
                <div>
                    {tabs.map(({ section: target, label, icon: Icon }) => {
                        const access = studentSectionAccess(target, context.permissions);
                        const active = section === target || tabGroups[target]?.includes(section);
                        const contents = (
                            <>
                                <Icon size={23} strokeWidth={active ? 2.5 : 1.9} aria-hidden="true" />
                                <span>{label}</span>
                            </>
                        );
                        if (!access.visible || !access.allowed) {
                            return (
                                <button
                                    type="button"
                                    key={target}
                                    aria-label={`${label} : accès indisponible`}
                                    aria-haspopup="dialog"
                                    onClick={(event) => {
                                        setTrigger(event.currentTarget);
                                        setLocked({ label, reason: access.visible ? access.reason : null });
                                    }}
                                >
                                    {contents}
                                </button>
                            );
                        }
                        return (
                            <Link key={target} href={studentChromeHref(target, context.academic_id)} aria-current={active ? 'page' : undefined}>
                                {contents}
                            </Link>
                        );
                    })}
                </div>
            </nav>
            <Dialog.Root
                open={locked !== null}
                onOpenChange={(open) => {
                    if (!open) setLocked(null);
                }}
            >
                <Dialog.Portal>
                    <Dialog.Overlay className="student-sheet-overlay" />
                    <Dialog.Content
                        className="student-sheet"
                        onCloseAutoFocus={(event) => {
                            event.preventDefault();
                            trigger?.focus();
                        }}
                    >
                        <div className="student-sheet-grip" aria-hidden="true" />
                        <div className="student-sheet-heading">
                            <Dialog.Title>
                                <LockKeyhole size={20} aria-hidden="true" />
                                {locked?.label}
                            </Dialog.Title>
                            <Dialog.Close aria-label="Fermer">
                                <X size={21} aria-hidden="true" />
                            </Dialog.Close>
                        </div>
                        <Dialog.Description>{locked?.reason || 'Cet accès est indisponible pour l’inscription affichée.'}</Dialog.Description>
                        <Dialog.Close asChild>
                            <Link className="student-sheet-item" href={studentChromeHref('requests', context.academic_id)}>
                                Contacter l’assistance
                            </Link>
                        </Dialog.Close>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </>
    );
}
