<?php

namespace App\Modules\Assessment\Application;

use App\Models\Student\AcademicEnrollment;
use Illuminate\Database\Eloquent\Builder;

final class StudentAssignmentStatus
{
    public const FILTERS = ['available', 'upcoming', 'submitted', 'grading', 'corrected'];

    public function __construct(private AcademicEnrollment $entry, private bool $canSubmit, private bool $canReadResults) {}

    public function counts(Builder $resources): array
    {
        $counts = ['all' => (clone $resources)->count()];
        foreach (self::FILTERS as $filter) {
            $counts[$filter] = $this->filter(clone $resources, $filter)->count();
        }

        return $counts;
    }

    public function filter(Builder $query, ?string $filter): Builder
    {
        $record = fn (Builder $row) => $row->where('academic_enrollment_id', $this->entry->id);
        $released = fn (Builder $row) => $record($row)->whereNotNull('released_at');
        $submitted = fn (Builder $row) => $record($row)->whereIn('participation', ['submitted', 'late_submission']);
        $closed = fn (Builder $assessment) => $assessment->where('state', 'closed');
        $cancelled = fn (Builder $session) => $session->whereNotNull('cancelled_at');

        return match ($filter) {
            'corrected' => $this->canReadResults ? $query->whereHas('assessment.records', $released) : $query->whereRaw('1 = 0'),
            'grading' => $query->whereHas('assessment', $closed)
                ->when($this->canReadResults, fn ($q) => $q->whereDoesntHave('assessment.records', $released)),
            'submitted' => $query->whereDoesntHave('assessment', $closed)->whereDoesntHave('session', $cancelled)
                ->when($this->canReadResults, fn ($q) => $q->whereDoesntHave('assessment.records', $released))
                ->where(fn ($q) => $q->whereHas('assessment.records', $submitted)->orWhereHas('submissions', $record)),
            'upcoming', 'available' => $this->withoutSubmission($query, $record, $submitted, $released)
                ->whereDoesntHave('assessment', $closed)->whereDoesntHave('session', $cancelled)
                ->when($filter === 'upcoming', fn ($q) => $q->where('opens_at', '>', now()), fn ($q) => $this->available($q)),
            default => $query,
        };
    }

    private function withoutSubmission(Builder $query, \Closure $record, \Closure $submitted, \Closure $released): Builder
    {
        return $query->whereDoesntHave('assessment.records', $submitted)->whereDoesntHave('submissions', $record)
            ->when($this->canReadResults, fn ($q) => $q->whereDoesntHave('assessment.records', $released));
    }

    private function available(Builder $query): Builder
    {
        if (! $this->canSubmit) {
            return $query->whereRaw('1 = 0');
        }

        return $query->where(fn ($q) => $q->whereNull('opens_at')->orWhere('opens_at', '<=', now()))
            ->where(function ($q) {
                $q->where(fn ($legacy) => $legacy->whereDoesntHave('assessment')
                    ->where(fn ($period) => $period->whereNull('closes_at')->orWhere('closes_at', '>=', now())))
                    ->orWhereHas('assessment', fn ($assessment) => $assessment->where('state', 'published')->where('modality', 'submission')
                        ->where(fn ($deadline) => $deadline->where('accepts_until', '>=', now())
                            ->orWhere(fn ($fallback) => $fallback->whereNull('accepts_until')->whereHas('resource', fn ($resource) => $resource
                                ->where(fn ($period) => $period->whereNull('closes_at')->orWhere('closes_at', '>=', now())))))
                        ->whereDoesntHave('records', fn ($row) => $row->where('academic_enrollment_id', $this->entry->id)
                            ->whereIn('participation', ['exempt', 'invalidated']))
                        ->where(fn ($group) => $group->where('group_work', false)
                            ->orWhereHas('records', fn ($membership) => $membership->where('academic_enrollment_id', $this->entry->id)->whereHas('group'))));
            });
    }
}
