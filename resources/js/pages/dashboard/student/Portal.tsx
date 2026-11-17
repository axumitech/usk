import FeedbackToast, { type ToastFeedback } from '@/components/admin/FeedbackToast';
import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import ModuleLanding from '@/components/student/ModuleLanding';
import { studentHref, studentModules, studentSectionAccess, studentSectionLabels } from '@/components/student/navigation';
import OfficialDocumentCenter from '@/components/student/OfficialDocumentCenter';
import OfficialResults from '@/components/student/OfficialResults';
import {
    AcademicSummary,
    EmptyState,
    FinancialStatusBanner,
    PedagogicalRegistrationNotice,
    StudentIdentityCard,
} from '@/components/student/PortalCards';
import ProfilePageHeading, { ProfileSettings, ProfileSubpageHeading, studentProfileHref } from '@/components/student/ProfilePageHeading';
import StudentAlertBubble from '@/components/student/StudentAlertBubble';
import StudentAssignments from '@/components/student/StudentAssignments';
import { studentChromeHref } from '@/components/student/StudentChrome';
import CoursesBySemester from '@/components/student/StudentCourseCards';
import StudentDocumentsLibrary from '@/components/student/StudentDocumentsLibrary';
import StudentFinance from '@/components/student/StudentFinance';
import StudentOverview from '@/components/student/StudentOverview';
import StudentProfileForm, { StudentPasswordModal } from '@/components/student/StudentProfileForm';
import StudentSchedule from '@/components/student/StudentSchedule';
import StudentSchoolServices from '@/components/student/StudentSchoolServices';
import StudentShortcuts from '@/components/student/StudentShortcuts';
import StudentWelcome from '@/components/student/StudentWelcome';
import { labels, type AssessmentActivity, type PortalProps, type Resource } from '@/components/student/types';
import { formatDate } from '@/lib/studentEnrollment';
import { Head, Link, useForm, usePage, usePoll } from '@inertiajs/react';
import { BookOpen, Download, LockKeyhole, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import '../../../../css/student-overview-desktop.css';
import '../../../../css/student-portal.css';
function DepartmentChoice({
    academic,
    department,
    options,
    onFeedback,
}: {
    academic: number;
    department: PortalProps['department'];
    options: PortalProps['department_options'];
    onFeedback: (message: string) => void;
}) {
    const form = useForm({ academic_department_id: '' });
    if (department)
        return (
            <p className="portal-muted">
                Département · <strong>{department.name}</strong>
            </p>
        );
    if (!options.length) return null;

    return (
        <section className="portal-panel" aria-labelledby="student-department-title">
            <header>
                <h2 id="student-department-title">Choisir mon département</h2>
            </header>
            <p className="portal-muted">Ce choix est définitif pour cette inscription. Il détermine vos cours et séances de spécialité.</p>
            <form
                className="portal-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    form.post(route('dashboard.student.department.choose', { academic }), {
                        preserveScroll: true,
                        onSuccess: () => onFeedback('Votre département a été confirmé.'),
                    });
                }}
            >
                <label>
                    Département
                    <select
                        required
                        value={form.data.academic_department_id}
                        onChange={(event) => form.setData('academic_department_id', event.target.value)}
                    >
                        <option value="">Sélectionner un département</option>
                        {options.map((option) => (
                            <option key={option.id} value={option.id}>
                                {option.name}
                            </option>
                        ))}
                    </select>
                </label>
                {form.errors.academic_department_id && (
                    <p className="portal-alert" role="alert">
                        {form.errors.academic_department_id}
                    </p>
                )}
                <button type="submit" className="portal-primary" disabled={form.processing || !form.data.academic_department_id}>
                    Confirmer mon choix
                </button>
            </form>
        </section>
    );
}

const pathwayLabels: Record<string, string> = {
    interruption: 'Interruption',
    resumption: 'Reprise d’études',
    reorientation: 'Réorientation',
    external_transfer: 'Transfert externe',
    cycle: 'Changement de cycle',
    graduation: 'Fin de cursus',
    advance: 'Passage',
    repeat: 'Redoublement',
    conditional: 'Passage conditionnel',
};

function Renewal({ decision, academic }: { decision: NonNullable<PortalProps['progression']>; academic: number }) {
    const form = useForm<{ progression?: string }>({});

    return (
        <section className="portal-panel" aria-labelledby="student-renewal-title">
            <header>
                <h2 id="student-renewal-title">Réinscription · {decision.level}</h2>
            </header>
            <p>
                <strong>{decision.year}</strong> · {pathwayLabels[decision.kind ?? ''] || 'Décision de progression enregistrée'}
            </p>
            {decision.due_on && <p>Échéance de reprise {decision.due_on}</p>}
            {!!decision.retakes?.length && (
                <div>
                    <h3>Matières à reprendre</h3>
                    <ul>
                        {decision.retakes.map((item) => (
                            <li key={item.item_id}>
                                {item.unit} · {item.name}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {decision.target_id ? (
                <>
                    <p className="portal-muted">
                        {decision.status === 'pending_confirmation'
                            ? 'Votre inscription est en attente de contrôle et de confirmation par le service des inscriptions.'
                            : labels[decision.status ?? ''] || decision.status}
                    </p>
                    {decision.target_id !== academic && (
                        <Link className="portal-primary" href={route('dashboard.student.index', { section: 'fees', academic: decision.target_id })}>
                            Consulter ma réinscription
                        </Link>
                    )}
                </>
            ) : decision.can_start ? (
                <form
                    className="portal-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        form.post(route('dashboard.student.renewals.start', { progression: decision.id, academic }));
                    }}
                >
                    {form.errors.progression && (
                        <p className="portal-alert" role="alert">
                            {form.errors.progression}
                        </p>
                    )}
                    {form.progress && <progress value={form.progress.percentage} max={100} aria-label="Téléversement du travail" />}
                    <button className="portal-primary" disabled={form.processing}>
                        Lancer ma réinscription
                    </button>
                </form>
            ) : (
                <p className="portal-muted">La réinscription est actuellement indisponible pour ce dossier.</p>
            )}
        </section>
    );
}

const participationLabels: Record<string, string> = {
    submitted: 'Remis',
    late_submission: 'Remis en retard',
    not_submitted: 'Non remis',
    present: 'Présent',
    late: 'Arrivé en retard',
    absent: 'Absent',
    excused: 'Absence justifiée',
    exempt: 'Dispensé',
    interrupted: 'Interrompu',
    invalidated: 'Invalidé',
};
const assessmentPoints = (value: number) => new Intl.NumberFormat('fr', { maximumFractionDigits: 2 }).format(value / 100);

function AssessmentReview({ url, onFeedback }: { url: string; onFeedback: (message: string) => void }) {
    const form = useForm({ body: '' });
    return (
        <details>
            <summary>Demander une révision pédagogique</summary>
            <form
                className="portal-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    form.post(url, { preserveScroll: true, onSuccess: () => onFeedback('Demande de révision enregistrée.') });
                }}
            >
                <label>
                    Motif de la demande{' '}
                    <textarea
                        required
                        minLength={10}
                        maxLength={6000}
                        value={form.data.body}
                        onChange={(event) => form.setData('body', event.target.value)}
                    />
                </label>
                {form.errors.body && <p role="alert">{form.errors.body}</p>}
                <button className="portal-secondary" disabled={form.processing}>
                    Transmettre la demande
                </button>
            </form>
        </details>
    );
}

function AssessmentInfo({
    activity,
    onFeedback,
    assignmentAction,
}: {
    activity: AssessmentActivity;
    onFeedback: (message: string) => void;
    assignmentAction?: string;
}) {
    const feedback = activity.feedback;
    return (
        <div>
            {activity.participation && participationLabels[activity.participation] && <p>{participationLabels[activity.participation]}</p>}
            {feedback && (
                <section aria-label="Correction pédagogique">
                    <h3>Correction pédagogique</h3>
                    {feedback.points !== null && (
                        <p>
                            Résultat pédagogique {assessmentPoints(feedback.points)} / {assessmentPoints(activity.maximum_points ?? 0)}
                        </p>
                    )}
                    {feedback.individual && <p style={{ whiteSpace: 'pre-wrap' }}>{feedback.individual}</p>}
                    {feedback.collective && <p style={{ whiteSpace: 'pre-wrap' }}>{feedback.collective}</p>}
                    {feedback.criteria.length > 0 && (
                        <ul>
                            {feedback.criteria.map((criterion) => (
                                <li key={criterion.label}>
                                    {criterion.label} · {assessmentPoints(criterion.points)} / {assessmentPoints(criterion.maximum)}
                                </li>
                            ))}
                        </ul>
                    )}
                    {feedback.file_url && <a href={feedback.file_url}>Télécharger ma correction</a>}
                    {feedback.review_url && <AssessmentReview url={`${feedback.review_url}${assignmentAction ?? ''}`} onFeedback={onFeedback} />}
                </section>
            )}
        </div>
    );
}

function WorkForm({
    resource,
    academic,
    onFeedback,
    assignmentAction,
}: {
    resource: Resource;
    academic: number;
    onFeedback: (message: string) => void;
    assignmentAction?: string;
}) {
    const input = useRef<HTMLInputElement>(null);
    const operation = useRef<string | null>(null);
    const form = useForm<{ body: string; file: File | null }>({ body: resource.submission?.body || '', file: null });
    const formats = resource.assessment?.submission_formats ?? ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
    const maximum = resource.assessment?.submission_max_kb;
    return (
        <form
            className="portal-form"
            onSubmit={(event) => {
                event.preventDefault();
                if (form.processing) return;
                operation.current ??= crypto.randomUUID();
                form.transform((data) => ({
                    ...data,
                    file: input.current?.files?.[0] || null,
                    operation_key: operation.current,
                    expected_version: resource.submission?.version ?? 0,
                }));

                form.post(`/app/dashboard/student/resources/${resource.id}/submit?academic=${academic}${assignmentAction ?? ''}`, {
                    forceFormData: true,
                    preserveScroll: true,
                    errorBag: `work-${resource.id}`,
                    onSuccess: () => {
                        operation.current = null;
                        onFeedback('Votre travail a été transmis.');
                        form.reset('file');
                        if (input.current) input.current.value = '';
                    },
                });
            }}
        >
            <label htmlFor={`work-${resource.id}`}>Votre réponse</label>
            <textarea
                id={`work-${resource.id}`}
                value={form.data.body}
                onChange={(event) => form.setData('body', event.target.value)}
                rows={5}
                maxLength={20000}
            />
            <label htmlFor={`work-file-${resource.id}`}>Joindre un fichier</label>
            <input
                id={`work-file-${resource.id}`}
                aria-describedby={`work-file-rules-${resource.id}`}
                ref={input}
                type="file"
                accept={formats.map((extension) => `.${extension}`).join(',')}
                onChange={(event) => form.setData('file', event.target.files?.[0] || null)}
            />
            <small id={`work-file-rules-${resource.id}`}>
                {formats.map((extension) => extension.toUpperCase()).join(', ')}
                {maximum != null && ` · ${new Intl.NumberFormat('fr-FR').format(maximum)} Kio maximum`}
            </small>
            {Object.values(form.errors).map((error, index) => (
                <p role="alert" className="portal-error" key={index}>
                    {error}
                </p>
            ))}
            <button className="portal-primary" disabled={form.processing}>
                <Send size={16} />
                {form.processing
                    ? 'Envoi…'
                    : resource.submission
                      ? 'Actualiser mon dépôt'
                      : assignmentAction
                        ? 'Soumettre mon travail'
                        : 'Transmettre mon travail'}
            </button>
        </form>
    );
}
export default function Portal(props: PortalProps) {
    const { url } = usePage();
    const { academic, section, permissions, balance, resources } = props;
    const isAcademicLanding = section === 'academics';
    const isCourseList = section === 'courses';
    const isResults = section === 'results';
    const [guideRequest, setGuideRequest] = useState(0);
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [toast, setToast] = useState<ToastFeedback | null>(props.success ? { id: 0, message: props.success, tone: 'success' } : null);
    const sequence = useRef(0);
    const notify = (message: string) => setToast({ id: ++sequence.current, message, tone: 'success' });
    const previousAccess = useRef({ academic: academic.id, permissions });
    useEffect(() => {
        const titles: Record<string, string> = {
            materials_download: 'supports pédagogiques',
            assignments_submit: 'dépôt de travaux',
            evaluations_participate: 'évaluations',
            documents_request: 'demandes de documents',
        };
        if (previousAccess.current.academic === academic.id) {
            const opened = Object.keys(titles).filter(
                (feature) => permissions[feature]?.allowed && !previousAccess.current.permissions[feature]?.allowed,
            );
            if (opened.length)
                notify(
                    `Vos accès ont été actualisés : ${opened.map((feature) => titles[feature]).join(', ')}. Votre solde financier reste consultable séparément.`,
                );
        }
        previousAccess.current = { academic: academic.id, permissions };
    }, [permissions, academic.id]);
    const sectionPollProps: Record<string, string[]> = {
        overview: [
            'overview',
            'profile_completion',
            'courses',
            'pedagogical_registration_pending',
            'calendar_events',
            'resources',
            'progression',
            'sessions',
            'upcoming_sessions',
            'schedule_week',
        ],
        academics: ['progression'],
        schedule: ['sessions', 'schedule_week', 'schedule_day', 'schedule_view', 'calendar_events'],
        courses: ['courses', 'course_credits', 'pedagogical_registration_pending'],
        materials: ['resources'],
        assignments: ['resources', 'work_pagination', 'assignment_counts'],
        evaluations: ['resources', 'work_pagination', 'evaluation_counts', 'evaluation_view'],
        results: ['resources', 'official_results'],
        documents: ['document_library', 'document_center'],
        fees: ['progression', 'finance_details', 'finance_schedule', 'payment_proofs', 'adjustments'],
        'annual-fees': ['finance_details', 'finance_schedule'],
        transactions: ['finance_view', 'payments', 'payments_pagination'],
        services: ['scolarite'],
        requests: ['scolarite'],
        card: ['card_eligibility', 'document_center'],
    };
    usePoll(30000, { only: ['studentChrome', 'permissions', 'balance', 'academic', ...(sectionPollProps[section] ?? [])] });
    const href = (section = 'overview') => studentHref(section, academic.id);
    const canOpen = (key: string) => {
        const access = studentSectionAccess(key, permissions);
        return access.visible && access.allowed;
    };
    const resourceKind: Record<string, string> = {
        materials: 'material',
        assignments: 'assignment',
        evaluations: 'evaluation',
        results: 'result',
    };
    const activeModule = studentModules.find((module) => module.sections.includes(section)) || studentModules[0];
    const activeSections = activeModule.sections.filter(canOpen);
    const displayed = resources.filter((resource) => resource.kind === resourceKind[section]);
    if (section === 'assignments' || section === 'evaluations') {
        const evaluationView = section === 'evaluations' ? (props.evaluation_view ?? 'upcoming') : undefined;
        const assignmentQuery = new URLSearchParams({ [evaluationView ? 'evaluation_detail' : 'assignment_detail']: '1' });
        const page = new URLSearchParams(url.split('?')[1]?.split('#')[0]).get('work_page');
        if (evaluationView && !props.activity_filter) assignmentQuery.set('view', evaluationView);
        if (props.activity_filter) assignmentQuery.set('activity', props.activity_filter);
        if (page) assignmentQuery.set('work_page', page);
        const assignmentAction = `&${assignmentQuery}`;
        return (
            <Dashboard>
                <Head title={props.work_id && displayed[0] ? displayed[0].title : evaluationView ? 'Évaluations' : 'Devoirs et travaux'} />
                {toast && <FeedbackToast key={toast.id} feedback={toast} onDismiss={() => setToast(null)} />}
                <StudentAssignments
                    academic={academic}
                    chrome={props.studentChrome}
                    resources={displayed}
                    workId={props.work_id}
                    filter={props.activity_filter}
                    counts={evaluationView ? props.evaluation_counts : props.assignment_counts}
                    evaluationView={evaluationView}
                    pagination={props.work_pagination}
                    renderSubmission={(resource) => (
                        <WorkForm
                            key={resource.id}
                            resource={resource}
                            academic={academic.id}
                            onFeedback={notify}
                            assignmentAction={assignmentAction}
                        />
                    )}
                    renderCorrection={(resource) =>
                        resource.assessment && (
                            <AssessmentInfo activity={resource.assessment} onFeedback={notify} assignmentAction={assignmentAction} />
                        )
                    }
                />
            </Dashboard>
        );
    }
    if ((section === 'services' || section === 'requests') && props.scolarite) {
        const page = new URLSearchParams(url.split('?')[1]?.split('#')[0]).get('requests_page');
        return (
            <Dashboard>
                <Head title={section === 'services' ? 'Scolarité' : 'Mes demandes'} />
                {toast && <FeedbackToast key={toast.id} feedback={toast} onDismiss={() => setToast(null)} />}
                <StudentSchoolServices
                    academic={academic}
                    chrome={props.studentChrome}
                    data={props.scolarite}
                    section={section}
                    page={page && /^[1-9]\d*$/.test(page) ? page : undefined}
                />
            </Dashboard>
        );
    }
    if (section === 'documents') {
        return (
            <Dashboard>
                <Head title="Mes documents" />
                <StudentDocumentsLibrary academic={academic} library={props.document_library} center={props.document_center} />
            </Dashboard>
        );
    }
    if (section === 'profile') {
        const view = props.profile_view ?? 'overview';
        const title = view === 'settings' ? 'Paramètres du compte' : view === 'overview' ? 'Mon profil' : 'Informations personnelles';
        const yearCount = new Set(props.studentChrome?.options.map((option) => option.year_id)).size || 1;
        return (
            <Dashboard>
                <Head title={title} />
                {toast && <FeedbackToast key={toast.id} feedback={toast} onDismiss={() => setToast(null)} />}
                {passwordOpen && <StudentPasswordModal academic={academic.id} onClose={() => setPasswordOpen(false)} onFeedback={notify} />}
                <StudentWelcome academic={academic} pending={false} openRequest={guideRequest} />
                <div className="sp-page">
                    {view === 'overview' ? (
                        <ProfilePageHeading academic={academic} yearCount={yearCount} context={props.studentChrome} />
                    ) : (
                        <>
                            <ProfileSubpageHeading academic={academic.id} title={title} />
                            {view === 'settings' ? (
                                <ProfileSettings
                                    academic={academic.id}
                                    onPassword={() => setPasswordOpen(true)}
                                    onGuide={() => setGuideRequest((value) => value + 1)}
                                />
                            ) : (
                                props.profile_form && (
                                    <StudentProfileForm
                                        key={`${academic.id}-${view}`}
                                        academic={academic}
                                        profile={props.profile_form}
                                        onFeedback={notify}
                                        initialEditSection={view === 'photo' ? 'photo' : undefined}
                                        initialEditField={view === 'personal' ? props.profile_edit_field : undefined}
                                    />
                                )
                            )}
                        </>
                    )}
                </div>
            </Dashboard>
        );
    }
    if (section === 'fees' || section === 'annual-fees' || section === 'transactions') {
        const title =
            section === 'fees'
                ? 'Finances'
                : section === 'annual-fees'
                  ? 'Frais de l’année'
                  : props.finance_view === 'receipts'
                    ? 'Reçus et attestations'
                    : 'Historique des paiements';
        return (
            <Dashboard>
                <Head title={title} />
                {toast && <FeedbackToast key={toast.id} feedback={toast} onDismiss={() => setToast(null)} />}
                <StudentFinance key={`${academic.id}-${section}`} {...props} />
                {props.progression && <Renewal key={props.progression.id} decision={props.progression} academic={academic.id} />}
            </Dashboard>
        );
    }
    if (section === 'schedule') {
        return (
            <Dashboard>
                <Head title={`Emploi du temps · ${academic.level}`} />
                <StudentSchedule
                    key={academic.id}
                    sessions={props.sessions}
                    week={props.schedule_week}
                    academic={academic.id}
                    promotion={academic}
                    calendarEvents={props.calendar_events}
                    selectedDay={props.schedule_day ?? undefined}
                    selectedView={props.schedule_view}
                    absencesHref={studentChromeHref('absences', academic.id)}
                    canOpenCourse={canOpen('courses')}
                    yearContext={props.studentChrome}
                />
            </Dashboard>
        );
    }

    return (
        <Dashboard>
            <Head title={isResults ? 'Mes résultats' : (studentSectionLabels[section] ?? 'Mon espace étudiant')} />
            {toast && <FeedbackToast key={toast.id} feedback={toast} onDismiss={() => setToast(null)} />}
            <div
                className={`student-portal ${section === 'overview' ? 'is-overview' : isCourseList ? 'is-course-list' : ''}`}
                data-dashboard-arrival-grid
            >
                {props.curriculum && !isAcademicLanding && !isCourseList && !isResults && (
                    <p className="portal-muted" role="note">
                        {props.curriculum.program} · {props.curriculum.cycle} · Maquette {props.curriculum.code}
                        {props.curriculum.promotion && ` · ${props.curriculum.promotion}`}
                        {props.curriculum.cohort && ` · ${props.curriculum.cohort}`}
                    </p>
                )}
                <StudentWelcome
                    academic={academic}
                    pending={props.welcome_pending && section === 'overview'}
                    openRequest={guideRequest}
                    desktopInline={section === 'overview'}
                />
                {section === 'overview' && (
                    <>
                        <div className="student-home-intro">
                            <div>
                                <p>
                                    {academic.level} · {academic.faculty}
                                </p>
                                <h1>Bonjour, {academic.name.trim().split(/\s+/)[0]}</h1>
                            </div>
                            <StudentAlertBubble
                                academic={academic}
                                alerts={props.overview?.alerts ?? []}
                                announcements={props.overview?.announcements ?? []}
                                permissions={permissions}
                                profile={props.profile_completion}
                            />
                        </div>
                        <StudentShortcuts academic={academic.id} permissions={permissions} onGuide={() => setGuideRequest((value) => value + 1)} />
                        {academic.enrollment_status === 'pending_confirmation' && (
                            <div className="portal-alert">
                                <p>Votre inscription est en attente de confirmation.</p>
                                <Link href={studentHref('fees', academic.id, 'finance-first-installment')} className="underline">
                                    Consulter la première tranche et suivre vos versements
                                </Link>
                            </div>
                        )}
                    </>
                )}
                {isCourseList && (
                    <>
                        <header className="student-courses-intro">
                            <p>
                                {academic.level} · {academic.year}
                            </p>
                            <h1>Mes cours</h1>
                        </header>
                        <dl className="student-course-credits" aria-label="Récapitulatif des crédits">
                            {[
                                { label: 'Crédits acquis', value: props.course_credits?.earned, tone: 'mint' },
                                { label: 'Crédits à valider', value: props.course_credits?.remaining, tone: 'sand' },
                                { label: 'Total des crédits', value: props.course_credits?.planned, tone: 'sky' },
                            ].map(({ label, value, tone }) => (
                                <div key={label} data-tone={tone}>
                                    <dt>{label}</dt>
                                    <dd>{value == null ? '—' : (value / 100).toLocaleString('fr-CD')}</dd>
                                </div>
                            ))}
                        </dl>
                        <p className="student-course-credits-note">
                            {props.course_credits?.earned == null
                                ? 'Les crédits acquis et ceux qui restent à valider s’affichent avec les résultats officiels.'
                                : 'Les crédits acquis et ceux à valider correspondent aux résultats publiés.'}
                        </p>
                        {props.course_credits?.compensated != null && props.course_credits.compensated > 0 && (
                            <p className="student-course-credits-note">
                                Dont {(props.course_credits.compensated / 100).toLocaleString('fr-CD')}{' '}
                                {props.course_credits.compensated === 100 ? 'crédit acquis' : 'crédits acquis'} par compensation.
                            </p>
                        )}
                    </>
                )}
                {props.progression && <Renewal key={props.progression.id} decision={props.progression} academic={academic.id} />}
                {(section === 'overview' || section === 'academics' || section === 'courses') && (
                    <DepartmentChoice
                        key={academic.id}
                        academic={academic.id}
                        department={props.department}
                        options={props.department_options}
                        onFeedback={notify}
                    />
                )}
                <div className="portal-content-layout">
                    {!isAcademicLanding && !isCourseList && !isResults && section !== 'overview' && (
                        <StudentIdentityCard
                            academic={academic}
                            courseCount={permissions.courses_view.allowed ? (props.overview?.course_count ?? props.courses.length) : null}
                        />
                    )}
                    {!['overview', 'academics', 'courses', 'results'].includes(section) && (
                        <>
                            <AcademicSummary academic={academic} />
                            <FinancialStatusBanner balance={balance} href={href('fees')} />
                        </>
                    )}
                    {section !== 'overview' && (academic.enrollment_status !== 'confirmed' || academic.student_status !== 'active') && (
                        <p className="portal-alert">
                            Votre profil est {labels[academic.student_status]?.toLowerCase() || academic.student_status} et votre inscription est{' '}
                            {labels[academic.enrollment_status]?.toLowerCase() || academic.enrollment_status}. Votre identité, vos frais et
                            l’assistance restent consultables.
                        </p>
                    )}
                    {!['overview', 'academics', 'courses', 'results'].includes(section) && activeSections.length > 1 && (
                        <nav className="portal-tabs" aria-label={`Navigation : ${activeModule.title}`}>
                            {activeSections.map((key) => (
                                <Link key={key} href={href(key)} aria-current={section === key ? 'page' : undefined}>
                                    {studentSectionLabels[key]}
                                </Link>
                            ))}
                        </nav>
                    )}
                    <div className="portal-body">
                        {!isCourseList && !isResults && (
                            <div className="portal-section-heading">
                                <div>
                                    <span>{isAcademicLanding ? `${academic.level} · ${academic.year}` : academic.year}</span>
                                    <h2>{studentSectionLabels[section] || 'Mon espace'}</h2>
                                </div>
                                {!isAcademicLanding && (
                                    <span className={`portal-status is-${balance.financial_clearance_status}`}>
                                        {labels[balance.financial_clearance_status] || balance.financial_clearance_status}
                                    </span>
                                )}
                            </div>
                        )}
                        {section === 'academics' && props.curriculum && (
                            <section className="portal-curriculum-card" aria-label="Maquette de votre programme">
                                <BookOpen size={21} aria-hidden="true" />
                                <div>
                                    <strong>Maquette pédagogique</strong>
                                    {props.curriculum.cycle && <small>Cycle {props.curriculum.cycle}</small>}
                                </div>
                                <span>{props.curriculum.code}</span>
                            </section>
                        )}
                        {section === 'academics' && (
                            <>
                                <AcademicSummary academic={academic} />
                                <section className="portal-panel space-y-3">
                                    <h2>Mon parcours académique</h2>
                                    {props.progression_credits ? (
                                        <p>
                                            {(props.progression_credits.earned / 100).toLocaleString('fr-CD')} crédits acquis ·{' '}
                                            {(props.progression_credits.remaining / 100).toLocaleString('fr-CD')} restant pour ce résultat annuel
                                        </p>
                                    ) : (
                                        permissions.results_view?.allowed && <p>Les crédits s’afficheront après publication du résultat officiel.</p>
                                    )}
                                    {!!props.lifecycle?.length && (
                                        <ul>
                                            {props.lifecycle.map((event) => (
                                                <li key={event.reference}>
                                                    {new Date(event.decided_at).toLocaleDateString('fr-CD')} · {pathwayLabels[event.kind]} ·{' '}
                                                    {event.status === 'approved' ? 'Approuvé' : 'Refusé'}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    <Link className="portal-primary" href={route('dashboard.student.enrollments')}>
                                        Consulter mes inscriptions
                                    </Link>
                                </section>
                            </>
                        )}
                        {!isResults && <ModuleLanding section={section} academic={academic.id} permissions={permissions} />}
                        {props.document_center && <OfficialDocumentCenter data={props.document_center} academic={academic.id} />}
                        {section === 'card' && props.card_eligibility && (
                            <section className="portal-panel">
                                <header>
                                    <h2>{props.card_eligibility.ready ? 'Dossier prêt pour la gravure' : 'Préparer ma carte étudiante'}</h2>
                                </header>
                                <p>
                                    La carte utilise la photo de votre profil. Choisissez un portrait net, de face, sur fond uni. Toute nouvelle photo
                                    doit être validée.
                                </p>
                                {!props.card_eligibility.ready && (
                                    <ul>
                                        {props.card_eligibility.reasons.map((reason) => (
                                            <li key={reason}>{reason}</li>
                                        ))}
                                    </ul>
                                )}
                                {props.card_eligibility.photo_status === 'approved' && (
                                    <p>
                                        <strong>Votre photo de profil est validée.</strong>
                                    </p>
                                )}
                                {props.card_eligibility.decision_note && <p>Note de l’administration : {props.card_eligibility.decision_note}</p>}
                                <Link className="portal-primary" href={studentProfileHref(academic.id, 'photo')}>
                                    Gérer ma photo de profil
                                </Link>
                            </section>
                        )}
                        {((section === 'overview' && permissions.courses_view?.allowed) || isCourseList) && (
                            <PedagogicalRegistrationNotice courses={props.pedagogical_registration_pending} />
                        )}
                        {section === 'overview' && props.overview && (
                            <StudentOverview
                                data={props.overview}
                                courses={props.courses}
                                calendarEvents={props.calendar_events}
                                academic={academic}
                                balance={balance}
                                permissions={permissions}
                            />
                        )}
                        {isCourseList &&
                            (props.courses.length ? (
                                <CoursesBySemester courses={props.courses} />
                            ) : props.pedagogical_registration_pending?.length ? null : (
                                <EmptyState title="Vos enseignements seront publiés ici." icon={BookOpen}>
                                    Aucun cours n’est encore publié pour votre niveau, votre année et votre groupe. Votre validation administrative
                                    reste effective.
                                </EmptyState>
                            ))}
                        {isResults && props.official_results && (
                            <OfficialResults key={academic.id} data={props.official_results} academic={academic} />
                        )}
                        {['materials', 'results'].includes(section) && (
                            <>
                                {displayed.length ? (
                                    <div className="portal-resource-list">
                                        {isResults && <h2>Publications complémentaires</h2>}
                                        {displayed.map((resource) => (
                                            <article id={`resource-${resource.id}`} className="portal-panel portal-resource" key={resource.id}>
                                                <header>
                                                    <div>
                                                        <span>{resource.course}</span>
                                                        <h2>{resource.title}</h2>
                                                    </div>
                                                    {!resource.allowed && !resource.assessment?.feedback && <LockKeyhole size={19} />}
                                                </header>
                                                {resource.body && <p className="portal-resource-body">{resource.body}</p>}
                                                {!resource.allowed && !resource.assessment?.feedback && (
                                                    <div className="portal-lock-message">
                                                        <LockKeyhole size={16} />
                                                        <p>{resource.reason}</p>
                                                        <Link href={href('fees')}>Consulter mes frais</Link>
                                                    </div>
                                                )}
                                                {resource.download_url && (
                                                    <a className="portal-secondary" href={resource.download_url}>
                                                        <Download size={16} />
                                                        Télécharger le document
                                                    </a>
                                                )}
                                                {resource.closes_at && (
                                                    <p className="portal-muted">Date limite : {formatDate(resource.closes_at, true)}</p>
                                                )}
                                            </article>
                                        ))}
                                    </div>
                                ) : isResults ? null : (
                                    <EmptyState title="Aucune publication disponible pour le moment.">
                                        Les éléments publiés pour votre formation apparaîtront ici. Aucune donnée provisoire n’est présentée comme un
                                        résultat officiel.
                                    </EmptyState>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </Dashboard>
    );
}
