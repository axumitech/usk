<?php

namespace App\Modules\Student\Application\Services;

use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicResource;
use App\Modules\Teaching\Application\Services\LearningAccess;
use App\Modules\Teaching\Application\Services\LearningFiles;
use App\Modules\Teaching\Application\Services\TeachingTeam;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

final class StudentMaterials
{
    public const FILTERS = [
        'all' => 'Tous', 'course' => 'Cours', 'practical' => 'TD / TP', 'exams' => 'Examens', 'saved' => 'Enregistrés',
    ];

    private const DATE = 'COALESCE(academic_resources.published_at, academic_resources.created_at)';

    private const CATEGORY = "CASE
        WHEN library_assessment.category = 'exam' OR LOWER(TRIM(library_session.activity_type)) IN ('examen', 'examens', 'exam', 'rattrapage', 'rattrapages', 'épreuve') THEN 'exams'
        WHEN library_assessment.category IN ('tutorial', 'practical') OR LOWER(TRIM(library_session.activity_type)) IN ('td', 'tp', 'td/tp', 'travaux dirigés', 'travaux pratiques', 'atelier') THEN 'practical'
        ELSE 'course' END";

    public function __construct(private AcademicAccessService $access) {}

    public function has(AcademicEnrollment $entry, array $permissions, int $resource): bool
    {
        return $this->query($entry, $permissions)->whereKey($resource)->exists();
    }

    public function read(AcademicEnrollment $entry, array $permissions, string $filter, array $saved, ?int $resource, int $pageNumber): array
    {
        $query = $this->query($entry, $permissions);
        $recentSince = now()->subDays(7);
        $index = $this->indexUrl($entry, $filter, $saved, $pageNumber);
        $ordered = (clone $query)->select('academic_resources.*')->selectRaw(self::CATEGORY.' AS library_category')
            ->with(['authorProfessor', 'offering.course', 'offering.professor', 'offering.assignments.professor', 'offering.curriculumItem.unit'])
            ->orderByRaw(self::DATE.' DESC')->orderByDesc('academic_resources.id');
        $detailParams = $this->parameters($entry, $filter, $saved, $pageNumber);
        $present = fn (AcademicResource $row, bool $detail = false) => $this->present($entry, $row, $permissions, $detailParams, $recentSince, $detail);
        $selected = $resource === null ? null : (clone $ordered)->findOrFail($resource);
        $categoryCounts = (clone $query)->selectRaw(self::CATEGORY.' AS library_category, COUNT(*) AS aggregate')
            ->groupByRaw(self::CATEGORY)->pluck('aggregate', 'library_category');
        $total = (int) $categoryCounts->sum();
        $savedCount = $filter === 'saved' && $saved !== [] ? (clone $query)->whereKey($saved)->count() : 0;
        $counts = ['all' => $total, 'saved' => $savedCount] + $categoryCounts->all();

        $page = null;
        if ($selected === null) {
            $page = $ordered
                ->when($filter === 'saved', fn ($rows) => $rows->whereKey($saved))
                ->when(in_array($filter, ['course', 'practical', 'exams'], true), fn ($rows) => $rows->whereRaw(self::CATEGORY.' = ?', [$filter]))
                ->paginate(18, ['*'], 'materials_page')->appends($this->parameters($entry, $filter, $saved))->through(fn (AcademicResource $row) => $present($row));
        }

        return [
            'academic_id' => $entry->id, 'year' => $entry->academicYear->title, 'level' => $entry->level->title,
            'filter' => $filter, 'index_url' => $index,
            'stats' => [
                'total' => $total,
                'courses' => (clone $query)->distinct()->count('library_offering.course_id'),
                'recent' => (clone $query)->whereRaw(self::DATE.' >= ?', [$recentSince])->count(),
            ],
            'filters' => collect(self::FILTERS)->when($filter !== 'saved', fn ($list) => $list->except('saved'))
                ->map(fn ($label, $key) => ['key' => $key, 'label' => $label, 'count' => (int) ($counts[$key] ?? 0), 'url' => $this->indexUrl($entry, $key, $saved)])
                ->values(),
            'items' => $page ? ['data' => $page->items(), 'links' => $page->linkCollection(), 'total' => $page->total()] : ['data' => [], 'links' => [], 'total' => 0],
            'selected' => $selected ? $present($selected, true) : null,
            'related' => $selected ? (clone $ordered)->where('library_offering.course_id', $selected->offering->course_id)
                ->whereKeyNot($selected->id)->limit(3)->get()->map(fn (AcademicResource $row) => $present($row)) : [],
        ];
    }

    private function query(AcademicEnrollment $entry, array $permissions): Builder
    {
        $offerings = $this->access->offerings($entry)->select('academic_offerings.id', 'academic_offerings.course_id');
        $sessions = $this->access->sessions($entry)->select('academic_sessions.id', 'academic_sessions.academic_offering_id', 'academic_sessions.activity_type');
        $assessments = DB::table('academic_assessments')->select('academic_resource_id', 'category');

        return AcademicResource::visible()->forStudent($entry)->forLearningPermissions($permissions)
            ->whereIn('academic_resources.kind', AcademicResource::CONTENT_KINDS)
            ->where(fn ($rows) => $rows->whereNull('academic_resources.opens_at')->orWhere('academic_resources.opens_at', '<=', now()))
            ->whereDoesntHave('supplementaryFor', fn ($parent) => $parent->where('opens_at', '>', now()))
            ->joinSub($offerings, 'library_offering', 'library_offering.id', '=', 'academic_resources.academic_offering_id')
            ->leftJoinSub($assessments, 'library_assessment', 'library_assessment.academic_resource_id', '=', 'academic_resources.supplementary_for_id')
            ->leftJoinSub($sessions, 'library_session', fn ($join) => $join->on('library_session.id', '=', 'academic_resources.academic_session_id')
                ->on('library_session.academic_offering_id', '=', 'academic_resources.academic_offering_id'));
    }

    private function present(AcademicEnrollment $entry, AcademicResource $resource, array $permissions, array $detailParams, Carbon $recentSince, bool $detail): array
    {
        $decision = $permissions[LearningAccess::fileFeature($resource)];
        $allowed = $decision['allowed'];
        $date = $resource->published_at ?? $resource->created_at;
        $offering = $resource->offering;
        $course = $offering->course;
        $hasFile = $allowed && filled($resource->path);
        $params = ['academic' => $entry->id, 'resource' => $resource->id];
        $format = $hasFile ? $this->format($resource->filename, $resource->mime) : null;
        $downloadable = $hasFile && (in_array($resource->disk, ['local', 'private'], true)
            || ($resource->disk === 's3' && config('learning-content.direct_s3_downloads')));
        $source = $allowed && $resource->url && filter_var($resource->url, FILTER_VALIDATE_URL) && preg_match('#^https?://#i', $resource->url)
            ? $resource->url : null;

        return [
            'id' => $resource->id, 'title' => $resource->title,
            'course' => $this->access->reference($entry, $course, $offering->curriculumItem)['title'],
            'teacher' => $resource->authorProfessor?->full_name
                ?? ($date ? TeachingTeam::leadNameAt($offering, $date) : $offering->professor?->full_name) ?? $course->teacher,
            'category' => $resource->library_category, 'category_label' => self::FILTERS[$resource->library_category],
            'date' => $date?->toIso8601String(), 'recent' => $date?->gte($recentSince) ?? false,
            'kind' => $resource->kind, 'format' => $format, 'filename' => $hasFile ? $resource->filename : null,
            'mime' => $hasFile ? $resource->mime : null, 'size_bytes' => $hasFile && $resource->size_bytes !== null ? (int) $resource->size_bytes : null,
            'description' => $detail && $allowed ? $resource->body : null, 'source_url' => $source,
            'preview_url' => $hasFile && LearningFiles::previewable($resource->disk, $resource->mime)
                ? route('dashboard.student.resources.preview', $params, false) : null,
            'download_url' => $downloadable ? route('dashboard.student.resources.download', $params, false) : null,
            'detail_url' => route('dashboard.student.materials.show', ['resource' => $resource->id] + $detailParams, false),
            'share_url' => route('dashboard.student.materials.show', ['resource' => $resource->id], false),
            'unavailable_reason' => $allowed ? null : $decision['reason'],
        ];
    }

    private function format(?string $filename, ?string $mime): ?string
    {
        $extension = strtolower(pathinfo($filename ?? '', PATHINFO_EXTENSION));

        return match ($mime) {
            'application/pdf' => 'PDF',
            'image/jpeg' => 'JPG',
            default => preg_match('/^[a-z0-9]{1,8}$/D', $extension) ? strtoupper($extension) : null,
        };
    }

    private function parameters(AcademicEnrollment $entry, string $filter, array $saved, int $pageNumber = 1): array
    {
        $params = ['academic' => $entry->id];
        if ($filter !== 'all') {
            $params['filter'] = $filter;
        }
        if ($filter === 'saved' && $saved !== []) {
            $params['saved'] = implode(',', $saved);
        }
        if ($pageNumber > 1) {
            $params['materials_page'] = $pageNumber;
        }

        return $params;
    }

    private function indexUrl(AcademicEnrollment $entry, string $filter, array $saved, int $pageNumber = 1): string
    {
        return route('dashboard.student.materials.index', $this->parameters($entry, $filter, $saved, $pageNumber), false);
    }
}
