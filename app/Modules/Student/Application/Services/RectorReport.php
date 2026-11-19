<?php

namespace App\Modules\Student\Application\Services;

use App\Models\AcademicYear;
use App\Models\Faculty;
use App\Models\Student\AcademicDeliberation;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicOfficialResult;
use Illuminate\Support\Facades\DB;

final class RectorReport
{
    public function __construct(private FinanceReportingService $finance) {}

    public function overview(?int $yearId): array
    {
        $years = AcademicYear::orderByDesc('start_date')->orderByDesc('id')->get(['id', 'title', 'status']);
        $open = $years->where('status', 'open');
        $year = $yearId === null ? ($open->first() ?? $years->first()) : $years->find($yearId);

        return [
            'indicators' => [
                'Facultés actives' => Faculty::where('is_active', true)->count(),
                'Années ouvertes' => $open->count(),
                'Inscriptions confirmées des années ouvertes' => AcademicEnrollment::whereIn('academic_year_id', $open->modelKeys())
                    ->where('enrollment_status', 'confirmed')->count(),
            ],
            'years' => $years,
            'report' => $year ? $this->forYear($year) : null,
        ];
    }

    private function forYear(AcademicYear $year): array
    {
        $entries = AcademicEnrollment::where('academic_year_id', $year->id);
        $statuses = (clone $entries)->groupBy('enrollment_status')->selectRaw('enrollment_status, COUNT(*) AS total')
            ->pluck('total', 'enrollment_status')->map(fn ($count) => (int) $count);
        $published = AcademicOfficialResult::published()->join('academic_enrollments as e', 'e.id', '=', 'academic_official_results.academic_enrollment_id')
            ->where('e.academic_year_id', $year->id)->distinct()->count('e.student_profile_id');
        $juries = AcademicDeliberation::whereHas('rule.version', fn ($query) => $query->where('academic_year_id', $year->id))
            ->groupBy('state')->selectRaw('state, COUNT(*) AS total')->pluck('total', 'state');

        return [
            'year_id' => $year->id,
            'students' => (clone $entries)->distinct()->count('student_profile_id'),
            'enrollments' => $statuses->sum(),
            'statuses' => (object) $statuses->all(),
            'faculties' => $this->faculties($year),
            'finance' => $this->finance->totalsForEnrollments($entries->select('academic_enrollments.id')->toBase()),
            'results' => [
                'students' => $published,
                'in_session' => (int) ($juries['prepared'] ?? 0) + (int) ($juries['open'] ?? 0),
                'awaiting_publication' => (int) ($juries['approved'] ?? 0),
                'published' => (int) ($juries['published'] ?? 0),
            ],
        ];
    }

    private function faculties(AcademicYear $year): array
    {
        $counts = DB::table('academic_enrollments as e')->join('levels as l', 'l.id', '=', 'e.level_id')
            ->where('e.academic_year_id', $year->id)->groupBy('l.faculty_id')
            ->selectRaw("l.faculty_id, COUNT(DISTINCT e.student_profile_id) AS students, COUNT(*) AS enrollments,
                SUM(CASE WHEN e.enrollment_status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed");

        return Faculty::leftJoinSub($counts, 'counts', 'counts.faculty_id', '=', 'faculties.id')
            ->where(fn ($query) => $query->where('faculties.is_active', true)->orWhereNotNull('counts.faculty_id'))
            ->orderByDesc(DB::raw('COALESCE(counts.students, 0)'))->orderBy('faculties.name')
            ->get(['faculties.name', 'faculties.code', 'counts.students', 'counts.enrollments', 'counts.confirmed'])
            ->map(fn ($row) => [
                'name' => $row->name, 'code' => $row->code,
                'students' => (int) $row->students, 'enrollments' => (int) $row->enrollments, 'confirmed' => (int) $row->confirmed,
            ])->all();
    }
}
