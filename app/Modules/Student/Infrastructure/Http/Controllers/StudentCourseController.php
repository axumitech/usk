<?php

namespace App\Modules\Student\Infrastructure\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Courses;
use App\Models\Student\AcademicAttendance;
use App\Models\Student\AcademicResource;
use App\Models\Student\AcademicSemester;
use App\Models\Student\AcademicSession;
use App\Models\Student\ContentSection;
use App\Modules\Student\Application\Services\AcademicAccessService;
use App\Modules\Student\Application\Services\StudentPortalContext;
use App\Modules\Teaching\Application\Services\LearningFiles;
use App\Modules\Teaching\Application\Services\TeachingTeam;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class StudentCourseController extends Controller
{
    public function show(Request $request, StudentPortalController $portal, AcademicAccessService $access, StudentPortalContext $context, int $course, string $section = 'infos')
    {
        $entry = $portal->context($request);
        abort_unless($access->decision($entry, 'courses_view')['allowed'], 403);
        $now = now();
        $input = $request->validate([
            'week' => 'nullable|date_format:Y-m-d', 'q' => 'nullable|string|max:180', 'support' => 'nullable|integer',
            'session' => 'nullable|integer|min:1', 'focus_session' => 'nullable|integer|min:1',
        ]);
        $sessionQuery = $access->sessions($entry)->whereHas('offering', fn ($offering) => $offering->where('course_id', $course));
        $sessionRelations = ['offering.professor', 'offering.assignments.professor', 'registeredRoom:id,name,building', 'successor:id,replaces_session_id'];
        $focusRelations = [...$sessionRelations, 'offering.curriculumItem.unit', 'offering.academicSemester'];
        $focus = isset($input['focus_session']) ? (clone $sessionQuery)->with($focusRelations)->findOrFail($input['focus_session']) : null;
        $historical = $focus !== null || (in_array($section, ['sessions', 'attendance'], true)
            && (clone $sessionQuery)->where('starts_at', '<=', $now)->exists());
        $offerings = $access->offerings($entry)->where('course_id', $course)->with(['professor', 'assistant', 'group.intake', 'academicSemester', 'assignments.professor', 'curriculumItem.unit'])->get();
        abort_unless($historical || $offerings->isNotEmpty() || $access->catalog($entry)->whereKey($course)->exists(), 404);
        $subject = Courses::findOrFail($course);
        $managed = $offerings->firstWhere('curriculum_item_id', '!=', null);
        $item = $focus?->offering->curriculumItem ?? $managed?->curriculumItem;
        $reference = $access->reference($entry, $subject, $item) + ['teacher' => $subject->teacher];
        $permissions = $access->permissions($entry);
        $feature = match ($section) {
            'files' => 'materials_download', 'evaluations' => 'evaluations_participate', 'sessions', 'attendance' => 'schedule_view', default => 'courses_view'
        };
        abort_unless($permissions[$feature]['allowed'], 403, $permissions[$feature]['reason'] ?? 'Accès refusé.');
        if ($focus === null && $section === 'infos' && $permissions['schedule_view']['allowed']) {
            $activeSessions = (clone $sessionQuery)->whereNull('cancelled_at')->with($focusRelations);
            $focus = (clone $activeSessions)->where('ends_at', '>', $now)->orderBy('starts_at')->orderBy('id')->first()
                ?? $activeSessions->orderByDesc('starts_at')->orderByDesc('id')->first();
        }
        $week = CarbonImmutable::parse($input['week'] ?? $focus?->starts_at->copy()->timezone('Africa/Kinshasa')->toDateString()
            ?? $now->copy()->timezone('Africa/Kinshasa')->toDateString(), 'Africa/Kinshasa')->startOfWeek();
        $linkedSession = isset($input['session']) ? (clone $sessionQuery)->findOrFail($input['session']) : null;
        $files = ['material', 'syllabus', 'audio'];
        $contentKinds = $permissions['materials_download']['allowed'] ? AcademicResource::CONTENT_KINDS : ['online', 'video'];
        $resources = AcademicResource::visible()->forStudent($entry)->forLearningPermissions($permissions)
            ->whereIn('academic_offering_id', $offerings->pluck('id'));
        $counts = (clone $resources)->whereIn('kind', [...$contentKinds, 'assignment', 'evaluation'])->selectRaw('kind, count(*) as total')->groupBy('kind')->pluck('total', 'kind');
        $kinds = match ($section) {
            'supports' => $contentKinds,
            'files' => $files,
            'online' => $linkedSession ? $contentKinds : ['online'],
            'videos' => ['video'],
            'evaluations' => ['assignment', 'evaluation'],
            default => [],
        };
        $resourcePage = $kinds ? (clone $resources)->whereIn('kind', $kinds)->with(['section:id,title', 'supplementaryFor:id,title'])
            ->when($linkedSession, fn ($q) => $q->where('academic_session_id', $linkedSession->id))
            ->when($input['support'] ?? null, fn ($q, $id) => $q->whereKey($id))
            ->when($input['q'] ?? null, fn ($q, $term) => $q->where('title', 'like', '%'.$term.'%'))
            ->orderByRaw('case when academic_content_section_id is null then 1 else 0 end')
            ->orderBy(ContentSection::select('position')->whereColumn('id', 'academic_resources.academic_content_section_id'))
            ->orderBy('academic_content_section_id')->orderBy('position')->orderBy('title')->orderBy('id')->paginate(25, ['*'], 'resources_page')->withQueryString() : null;
        $pageResources = $resourcePage?->getCollection() ?? collect();
        $sessionIds = $pageResources->pluck('academic_session_id')->filter()->unique();
        $visibleSessions = $sessionIds->isNotEmpty() ? (clone $sessionQuery)->whereKey($sessionIds->all())->get(['id', 'starts_at'])->keyBy('id') : collect();
        $items = $pageResources->map(fn ($r) => [
            'id' => $r->id, 'title' => $r->title, 'body' => $r->body, 'url' => $r->url && preg_match('#^https?://#i', $r->url) ? $r->url : null,
            'filename' => $r->filename, 'kind' => $r->kind, 'opens_at' => $r->opens_at, 'closes_at' => $r->closes_at,
            'section' => $r->section?->title, 'work_title' => $r->supplementaryFor?->title,
            'session_date' => $visibleSessions->get($r->academic_session_id)?->starts_at,
            'preview_url' => $r->path && in_array($r->kind, AcademicResource::CONTENT_KINDS, true) && LearningFiles::previewable($r->disk, $r->mime)
                ? route('dashboard.student.resources.preview', ['resource' => $r->id, 'academic' => $entry->id]) : null,
            'download_url' => $r->path ? route('dashboard.student.resources.download', ['resource' => $r->id, 'academic' => $entry->id]) : null,
            'work_url' => match ($r->kind) {
                'assignment' => route('dashboard.student.index', ['section' => 'assignments', 'academic' => $entry->id, 'work' => $r->id], false),
                'evaluation' => route('dashboard.student.index', ['section' => 'evaluations', 'academic' => $entry->id, 'work' => $r->id], false),
                default => null,
            },
        ]);
        $sessionCount = (clone $sessionQuery)->count();
        $sessions = $section === 'sessions' ? (clone $sessionQuery)->where('starts_at', '<', $week->addWeek()->utc())->where('ends_at', '>', $week->utc())->with($sessionRelations)->orderBy('starts_at')->orderBy('id')->get() : collect();
        $sessionContent = $sessions->isNotEmpty() ? (clone $resources)->whereIn('kind', $contentKinds)->whereIn('academic_session_id', $sessions->pluck('id'))
            ->distinct()->pluck('academic_session_id')->flip() : collect();
        $sessions = $sessions->map(fn (AcademicSession $s) => $this->sessionDetails($s, $subject) + [
            'course' => $reference['title'], 'course_id' => $course, 'level_id' => $s->offering->level_id,
            'resource_url' => $sessionContent->has($s->id) ? route('dashboard.student.courses.show', ['course' => $course, 'section' => 'supports', 'academic' => $entry->id, 'session' => $s->id]) : null,
        ]);
        $attendance = $section === 'attendance' ? (clone $sessionQuery)->whereNull('cancelled_at')->where('starts_at', '<=', $now)->orderByDesc('starts_at')->paginate(30)->withQueryString() : null;
        if ($attendance) {
            $records = AcademicAttendance::where('academic_enrollment_id', $entry->id)->whereIn('academic_session_id', $attendance->getCollection()->pluck('id'))->with('justification:id,academic_attendance_id,status')->get()->mapWithKeys(fn ($r) => [
                $r->academic_session_id => $r->status === 'absent' && $r->justification?->status === 'accepted' ? 'excused' : $r->status,
            ]);
            $attendance->through(fn ($s) => ['id' => $s->id, 'starts_at' => $s->starts_at, 'ends_at' => $s->ends_at, 'room' => $s->room, 'status' => $records[$s->id] ?? null]);
        }
        $stats = collect();
        if ($permissions['schedule_view']['allowed']) {
            $attendanceRows = AcademicAttendance::query()
                ->leftJoin('academic_absence_justifications as justification', 'justification.academic_attendance_id', '=', 'academic_attendances.id')
                ->where('academic_enrollment_id', $entry->id)
                ->whereIn('academic_session_id', (clone $sessionQuery)->whereNull('cancelled_at')->where('ends_at', '<=', $now)->select('id'))
                ->selectRaw("CASE WHEN academic_attendances.status = 'absent' AND justification.status = 'accepted' THEN 'excused' ELSE academic_attendances.status END as attendance_status");

            $stats = DB::query()->fromSub($attendanceRows, 'attendance_rows')
                ->selectRaw('attendance_status, count(*) as total')->groupBy('attendance_status')
                ->pluck('total', 'attendance_status')->map(fn ($count) => (int) $count);
        }
        $total = $stats->sum();
        $attended = ($stats['present'] ?? 0) + ($stats['late'] ?? 0);
        $periodOffering = $focus?->offering->curriculum_item_id ? $focus->offering : $managed;
        $period = $periodOffering ? ($periodOffering->academicSemester?->only(['start_date', 'end_date']) ?? ['start_date' => $periodOffering->starts_on, 'end_date' => $periodOffering->ends_on])
            : AcademicSemester::where('academic_year_id', $entry->academic_year_id)->where('number', $subject->semester)->first(['start_date', 'end_date']);

        return Inertia::render('dashboard/student/Course', [
            'studentChrome' => fn () => $context->forEnrollment($entry, $permissions, $context->currentYearId()),
            'period' => $period, 'registered' => $managed !== null,
            'section' => $section, 'academic' => ['id' => $entry->id, 'level' => $entry->level->title, 'faculty' => $entry->level->faculty->name, 'year' => $entry->academicYear->title, 'group' => $entry->group?->intake?->name],
            'course' => $reference,
            'focused_session' => $focus ? $this->sessionDetails($focus, $subject) + [
                'has_resources' => (clone $resources)->where('academic_session_id', $focus->id)->whereIn('kind', $contentKinds)->exists(),
            ] : null,
            'curriculum' => $access->curriculumContext($entry),
            'organization' => $offerings->map(fn ($o) => ['id' => $o->id, 'teacher' => $o->professor?->full_name ?? $subject->teacher,
                'assistant' => collect([$o->assistant?->full_name])->merge($o->assignments->whereNull('ends_at')->where('role', 'assistant')->map(fn ($a) => $a->professor?->full_name))->filter()->unique()->join(', '),
                'instructors' => $o->assignments->whereNull('ends_at')->where('role', 'instructor')->map(fn ($a) => $a->professor?->full_name)->filter()->values(),
                'group' => $o->group?->intake?->name, 'leader' => $o->group_leader_name, 'delivery_mode' => $o->delivery_mode]),
            'counts' => ['sessions' => $sessionCount, 'files' => (int) $counts->only($files)->sum(), 'online' => (int) ($counts['online'] ?? 0), 'videos' => (int) ($counts['video'] ?? 0), 'evaluations' => (int) ($counts['evaluation'] ?? 0) + (int) ($counts['assignment'] ?? 0)],
            'resource_filters' => ['q' => $input['q'] ?? '', 'session' => $linkedSession?->id, 'session_date' => $linkedSession?->starts_at],
            'permissions' => $permissions, 'resources' => $items, 'resource_pagination' => $resourcePage ? ['links' => $resourcePage->linkCollection()] : null, 'week' => $week->toDateString(), 'sessions' => $sessions, 'attendance' => $attendance, 'attendance_stats' => $stats,
            'attendance_summary' => $permissions['schedule_view']['allowed'] ? [
                'recorded' => $total, 'attended' => $attended, 'excused' => $stats['excused'] ?? 0,
                'rate' => $total > 0 ? round(100 * $attended / $total, 1) : null,
            ] : null,
        ]);
    }

    private function sessionDetails(AcademicSession $session, Courses $subject): array
    {
        $room = $session->room ?: $session->registeredRoom?->name;
        $location = collect([$session->registeredRoom?->building, $room])->filter()->unique()->join(' · ');

        return [
            'id' => $session->id,
            'teacher' => TeachingTeam::leadNameAt($session->offering, $session->starts_at) ?? $subject->teacher,
            'starts_at' => $session->starts_at, 'ends_at' => $session->ends_at,
            'room' => $room, 'location' => $location ?: null, 'activity_type' => $session->activity_type,
            'status' => $session->cancelled_at ? ($session->successor ? 'rescheduled' : 'cancelled') : 'published',
        ];
    }
}
