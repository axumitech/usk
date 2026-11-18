<?php

namespace App\Modules\Student\Application\Services;

use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicResource;
use App\Modules\Teaching\Application\Services\LearningFiles;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

final class StudentAnnouncements
{
    public const FILTERS = [
        'all' => 'Toutes', 'photo' => 'Photos', 'video' => 'Vidéos', 'document' => 'Documents', 'saved' => 'Enregistrées',
    ];

    private const DATE = 'COALESCE(published_at, created_at)';

    private const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

    private const VIDEO_MIMES = ['video/mp4', 'video/webm'];

    private const KIND = "CASE
        WHEN path IS NOT NULL AND path <> '' THEN CASE
            WHEN mime IN ('image/jpeg', 'image/png', 'image/webp') THEN 'photo'
            WHEN mime IN ('video/mp4', 'video/webm') THEN 'video'
            ELSE 'document' END
        WHEN LOWER(url) LIKE 'https://youtu.be/%' OR LOWER(url) LIKE 'https://youtube.com/%'
            OR LOWER(url) LIKE 'https://www.youtube.com/%' OR LOWER(url) LIKE 'https://m.youtube.com/%'
            OR LOWER(url) LIKE 'https://vimeo.com/%' OR LOWER(url) LIKE 'https://www.vimeo.com/%'
            OR LOWER(url) LIKE 'https://player.vimeo.com/video/%' THEN 'video'
        ELSE 'text' END";

    public function __construct(private AcademicAccessService $access) {}

    public static function previewable(AcademicResource $resource): bool
    {
        return in_array($resource->mime, [...self::IMAGE_MIMES, ...self::VIDEO_MIMES, 'application/pdf'], true)
            && LearningFiles::previewable($resource->disk, $resource->mime);
    }

    public function query(AcademicEnrollment $entry, array $permissions): Builder
    {
        $now = now()->startOfSecond();

        return AcademicResource::visible()->forStudent($entry)->forLearningPermissions($permissions)->where('kind', 'announcement')
            ->where(fn ($query) => $query->whereNull('published_at')->orWhere('published_at', '<=', $now))
            ->where(fn ($query) => $query->whereNull('opens_at')->orWhere('opens_at', '<=', $now))
            ->where(fn ($query) => $query->whereNull('closes_at')->orWhere('closes_at', '>=', $now))
            ->whereIn('academic_offering_id', $this->access->offerings($entry)->select('academic_offerings.id'));
    }

    public static function withinPublicationWindow(AcademicResource $resource): bool
    {
        // Eloquent persists these dates and binds SQL comparisons at second precision.
        $now = now()->startOfSecond();

        return ! $resource->published_at?->gt($now) && ! $resource->opens_at?->gt($now) && ! $resource->closes_at?->lt($now);
    }

    public function overview(AcademicEnrollment $entry, array $permissions): array
    {
        $recentSince = now()->subDays(7);
        $parameters = $this->parameters($entry, 'all', []);

        return $this->ordered($this->query($entry, $permissions))->limit(4)->get()
            ->map(fn (AcademicResource $row) => $this->present($entry, $row, $parameters, $recentSince))
            ->all();
    }

    public function read(AcademicEnrollment $entry, array $permissions, string $filter, array $saved, ?int $announcement, int $pageNumber): array
    {
        $query = $this->query($entry, $permissions);
        $recentSince = now()->subDays(7);
        $ordered = $this->ordered($query);
        $selected = $announcement === null ? null : (clone $ordered)->findOrFail($announcement);
        $parameters = $this->parameters($entry, $filter, $saved, $pageNumber);
        $present = fn (AcademicResource $row, bool $detail = false) => $this->present($entry, $row, $parameters, $recentSince, $detail);
        $page = null;
        $featured = null;
        $related = [];

        if ($selected === null) {
            $page = $ordered
                ->when($filter === 'saved', fn ($rows) => $rows->whereKey($saved))
                ->when(in_array($filter, ['photo', 'video', 'document'], true), fn ($rows) => $rows->whereRaw(self::KIND.' = ?', [$filter]))
                ->paginate(15, ['*'], 'announcements_page')->appends($this->parameters($entry, $filter, $saved))
                ->through(fn (AcademicResource $row) => $present($row));
            $featured = $filter === 'all' && $pageNumber === 1 ? ($page->items()[0] ?? null) : null;
        } else {
            $related = $ordered->where('academic_offering_id', $selected->academic_offering_id)
                ->whereKeyNot($selected->id)->limit(3)->get()->map(fn (AcademicResource $row) => $present($row));
        }

        $kindCounts = (clone $query)->selectRaw(self::KIND.' AS announcement_kind, COUNT(*) AS aggregate')
            ->groupByRaw(self::KIND)->pluck('aggregate', 'announcement_kind');
        $total = (int) $kindCounts->sum();
        $counts = [
            'all' => $total,
            'saved' => $saved === [] ? 0 : (clone $query)->whereKey($saved)->count(),
        ] + $kindCounts->all();

        return [
            'academic_id' => $entry->id, 'year' => $entry->academicYear->title, 'faculty' => $entry->level->faculty->name,
            'filter' => $filter, 'index_url' => $this->url($parameters),
            'stats' => [
                'total' => $total, 'recent' => $query->whereRaw(self::DATE.' >= ?', [$recentSince])->count(),
                'media' => $total - (int) ($kindCounts['text'] ?? 0),
            ],
            'filters' => collect(self::FILTERS)->map(fn ($label, $key) => [
                'key' => $key, 'label' => $label, 'count' => (int) ($counts[$key] ?? 0),
                'url' => $this->url($this->parameters($entry, $key, $saved)),
            ])->values(),
            'items' => $page ? ['data' => $page->items(), 'links' => $page->linkCollection(), 'total' => $page->total()] : ['data' => [], 'links' => [], 'total' => 0],
            'featured' => $featured, 'selected' => $selected ? $present($selected, true) : null, 'related' => $related,
        ];
    }

    private function ordered(Builder $query): Builder
    {
        return (clone $query)->select('academic_resources.*')->selectRaw(self::KIND.' AS announcement_kind')
            ->with('offering.course', 'offering.curriculumItem.unit', 'offering.level.faculty')
            ->orderByRaw(self::DATE.' DESC')->orderByDesc('id');
    }

    private function present(AcademicEnrollment $entry, AcademicResource $resource, array $parameters, Carbon $recentSince, bool $detail = false): array
    {
        $date = $resource->published_at ?? $resource->created_at;
        $offering = $resource->offering;
        $hasFile = filled($resource->path);
        $file = ['resource' => $resource->id, 'academic' => $entry->id];
        $extension = strtolower(pathinfo($resource->filename ?? '', PATHINFO_EXTENSION));
        $source = $resource->url && filter_var($resource->url, FILTER_VALIDATE_URL) && preg_match('#^https?://#i', $resource->url)
            ? $resource->url : null;

        return [
            'id' => $resource->id, 'title' => $resource->title, 'kind' => $resource->announcement_kind,
            'course' => $this->access->reference($entry, $offering->course, $offering->curriculumItem)['title'],
            'faculty' => $offering->level->faculty->name,
            'date' => $date?->toIso8601String(), 'recent' => $date?->gte($recentSince) ?? false,
            'updated_at' => $resource->updated_at, 'opens_at' => $resource->opens_at, 'closes_at' => $resource->closes_at,
            'excerpt' => Str::limit(Str::squish(strip_tags($resource->body ?? '')), 180),
            'description' => $detail ? $resource->body : null,
            'filename' => $hasFile ? $resource->filename : null, 'mime' => $hasFile ? $resource->mime : null,
            'format' => $hasFile && preg_match('/^[a-z0-9]{1,8}$/D', $extension) ? strtoupper($extension) : null,
            'size_bytes' => $hasFile && $resource->size_bytes !== null ? (int) $resource->size_bytes : null,
            'preview_url' => $hasFile && self::previewable($resource)
                ? route('dashboard.student.resources.preview', $file, false) : null,
            'download_url' => $hasFile && (in_array($resource->disk, ['local', 'private'], true)
                || ($resource->disk === 's3' && config('learning-content.direct_s3_downloads')))
                ? route('dashboard.student.resources.download', $file, false) : null,
            'source_url' => $source,
            'detail_url' => $this->url($parameters + ['announcement' => $resource->id]),
            'share_url' => $this->url(['announcement' => $resource->id]),
        ];
    }

    private function parameters(AcademicEnrollment $entry, string $filter, array $saved, int $pageNumber = 1): array
    {
        return array_filter([
            'academic' => $entry->id,
            'filter' => $filter === 'all' ? null : $filter,
            'saved' => $filter === 'saved' && $saved !== [] ? implode(',', $saved) : null,
            'announcements_page' => $pageNumber > 1 ? $pageNumber : null,
        ]);
    }

    private function url(array $parameters): string
    {
        return route('dashboard.student.announcements', $parameters, false);
    }
}
