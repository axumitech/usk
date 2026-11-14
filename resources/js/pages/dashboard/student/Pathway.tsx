import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import { ProfileSubpageHeading } from '@/components/student/ProfilePageHeading';
import { labels } from '@/components/student/types';
import { Head, Link } from '@inertiajs/react';
import { ArrowUpRight, BookOpen, CalendarDays, Check, ChevronDown, Compass, Flag, GraduationCap, MapPin, Pause, Route } from 'lucide-react';
import '../../../../css/student-pathway.css';

type Attempt = {
    id: number;
    year: string;
    status: string;
    selected: boolean;
    current: boolean;
    result: { label: string; url: string } | null;
    transition: { label: string; level: string; year: string } | null;
    milestones: string[];
};

const states = {
    current: { icon: MapPin, label: 'En cours' },
    passed: { icon: Check, label: 'Validé' },
    attended: { icon: BookOpen, label: 'Au dossier' },
    pending: { icon: Flag, label: 'Inscription à venir ou en traitement' },
    planned: { icon: Flag, label: 'Prévu au programme' },
    not_recorded: { icon: BookOpen, label: 'Aucune inscription' },
    interrupted: { icon: Pause, label: 'Interrompu' },
} as const;

type Level = {
    id: number;
    code: string | null;
    title: string;
    state: keyof typeof states;
    attempts: Attempt[];
};

type Program = { id: string; title: string; cycle: string | null; degree: string | null; levels: Level[] };

type Pathway = {
    academic_id: number;
    current: { id: number; level: string; year: string; faculty: string } | null;
    counts: { years: number; levels: number; validated: number };
    programs: Program[];
};

function EnrollmentDetails({ attempt }: { attempt: Attempt }) {
    const label =
        { on_leave: 'Congé académique', withdrawn: 'Abandon', suspended: 'Suspendue' }[attempt.status] ?? labels[attempt.status] ?? attempt.status;
    return (
        <li className="pathway-attempt">
            <div className="pathway-attempt-year">
                <CalendarDays size={15} aria-hidden="true" />
                <strong>{attempt.year}</strong>
                <span>
                    {['on_leave', 'withdrawn', 'under_review', 'correction_required'].includes(attempt.status)
                        ? label
                        : `Inscription ${label.toLocaleLowerCase('fr')}`}
                </span>
                {attempt.selected && !attempt.current && <span className="pathway-selected">Année affichée</span>}
            </div>
            {attempt.result && (
                <Link className="pathway-result" href={attempt.result.url}>
                    Résultat officiel · {attempt.result.label} <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
            )}
            {attempt.transition && (
                <div className="pathway-transition">
                    <Flag size={15} aria-hidden="true" />
                    <span>
                        <strong>{attempt.transition.label}</strong>
                        <small>
                            {attempt.transition.level} · {attempt.transition.year}
                        </small>
                    </span>
                </div>
            )}
            {attempt.milestones.length > 0 && <p className="pathway-milestones">{attempt.milestones.join(' · ')}</p>}
        </li>
    );
}

function LevelStop({ level }: { level: Level }) {
    const { icon: Icon, label } = states[level.state];
    const latest = level.attempts.at(-1);
    const oneAttempt = level.attempts.length === 1;
    return (
        <li className="pathway-stop" data-state={level.state}>
            <span className="pathway-marker">
                <Icon size={21} aria-hidden="true" />
            </span>
            <article className="pathway-level">
                <div className="pathway-level-top">
                    <div>
                        {level.code && level.code.toLocaleLowerCase('fr') !== level.title.toLocaleLowerCase('fr') && (
                            <span className="pathway-code">{level.code}</span>
                        )}
                        <h3>{level.title}</h3>
                    </div>
                    <span className="pathway-state">{label}</span>
                </div>
                {latest && oneAttempt && (
                    <ul className="pathway-attempts">
                        <EnrollmentDetails attempt={latest} />
                    </ul>
                )}
                {latest && !oneAttempt && (
                    <details className="pathway-history" open={level.state === 'current' ? true : undefined}>
                        <summary>
                            <CalendarDays size={15} aria-hidden="true" /> {level.attempts.length} inscriptions{' '}
                            <ChevronDown size={16} aria-hidden="true" />
                        </summary>
                        <ul className="pathway-attempts">
                            {level.attempts.map((attempt) => (
                                <EnrollmentDetails key={attempt.id} attempt={attempt} />
                            ))}
                        </ul>
                    </details>
                )}
                {!latest && level.state === 'pending' && (
                    <p className="pathway-placeholder">Une décision de progression figure dans les étapes précédentes.</p>
                )}
            </article>
        </li>
    );
}

export default function Pathway({ pathway }: { pathway: Pathway }) {
    const { academic_id: academic, current, counts, programs } = pathway;
    return (
        <Dashboard>
            <Head title="Parcours académique" />
            <div className="sp-page pathway-page">
                <ProfileSubpageHeading academic={academic} title="Parcours académique" />
                <div className="pathway-content">
                    <section className="pathway-hero" aria-labelledby="pathway-overview">
                        <div className="pathway-hero-copy">
                            <span className="pathway-hero-icon">
                                <Compass size={23} aria-hidden="true" />
                            </span>
                            <div>
                                <h2 id="pathway-overview">{current ? 'Vous êtes ici' : 'Votre chemin universitaire'}</h2>
                                {current ? (
                                    <>
                                        <p className="pathway-current-level">{current.level}</p>
                                        <p>
                                            {current.year} · {current.faculty}
                                        </p>
                                    </>
                                ) : (
                                    <p>Retrouvez les niveaux et les inscriptions de votre dossier.</p>
                                )}
                            </div>
                        </div>
                        <dl className="pathway-counts" aria-label="Repères du parcours">
                            <div>
                                <dt>Années au dossier</dt>
                                <dd>{counts.years}</dd>
                            </div>
                            <div>
                                <dt>Niveaux au dossier</dt>
                                <dd>{counts.levels}</dd>
                            </div>
                            <div>
                                <dt>Niveaux validés</dt>
                                <dd>{counts.validated}</dd>
                            </div>
                        </dl>
                    </section>
                    {programs.map((program) => (
                        <section key={program.id} className="pathway-program" aria-labelledby={`pathway-${program.id}`}>
                            <div className="pathway-program-heading">
                                <Route size={20} aria-hidden="true" />
                                <div>
                                    <h2 id={`pathway-${program.id}`}>{program.title}</h2>
                                    {program.cycle && <p>{program.cycle}</p>}
                                </div>
                            </div>
                            <ol className="pathway-route">
                                {program.levels.map((level) => (
                                    <LevelStop key={level.id} level={level} />
                                ))}
                            </ol>
                            {program.degree && (
                                <div className="pathway-degree">
                                    <GraduationCap size={19} aria-hidden="true" />{' '}
                                    <span>
                                        Diplôme du programme <strong>{program.degree}</strong>
                                    </span>
                                </div>
                            )}
                        </section>
                    ))}
                </div>
            </div>
        </Dashboard>
    );
}
