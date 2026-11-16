import FeedbackToast from '@/components/admin/FeedbackToast';
import Pagination from '@/components/admin/Pagination';
import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import { money } from '@/components/student/types';
import { formatDate } from '@/lib/studentEnrollment';
import { Head, Link, useForm } from '@inertiajs/react';
import { ArrowLeft, CalendarDays, ClipboardList, FilePlus2, Filter, Landmark, LibraryBig, Pencil, Receipt, Users } from 'lucide-react';
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
    faculty?: Choice | null;
    faculty_id?: number | null;
    level_id?: number | null;
    level: Level | null;
    program: Program | null;
    automatic?: boolean;
    schedule: { amount_cents: number; due_at: string | null }[];
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
    canScopeUniversity: boolean;
};

const categoryLabels: Record<string, string> = {
    all: 'Tous les étudiants',
    national: 'Étudiants nationaux · RDC',
    foreign: 'Étudiants étrangers',
};
const tuitionCategories = [
    { value: 'national', label: categoryLabels.national },
    { value: 'foreign', label: categoryLabels.foreign },
];
const statusLabels: Record<string, string> = { draft: 'Brouillon', active: 'Actif', archived: 'Archivé' };
const enrollmentFormFee = { title: 'Fiche d’enrôlement', kind: 'fiche_enrolement' };
const reason: Field = { name: 'reason', label: 'Justification', type: 'textarea', required: true };
const scheduleField: Field = {
    name: 'schedule',
    label: 'Échéancier',
    type: 'schedule',
    required: true,
    scheduleCurrencyField: 'currency',
    allowZeroScheduleAmount: true,
};
const additionalScheduleField: Field = {
    ...scheduleField,
    label: 'Montants à payer',
    help: 'Laissez la date limite vide pour facturer le montant sans échéance.',
    optionalScheduleDueDates: true,
};
const validityFields = (ancillary: boolean, tariff?: Pick<Tariff, 'valid_from' | 'valid_until'>): Field[] => [
    {
        name: 'valid_from',
        label: ancillary ? 'Date de début d’application' : 'Début de validité',
        type: 'date',
        required: true,
        value: tariff?.valid_from,
    },
    { name: 'valid_until', label: 'Fin de validité', type: 'date', value: tariff?.valid_until },
];
const indexRoute = 'dashboard.admin.finance.tariffs.index';
const levelLabel = (level: Level) => [level.faculty?.name, level.title].filter(Boolean).join(' · ');
const tariffTotal = (tariff: Tariff) =>
    money(
        tariff.schedule.reduce((sum, row) => sum + row.amount_cents, 0),
        tariff.currency,
    );
const automaticTariff = (tariff: Tariff) =>
    tariff.automatic || (tariff.kind === 'tuition' && tuitionCategories.some(({ value }) => value === tariff.category));

export default function Tariffs(props: Props) {
    const { tariffs, filters, years } = props;
    const [spec, setSpec] = useState<FormSpec | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const year = years.find((item) => item.id === Number(filters.year));
    const activeFilters = Boolean(filters.faculty || filters.level || filters.category || filters.status);
    const financeUrl = route('dashboard.admin.finance.index', { year: filters.year });
    const scope = (tariff: Tariff) => {
        const level = tariff.level ?? props.levels.find(({ id }) => id === tariff.level_id);
        const faculty = tariff.faculty ?? props.faculties.find(({ id }) => id === tariff.faculty_id);
        const name = [level?.faculty?.name ?? tariff.program?.faculty?.name ?? faculty?.name, tariff.program?.name, level?.title]
            .filter(Boolean)
            .join(' · ');

        if (!name && (tariff.faculty_id || tariff.level_id)) return 'Périmètre à vérifier';
        return name || (tariff.automatic ? 'Toute l’université' : 'Périmètre institutionnel');
    };
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
                ...validityFields(Boolean(tariff.automatic), tariff),
                {
                    ...(tariff.automatic ? additionalScheduleField : scheduleField),
                    value: tariff.schedule.map(({ amount_cents, due_at }) => ({ amount: (amount_cents / 100).toFixed(2), due_at: due_at ?? '' })),
                },
                reason,
            ],
            submitLabel: draft ? 'Enregistrer le barème' : 'Créer le brouillon',
        });
    };

    const yearField: Field = {
        name: 'academic_year_id',
        label: 'Année académique',
        type: 'select',
        required: true,
        options: years.map((item) => ({ value: item.id, label: item.title })),
        value: filters.year,
    };
    const paymentFields = (ancillary: boolean): Field[] => [
        {
            name: 'currency',
            label: 'Devise',
            type: 'select',
            required: true,
            options: props.currencies.map((value) => ({ value, label: value })),
            value: props.currencies[0],
        },
        ...validityFields(ancillary),
        { ...(ancillary ? additionalScheduleField : scheduleField), value: [{ amount: '', due_at: '' }] },
        reason,
    ];
    const scopes = [
        ...(props.canScopeUniversity ? [{ value: 'university', label: 'Toute l’université' }] : []),
        ...(props.faculties.length ? [{ value: 'faculty', label: 'Une faculté' }] : []),
        ...(props.levels.length ? [{ value: 'level', label: 'Un niveau' }] : []),
    ];

    const createAdditional = (preset?: typeof enrollmentFormFee) => {
        setSpec({
            title: 'Ajouter des frais complémentaires',
            description:
                'Choisissez les étudiants concernés et le montant. Les frais apparaissent dans leurs comptes à partir de la date d’application du barème actif.',
            action: route('dashboard.admin.finance.tariffs', { category: 'all' }),
            values: { category: 'all', automatic: true },
            fields: [
                {
                    name: 'title',
                    label: 'Intitulé affiché aux étudiants',
                    required: true,
                    value: preset?.title,
                    help: 'Par exemple, Frais de bibliothèque ou Fiche d’enrôlement.',
                },
                {
                    name: 'kind',
                    label: 'Identifiant du frais',
                    required: true,
                    value: preset?.kind,
                    pattern: '[a-z][a-z0-9_]{0,49}',
                    help: 'Ex. bibliotheque. Utilisez des minuscules sans accent, des chiffres et des tirets bas. Un même identifiant désigne le même frais dans tous les périmètres.',
                },
                yearField,
                {
                    name: 'fee_scope',
                    label: 'Étudiants concernés',
                    type: 'select',
                    required: true,
                    options: scopes,
                    value: filters.level ? 'level' : filters.faculty ? 'faculty' : '',
                    clears: ['faculty_id', 'level_id'],
                },
                {
                    name: 'faculty_id',
                    label: 'Faculté',
                    type: 'select',
                    required: true,
                    visibleFor: (values) => values.fee_scope === 'faculty',
                    options: props.faculties.map(({ id, name }) => ({ value: id, label: name })),
                    value: filters.level ? undefined : filters.faculty,
                },
                {
                    name: 'level_id',
                    label: 'Niveau et faculté',
                    type: 'select',
                    required: true,
                    visibleFor: (values) => values.fee_scope === 'level',
                    options: props.levels.map((level) => ({ value: level.id, label: levelLabel(level) })),
                    value: filters.level,
                },
                ...paymentFields(true),
            ],
            submitLabel: 'Créer le brouillon',
        });
    };

    const create = () => {
        setSpec({
            title: 'Créer un barème',
            description: 'Sélectionnez l’année et le périmètre, puis renseignez les montants et les dates de paiement.',
            action: route('dashboard.admin.finance.tariffs', filters),
            fields: [
                { name: 'title', label: 'Libellé', required: true },
                yearField,
                {
                    name: 'level_id',
                    label: 'Niveau',
                    type: 'select',
                    options: props.levels.map((item) => ({ value: item.id, label: levelLabel(item) })),
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
                    options: tuitionCategories,
                    value: filters.category === 'all' ? undefined : filters.category,
                },
                {
                    name: 'kind',
                    label: 'Code du type de frais',
                    required: true,
                    value: 'tuition',
                    help: 'Utilisez tuition pour les frais académiques.',
                },
                ...paymentFields(false),
            ],
            submitLabel: 'Créer le brouillon',
        });
    };

    const activate = (tariff: Tariff) => {
        const automatic = automaticTariff(tariff);
        const impact = [scope(tariff), tariff.academic_year?.title, `${tariffTotal(tariff)} par inscription`].filter(Boolean).join(' · ');
        setSpec({
            title: 'Activer le barème',
            description: [
                automatic && `${impact}.`,
                tariff.replace_id && 'Cette version remplace le barème actif pour ce périmètre.',
                automatic && 'Dès son entrée en vigueur, le barème ajoute les frais aux inscriptions concernées.',
                'Les montants sont facturés une seule fois par inscription.',
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
            description: tariff.automatic
                ? `Les frais seront ajoutés aux inscriptions admissibles qui attendent ce barème. ${scope(tariff)}.`
                : 'L’échéancier sera créé pour les inscriptions admissibles de cette année et de cette catégorie qui attendent leurs frais académiques.',
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
                        <p>Gérez la scolarité et les frais complémentaires par année académique.</p>
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
                        <div className="finance-export-actions tariff-hero-actions">
                            {scopes.length > 0 && (
                                <>
                                    <button className="finance-export" type="button" onClick={() => createAdditional()}>
                                        <LibraryBig size={18} aria-hidden="true" /> Ajouter des frais complémentaires
                                    </button>
                                    <button
                                        className="finance-export finance-export-csv"
                                        type="button"
                                        onClick={() => createAdditional(enrollmentFormFee)}
                                    >
                                        <ClipboardList size={18} aria-hidden="true" /> Ajouter une fiche d’enrôlement
                                    </button>
                                </>
                            )}
                            <button className="finance-export finance-export-csv" type="button" onClick={create}>
                                <FilePlus2 size={18} aria-hidden="true" /> Créer un barème
                            </button>
                        </div>
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
                                            {tariff.automatic ? <LibraryBig size={15} aria-hidden="true" /> : <Users size={15} aria-hidden="true" />}{' '}
                                            {tariff.automatic ? 'Frais complémentaires' : (categoryLabels[tariff.category] ?? tariff.category)}
                                        </span>
                                        <h2>{tariff.title}</h2>
                                        <p>{scope(tariff)}</p>
                                        {tariff.automatic && (
                                            <p>
                                                {categoryLabels[tariff.category]} · Identifiant <code>{tariff.kind}</code>
                                            </p>
                                        )}
                                    </div>
                                    <span className="tariff-status" data-status={tariff.status}>
                                        {statusLabels[tariff.status] ?? tariff.status} · V{tariff.version}
                                    </span>
                                </header>

                                <div className="tariff-total">
                                    <span>Total du barème</span>
                                    <strong>{tariffTotal(tariff)}</strong>
                                </div>
                                <ol className="finance-tariff-installments">
                                    {tariff.schedule.map(({ due_at, amount_cents }, index) => (
                                        <li key={`${due_at}-${index}`}>
                                            <CalendarDays size={15} aria-hidden="true" />
                                            <span>{due_at ? `Échéance ${index + 1}` : `Montant ${index + 1}`}</span>
                                            {due_at ? (
                                                <time dateTime={due_at}>{formatDate(due_at)}</time>
                                            ) : (
                                                <span className="finance-tariff-no-deadline">Sans date limite</span>
                                            )}
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
                                : 'Créez un barème ou ajoutez des frais complémentaires pour cette année.'}
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
