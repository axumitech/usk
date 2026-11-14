import Pagination from '@/components/admin/Pagination';
import { Link, router } from '@inertiajs/react';
import {
    ArrowDownToLine,
    ArrowUpRight,
    BookOpen,
    CalendarDays,
    ChevronDown,
    ChevronRight,
    ClipboardCheck,
    Clock3,
    FileText,
    FolderOpen,
    GraduationCap,
    Headphones,
    Layers3,
    LayoutDashboard,
    Link2,
    MapPin,
    Megaphone,
    NotebookPen,
    Plus,
    Search,
    UsersRound,
    Video,
} from 'lucide-react';
import '../../../../css/dashboard/teacher-course-detail.css';
import { Context } from './Details';
import type { TeacherOverview } from './overviewTypes';
import TeacherCourseGradebook, { type TeacherCourseGradebookData } from './TeacherCourseGradebook';
import TeacherCourseOverview, { type TeacherCourseOverviewData } from './TeacherCourseOverview';
import { TeacherPanel } from './TeacherOverview';
import { dateTime, type Offering, type Page, type Resource, type Session, type Student } from './types';

const tabs = [
    { id: 'overview', label: 'Vue d’ensemble', singular: '', icon: LayoutDashboard },
    { id: 'sessions', label: 'Séances', singular: 'séance', icon: CalendarDays },
    { id: 'students', label: 'Étudiants', singular: 'étudiant', icon: UsersRound },
    { id: 'assessments', label: 'Évaluations', singular: 'évaluation', icon: ClipboardCheck },
    { id: 'resources', label: 'Supports', singular: 'support', icon: FolderOpen },
    { id: 'grades', label: 'Notes', singular: 'note', icon: NotebookPen },
] as const;

export type TeacherCourseTab = (typeof tabs)[number]['id'];
type GroupSelection = number | 'unassigned' | null;
type CourseStudent = Student & { group?: string | null };
type CourseSession = Session & { location: string | null; activity_type: string | null; status: 'published' | 'rescheduled' | 'cancelled' };
type CourseAssessment = {
    id: number;
    title: string;
    category_label: string | null;
    kind: 'assignment' | 'evaluation';
    state: string;
    closes_at: string | null;
    url: string | null;
};
type CourseResource = Resource & {
    status: 'draft' | 'published' | 'archived';
    detail_url: string;
    filename: string | null;
    section_id: number | null;
    section: string | null;
};
type CourseChapter = { id: number; title: string; count: number };
export type TeacherCourseData = {
    courseTab: TeacherCourseTab | null;
    courseOverview: TeacherCourseOverviewData | null;
    studentGroups: { id: number | null; label: string; count: number }[];
    studentGroup: GroupSelection;
    studentSearch: string;
    canSeeCourseStudents: boolean;
    canSeeCourseAssessments: boolean;
    canSeeCourseGrades: boolean;
    gradebook: TeacherCourseGradebookData | null;
    courseLinks: { assessments: string | null; resources: string } | null;
    assessments: Page<CourseAssessment> | null;
    resources: Page<CourseResource> | null;
    resourcesSections: CourseChapter[];
    resourceSection: GroupSelection;
    resourceUnassignedCount: number;
    resourcesTotal: number;
    sessions: Page<CourseSession> | null;
};

type Props = TeacherCourseData & {
    course: Offering;
    period: Pick<TeacherOverview, 'year' | 'semester'>;
    students: Page<CourseStudent> | null;
    onAnnounce?: () => void;
    onPublishLink?: () => void;
};

const sessionDay = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', timeZone: 'Africa/Kinshasa' });
const sessionMonth = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'Africa/Kinshasa' });
const sessionTime = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kinshasa' });
const number = new Intl.NumberFormat('fr-FR');
const assessmentStates: Record<string, string> = { draft: 'Brouillon', published: 'Publiée', closed: 'Clôturée', cancelled: 'Annulée' };
const resourceStates = { draft: 'Brouillon', published: 'Publié', archived: 'Archivé' };
const resourceKinds = {
    material: { label: 'Support', icon: FileText },
    syllabus: { label: 'Syllabus', icon: BookOpen },
    online: { label: 'Lien', icon: Link2 },
    video: { label: 'Vidéo', icon: Video },
    audio: { label: 'Audio', icon: Headphones },
};

function SessionRows({ sessions }: { sessions: Page<CourseSession> | null }) {
    return sessions?.data.length ? (
        <ul className="teacher-list teacher-course-entries">
            {sessions.data.map((session) => {
                const starts = new Date(session.starts_at);
                const ends = new Date(session.ends_at);
                const state = session.status;
                return (
                    <li className="teacher-course-entry teacher-course-session" key={session.id}>
                        <time className="teacher-course-day" dateTime={session.starts_at}>
                            <strong>{sessionDay.format(starts)}</strong>
                            <span>{sessionMonth.format(starts)}</span>
                        </time>
                        <div className="teacher-course-entry-copy">
                            <strong>
                                {sessionTime.format(starts)} – {sessionTime.format(ends)}
                            </strong>
                            <span>
                                <MapPin size={14} aria-hidden="true" /> {session.location || session.room || 'Salle à préciser'}
                            </span>
                            {session.activity_type && <span>{session.activity_type}</span>}
                            {session.successor && (
                                <span>
                                    <Clock3 size={14} aria-hidden="true" /> Reportée au {dateTime(session.successor.starts_at)}
                                </span>
                            )}
                        </div>
                        {state !== 'published' && (
                            <span className="teacher-course-state" data-state={state}>
                                {state === 'rescheduled' ? 'Reportée' : 'Annulée'}
                            </span>
                        )}
                        {session.attendance_url && (
                            <Link className="teacher-course-entry-action" href={session.attendance_url}>
                                <ClipboardCheck size={16} aria-hidden="true" /> Voir l’appel
                            </Link>
                        )}
                    </li>
                );
            })}
        </ul>
    ) : (
        <p className="teacher-empty">Aucune séance planifiée pour ce cours.</p>
    );
}

function StudentRows({ students, searching }: { students: Page<CourseStudent> | null; searching: boolean }) {
    return students?.data.length ? (
        <ul className="teacher-list teacher-course-entries">
            {students.data.map((student) => (
                <li className="teacher-course-entry teacher-course-student" key={student.id}>
                    <span className="teacher-symbol" aria-hidden="true">
                        {student.name.trim().charAt(0).toLocaleUpperCase('fr')}
                    </span>
                    <div className="teacher-course-entry-copy">
                        <strong>{student.name}</strong>
                        {student.matricule && <span>{student.matricule}</span>}
                    </div>
                    <span className="teacher-course-state">{student.group || 'Sans groupe'}</span>
                </li>
            ))}
        </ul>
    ) : (
        <p className="teacher-empty">
            {searching ? 'Aucun étudiant ne correspond à cette recherche.' : 'Aucun étudiant inscrit dans ce groupe ou ce cours.'}
        </p>
    );
}

function AssessmentRows({ assessments }: { assessments: Page<CourseAssessment> | null }) {
    return assessments?.data.length ? (
        <ul className="teacher-list teacher-course-entries">
            {assessments.data.map((assessment) => {
                const content = (
                    <>
                        <span className="teacher-symbol" data-tone="olive">
                            <ClipboardCheck size={19} aria-hidden="true" />
                        </span>
                        <span className="teacher-course-entry-copy">
                            <strong>{assessment.title}</strong>
                            <span>
                                {assessment.category_label ?? (assessment.kind === 'assignment' ? 'Devoir' : 'Évaluation')}
                                {assessment.closes_at && ` · Échéance le ${dateTime(assessment.closes_at)}`}
                            </span>
                        </span>
                        <span className="teacher-course-state" data-state={assessment.state}>
                            {assessmentStates[assessment.state] || assessment.state}
                        </span>
                    </>
                );
                return (
                    <li key={assessment.id}>
                        {assessment.url ? (
                            <Link href={assessment.url} className="teacher-course-entry teacher-course-entry-link">
                                {content}
                                <ChevronRight size={17} className="teacher-course-entry-chevron" aria-hidden="true" />
                            </Link>
                        ) : (
                            <div className="teacher-course-entry">{content}</div>
                        )}
                    </li>
                );
            })}
        </ul>
    ) : (
        <p className="teacher-empty">Aucune évaluation enregistrée pour ce cours.</p>
    );
}

function ResourceRows({ resources }: { resources: CourseResource[] }) {
    return (
        <ul className="teacher-list teacher-course-entries">
            {resources.map((resource) => {
                const { label, icon: Icon } = resourceKinds[resource.kind as keyof typeof resourceKinds] ?? resourceKinds.material;
                return (
                    <li className="teacher-course-entry teacher-course-resource" key={resource.id}>
                        <span className="teacher-symbol" data-tone="gold">
                            <Icon size={19} aria-hidden="true" />
                        </span>
                        <Link href={resource.detail_url} className="teacher-course-entry-copy teacher-course-resource-title">
                            <strong>{resource.title}</strong>
                            <span>
                                {label}
                                {resource.filename && ` · ${resource.filename}`}
                            </span>
                        </Link>
                        <span className="teacher-course-state" data-state={resource.status}>
                            {resourceStates[resource.status]}
                        </span>
                        {resource.download_url ? (
                            <a className="teacher-course-icon-action" href={resource.download_url} aria-label={`Télécharger ${resource.title}`}>
                                <ArrowDownToLine size={17} aria-hidden="true" />
                            </a>
                        ) : resource.url && /^https?:\/\//i.test(resource.url) ? (
                            <a
                                className="teacher-course-icon-action"
                                href={resource.url}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Ouvrir le lien ${resource.title} (nouvel onglet)`}
                            >
                                <ArrowUpRight size={17} aria-hidden="true" />
                            </a>
                        ) : (
                            <Link className="teacher-course-icon-action" href={resource.detail_url} aria-label={`Voir ${resource.title}`}>
                                <ChevronRight size={17} aria-hidden="true" />
                            </Link>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

function CourseResources({
    resources,
    sections,
    selection,
    unassigned,
    total,
    href,
}: {
    resources: Page<CourseResource> | null;
    sections: CourseChapter[];
    selection: GroupSelection;
    unassigned: number;
    total: number;
    href: (selection?: GroupSelection) => string;
}) {
    const chapters = new Map<CourseResource['section_id'], CourseResource[]>();
    for (const resource of resources?.data ?? []) {
        const rows = chapters.get(resource.section_id) ?? [];
        rows.push(resource);
        chapters.set(resource.section_id, rows);
    }

    return (
        <>
            {sections.length > 0 && (
                <label className="teacher-course-group-filter teacher-course-chapter-filter">
                    <Layers3 size={16} aria-hidden="true" />
                    <span>Chapitre</span>
                    <select
                        value={selection ?? ''}
                        onChange={(event) => {
                            const value = event.currentTarget.value;
                            router.visit(href(value === 'unassigned' ? value : Number(value) || null), { preserveScroll: true });
                        }}
                    >
                        <option value="">Tous les chapitres ({number.format(total)})</option>
                        {sections.map((section) => (
                            <option key={section.id} value={section.id}>
                                {section.title} ({number.format(section.count)})
                            </option>
                        ))}
                        {(unassigned > 0 || selection === 'unassigned') && (
                            <option value="unassigned">Sans chapitre ({number.format(unassigned)})</option>
                        )}
                    </select>
                </label>
            )}
            {chapters.size ? (
                <div className="teacher-course-chapters">
                    {[...chapters].map(([id, rows]) => (
                        <div className="teacher-course-chapter" key={id ?? 'unassigned'}>
                            {(id !== null || sections.length > 0) && (
                                <h3>
                                    <Layers3 size={17} aria-hidden="true" /> {rows[0].section || 'Sans chapitre'}
                                </h3>
                            )}
                            <ResourceRows resources={rows} />
                        </div>
                    ))}
                </div>
            ) : (
                <p className="teacher-empty">
                    {selection === null ? 'Aucun support disponible pour ce cours.' : 'Aucun support disponible dans ce chapitre.'}
                </p>
            )}
        </>
    );
}

function StudentFilters({
    groups,
    group,
    search,
    href,
}: {
    groups: TeacherCourseData['studentGroups'];
    group: GroupSelection;
    search: string;
    href: (filters: { group?: GroupSelection; q?: string }) => string;
}) {
    return (
        <form
            className="teacher-course-student-filters"
            role="search"
            aria-label="Rechercher dans les étudiants du cours"
            onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const selectedGroup = data.get('group');
                router.visit(
                    href({
                        group: selectedGroup === 'unassigned' ? selectedGroup : Number(selectedGroup) || null,
                        q: String(data.get('q') ?? '').trim(),
                    }),
                    { preserveScroll: true },
                );
            }}
        >
            <label className="teacher-course-search">
                <span className="sr-only">Nom ou matricule</span>
                <Search size={17} aria-hidden="true" />
                <input name="q" type="search" placeholder="Nom ou matricule" defaultValue={search} maxLength={100} />
            </label>
            {groups.length > 0 && (
                <label className="teacher-course-group-filter">
                    <UsersRound size={16} aria-hidden="true" />
                    <span>Groupe</span>
                    <select name="group" defaultValue={group ?? ''} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
                        <option value="">Tous les groupes</option>
                        {groups.map((option) => (
                            <option key={option.id ?? 'unassigned'} value={option.id ?? 'unassigned'}>
                                {option.label} ({number.format(option.count)})
                            </option>
                        ))}
                    </select>
                </label>
            )}
            <button className="teacher-course-entry-action" type="submit">
                Rechercher
            </button>
            {search && (
                <Link className="teacher-course-clear-search" href={href({ group })} preserveScroll>
                    Effacer la recherche
                </Link>
            )}
        </form>
    );
}

export default function TeacherCourseDetail({
    course,
    period,
    courseTab,
    courseOverview,
    students,
    sessions,
    assessments,
    resources,
    resourcesSections,
    resourceSection,
    resourceUnassignedCount,
    resourcesTotal,
    studentGroups,
    studentGroup,
    studentSearch,
    canSeeCourseStudents,
    canSeeCourseAssessments,
    canSeeCourseGrades,
    gradebook,
    courseLinks,
    onAnnounce,
    onPublishLink,
}: Props) {
    const visibleTabs = tabs.filter(
        ({ id }) =>
            (id !== 'students' || canSeeCourseStudents) &&
            (id !== 'assessments' || canSeeCourseAssessments) &&
            (id !== 'grades' || canSeeCourseGrades),
    );
    const active = visibleTabs.find(({ id }) => id === courseTab) ?? tabs[0];
    const semester = course.semester_number ? `Semestre ${course.semester_number}` : course.semester;
    const href = (tab: TeacherCourseTab, filters: { group?: GroupSelection; section?: GroupSelection; q?: string } = {}) =>
        route('dashboard.teaching.index', {
            view: 'courses',
            offering: course.id,
            year: period.year ?? undefined,
            semester: period.semester ?? 'all',
            tab,
            group: filters.group ?? undefined,
            section: filters.section ?? undefined,
            q: filters.q || undefined,
        });
    const pages = { overview: null, sessions, students, assessments, resources, grades: null };
    const page = pages[active.id];

    return (
        <div className="teacher-course-detail">
            <div className="teacher-panel teacher-course-summary">
                <div className="teacher-course-summary-main">
                    <span className="teacher-symbol">
                        <BookOpen size={23} aria-hidden="true" />
                    </span>
                    <div className="teacher-course-summary-text">
                        <strong>{course.level}</strong>
                        <span>{course.faculty}</span>
                    </div>
                </div>
                <ul className="teacher-course-summary-meta">
                    {course.code && <li title="Code du cours">{course.code}</li>}
                    {semester && (
                        <li>
                            <Layers3 size={15} aria-hidden="true" /> {semester}
                        </li>
                    )}
                    {course.credits != null && (
                        <li>
                            <GraduationCap size={15} aria-hidden="true" /> {number.format(Number(course.credits))} crédit
                            {Number(course.credits) === 1 ? '' : 's'}
                        </li>
                    )}
                    {course.group && (
                        <li>
                            <UsersRound size={15} aria-hidden="true" /> {course.group}
                        </li>
                    )}
                </ul>
                {onAnnounce && (
                    <button className="teacher-course-entry-action" type="button" onClick={onAnnounce}>
                        <Megaphone size={16} aria-hidden="true" /> Envoyer une annonce
                    </button>
                )}
                <details className="teacher-course-info">
                    <summary>
                        Informations du cours <ChevronDown size={16} aria-hidden="true" />
                    </summary>
                    <div className="teacher-course-context">
                        <Context offer={course} showIdentity={false} />
                    </div>
                </details>
            </div>

            <nav className="teacher-course-tabs" aria-label="Rubriques du cours" data-tab-count={visibleTabs.length}>
                {visibleTabs.map(({ id, label, icon: Icon }) => (
                    <Link
                        key={id}
                        href={href(
                            id,
                            id === 'students' ? { group: studentGroup, q: studentSearch } : id === 'resources' ? { section: resourceSection } : {},
                        )}
                        aria-current={id === active.id ? 'page' : undefined}
                        preserveScroll
                    >
                        <Icon size={19} aria-hidden="true" /> {label}
                    </Link>
                ))}
            </nav>

            {active.id === 'overview' && courseOverview ? (
                <TeacherCourseOverview
                    key={course.id}
                    overview={courseOverview}
                    supportsHref={(section) => href('resources', { section })}
                    sessionsHref={href('sessions')}
                />
            ) : (
                <TeacherPanel
                    id={`teacher-course-${active.id}`}
                    title={active.id === 'grades' ? 'Carnet de notes' : active.label}
                    icon={active.icon}
                    className="teacher-course-panel"
                    action={
                        active.id === 'assessments' && courseLinks?.assessments ? (
                            <Link className="teacher-course-entry-action" href={courseLinks.assessments}>
                                Gérer les évaluations <ArrowUpRight size={15} aria-hidden="true" />
                            </Link>
                        ) : active.id === 'resources' && courseLinks ? (
                            <div className="teacher-course-panel-actions">
                                {onPublishLink && (
                                    <button className="teacher-course-entry-action" type="button" onClick={onPublishLink}>
                                        <Plus size={15} aria-hidden="true" /> Publier un lien
                                    </button>
                                )}
                                <Link className="teacher-course-entry-action" href={courseLinks.resources}>
                                    {onPublishLink ? 'Gérer les supports' : 'Bibliothèque du cours'} <ArrowUpRight size={15} aria-hidden="true" />
                                </Link>
                            </div>
                        ) : undefined
                    }
                >
                    {active.id === 'students' && (
                        <StudentFilters
                            key={`${course.id}:${studentGroup ?? ''}:${studentSearch}`}
                            groups={studentGroups}
                            group={studentGroup}
                            search={studentSearch}
                            href={(filters) => href('students', filters)}
                        />
                    )}
                    {page && (
                        <div className="teacher-course-panel-tools">
                            <span aria-live="polite">
                                {number.format(page.total)} {active.singular}
                                {page.total > 1 ? 's' : ''}
                            </span>
                        </div>
                    )}
                    {active.id === 'sessions' && <SessionRows sessions={sessions} />}
                    {active.id === 'students' && <StudentRows students={students} searching={Boolean(studentSearch)} />}
                    {active.id === 'assessments' && <AssessmentRows assessments={assessments} />}
                    {active.id === 'grades' && gradebook && <TeacherCourseGradebook gradebook={gradebook} />}
                    {active.id === 'resources' && (
                        <CourseResources
                            resources={resources}
                            sections={resourcesSections}
                            selection={resourceSection}
                            unassigned={resourceUnassignedCount}
                            total={resourcesTotal}
                            href={(section) => href('resources', { section })}
                        />
                    )}
                    <Pagination value={page} />
                </TeacherPanel>
            )}
        </div>
    );
}
