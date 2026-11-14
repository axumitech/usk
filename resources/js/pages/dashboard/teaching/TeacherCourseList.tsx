import Pagination from '@/components/admin/Pagination';
import { Link } from '@inertiajs/react';
import { BookOpen, ChevronRight, ClipboardCheck, FolderOpen, GraduationCap, Layers3, UsersRound } from 'lucide-react';
import '../../../../css/dashboard/teacher-course-list.css';
import type { TeacherOverview } from './overviewTypes';
import { TeacherPanel } from './TeacherOverview';
import type { Offering, Page } from './types';

const number = new Intl.NumberFormat('fr-FR');
const tones = ['mint', 'plum', 'olive', 'gold'];

export default function TeacherCourseList({
    offerings,
    overview,
}: {
    offerings: Page<Offering> | null;
    overview: Pick<TeacherOverview, 'year' | 'semester'>;
}) {
    const total = offerings?.total ?? 0;

    return (
        <TeacherPanel
            id="teacher-courses"
            title="Cours de la période"
            icon={BookOpen}
            action={
                total > 0 && (
                    <span className="teacher-course-count">
                        {number.format(total)} cours assigné{total > 1 ? 's' : ''}
                    </span>
                )
            }
        >
            {offerings?.data.length ? (
                <ul className="teacher-list teacher-course-cards">
                    {offerings.data.map((course) => {
                        const semester = course.semester_number ? `Semestre ${course.semester_number}` : course.semester;
                        const counts = [
                            { value: course.active_students_count, label: 'Étudiants', icon: UsersRound },
                            { value: course.resources_count, label: 'Supports', icon: FolderOpen },
                            { value: course.assessments_count, label: 'Évaluations', icon: ClipboardCheck },
                        ];
                        return (
                            <li key={course.id}>
                                <Link
                                    className="teacher-course-card"
                                    href={route('dashboard.teaching.index', {
                                        view: 'courses',
                                        offering: course.id,
                                        year: overview.year ?? course.year_id,
                                        semester: overview.semester ?? 'all',
                                    })}
                                >
                                    <div className="teacher-course-card-head">
                                        <span className="teacher-symbol" data-tone={tones[course.id % tones.length]}>
                                            <BookOpen size={22} aria-hidden="true" />
                                        </span>
                                        <div className="teacher-course-card-tags">
                                            {semester && <span>{semester}</span>}
                                            {course.status === 'draft' && <span data-tone="gold">Brouillon</span>}
                                            {course.status === 'archived' && <span>Archivé</span>}
                                        </div>
                                        <ChevronRight className="teacher-course-card-arrow" size={18} aria-hidden="true" />
                                    </div>
                                    <div className="teacher-course-card-copy">
                                        <h3>{course.title}</h3>
                                        <p>{[course.code, course.faculty].filter(Boolean).join(' · ')}</p>
                                    </div>
                                    <div className="teacher-course-card-meta">
                                        <span>
                                            <Layers3 size={15} aria-hidden="true" />{' '}
                                            <span>{[course.level, course.group].filter(Boolean).join(' · ')}</span>
                                        </span>
                                        <span>
                                            <GraduationCap size={15} aria-hidden="true" />
                                            {course.credits == null
                                                ? 'Crédits non renseignés'
                                                : `${number.format(Number(course.credits))} crédit${Number(course.credits) === 1 ? '' : 's'}`}
                                        </span>
                                    </div>
                                    <dl className="teacher-course-card-counts">
                                        {counts.map(({ value, label, icon: Icon }) =>
                                            value == null ? null : (
                                                <div key={label}>
                                                    <dt>
                                                        <Icon size={14} aria-hidden="true" /> {label}
                                                    </dt>
                                                    <dd>{number.format(value)}</dd>
                                                </div>
                                            ),
                                        )}
                                    </dl>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p className="teacher-empty">Aucun cours assigné pour cette période.</p>
            )}
            <Pagination value={offerings} preserveScroll={false} />
        </TeacherPanel>
    );
}
