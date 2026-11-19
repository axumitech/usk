import Pagination from '@/components/admin/Pagination';
import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import AcademicForm, { type Field, type FormSpec } from '@/pages/dashboard/studentAcademic/AcademicForm';
import { dateTime } from '@/pages/dashboard/teaching/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, ClipboardCheck, Files, Gavel, ListFilter, Send } from 'lucide-react';
import { useState } from 'react';
import '../../../../css/dashboard/academic-results.css';
import '../../../../css/dashboard/student-academic.css';
import '../../../../css/student-portal.css';

type Page<T> = { data: T[]; total: number };
type Period = { code: string; name: string };
type Rule = {
    id: number;
    code: string;
    level_id: number;
    reference: string;
    session_code: string;
    approved_at: string | null;
    can_approve?: boolean;
    configuration?: { period_code?: string | null; base_rule_id?: number | null };
    periods?: Period[];
};
type Run = {
    id: number;
    reference: string;
    edition: number;
    state: string;
    revision: number;
    meeting_at: string;
    approved_at: string | null;
    published_at: string | null;
    previous_id: number | null;
    publisher?: string | null;
    minutes_volumes: number;
    context: {
        year: string;
        program: string;
        level: string;
        session: string;
        period_code?: string | null;
        period_name?: string | null;
        decisions: Record<string, { label: string }>;
    };
    jury: { chair: number; secretary: number; members: Record<string, string> };
    attendance: number[] | null;
};
type Dossier = {
    id: number;
    reference: string;
    academic_enrollment_id: number;
    student: string;
    matricule: string | null;
    annual: string | null;
    period_grade?: string | null;
    credits: { earned: number; planned: number };
    decision: string | null;
    anomalies: string[];
    eliminatory: boolean;
    decision_reason?: string | null;
    eligible_decisions?: string[];
    snapshot?: {
        units: {
            id: number;
            name: string;
            grade: string | null;
            status: string;
            items: { id: number; name: string; grade: string | null; selected?: string; status: string }[];
        }[];
    };
};
type Appeal = {
    id: number;
    reference: string;
    run_id: number;
    body: string;
    status: string;
    result_target: string;
    response: string | null;
    url: string | null;
    result_revision: number;
    assigned_to: number | null;
};
type Props = {
    filters: Record<string, string | number | undefined>;
    actor: number;
    permissions: { manage: boolean; publish: boolean; jury: boolean; assessments: boolean };
    years: { id: number; title: string }[];
    members: { id: number; name: string }[];
    versions: Page<{ id: number; title: string }>;
    version: { id: number; code: string; periods?: Period[] } | null;
    levels: { level_id: number; level_title: string }[];
    items: { id: number; title: string; level_id: number }[];
    assessments: Page<{ id: number; title: string; ec: number; session: string; state: string }> | null;
    rules: Page<Rule>;
    rule: Rule | null;
    runs: Page<Run>;
    run: Run | null;
    dossiers: Page<Dossier> | null;
    result: Dossier | null;
    undecided: number | null;
    pending_appeals: number;
    appeals: Page<Appeal> | null;
};
const prefix = 'dashboard.admin.results.';
const states: Record<string, string> = { prepared: 'Préparé', open: 'Ouvert', approved: 'Approuvé', published: 'Publié', abandoned: 'Abandonné' };
const results: Record<string, string> = {
    passed: 'Validé',
    compensated: 'Compensé',
    recognized: 'Reconnu',
    failed: 'Non validé',
    incomplete: 'Incomplet',
    eliminatory: 'Éliminatoire',
};
const appealStates: Record<string, string> = {
    open: 'Déposé',
    under_review: 'En vérification',
    admissible: 'Recevable',
    investigating: 'En instruction',
    accepted: 'Accepté',
    rejected: 'Rejeté',
    inadmissible: 'Irrecevable',
};
const reason: Field = { name: 'reason', label: 'Motif', type: 'textarea', required: true };
const credits = (value: number) => new Intl.NumberFormat('fr', { maximumFractionDigits: 2 }).format(value / 100);

function JuryDirectory({ runs, filters, rule }: Pick<Props, 'runs' | 'filters' | 'rule'>) {
    const scope = { year: filters.year, version: filters.version, rule: rule?.id };
    return (
        <section className="portal-panel jury-panel" id="deliberations" aria-labelledby="jury-heading">
            <header>
                <div>
                    <h2 id="jury-heading">Délibérations</h2>
                    <p>Choisissez une session pour consulter ses dossiers ou intervenir à l’étape en cours.</p>
                </div>
            </header>
            <nav className="jury-states" aria-label="État du jury">
                <Link href={route(prefix + 'index', scope) + '#deliberations'} aria-current={!filters.state ? 'page' : undefined}>
                    Toutes
                </Link>
                {Object.entries(states).map(([key, label]) => (
                    <Link
                        key={key}
                        href={route(prefix + 'index', { ...scope, state: key }) + '#deliberations'}
                        aria-current={filters.state === key ? 'page' : undefined}
                    >
                        {label}
                    </Link>
                ))}
            </nav>
            <div data-dashboard-panel="year rule state runs_page">
                {runs.data.length ? (
                    <ul className="jury-list">
                        {runs.data.map((row) => (
                            <li key={row.id}>
                                <Link href={route(prefix + 'index', { ...scope, state: filters.state, run: row.id })} className="jury-row">
                                    <span>
                                        <strong>
                                            {row.context.program} · {row.context.level}
                                        </strong>
                                        <small>
                                            {row.context.year} · {row.context.period_name || 'Session ' + row.context.session} · Édition {row.edition}{' '}
                                            · Jury n°{row.id}
                                        </small>
                                    </span>
                                    <span className="jury-status" data-state={row.state}>
                                        {states[row.state]}
                                    </span>
                                    <ChevronRight aria-hidden="true" size={17} />
                                </Link>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="jury-empty">Aucune délibération dans cette vue.</p>
                )}
            </div>
            <Pagination value={runs} />
        </section>
    );
}

const stageAdvice: Record<string, string> = {
    prepared: 'À la date prévue, la présidence fait l’appel et ouvre la séance lorsque le quorum est atteint.',
    open: 'Les membres présents motivent une décision dans chaque dossier. La présidence approuve ensuite l’ensemble des décisions.',
    approved:
        'Les décisions sont approuvées. Le doyen ou une autre autorité habilitée à publier dans cette faculté peut maintenant publier toute la session.',
    published: 'Chaque étudiant autorisé peut consulter sa décision et son bulletin dans Mes résultats.',
    abandoned: 'La préparation a été abandonnée. Cette édition est conservée pour consultation.',
};

function RuleForm({ version, levels, periods }: { version: number; levels: Props['levels']; periods: Period[] }) {
    const form = useForm({ level_id: '', period_code: '', code: '', session_code: '', effective_on: '', reference: '', configuration: '' });
    const [error, setError] = useState('');
    return (
        <details>
            <summary>Créer une version de règlement</summary>
            <p>
                Renseignez le règlement approuvé par l’établissement. Les seuils sont en centièmes, les poids en points de base. L’aide de
                configuration décrit les champs requis.
            </p>
            <form
                className="portal-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    try {
                        const configuration: unknown = JSON.parse(form.data.configuration);
                        if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) throw new Error();
                        setError('');
                        form.transform(({ period_code, ...data }) => ({
                            ...data,
                            configuration: { ...configuration, period_code: period_code || null },
                        }));
                        form.post(route(prefix + 'store-rule', version), { preserveScroll: true });
                    } catch {
                        setError('Saisissez un objet JSON valide.');
                    }
                }}
            >
                <label>
                    Niveau{' '}
                    <select required value={form.data.level_id} onChange={(e) => form.setData('level_id', e.target.value)}>
                        <option value="">Choisir le niveau</option>
                        {levels.map((level) => (
                            <option key={level.level_id} value={level.level_id}>
                                {level.level_title}
                            </option>
                        ))}
                    </select>
                </label>
                {periods.length > 0 && (
                    <label>
                        Périmètre du règlement
                        <select value={form.data.period_code} onChange={(event) => form.setData('period_code', event.target.value)}>
                            <option value="">Année complète</option>
                            {periods.map((period) => (
                                <option key={period.code} value={period.code}>
                                    {period.name}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                <label>
                    Code de version <input required value={form.data.code} onChange={(e) => form.setData('code', e.target.value)} />
                </label>
                <label>
                    Code de session <input required value={form.data.session_code} onChange={(e) => form.setData('session_code', e.target.value)} />
                </label>
                <label>
                    Applicable à partir du{' '}
                    <input required type="date" value={form.data.effective_on} onChange={(e) => form.setData('effective_on', e.target.value)} />
                </label>
                <label>
                    Référence réglementaire <input required value={form.data.reference} onChange={(e) => form.setData('reference', e.target.value)} />
                </label>
                <label>
                    Configuration du règlement{' '}
                    <textarea
                        required
                        rows={14}
                        spellCheck={false}
                        value={form.data.configuration}
                        onChange={(e) => form.setData('configuration', e.target.value)}
                    />
                </label>
                {error && <p role="alert">{error}</p>}
                {Object.values(form.errors).map((message, index) => (
                    <p key={index} role="alert">
                        {message}
                    </p>
                ))}
                <button className="admin-primary" disabled={form.processing}>
                    Soumettre pour approbation
                </button>
            </form>
            <details>
                <summary>Aide de configuration</summary>
                <ul>
                    <li>
                        Barème et calcul. scale, precision, rounding (half_up, half_even, down), weighting (uniform, credits, coefficients), ec_pass
                        et ue_pass.
                    </li>
                    <li>
                        Crédits et compensation. credit_label, allow_equivalence, compensation (none, unit, period), compensation_floor et period_pass
                        si applicables, eliminatory_below si prévu. Une UE composée exige la validation de chaque EC attendu et ne peut pas être
                        compensée.
                    </li>
                    <li>
                        Sources. items associe les EC de la période choisie à leurs évaluations pondérées. La somme des poids doit être 10 000 pour
                        chaque EC calculé.
                    </li>
                    <li>
                        Rattrapage. base_rule_id, resit_policy (replace, best, keep), resit_eligibility (failed_ec, failed_unit, all_registered),
                        missing_resit (retain, incomplete).
                    </li>
                    <li>
                        Jury et recours. quorum, appeal_days et decisions. Pour chaque code de décision, fournir label, permits_incomplete,
                        permits_eliminatory, progression (none, same, next, conditional) et minimum_credits si applicable. retake accepte
                        unacquired_units ou whole_year pour le redoublement. Le passage conditionnel exige unacquired_units. Pour la fin de cursus,
                        renseigner completion_credits en centièmes, éventuellement completion_evidence et completion_alignment (exact_version ou
                        identical_units).
                    </li>
                </ul>
            </details>
        </details>
    );
}

function PrepareForm({ rule, members }: { rule: Rule; members: Props['members'] }) {
    const form = useForm({
        period_code: rule.configuration?.period_code ?? '',
        meeting_at: '',
        chair: '',
        secretary: '',
        members: [] as number[],
        previous_id: '',
        appeal_id: '',
        equivalences: '',
        reason: '',
    });
    const [error, setError] = useState('');
    return (
        <details>
            <summary>Préparer une délibération</summary>
            <form
                className="portal-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    try {
                        const equivalences: unknown = form.data.equivalences ? JSON.parse(form.data.equivalences) : [];
                        if (!Array.isArray(equivalences)) throw new Error();
                        setError('');
                        form.transform((data) => ({ ...data, equivalences }));
                        form.post(route(prefix + 'prepare', rule.id), { preserveScroll: true });
                    } catch {
                        setError('Les équivalences doivent former un tableau JSON.');
                    }
                }}
            >
                {Boolean(rule.periods?.length) && !rule.configuration?.base_rule_id && (
                    <label>
                        Périmètre de la délibération
                        <select
                            value={form.data.period_code}
                            disabled={Boolean(rule.configuration?.period_code)}
                            onChange={(event) => form.setData('period_code', event.target.value)}
                        >
                            {!rule.configuration?.period_code && <option value="">Année complète</option>}
                            {rule.periods
                                ?.filter((period) => !rule.configuration?.period_code || period.code === rule.configuration.period_code)
                                .map((period) => (
                                    <option key={period.code} value={period.code}>
                                        {period.name}
                                    </option>
                                ))}
                        </select>
                    </label>
                )}
                <label>
                    Date du jury (Kinshasa){' '}
                    <input type="datetime-local" required value={form.data.meeting_at} onChange={(e) => form.setData('meeting_at', e.target.value)} />
                </label>
                <label>
                    Président{' '}
                    <select required value={form.data.chair} onChange={(e) => form.setData('chair', e.target.value)}>
                        <option value="">Choisir</option>
                        {members.map((member) => (
                            <option key={member.id} value={member.id}>
                                {member.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Secrétaire{' '}
                    <select required value={form.data.secretary} onChange={(e) => form.setData('secretary', e.target.value)}>
                        <option value="">Choisir</option>
                        {members.map((member) => (
                            <option key={member.id} value={member.id}>
                                {member.name}
                            </option>
                        ))}
                    </select>
                </label>
                <fieldset>
                    <legend>Membres du jury</legend>
                    {members.map((member) => (
                        <label key={member.id}>
                            <input
                                type="checkbox"
                                checked={form.data.members.includes(member.id)}
                                onChange={(e) =>
                                    form.setData(
                                        'members',
                                        e.target.checked ? [...form.data.members, member.id] : form.data.members.filter((id) => id !== member.id),
                                    )
                                }
                            />{' '}
                            {member.name}
                        </label>
                    ))}
                </fieldset>
                <label>
                    Publication à rectifier (identifiant){' '}
                    <input type="number" min={1} value={form.data.previous_id} onChange={(e) => form.setData('previous_id', e.target.value)} />
                </label>
                <label>
                    Recours accepté (identifiant, si applicable){' '}
                    <input type="number" min={1} value={form.data.appeal_id} onChange={(e) => form.setData('appeal_id', e.target.value)} />
                </label>
                <label>
                    Équivalences autorisées (tableau JSON avec enrollment, item et reference){' '}
                    <textarea value={form.data.equivalences} onChange={(e) => form.setData('equivalences', e.target.value)} />
                </label>
                <label>
                    Motif <textarea required minLength={5} value={form.data.reason} onChange={(e) => form.setData('reason', e.target.value)} />
                </label>
                {error && <p role="alert">{error}</p>}
                {Object.values(form.errors).map((message, index) => (
                    <p key={index} role="alert">
                        {message}
                    </p>
                ))}
                <button className="admin-primary" disabled={form.processing}>
                    Calculer les dossiers
                </button>
            </form>
        </details>
    );
}

function OpenJury({ run }: { run: Run }) {
    const form = useForm({ action: 'open', revision: run.revision, attendance: [] as number[], reason: '' });
    return (
        <details>
            <summary>Faire l’appel et ouvrir le jury</summary>
            <form
                className="portal-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    form.post(route(prefix + 'transition', run.id), { preserveScroll: true });
                }}
            >
                <fieldset>
                    <legend>Membres présents</legend>
                    {Object.entries(run.jury.members).map(([id, member]) => (
                        <label key={id}>
                            <input
                                type="checkbox"
                                checked={form.data.attendance.includes(Number(id))}
                                onChange={(e) =>
                                    form.setData(
                                        'attendance',
                                        e.target.checked
                                            ? [...form.data.attendance, Number(id)]
                                            : form.data.attendance.filter((memberId) => memberId !== Number(id)),
                                    )
                                }
                            />{' '}
                            {member}
                        </label>
                    ))}
                </fieldset>
                <label>
                    Motif <input required minLength={5} value={form.data.reason} onChange={(e) => form.setData('reason', e.target.value)} />
                </label>
                {Object.values(form.errors).map((error, index) => (
                    <p key={index} role="alert">
                        {error}
                    </p>
                ))}
                <button className="admin-primary" disabled={form.processing}>
                    Ouvrir la délibération
                </button>
            </form>
        </details>
    );
}

export default function Administration(props: Props) {
    const { version, rule, run, result, filters, permissions, actor } = props;
    const [modal, setModal] = useState<FormSpec | null>(null);
    const [message, setMessage] = useState('');
    const open = (title: string, url: string, values: FormSpec['values'], fields: Field[] = [reason]) =>
        setModal({ title, description: 'Vérifiez le dossier avant de confirmer.', action: url, values, fields, requireSuccessFlash: true });
    const transition = (action: string, title: string) =>
        run &&
        open(
            title,
            route(prefix + 'transition', run.id),
            { action, revision: run.revision },
            action === 'publish' ? [reason, { name: 'notify', type: 'checkbox', label: 'Notifier les étudiants autorisés' }] : [reason],
        );
    const index = route(prefix + 'index');
    const scope = { year: filters.year, version: filters.version, rule: filters.rule, state: filters.state };
    const canViewMinutes = run && (permissions.publish || (permissions.jury && Boolean(run.jury.members[String(actor)])));
    const landing = !run && !rule && !version;
    return (
        <Dashboard hideAppsNavigation>
            <Head title="Résultats et délibérations" />
            {modal && (
                <AcademicForm
                    spec={modal}
                    onClose={() => setModal(null)}
                    onSuccess={(feedback) => {
                        setModal(null);
                        setMessage(feedback);
                    }}
                />
            )}
            <main className="student-portal academic-administration results-workspace">
                <header className="directory-heading">
                    <div>
                        <h1>Résultats et délibérations</h1>
                        <p>Sessions de jury, décisions officielles et recours des étudiants.</p>
                    </div>
                    {permissions.assessments && (
                        <div className="directory-heading-actions">
                            <Link href={route('dashboard.admin.assessments.index')}>
                                <ClipboardCheck size={17} aria-hidden="true" /> Évaluations et corrections pédagogiques{' '}
                                <ArrowRight size={16} aria-hidden="true" />
                            </Link>
                        </div>
                    )}
                </header>
                {!landing && (
                    <Link className="jury-back" href={route(prefix + 'index', run ? scope : { year: filters.year })}>
                        <ArrowLeft size={16} aria-hidden="true" /> {run ? 'Retour à la liste des jurys' : 'Retour à la vue d’ensemble'}
                    </Link>
                )}
                {message && (
                    <p role="status" className="portal-alert">
                        {message}
                    </p>
                )}
                {landing && (
                    <section className="portal-panel jury-panel jury-workflow" aria-labelledby="publication-heading">
                        <h2 id="publication-heading">Comment publier les résultats d’une session ?</h2>
                        <ol>
                            <li>
                                <Files aria-hidden="true" />
                                <div>
                                    <strong>Préparer les dossiers</strong>
                                    <p>Le service des résultats prépare le jury à partir d’un règlement approuvé.</p>
                                </div>
                            </li>
                            <li>
                                <Gavel aria-hidden="true" />
                                <div>
                                    <strong>Décider et approuver</strong>
                                    <p>Les membres présents décident pour chaque étudiant. La présidence du jury approuve l’ensemble.</p>
                                </div>
                            </li>
                            <li>
                                <Send aria-hidden="true" />
                                <div>
                                    <strong>Publier la session</strong>
                                    <p>
                                        Le doyen ou l’autorité habilitée ouvre un jury approuvé et publie ses résultats pour les étudiants concernés.
                                    </p>
                                </div>
                            </li>
                        </ol>
                        <nav className="jury-shortcuts" aria-label="Rubriques des résultats">
                            <a href="#deliberations">
                                Consulter les jurys <ArrowRight aria-hidden="true" />
                            </a>
                            <a href="#reglements">
                                Maquettes et règlements <ArrowRight aria-hidden="true" />
                            </a>
                            {props.appeals && (
                                <a href="#recours">
                                    Recours <ArrowRight aria-hidden="true" />
                                </a>
                            )}
                        </nav>
                    </section>
                )}
                {!run && (
                    <form
                        className="jury-filter"
                        onSubmit={(event) => {
                            event.preventDefault();
                            const year = new FormData(event.currentTarget).get('year');
                            router.get(index, year ? { year: String(year) } : {});
                        }}
                    >
                        <label>
                            <span id="jury-year-label">Année académique</span>
                            <select aria-labelledby="jury-year-label" key={filters.year ?? 'all'} name="year" defaultValue={filters.year ?? ''}>
                                <option value="">Toutes les années</option>
                                {props.years.map((year) => (
                                    <option key={year.id} value={year.id}>
                                        {year.title}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <button type="submit" className="admin-secondary">
                            <ListFilter size={16} aria-hidden="true" /> Filtrer
                        </button>
                    </form>
                )}
                {landing && <JuryDirectory {...props} />}
                {!run && (
                    <section className="portal-panel jury-panel" id="reglements">
                        <header>
                            <div>
                                <h2>Maquettes et règlements</h2>
                                <p>Ouvrez une maquette pour consulter ses règlements ou un règlement approuvé pour préparer un jury.</p>
                            </div>
                        </header>
                        <h3>
                            <BookOpen aria-hidden="true" size={18} /> Maquettes publiées
                        </h3>
                        {props.versions.data.length ? (
                            <ul className="jury-list jury-versions" data-dashboard-panel="year versions_page">
                                {props.versions.data.map((row) => (
                                    <li key={row.id}>
                                        <Link
                                            className="jury-row"
                                            href={route(prefix + 'index', { year: filters.year, version: row.id }) + '#maquette-selectionnee'}
                                            aria-current={row.id === version?.id ? 'page' : undefined}
                                        >
                                            <span>{row.title}</span>
                                            <ChevronRight size={16} aria-hidden="true" />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p data-dashboard-panel="year versions_page">Aucune maquette publiée dans ce périmètre.</p>
                        )}
                        <Pagination value={props.versions} />
                        {version && <h3 id="maquette-selectionnee">Maquette sélectionnée · {version.code}</h3>}
                        {version && permissions.manage && (
                            <RuleForm key={version.id} version={version.id} levels={props.levels} periods={version.periods ?? []} />
                        )}
                        {version && (
                            <details>
                                <summary>Identifiants des EC et des évaluations</summary>
                                <ul>
                                    {props.items.map((item) => (
                                        <li key={item.id}>
                                            EC {item.id} · {item.title} · niveau {item.level_id}
                                        </li>
                                    ))}
                                </ul>
                                <ul data-dashboard-panel="version sources_page">
                                    {props.assessments?.data.map((item) => (
                                        <li key={item.id}>
                                            Évaluation {item.id} · {item.title} · EC {item.ec} · {item.session} · {item.state}
                                        </li>
                                    ))}
                                </ul>
                                <Pagination value={props.assessments} />
                            </details>
                        )}
                        <h3>Règlements {version ? 'de la maquette' : 'de résultats'}</h3>
                        {props.rules.data.length === 0 && <p className="jury-empty">Aucun règlement pour cette sélection.</p>}
                        <ul className="jury-list" data-dashboard-panel="year version rule rules_page">
                            {props.rules.data.map((row) => (
                                <li key={row.id}>
                                    <Link
                                        className="jury-row"
                                        href={
                                            route(prefix + 'index', { year: filters.year, version: filters.version, rule: row.id }) +
                                            '#reglement-selectionne'
                                        }
                                        aria-current={row.id === rule?.id ? 'page' : undefined}
                                    >
                                        <span>
                                            <strong>
                                                {row.code} · {row.session_code}
                                            </strong>
                                            <small>{row.reference}</small>
                                        </span>
                                        <span className="jury-status" data-state={row.approved_at ? 'approved' : 'prepared'}>
                                            {row.approved_at ? 'Approuvé' : 'À approuver'}
                                        </span>
                                        <ChevronRight size={16} aria-hidden="true" />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                        <Pagination value={props.rules} />
                        {rule && (
                            <div className="jury-current" id="reglement-selectionne">
                                <h3>Règlement sélectionné · {rule.code}</h3>
                                <p>{rule.reference}</p>
                                {!rule.approved_at && (
                                    <p>
                                        Une autre personne habilitée à publier les résultats doit approuver ce règlement avant la préparation du jury.
                                    </p>
                                )}
                                {rule.configuration && (
                                    <details>
                                        <summary>Voir le règlement enregistré</summary>
                                        <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(rule.configuration, null, 2)}</pre>
                                    </details>
                                )}
                                {rule.can_approve && (
                                    <button
                                        className="admin-primary"
                                        onClick={() => open('Approuver le règlement', route(prefix + 'approve-rule', rule.id), {})}
                                    >
                                        Approuver
                                    </button>
                                )}
                                {rule.approved_at && permissions.manage && <PrepareForm key={rule.id} rule={rule} members={props.members} />}
                            </div>
                        )}
                    </section>
                )}
                {!landing && !run && <JuryDirectory {...props} />}
                {run && (
                    <section className="portal-panel jury-panel" id="jury-selectionne">
                        <header>
                            <div>
                                <h2>
                                    {run.context.program} · {run.context.level}
                                </h2>
                                <p>
                                    {run.context.year} · {run.context.period_name || `Session ${run.context.session}`} · Édition {run.edition} · Jury
                                    n°{run.id}
                                </p>
                            </div>
                            <span className="jury-status" data-state={run.state}>
                                {states[run.state]}
                            </span>
                        </header>
                        <div className="jury-current">
                            <h3>{run.state === 'published' ? 'Résultats publiés' : 'Suivi de la délibération'}</h3>
                            <p>{stageAdvice[run.state]}</p>
                            <dl className="jury-history">
                                <div>
                                    <dt>Séance prévue</dt>
                                    <dd>{dateTime(run.meeting_at)}</dd>
                                </div>
                                <div>
                                    <dt>Présidence</dt>
                                    <dd>{run.jury.members[String(run.jury.chair)]}</dd>
                                </div>
                                {run.approved_at && (
                                    <div>
                                        <dt>Approbation</dt>
                                        <dd>{dateTime(run.approved_at)}</dd>
                                    </div>
                                )}
                                {run.published_at && (
                                    <div>
                                        <dt>Publication</dt>
                                        <dd>
                                            {dateTime(run.published_at)}
                                            {run.publisher && ' · ' + run.publisher}
                                        </dd>
                                    </div>
                                )}
                            </dl>
                            {run.previous_id && (permissions.publish || permissions.manage) && (
                                <Link className="jury-text-link" href={route(prefix + 'index', { run: run.previous_id })}>
                                    Consulter l’édition publiée précédente
                                </Link>
                            )}
                            {run.state === 'open' && <p>{props.undecided ?? 0} dossier(s) sans décision.</p>}
                            <div className="jury-actions">
                                {run.state === 'open' && actor === run.jury.chair && permissions.jury && props.undecided === 0 && (
                                    <button className="admin-primary" onClick={() => transition('approve', 'Approuver les décisions')}>
                                        Approuver
                                    </button>
                                )}
                                {run.state === 'approved' && permissions.publish && (
                                    <button className="admin-primary" onClick={() => transition('publish', 'Publier tous les résultats du jury')}>
                                        Publier la session
                                    </button>
                                )}
                                {!['published', 'abandoned'].includes(run.state) && permissions.manage && (
                                    <button className="admin-secondary" onClick={() => transition('abandon', 'Abandonner cette préparation')}>
                                        Abandonner
                                    </button>
                                )}
                            </div>
                            {run.state === 'prepared' && actor === run.jury.chair && permissions.jury && <OpenJury key={run.id} run={run} />}
                        </div>
                        {run.state !== 'abandoned' && canViewMinutes && (
                            <div className="jury-downloads">
                                <h3>Documents de la session</h3>
                                <div className="jury-actions">
                                    {Array.from({ length: run.minutes_volumes }, (_, index) => (
                                        <a key={index} href={route(prefix + 'minutes', { run: run.id, volume: index + 1 })}>
                                            {['approved', 'published'].includes(run.state) ? 'Procès-verbal approuvé' : 'Procès-verbal provisoire'}
                                            {run.minutes_volumes > 1 && ` · Volume ${index + 1}`}
                                        </a>
                                    ))}
                                    {run.state === 'published' && permissions.publish && (
                                        <a href={route(prefix + 'export', run.id)}>Exporter les résultats publiés (CSV)</a>
                                    )}
                                </div>
                            </div>
                        )}
                        <h3>Dossiers des étudiants</h3>
                        <form
                            className="jury-filter"
                            onSubmit={(event) => {
                                event.preventDefault();
                                router.get(index, { ...scope, run: run.id, q: String(new FormData(event.currentTarget).get('q') || '') });
                            }}
                        >
                            <label>
                                Nom ou matricule <input name="q" defaultValue={filters.q} />
                            </label>
                            <button className="admin-secondary">Rechercher</button>
                        </form>
                        {props.dossiers?.data.length === 0 && <p className="jury-empty">Aucun dossier trouvé pour cette recherche.</p>}
                        <div className="jury-table-wrap" data-dashboard-panel="run q dossiers_page">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Dossier</th>
                                        <th>Moyenne</th>
                                        <th>Crédits</th>
                                        <th>Décision</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {props.dossiers?.data.map((row) => (
                                        <tr key={row.id}>
                                            <td>
                                                <Link
                                                    href={
                                                        route(prefix + 'index', { ...scope, run: run.id, q: filters.q, result: row.id }) +
                                                        '#dossier-selectionne'
                                                    }
                                                >
                                                    {row.student} · {row.matricule ?? row.academic_enrollment_id}
                                                </Link>
                                            </td>
                                            <td>{row.period_grade ?? row.annual ?? '—'}</td>
                                            <td>
                                                {credits(row.credits.earned)} / {credits(row.credits.planned)}
                                            </td>
                                            <td>
                                                {row.decision ? run.context.decisions[row.decision].label : 'En attente'}
                                                {row.anomalies.length > 0 && ' · Incomplet'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Pagination value={props.dossiers} />
                    </section>
                )}
                {run && result && (
                    <section className="portal-panel jury-panel" id="dossier-selectionne">
                        <h2>Dossier de {result.student}</h2>
                        <p>
                            Moyenne {result.period_grade ?? result.annual ?? 'indisponible'} · {credits(result.credits.earned)} crédits acquis.
                        </p>
                        {result.anomalies.length > 0 && (
                            <ul>
                                {result.anomalies.map((anomaly, index) => (
                                    <li key={index}>{anomaly}</li>
                                ))}
                            </ul>
                        )}
                        {result.eliminatory && <p>Le dossier contient une note éliminatoire.</p>}
                        {result.decision_reason && <p>{result.decision_reason}</p>}
                        {result.snapshot?.units.map((unit) => (
                            <details key={unit.id}>
                                <summary>
                                    {unit.name} · {unit.grade ?? '—'} · {results[unit.status]}
                                </summary>
                                <ul>
                                    {unit.items.map((item) => (
                                        <li key={item.id}>
                                            {item.name} · {item.grade ?? '—'} · {results[item.status]}
                                            {item.selected === 'ordinary' && ' · Session ordinaire'}
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        ))}
                        {run.state === 'open' && run.attendance?.includes(actor) && permissions.jury && (
                            <button
                                className="admin-primary"
                                onClick={() =>
                                    open('Décision du jury', route(prefix + 'decision', [run.id, result.id]), { revision: run.revision }, [
                                        {
                                            name: 'decision',
                                            label: 'Décision réglementaire',
                                            type: 'select',
                                            value: result.decision,
                                            required: true,
                                            options: Object.entries(run.context.decisions)
                                                .filter(([value]) => result.eligible_decisions?.includes(value))
                                                .map(([value, decision]) => ({
                                                    value,
                                                    label: decision.label,
                                                })),
                                        },
                                        reason,
                                    ])
                                }
                            >
                                Enregistrer une décision
                            </button>
                        )}
                    </section>
                )}
                {props.appeals && (
                    <section className="portal-panel jury-panel" id="recours">
                        <h2>Recours sur résultats officiels</h2>
                        <p>
                            {props.pending_appeals} recours en cours{run ? ' pour cette session' : ' dans la sélection'}.
                        </p>
                        {!props.appeals.data.length && <p className="jury-empty">Aucun recours enregistré.</p>}
                        {props.appeals.data.map((appeal) => (
                            <article key={appeal.id} className="portal-ticket">
                                <h3>
                                    Recours n°{appeal.id} · {appealStates[appeal.status]}
                                </h3>
                                <p>
                                    {appeal.result_target} ·{' '}
                                    <Link href={route(prefix + 'index', { run: appeal.run_id })}>Publication de référence</Link>
                                </p>
                                <p style={{ whiteSpace: 'pre-wrap' }}>{appeal.body}</p>
                                {appeal.assigned_to && <p>Instruit par le compte n°{appeal.assigned_to}.</p>}
                                {appeal.response && <p>{appeal.response}</p>}
                                {appeal.url && <a href={appeal.url}>Télécharger la pièce</a>}
                                <div className="student-dossier-links">
                                    {[
                                        ['open', 'review', 'Vérifier', permissions.manage],
                                        ['under_review', 'admit', 'Déclarer recevable', permissions.manage],
                                        ['under_review', 'inadmissible', 'Déclarer irrecevable', permissions.publish],
                                        ['admissible', 'investigate', 'Affecter à l’instruction', permissions.manage],
                                        ['investigating', 'accept', 'Accepter', permissions.publish],
                                        ['investigating', 'reject', 'Rejeter', permissions.publish],
                                    ].map(
                                        ([status, action, label, allowed]) =>
                                            allowed &&
                                            status === appeal.status && (
                                                <button
                                                    className="admin-secondary"
                                                    key={String(action)}
                                                    onClick={() =>
                                                        open(
                                                            String(label),
                                                            route(prefix + 'review', appeal.id),
                                                            { action: String(action), revision: appeal.result_revision },
                                                            action === 'investigate'
                                                                ? [
                                                                      {
                                                                          name: 'assigned_to',
                                                                          label: 'Compte gestionnaire (identifiant)',
                                                                          type: 'number',
                                                                          required: true,
                                                                      },
                                                                      reason,
                                                                  ]
                                                                : [reason],
                                                        )
                                                    }
                                                >
                                                    {label}
                                                </button>
                                            ),
                                    )}
                                </div>
                            </article>
                        ))}
                        <Pagination value={props.appeals} />
                    </section>
                )}
            </main>
        </Dashboard>
    );
}
