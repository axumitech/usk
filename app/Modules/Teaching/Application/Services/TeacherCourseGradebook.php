<?php

namespace App\Modules\Teaching\Application\Services;

use App\Models\Student\AcademicAssessment;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicOffering;
use App\Models\Student\AssessmentRecord;
use Illuminate\Database\Eloquent\Builder;

final class TeacherCourseGradebook
{
    public function __construct(private CourseAudience $audience) {}

    public function read(AcademicOffering $offering, array $period, bool $canSeeStudents): array
    {
        $courseAssessments = AcademicAssessment::whereHas('resource', fn (Builder $resource) => $resource
            ->where('academic_offering_id', $offering->id)->whereNull('student_profile_id')->whereIn('kind', ['assignment', 'evaluation']));
        $assessments = (clone $courseAssessments)->with('resource:id,title')->latest('id')
            ->paginate(6, ['id', 'academic_resource_id', 'category', 'maximum_points', 'state'], 'grades_assessments_page')->withQueryString();

        $roster = $this->audience->roster($offering)->select('academic_enrollments.id');
        $recorded = AssessmentRecord::whereIn('academic_assessment_id', $courseAssessments->select('id'))->select('academic_enrollment_id');
        $history = $this->audience->annualContext($offering, includeLinkedRetakes: true)->whereIn('id', $recorded)
            ->when($offering->curriculum_item_id,
                fn (Builder $query) => $query->whereHas('courseRegistrations', fn (Builder $registrations) => $registrations->where('academic_offering_id', $offering->id)),
                fn (Builder $query) => $query->when($offering->class_id, fn (Builder $entries, int $group) => $entries->where('class_id', $group))
                    ->when($offering->academic_department_id, fn (Builder $entries, int $department) => $entries->where('academic_department_id', $department)))
            ->select('academic_enrollments.id');
        $students = AcademicEnrollment::where(fn (Builder $entries) => $entries->whereIn('id', $history)
            ->when($canSeeStudents, fn (Builder $query) => $query->orWhereIn('id', $roster)))
            ->with(['profile.user', 'group.intake:id,name'])->orderBy('matricule')->orderBy('id')
            ->paginate(20, ['*'], 'grades_students_page')->withQueryString();

        $columns = $assessments->getCollection()->keyBy('id');
        $records = AssessmentRecord::whereIn('academic_assessment_id', $columns->keys())
            ->whereIn('academic_enrollment_id', $students->getCollection()->modelKeys())
            ->get(['id', 'academic_assessment_id', 'academic_enrollment_id', 'points', 'participation', 'correction_state', 'corrected_by', 'released_at'])
            ->groupBy('academic_enrollment_id');
        $context = array_filter([
            'offering' => $offering->id,
            'from_gradebook' => 1,
            'gradebook_semester' => $period['semester'] ?? 'all',
            'grades_students_page' => $students->currentPage() > 1 ? $students->currentPage() : null,
            'grades_assessments_page' => $assessments->currentPage() > 1 ? $assessments->currentPage() : null,
        ], fn ($value) => $value !== null);
        $categories = config('assessment.categories');

        return [
            'assessments' => $assessments->through(fn (AcademicAssessment $assessment) => [
                'id' => $assessment->id, 'resource_id' => $assessment->academic_resource_id,
                'title' => $assessment->resource->title, 'category_label' => $categories[$assessment->category] ?? $assessment->category,
                'maximum_points' => $assessment->maximum_points, 'state' => $assessment->state,
                'url' => route('dashboard.teaching.assessments.index', ['resource' => $assessment->academic_resource_id] + $context, false).'#assessment-participants',
            ]),
            'students' => $students->through(fn (AcademicEnrollment $entry) => CourseAudience::studentRow($entry) + [
                'group' => CourseAudience::groupLabel($entry->group),
                'grades' => (object) $records->get($entry->id, collect())->mapWithKeys(fn (AssessmentRecord $record) => [$record->academic_assessment_id => [
                    'points' => in_array($record->participation, AssessmentRecord::SCORED, true) ? $record->points : null,
                    'participation' => $record->participation, 'correction_state' => $record->correction_state,
                    'has_correction' => $record->corrected_by !== null,
                    'released_at' => $record->released_at?->toISOString(),
                    'url' => route('dashboard.teaching.assessments.index', [
                        'resource' => $columns[$record->academic_assessment_id]->academic_resource_id, 'record' => $record->id,
                    ] + $context, false).'#assessment-correction',
                ]])->all(),
            ]),
        ];
    }
}
