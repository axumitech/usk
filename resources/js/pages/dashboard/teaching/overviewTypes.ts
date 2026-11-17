import type { Page } from './types';

export type TeacherView = 'home' | 'courses' | 'schedule' | 'students' | 'announcements';

export type TeacherCourse = {
    id: number;
    title: string;
    level: string;
    faculty: string | null;
    group: string | null;
    students: number | null;
    url: string;
};

export type TeacherSession = {
    id: number;
    offering_id: number;
    course: string;
    level: string;
    group: string | null;
    starts_at: string;
    ends_at: string;
    room: string | null;
    location: string | null;
    activity_type: string | null;
    status: 'published' | 'rescheduled' | 'cancelled';
    course_url: string;
    url: string;
};

export type TeacherScheduledSession = TeacherSession & {
    faculty: string | null;
    year: string;
    teacher: string | null;
    replacement_starts_at: string | null;
    replacement_url: string | null;
    attendance_url: string | null;
    can_record_attendance: boolean;
    attendance_status: 'recordable' | 'upcoming' | 'read_only' | 'unavailable';
    back_url: string;
};

export type TeacherAnnouncement = {
    id: number;
    title: string;
    body: string | null;
    faculty: string | null;
    group: string | null;
    course: string;
    author: string | null;
    date: string;
    url: string;
};

export type TeacherAnnouncementTarget = {
    id: number;
    title: string;
    level: string;
    faculty: string | null;
    group: string | null;
    groups: { id: number; label: string }[];
};

export type TeacherCalendarEvent = {
    id: number | string;
    title: string;
    category: string;
    category_label: string;
    start_date: string;
    end_date: string;
};

export type TeacherOverview = {
    year: number | null;
    semester: number | null;
    years: { id: number; title: string; start_date: string; end_date: string; is_current: boolean }[];
    semesters: { id: number; label: string }[];
    stats: { courses: number; students: number | null; assessments: number | null; resources: number | null };
    courses: TeacherCourse[];
    week: {
        start: string;
        end: string;
        today: string;
        selected_day: string;
        previous: string;
        next: string;
        days: { date: string; weekday: string; day: string; is_today: boolean; sessions: TeacherSession[] }[];
    };
    calendar_events?: TeacherCalendarEvent[];
    selected_session: TeacherScheduledSession | null;
    evaluations: { id: number; title: string; course: string; closes_at: string | null; url: string }[];
    submissions: { id: number; name: string; title: string; course: string; submitted_at: string; url: string }[];
    activities: { id: string; kind: 'resource' | 'assessment' | 'submission' | 'grade'; title: string; detail: string; date: string; url: string }[];
    announcements: TeacherAnnouncement[];
    announcement_targets: TeacherAnnouncementTarget[];
    selected_announcement: TeacherAnnouncement | null;
    announcement_page: Page<TeacherAnnouncement> | null;
    links: {
        home: string;
        courses: string;
        schedule: string;
        assessments: string | null;
        resources: string | null;
        students: string | null;
        grades: string | null;
        create_assessment: string | null;
        publish_resource: string | null;
        announcements: string | null;
        publish_announcement: string | null;
    };
};
