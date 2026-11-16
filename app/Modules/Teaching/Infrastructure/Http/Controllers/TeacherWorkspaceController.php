<?php

namespace App\Modules\Teaching\Infrastructure\Http\Controllers;

use App\Models\Student\AcademicOffering;
use App\Models\Student\AcademicResource;
use App\Modules\Teaching\Application\Services\CourseAudience;
use App\Modules\Teaching\Application\Services\LearningAccess;
use App\Modules\Teaching\Application\Services\LearningContent;
use App\Modules\Teaching\Application\Services\LearningFiles;
use App\Modules\Teaching\Application\Services\TeacherAnnouncementPublisher;
use App\Modules\Teaching\Application\Services\TeacherCourseDetails;
use App\Modules\Teaching\Application\Services\TeacherCourseOverview;
use App\Modules\Teaching\Application\Services\TeacherDashboard;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Ramsey\Uuid\Uuid;

final class TeacherWorkspaceController
{
    public function __construct(private LearningAccess $learning) {}

    public function index(Request $request, CourseAudience $audience, TeacherDashboard $dashboard, TeacherCourseDetails $details)
    {
        $input = $request->validate([
            'offering' => 'nullable|integer', 'year' => 'nullable|integer', 'semester' => 'nullable|in:all,1,2',
            'week' => 'nullable|date_format:Y-m-d', 'day' => 'nullable|date_format:Y-m-d',
            'view' => 'nullable|in:home,courses,schedule,students,announcements', 'announcement' => 'nullable|integer|min:1', 'session' => 'nullable|integer|min:1',
            'tab' => 'nullable|in:overview,sessions,students,assessments,resources,grades', 'group' => ['nullable', 'regex:/^(?:[1-9][0-9]{0,18}|unassigned)$/D'],
            'section' => ['nullable', 'regex:/^(?:[1-9][0-9]{0,18}|unassigned)$/D'], 'q' => 'nullable|string|max:100',
        ]);
        $actor = $request->user();
        $teacher = $this->learning->teacher($actor);
        $relations = ['course', 'academicYear', 'academicSemester', 'level.faculty', 'curriculumItem.unit.version.program', 'requiredUnit', 'group.intake', 'group.promotion', 'department', 'professor', 'assistant'];
        $scope = $teacher ? $this->learning->teacherOfferings($teacher) : AcademicOffering::whereRaw('1 = 0');
        $selected = isset($input['offering']) && $teacher ? (clone $scope)->with($relations)->findOrFail($input['offering']) : null;
        $view = $input['view'] ?? match (true) {
            isset($input['session']) => 'schedule',
            isset($input['announcement']) => 'announcements',
            $selected !== null => 'courses',
            default => 'home',
        };
        $session = $view === 'schedule' && isset($input['session']) ? $dashboard->scheduledSession($scope, (int) $input['session']) : null;
        $periods = $dashboard->periods($scope, $input, $session?->offering ?? $selected, $teacher !== null, $session);
        $offerings = $dashboard->inPeriod($scope, $periods);
        abort_if($session && ((isset($input['year']) && (int) $input['year'] !== (int) $session->offering->academic_year_id)
            || (isset($input['day']) && $input['day'] !== $periods['day'])), 404);
        $selectedSession = $session ? $dashboard->scheduleSessionDetails($actor, $teacher, $offerings, $periods, $session) : null;
        if ($view === 'students') {
            abort_unless($teacher && $actor->can('manage students'), 403);
            $rosterOfferings = (clone $offerings)->where(fn ($offers) => $offers->where('professor_id', $teacher->id)
                ->orWhereHas('assignments', fn ($team) => $team->where('professor_id', $teacher->id)->where('role', 'instructor')->whereNull('ends_at')));
            $selected = isset($input['offering']) ? (clone $rosterOfferings)->with($relations)->findOrFail($input['offering'])
                : (clone $rosterOfferings)->with($relations)->latest('id')->first();
            $offerings = $rosterOfferings;
        }

        $instructor = $selected && $this->learning->instructor($selected, $teacher);
        $isCourseDetail = $view === 'courses' && $selected;
        $restriction = $selected ? $this->learning->teacherManagementRestriction($actor, $selected, $teacher) : null;
        $canPublish = $selected !== null && $restriction === null;
        $period = $dashboard->parameters($periods);
        $courseDetails = $isCourseDetail ? $details->read($actor, $teacher, $selected, $input, $canPublish, $period) : [];
        $week = $periods['week_start'];
        $schedule = $teacher && ! $isCourseDetail ? $dashboard->schedule($offerings, $week, $week->addWeek())->paginate(25, ['*'], 'week_page')->withQueryString()
            ->through(fn ($session) => $dashboard->session($session, $dashboard->parameters($periods) + ['week' => $week->toDateString()])) : null;

        $showCounts = in_array($view, ['courses', 'students'], true) && $actor->can('manage students');
        $offers = $teacher ? (clone $offerings)->with($relations) : null;
        if ($showCounts) {
            $offers?->withExists(['assignments as instructor_assignment' => fn ($team) => $team->where('professor_id', $teacher->id)->where('role', 'instructor')->whereNull('ends_at')]);
        }
        $offerPage = $offers?->latest('id')->paginate(15)->withQueryString();
        $cardCounts = $view === 'courses' && ! $isCourseDetail && $offerPage ? $details->cardCounts($actor, $offerPage->getCollection()) : [];

        return Inertia::render('dashboard/teaching/Teacher', [
            'photoUrl' => $teacher?->portraitUrl(),
            'linked' => $teacher !== null, 'view' => $view, 'schedule' => $schedule, 'week' => $week->toDateString(),
            'overview' => fn () => $dashboard->read($actor, $teacher, $offerings, $periods, ['view' => $view] + $input, $selectedSession),
            'offerings' => $offerPage?->through(function (AcademicOffering $offer) use ($audience, $showCounts, $teacher, $dashboard, $cardCounts) {
                $row = array_replace($this->courseRow($offer, $dashboard), $cardCounts[$offer->id] ?? []);
                if ($showCounts && ((int) $offer->professor_id === $teacher->id || $offer->instructor_assignment)) {
                    $row['active_students_count'] = $audience->roster($offer)->distinct()->count('student_profile_id');
                }

                return $row;
            }),
            'selected' => $selected ? $this->courseRow($selected, $dashboard) : null,
            'canPublish' => $canPublish,
            'courseManagementRestriction' => $isCourseDetail ? $restriction : null,
        ] + $courseDetails + [
            'courseTab' => null, 'canSeeCourseStudents' => false, 'canSeeCourseAssessments' => false, 'canSeeCourseGrades' => false,
            'courseLinks' => null, 'courseOverview' => null, 'gradebook' => null,
            'sessions' => null, 'assessments' => null, 'resources' => null,
            'studentGroups' => [], 'studentGroup' => null, 'studentSearch' => '',
            'resourcesSections' => [], 'resourceSection' => null, 'resourceUnassignedCount' => 0, 'resourcesTotal' => 0,
            'students' => $view === 'students' && $instructor && $actor->can('manage students')
                ? $audience->roster($selected)->with('profile.user')->orderBy('id')->paginate(20, ['*'], 'students_page')->withQueryString()->through(TeachingController::student(...)) : null,
        ]);
    }

    private function courseRow(AcademicOffering $offering, TeacherDashboard $dashboard): array
    {
        $row = TeachingController::row($offering);
        if (! $offering->curriculum_item_id && (int) $offering->course->credits > 0) {
            $row['credits'] = (string) $offering->course->credits;
        }

        return array_replace($row, [
            'semester_number' => $dashboard->semesterNumber($offering),
            'group' => CourseAudience::groupLabel($offering->group),
            'assessments_count' => null,
        ]);
    }

    public function updateCourseOverview(Request $request, AcademicOffering $offering, TeacherCourseOverview $overview, TeacherDashboard $dashboard)
    {
        $data = $request->validate([
            'presentation' => 'present|nullable|string|max:5000', 'objectives' => 'present|nullable|string|max:5000',
            'revision' => 'required|integer|min:0', 'semester' => 'nullable|in:all,1,2',
        ]);
        $overview->update($request->user(), $offering, $data);

        $semester = $data['semester'] ?? 'all';
        if ($semester !== 'all' && ! $dashboard->inPeriod(AcademicOffering::query(), [
            'year' => $offering->academic_year_id, 'semester' => (int) $semester,
        ])->whereKey($offering->id)->exists()) {
            $semester = 'all';
        }

        return to_route('dashboard.teaching.index', [
            'view' => 'courses', 'offering' => $offering->id, 'tab' => 'overview',
            'year' => $offering->academic_year_id, 'semester' => $semester,
        ], 303)->with('success', 'Présentation du cours enregistrée.');
    }

    public function link(Request $request, AcademicOffering $offering)
    {
        abort_unless($request->user()->can('manage courses'), 403);
        $data = $request->validate(['title' => 'required|string|max:180', 'url' => 'required|url:http,https|max:2000']);
        $this->learning->read($request->user(), $offering);
        $key = Uuid::uuid5('d18d1274-64ec-4a66-8b25-e0e714117287', json_encode([$offering->id, $request->user()->id, $data], JSON_THROW_ON_ERROR));
        app(LearningContent::class)->create($offering, $request->user(), $data + [
            'kind' => 'online', 'publish' => true, 'legacy_link' => true, 'operation_key' => (string) $key,
        ]);

        return back(303)->with('success', 'Lien pédagogique enregistré.');
    }

    public function publishAnnouncement(Request $request, TeacherAnnouncementPublisher $publisher, TeacherDashboard $dashboard)
    {
        $data = $request->validate([
            'offering_id' => 'required|integer|min:1', 'group_id' => 'nullable|integer|min:1',
            'title' => 'required|string|max:180', 'body' => 'required|string|max:5000', 'operation_key' => 'required|uuid',
            'year' => 'nullable|integer|min:1', 'semester' => 'nullable|in:all,1,2',
        ]);
        ['announcement' => $announcement, 'recipients' => $recipients] = $publisher->publish($request->user(), $data);
        $offer = $announcement->offering;
        $parameters = ['year' => $offer->academic_year_id, 'view' => 'announcements', 'announcement' => $announcement->id];
        if (isset($data['semester']) && (int) ($data['year'] ?? $offer->academic_year_id) === (int) $offer->academic_year_id
            && $dashboard->inPeriod(AcademicOffering::query(), ['year' => $offer->academic_year_id,
                'semester' => $data['semester'] === 'all' ? null : (int) $data['semester']])->whereKey($offer->id)->exists()) {
            $parameters['semester'] = $data['semester'];
        }

        $message = match ($recipients) {
            0 => 'Annonce publiée. Aucun étudiant de ce public n’a reçu de notification.',
            1 => 'Annonce publiée. Un étudiant a reçu une notification.',
            default => "Annonce publiée. {$recipients} étudiants ont reçu une notification.",
        };

        return to_route('dashboard.teaching.index', $parameters, 303)->with('success', $message);
    }

    public function file(Request $request, AcademicResource $resource, LearningFiles $files)
    {
        $this->learning->content($request->user(), $resource);

        return $files->stream($resource->only(AcademicResource::EDITION_FIELDS));
    }
}
