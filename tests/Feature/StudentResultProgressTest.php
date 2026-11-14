<?php

namespace Tests\Feature;

use App\Models\Courses;
use App\Models\Student\AcademicOffering;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class StudentResultProgressTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    public function test_progress_never_reveals_draft_scores_and_requires_all_published_assessments_for_a_course(): void
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $subject = new Courses;
        $subject->forceFill(['level_id' => $entry->level_id, 'title' => 'Introduction au droit', 'code' => 'DR01', 'credits' => 5, 'semester' => 1])->save();
        $offering = AcademicOffering::create(['level_id' => $entry->level_id, 'academic_year_id' => $entry->academic_year_id,
            'course_id' => $subject->id, 'semester' => 1, 'is_published' => true]);
        $createAssessment = function (string $name, bool $published) use ($offering, $entry) {
            $resource = $offering->resources()->create(['title' => $name, 'kind' => 'evaluation', 'is_published' => $published]);
            $assessment = $resource->assessment()->create(['category' => 'exam', 'session_code' => 'ordinaire',
                'modality' => 'in_person', 'maximum_points' => 2000, 'state' => $published ? 'closed' : 'draft', 'attempt_limit' => 1]);

            return $assessment->records()->create(['academic_enrollment_id' => $entry->id, 'points' => 1700, 'participation' => 'present',
                'correction_state' => 'draft', 'feedback' => 'Commentaire interne du professeur']);
        };
        $first = $createAssessment('Épreuve écrite', true);
        $second = $createAssessment('Oral', true);
        $createAssessment('Épreuve en brouillon', false);
        $first->update(['correction_state' => 'finalized']);
        $url = route('dashboard.student.index', ['section' => 'results', 'academic' => $entry->id]);
        $this->actingAs($student)->get($url)->assertInertia(fn (Assert $page) => $page
            ->where('official_results.selected', null)
            ->where('official_results.semesters.0.status', 'in_progress')
            ->where('official_results.semesters.0.passed', false)
            ->where('official_results.semesters.0.courses.0.name', $subject->title)
            ->where('official_results.semesters.0.courses.0.state', 'pending')
            ->missing('official_results.semesters.0.courses.0.points')
            ->missing('official_results.semesters.0.courses.0.feedback'));

        $second->update(['correction_state' => 'finalized']);
        $this->get($url)->assertInertia(fn (Assert $page) => $page
            ->where('official_results.selected', null)
            ->where('official_results.semesters.0.status', 'awaiting_publication')
            ->where('official_results.semesters.0.passed', false)
            ->where('official_results.semesters.0.courses.0.state', 'evaluated')
            ->where('official_results.semesters.1.status', 'in_progress'));
    }
}
