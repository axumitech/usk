import Pagination from '@/components/admin/Pagination';
import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import { Head, usePage } from '@inertiajs/react';
import { CalendarDays, GraduationCap, UsersRound } from 'lucide-react';
import { useState } from 'react';
import '../../../../css/dashboard/professor-portraits.css';
import '../../../../css/dashboard/student-academic.css';
import '../../../../css/dashboard/teacher-overview.css';
import '../../../../css/student-portal.css';
import AcademicForm, { type FormSpec } from '../studentAcademic/AcademicForm';
import type { TeacherOverview, TeacherView } from './overviewTypes';
import TeacherAnnouncementForm from './TeacherAnnouncementForm';
import TeacherCourseDetail, { type TeacherCourseData } from './TeacherCourseDetail';
import TeacherCourseList from './TeacherCourseList';
import {
    TeacherAcademicCalendar,
    TeacherAnnouncements,
    TeacherCourseRows,
    TeacherCover,
    TeacherHome,
    TeacherPanel,
    TeacherTimetable,
    teacherTitles,
} from './TeacherOverview';
import TeacherSessionDetail from './TeacherSessionDetail';
import type { Offering, Page, Student } from './types';

type Props = TeacherCourseData & {
    linked: boolean;
    photoUrl?: string | null;
    offerings: Page<Offering> | null;
    selected: Offering | null;
    students: Page<Student & { group?: string | null }> | null;
    canPublish: boolean;
    overview: TeacherOverview;
    view: TeacherView;
};

export default function Teacher({ linked, photoUrl, offerings, selected, students, canPublish, overview, view, ...courseData }: Props) {
    const [modal, setModal] = useState<FormSpec | null>(null);
    const [composer, setComposer] = useState<{ offering?: number } | null>(null);
    const { flash, auth, teachingIdentity } = usePage<{
        flash?: { success?: string };
        auth?: { user?: { name?: string; first_name?: string; last_name?: string } | null };
        teachingIdentity?: { name?: string | null; photo_url?: string | null } | null;
    }>().props;
    const user = auth?.user;
    const name = teachingIdentity?.name || user?.name || [user?.first_name, user?.last_name].filter(Boolean).join(' ');
    const studentView = view === 'students';
    const rosterCourses = studentView
        ? (offerings?.data ?? []).map((offer) => ({
              id: offer.id,
              title: offer.title,
              level: offer.level,
              faculty: offer.faculty,
              group: offer.group,
              students: offer.active_students_count,
              url: route('dashboard.teaching.index', {
                  offering: offer.id,
                  view: 'students',
                  year: overview.year ?? undefined,
                  semester: overview.semester ?? undefined,
              }),
          }))
        : [];
    const courseDetail = view === 'courses' ? selected : null;
    const sessionDetail = view === 'schedule' ? overview.selected_session : null;
    const announcementAction = overview.links.publish_announcement;
    const canAnnounce = Boolean(announcementAction && overview.announcement_targets.length);
    const announce = canAnnounce ? () => setComposer({}) : undefined;
    const title = (sessionDetail && `Séance · ${sessionDetail.course}`) || courseDetail?.title || teacherTitles[view];

    return (
        <Dashboard hideAppsNavigation>
            <Head title={title + ' · Espace enseignant'} />
            {modal && <AcademicForm spec={modal} onClose={() => setModal(null)} onSuccess={() => setModal(null)} />}
            {composer && announcementAction && (
                <TeacherAnnouncementForm
                    action={announcementAction}
                    targets={overview.announcement_targets}
                    offering={composer.offering}
                    onClose={() => setComposer(null)}
                />
            )}
            <div className="student-portal teacher-workspace" data-dashboard-arrival-grid>
                <TeacherCover
                    data={overview}
                    view={view}
                    name={name}
                    photoUrl={photoUrl}
                    detail={sessionDetail?.course ?? courseDetail?.title}
                    detailBack={sessionDetail ? { href: sessionDetail.back_url, label: 'Emploi du temps' } : undefined}
                />
                {flash?.success && (
                    <p role="status" className="portal-alert">
                        {flash.success}
                    </p>
                )}
                {!linked ? (
                    <TeacherPanel id="teacher-link-account" title="Rattachement de votre compte" icon={GraduationCap}>
                        <p className="teacher-empty">Votre compte doit être rattaché à une fiche enseignant active par l’administration.</p>
                    </TeacherPanel>
                ) : courseDetail ? (
                    <TeacherCourseDetail
                        {...courseData}
                        course={courseDetail}
                        period={overview}
                        students={students}
                        onAnnounce={
                            canAnnounce && overview.announcement_targets.some((target) => target.id === courseDetail.id)
                                ? () => setComposer({ offering: courseDetail.id })
                                : undefined
                        }
                        onPublishLink={
                            canPublish
                                ? () =>
                                      setModal({
                                          title: 'Publier un lien pédagogique',
                                          description: 'Le lien sera disponible aux étudiants autorisés de ce cours.',
                                          action: route('dashboard.teaching.link', courseDetail.id),
                                          fields: [
                                              { name: 'title', label: 'Intitulé', required: true },
                                              { name: 'url', label: 'Adresse du lien (https ou http)', type: 'url', required: true },
                                          ],
                                      })
                                : undefined
                        }
                    />
                ) : view === 'courses' ? (
                    <TeacherCourseList offerings={offerings} overview={overview} />
                ) : studentView ? (
                    <div className="teacher-roster-layout">
                        <TeacherPanel id="teacher-students" title="Effectifs par cours" icon={UsersRound}>
                            <TeacherCourseRows courses={rosterCourses} studentsView selected={selected?.id} />
                            <Pagination value={offerings} preserveScroll={false} />
                        </TeacherPanel>
                        {selected && students && (
                            <TeacherPanel id="teacher-roster" title={selected.title} icon={UsersRound}>
                                {students.data.length ? (
                                    <ul className="teacher-list teacher-roster-list">
                                        {students.data.map((student) => (
                                            <li key={student.id} className="teacher-row">
                                                <span className="teacher-symbol">
                                                    <UsersRound size={18} aria-hidden="true" />
                                                </span>
                                                <span className="teacher-row-copy">
                                                    <strong>{student.name}</strong>
                                                    {student.matricule && <small>{student.matricule}</small>}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="teacher-empty">Aucun étudiant inscrit dans ce cours.</p>
                                )}
                                <Pagination value={students} preserveScroll={false} />
                            </TeacherPanel>
                        )}
                    </div>
                ) : view === 'schedule' ? (
                    sessionDetail ? (
                        <TeacherSessionDetail session={sessionDetail} />
                    ) : (
                        <>
                            <TeacherPanel id="teacher-schedule" title="Planning de la semaine" icon={CalendarDays} className="teacher-schedule-panel">
                                <TeacherTimetable data={overview} view={view} />
                            </TeacherPanel>
                            <TeacherAcademicCalendar events={overview.calendar_events} />
                        </>
                    )
                ) : view === 'announcements' ? (
                    <TeacherAnnouncements data={overview} full onAnnounce={announce} />
                ) : (
                    <TeacherHome data={overview} onAnnounce={announce} />
                )}
            </div>
        </Dashboard>
    );
}
