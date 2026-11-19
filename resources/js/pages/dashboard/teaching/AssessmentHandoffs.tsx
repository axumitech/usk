import Pagination from '@/components/admin/Pagination';
import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import { dateTime, participationLabels, type Page } from '@/pages/dashboard/teaching/types';
import { Head, Link } from '@inertiajs/react';
import { ArrowRight, BookOpen, ClipboardList, History } from 'lucide-react';
import '../../../../css/dashboard/assessment-handoffs.css';
import '../../../../css/dashboard/student-academic.css';

type Transmission = {
    id: number;
    revision: number;
    current: boolean;
    assessment: string;
    course: string | null;
    student: string;
    session: string | null;
    participation: string | null;
    points: number | null;
    maximum: number | null;
    validated_at: string | null;
    assessment_url: string;
};

const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

function grade(row: Transmission) {
    if (row.points === null) return 'Sans note';
    const score = number.format(row.points / 100);
    return row.maximum === null ? score : `${score} / ${number.format(row.maximum / 100)}`;
}

export default function AssessmentHandoffs({ transmissions }: { transmissions: Page<Transmission> }) {
    return (
        <Dashboard hideAppsNavigation>
            <Head title="Résultats pédagogiques transmis" />
            <article className="handoff-register" aria-labelledby="handoff-title">
                <header className="directory-heading">
                    <div>
                        <h1 id="handoff-title">Résultats pédagogiques transmis</h1>
                        <p>Chaque validation de correction enregistre la version de la note transmise au service des résultats.</p>
                    </div>
                    <div className="directory-heading-actions">
                        <Link href={route('dashboard.admin.assessments.index')}>
                            <BookOpen aria-hidden="true" size={17} /> Évaluations et corrections <ArrowRight aria-hidden="true" size={16} />
                        </Link>
                    </div>
                </header>
                <section className="handoff-panel" aria-labelledby="handoff-journal">
                    <header>
                        <h2 id="handoff-journal">
                            <History aria-hidden="true" size={20} /> Journal des transmissions
                        </h2>
                        <span>
                            {number.format(transmissions.total)} transmission{transmissions.total > 1 ? 's' : ''}
                        </span>
                    </header>
                    {transmissions.data.length ? (
                        <ul className="handoff-list" aria-label="Transmissions de notes">
                            {transmissions.data.map((row) => (
                                <li key={row.id}>
                                    <div className="handoff-reference">
                                        <small>Transmission n° {row.id}</small>
                                        <h3>
                                            <Link href={row.assessment_url}>
                                                {row.assessment} <ArrowRight aria-hidden="true" size={15} />
                                            </Link>
                                        </h3>
                                        <p>{[row.course, row.session && `Session ${row.session}`].filter(Boolean).join(' · ')}</p>
                                    </div>
                                    <dl>
                                        <div>
                                            <dt>Étudiant</dt>
                                            <dd>{row.student}</dd>
                                        </div>
                                        <div>
                                            <dt>Note transmise</dt>
                                            <dd className="handoff-grade">{grade(row)}</dd>
                                            {row.participation && participationLabels[row.participation] && (
                                                <dd>{participationLabels[row.participation]}</dd>
                                            )}
                                        </div>
                                        <div>
                                            <dt>Version {row.revision}</dt>
                                            <dd className="handoff-state" data-current={row.current}>
                                                {row.current ? 'En vigueur' : 'Historique'}
                                            </dd>
                                            {row.validated_at && (
                                                <dd>
                                                    <time dateTime={row.validated_at}>{dateTime(row.validated_at)}</time>
                                                </dd>
                                            )}
                                        </div>
                                    </dl>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="handoff-empty">
                            <ClipboardList size={19} aria-hidden="true" /> Aucune transmission à afficher.
                        </p>
                    )}
                    <Pagination value={transmissions} preserveScroll={false} />
                </section>
            </article>
        </Dashboard>
    );
}
