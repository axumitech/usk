import Pagination from '@/components/admin/Pagination';
import { localDate, time } from '@/lib/scheduleDates';
import { formatDate } from '@/lib/studentEnrollment';
import { Link, usePage } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowUpRight,
    CalendarDays,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    ClipboardCheck,
    ClipboardList,
    Clock3,
    Download,
    FileText,
    FolderOpen,
    GraduationCap,
    LockKeyhole,
    MapPin,
    Paperclip,
    RotateCw,
    Trophy,
    Upload,
    UserRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import '../../../css/student-assignments.css';
import '../../../css/student-schedule.css';
import { studentHref } from './navigation';
import { StudentYearSelect, type StudentChromeData } from './StudentChrome';
import type { Academic, EvaluationView, PortalProps, Resource } from './types';

const filters = [
    ['all', 'Tous'],
    ['available', 'À faire'],
    ['upcoming', 'À venir'],
    ['submitted', 'Soumis'],
    ['grading', 'En correction'],
    ['corrected', 'Corrigés'],
] as const;

const statuses: Record<string, [string, string]> = {
    available: ['À faire', 'warm'],
    upcoming: ['À venir', 'neutral'],
    submitted: ['Soumis', 'positive'],
    grading: ['En correction', 'neutral'],
    corrected: ['Corrigé', 'positive'],
    ended: ['Échéance passée', 'muted'],
    cancelled: ['Annulé', 'muted'],
    unassigned: ['Groupe à confirmer', 'warm'],
    locked: ['Accès restreint', 'warm'],
    ongoing: ['En cours', 'positive'],
    past: ['Terminée', 'muted'],
    unscheduled: ['Date à confirmer', 'neutral'],
};

const numbers = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const points = (amount: number) => `${numbers.format(amount / 100)} point${amount === 100 ? '' : 's'}`;

function workHref(
    section: 'assignments' | 'evaluations',
    academic: number,
    filter?: string | null,
    work?: number,
    page?: string | null,
    view?: EvaluationView,
) {
    const query = new URLSearchParams();
    if (view) query.set('view', view);
    if (filter && filter !== 'all') query.set('activity', filter);
    if (work) query.set('work', String(work));
    if (page && /^[1-9]\d*$/.test(page) && page !== '1') query.set('work_page', page);
    return `${studentHref(section, academic)}${query.size ? `&${query}` : ''}`;
}

function workStatus(resource: Resource) {
    const { evaluation, assessment, assignment } = resource;
    if (evaluation?.status === 'cancelled') return 'cancelled';
    if (!resource.allowed && !assessment?.feedback) return 'locked';
    if (!evaluation) return assignment?.status ?? assessment?.status ?? 'available';
    if (assessment && ['corrected', 'grading', 'submitted', 'unassigned'].includes(assessment.status)) return assessment.status;
    return evaluation.status;
}

function Status({ resource }: { resource: Resource }) {
    const status = workStatus(resource);
    const [text, tone] = resource.evaluation && status === 'cancelled' ? ['Annulée', 'muted'] : (statuses[status] ?? statuses.available);
    return (
        <span className="student-assignment-status" data-tone={tone}>
            {text}
        </span>
    );
}

function EvaluationDate({ resource, detailed = false }: { resource: Resource; detailed?: boolean }) {
    const { starts_at: start, ends_at: end } = resource.evaluation ?? {};
    if (start && end && localDate(start) === localDate(end)) {
        return (
            <span>
                <time dateTime={start}>{formatDate(start)}</time>{' '}
                <span className="student-evaluation-hours">
                    · {time(start)}–{time(end)}
                </span>
            </span>
        );
    }
    const inPerson = resource.assessment?.modality === 'in_person' || (!resource.assessment && Boolean(resource.evaluation?.room));
    if (detailed && start && end) {
        return (
            <span>
                Du <time dateTime={start}>{formatDate(start, true)}</time> au <time dateTime={end}>{formatDate(end, true)}</time>
            </span>
        );
    }
    const date = inPerson ? (start ?? end) : (end ?? start);
    if (!date) return <span>Date à confirmer</span>;
    return (
        <span>
            {!inPerson && (end ? 'Clôture le ' : 'Ouverture le ')}
            <time dateTime={date}>{formatDate(date, true)}</time>
        </span>
    );
}

function WorkList({
    resources,
    academic,
    filter,
    counts,
    pagination,
    page,
    evaluationView,
}: {
    resources: Resource[];
    academic: number;
    filter?: string | null;
    counts?: Record<string, number> | null;
    pagination?: PortalProps['work_pagination'];
    page?: string | null;
    evaluationView?: EvaluationView;
}) {
    const section = evaluationView ? 'evaluations' : 'assignments';
    const count = (key: string) => counts?.[key] ?? 0;
    const summary = [
        { icon: ClipboardList, count: count('available') + count('upcoming'), label: 'Devoirs en attente' },
        { icon: RotateCw, count: count('submitted'), label: 'Soumis' },
        { icon: CheckCircle2, count: count('corrected'), label: 'Corrigés' },
    ];

    return (
        <>
            {!evaluationView && (
                <ul className="student-assignment-summary" aria-label="État de mes devoirs" role="list">
                    {summary.map(({ icon: Icon, count: value, label }) => (
                        <li key={label}>
                            <Icon size={21} aria-hidden="true" />
                            <strong>{value}</strong>
                            <span>{label}</span>
                        </li>
                    ))}
                </ul>
            )}
            {evaluationView ? (
                <nav className="student-assignment-filters student-evaluation-views" aria-label="Période des évaluations">
                    {(
                        [
                            { view: 'upcoming', label: 'À venir', icon: CalendarDays },
                            { view: 'past', label: 'Passées', icon: Clock3 },
                        ] as const
                    ).map(({ view, label, icon: Icon }) => (
                        <Link
                            key={view}
                            href={workHref(section, academic, null, undefined, null, view)}
                            aria-current={evaluationView === view && !filter ? 'page' : undefined}
                        >
                            <Icon size={18} aria-hidden="true" /> {label} <span>{count(view)}</span>
                        </Link>
                    ))}
                </nav>
            ) : (
                <nav className="student-assignment-filters" aria-label="Filtrer les devoirs">
                    {filters.map(([key, label]) => (
                        <Link
                            key={key}
                            href={workHref(section, academic, key)}
                            aria-current={(filter ?? 'all') === key ? 'page' : undefined}
                            preserveScroll
                        >
                            {label} <span>({count(key)})</span>
                        </Link>
                    ))}
                </nav>
            )}
            {resources.length ? (
                <ul className="student-assignment-list" role="list">
                    {resources.map((resource) => {
                        const maximum = resource.assessment?.maximum_points;
                        return (
                            <li key={resource.id} id={`resource-${resource.id}`}>
                                <Link
                                    className="student-assignment-card student-assignment-row"
                                    href={workHref(section, academic, filter, resource.id, page, filter ? undefined : evaluationView)}
                                >
                                    <div className="student-assignment-row-content">
                                        <p className="student-assignment-course">
                                            <GraduationCap size={16} aria-hidden="true" /> {resource.course}
                                        </p>
                                        <header>
                                            <h2>{resource.title}</h2>
                                            <Status resource={resource} />
                                        </header>
                                        <div className="student-assignment-quick">
                                            {evaluationView
                                                ? workStatus(resource) !== 'unscheduled' && (
                                                      <span className="student-assignment-deadline">
                                                          <CalendarDays size={16} aria-hidden="true" /> <EvaluationDate resource={resource} />
                                                      </span>
                                                  )
                                                : resource.closes_at && (
                                                      <span className="student-assignment-deadline">
                                                          <CalendarDays size={16} aria-hidden="true" />
                                                          <time dateTime={resource.closes_at}>{formatDate(resource.closes_at)}</time>
                                                      </span>
                                                  )}
                                            <span>{resource.assessment?.category ?? (evaluationView ? 'Évaluation' : 'Devoir')}</span>
                                            {evaluationView && resource.evaluation?.room && (
                                                <span>
                                                    <MapPin size={16} aria-hidden="true" /> {resource.evaluation.room}
                                                </span>
                                            )}
                                            {maximum != null && (
                                                <span>
                                                    <Trophy size={16} aria-hidden="true" />
                                                    {points(maximum)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <ChevronRight className="student-assignment-chevron" size={20} aria-hidden="true" />
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <div className="student-assignment-card student-assignment-empty">
                    <ClipboardCheck size={28} aria-hidden="true" />
                    <p>
                        {evaluationView
                            ? evaluationView === 'past'
                                ? 'Aucune évaluation passée.'
                                : 'Aucune évaluation à venir.'
                            : filter
                              ? 'Aucun devoir dans cette catégorie.'
                              : 'Aucun devoir publié pour cette inscription.'}
                    </p>
                    {filter && (
                        <Link href={workHref(section, academic, null, undefined, null, evaluationView)}>
                            {evaluationView ? 'Voir toutes les évaluations de cette période' : 'Voir tous les devoirs'}
                        </Link>
                    )}
                </div>
            )}
            <Pagination value={pagination} preserveScroll={false} />
        </>
    );
}

function Attachment({ title, size, url, download }: { title: string; size?: number | null; url?: string; download?: string | null }) {
    const sizeLabel = size ? (size >= 1024 * 1024 ? `${numbers.format(size / (1024 * 1024))} Mo` : `${numbers.format(size / 1024)} Ko`) : null;
    return (
        <li className="student-assignment-attachment">
            <span className="student-assignment-icon">
                <FileText size={18} aria-hidden="true" />
            </span>
            <span>
                {url ? <Link href={url}>{title}</Link> : <strong>{title}</strong>}
                {sizeLabel && <small>{sizeLabel}</small>}
            </span>
            {download && (
                <a href={download} aria-label={`Télécharger ${title}`}>
                    <Download size={20} aria-hidden="true" />
                </a>
            )}
        </li>
    );
}

function WorkDetail({
    resource,
    academic,
    renderSubmission,
    renderCorrection,
}: {
    resource: Resource;
    academic: number;
    renderSubmission: (resource: Resource) => ReactNode;
    renderCorrection: (resource: Resource) => ReactNode;
}) {
    const assessment = resource.assessment;
    const evaluation = resource.evaluation;
    const teacher = evaluation?.teacher ?? resource.assignment?.teacher ?? assessment?.teacher;
    const maximum = assessment?.maximum_points;
    const rubric = assessment?.rubric ?? [];
    const hasAttachments = resource.download_url || (resource.supports?.length ?? 0) > 0;
    const submission = resource.submission;
    const canSubmit = evaluation?.can_submit ?? resource.assignment?.can_submit ?? Boolean(resource.allowed && assessment?.can_submit);
    const showWork = Boolean(submission || canSubmit || assessment?.feedback || (evaluation && assessment?.participation));
    const attachment = evaluation ?? resource.assignment;

    return (
        <div className="student-assignment-detail">
            <section
                className="student-assignment-card student-assignment-facts"
                aria-label={evaluation ? 'Informations sur l’évaluation' : 'Informations sur le devoir'}
            >
                <header>
                    <span className="student-assignment-icon">
                        <ClipboardList size={25} aria-hidden="true" />
                    </span>
                    <div>
                        <h2>{assessment?.category ?? (evaluation ? 'Évaluation' : 'Devoir')}</h2>
                        {evaluation ? (
                            <p>
                                <EvaluationDate resource={resource} detailed />
                            </p>
                        ) : (
                            resource.closes_at && <p>À remettre le {formatDate(resource.closes_at, true)}</p>
                        )}
                    </div>
                    <Status resource={resource} />
                </header>
                <dl>
                    {evaluation?.room && (
                        <div>
                            <dt>
                                <MapPin size={17} aria-hidden="true" /> Salle
                            </dt>
                            <dd>{evaluation.room}</dd>
                        </div>
                    )}
                    {evaluation && assessment && (
                        <div>
                            <dt>
                                <ClipboardCheck size={17} aria-hidden="true" /> Modalité
                            </dt>
                            <dd>{assessment.modality === 'in_person' ? 'En présentiel' : 'Travail à remettre'}</dd>
                        </div>
                    )}
                    {evaluation && assessment?.session_code && (
                        <div>
                            <dt>
                                <CalendarDays size={17} aria-hidden="true" /> Session
                            </dt>
                            <dd>{assessment.session_code}</dd>
                        </div>
                    )}
                    {teacher && (
                        <div>
                            <dt>
                                <UserRound size={17} aria-hidden="true" /> Enseignant
                            </dt>
                            <dd>{teacher}</dd>
                        </div>
                    )}
                    {maximum != null && (
                        <div>
                            <dt>
                                <Trophy size={17} aria-hidden="true" /> Barème
                            </dt>
                            <dd>{points(maximum)}</dd>
                        </div>
                    )}
                    {assessment?.group && (
                        <div>
                            <dt>
                                <UserRound size={17} aria-hidden="true" /> Groupe
                            </dt>
                            <dd>{assessment.group}</dd>
                        </div>
                    )}
                    {resource.assignment?.status === 'upcoming' && resource.opens_at && (
                        <div>
                            <dt>
                                <Clock3 size={17} aria-hidden="true" /> Ouverture
                            </dt>
                            <dd>{formatDate(resource.opens_at, true)}</dd>
                        </div>
                    )}
                    {assessment?.late_deadline && resource.closes_at && Date.parse(assessment.late_deadline) > Date.parse(resource.closes_at) && (
                        <div>
                            <dt>
                                <Clock3 size={17} aria-hidden="true" /> Remise tardive
                            </dt>
                            <dd>Jusqu’au {formatDate(assessment.late_deadline, true)}</dd>
                        </div>
                    )}
                </dl>
                {canSubmit && (
                    <a className="student-assignment-go-to-work" href="#student-assignment-work">
                        <Upload size={19} aria-hidden="true" /> Accéder au dépôt <ChevronRight size={17} aria-hidden="true" />
                    </a>
                )}
            </section>
            {!resource.allowed && !assessment?.feedback && (
                <section className="student-assignment-card student-assignment-lock">
                    <LockKeyhole size={20} aria-hidden="true" />
                    <div>
                        <p>{resource.reason || 'Cette activité est soumise aux conditions d’accès de votre inscription.'}</p>
                        <Link href={studentHref('fees', academic)}>
                            Consulter mes frais <ArrowUpRight size={14} aria-hidden="true" />
                        </Link>
                    </div>
                </section>
            )}
            {(resource.body || assessment?.objectives) && (
                <section className="student-assignment-card student-assignment-section" aria-labelledby="student-assignment-instructions">
                    <h2 id="student-assignment-instructions">
                        <FileText size={19} aria-hidden="true" /> Description et consignes
                    </h2>
                    {resource.body && <p className="student-assignment-text">{resource.body}</p>}
                    {assessment?.objectives && assessment.objectives !== resource.body && (
                        <p className="student-assignment-text">{assessment.objectives}</p>
                    )}
                </section>
            )}
            {hasAttachments && (
                <section className="student-assignment-card student-assignment-section" aria-labelledby="student-assignment-attachments">
                    <h2 id="student-assignment-attachments">
                        <Paperclip size={19} aria-hidden="true" /> Pièces jointes
                    </h2>
                    <ul role="list">
                        {resource.download_url && (
                            <Attachment
                                title={attachment?.filename ?? (evaluation ? 'Sujet de l’évaluation' : 'Sujet du devoir')}
                                size={attachment?.size_bytes}
                                download={resource.download_url}
                            />
                        )}
                        {resource.supports?.map((item) => (
                            <Attachment
                                key={item.id}
                                title={item.filename || item.title}
                                size={item.size_bytes}
                                url={item.url}
                                download={item.download_url}
                            />
                        ))}
                    </ul>
                </section>
            )}
            {showWork && (
                <section className="student-assignment-card student-assignment-section" aria-labelledby="student-assignment-work">
                    <h2 id="student-assignment-work">
                        <FolderOpen size={19} aria-hidden="true" /> {evaluation && !submission && !canSubmit ? 'Ma participation' : 'Mon travail'}
                    </h2>
                    {submission ? (
                        <div className="student-assignment-delivery">
                            <p>
                                <CheckCircle2 size={17} aria-hidden="true" />{' '}
                                {assessment?.participation === 'late_submission' ? 'Remis en retard' : 'Travail transmis'} · Version{' '}
                                {submission.version}
                            </p>
                            <time dateTime={submission.submitted_at}>{formatDate(submission.submitted_at, true)}</time>
                            <div className="student-assignment-actions">
                                {submission.download_url && (
                                    <a href={submission.download_url}>
                                        <Download size={17} aria-hidden="true" /> Télécharger mon dépôt
                                    </a>
                                )}
                                {submission.id && (
                                    <Link
                                        href={`/app/dashboard/student/submissions/${submission.id}/versions/${submission.version}?academic=${academic}`}
                                    >
                                        Consulter mes versions <ChevronRight size={16} aria-hidden="true" />
                                    </Link>
                                )}
                            </div>
                        </div>
                    ) : (
                        canSubmit && <p>Aucun dépôt transmis.</p>
                    )}
                    {canSubmit && (
                        <details className="student-assignment-submit">
                            <summary>
                                <Upload size={20} aria-hidden="true" /> {submission ? 'Déposer une nouvelle version' : 'Soumettre mon travail'}{' '}
                                <ChevronDown size={17} aria-hidden="true" />
                            </summary>
                            {assessment && (
                                <p>
                                    {assessment.attempt_limit} remise{assessment.attempt_limit === 1 ? ' autorisée' : 's autorisées'}
                                </p>
                            )}
                            {renderSubmission(resource)}
                        </details>
                    )}
                    {(assessment?.feedback || (evaluation && assessment?.participation)) && (
                        <div className="student-assignment-correction">{renderCorrection(resource)}</div>
                    )}
                </section>
            )}
            {(resource.download_url || maximum != null) && (
                <div className="student-assignment-actions student-assignment-detail-actions">
                    {resource.download_url && (
                        <a href={resource.download_url}>
                            <Download size={18} aria-hidden="true" /> Télécharger le sujet
                        </a>
                    )}
                    {maximum != null && (
                        <a href="#student-assignment-rubric">
                            <Trophy size={18} aria-hidden="true" /> Voir le barème
                        </a>
                    )}
                </div>
            )}
            {maximum != null && (
                <section
                    id="student-assignment-rubric"
                    className="student-assignment-card student-assignment-section"
                    aria-labelledby="student-assignment-rubric-title"
                >
                    <h2 id="student-assignment-rubric-title">
                        <Trophy size={19} aria-hidden="true" /> Barème
                    </h2>
                    {rubric.length > 0 && (
                        <dl>
                            {rubric.map((criterion) => (
                                <div key={criterion.label}>
                                    <dt>{criterion.label}</dt>
                                    <dd>{points(criterion.maximum)}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                    <p>
                        <strong>Total</strong> {points(maximum)}
                    </p>
                </section>
            )}
        </div>
    );
}

export default function StudentAssignments({
    academic,
    chrome,
    resources,
    workId,
    filter,
    counts,
    pagination,
    evaluationView,
    renderSubmission,
    renderCorrection,
}: {
    academic: Academic;
    chrome?: StudentChromeData | null;
    resources: Resource[];
    workId?: number | null;
    filter?: string | null;
    counts?: Record<string, number> | null;
    pagination?: PortalProps['work_pagination'];
    evaluationView?: EvaluationView;
    renderSubmission: (resource: Resource) => ReactNode;
    renderCorrection: (resource: Resource) => ReactNode;
}) {
    const work = workId ? resources.find((resource) => resource.id === workId) : undefined;
    const page = new URLSearchParams(usePage().url.split('?')[1]?.split('#')[0]).get('work_page');
    const archive = chrome?.options.find((option) => option.id === academic.id)?.is_current === false;
    const section = evaluationView ? 'evaluations' : 'assignments';
    const title = evaluationView ? 'Évaluations' : 'Devoirs et travaux';
    const back = work
        ? `${workHref(section, academic.id, filter, undefined, page, filter ? undefined : evaluationView)}#resource-${work.id}`
        : studentHref('overview', academic.id, 'student-shortcuts-title');
    return (
        <div className="student-assignment student-agenda">
            <header className="student-agenda-header" data-year-state={archive ? 'archive' : 'current'}>
                <Link
                    className="student-agenda-header-action"
                    href={back}
                    aria-label={work ? (evaluationView ? 'Retour aux évaluations' : 'Retour aux devoirs') : 'Retour à l’accueil'}
                >
                    <ArrowLeft size={22} aria-hidden="true" />
                </Link>
                <div className="student-agenda-heading">
                    <h1>{work?.title ?? title}</h1>
                    {work ? (
                        <p>{work.course}</p>
                    ) : chrome && chrome.options.length > 1 ? (
                        <label className="student-agenda-year">
                            <CalendarDays size={15} aria-hidden="true" />
                            <span>Année académique {academic.year}</span>
                            <ChevronDown size={15} aria-hidden="true" />
                            <StudentYearSelect context={chrome} section={section} />
                        </label>
                    ) : (
                        <p>Année académique {academic.year}</p>
                    )}
                </div>
            </header>
            <div className="student-agenda-body student-assignment-body">
                {work ? (
                    <WorkDetail resource={work} academic={academic.id} renderSubmission={renderSubmission} renderCorrection={renderCorrection} />
                ) : (
                    <WorkList
                        resources={resources}
                        academic={academic.id}
                        filter={filter}
                        counts={counts}
                        pagination={pagination}
                        page={page}
                        evaluationView={evaluationView}
                    />
                )}
            </div>
        </div>
    );
}
