import { Link } from '@inertiajs/react';
import * as Dialog from '@radix-ui/react-dialog';
import {
    CalendarCheck,
    CalendarDays,
    ChevronRight,
    ClipboardList,
    Compass,
    CreditCard,
    Landmark,
    LibraryBig,
    LockKeyhole,
    Megaphone,
    UserRound,
    X,
} from 'lucide-react';
import { studentSectionAccess } from './navigation';
import { studentChromeHref } from './StudentChrome';
import type { Permission } from './types';

const groups = [
    {
        label: 'Horaire',
        icon: CalendarDays,
        color: 'sky',
        items: [
            ['Emploi du temps', 'schedule'],
            ['Justifier une absence', 'absences'],
        ],
    },
    { label: 'Programme', icon: CalendarCheck, color: 'lime', items: [['Programme académique', 'program']] },
    {
        label: 'Évaluations',
        icon: ClipboardList,
        color: 'lilac',
        items: [
            ['Devoirs et travaux', 'assignments'],
            ['Évaluations', 'evaluations'],
            ['Suivi des évaluations et résultats', 'results'],
        ],
    },
    { label: 'Supports', icon: LibraryBig, color: 'sand', items: [['Supports de cours', 'materials']] },
    {
        label: 'Scolarité',
        icon: Landmark,
        color: 'mint',
        items: [
            ['Toutes les démarches', 'services'],
            ['Programme de formation', 'academics'],
            ['Mes inscriptions', 'enrollments'],
            ['Documents', 'documents'],
            ['Mes demandes', 'requests'],
        ],
    },
    { label: 'Annonces', icon: Megaphone, color: 'rose', items: [['Annonces de l’université', 'announcements']] },
    { label: 'Paiements', icon: CreditCard, color: 'sky', items: [['Historique et reçus', 'transactions']] },
    { label: 'Mon compte', icon: UserRound, color: 'sand', items: [['Carte étudiante', 'card']] },
] as const;

export default function StudentShortcuts({
    academic,
    permissions,
    onGuide,
}: {
    academic: number;
    permissions: Record<string, Permission>;
    onGuide: () => void;
}) {
    return (
        <section id="student-shortcuts" className="student-shortcuts" aria-labelledby="student-shortcuts-title">
            <h2 id="student-shortcuts-title">Raccourcis</h2>
            <div className="student-shortcuts-grid">
                {groups.map(({ label, icon: Icon, color, items }) => {
                    const destinations = items
                        .map(([title, section]) => ({ title, section, ...studentSectionAccess(section, permissions) }))
                        .filter((item) => item.visible);
                    if (!destinations.length) return null;
                    const account = label === 'Mon compte';
                    const contents = (
                        <>
                            <span className="student-shortcut-icon" data-color={color}>
                                <Icon size={23} strokeWidth={2} aria-hidden="true" />
                            </span>
                            <span>{label}</span>
                        </>
                    );
                    if (items.length === 1 && !account && destinations[0].allowed) {
                        return (
                            <Link key={label} className="student-shortcut-tile" href={studentChromeHref(destinations[0].section, academic)}>
                                {contents}
                            </Link>
                        );
                    }
                    return (
                        <Dialog.Root key={label}>
                            <Dialog.Trigger className="student-shortcut-tile">{contents}</Dialog.Trigger>
                            <Dialog.Portal>
                                <Dialog.Overlay className="student-sheet-overlay" />
                                <Dialog.Content className="student-sheet">
                                    <div className="student-sheet-grip" aria-hidden="true" />
                                    <div className="student-sheet-heading">
                                        <Dialog.Title>
                                            <Icon size={21} aria-hidden="true" />
                                            {label}
                                        </Dialog.Title>
                                        <Dialog.Close aria-label="Fermer">
                                            <X size={21} aria-hidden="true" />
                                        </Dialog.Close>
                                    </div>
                                    <Dialog.Description>Choisis une rubrique de ton espace étudiant.</Dialog.Description>
                                    <ul>
                                        {destinations.map((item) => (
                                            <li key={item.section}>
                                                {item.allowed ? (
                                                    <Dialog.Close asChild>
                                                        <Link className="student-sheet-item" href={studentChromeHref(item.section, academic)}>
                                                            {item.title}
                                                            <ChevronRight size={18} aria-hidden="true" />
                                                        </Link>
                                                    </Dialog.Close>
                                                ) : (
                                                    <div className="student-sheet-item is-locked">
                                                        <span>
                                                            {item.title}
                                                            <small>{item.reason || 'Accès indisponible pour cette inscription.'}</small>
                                                        </span>
                                                        <LockKeyhole size={17} aria-hidden="true" />
                                                    </div>
                                                )}
                                            </li>
                                        ))}
                                        {account && (
                                            <li>
                                                <Dialog.Close asChild>
                                                    <button
                                                        type="button"
                                                        className="student-sheet-item"
                                                        onClick={() => window.setTimeout(onGuide, 0)}
                                                    >
                                                        Guide de mon espace
                                                        <Compass size={18} aria-hidden="true" />
                                                    </button>
                                                </Dialog.Close>
                                            </li>
                                        )}
                                    </ul>
                                </Dialog.Content>
                            </Dialog.Portal>
                        </Dialog.Root>
                    );
                })}
            </div>
        </section>
    );
}
