import DashboardThemeMenu from '@/components/layouts/Dashboard/DashboardThemeMenu';
import { DashboardDepartureContext } from '@/components/system/DashboardDeparture';
import { Link } from '@inertiajs/react';
import {
    ArrowLeft,
    BookOpen,
    CalendarDays,
    Camera,
    ChevronDown,
    ChevronRight,
    Compass,
    CreditCard,
    FilePenLine,
    FolderOpen,
    GraduationCap,
    KeyRound,
    Layers,
    LogOut,
    Settings2,
    SunMoon,
    UserRound,
} from 'lucide-react';
import { useContext, useState } from 'react';
import '../../../css/student-profile-page.css';
import { studentHref } from './navigation';
import { StudentYearSelect, type StudentChromeData } from './StudentChrome';
import { labels, type Academic } from './types';

export function studentProfileHref(academic: number, view?: 'personal' | 'photo' | 'settings') {
    const profile = studentHref('profile', academic);
    if (view === 'photo') return `${profile}&view=photo#profile-section-photo`;
    return view ? `${profile}&view=${view}` : profile;
}

export function ProfileSubpageHeading({ academic, title }: { academic: number; title: string }) {
    return (
        <header className="sp-subpage-heading">
            <Link href={studentProfileHref(academic)} aria-label="Retour à mon profil">
                <ArrowLeft size={21} aria-hidden="true" />
            </Link>
            <h1>{title}</h1>
        </header>
    );
}

export default function ProfilePageHeading({
    academic,
    yearCount,
    context,
}: {
    academic: Academic;
    yearCount: number;
    context?: StudentChromeData | null;
}) {
    const { logout, phase } = useContext(DashboardDepartureContext);
    const [brokenPhoto, setBrokenPhoto] = useState<string>();
    const initials = academic.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((name) => name[0])
        .join('')
        .toLocaleUpperCase('fr');
    const rows = [
        { title: 'Informations personnelles', icon: UserRound, href: studentProfileHref(academic.id, 'personal') },
        { title: 'Parcours académique', icon: GraduationCap, href: studentHref('pathway', academic.id) },
        { title: 'Documents', icon: FolderOpen, href: studentHref('documents', academic.id) },
        { title: 'Démarches liées à mon dossier', icon: FilePenLine, href: `${studentHref('services', academic.id)}&category=identity` },
        { title: 'Paramètres du compte', icon: Settings2, href: studentProfileHref(academic.id, 'settings') },
    ];

    return (
        <div className="sp-overview">
            <header className="sp-cover">
                <h1>Mon profil</h1>
            </header>
            <div className="sp-content">
                <section className="sp-identity" aria-label="Identité étudiante">
                    <div className="sp-portrait-wrap">
                        <div className="sp-portrait">
                            {academic.photo_url && academic.photo_url !== brokenPhoto ? (
                                <img src={academic.photo_url} alt="" onError={() => setBrokenPhoto(academic.photo_url ?? undefined)} />
                            ) : (
                                <span aria-hidden="true">{initials || <UserRound size={43} />}</span>
                            )}
                        </div>
                        <Link className="sp-camera" href={studentProfileHref(academic.id, 'photo')} aria-label="Modifier ma photo de profil">
                            <Camera size={17} aria-hidden="true" />
                        </Link>
                    </div>
                    <p className="sp-name">{academic.name}</p>
                    <p className="sp-matricule">{academic.matricule ? `Matricule : ${academic.matricule}` : 'Matricule non attribué'}</p>
                    <div className="sp-badges">
                        <span>
                            <GraduationCap size={16} aria-hidden="true" />{' '}
                            {academic.student_status === 'active' ? 'Étudiant' : (labels[academic.student_status] ?? academic.student_status)}
                        </span>
                        <span>
                            <Layers size={15} aria-hidden="true" /> {academic.level}
                        </span>
                    </div>
                    <dl className="sp-study" aria-label="Repères académiques">
                        <div>
                            <dt>Années</dt>
                            <dd>
                                <BookOpen size={18} aria-hidden="true" /> {yearCount}
                            </dd>
                        </div>
                        <div>
                            <dt>Niveau</dt>
                            <dd>
                                <GraduationCap size={18} aria-hidden="true" /> {academic.level}
                            </dd>
                        </div>
                        <div className="sp-study-year">
                            <dt>Année académique</dt>
                            <dd>
                                <CalendarDays size={18} aria-hidden="true" /> {academic.year}
                                {context && context.options.length > 1 && (
                                    <>
                                        <ChevronDown size={13} aria-hidden="true" />
                                        <StudentYearSelect context={context} section="profile" className="sp-year-select" />
                                    </>
                                )}
                            </dd>
                        </div>
                    </dl>
                    {academic.enrollment_status !== 'confirmed' && (
                        <p className="sp-enrollment">Inscription {labels[academic.enrollment_status]?.toLowerCase() ?? academic.enrollment_status}</p>
                    )}
                </section>
                <div className="sp-overview-actions">
                    <nav className="sp-nav" aria-label="Rubriques du profil">
                        {rows.map(({ title, icon: Icon, href }) => (
                            <Link key={title} className="sp-row" href={href}>
                                <span className="sp-row-icon">
                                    <Icon size={20} aria-hidden="true" />
                                </span>
                                <span>{title}</span>
                                <ChevronRight size={17} aria-hidden="true" />
                            </Link>
                        ))}
                    </nav>
                    <button
                        className="sp-row sp-logout"
                        type="button"
                        disabled={phase !== null}
                        onClick={() => {
                            if (window.confirm('Voulez-vous vous déconnecter de votre espace étudiant ?')) logout(false);
                        }}
                    >
                        <span className="sp-row-icon">
                            <LogOut size={20} aria-hidden="true" />
                        </span>
                        <span>Se déconnecter</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

export function ProfileSettings({ academic, onPassword, onGuide }: { academic: number; onPassword: () => void; onGuide: () => void }) {
    return (
        <div className="sp-settings">
            <button type="button" className="sp-row" onClick={onPassword} aria-haspopup="dialog">
                <span className="sp-row-icon">
                    <KeyRound size={20} aria-hidden="true" />
                </span>
                <span>Changer mon mot de passe</span>
                <ChevronRight size={17} aria-hidden="true" />
            </button>
            <div className="sp-row sp-theme">
                <span className="sp-row-icon">
                    <SunMoon size={20} aria-hidden="true" />
                </span>
                <span>Apparence</span>
                <DashboardThemeMenu />
            </div>
            <Link className="sp-row" href={studentHref('card', academic)}>
                <span className="sp-row-icon">
                    <CreditCard size={20} aria-hidden="true" />
                </span>
                <span>Carte étudiante</span>
                <ChevronRight size={17} aria-hidden="true" />
            </Link>
            <button type="button" className="sp-row" onClick={onGuide} aria-haspopup="dialog">
                <span className="sp-row-icon">
                    <Compass size={20} aria-hidden="true" />
                </span>
                <span>Guide de mon espace</span>
                <ChevronRight size={17} aria-hidden="true" />
            </button>
        </div>
    );
}
