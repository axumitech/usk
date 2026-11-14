import FeedbackToast from '@/components/admin/FeedbackToast';
import Pagination from '@/components/admin/Pagination';
import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import { money } from '@/components/student/types';
import { formatDate } from '@/lib/studentEnrollment';
import { Head, Link, useForm } from '@inertiajs/react';
import { ArrowLeft, CalendarDays, FilePlus2, Filter, Landmark, Pencil, Receipt, Users } from 'lucide-react';
import { useState } from 'react';
import '../../../../css/dashboard/finance.css';
import '../../../../css/dashboard/student-academic.css';
import '../../../../css/student-portal.css';
import AcademicForm, { type Field, type FormSpec } from '../studentAcademic/AcademicForm';

type Choice = { id: number; name: string };
type Level = { id: number; title: string; faculty_id: number; faculty: Choice | null };
type Program = Choice & { faculty_id: number; faculty?: Choice | null };
type Tariff = {
    id: number;
    title: string;
    version: number;
    category: string;
    kind: string;
    currency: string;
    status: string;
    revision: string;
    valid_from: string;
    valid_until: string | null;
    academic_year: { id: number; title: string } | null;
    level: Level | null;
    program: Program | null;
    schedule: { amount_cents: number; due_at: string }[];
    can_apply: boolean;
    replace_id: number | null;
};
type Filters = { year?: number; faculty?: number; level?: number; category?: string; status?: string };
type Props = {
    tariffs: { data: Tariff[]; total: number };
    filters: Filters;
    years: { id: number; title: string }[];
    faculties: Choice[];
    levels: Level[];
    programs: Program[];
    cycles: Choice[];
    currencies: string[];
};

const categoryLabels: Record<string, string> = {
    national: 'Étudiants nationaux · RDC',
    foreign: 'Étudiants étrangers',
};
const statusLabels: Record<string, string> = { draft: 'Brouillon', active: 'Actif', archived: 'Archivé' };
const reason: Field = { name: 'reason', label: 'Justification', type: 'textarea', required: true };
const scheduleField: Field = {
    name: 'schedule',
    label: 'Échéancier',
    type: 'schedule',
    required: true,
    scheduleCurrencyField: 'currency',
    allowZeroScheduleAmount: true,
};
const indexRoute = 'dashboard.admin.finance.tariffs.index';

export default function Tariffs(props: Props) {
    const { tariffs, filters, years } = props;
    const [spec, setSpec] = useState<FormSpec | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const year = years.find((item) => item.id === Number(filters.year));
    const activeFilters = Boolean(filters.faculty || filters.level || filters.category || filters.status);
    const financeUrl = route('dashboard.admin.finance.index', { year: filters.year });
    const scope = (tariff: Tariff) =>
        [tariff.level?.faculty?.name ?? tariff.program?.faculty?.name, tariff.program?.name, tariff.level?.title].filter(Boolean).join(' · ') ||
        'Périmètre institutionnel';
    const tariffRoute = (action: 'update' | 'activate' | 'apply', tariff: Tariff) =>
        route(`dashboard.admin.finance.tariffs.${action}`, { tariff: tariff.id, ...filters });

    const edit = (tariff: Tariff) => {
        const draft = tariff.status === 'draft';
        setSpec({
            title: draft ? 'Modifier le barème' : 'Préparer une nouvelle version',
            description: draft
                ? `${categoryLabels[tariff.category] ?? tariff.category} · ${scope(tariff)}.`
                : 'Les modifications créent un brouillon à activer. Les frais déjà affectés restent rattachés à leur version.',
            action: tariffRoute('update', tariff),
            method: 'put',
            values: { revision: tariff.revision, currency: tariff.currency },
            fields: [
                { name: 'title', label: 'Libellé', required: true, value: tariff.title },
                { name: 'valid_from', label: 'Début de validité', type: 'date', required: true, value: tariff.valid_from },
                { name: 'valid_until', label: 'Fin de validité', type: 'date', value: tariff.valid_until },
                {
                    ...scheduleField,
                    value: tariff.schedule.map(({ amount_cents, due_at }) => ({ amount: (amount_cents / 100).toFixed(2), due_at })),
                },
                reason,
            ],
            submitLabel: draft ? 'Enregistrer le barème' : 'Créer le brouillon',
        });
    };

    const create = () => {
        setSpec({
            title: 'Créer un barème',
            description: 'Sélectionnez l’année et le périmètre, puis renseignez les montants et les dates de paiement.',
            action: route('dashboard.admin.finance.tariffs', filters),
            fields: [
                { name: 'title', label: 'Libellé', required: true },
                {
                    name: 'academic_year_id',
                    label: 'Année académique',
                    type: 'select',
                    required: true,
                    options: years.map((item) => ({ value: item.id, label: item.title })),
                    value: filters.year,
                },
                {
                    name: 'level_id',
                    label: 'Niveau',
                    type: 'select',
                    options: props.levels.map((item) => ({ value: item.id, label: [item.faculty?.name, item.title].filter(Boolean).join(' · ') })),
                    value: filters.level,
                },
                {
                    name: 'academic_program_id',
                    label: 'Programme (facultatif)',
                    type: 'select',
                    options: props.programs.map((item) => ({ value: item.id, label: item.name })),
                },
                {
                    name: 'academic_cycle_id',
                    label: 'Cycle (facultatif)',
                    type: 'select',
                    options: props.cycles.map((item) => ({ value: item.id, label: item.name })),
                },
                {
                    name: 'category',
                    label: 'Catégorie tarifaire',
                    type: 'select',
                    required: true,
                    options: Object.entries(categoryLabels).map(([value, label]) => ({ value, label })),
                    value: filters.category,
                },
                {
                    name: 'kind',
                    label: 'Code du type de frais',
                    required: true,
                    value: 'tuition',
                    help: 'Utilisez tuition pour les frais académiques.',
                },
                {
                    name: 'currency',
                    label: 'Devise',
                    type: 'select',
                    required: true,
                    options: props.currencies.map((value) => ({ value, label: value })),
                    value: props.currencies[0],
                },
                { name: 'valid_from', label: 'Début de validité', type: 'date', required: true },
                { name: 'valid_until', label: 'Fin de validité', type: 'date' },
                { ...scheduleField, value: [{ amount: '', due_at: '' }] },
                reason,
            ],
            submitLabel: 'Créer le brouillon',
        });
    };

    const activate = (tariff: Tariff) => {
        const automatic = tariff.kind === 'tuition' && tariff.category in categoryLabels;
        setSpec({
            title: 'Activer le barème',
            description: [
                tariff.replace_id && 'Cette version remplace le barème actif pour ce périmètre.',
                automatic && 'Dès son entrée en vigueur, le barème ajoute les échéances aux inscriptions validées qui attendent leurs frais.',
                'Les frais déjà affectés sont conservés.',
            ]
                .filter(Boolean)
                .join(' '),
            action: tariffRoute('activate', tariff),
            values: { revision: tariff.revision, replace_id: tariff.replace_id },
            fields: [reason],
            submitLabel: 'Activer cette version',
        });
    };

    const apply = (tariff: Tariff) => {
        setSpec({
            title: 'Affecter le barème aux inscriptions',
            description:
                'L’échéancier sera créé pour les inscriptions admissibles de cette année et de cette catégorie qui attendent leurs frais académiques.',
            action: tariffRoute('apply', tariff),
            fields: [reason],
            submitLabel: 'Affecter le barème',
        });
    };

    return (
        <Dashboard hideAppsNavigation>
            <Head title="Barèmes des frais" />
            {notice && <FeedbackToast feedback={{ id: 0, message: notice, tone: 'success' }} onDismiss={() => setNotice(null)} />}
            {spec && (
                <AcademicForm
                    spec={spec}
                    onClose={() => setSpec(null)}
                    onSuccess={(message) => {
                        setSpec(null);
                        setNotice(message);
                    }}
                />
            )}
            <div className="student-portal academic-administration finance-workspace tariff-workspace">
                <header className="finance-hero">
                    <Landmark className="finance-hero-watermark" size={224} strokeWidth={0.65} aria-hidden="true" />
                    <div className="finance-hero-copy">
                        <Link className="tariff-back" href={financeUrl}>
                            <ArrowLeft size={16} aria-hidden="true" /> Finances
                        </Link>
                        <h1>Barèmes des frais</h1>
                        <p>Montants et échéances par année académique, niveau et catégorie d’étudiant.</p>
                        <div className="finance-hero-context">
                            {year && (
                                <span>
                                    <CalendarDays size={16} aria-hidden="true" /> {year.title}
                                </span>
                            )}
                            <span>
                                <Receipt size={16} aria-hidden="true" /> {tariffs.total.toLocaleString('fr-FR')}{' '}
                                {tariffs.total === 1 ? 'version' : 'versions'}
                            </span>
                        </div>
                    </div>
                    {years.length > 0 && (
                        <button className="finance-export" type="button" onClick={create}>
                            <FilePlus2 size={18} aria-hidden="true" /> Créer un barème
                        </button>
                    )}
                </header>

                <TariffFilters key={JSON.stringify(filters)} filters={filters} years={years} faculties={props.faculties} levels={props.levels} />

                {tariffs.data.length > 0 ? (
                    <section className="tariff-card-grid" aria-label="Barèmes correspondant aux filtres">
                        {tariffs.data.map((tariff) => (
                            <article className="tariff-card" key={tariff.id}>
                                <header className="tariff-card-header">
                                    <div className="tariff-card-identity">
                                        <span className="tariff-category" data-category={tariff.category}>
                                            <Users size={15} aria-hidden="true" /> {categoryLabels[tariff.category] ?? tariff.category}
                                        </span>
                                        <h2>{tariff.title}</h2>
                                        <p>{scope(tariff)}</p>
                                    </div>
                                    <span className="tariff-status" data-status={tariff.status}>
                                        {statusLabels[tariff.status] ?? tariff.status} · V{tariff.version}
                                    </span>
                                </header>

                                <div className="tariff-total">
                                    <span>Total du barème</span>
                                    <strong>
                                        {money(
                                            tariff.schedule.reduce((sum, row) => sum + row.amount_cents, 0),
                                            tariff.currency,
                                        )}
                                    </strong>
                                </div>
                                <ol className="finance-tariff-installments">
                                    {tariff.schedule.map(({ due_at, amount_cents }, index) => (
                                        <li key={`${due_at}-${index}`}>
                                            <CalendarDays size={15} aria-hidden="true" />
                                            <span>Échéance {index + 1}</span>
                                            <time dateTime={due_at}>{formatDate(due_at)}</time>
                                            <strong>{money(amount_cents, tariff.currency)}</strong>
                                        </li>
                                    ))}
                                </ol>
                                <footer className="tariff-card-footer">
                                    <p>
                                        Validité à partir du {formatDate(tariff.valid_from)}
                                        {tariff.valid_until && ` jusqu’au ${formatDate(tariff.valid_until)}`}
                                    </p>
                                    <div className="tariff-card-actions">
                                        {tariff.status !== 'archived' && (
                                            <button className="admin-secondary" type="button" onClick={() => edit(tariff)}>
                                                <Pencil size={15} aria-hidden="true" />
                                                {tariff.status === 'draft' ? 'Modifier' : 'Préparer une nouvelle version'}
                                            </button>
                                        )}
                                        {tariff.status === 'draft' && (
                                            <button className="admin-primary" type="button" onClick={() => activate(tariff)}>
                                                Activer le barème
                                            </button>
                                        )}
                                        {tariff.can_apply && (
                                            <button className="admin-primary" type="button" onClick={() => apply(tariff)}>
                                                Affecter aux inscriptions
                                            </button>
                                        )}
                                    </div>
                                </footer>
                            </article>
                        ))}
                    </section>
                ) : (
                    <section className="tariff-empty">
                        <Receipt size={28} aria-hidden="true" />
                        <h2>{year ? `Aucun barème pour ${year.title}` : 'Aucun barème'}</h2>
                        <p>
                            {activeFilters
                                ? 'Modifiez les filtres pour afficher d’autres versions.'
                                : 'Les barèmes générés avec la maquette apparaîtront ici.'}
                        </p>
                    </section>
                )}
                <Pagination value={tariffs} preserveScroll={false} />
            </div>
        </Dashboard>
    );
}

function TariffFilters({ filters, years, faculties, levels: allLevels }: Pick<Props, 'filters' | 'years' | 'faculties' | 'levels'>) {
    const search = useForm({
        year: String(filters.year ?? ''),
        faculty: String(filters.faculty ?? ''),
        level: String(filters.level ?? ''),
        category: filters.category ?? '',
        status: filters.status ?? '',
    });
    const levels = allLevels.filter((item) => !search.data.faculty || String(item.faculty_id) === search.data.faculty);
    const activeFilters = Boolean(filters.faculty || filters.level || filters.category || filters.status);
    const index = route(indexRoute);
    return (
        <form
            className="portal-form finance-filters tariff-filters"
            onSubmit={(event) => {
                event.preventDefault();
                search.transform((data) => Object.fromEntries(Object.entries(data).filter(([, value]) => value !== '')));
                search.get(index, { preserveScroll: true, preserveState: true });
            }}
        >
            <div className="finance-section-heading">
                <h2>
                    <Filter size={18} aria-hidden="true" /> Filtrer les barèmes
                </h2>
                {activeFilters && <Link href={route(indexRoute, { year: filters.year })}>Réinitialiser les filtres</Link>}
            </div>
            <label>
                Année académique
                <select value={search.data.year} onChange={(event) => search.setData('year', event.target.value)}>
                    {!years.length && <option value="">Aucune année</option>}
                    {years.map((item) => (
                        <option key={item.id} value={item.id}>
                            {item.title}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                Faculté
                <select
                    value={search.data.faculty}
                    onChange={(event) => search.setData((data) => ({ ...data, faculty: event.target.value, level: '' }))}
                >
                    <option value="">Toutes les facultés</option>
                    {faculties.map((item) => (
                        <option key={item.id} value={item.id}>
                            {item.name}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                Niveau
                <select value={search.data.level} onChange={(event) => search.setData('level', event.target.value)}>
                    <option value="">Tous les niveaux</option>
                    {levels.map((item) => (
                        <option key={item.id} value={item.id}>
                            {search.data.faculty ? item.title : [item.faculty?.name, item.title].filter(Boolean).join(' · ')}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                Catégorie
                <select value={search.data.category} onChange={(event) => search.setData('category', event.target.value)}>
                    <option value="">Toutes les catégories</option>
                    {Object.entries(categoryLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                État
                <select value={search.data.status} onChange={(event) => search.setData('status', event.target.value)}>
                    <option value="">Tous les états</option>
                    {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ))}
                </select>
            </label>
            <button className="portal-primary" type="submit" disabled={!years.length || search.processing}>
                Appliquer
            </button>
        </form>
    );
}
