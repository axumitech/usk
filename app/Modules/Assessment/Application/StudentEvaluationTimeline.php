<?php

namespace App\Modules\Assessment\Application;

use App\Models\Student\AcademicAssessment;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicResource;
use App\Models\Student\AcademicSession;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

final class StudentEvaluationTimeline
{
    public const VIEWS = ['upcoming', 'past'];

    private const START = 'COALESCE(evaluation_session.session_start, academic_resources.opens_at)';

    private const END = 'COALESCE(evaluation_session.session_end, academic_resources.closes_at)';

    private const DEADLINE = 'COALESCE(evaluation_session.session_end, evaluation_assessment.accepts_until, academic_resources.closes_at)';

    public function __construct(private Carbon $now) {}

    public function query(Builder $resources): Builder
    {
        $assessments = AcademicAssessment::query()->select('academic_resource_id', 'state', 'modality', 'accepts_until', 'closed_at');
        $sessions = AcademicSession::query()->where('is_published', true)
            ->selectRaw('id as session_id, academic_offering_id as session_offering_id, starts_at as session_start, ends_at as session_end, cancelled_at as session_cancelled');

        return $resources->select('academic_resources.*')
            ->leftJoinSub($assessments, 'evaluation_assessment', 'evaluation_assessment.academic_resource_id', '=', 'academic_resources.id')
            ->leftJoinSub($sessions, 'evaluation_session', fn ($join) => $join
                ->on('evaluation_session.session_id', '=', 'academic_resources.academic_session_id')
                ->on('evaluation_session.session_offering_id', '=', 'academic_resources.academic_offering_id')
                ->where(fn ($scope) => $scope->whereNull('evaluation_assessment.modality')->orWhere('evaluation_assessment.modality', 'in_person')));
    }

    public function filter(Builder $query, string $view): Builder
    {
        return $query->whereRaw($this->status().($view === 'past' ? " IN ('past', 'cancelled')" : " NOT IN ('past', 'cancelled')"), $this->bindings());
    }

    public function sorted(Builder $query, string $view): Builder
    {
        if ($view === 'past') {
            return $query->orderByRaw('COALESCE(evaluation_session.session_cancelled, evaluation_assessment.closed_at, '.self::DEADLINE.', '.self::START.') DESC')
                ->orderByDesc('academic_resources.id');
        }

        return $query->orderByRaw("CASE ({$this->status()}) WHEN 'ongoing' THEN 0 WHEN 'unscheduled' THEN 2 ELSE 1 END", $this->bindings())
            ->orderByRaw('COALESCE('.self::START.', '.self::END.') ASC')->orderByDesc('academic_resources.id');
    }

    public function selectStatus(Builder $query): Builder
    {
        return $query->selectRaw($this->status().' as evaluation_status', $this->bindings());
    }

    public function legacyFilter(Builder $query, string $activity, AcademicEnrollment $entry, bool $canReadResults): void
    {
        $own = fn ($row) => $row->where('academic_enrollment_id', $entry->id);
        $attempt = fn ($row) => $own($row)->whereIn('participation', ['submitted', 'late_submission']);
        $released = fn ($row) => $own($row)->whereNotNull('released_at');

        match ($activity) {
            'upcoming' => $query->where('opens_at', '>', $this->now),
            'available' => $query->where(fn ($q) => $q->whereNull('opens_at')->orWhere('opens_at', '<=', $this->now))
                ->where(fn ($q) => $q->where(fn ($legacy) => $legacy->whereDoesntHave('assessment')
                    ->where(fn ($period) => $period->whereNull('closes_at')->orWhere('closes_at', '>=', $this->now)))
                    ->orWhereHas('assessment', fn ($item) => $item->where('state', 'published')->where('modality', 'submission')
                        ->where('accepts_until', '>=', $this->now)->where(fn ($group) => $group->where('group_work', false)
                        ->orWhereHas('records.group', fn ($membership) => $membership->where('leader_enrollment_id', $entry->id)))))
                ->whereDoesntHave('assessment.records', $attempt)->whereDoesntHave('submissions', $own),
            'submitted' => $query->where(fn ($q) => $q->whereHas('assessment.records', $attempt)->orWhereHas('submissions', $own)),
            'grading' => $query->whereHas('assessment', fn ($q) => $q->where('state', 'closed')->whereDoesntHave('records', $released)),
            'corrected' => $canReadResults ? $query->whereHas('assessment.records', $released) : $query->whereRaw('1 = 0'),
        };
    }

    public function presentation(AcademicResource $resource, ?array $assessment, bool $allowed): array
    {
        $session = $resource->session;
        if (! $session?->is_published || $session->academic_offering_id !== $resource->academic_offering_id
            || ($resource->assessment !== null && $resource->assessment->modality !== 'in_person')) {
            $session = null;
        }
        $room = $session ? implode(' · ', array_unique(array_filter([$session->registeredRoom?->building, $session->room ?: $session->registeredRoom?->name]))) : null;

        return [
            'status' => $resource->evaluation_status,
            'starts_at' => $session?->starts_at ?? $resource->opens_at,
            'ends_at' => $session?->ends_at ?? $resource->closes_at,
            'teacher' => $resource->offering->professor?->full_name ?? $resource->offering->course->teacher,
            'room' => $allowed && filled($room) ? $room : null,
            'can_submit' => $assessment['can_submit'] ?? ($allowed && $resource->assessment === null && ! $resource->offering->archived_at
                && ! $resource->opens_at?->gt($this->now) && ! $resource->closes_at?->lt($this->now)
                && $resource->evaluation_status !== 'cancelled'),
            'filename' => $allowed ? $resource->filename : null,
            'size_bytes' => $allowed && $resource->size_bytes !== null ? (int) $resource->size_bytes : null,
        ];
    }

    private function status(): string
    {
        return 'CASE
            WHEN evaluation_session.session_cancelled IS NOT NULL OR evaluation_assessment.state = \'cancelled\' THEN \'cancelled\'
            WHEN evaluation_assessment.state = \'closed\' OR '.self::DEADLINE.' < ? THEN \'past\'
            WHEN '.self::START.' > ? THEN \'upcoming\'
            WHEN '.self::START.' IS NOT NULL THEN \'ongoing\'
            WHEN '.self::END.' IS NOT NULL THEN \'upcoming\'
            ELSE \'unscheduled\' END';
    }

    private function bindings(): array
    {
        return [$this->now, $this->now];
    }
}
