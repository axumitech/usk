import { Link } from '@inertiajs/react';
import { ArrowUpRight, ChevronLeft, ChevronRight, UsersRound } from 'lucide-react';
import { useId } from 'react';
import '../../../../css/dashboard/teacher-course-gradebook.css';
import type { Page } from './types';

type Grade = {
    points: number | null;
    participation: string;
    correction_state: 'draft' | 'finalized' | 'validated';
    has_correction: boolean;
    released_at: string | null;
    url: string;
};

type GradebookStudent = {
    id: number;
    name: string;
    matricule: string | null;
    group: string | null;
    grades: Record<string, Grade | undefined>;
};

type GradebookAssessment = {
    id: number;
    title: string;
    category_label: string;
    state: 'draft' | 'published' | 'closed' | 'cancelled';
    maximum_points: number | null;
    url: string;
};

type GradebookPage<T> = Page<T> & { current_page: number; last_page: number };

export type TeacherCourseGradebookData = {
    students: GradebookPage<GradebookStudent>;
    assessments: GradebookPage<GradebookAssessment>;
};

const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const points = (value: number) => number.format(value / 100);
const assessmentStates: Record<GradebookAssessment['state'], string> = {
    draft: 'Brouillon',
    published: 'Publiée',
    closed: 'Clôturée',
    cancelled: 'Annulée',
};
const participationLabels: Record<string, string> = {
    unassessed: 'Participation à renseigner',
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

function GradePagination({ page, label }: { page: GradebookPage<unknown>; label: string }) {
    if (page.last_page <= 1 && page.current_page <= 1) return null;

    const previous = page.links[0]?.url;
    const next = page.links.at(-1)?.url;

    return (
        <nav className="teacher-gradebook-pagination" aria-label={`Pagination des ${label}`}>
            <span className="teacher-gradebook-page-label">
                {label} · Page {page.current_page} sur {page.last_page}
            </span>
            <div className="teacher-gradebook-page-controls">
                {previous ? (
                    <Link href={previous} preserveScroll aria-label={`Page précédente des ${label}`}>
                        <ChevronLeft size={18} aria-hidden="true" />
                    </Link>
                ) : (
                    <span aria-hidden="true">
                        <ChevronLeft size={18} />
                    </span>
                )}
                {next ? (
                    <Link href={next} preserveScroll aria-label={`Page suivante des ${label}`}>
                        <ChevronRight size={18} aria-hidden="true" />
                    </Link>
                ) : (
                    <span aria-hidden="true">
                        <ChevronRight size={18} />
                    </span>
                )}
            </div>
        </nav>
    );
}

function GradeCell({ student, assessment }: { student: GradebookStudent; assessment: GradebookAssessment }) {
    const grade = student.grades[assessment.id];
    if (!grade) {
        return <span className="teacher-gradebook-empty-cell">Aucune fiche de correction</span>;
    }

    const finalized = grade.correction_state !== 'draft';
    const validated = grade.correction_state === 'validated';
    const participation = participationLabels[grade.participation];
    const correction = finalized ? 'Correction finalisée' : grade.has_correction ? 'Correction en cours' : 'À corriger';
    const validation = validated ? 'Validée' : finalized ? 'À valider' : 'Non validée';
    const publication = grade.released_at ? 'Correction publiée' : 'Non publiée';

    return (
        <Link href={grade.url} className="teacher-gradebook-cell">
            <span className="sr-only">
                Ouvrir la correction de {student.name} pour {assessment.title}.{' '}
            </span>
            <span className="teacher-gradebook-score">
                {grade.points !== null ? (
                    <strong>
                        {points(grade.points)}
                        {assessment.maximum_points !== null && <small> / {points(assessment.maximum_points)}</small>}
                    </strong>
                ) : (
                    <strong className="teacher-gradebook-ungraded">
                        {assessment.maximum_points === null ? 'Sans note chiffrée' : 'Note non saisie'}
                    </strong>
                )}
                <ArrowUpRight size={17} aria-hidden="true" />
            </span>
            {participation && <span className="teacher-gradebook-participation">{participation}</span>}
            <span className="teacher-gradebook-statuses">
                <span className="teacher-gradebook-status" data-tone={finalized ? 'green' : 'gold'}>
                    {correction}
                </span>
                <span className="teacher-gradebook-status" data-tone={validated ? 'green' : finalized ? 'gold' : undefined}>
                    {validation}
                </span>
                <span className="teacher-gradebook-status" data-tone={grade.released_at ? 'green' : undefined}>
                    {publication}
                </span>
            </span>
        </Link>
    );
}

export default function TeacherCourseGradebook({ gradebook }: { gradebook: TeacherCourseGradebookData }) {
    const { students, assessments } = gradebook;
    const tableId = useId();
    const multipleColumns = assessments.data.length > 1;

    return (
        <div className="teacher-gradebook">
            <div className="teacher-gradebook-summary">
                <span>
                    <UsersRound size={16} aria-hidden="true" /> {number.format(students.total)} étudiant{students.total > 1 ? 's' : ''}
                </span>
                <span>
                    {number.format(assessments.total)} évaluation{assessments.total > 1 ? 's' : ''}
                </span>
            </div>
            <GradePagination page={assessments} label="évaluations" />
            {assessments.data.length && students.data.length ? (
                <>
                    {multipleColumns && (
                        <p className="teacher-gradebook-scroll-hint" id={tableId}>
                            Faites défiler le tableau pour voir les autres évaluations.
                        </p>
                    )}
                    <div
                        className="teacher-gradebook-table-wrap"
                        role="region"
                        aria-label="Tableau des notes par étudiant et évaluation"
                        aria-describedby={multipleColumns ? tableId : undefined}
                        tabIndex={0}
                    >
                        <table className="teacher-gradebook-table">
                            <caption className="sr-only">Notes pédagogiques du cours</caption>
                            <thead>
                                <tr>
                                    <th scope="col" className="teacher-gradebook-sticky">
                                        Étudiant
                                    </th>
                                    {assessments.data.map((assessment) => (
                                        <th scope="col" key={assessment.id}>
                                            <Link href={assessment.url} className="teacher-gradebook-assessment-link">
                                                <strong>{assessment.title}</strong>
                                                <ArrowUpRight size={16} aria-hidden="true" />
                                            </Link>
                                            <span className="teacher-gradebook-assessment-info">
                                                {assessment.category_label} · {assessmentStates[assessment.state]}
                                            </span>
                                            <span className="teacher-gradebook-assessment-info">
                                                {assessment.maximum_points === null
                                                    ? 'Appréciation qualitative'
                                                    : `Barème sur ${points(assessment.maximum_points)}`}
                                            </span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {students.data.map((student) => (
                                    <tr key={student.id}>
                                        <th className="teacher-gradebook-sticky" scope="row">
                                            <strong>{student.name}</strong>
                                            {student.matricule && <span>{student.matricule}</span>}
                                            {student.group && <span>{student.group}</span>}
                                        </th>
                                        {assessments.data.map((assessment) => (
                                            <td key={assessment.id}>
                                                <GradeCell student={student} assessment={assessment} />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            ) : (
                <p className="teacher-empty">
                    {assessments.total === 0
                        ? 'Aucune évaluation avec un carnet de notes pour ce cours.'
                        : students.total === 0
                          ? 'Aucun étudiant à afficher dans le carnet de ce cours.'
                          : 'Aucun résultat sur cette page.'}
                </p>
            )}
            <GradePagination page={students} label="étudiants" />
        </div>
    );
}
