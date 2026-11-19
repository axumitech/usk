import { labels, money } from '@/components/student/types';
import { router } from '@inertiajs/react';
import { BookOpenCheck, Building2, CalendarDays, ChartNoAxesColumn, CheckCheck, Clock3, GraduationCap, Landmark, Printer, UsersRound, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import '../../../../css/dashboard/rector.css';

type Year = { id: number; title: string; status: 'open' | 'closed' | 'draft' };
type Faculty = { code: string; name: string; students: number; enrollments: number; confirmed: number };
type Account = {
    currency: string;
    gross_cents: number;
    refunded_cents: number;
    legacy_reversal_cents: number;
    net_cents: number;
    pending_cents: number;
    due_cents: number;
    balance_cents: number;
};
type Report = {
    year_id: number;
    students: number;
    enrollments: number;
    statuses: Record<string, number>;
    faculties: Faculty[];
    finance: Account[];
    results: { students: number; in_session: number; awaiting_publication: number; published: number };
};
export type RectorProps = { indicators: Record<string, number>; years: Year[]; report: Report | null };
const yearStatus = { open: 'Ouverte', closed: 'Clôturée', draft: 'En préparation' };
const numbers = new Intl.NumberFormat('fr-FR');
const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });

function Metric({ icon, label, count, detail }: { icon: ReactNode; label: string; count: number; detail: string }) {
    return (
        <div className="rector-metric">
            <dt><span aria-hidden="true">{icon}</span>{label}</dt>
            <dd><strong>{numbers.format(count)}</strong><small>{detail}</small></dd>
        </div>
    );
}

function Finance({ accounts }: { accounts: Account[] }) {
    return (
        <section className="rector-panel" aria-labelledby="rector-finances">
            <h2 id="rector-finances"><Wallet aria-hidden="true" />Finances</h2>
            {!accounts.length && <p className="rector-empty">Aucun frais ni versement enregistré pour cette année.</p>}
            {accounts.map((account) => {
                const values = [
                    ['Versements confirmés bruts', account.gross_cents],
                    ['Remboursements exécutés', account.refunded_cents + account.legacy_reversal_cents],
                    ['Versements en attente', account.pending_cents],
                    ['Frais dus après réductions', account.due_cents],
                    ['Solde à recouvrer', account.balance_cents],
                ] as const;
                return (
                    <div key={account.currency} className="rector-account">
                        <h3>Encaissements nets · {account.currency}</h3>
                        <p className="rector-cash">{money(account.net_cents, account.currency)}</p>
                        <dl className="rector-lines">{values.map(([label, cents]) => (
                            <div key={label}><dt>{label}</dt><dd>{money(cents, account.currency)}</dd></div>
                        ))}</dl>
                    </div>
                );
            })}
        </section>
    );
}

export default function RectorDashboard({ indicators, years, report }: RectorProps) {
    const year = years.find((item) => item.id === report?.year_id);
    const statuses = Object.entries(report?.statuses ?? {}).sort(([, left], [, right]) => right - left);
    return (
        <article className="rector-report">
            <header className="rector-hero">
                <div className="rector-hero-top">
                    <div><span className="rector-hero-icon" aria-hidden="true"><Landmark /></span><h1>Rectorat</h1></div>
                    {year && <button type="button" className="rector-print" onClick={() => window.print()}><Printer aria-hidden="true" />Imprimer le rapport</button>}
                </div>
                <dl className="rector-institution">{Object.entries(indicators).map(([label, count]) => (
                    <div key={label}><dt>{label}</dt><dd>{numbers.format(count)}</dd></div>
                ))}</dl>
            </header>
            {report && year ? (
                <>
                    <div className="rector-period">
                        <div><h2>Rapport annuel</h2><p>{year.title} · {yearStatus[year.status]}</p></div>
                        <label className="rector-year"><span>Année académique</span><select value={year.id} onChange={(event) => {
                            router.get('/app/dashboard/delegation', { year: event.target.value }, { preserveScroll: true });
                        }}>{years.map((option) => <option key={option.id} value={option.id}>{option.title} · {yearStatus[option.status]}</option>)}</select></label>
                    </div>
                    <dl className="rector-metrics">
                        <Metric icon={<UsersRound />} label="Étudiants" count={report.students} detail="Profils distincts, tous statuts" />
                        <Metric icon={<GraduationCap />} label="Inscriptions académiques" count={report.enrollments} detail="Dossiers de l’année sélectionnée" />
                        <Metric icon={<CheckCheck />} label="Inscriptions confirmées" count={report.statuses.confirmed ?? 0} detail={percent.format(report.enrollments ? (report.statuses.confirmed ?? 0) / report.enrollments : 0) + ' des inscriptions'} />
                        <Metric icon={<Clock3 />} label="À confirmer" count={report.statuses.pending_confirmation ?? 0} detail="En attente de confirmation" />
                    </dl>
                    <div className="rector-columns">
                        <Finance accounts={report.finance} />
                        <section className="rector-panel" aria-labelledby="rector-results">
                            <h2 id="rector-results"><BookOpenCheck aria-hidden="true" />Résultats et jurys</h2>
                            <dl className="rector-result-top">
                                <dt>Étudiants avec un résultat publié</dt><dd>{numbers.format(report.results.students)}</dd>
                            </dl>
                            <dl className="rector-lines">
                                <div><dt>Délibérations préparées ou ouvertes</dt><dd>{numbers.format(report.results.in_session)}</dd></div>
                                <div><dt>Approuvées, en attente de publication</dt><dd>{numbers.format(report.results.awaiting_publication)}</dd></div>
                                <div><dt>Éditions de délibération publiées</dt><dd>{numbers.format(report.results.published)}</dd></div>
                            </dl>
                        </section>
                    </div>
                    <div className="rector-columns">
                        <section className="rector-panel" aria-labelledby="rector-faculties">
                            <h2 id="rector-faculties"><Building2 aria-hidden="true" />Effectifs par faculté</h2>
                            {report.faculties.length ? (
                                <table className="rector-table">
                                    <thead><tr><th scope="col">Faculté</th><th scope="col">Étudiants</th><th scope="col">Inscriptions</th><th scope="col">Confirmées</th></tr></thead>
                                    <tbody>{report.faculties.map((faculty) => <tr key={faculty.code}>
                                        <th scope="row">{faculty.name}</th><td>{numbers.format(faculty.students)}</td><td>{numbers.format(faculty.enrollments)}</td><td>{numbers.format(faculty.confirmed)}</td>
                                    </tr>)}</tbody>
                                </table>
                            ) : <p className="rector-empty">Aucune faculté à afficher pour cette année.</p>}
                        </section>
                        <section className="rector-panel" aria-labelledby="rector-statuses">
                            <h2 id="rector-statuses"><ChartNoAxesColumn aria-hidden="true" />Statuts des inscriptions</h2>
                            {statuses.length ? <dl className="rector-distribution">{statuses.map(([status, count]) => (
                                <div key={status}><dt>{labels[status] ?? status}</dt><dd><span>{numbers.format(count)}</span><small>{percent.format(count / report.enrollments)}</small></dd>
                                    <progress max={report.enrollments} value={count} aria-hidden="true" /></div>
                            ))}</dl> : <p className="rector-empty">Aucune inscription académique pour cette année.</p>}
                        </section>
                    </div>
                </>
            ) : (
                <section className="rector-panel"><h2><CalendarDays aria-hidden="true" />Rapport annuel</h2><p className="rector-empty">Le rapport sera disponible dès la création d’une année académique.</p></section>
            )}
        </article>
    );
}
