import Pagination from '@/components/admin/Pagination';
import { formatDate } from '@/lib/studentEnrollment';
import { defaultUploadLimits, documentAccept, proofUploadError, proofUploadHelp, type UploadLimits } from '@/lib/uploadLimits';
import { Link, useForm, usePage } from '@inertiajs/react';
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, Clock3, Download, GraduationCap, ListChecks } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import '../../../css/student-results.css';
import StudentResultCelebration from './StudentResultCelebration';
import type { Academic } from './types';

type Period = { name: string; grade: string | null; units: number[] };
type Item = {
    id: number;
    name: string;
    code: string | null;
    grade: string | null;
    credits: number | null;
    coefficient: number | null;
    status: string;
    selected?: string;
};
type Unit = Item & {
    items: Item[];
    earned_credits: number;
    is_composite?: boolean;
    requires_all_items?: boolean;
    ordinary_acquisition_preserved?: boolean;
};
type Summary = {
    reference: string;
    edition: number;
    published_at: string;
    decision: string;
    annual: string | null;
    ordinary_reference: string | null;
    period_scope: string | null;
    period_label?: string | null;
    context: { year: string; program: string; level: string; session: string; scale: number; credit_label: string };
};
type Selected = Summary & {
    periods: Record<string, Period>;
    units: Unit[];
    credits: { earned: number; planned: number; registered: number; compensated: number; recognized: number; remaining: number };
    unmapped_period_keys: string[];
    can_download_documents: boolean;
    deadline: string | null;
    can_appeal: boolean;
    appeals: { id: number; result_target: string; status: string; response: string | null }[];
};
type CourseProgress = {
    id: number;
    name: string;
    code: string | null;
    state: 'pending' | 'evaluated';
    unit?: string | null;
    unit_code?: string | null;
    unit_is_composite?: boolean;
};
type Semester = {
    number: 1 | 2;
    period_key: string | null;
    reference: string | null;
    status: 'in_progress' | 'awaiting_publication' | 'published';
    passed: boolean;
    courses: CourseProgress[];
};
export type OfficialResultsProps = {
    items: { data: Summary[] } | null;
    selected: Selected | null;
    semesters: Semester[];
    selected_semester: number | null;
};
const statuses: Record<string, string> = {
    passed: 'Validé',
    compensated: 'Compensé',
    recognized: 'Reconnu',
    incomplete: 'Incomplet',
    failed: 'Non validé',
    eliminatory: 'Éliminatoire',
};
const appeals: Record<string, string> = {
    open: 'Déposé',
    under_review: 'En vérification',
    admissible: 'Recevable',
    investigating: 'En instruction',
    accepted: 'Accepté',
    rejected: 'Rejeté',
    inadmissible: 'Irrecevable',
};
const quantity = (value: number, divisor = 100) => new Intl.NumberFormat('fr', { maximumFractionDigits: 3 }).format(value / divisor);

function AppealForm({ result, academic }: { result: Selected; academic: number }) {
    const form = useForm({ target: '', body: '', file: null as File | null });
    const limits = usePage<{ uploadLimits?: UploadLimits }>().props.uploadLimits ?? defaultUploadLimits;
    const filed = new Set(result.appeals.map((appeal) => appeal.result_target));
    const targets = [
        { code: 'decision', label: 'Décision du jury' },
        ...result.units.flatMap((unit) => unit.items.map((item) => ({ code: `ec:${item.id}`, label: item.name }))),
    ].filter((item) => !filed.has(item.code));
    if (!targets.length) return null;
    return (
        <details className="student-results-disclosure">
            <summary>Déposer un recours</summary>
            <form
                className="portal-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (form.processing) return;
                    const error = form.data.file && proofUploadError(form.data.file, limits);
                    if (error) {
                        form.setError('file', error);
                        return;
                    }
                    form.post(route('dashboard.student.results.appeal', { reference: result.reference, academic }), {
                        forceFormData: true,
                        preserveScroll: true,
                        onSuccess: () => form.reset(),
                    });
                }}
            >
                <label>
                    Résultat concerné{' '}
                    <select required value={form.data.target} onChange={(e) => form.setData('target', e.target.value)}>
                        <option value="">Choisir</option>
                        {targets.map((item) => (
                            <option value={item.code} key={item.code}>
                                {item.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Motif du recours{' '}
                    <textarea
                        required
                        minLength={10}
                        maxLength={6000}
                        value={form.data.body}
                        onChange={(e) => form.setData('body', e.target.value)}
                    />
                </label>
                <label>
                    Pièce facultative
                    <input type="file" accept={documentAccept} disabled={form.processing} onChange={(e) => form.setData('file', e.target.files?.[0] ?? null)} />
                    <small>{proofUploadHelp(limits)}</small>
                </label>
                {Object.values(form.errors).map((error, index) => (
                    <p key={index} role="alert">
                        {error}
                    </p>
                ))}
                <button className="portal-primary" disabled={form.processing}>
                    Transmettre mon recours
                </button>
            </form>
        </details>
    );
}

const semesterNames = { 1: 'Premier semestre', 2: 'Deuxième semestre' } as const;
const semesterStatus = {
    in_progress: 'Évaluations en cours',
    awaiting_publication: 'En attente du jury',
    published: 'Publié',
};

function CourseProgressList({ courses, evaluated }: { courses: CourseProgress[]; evaluated: boolean }) {
    const Icon = evaluated ? CheckCircle2 : Clock3;
    return (
        <section className={`student-results-progress-list ${evaluated ? 'is-completed' : ''}`}>
            <header>
                <Icon size={20} aria-hidden="true" />
                <h3>{evaluated ? 'Cours évalués' : 'Cours en cours d’évaluation'}</h3>
                <span className="student-results-count">{courses.length}</span>
            </header>
            {courses.length ? (
                <ul>
                    {courses.map((course) => (
                        <li key={course.id}>
                            <span>
                                {course.name}
                                {course.unit_is_composite && (
                                    <small className="student-results-progress-unit">
                                        {['UE composée', course.unit || course.unit_code].filter(Boolean).join(' · ')}
                                    </small>
                                )}
                            </span>
                            {course.code && <small className="student-results-progress-code">{course.code}</small>}
                        </li>
                    ))}
                </ul>
            ) : (
                <p>{evaluated ? 'Aucun cours évalué pour le moment.' : 'Aucun cours en cours d’évaluation.'}</p>
            )}
        </section>
    );
}

function SemesterProgress({ semester }: { semester: Semester }) {
    const evaluated = semester.courses.filter((course) => course.state === 'evaluated');
    const pending = semester.courses.filter((course) => course.state === 'pending');
    const total = semester.courses.length;
    return (
        <section className="student-results-panel student-results-progress" aria-labelledby="student-result-progress-title">
            <header>
                <span className="student-results-hero-icon">
                    <Clock3 size={28} aria-hidden="true" />
                </span>
                <div>
                    <h2 id="student-result-progress-title">Résultats pas encore disponibles</h2>
                    <p>
                        {semester.status === 'awaiting_publication'
                            ? 'Les évaluations sont terminées. Les résultats seront disponibles après publication par le jury.'
                            : total
                              ? 'Les résultats seront disponibles après les évaluations et la publication par le jury.'
                              : 'Les cours et leur état d’évaluation apparaîtront ici dès qu’ils seront renseignés.'}
                    </p>
                </div>
            </header>
            {total > 0 && (
                <>
                    <div className="student-results-progress-meter">
                        <label htmlFor="student-result-evaluations-progress">Avancement des évaluations</label>
                        <span>
                            {evaluated.length} / {total}
                        </span>
                        <progress id="student-result-evaluations-progress" value={evaluated.length} max={total} />
                    </div>
                    <div className="student-results-progress-grid">
                        <CourseProgressList courses={pending} evaluated={false} />
                        <CourseProgressList courses={evaluated} evaluated />
                    </div>
                </>
            )}
        </section>
    );
}

const isComposite = (unit: Unit) => unit.is_composite ?? unit.items.length > 1;
const requiresAllItems = (unit: Unit) => isComposite(unit) && unit.requires_all_items === true && !unit.ordinary_acquisition_preserved;

function UnitLabel({ unit }: { unit: Unit }) {
    const validated = unit.items.filter((item) => item.status === 'passed' || item.status === 'recognized').length;
    return (
        <>
            <span>{unit.name}</span>
            {isComposite(unit) ? (
                <>
                    <div className="student-results-unit-meta">
                        <span className="student-results-composite-badge">UE composée</span>
                        {unit.code && <span>{unit.code}</span>}
                    </div>
                    {unit.ordinary_acquisition_preserved ? (
                        <small>Validation acquise lors d’une session précédente</small>
                    ) : (
                        requiresAllItems(unit) && (
                            <small>
                                {validated} / {unit.items.length} cours requis validés ou reconnus
                            </small>
                        )
                    )}
                </>
            ) : (
                unit.code && <small>{unit.code} · UE</small>
            )}
        </>
    );
}

function OfficialGrades({ result, periodKey, isSemester = false }: { result: Selected; periodKey: string; isSemester?: boolean }) {
    const period = result.periods[periodKey];
    const units = result.units.filter((unit) => period.units.includes(unit.id));
    const earned = units.reduce((total, unit) => total + unit.earned_credits, 0);
    const planned = units.reduce((total, unit) => total + (unit.credits ?? 0), 0);

    return (
        <section className="student-results-grade-section" aria-label={period.name}>
            {!isSemester && <h3>{period.name}</h3>}
            <dl className="student-results-grade-metrics">
                <div>
                    <dt>{isSemester ? 'Moyenne du semestre' : 'Moyenne de la période'}</dt>
                    <dd>{period.grade === null ? '—' : `${period.grade} / ${quantity(result.context.scale)}`}</dd>
                </div>
                <div>
                    <dt>Crédits acquis</dt>
                    <dd>
                        {quantity(earned)} / {quantity(planned)}
                    </dd>
                </div>
            </dl>
            {units.some(requiresAllItems) && (
                <p className="student-results-composite-rule">
                    Pour valider une UE composée, tous ses cours requis doivent être validés ou reconnus.
                </p>
            )}
            <div className="student-results-grade-scroll" role="region" aria-label={`Grille des notes · ${period.name}`} tabIndex={0}>
                <table className="student-results-grade-table">
                    <caption className="sr-only">Notes officielles et décisions · {period.name}</caption>
                    <thead>
                        <tr>
                            <th scope="col">UE et EC</th>
                            <th scope="col">Note / {quantity(result.context.scale)}</th>
                            <th scope="col">Crédits</th>
                            <th scope="col" className="student-results-coefficient">
                                Coefficient
                            </th>
                            <th scope="col">Décision</th>
                        </tr>
                    </thead>
                    {units.map((unit) => (
                        <tbody key={unit.id}>
                            <tr className="student-results-unit">
                                <th scope="row">
                                    <UnitLabel unit={unit} />
                                </th>
                                <td>{unit.grade ?? '—'}</td>
                                <td>
                                    {quantity(unit.earned_credits)}
                                    {unit.credits !== null && ` / ${quantity(unit.credits)}`}
                                </td>
                                <td className="student-results-coefficient">—</td>
                                <td>
                                    <span className="student-results-decision" data-status={unit.status}>
                                        {statuses[unit.status] ?? unit.status}
                                    </span>
                                </td>
                            </tr>
                            {unit.items.map((item) => (
                                <tr key={item.id} className="student-results-item">
                                    <th scope="row">
                                        <span>{item.name}</span>
                                        <small>
                                            {[item.code, 'EC', item.selected === 'ordinary' ? 'Ordinaire' : null].filter(Boolean).join(' · ')}
                                        </small>
                                        {item.coefficient !== null && (
                                            <small className="student-results-inline-coefficient">
                                                Coefficient {quantity(item.coefficient, 1000)}
                                            </small>
                                        )}
                                    </th>
                                    <td>{item.grade ?? '—'}</td>
                                    <td>{item.credits === null ? '—' : quantity(item.credits)}</td>
                                    <td className="student-results-coefficient">
                                        {item.coefficient === null ? '—' : quantity(item.coefficient, 1000)}
                                    </td>
                                    <td>
                                        <span className="student-results-decision" data-status={item.status}>
                                            {statuses[item.status] ?? item.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    ))}
                </table>
            </div>
        </section>
    );
}

function PublishedSheet({
    result,
    academic,
    periodKeys,
    additionalPeriodKeys = [],
    semester,
    url,
}: {
    result: Selected;
    academic: Academic;
    periodKeys: string[];
    additionalPeriodKeys?: string[];
    semester?: Semester;
    url: (reference: string) => string;
}) {
    const [revealed, setRevealed] = useState(false);
    const heading = useRef<HTMLHeadingElement>(null);
    const celebrate = semester?.passed === true;
    useEffect(() => {
        if (revealed && celebrate && heading.current) {
            heading.current.focus({ preventScroll: true });
            heading.current.scrollIntoView({ block: 'start' });
        }
    }, [revealed, celebrate]);

    if (celebrate && !revealed) {
        return (
            <StudentResultCelebration
                studentName={academic.name}
                semesterLabel={semesterNames[semester.number].toLowerCase()}
                yearLabel={academic.year}
                facultyName={academic.faculty}
                photoUrl={academic.photo_url}
                onViewResults={() => setRevealed(true)}
            />
        );
    }

    const documentsAllowed = result.can_download_documents;
    const periodLabel = semester ? semesterNames[semester.number] : 'Périodes officielles';
    const academicId = academic.id;
    return (
        <section className="student-results-panel student-results-sheet" aria-labelledby="student-result-sheet-title">
            <header className="student-results-sheet-header">
                <img src="/assets/usk/logo.png" alt="" width={56} height={56} />
                <div>
                    <p>Université Simon Kimbangu</p>
                    <h2 id="student-result-sheet-title" ref={heading} tabIndex={-1}>
                        Fiche de résultats
                    </h2>
                    <span>
                        {academic.faculty} · {result.context.level} · {result.context.year}
                    </span>
                </div>
            </header>
            <div className="student-results-sheet-student">
                <div>
                    <strong>{academic.name}</strong>
                    {academic.matricule && <span>Matricule {academic.matricule}</span>}
                </div>
                <div>
                    <strong>{periodLabel}</strong>
                    <span>
                        Session {result.context.session} · Édition {result.edition}
                    </span>
                </div>
            </div>
            {semester && (
                <div className="student-results-semester-outcome" data-status={semester.passed ? 'passed' : 'failed'}>
                    {semester.passed ? <CheckCircle2 size={19} aria-hidden="true" /> : <ListChecks size={19} aria-hidden="true" />}
                    {semester.passed ? 'Semestre validé' : 'Semestre non validé'}
                </div>
            )}
            {periodKeys.map((key) => (
                <OfficialGrades key={key} result={result} periodKey={key} isSemester={semester !== undefined} />
            ))}
            {additionalPeriodKeys.length > 0 && (
                <details className="student-results-disclosure">
                    <summary>Autres périodes publiées dans cette édition</summary>
                    <div className="student-results-other-periods">
                        {additionalPeriodKeys.map((key) => (
                            <OfficialGrades key={key} result={result} periodKey={key} />
                        ))}
                    </div>
                </details>
            )}
            <div className="student-results-jury">
                <div>
                    <span>Décision du jury</span>
                    <strong>{result.decision}</strong>
                </div>
                {result.period_scope === null && result.annual !== null && (
                    <div>
                        <span>Moyenne annuelle</span>
                        <strong>
                            {result.annual} / {quantity(result.context.scale)}
                        </strong>
                    </div>
                )}
                <div>
                    <span>Publication</span>
                    <strong>{formatDate(result.published_at, true)}</strong>
                </div>
            </div>
            {documentsAllowed && (
                <div className="student-results-actions">
                    <a href={route('dashboard.student.results.document', { reference: result.reference, kind: 'report', academic: academicId })}>
                        <Download size={18} aria-hidden="true" /> {result.period_scope ? 'Bulletin du semestre (PDF)' : 'Bulletin PDF'}
                    </a>
                    {result.period_scope === null && (
                        <a
                            href={route('dashboard.student.results.document', {
                                reference: result.reference,
                                kind: 'transcript',
                                academic: academicId,
                            })}
                        >
                            <Download size={18} aria-hidden="true" /> Relevé annuel PDF
                        </a>
                    )}
                </div>
            )}
            {result.ordinary_reference && (
                <Link className="student-results-text-link" href={url(result.ordinary_reference)}>
                    Édition ordinaire de référence <ArrowRight size={16} aria-hidden="true" />
                </Link>
            )}
            {(result.can_appeal || result.deadline || result.appeals.length > 0) && (
                <section className="student-results-appeals" aria-label="Recours">
                    <h3>Recours</h3>
                    {result.deadline && <p>Dépôt possible jusqu’au {formatDate(result.deadline, true)}.</p>}
                    {result.can_appeal && <AppealForm key={result.reference} result={result} academic={academicId} />}
                    {result.appeals.length > 0 && (
                        <ul>
                            {result.appeals.map((appeal) => (
                                <li key={appeal.id}>
                                    Recours n°{appeal.id} · {appeals[appeal.status] ?? appeal.status}
                                    {appeal.response && <p>{appeal.response}</p>}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
        </section>
    );
}

export default function OfficialResults({ data, academic }: { data: OfficialResultsProps; academic: Academic }) {
    const selected = data.selected;
    if (!data.items) return null;

    const { semesters } = data;
    const semester =
        semesters.find((item) => item.number === data.selected_semester) ??
        semesters.find((item) => item.reference && item.reference === selected?.reference) ??
        semesters[0];
    const url = (reference?: string | null, semesterNumber?: number) =>
        route('dashboard.student.index', {
            section: 'results',
            academic: academic.id,
            ...(reference && { official: reference }),
            ...(semesterNumber && { semester: semesterNumber }),
        });
    const currentPeriod =
        semester?.reference === selected?.reference && semester?.period_key && selected?.periods[semester.period_key] ? semester.period_key : null;
    const legacyPeriodKeys = selected?.unmapped_period_keys ?? [];
    const published = Boolean(currentPeriod && semester?.status === 'published');

    return (
        <div className="student-results-page">
            <header className="student-results-header">
                <div>
                    <span>
                        {academic.level} · {academic.year}
                    </span>
                    <h1>Mes résultats</h1>
                </div>
                <span className="student-results-header-icon">
                    <GraduationCap size={28} aria-hidden="true" />
                </span>
            </header>
            {semesters.length > 0 && (
                <nav className="student-results-semesters" aria-label="Semestres">
                    {semesters.map((item) => (
                        <Link
                            key={item.number}
                            href={url(item.reference, item.number)}
                            aria-current={semester?.number === item.number ? 'page' : undefined}
                        >
                            <span className="student-results-semester-icon">
                                <CalendarDays size={20} aria-hidden="true" />
                            </span>
                            <span>
                                <strong>{semesterNames[item.number]}</strong>
                                <small data-status={item.status}>{semesterStatus[item.status]}</small>
                            </span>
                        </Link>
                    ))}
                </nav>
            )}
            {selected && currentPeriod && semester && published && (
                <PublishedSheet
                    key={`${selected.reference}:${currentPeriod}`}
                    result={selected}
                    academic={academic}
                    periodKeys={[currentPeriod]}
                    additionalPeriodKeys={legacyPeriodKeys}
                    semester={semester}
                    url={url}
                />
            )}
            {semester && !published && <SemesterProgress semester={semester} />}
            {selected && !published && legacyPeriodKeys.length > 0 && (
                <PublishedSheet key={selected.reference} result={selected} academic={academic} periodKeys={legacyPeriodKeys} url={url} />
            )}
            {data.items.data.length > 0 && (
                <details className="student-results-panel student-results-editions">
                    <summary>Éditions officielles publiées</summary>
                    <ul>
                        {data.items.data.map((item) => (
                            <li key={item.reference}>
                                <Link href={url(item.reference)} aria-current={selected?.reference === item.reference ? 'page' : undefined}>
                                    <BookOpen size={16} aria-hidden="true" />
                                    <span>
                                        {item.context.session} · Édition {item.edition}
                                        <small>
                                            {item.period_scope ? item.period_label || 'Semestre' : 'Année complète'} ·{' '}
                                            {formatDate(item.published_at, true)}
                                        </small>
                                    </span>
                                    <ArrowRight size={16} aria-hidden="true" />
                                </Link>
                            </li>
                        ))}
                    </ul>
                    <Pagination value={data.items} />
                </details>
            )}
        </div>
    );
}
