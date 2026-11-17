<?php

namespace App\Modules\Teaching\Application\Services;

use App\Models\AcademicYear;
use App\Models\Professor;
use App\Models\Student\AcademicAssessment;
use App\Models\Student\AcademicOffering;
use App\Models\Student\AcademicResource;
use App\Models\Student\AcademicSemester;
use App\Models\Student\AcademicSession;
use App\Models\Student\AssessmentRecord;
use App\Models\User;
use App\Modules\AcademicYear\Application\AcademicCalendar;
use App\Modules\Assessment\Application\AssessmentAccess;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

final class TeacherDashboard
{
    private const ZONE = 'Africa/Kinshasa';

    private const SEMESTER_LABELS = [1 => ['1', '1er semestre', 'semestre 1', 's1'], 2 => ['2', '2e semestre', '2ème semestre', 'semestre 2', 's2']];

    public function __construct(
        private CourseAudience $audience,
        private AssessmentAccess $assessmentAccess,
        private TeacherAnnouncementPublisher $announcementPublisher,
        private AttendanceAccess $attendance,
        private AcademicCalendar $calendar,
    ) {}

    public function periods(Builder $offerings, array $input, ?AcademicOffering $selected, bool $linked, ?AcademicSession $session = null): array
    {
        $today = CarbonImmutable::today(self::ZONE);
        $todayDate = $today->toDateString();
        $years = $linked ? AcademicYear::where(fn ($query) => $query->where('status', 'open')
            ->orWhereIn('id', (clone $offerings)->select('academic_year_id')))
            ->orderByDesc('start_date')->get(['id', 'title', 'start_date', 'end_date', 'status']) : collect();
        $current = $years->first(fn (AcademicYear $year) => $year->status === 'open' && $year->start_date <= $todayDate && $year->end_date >= $todayDate)
            ?? $years->firstWhere('status', 'open');
        $year = isset($input['year']) ? $years->firstWhere('id', $input['year']) : null;
        $year ??= $selected ? $years->firstWhere('id', $selected->academic_year_id) : null;
        $year ??= $current ?? $years->first();
        $anchor = $today;
        if ($year && $year->start_date > $todayDate) {
            $anchor = CarbonImmutable::parse($year->start_date, self::ZONE);
        } elseif ($year && $year->end_date < $todayDate) {
            $anchor = CarbonImmutable::parse($year->end_date, self::ZONE);
        }
        $semester = isset($input['semester']) && $input['semester'] !== 'all' ? (int) $input['semester'] : null;
        if ($year && $semester !== null) {
            $term = AcademicSemester::where('academic_year_id', $year->id)->where('number', $semester)->first();
            $anchorDate = $anchor->toDateString();
            if ($term && ($anchorDate < $term->start_date->toDateString() || $anchorDate > $term->end_date->toDateString())) {
                $anchor = CarbonImmutable::parse($term->start_date->toDateString(), self::ZONE);
            }
        }

        $sessionDay = $session?->starts_at->toImmutable()->setTimezone(self::ZONE)->startOfDay();
        $week = CarbonImmutable::parse($input['week'] ?? $input['day'] ?? $sessionDay?->toDateString() ?? $anchor->toDateString(), self::ZONE)->startOfWeek();
        $day = CarbonImmutable::parse($input['day'] ?? $sessionDay?->toDateString() ?? $anchor->toDateString(), self::ZONE);
        if ($day->lt($week) || $day->gte($week->addWeek())) {
            $day = $week;
        }

        return [
            'year' => $year?->id,
            'semester' => $semester,
            'years' => $years->map(fn (AcademicYear $item) => [
                'id' => $item->id, 'title' => $item->title, 'start_date' => $item->start_date, 'end_date' => $item->end_date,
                'is_current' => $item->id === $current?->id,
            ])->all(),
            'semesters' => $year ? [['id' => 1, 'label' => 'Semestre 1'], ['id' => 2, 'label' => 'Semestre 2']] : [],
            'week_start' => $week,
            'day' => $day->toDateString(),
        ];
    }

    public function inPeriod(Builder $query, array $periods): Builder
    {
        $query->when($periods['year'], fn (Builder $offers, int $year) => $offers->where('academic_year_id', $year));
        if ($periods['semester'] === null) {
            return $query;
        }

        $number = $periods['semester'];
        $labels = self::SEMESTER_LABELS[$number];

        return $query->where(fn (Builder $scope) => $scope->whereHas('academicSemester', fn (Builder $term) => $term->where('number', $number))
            ->orWhere(fn (Builder $legacy) => $legacy->whereNull('academic_semester_id')
                ->where(fn (Builder $semesters) => $semesters->whereIn(DB::raw('LOWER(semester)'), $labels)
                    ->orWhereHas('curriculumItem.unit', fn (Builder $unit) => $unit->whereIn('period_code', ['S'.$number, 's'.$number]))
                    ->orWhere(fn (Builder $legacyCourse) => $legacyCourse->whereNull('semester')->whereNull('curriculum_item_id')
                        ->whereHas('course', fn (Builder $course) => $course->where('semester', $number))))));
    }

    public function semesterNumber(AcademicOffering $offering): ?int
    {
        if ($offering->academicSemester) {
            return (int) $offering->academicSemester->number;
        }

        $label = mb_strtolower(trim((string) $offering->semester));
        $period = strtoupper($offering->curriculumItem?->unit->period_code ?? '');
        foreach (self::SEMESTER_LABELS as $number => $labels) {
            if (in_array($label, $labels, true) || $period === 'S'.$number) {
                return $number;
            }
        }

        $legacy = (int) $offering->course->semester;

        return $offering->semester === null && ! $offering->curriculum_item_id && isset(self::SEMESTER_LABELS[$legacy]) ? $legacy : null;
    }

    public function schedule(Builder $offerings, CarbonImmutable $start, CarbonImmutable $end): Builder
    {
        return $this->scheduledSessions($offerings)->where('starts_at', '<', $end->utc())->where('ends_at', '>', $start->utc())
            ->orderBy('starts_at')->orderBy('id');
    }

    private function scheduledSessions(Builder $offerings): Builder
    {
        return AcademicSession::whereIn('academic_offering_id', (clone $offerings)->whereNull('archived_at')->where('is_published', true)->select('id'))
            ->where('is_published', true)->with(['offering.course:id,title,teacher', 'offering.curriculumItem:id,name', 'offering.level.faculty',
                'offering.group.intake', 'registeredRoom:id,name,building', 'successor' => fn ($query) => $query->where('is_published', true)
                    ->select('id', 'academic_offering_id', 'replaces_session_id', 'starts_at'),
            ]);
    }

    public function scheduledSession(Builder $offerings, int $id): AcademicSession
    {
        return $this->scheduledSessions($offerings)->with('offering.academicYear:id,title,status')->findOrFail($id);
    }

    public function session(AcademicSession $session, array $parameters): array
    {
        $offering = $session->offering;
        $room = $session->room ?: $session->registeredRoom?->name;
        $location = collect([$session->registeredRoom?->building, $room])->filter()->unique()->join(' · ');
        $period = array_intersect_key($parameters, ['year' => true, 'semester' => true]);

        return [
            'id' => $session->id, 'offering_id' => $offering->id, 'course' => $this->courseTitle($offering), 'level' => $offering->level->title,
            'group' => CourseAudience::groupLabel($offering->group), 'starts_at' => $session->starts_at, 'ends_at' => $session->ends_at,
            'room' => $room, 'location' => $location ?: null, 'activity_type' => $session->activity_type,
            'status' => $session->cancelled_at ? ($session->successor ? 'rescheduled' : 'cancelled') : 'published',
            'url' => $this->scheduleSessionUrl($session, $parameters),
            'course_url' => $this->workspaceUrl($period + ['view' => 'courses', 'offering' => $offering->id, 'tab' => 'sessions']),
        ];
    }

    public function scheduleSessionDetails(User $actor, Professor $teacher, Builder $offerings, array $periods, AcademicSession $session): array
    {
        $day = CarbonImmutable::parse($periods['day'], self::ZONE);
        $offering = $session->offering;
        abort_unless($this->overlapsDay($session, $day) && (clone $offerings)->whereKey($offering->id)->exists(), 404);

        $period = $this->parameters($periods);
        $context = $period + ['week' => $periods['week_start']->toDateString(), 'day' => $day->toDateString()];
        $canSeeAttendance = ! $session->cancelled_at && $this->attendance->canRead($actor, $teacher, $session);
        $canRecordAttendance = $canSeeAttendance && $this->attendance->canRecord($actor, $session);
        $attendanceStatus = match (true) {
            ! $canSeeAttendance => 'unavailable',
            $canRecordAttendance => 'recordable',
            $session->attendance_closed_at !== null || $offering->academicYear->status !== 'open' => 'read_only',
            $session->starts_at->isFuture() => 'upcoming',
            default => 'read_only',
        };
        $replacement = $session->successor;
        $hasReplacement = $replacement && (int) $replacement->academic_offering_id === (int) $offering->id;

        return $this->session($session, $context) + [
            'faculty' => $offering->level->faculty?->name, 'year' => $offering->academicYear->title,
            'teacher' => TeachingTeam::leadNameAt($offering, $session->starts_at) ?? $offering->course->teacher,
            'replacement_starts_at' => $hasReplacement ? $replacement->starts_at : null,
            'replacement_url' => $hasReplacement ? $this->scheduleSessionUrl($replacement, $period) : null,
            'attendance_url' => $canSeeAttendance ? route('dashboard.teaching.attendance', ['session' => $session->id] + $context, false) : null,
            'can_record_attendance' => $canRecordAttendance, 'attendance_status' => $attendanceStatus,
            'back_url' => $this->workspaceUrl($context + ['view' => 'schedule']),
        ];
    }

    public function scheduleSessionUrl(AcademicSession $session, array $parameters): string
    {
        $day = $session->starts_at->toImmutable()->setTimezone(self::ZONE);
        $week = $parameters['week'] ?? $day->startOfWeek()->toDateString();

        return $this->workspaceUrl(['view' => 'schedule', 'session' => $session->id] + $parameters + [
            'week' => $week, 'day' => max($day->toDateString(), $week),
        ]);
    }

    public function attendanceScheduleContext(AcademicSession $session, array $context): array
    {
        if (! isset($context['week'], $context['day']) || $session->offering->archived_at) {
            return [];
        }
        $day = CarbonImmutable::parse($context['day'], self::ZONE);
        if ($day->startOfWeek()->toDateString() !== $context['week'] || ! $this->overlapsDay($session, $day)) {
            return [];
        }
        $semester = $context['semester'] ?? 'all';
        $period = ['year' => $session->offering->academic_year_id, 'semester' => $semester];
        if ($semester !== 'all' && ! $this->inPeriod(AcademicOffering::query(), ['year' => $period['year'], 'semester' => (int) $semester])
            ->whereKey($session->academic_offering_id)->exists()) {
            $period['semester'] = 'all';
        }

        return $period + ['week' => $context['week'], 'day' => $context['day']];
    }

    private function overlapsDay(AcademicSession $session, CarbonImmutable $day): bool
    {
        return $session->starts_at->lt($day->addDay()) && $session->ends_at->gt($day);
    }

    public function parameters(array $periods): array
    {
        return $periods['year'] ? ['year' => $periods['year'], 'semester' => $periods['semester'] ?? 'all'] : [];
    }

    public function read(User $actor, ?Professor $teacher, Builder $offerings, array $periods, array $input, ?array $selectedSession = null): array
    {
        $parameters = $this->parameters($periods);
        $hasAssessments = $teacher && $actor->can('manage courses');
        $canSeeStudents = $teacher && $actor->can('manage students');
        $view = $input['view'] ?? 'home';
        $available = (clone $offerings)->whereNull('archived_at');
        $courses = $teacher ? $available->with(['course:id,title', 'curriculumItem:id,name,curriculum_version_id', 'level.faculty', 'group.intake', 'academicYear:id,status'])
            ->withExists(['assignments as instructor_assignment' => fn ($team) => $team->where('professor_id', $teacher->id)->where('role', 'instructor')->whereNull('ends_at')])
            ->orderByDesc('is_published')->orderByDesc('id')->get() : collect();
        [$courseRows, $students] = $this->courses($courses, $teacher, $canSeeStudents, $parameters);
        $assessmentOfferings = $hasAssessments ? $this->assessmentAccess->scope($actor)
            ->whereIn('id', (clone $offerings)->select('id')) : null;
        $assessmentRows = $assessmentOfferings ? $this->assessments($assessmentOfferings) : null;
        $active = $assessmentRows ? (clone $assessmentRows)->where('state', 'published')->whereHas('resource', fn (Builder $resource) => $resource
            ->visible()->whereHas('offering', fn (Builder $offering) => $offering->whereNull('archived_at')->where('is_published', true))
            ->where(fn (Builder $dates) => $dates->whereNull('closes_at')->orWhere('closes_at', '>=', now()))) : null;
        $materials = AcademicResource::visible()->whereNull('student_profile_id')->whereIn('kind', AcademicResource::CONTENT_KINDS)
            ->whereIn('academic_offering_id', (clone $available)->where('is_published', true)->select('id'));
        $submissions = $assessmentRows ? $this->submissions($assessmentRows) : [];
        $week = $periods['week_start'];
        $schedule = $teacher ? $this->schedule($offerings, $week, $week->addWeek())->when($view !== 'schedule', fn ($query) => $query->limit(175))->get() : collect();
        [$announcements, $selectedAnnouncement, $announcementPage] = $this->announcements($offerings, $parameters, $view, $input['announcement'] ?? null);
        $announcementOfferings = match (true) {
            in_array($view, ['home', 'announcements'], true) => clone $offerings,
            $view === 'courses' && isset($input['offering']) => (clone $offerings)->whereKey($input['offering']),
            default => null,
        };
        $announcementTargets = $announcementOfferings ? $this->announcementPublisher->targets($announcementOfferings, $actor, $teacher) : [];

        return [
            'year' => $periods['year'], 'semester' => $periods['semester'], 'years' => $periods['years'], 'semesters' => $periods['semesters'],
            'stats' => ['courses' => $courses->count(), 'students' => $students, 'assessments' => $active?->count(), 'resources' => $materials->count()],
            'courses' => $courseRows,
            'week' => $this->week($schedule, $week, $periods['day'], $parameters),
            'calendar_events' => $periods['year'] && in_array($view, ['home', 'schedule'], true) && $courses->contains('is_published', true)
                ? $this->calendar->week($periods['year'], $week) : [],
            'selected_session' => $selectedSession,
            'evaluations' => $active ? $active->with('resource.offering.course', 'resource.offering.curriculumItem')->latest('id')->limit(4)->get()
                ->map(fn (AcademicAssessment $assessment) => [
                    'id' => $assessment->id, 'title' => $assessment->resource->title, 'course' => $this->courseTitle($assessment->resource->offering),
                    'closes_at' => $assessment->resource->closes_at, 'url' => $this->assessmentUrl($assessment->academic_resource_id),
                ])->all() : [],
            'submissions' => $submissions,
            'activities' => $this->activities($actor, $assessmentRows, $materials, $submissions),
            'announcements' => $announcements,
            'selected_announcement' => $selectedAnnouncement,
            'announcement_page' => $announcementPage,
            'announcement_targets' => $announcementTargets,
            'links' => $this->links($courses, $actor, $teacher, $parameters, $week, $hasAssessments, $canSeeStudents, $assessmentOfferings) + [
                'publish_announcement' => $announcementTargets ? route('dashboard.teaching.announcements.store', $parameters, false) : null,
            ],
        ];
    }

    private function courses(Collection $courses, ?Professor $teacher, bool $canSeeStudents, array $parameters): array
    {
        $profiles = [];
        $counted = false;
        $rows = [];
        foreach ($courses as $course) {
            $count = null;
            if ($canSeeStudents && ((int) $course->professor_id === $teacher->id || $course->instructor_assignment)) {
                $roster = $this->audience->roster($course)->distinct()->pluck('student_profile_id');
                foreach ($roster as $id) {
                    $profiles[$id] = true;
                }
                $count = $roster->count();
                $counted = true;
            }

            if (count($rows) < 6) {
                $rows[] = [
                    'id' => $course->id, 'title' => $this->courseTitle($course), 'level' => $course->level->title, 'faculty' => $course->level->faculty?->name,
                    'group' => CourseAudience::groupLabel($course->group), 'students' => $count, 'url' => $this->workspaceUrl($parameters + ['offering' => $course->id]),
                ];
            }
        }

        return [$rows, $counted || ($canSeeStudents && $courses->isEmpty()) ? count($profiles) : null];
    }

    private function week(Collection $sessions, CarbonImmutable $week, string $selected, array $parameters): array
    {
        $days = [];
        $today = CarbonImmutable::today(self::ZONE)->toDateString();
        for ($index = 0; $index < 7; $index++) {
            $day = $week->addDays($index);
            $rows = $sessions->filter(fn (AcademicSession $session) => $this->overlapsDay($session, $day));
            $days[] = [
                'date' => $day->toDateString(), 'weekday' => $day->locale('fr')->isoFormat('ddd'), 'day' => $day->format('d'),
                'is_today' => $day->toDateString() === $today,
                'sessions' => $rows->map(fn (AcademicSession $session) => $this->session($session, $parameters + ['week' => $week->toDateString(), 'day' => $day->toDateString()]))->values()->all(),
            ];
        }

        return [
            'start' => $week->toDateString(), 'end' => $week->addDays(6)->toDateString(), 'selected_day' => $selected, 'today' => $today,
            'previous' => $week->subWeek()->toDateString(), 'next' => $week->addWeek()->toDateString(), 'days' => $days,
        ];
    }

    private function assessments(Builder $offerings): Builder
    {
        return AcademicAssessment::whereHas('resource', fn (Builder $query) => $query->whereNull('student_profile_id')
            ->whereIn('academic_offering_id', (clone $offerings)->select('id')));
    }

    private function submissions(Builder $assessments): array
    {
        return AssessmentRecord::query()->whereIn('academic_assessment_id', (clone $assessments)->select('id'))
            ->join('academic_assessments as work', 'work.id', '=', 'academic_assessment_records.academic_assessment_id')
            ->join('academic_submissions as copy', fn ($join) => $join->on('copy.academic_resource_id', '=', 'work.academic_resource_id')
                ->on('copy.academic_enrollment_id', '=', 'academic_assessment_records.academic_enrollment_id'))
            ->with(['assessment.resource.offering.course', 'assessment.resource.offering.curriculumItem', 'enrollment.profile.user'])
            ->orderByDesc('copy.updated_at')->orderByDesc('copy.id')->limit(5)
            ->get(['academic_assessment_records.*', 'copy.id as submission_id', 'copy.updated_at as submitted_at'])->map(function (AssessmentRecord $record) {
                $resource = $record->assessment->resource;

                return [
                    'id' => $record->submission_id, 'name' => $record->enrollment->profile->user->full_name, 'title' => $resource->title,
                    'course' => $this->courseTitle($resource->offering), 'submitted_at' => CarbonImmutable::parse($record->submitted_at)->toISOString(),
                    'url' => $this->assessmentUrl($resource->id, ['record' => $record->id]).'#assessment-participants',
                ];
            })->all();
    }

    private function activities(User $actor, ?Builder $assessments, Builder $materials, array $submissions): array
    {
        $rows = (clone $materials)->with('offering.course', 'offering.curriculumItem')->orderByDesc('published_at')->latest('id')->limit(4)->get()
            ->map(fn (AcademicResource $resource) => [
                'id' => 'resource-'.$resource->id, 'kind' => 'resource', 'title' => 'Support publié',
                'detail' => $resource->title.' · '.$this->courseTitle($resource->offering), 'date' => ($resource->published_at ?? $resource->created_at)->toISOString(),
                'url' => route('dashboard.teaching.learning.index', ['resource' => $resource->id], false),
            ]);
        if ($assessments) {
            foreach ((clone $assessments)->with('resource')->latest('created_at')->latest('id')->limit(4)->get() as $assessment) {
                $rows->push([
                    'id' => 'assessment-'.$assessment->id, 'kind' => 'assessment', 'title' => 'Évaluation créée', 'detail' => $assessment->resource->title,
                    'date' => $assessment->created_at->toISOString(), 'url' => $this->assessmentUrl($assessment->academic_resource_id),
                ]);
            }
            $corrections = AssessmentRecord::where('corrected_by', $actor->id)->whereNotNull('points')
                ->whereIn('academic_assessment_id', (clone $assessments)->select('id'))->with('assessment.resource')
                ->latest('updated_at')->latest('id')->limit(4)->get();
            foreach ($corrections as $record) {
                $rows->push([
                    'id' => 'grade-'.$record->id, 'kind' => 'grade', 'title' => 'Note encodée', 'detail' => $record->assessment->resource->title,
                    'date' => $record->updated_at->toISOString(), 'url' => $this->assessmentUrl($record->assessment->academic_resource_id, ['record' => $record->id]).'#assessment-correction',
                ]);
            }
        }
        foreach ($submissions as $submission) {
            $rows->push([
                'id' => 'submission-'.$submission['id'], 'kind' => 'submission', 'title' => 'Travail remis', 'detail' => $submission['title'],
                'date' => $submission['submitted_at'], 'url' => $submission['url'],
            ]);
        }

        return $rows->sortByDesc('date')->take(5)->values()->all();
    }

    private function announcements(Builder $offerings, array $parameters, string $view, ?int $selectedId): array
    {
        $query = AcademicResource::visible()->whereNull('student_profile_id')->where('kind', 'announcement')
            ->where(fn (Builder $dates) => $dates->whereNull('published_at')->orWhere('published_at', '<=', now()))
            ->whereIn('academic_offering_id', (clone $offerings)->whereNull('archived_at')->where('is_published', true)->select('id'))
            ->with(['offering.level.faculty', 'offering.course', 'offering.curriculumItem', 'offering.group.intake', 'announcementGroup.intake', 'authorProfessor'])
            ->orderByRaw('COALESCE(published_at, created_at) DESC')->latest('id');
        $present = fn (AcademicResource $notice) => [
            'id' => $notice->id, 'title' => $notice->title, 'body' => $selectedId === $notice->id ? $notice->body : null,
            'course' => $this->courseTitle($notice->offering),
            'group' => CourseAudience::groupLabel($notice->announcementGroup ?? $notice->offering->group),
            'author' => $notice->authorProfessor?->full_name,
            'faculty' => $notice->offering->level->faculty?->name, 'date' => $notice->published_at ?? $notice->created_at,
            'url' => $this->workspaceUrl($parameters + ['view' => 'announcements', 'announcement' => $notice->id]),
        ];
        $selected = $selectedId ? $present((clone $query)->findOrFail($selectedId)) : null;
        $page = $view === 'announcements' ? $query->paginate(15, ['*'], 'announcements_page')->withQueryString()->through($present) : null;
        $rows = $page ? $page->items() : $query->limit(3)->get()->map($present)->all();

        return [$rows, $selected, $page];
    }

    private function links(Collection $courses, User $actor, ?Professor $teacher, array $parameters, CarbonImmutable $week, bool $assessments, bool $students, ?Builder $assessmentOfferings): array
    {
        $year = array_intersect_key($parameters, ['year' => true]);
        $editable = $actor->can('manage courses') ? $courses->filter(fn (AcademicOffering $offering) => ((int) $offering->professor_id === $teacher?->id || $offering->instructor_assignment) && $offering->academicYear->status === 'open') : collect();
        $assessable = $editable->isNotEmpty() ? (clone $assessmentOfferings)->whereKey($editable->modelKeys())->limit(2)->pluck('id') : collect();
        $createAssessment = match ($assessable->count()) {
            0 => null,
            1 => route('dashboard.teaching.assessments.index', ['offering' => $assessable->first()] + $year, false).'#assessment-create',
            default => route('dashboard.teaching.assessments.index', $year, false).'#assessment-courses',
        };
        $publishResource = match ($editable->count()) {
            0 => null,
            1 => route('dashboard.teaching.learning.index', ['offering' => $editable->first()->id] + $year, false).'#learning-create',
            default => route('dashboard.teaching.learning.index', $year, false).'#learning-offers',
        };

        return [
            'home' => $this->workspaceUrl($parameters),
            'courses' => $this->workspaceUrl($parameters + ['view' => 'courses']),
            'schedule' => $this->workspaceUrl($parameters + ['view' => 'schedule', 'week' => $week->toDateString()]),
            'assessments' => $assessments ? route('dashboard.teaching.assessments.index', $year, false) : null,
            'resources' => $teacher ? route('dashboard.teaching.learning.index', $year, false) : null,
            'students' => $students ? $this->workspaceUrl($parameters + ['view' => 'students']) : null,
            'grades' => $assessments ? route('dashboard.teaching.assessments.index', $year + ['state' => 'closed'], false) : null,
            'create_assessment' => $createAssessment,
            'publish_resource' => $publishResource,
            'announcements' => $teacher ? $this->workspaceUrl($parameters + ['view' => 'announcements']) : null,
        ];
    }

    private function courseTitle(AcademicOffering $offering): string
    {
        return $offering->curriculumItem?->name ?? $offering->course->title;
    }

    private function workspaceUrl(array $parameters): string
    {
        return route('dashboard.teaching.index', $parameters, false);
    }

    private function assessmentUrl(int $resource, array $parameters = []): string
    {
        return route('dashboard.teaching.assessments.index', ['resource' => $resource] + $parameters, false);
    }
}
