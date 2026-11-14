import AppsNavigation from '@/components/admin/AppsNavigation';
import DetailNavigation from '@/components/admin/DetailNavigation';
import DashboardHeader from '@/components/layouts/Dashboard/DashboardHeader';
import Sidebar from '@/components/layouts/Dashboard/Sidebar';
import { StudentBottomNav, StudentTopHeader, studentChromeSection, type StudentChromeData } from '@/components/student/StudentChrome';
import { DashboardArrivalContext, DashboardCurtain, useDashboardArrival } from '@/components/system/DashboardArrival';
import { DashboardDepartureContext } from '@/components/system/DashboardDeparture';
import { NavigationFeedbackContext } from '@/components/system/NavigationFeedback';
import PageContent from '@/components/system/PageContent';
import TeacherShell, { type TeachingIdentity, type TeachingPeriod, type TeachingView } from '@/components/teaching/TeacherShell';
import { useDashboardTheme } from '@/hooks/use-dashboard-theme';
import { usePage } from '@inertiajs/react';
import { useCallback, useContext, useEffect, useRef, useState, type ComponentProps } from 'react';
import '../../../../css/dashboard/admin-apps.css';
import '../../../../css/dashboard/night.css';
import '../../../../css/dashboard/usk-theme.css';

// Composant Dashboard principal
const Dashboard = ({
    children,
    authPage = false,
    hideAppsNavigation = false,
}: {
    children: React.ReactNode;
    authPage?: boolean;
    hideAppsNavigation?: boolean;
}) => {
    const [currentActiveMenu, setCurrentActiveMenu] = useState<string | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const { props, component, flash, url } = usePage<{
        auth: {
            user: { roles?: ComponentProps<typeof Sidebar>['userRole']; permissions?: string[]; first_name?: string; last_name?: string } | null;
        };
        section?: string;
        profile_view?: 'overview' | 'personal' | 'photo' | 'settings' | null;
        studentChrome?: StudentChromeData | null;
        teachingIdentity?: TeachingIdentity | null;
        overview?: TeachingPeriod | null;
        view?: TeachingView;
    }>();
    const isAdminApps = /^dashboard\/(academicYear|faculties|levels|blog|adminEnrollments|studentAcademic|professors|schedule|seo)\//.test(component);
    const showAppsNavigation = isAdminApps && !hideAppsNavigation && component !== 'dashboard/adminEnrollments/Overview';
    const isStudentOverview = component === 'dashboard/student/Portal' && props.section === 'overview';
    const isStudentProfile = component === 'dashboard/student/Portal' && props.section === 'profile';
    const profileView = isStudentProfile ? (props.profile_view ?? 'overview') : null;
    const isStudentDocuments = component === 'dashboard/student/Portal' && props.section === 'documents';
    const isStudentSchedule = component === 'dashboard/student/Portal' && props.section === 'schedule';
    const isStudentWork = component === 'dashboard/student/Portal' && ['assignments', 'evaluations'].includes(props.section ?? '');
    const isStudentSchoolServices = component === 'dashboard/student/Portal' && ['services', 'requests'].includes(props.section ?? '');
    const isStudentPathway = component === 'dashboard/student/Pathway';
    const isStudentProgram = component === 'dashboard/student/Program';
    const isStudentMaterials = component === 'dashboard/student/Materials';
    const isStudentAnnouncements = component === 'dashboard/student/Announcements';
    const isStudentNotifications = component === 'dashboard/student/Notifications';
    const hasStudentPageHeader =
        isStudentDocuments ||
        isStudentSchedule ||
        isStudentWork ||
        isStudentSchoolServices ||
        isStudentPathway ||
        isStudentProgram ||
        isStudentMaterials ||
        isStudentAnnouncements ||
        isStudentNotifications ||
        (profileView !== null && profileView !== 'overview');
    const isStudentCourse = component === 'dashboard/student/Course';
    const user = props.auth?.user;
    const roles = Array.isArray(user?.roles) ? user.roles : [user?.roles];
    const studentApp = !authPage && user ? props.studentChrome : null;
    const studentSection = studentApp ? studentChromeSection(url) : 'overview';
    const profileYear =
        (isStudentProfile || isStudentDocuments || isStudentPathway) && studentApp
            ? studentApp.options.find((option) => option.id === studentApp.academic_id)
            : undefined;
    const administration = roles.includes('admin');
    const teaching = roles.includes('professor') && (url.startsWith('/app/dashboard/teacher') || (!administration && !props.studentPortalActive));
    const teacherApp = !authPage && roles.includes('professor') && /^\/app\/dashboard\/teacher(?:[/?#]|$)/.test(url);
    const tone =
        authPage || component.startsWith('dashboard/auth/')
            ? 'auth'
            : (administration || teaching) && !url.startsWith('/app/dashboard/student') && !studentApp
              ? 'admin'
              : 'student';
    const { resolved } = useDashboardTheme();
    const themeEnabled = Boolean(user && tone !== 'auth');
    const opening = useDashboardArrival(Boolean(user && tone !== 'auth' && flash?.dashboardArrival === true));
    const { phase: departure, logout } = useContext(DashboardDepartureContext);
    const { cancelPageTransition } = useContext(NavigationFeedbackContext);
    const arriving = opening && departure === null;
    const leaving = Boolean(user && (departure === 'closing' || departure === 'waiting'));
    const loggingOut = leaving || Boolean(user && departure === 'immediate');
    const closeSubmenu = useCallback(() => setCurrentActiveMenu(null), []);

    useEffect(() => {
        if (!themeEnabled) return;
        const hideVisualProgress = () => document.getElementById('nprogress')?.setAttribute('aria-hidden', 'true');
        const observer = new MutationObserver(hideVisualProgress);
        observer.observe(document.body, { childList: true });
        hideVisualProgress();
        return () => {
            observer.disconnect();
            document.getElementById('nprogress')?.removeAttribute('aria-hidden');
        };
    }, [themeEnabled]);

    useEffect(() => {
        const desktop = window.matchMedia('(min-width: 48rem)');
        const syncViewport = () => {
            setIsMobile(!desktop.matches);

            // Si on passe de mobile à desktop, fermer le menu mobile
            if (desktop.matches) {
                setIsMobileSidebarOpen(false);
            } else {
                setCurrentActiveMenu(null);
            }
        };

        syncViewport();
        desktop.addEventListener('change', syncViewport);
        return () => desktop.removeEventListener('change', syncViewport);
    }, []);

    const handleButtonClick = (e: React.MouseEvent, menuId: string) => {
        e.stopPropagation();
        setCurrentActiveMenu((prev) => (prev === menuId ? null : menuId));
    };

    const toggleMobileSidebar = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentActiveMenu(null);
        setIsMobileSidebarOpen((prev) => !prev);
    };

    const mainRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (studentApp || teacherApp || !mainRef.current) return;

        if (isMobile) {
            if (isMobileSidebarOpen) {
                mainRef.current.style.transform = `translateX(${currentActiveMenu ? '300px' : '80px'})`;
            } else {
                mainRef.current.style.transform = 'translateX(0)';
            }
        } else {
            mainRef.current.style.transform = 'none';
        }
    }, [isMobile, isMobileSidebarOpen, currentActiveMenu, studentApp, teacherApp]);

    const closeAllMenus = () => {
        setCurrentActiveMenu(null);
        setIsMobileSidebarOpen(false);
    };

    const content = (
        <main
            id={themeEnabled ? 'usk-dashboard-main' : undefined}
            tabIndex={themeEnabled ? -1 : undefined}
            className={`usk-page-content ${teacherApp ? 'teacher-shell-main' : studentApp ? 'student-app-main' : `${authPage ? 'usk-auth-main' : ''} min-h-screen pt-16 transition-transform duration-300 ease-out md:ml-20 lg:ml-20`}`}
            data-page-tone={tone}
            data-dashboard-navigation-surface={user && tone !== 'auth' ? '' : undefined}
            ref={mainRef}
        >
            <PageContent
                tone={tone}
                skipEntrance={arriving || departure !== null}
                className={
                    teacherApp
                        ? 'teacher-shell-content'
                        : studentApp
                          ? 'student-app-container min-w-0'
                          : authPage
                            ? 'usk-auth-content'
                            : `w-full min-w-0 px-4 py-8 sm:px-6 lg:px-8 ${isStudentOverview ? 'student-desktop-container' : isStudentCourse ? 'student-course-container' : isStudentProfile ? 'student-profile-container' : ''}`
                }
            >
                {!studentApp && !teacherApp && showAppsNavigation && <AppsNavigation />}
                {!studentApp && !teacherApp && isAdminApps && <DetailNavigation />}
                <DashboardArrivalContext.Provider value={arriving}>{children}</DashboardArrivalContext.Provider>
            </PageContent>
        </main>
    );

    return (
        <div
            className={`usk-dashboard ${authPage ? 'usk-auth-page' : ''} ${isAdminApps && !studentApp && !teacherApp ? 'usk-admin-apps' : ''} ${studentApp ? 'usk-student-app' : ''} ${teacherApp ? 'usk-teacher-app' : ''} ${isStudentOverview ? 'usk-student-overview-shell' : ''} ${isStudentCourse ? 'usk-student-course-shell' : ''} ${isStudentProfile ? 'usk-student-profile-shell' : ''} relative min-h-screen overflow-x-clip bg-gray-50`}
            data-dashboard-theme={themeEnabled ? resolved : undefined}
            data-profile-view={profileView ?? (isStudentDocuments ? 'documents' : isStudentPathway ? 'pathway' : undefined)}
            data-profile-year={profileYear && !profileYear.is_current ? 'archive' : undefined}
            data-dashboard-arrival={arriving ? '' : undefined}
            data-dashboard-departure={leaving ? '' : undefined}
            inert={loggingOut}
        >
            {themeEnabled && (
                <a
                    className="usk-dashboard-skip"
                    href="#usk-dashboard-main"
                    onClick={(event) => {
                        event.preventDefault();
                        mainRef.current?.focus();
                    }}
                >
                    Aller au contenu principal
                </a>
            )}
            {arriving && <DashboardCurtain />}
            {teacherApp ? (
                <TeacherShell
                    url={url}
                    identity={props.teachingIdentity}
                    accountName={[user?.first_name, user?.last_name].filter(Boolean).join(' ')}
                    permissions={user?.permissions ?? []}
                    overview={component === 'dashboard/teaching/Teacher' ? props.overview : null}
                    view={component === 'dashboard/teaching/Teacher' ? props.view : undefined}
                    onLogout={() => {
                        cancelPageTransition();
                        logout(true);
                    }}
                >
                    {content}
                </TeacherShell>
            ) : studentApp ? (
                !hasStudentPageHeader && (
                    <StudentTopHeader context={studentApp} section={studentSection} layout={profileView === 'overview' ? 'profile' : undefined} />
                )
            ) : (
                <>
                    {/* Overlay pour mobile */}
                    <div
                        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 md:hidden ${
                            isMobileSidebarOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                        }`}
                        id="overlay"
                        onClick={closeAllMenus}
                    ></div>

                    <Sidebar
                        onButtonClick={handleButtonClick}
                        onCloseMenu={closeSubmenu}
                        onNavigate={closeAllMenus}
                        onLogout={() => {
                            cancelPageTransition();
                            closeAllMenus();
                            logout(tone !== 'auth');
                        }}
                        loggingOut={loggingOut}
                        isMobile={isMobile}
                        isMobileSidebarOpen={isMobileSidebarOpen}
                        currentActiveMenu={currentActiveMenu || ''}
                        userRole={user?.roles ?? null}
                    />

                    <DashboardHeader
                        enrollmentSpace={
                            component.startsWith('dashboard/enrollments/') ||
                            (component.startsWith('dashboard/student/') && !url.startsWith('/app/dashboard/admin/')) ||
                            (!authPage &&
                                !administration &&
                                !teaching &&
                                roles.some((role) => role === 'user' || role === 'candidate' || role === 'student'))
                        }
                        studentPortal={Boolean(props.studentPortalActive)}
                        administration={administration}
                        teaching={teaching}
                        teachingProfileActive={Boolean(props.teachingProfileActive)}
                        canManageCourses={Boolean(user?.permissions?.includes('manage courses'))}
                        authenticated={Boolean(user)}
                        themeEnabled={themeEnabled}
                        adminApps={isAdminApps}
                        onMobileToggle={toggleMobileSidebar}
                        isMobileSidebarOpen={isMobileSidebarOpen}
                    />
                </>
            )}

            {!teacherApp && content}
            {studentApp && <StudentBottomNav context={studentApp} section={studentSection} />}
        </div>
    );
};

export default Dashboard;
