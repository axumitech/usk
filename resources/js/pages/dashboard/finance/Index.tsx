import Pagination from '@/components/admin/Pagination';
import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import { labels, money } from '@/components/student/types';
import { Head, Link, useForm } from '@inertiajs/react';
import { ArrowRight, CalendarDays, Download, FileSpreadsheet, Filter, Landmark, Users } from 'lucide-react';
import '../../../../css/dashboard/finance.css';
import '../../../../css/dashboard/student-academic.css';
import '../../../../css/student-portal.css';
import FinanceAccount, { type Entry } from './FinanceAccount';
import type { FinanceBreakdowns } from './FinanceCharts';
import FinanceOverview, { financeReportQuery, type Cashflow, type FinanceTotal } from './FinanceOverview';

type Paginated<T> = { data: T[]; links: { url: string | null; label: string; active: boolean }[]; total?: number };
type DirectoryProps = {
    selected: null;
    entries: Paginated<Entry>;
    filters: { q?: string; year?: number; faculty?: number; program?: number; level?: number; academic?: number };
    totals: FinanceTotal[];
    cashflow: Cashflow;
    breakdowns: FinanceBreakdowns;
    years: { id: number; title: string }[];
    faculties: { id: number; name: string }[];
    programs: { id: number; name: string; faculty_id: number }[];
    levels: { id: number; title: string; faculty_id: number; faculty: { name: string } }[];
    currencies: string[];
    methods: string[];
    dualControl: boolean;
    preview: {
        account: string;
        rows: { bank_reference: string; payment_reference: string; amount_cents: number; currency: string; date: string; state: string }[];
    } | null;
};
const statusLabel = (value: string) =>
    labels[value] ||
    ({
        requested: 'Demandé',
        approved: 'Autorisé',
        executed: 'Décaissement exécuté',
        draft: 'Brouillon',
        match: 'Correspondance exacte',
        mismatch: 'Écart',
        duplicate: 'Doublon',
        unmatched: 'Sans correspondance autorisée',
        unallocated: 'Non affecté',
    }[value] ??
        value);
export default function Finance(props: DirectoryProps | React.ComponentProps<typeof FinanceAccount>) {
    return props.selected === null ? <FinanceDirectory {...props} /> : <FinanceAccount key={props.selected.id} {...props} />;
}

function FinanceDirectory(props: DirectoryProps) {
    const search = useForm({
        q: props.filters.q ?? '',
        year: String(props.filters.year ?? ''),
        faculty: String(props.filters.faculty ?? ''),
        program: String(props.filters.program ?? ''),
        level: String(props.filters.level ?? ''),
    });
    const year = props.years.find((item) => item.id === Number(props.filters.year));
    const faculty = props.faculties.find((item) => item.id === Number(props.filters.faculty));
    const entriesCount = props.entries.total ?? props.entries.data.length;
    const programs = props.programs.filter((item) => !search.data.faculty || String(item.faculty_id) === search.data.faculty);
    const levels = props.levels.filter((item) => !search.data.faculty || String(item.faculty_id) === search.data.faculty);
    const base = route('dashboard.admin.finance.index');
    const tariffsUrl = route('dashboard.admin.finance.tariffs.index', {
        year: props.filters.year,
        faculty: props.filters.faculty,
        level: props.filters.level,
    });
    const additionalFeesUrl = route('dashboard.admin.finance.tariffs.index', {
        year: props.filters.year,
        faculty: props.filters.faculty,
        level: props.filters.level,
        category: 'all',
    });
    return (
        <Dashboard hideAppsNavigation>
            <Head title="Gestion financière universitaire" />
            <div className="student-portal academic-administration finance-workspace">
                <header className="finance-hero">
                    <Landmark className="finance-hero-watermark" size={224} strokeWidth={0.65} aria-hidden="true" />
                    <div className="finance-hero-copy">
                        <h1>Finances universitaires</h1>
                        <p>Encaissements, échéances et comptes étudiants par devise.</p>
                        <div className="finance-hero-context">
                            <span>
                                <CalendarDays size={16} aria-hidden="true" /> {year?.title ?? 'Toutes les années'}
                            </span>
                            {faculty && (
                                <span>
                                    <Landmark size={16} aria-hidden="true" /> {faculty.name}
                                </span>
                            )}
                            <span>
                                <Users size={16} aria-hidden="true" /> {entriesCount.toLocaleString('fr-FR')}{' '}
                                {entriesCount === 1 ? 'compte' : 'comptes'}
                            </span>
                        </div>
                    </div>
                    <div className="finance-export-actions">
                        <Link className="finance-export" href={route('dashboard.admin.finance.proofs.index')}>
                            Justificatifs de paiement
                        </Link>
                        <Link className="finance-export" href={route('dashboard.admin.finance.confirmations')}>
                            Confirmation des inscriptions
                        </Link>
                        <a className="finance-export finance-export-xlsx" href={route('dashboard.admin.finance.export-xlsx', props.filters)}>
                            <FileSpreadsheet size={19} aria-hidden="true" /> Exporter le rapport Excel
                        </a>
                        <a className="finance-export finance-export-csv" href={route('dashboard.admin.finance.export', props.filters)}>
                            <Download size={17} aria-hidden="true" /> Exporter les totaux CSV
                        </a>
                    </div>
                </header>
                <nav className="finance-section-links" aria-label="Sections financières">
                    <a href="#reports">Suivi financier</a>
                    {props.totals.length > 0 && <a href="#finance-faculties">Recouvrement par faculté</a>}
                    <a href="#comptes">Comptes étudiants</a>
                    <Link href={tariffsUrl}>Barèmes des frais</Link>
                    <Link href={additionalFeesUrl}>Frais complémentaires</Link>
                    <a href="#reconciliation">Rapprochement</a>
                </nav>
                <form
                    id="finance-filters"
                    className="portal-form finance-filters"
                    onSubmit={(event) => {
                        event.preventDefault();
                        search.transform((data) => Object.fromEntries(Object.entries(data).filter(([, value]) => value !== '')));
                        search.get(base, { preserveScroll: true, preserveState: true });
                    }}
                >
                    <div className="finance-section-heading">
                        <h2>
                            <Filter size={18} aria-hidden="true" /> Périmètre du rapport
                        </h2>
                        <Link href={base} preserveScroll>
                            Réinitialiser
                        </Link>
                    </div>
                    <label className="finance-search-field">
                        Rechercher un étudiant
                        <input value={search.data.q} onChange={(e) => search.setData('q', e.target.value)} placeholder="Matricule, nom ou email" />
                    </label>
                    <label>
                        Année
                        <select value={search.data.year} onChange={(e) => search.setData('year', e.target.value)}>
                            <option value="">Toutes</option>
                            {props.years.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.title}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Faculté
                        <select
                            value={search.data.faculty}
                            onChange={(e) => search.setData({ ...search.data, faculty: e.target.value, program: '', level: '' })}
                        >
                            <option value="">Toutes</option>
                            {props.faculties.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Programme
                        <select value={search.data.program} onChange={(e) => search.setData('program', e.target.value)}>
                            <option value="">Tous</option>
                            {programs.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Niveau / faculté
                        <select value={search.data.level} onChange={(e) => search.setData('level', e.target.value)}>
                            <option value="">Tous</option>
                            {levels.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.faculty.name} · {v.title}
                                </option>
                            ))}
                        </select>
                    </label>
                    <button type="submit" className="portal-primary" disabled={search.processing} aria-busy={search.processing || undefined}>
                        Filtrer <ArrowRight size={16} aria-hidden="true" />
                    </button>
                </form>
                <section id="reports" className="finance-report" aria-labelledby="finance-report-title">
                    <FinanceOverview
                        totals={props.totals}
                        cashflow={props.cashflow}
                        breakdowns={props.breakdowns}
                        preferredCurrency={props.currencies[0]}
                        facultyHref={(id) => {
                            if (props.filters.faculty !== undefined && Number(props.filters.faculty) === id) return;
                            const filters = { ...props.filters, faculty: id };
                            delete filters.academic;
                            return route('dashboard.admin.finance.index', filters);
                        }}
                    />
                </section>
                <section id="comptes" className="portal-panel finance-operational-panel">
                    <div className="finance-section-heading">
                        <div>
                            <h2>Comptes étudiants</h2>
                            <p>Obligations, versements et décisions par compte.</p>
                        </div>
                    </div>
                    <div className="academic-table-scroll">
                        <table className="academic-table">
                            <thead>
                                <tr>
                                    <th>Étudiant</th>
                                    <th>Année</th>
                                    <th>Parcours</th>
                                    <th>Compte</th>
                                </tr>
                            </thead>
                            <tbody data-dashboard-panel={`${financeReportQuery} page`}>
                                {props.entries.data.map((entry) => (
                                    <tr key={entry.id}>
                                        <td>
                                            {entry.name}
                                            <small>{entry.matricule}</small>
                                        </td>
                                        <td>{entry.year}</td>
                                        <td>
                                            {entry.faculty} · {entry.program ?? entry.level}
                                        </td>
                                        <td>
                                            <Link
                                                className="finance-account-link"
                                                href={route('dashboard.admin.finance.index', { ...props.filters, academic: entry.id })}
                                            >
                                                Consulter le compte financier <ArrowRight size={15} aria-hidden="true" />
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                                {props.entries.data.length === 0 && (
                                    <tr>
                                        <td colSpan={4}>Aucun compte ne correspond à ces filtres.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <Pagination value={props.entries} preserveScroll preserveState />
                </section>
                <section className="portal-panel finance-operational-panel" id="tariffs">
                    <h2>Barèmes des frais</h2>
                    <Link href={tariffsUrl} className="finance-account-link">
                        Gérer les barèmes par année <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                </section>
                <Reconciliation preview={props.preview} />
                <section className="portal-panel finance-operational-panel" id="settings">
                    <h2>Paramètres financiers appliqués</h2>
                    <p>
                        Devises suivies séparément : {props.currencies.join(', ')}. Modes disponibles : {props.methods.join(', ')}.
                    </p>
                    <p>
                        Double contrôle : {props.dualControl ? 'activé' : 'désactivé'}. Les règles d’accès académique restent configurées dans
                        l’administration académique.
                    </p>
                </section>
            </div>
        </Dashboard>
    );
}
function Reconciliation({ preview }: { preview: DirectoryProps['preview'] }) {
    const upload = useForm<{ file: File | null; account: string }>({ file: null, account: '' });
    const confirm = useForm<{ rows: number[]; reason: string }>({ rows: [], reason: '' });
    return (
        <section className="portal-panel finance-operational-panel" id="reconciliation">
            <h2>Rapprochement explicite d’un relevé CSV</h2>
            <p>Colonnes : bank_reference,payment_reference,amount,currency,date. Aucun paiement n’est confirmé par le seul dépôt du fichier.</p>
            <form
                className="portal-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    upload.post(route('dashboard.admin.finance.reconciliation.preview'), { forceFormData: true });
                }}
            >
                <label>
                    Compte ou journal bancaire
                    <input required value={upload.data.account} onChange={(e) => upload.setData('account', e.target.value)} />
                </label>
                <label>
                    Relevé CSV
                    <input type="file" accept=".csv,text/csv" required onChange={(e) => upload.setData('file', e.target.files?.[0] ?? null)} />
                </label>
                {Object.values(upload.errors).map((error) => (
                    <p role="alert" key={error}>
                        {error}
                    </p>
                ))}
                <button className="portal-primary" disabled={upload.processing}>
                    Prévisualiser sans modifier les paiements
                </button>
            </form>
            {preview && (
                <form
                    className="portal-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        confirm.post(route('dashboard.admin.finance.reconciliation.commit'));
                    }}
                >
                    <h3>{preview.account}</h3>
                    {preview.rows.map((row, index) => (
                        <label key={index}>
                            <input
                                type="checkbox"
                                disabled={row.state !== 'match'}
                                checked={confirm.data.rows.includes(index)}
                                onChange={(e) =>
                                    confirm.setData(
                                        'rows',
                                        e.target.checked ? [...confirm.data.rows, index] : confirm.data.rows.filter((v) => v !== index),
                                    )
                                }
                            />
                            {row.bank_reference} · {row.payment_reference} · {money(row.amount_cents, row.currency)} · {statusLabel(row.state)}
                        </label>
                    ))}
                    <label>
                        Justification du rapprochement
                        <textarea required minLength={10} value={confirm.data.reason} onChange={(e) => confirm.setData('reason', e.target.value)} />
                    </label>
                    {Object.values(confirm.errors).map((error) => (
                        <p key={error} role="alert">
                            {error}
                        </p>
                    ))}
                    <button className="portal-primary" disabled={confirm.processing || !confirm.data.rows.length}>
                        Confirmer les correspondances sélectionnées
                    </button>
                </form>
            )}
        </section>
    );
}
