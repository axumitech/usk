import Pagination from '@/components/admin/Pagination';
import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import { money } from '@/components/student/types';
import { Head, Link, router } from '@inertiajs/react';
import { ArrowLeft, ArrowRight, FileCheck2, Search } from 'lucide-react';
import '../../../../css/dashboard/finance.css';
import '../../../../css/dashboard/student-academic.css';
import '../../../../css/student-portal.css';

type Proof = {
    id: number;
    student: string;
    matricule: string | null;
    faculty: string;
    year: string;
    kind_label: string;
    amount_cents: number;
    currency: string;
    reference: string;
    submitted_at: string;
    second_check: boolean;
    account_url: string;
};

type Props = {
    rows: { data: Proof[]; total: number; links: { url: string | null; label: string; active: boolean }[] };
    filters: { q?: string };
};

const date = new Intl.DateTimeFormat('fr-CD', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Kinshasa' });

export default function PaymentProofs({ rows, filters }: Props) {
    const index = route('dashboard.admin.finance.proofs.index');

    return (
        <Dashboard hideAppsNavigation>
            <Head title="Justificatifs de paiement" />
            <div className="student-portal finance-workspace academic-administration">
                <header className="finance-hero">
                    <FileCheck2 className="finance-hero-watermark" strokeWidth={0.65} aria-hidden="true" />
                    <div className="finance-hero-copy">
                        <h1>Justificatifs de paiement</h1>
                        <p>Vérifiez les versements déclarés par les étudiants depuis leur compte.</p>
                        <div className="finance-hero-context">
                            <span>{rows.total} à traiter</span>
                        </div>
                    </div>
                    <Link className="finance-export" href={route('dashboard.admin.finance.index')}>
                        <ArrowLeft size={16} aria-hidden="true" /> Finances
                    </Link>
                </header>
                <form
                    key={filters.q}
                    className="portal-form finance-filters"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const q = String(new FormData(event.currentTarget).get('q') ?? '').trim();
                        router.get(index, q ? { q } : {});
                    }}
                >
                    <label className="finance-search-field">
                        Nom ou matricule
                        <input type="search" name="q" maxLength={150} defaultValue={filters.q} />
                    </label>
                    <button type="submit" className="portal-primary">
                        <Search size={16} aria-hidden="true" /> Rechercher
                    </button>
                </form>
                <section className="portal-panel finance-operational-panel" aria-label="Justificatifs en attente">
                    {rows.data.length ? (
                        <>
                            <div className="academic-table-scroll">
                                <table className="academic-table">
                                    <thead>
                                        <tr>
                                            <th scope="col">Étudiant</th>
                                            <th scope="col">Versement déclaré</th>
                                            <th scope="col">Reçu le</th>
                                            <th scope="col">Étape</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.data.map((row) => (
                                            <tr key={row.id}>
                                                <td>
                                                    <strong>{row.student}</strong>
                                                    <small>{[row.matricule, row.faculty, row.year].filter(Boolean).join(' · ')}</small>
                                                </td>
                                                <td>
                                                    <strong>{money(row.amount_cents, row.currency)}</strong>
                                                    <small>
                                                        {row.kind_label} · {row.reference}
                                                    </small>
                                                </td>
                                                <td>
                                                    <time dateTime={row.submitted_at}>{date.format(new Date(row.submitted_at))}</time>
                                                </td>
                                                <td>
                                                    <small>{row.second_check ? 'Second contrôle' : 'Justificatif à vérifier'}</small>
                                                    <Link className="finance-account-link" href={row.account_url}>
                                                        Ouvrir le compte <ArrowRight size={15} aria-hidden="true" />
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <Pagination value={rows} />
                        </>
                    ) : (
                        <p>{filters.q ? 'Aucun justificatif en attente pour cette recherche.' : 'Aucun justificatif en attente de traitement.'}</p>
                    )}
                </section>
            </div>
        </Dashboard>
    );
}
