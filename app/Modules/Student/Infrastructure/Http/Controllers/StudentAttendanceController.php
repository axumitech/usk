<?php

namespace App\Modules\Student\Infrastructure\Http\Controllers;

use App\Models\Student\AcademicEnrollment;
use App\Modules\Student\Application\Services\AcademicAccessService;
use App\Modules\Student\Application\Services\StudentPortalContext;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

final class StudentAttendanceController
{
    private const LOCAL_TIMEZONE = 'Africa/Kinshasa';

    private const COUNTS = ['present' => 0, 'late' => 0, 'absent' => 0, 'excused' => 0];

    private const STATUS = "CASE WHEN a.status = 'absent' AND j.status = 'accepted' THEN 'excused' ELSE a.status END";

    public function index(Request $request, StudentPortalController $portal, AcademicAccessService $access, StudentPortalContext $context): Response
    {
        $entry = $portal->context($request);
        $permissions = $access->permissions($entry);
        abort_unless($permissions['schedule_view']['allowed'], 403, $permissions['schedule_view']['reason'] ?? 'Accès refusé.');

        $input = $request->validate([
            'course' => 'nullable|integer|min:1',
            'from' => 'nullable|date_format:Y-m-d',
            'to' => 'nullable|date_format:Y-m-d|after_or_equal:from',
            'status' => ['nullable', Rule::in([...array_keys(self::COUNTS), 'pending'])],
        ]);
        $filters = [
            'course' => isset($input['course']) ? (int) $input['course'] : null,
            'from' => $input['from'] ?? null,
            'to' => $input['to'] ?? null,
            'status' => $input['status'] ?? null,
        ];
        $now = now();
        $sessions = $access->sessions($entry)->whereNull('cancelled_at');
        $courses = $this->courses($sessions, $access, $entry);
        $rows = $this->records($entry, $sessions)
            ->where('s.starts_at', '<=', $now)
            ->when($filters['course'], fn ($query, $course) => $query->where('o.course_id', $course))
            ->when($filters['from'], fn ($query, $day) => $query->where('s.starts_at', '>=', CarbonImmutable::parse($day, self::LOCAL_TIMEZONE)->utc()))
            ->when($filters['to'], fn ($query, $day) => $query->where('s.starts_at', '<', CarbonImmutable::parse($day, self::LOCAL_TIMEZONE)->addDay()->utc()));

        $totals = self::COUNTS;
        $byCourse = $byMonth = [];
        $recorded = (clone $rows)->whereNotNull('a.id')->where('s.ends_at', '<=', $now)
            ->select('s.starts_at', 'o.course_id')->selectRaw(self::STATUS.' AS status');
        foreach ($recorded->cursor() as $row) {
            $month = CarbonImmutable::parse($row->starts_at, 'UTC')->timezone(self::LOCAL_TIMEZONE)->format('Y-m');
            $byCourse[$row->course_id] ??= self::COUNTS;
            $byMonth[$month] ??= self::COUNTS;
            $totals[$row->status]++;
            $byCourse[$row->course_id][$row->status]++;
            $byMonth[$month][$row->status]++;
        }
        ksort($byMonth);

        $academic = ['academic' => $entry->id];
        $history = $rows
            ->when($filters['status'] === 'pending', fn ($query) => $query->whereNull('a.id'))
            ->when($filters['status'] && $filters['status'] !== 'pending', fn ($query) => $query->whereRaw(self::STATUS.' = ?', [$filters['status']]))
            ->orderByDesc('s.starts_at')->orderByDesc('s.id')
            ->select('s.id', 'o.course_id', 's.starts_at', 's.ends_at', 'a.checked_in_at', 'a.source')
            ->selectRaw('COALESCE(i.name, c.title) AS course, COALESCE(NULLIF(s.room, ?), rooms.name) AS room', [''])
            ->selectRaw(self::STATUS.' AS status')
            ->paginate(15)->appends($academic + array_filter($filters))
            ->through(fn ($row) => [
                'id' => (int) $row->id,
                'course_id' => (int) $row->course_id,
                'course' => $row->course,
                'starts_at' => CarbonImmutable::parse($row->starts_at, 'UTC')->toISOString(),
                'ends_at' => CarbonImmutable::parse($row->ends_at, 'UTC')->toISOString(),
                'room' => $row->room,
                'status' => $row->status,
                'checked_in_at' => $row->checked_in_at ? CarbonImmutable::parse($row->checked_in_at, 'UTC')->toISOString() : null,
                'source' => $row->status ? ($row->source ?? 'manual') : null,
            ]);

        return Inertia::render('dashboard/student/Attendance', [
            'studentChrome' => fn () => $context->forEnrollment($entry, $permissions, $context->currentYearId()),
            'academic' => ['id' => $entry->id, 'year' => $entry->academicYear->title, 'level' => $entry->level->title],
            'filters' => $filters,
            'courses' => $courses,
            'summary' => $this->summary($totals),
            'breakdown' => $courses->when($filters['course'], fn ($list, $id) => $list->where('id', $id))
                ->map(fn (array $course) => $course + $this->summary($byCourse[$course['id']] ?? self::COUNTS))->values(),
            'trend' => collect($byMonth)->map(fn (array $counts, string $month) => ['month' => $month] + $this->summary($counts))->values(),
            'history' => $history,
            'links' => [
                'attendance' => route('dashboard.student.attendance', $academic, false),
                'schedule' => route('dashboard.student.index', ['section' => 'schedule'] + $academic, false),
                'absences' => route('dashboard.student.absences', $academic, false),
            ],
        ]);
    }

    private function courses(EloquentBuilder $sessions, AcademicAccessService $access, AcademicEnrollment $entry): Collection
    {
        return DB::table('academic_offerings AS o')
            ->join('courses AS c', 'c.id', '=', 'o.course_id')
            ->leftJoin('curriculum_items AS i', 'i.id', '=', 'o.curriculum_item_id')
            ->where(fn (Builder $scope) => $scope
                ->whereIn('o.id', (clone $sessions)->select('academic_offering_id'))
                ->orWhereIn('o.id', $access->offerings($entry)->select('academic_offerings.id')))
            ->select('c.id')->selectRaw('COALESCE(i.name, c.title) AS title, COALESCE(i.code, c.code) AS code')
            ->orderByRaw('CASE WHEN i.id IS NULL THEN 1 ELSE 0 END')->orderByDesc('o.id')
            ->get()->unique('id')->sortBy('title', SORT_NATURAL | SORT_FLAG_CASE)->values()
            ->map(fn ($row) => ['id' => (int) $row->id, 'title' => $row->title, 'code' => $row->code]);
    }

    private function records(AcademicEnrollment $entry, EloquentBuilder $sessions): Builder
    {
        return DB::table('academic_sessions AS s')
            ->whereIn('s.id', (clone $sessions)->select('id'))
            ->join('academic_offerings AS o', 'o.id', '=', 's.academic_offering_id')
            ->join('courses AS c', 'c.id', '=', 'o.course_id')
            ->leftJoin('curriculum_items AS i', 'i.id', '=', 'o.curriculum_item_id')
            ->leftJoin('academic_rooms AS rooms', 'rooms.id', '=', 's.academic_room_id')
            ->leftJoin('academic_attendances AS a', fn ($join) => $join
                ->on('a.academic_session_id', '=', 's.id')->where('a.academic_enrollment_id', '=', $entry->id))
            ->leftJoin('academic_absence_justifications AS j', 'j.academic_attendance_id', '=', 'a.id');
    }

    private function summary(array $counts): array
    {
        $recorded = array_sum($counts);
        $attended = $counts['present'] + $counts['late'];

        return $counts + [
            'recorded' => $recorded,
            'attended' => $attended,
            'rate' => $recorded ? round(100 * $attended / $recorded, 1) : null,
        ];
    }
}
