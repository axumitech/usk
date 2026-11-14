<?php

namespace App\Modules\Assessment\Application;

use App\Models\Classes;
use App\Models\Student\AcademicAssessment;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AssessmentGroup;
use App\Modules\Teaching\Application\Services\CourseAudience;
use App\Modules\Teaching\Application\Services\TeacherCourseRosterSearch;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class AssessmentParticipantFilters
{
    public const GROUP_RULE = 'regex:/\A(?:(?:work|class):[1-9][0-9]{0,18}|unassigned)\z/';

    public function records(AcademicAssessment $assessment, array $filters): HasMany
    {
        $search = trim($filters['participant_q'] ?? '');
        $group = $filters['participant_group'] ?? '';

        return $assessment->records()
            ->with(['group', 'enrollment.profile.user', 'enrollment.group.intake'])
            ->when($filters['correction'] ?? null, fn ($query, string $state) => $query->where('correction_state', $state))
            ->when($filters['participation'] ?? null, fn ($query, string $state) => $query->where('participation', $state))
            ->when($search !== '', fn ($query) => $query->whereHas('enrollment', fn (Builder $enrollment) => TeacherCourseRosterSearch::apply($enrollment, $search)))
            ->when(str_starts_with($group, 'work:'), fn ($query) => $query->whereHas('group', fn (Builder $work) => $work
                ->whereKey(substr($group, 5))->where('academic_assessment_id', $assessment->id)))
            ->when(str_starts_with($group, 'class:'), fn ($query) => $query->whereHas('enrollment', fn (Builder $entry) => $entry->where('class_id', substr($group, 6))))
            ->when($group === 'unassigned', fn ($query) => $query->whereHas('enrollment', fn (Builder $entry) => $entry->whereNull('class_id')));
    }

    public function groups(AcademicAssessment $assessment): array
    {
        $workGroupIds = $assessment->records()->whereNotNull('academic_assessment_group_id')->select('academic_assessment_group_id');
        $workGroups = $assessment->groups()->whereIn('id', $workGroupIds)->orderBy('label')->orderBy('id')->get(['id', 'label'])
            ->map(fn (AssessmentGroup $group) => ['value' => 'work:'.$group->id, 'label' => $group->label, 'kind' => 'work']);

        $classIds = AcademicEnrollment::whereIn('id', $assessment->records()->select('academic_enrollment_id'))->distinct()->pluck('class_id');
        $classes = Classes::with('intake:id,name')->whereIn('id', $classIds->filter())->get();
        $labels = $classes->mapWithKeys(fn (Classes $group) => [$group->id => CourseAudience::groupLabel($group)]);
        $frequencies = $labels->countBy();
        $classGroups = $labels->map(fn (string $label, int $id) => [
            'value' => 'class:'.$id,
            'label' => $frequencies[$label] > 1 ? "$label · Groupe #$id" : $label,
            'kind' => 'class',
        ])->sortBy('label')->values();

        if ($classGroups->isNotEmpty() && $classIds->containsStrict(null)) {
            $classGroups->push(['value' => 'unassigned', 'label' => 'Sans groupe pédagogique', 'kind' => 'unassigned']);
        }

        return $workGroups->toBase()->concat($classGroups)->all();
    }
}
