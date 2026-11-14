<?php

namespace Tests\Feature;

use App\Models\AcademicStructure\AcademicCycle;
use App\Models\AcademicStructure\AcademicProgram;
use App\Models\AcademicStructure\CurriculumVersion;
use App\Models\AcademicStructure\University;
use App\Models\AcademicYear;
use App\Models\Level;
use App\Models\Student\AcademicDeliberation;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicOfficialResult;
use App\Models\Student\AcademicProgression;
use App\Models\Student\AcademicResultRule;
use App\Models\Student\AccessRule;
use App\Models\Student\StudentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Role;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class StudentPathwayTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    public function test_map_uses_program_order_and_preserves_each_year_including_repeated_levels(): void
    {
        $student = $this->studentContext();
        $first = $student->studentProfile->enrollments()->sole();
        $first->academicYear->update(['status' => 'closed']);
        $first->update(['enrollment_status' => 'completed']);
        $secondLevel = $this->level($first, 'Deuxième niveau', 'T2');
        $thirdLevel = $this->level($first, 'Troisième niveau', 'T3');
        $repeat = $this->enroll($first, $first->level, '2027-2028', 'completed');
        $current = $this->enroll($first, $secondLevel, '2028-2029', 'confirmed');
        $program = $this->program($first);
        $program->levels()->attach([$thirdLevel->id => ['position' => 3], $first->level_id => ['position' => 1], $secondLevel->id => ['position' => 2]]);
        $alternate = $program->replicate()->fill(['code' => 'SECOND', 'name' => 'Autre programme']);
        $alternate->save();
        $alternate->levels()->attach($first->level_id, ['position' => 1]);
        $first->application->update(['form_snapshot' => ['academic_program_id' => (string) $program->id]]);
        AcademicProgression::create(['source_enrollment_id' => $first->id, 'target_enrollment_id' => $repeat->id, 'level_id' => $repeat->level_id,
            'academic_year_id' => $repeat->academic_year_id, 'decided_by' => $student->id, 'reason' => 'Décision antérieure', 'kind' => 'repeat']);

        $this->actingAs($student)->get(route('dashboard.student.pathway', ['academic' => $first->id]))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('dashboard/student/Pathway')
                ->where('pathway.academic_id', $first->id)
                ->where('pathway.current.id', $current->id)
                ->where('pathway.counts.years', 3)->where('pathway.counts.levels', 2)->where('pathway.counts.validated', 0)
                ->has('pathway.programs', 1)
                ->where('pathway.programs.0.title', $program->name)
                ->has('pathway.programs.0.levels', 3)
                ->where('pathway.programs.0.levels.0.state', 'attended')
                ->where('pathway.programs.0.levels.0.attempts.0.selected', true)
                ->where('pathway.programs.0.levels.0.attempts.0.transition.label', 'Redoublement')
                ->where('pathway.programs.0.levels.0.attempts.1.id', $repeat->id)
                ->where('pathway.programs.0.levels.1.state', 'current')
                ->where('pathway.programs.0.levels.2.state', 'planned')
                ->has('pathway.programs.0.levels.2.attempts', 0));

        $other = User::factory()->create()->assignRole(Role::findOrCreate('student', 'web'));
        StudentProfile::create(['user_id' => $other->id]);
        $this->actingAs($other)->get(route('dashboard.student.pathway', ['academic' => $first->id]))->assertNotFound();
        $this->actingAs(User::factory()->create())->get(route('dashboard.student.pathway'))->assertForbidden();
    }

    public function test_only_published_complete_results_with_student_access_can_mark_a_level_validated(): void
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $entry->update(['enrollment_status' => 'completed']);
        $program = $this->program($entry);
        $program->levels()->attach($entry->level_id, ['position' => 1]);
        $result = $this->publishResult($entry, $program, $student);
        $url = route('dashboard.student.pathway', ['academic' => $entry->id]);

        $this->actingAs($student)->get($url)->assertInertia(fn (Assert $page) => $page
            ->where('pathway.counts.validated', 1)
            ->where('pathway.programs.0.levels.0.state', 'passed')
            ->where('pathway.programs.0.levels.0.attempts.0.result.url', route('dashboard.student.index', [
                'section' => 'results', 'academic' => $entry->id, 'official' => $result->reference,
            ], false)));

        AccessRule::create(['academic_year_id' => $entry->academic_year_id, 'level_id' => $entry->level_id, 'feature' => 'results_view', 'mode' => 'hidden']);
        $this->get($url)->assertInertia(fn (Assert $page) => $page
            ->where('pathway.counts.validated', 0)
            ->where('pathway.programs.0.levels.0.state', 'attended')
            ->where('pathway.programs.0.levels.0.attempts.0.result', null));
    }

    private function program(AcademicEnrollment $entry): AcademicProgram
    {
        $university = University::create(['context_key' => 'current', 'name' => 'Université de test', 'code' => 'TEST-UNI']);
        $entry->level->faculty->forceFill(['university_id' => $university->id])->save();
        $cycle = AcademicCycle::create(['university_id' => $university->id, 'code' => 'CYCLE', 'name' => 'Licence', 'normal_duration' => 3,
            'progression_mode' => 'custom', 'weighting_mode' => 'credits', 'periods' => [['code' => 'P', 'name' => 'Période']]]);

        return AcademicProgram::create(['faculty_id' => $entry->level->faculty_id, 'academic_cycle_id' => $cycle->id, 'code' => 'PROGRAMME', 'name' => 'Programme de test']);
    }

    private function level(AcademicEnrollment $entry, string $title, string $code): Level
    {
        return Level::create(['faculty_id' => $entry->level->faculty_id, 'title' => $title, 'code' => $code]);
    }

    private function enroll(AcademicEnrollment $source, Level $level, string $period, string $status): AcademicEnrollment
    {
        [$start, $end] = explode('-', $period);
        $year = AcademicYear::create(['title' => $period, 'start_date' => $start.'-10-01', 'end_date' => $end.'-09-30', 'status' => $status === 'completed' ? 'closed' : 'open']);

        return $source->profile->enrollments()->create(['level_id' => $level->id, 'academic_year_id' => $year->id,
            'application_id' => $source->application_id, 'enrollment_status' => $status, 'currency' => $source->currency]);
    }

    private function publishResult(AcademicEnrollment $entry, AcademicProgram $program, User $actor): AcademicOfficialResult
    {
        $version = CurriculumVersion::create(['academic_program_id' => $program->id, 'academic_year_id' => $entry->academic_year_id, 'code' => 'ANNUEL', 'name' => 'Maquette annuelle',
            'status' => 'draft', 'weighting_mode' => 'credits', 'periods' => [['code' => 'P', 'name' => 'Période']], 'program_snapshot' => ['level_order' => [$entry->level_id]]]);
        $version->update(['status' => 'validated', 'validated_at' => now()]);
        $version->update(['status' => 'published', 'published_at' => now()]);
        $entry->forceFill(['curriculum_version_id' => $version->id])->save();
        $decision = ['label' => 'Niveau validé', 'progression' => 'next'];
        $rule = AcademicResultRule::create(['curriculum_version_id' => $version->id, 'level_id' => $entry->level_id, 'session_code' => 'P', 'code' => 'TEST',
            'effective_on' => $entry->academicYear->start_date, 'reference' => 'Règlement de test',
            'configuration' => ['decisions' => ['pass' => $decision]], 'author_id' => $actor->id, 'approved_at' => now()]);
        $run = AcademicDeliberation::create(['academic_result_rule_id' => $rule->id, 'scope_key' => 'TEST:'.$entry->id, 'edition' => 1,
            'state' => 'published', 'reference' => (string) Str::uuid(), 'context' => ['decisions' => ['pass' => $decision]],
            'jury' => [], 'meeting_at' => now(), 'approved_at' => now(), 'published_at' => now()]);

        return $run->results()->create(['academic_enrollment_id' => $entry->id, 'reference' => (string) Str::uuid(), 'decision' => 'pass',
            'snapshot' => ['anomalies' => [], 'eliminatory' => false, 'units' => [['id' => 1, 'status' => 'passed']], 'periods' => ['P' => ['units' => [1]]]],
        ]);
    }
}
