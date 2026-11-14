import { Link } from '@inertiajs/react';
import { ArrowUpRight, BookOpen, CalendarDays, Layers } from 'lucide-react';
import { useId } from 'react';
import '../../../css/student-course-cards.css';
import type { PortalProps } from './types';

type Course = PortalProps['courses'][number];
type CompositeUnit = { id: number; courses: Course[] };

const formatCredits = (value: number) => `${value.toLocaleString('fr-CD')} ${value === 1 ? 'crédit' : 'crédits'}`;

function semesterLabel(value: string | null | undefined) {
    const semester = value?.trim();
    if (!semester) return 'Semestre à préciser';
    if (/^(?:s\s*1|1|semestre\s*1|1(?:er|ᵉʳ)?\s+semestre)$/i.test(semester)) return '1er semestre';
    if (/^(?:s\s*2|2|semestre\s*2|2(?:e|ème|ᵉ)?\s+semestre)$/i.test(semester)) return '2e semestre';
    return semester;
}

function CourseCard({ course, component = false }: { course: Course; component?: boolean }) {
    const Heading = component ? 'h4' : 'h3';
    return (
        <Link href={course.detail_url} className="student-course-card">
            <div className="student-course-card-top">
                <BookOpen size={19} aria-hidden="true" />
                {course.code && <span>{course.code}</span>}
                <ArrowUpRight size={16} aria-hidden="true" />
            </div>
            <Heading>{course.title}</Heading>
            <p>{course.teacher || 'Enseignant à confirmer'}</p>
            {!component && course.unit && <p>UE · {course.unit}</p>}
            <div className="student-course-card-details">
                {course.credits != null && <span>{formatCredits(course.credits)}</span>}
                {course.is_optional && <span>{component && course.registered ? 'Optionnel inscrit' : 'Optionnel'}</span>}
                {component && course.is_optional === false && <span>Obligatoire</span>}
                {course.archived ? <span>Offre archivée</span> : course.catalog_only && <span>Au programme</span>}
            </div>
        </Link>
    );
}

function CompositeUnitCard({ courses }: CompositeUnit) {
    const unit = courses[0];
    const headingId = useId();
    return (
        <section className="student-course-unit-card" aria-labelledby={headingId}>
            <header className="student-course-unit-header">
                <span className="student-semester-icon">
                    <Layers size={20} aria-hidden="true" />
                </span>
                <div>
                    <div className="student-course-unit-meta">
                        <span className="student-course-unit-badge">UE composée</span>
                        {unit.unit_code && <span>{unit.unit_code}</span>}
                        {unit.unit_component_count != null && <span>{unit.unit_component_count} cours au programme</span>}
                    </div>
                    <h3 id={headingId}>{unit.unit || unit.unit_code || 'Unité d’enseignement'}</h3>
                </div>
                {unit.unit_credits != null && <span className="student-course-unit-credits">{formatCredits(unit.unit_credits)} pour l’UE</span>}
            </header>
            <p className="student-course-unit-rule">Pour valider cette UE, tous les cours requis doivent être validés ou reconnus.</p>
            <ul className="student-course-cards" role="list">
                {courses.map((course) => (
                    <li key={course.id}>
                        <CourseCard course={course} component />
                    </li>
                ))}
            </ul>
        </section>
    );
}

function StudentCourseCards({ courses }: { courses: Course[] }) {
    const entries: (Course | CompositeUnit)[] = [];
    const units = new Map<number, CompositeUnit>();
    for (const course of courses) {
        if (course.unit_id == null || !course.unit_is_composite) {
            entries.push(course);
            continue;
        }
        const existing = units.get(course.unit_id);
        if (existing) existing.courses.push(course);
        else {
            const unit = { id: course.unit_id, courses: [course] };
            units.set(unit.id, unit);
            entries.push(unit);
        }
    }
    return (
        <ul className="student-course-cards" role="list">
            {entries.map((entry) =>
                'courses' in entry ? (
                    <li className="student-course-unit" key={`unit-${entry.id}`}>
                        <CompositeUnitCard {...entry} />
                    </li>
                ) : (
                    <li key={`course-${entry.id}`}>
                        <CourseCard course={entry} />
                    </li>
                ),
            )}
        </ul>
    );
}

function registeredSemesterCredits(courses: Course[]) {
    const amounts: number[] = [];
    const counted = new Set<number>();
    for (const course of courses) {
        if (course.unit_id != null) {
            if (course.unit_registered_credits == null) {
                if (course.registered) return null;
                continue;
            }
            if (!counted.has(course.unit_id)) {
                counted.add(course.unit_id);
                amounts.push(course.unit_registered_credits);
            }
        } else if (course.registered && course.credits != null) {
            amounts.push(Number(course.credits));
        }
    }
    return amounts.length ? amounts.reduce((total, credits) => total + credits, 0) : null;
}

export default function CoursesBySemester({ courses }: { courses: Course[] }) {
    const headingId = useId();
    const groups = new Map<string, Course[]>();
    for (const course of courses) {
        const semester = semesterLabel(course.semester);
        const existing = groups.get(semester);
        if (existing) existing.push(course);
        else groups.set(semester, [course]);
    }
    const rank = (label: string) => (label === '1er semestre' ? 0 : label === '2e semestre' ? 1 : label === 'Semestre à préciser' ? 3 : 2);

    return (
        <div className="student-semester-groups">
            {[...groups.entries()]
                .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'fr', { numeric: true }))
                .map(([semester, items], index) => {
                    const credits = registeredSemesterCredits(items);
                    const id = `${headingId}-${index}`;
                    return (
                        <section className="student-semester-group" key={semester} aria-labelledby={id}>
                            <header>
                                <span className="student-semester-icon">
                                    <CalendarDays size={20} aria-hidden="true" />
                                </span>
                                <div>
                                    <h2 id={id}>{semester}</h2>
                                    <p>{items.length} cours</p>
                                </div>
                                {credits !== null && (
                                    <span className="student-semester-credits">
                                        {formatCredits(credits)} {credits === 1 ? 'inscrit' : 'inscrits'}
                                    </span>
                                )}
                            </header>
                            <StudentCourseCards courses={items} />
                        </section>
                    );
                })}
        </div>
    );
}
