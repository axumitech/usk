<?php

namespace Tests\Feature;

use App\Models\AcademicStructure\AcademicCycle;
use App\Models\AcademicStructure\AcademicDepartment;
use App\Models\AcademicStructure\AcademicProgram;
use App\Models\AcademicStructure\AcademicPromotion;
use App\Models\AcademicStructure\University;
use App\Models\AcademicYear;
use App\Models\Classes;
use App\Models\Enrollment;
use App\Models\Faculty;
use App\Models\Intake;
use App\Models\Level;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AcademicStructureAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private University $university;
    private Faculty $law;
    private Faculty $sciences;
    private User $institutional;
    private User $lawAgent;
    private User $scienceAgent;

    protected function setUp(): void
    {
        parent::setUp();

        $this->university = University::create(['context_key' => 'current', 'code' => 'UNI', 'name' => 'Université de recette']);
        $this->law = Faculty::forceCreate(['university_id' => $this->university->id, 'code' => 'DROIT', 'name' => 'Droit']);
        $this->sciences = Faculty::forceCreate(['university_id' => $this->university->id, 'code' => 'SCI', 'name' => 'Sciences']);
        $this->institutional = $this->admin();
        $this->lawAgent = $this->admin();
        $this->lawAgent->academicFaculties()->attach($this->law);
        $this->scienceAgent = $this->admin();
        $this->scienceAgent->academicFaculties()->attach($this->sciences);
    }

    public function test_legacy_faculty_and_level_writes_require_the_structure_permission(): void
    {
        Role::findByName('admin', 'web')->syncPermissions([]);
        $level = Level::create(['faculty_id' => $this->law->id, 'code' => 'L1', 'title' => 'Licence 1']);
        $this->actingAs($this->institutional->fresh());
        $this->post(route('dashboard.admin.faculties.store'))->assertForbidden();
        $this->put(route('dashboard.admin.faculties.update', $this->law))->assertForbidden();
        $this->delete(route('dashboard.admin.faculties.destroy', $this->law))->assertForbidden();
        $this->post(route('dashboard.admin.levels.store'))->assertForbidden();
        $this->put(route('dashboard.admin.levels.update', $level))->assertForbidden();
        $this->delete(route('dashboard.admin.levels.destroy', $level))->assertForbidden();
        $this->get(route('dashboard.admin.faculties.show', $this->law))
            ->assertInertia(fn (Assert $page) => $page->where('canManage', false));
        $this->assertDatabaseHas('levels', ['id' => $level->id, 'title' => 'Licence 1']);
    }

    public function test_legacy_level_writes_respect_both_faculties_when_moving_a_level(): void
    {
        $level = Level::create(['faculty_id' => $this->law->id, 'code' => 'L1', 'title' => 'Licence 1']);
        $data = ['faculty_id' => $this->sciences->id, 'title' => 'Licence 2', 'code' => 'L2'];
        $this->actingAs($this->lawAgent);
        $this->post(route('dashboard.admin.faculties.store'))->assertForbidden();
        $this->put(route('dashboard.admin.faculties.update', $this->sciences))->assertForbidden();
        $this->delete(route('dashboard.admin.faculties.destroy', $this->sciences))->assertForbidden();
        $this->post(route('dashboard.admin.levels.store'), $data)->assertForbidden();
        $this->put(route('dashboard.admin.levels.update', $level), $data)->assertForbidden();
        $this->get(route('dashboard.admin.faculties.show', $this->sciences))
            ->assertInertia(fn (Assert $page) => $page->where('canManage', false));

        $this->actingAs($this->scienceAgent)->delete(route('dashboard.admin.levels.destroy', $level))->assertForbidden();
        $this->put(route('dashboard.admin.levels.update', $level), $data)->assertForbidden();
        $this->assertSame($this->law->id, $level->fresh()->faculty_id);

        $this->actingAs($this->lawAgent)->put(route('dashboard.admin.levels.update', $level),
            ['faculty_id' => $this->law->id] + $data)->assertStatus(303)->assertSessionHasNoErrors();
        $this->assertSame('Licence 2', $level->fresh()->title);
    }

    public function test_department_and_program_writes_are_limited_to_the_owning_faculty(): void
    {
        $department = $this->reference('department');
        $law = $this->referenceData('DR-PRIVE', 'Droit privé') + ['faculty_id' => $this->law->id];
        $sciences = $this->referenceData('SC-MATH', 'Mathématiques') + ['faculty_id' => $this->sciences->id];

        $this->actingAs($this->lawAgent)->post($department, $sciences)->assertForbidden();
        $this->post($department, $law)->assertSessionHasNoErrors()->assertRedirect();
        $this->actingAs($this->scienceAgent)->post($department, $sciences)->assertSessionHasNoErrors()->assertRedirect();
        $scienceDepartment = AcademicDepartment::where('code', $sciences['code'])->firstOrFail();
        $change = array_replace($sciences, ['name' => 'Mathématiques appliquées', 'revision' => 1]);
        $this->actingAs($this->lawAgent)->post($this->reference('department', $scienceDepartment->id), $change)->assertForbidden();
        $this->post($this->reference('department', $scienceDepartment->id), array_replace($change, ['faculty_id' => $this->law->id]))->assertForbidden();

        $scienceLevel = Level::create(['faculty_id' => $this->sciences->id, 'code' => 'S1', 'title' => 'Sciences 1']);
        $orientation = route('dashboard.admin.academic-structure.department-options.update', $scienceLevel);
        $this->put($orientation, ['department_ids' => [$scienceDepartment->id]])->assertForbidden();

        $program = $this->referenceData('MATH', 'Programme de mathématiques') + [
            'faculty_id' => $this->sciences->id, 'academic_cycle_id' => $this->cycle()->id, 'level_ids' => [$scienceLevel->id],
        ];
        $this->post($this->reference('program'), $program)->assertForbidden();
        $this->assertDatabaseMissing('academic_programs', ['code' => $program['code']]);

        $this->actingAs($this->scienceAgent)->put($orientation, ['department_ids' => [$scienceDepartment->id]])->assertSessionHasNoErrors()->assertRedirect();
        $this->post($this->reference('program'), $program)->assertSessionHasNoErrors()->assertRedirect();
        $this->actingAs($this->institutional)->post($this->reference('department', $scienceDepartment->id), $change)->assertSessionHasNoErrors()->assertRedirect();
        $this->assertSame($change['name'], $scienceDepartment->refresh()->name);
    }

    public function test_cohort_promotion_and_group_use_the_program_faculty(): void
    {
        $level = Level::create(['faculty_id' => $this->sciences->id, 'code' => 'S1', 'title' => 'Sciences 1']);
        $program = AcademicProgram::create(['faculty_id' => $this->sciences->id, 'academic_cycle_id' => $this->cycle()->id, 'code' => 'MATH', 'name' => 'Mathématiques']);
        $program->levels()->attach($level, ['position' => 1]);
        $year = $this->createYear();
        $context = ['academic_program_id' => $program->id, 'academic_year_id' => $year->id];
        $cohort = $this->referenceData('COHORTE', 'Cohorte sciences') + $context;
        $promotion = $this->referenceData('PROMO', 'Promotion sciences') + $context + ['level_id' => $level->id];

        $this->actingAs($this->lawAgent)->post($this->reference('cohort'), $cohort)->assertForbidden();
        $this->post($this->reference('promotion'), $promotion)->assertForbidden();
        $this->actingAs($this->scienceAgent)->post($this->reference('cohort'), $cohort)->assertSessionHasNoErrors()->assertRedirect();
        $this->post($this->reference('promotion'), $promotion)->assertSessionHasNoErrors()->assertRedirect();

        $group = Classes::create(['faculty_id' => $this->sciences->id, 'level_id' => $level->id, 'intake_id' => Intake::create(['name' => 'Groupe sciences'])->id]);
        $promotionId = AcademicPromotion::where('code', 'PROMO')->value('id');
        $groupChange = ['academic_promotion_id' => $promotionId, 'revision' => 0, 'reason' => 'Affectation pour la recette.'];
        $this->actingAs($this->lawAgent)->post($this->reference('group-promotion', $group->id), $groupChange)->assertForbidden();
        $this->assertNull($group->refresh()->academic_promotion_id);
        $this->actingAs($this->scienceAgent)->post($this->reference('group-promotion', $group->id), $groupChange)->assertSessionHasNoErrors()->assertRedirect();
        $this->assertEquals($promotionId, $group->refresh()->academic_promotion_id);

        $create = route('dashboard.admin.academic-structure.groups.store', $promotionId);
        $input = ['name' => 'Travaux pratiques A', 'capacity' => 24];
        $this->actingAs($this->lawAgent)->post($create, $input)->assertForbidden();
        $this->actingAs($this->scienceAgent)->post($create, $input + ['level_id' => $level->id + 1])->assertSessionHasErrors('level_id');
        foreach ([1, 2] as $attempt) {
            $this->post($create, $input)->assertStatus(303)->assertSessionHasNoErrors()
                ->assertRedirect(route('dashboard.admin.academic-structure.index', ['tab' => 'programs', 'program' => $program->id]));
        }
        $created = Classes::where('academic_promotion_id', $promotionId)->where('capacity', 24)->sole();
        $this->assertEquals($level->id, $created->level_id);
        $this->assertEquals($this->sciences->id, $created->faculty_id);
        $this->assertStringStartsWith('Travaux pratiques A', $created->intake->name);
        $this->assertSame(1, \App\Models\Student\AcademicAudit::where('entity_id', $created->id)->where('action', 'promotion_group_created')->count());
        $this->post($create, array_replace($input, ['capacity' => 12]))->assertSessionHasErrors('name');
        $year->forceFill(['status' => 'closed'])->save();
        $this->post($create, ['name' => 'Nouveau groupe'])->assertSessionHasErrors('name');
    }

    public function test_institutional_references_require_an_unrestricted_scope(): void
    {
        $year = $this->createYear();
        $institution = $this->referenceData('UNI', 'Université mise à jour');
        $cycle = $this->referenceData('LIC', 'Licence') + [
            'normal_duration' => 3, 'progression_mode' => 'annual', 'weighting_mode' => 'credits',
            'periods' => [['code' => 'S1', 'name' => 'Semestre 1']],
        ];

        $this->actingAs($this->lawAgent)->post($this->reference('university', $this->university->id), $institution)->assertForbidden();
        $this->post($this->reference('cycle'), $cycle)->assertForbidden();
        $this->post($this->reference('faculty-context', $this->law->id), $institution)->assertForbidden();
        $this->post($this->reference('year-context', $year->id), $institution)->assertForbidden();
        $this->assertSame('Université de recette', $this->university->refresh()->name);
        $this->assertNull($year->refresh()->university_id);

        $this->actingAs($this->institutional)->post($this->reference('university', $this->university->id), $institution)->assertSessionHasNoErrors()->assertRedirect();
        $this->post($this->reference('cycle'), $cycle)->assertSessionHasNoErrors()->assertRedirect();
        $this->post($this->reference('year-context', $year->id), $institution)->assertSessionHasNoErrors()->assertRedirect();
        $this->assertSame($institution['name'], $this->university->refresh()->name);
        $this->assertEquals($this->university->id, $year->refresh()->university_id);
    }

    public function test_annual_mutations_require_their_existing_permission_and_global_scope(): void
    {
        $year = $this->createYear();
        $yearData = ['title' => '2028-2029', 'start_date' => '2028-10-01', 'end_date' => '2029-09-30'];
        $yearUpdate = ['title' => 'Année en cours', 'start_date' => '2027-10-01', 'end_date' => '2028-09-30'];
        $eventData = ['title' => 'Examens', 'category' => 'exam', 'start_date' => '2028-02-01', 'end_date' => '2028-02-15'];
        $semesterData = ['academic_year_id' => $year->id, 'number' => 1, 'start_month' => '2027-10', 'end_month' => '2028-02'];
        $create = route('dashboard.admin.academic-years.store');
        $update = route('dashboard.admin.academic-years.update', $year);
        $calendar = route('dashboard.admin.academic-years.calendar.store', $year);
        $semester = route('dashboard.admin.schedule.semesters.store');

        $this->actingAs($this->lawAgent)->post($create, $yearData)->assertForbidden();
        $this->put($update, $yearUpdate)->assertForbidden();
        $this->post($calendar, $eventData)->assertForbidden();
        $this->post($semester, $semesterData)->assertForbidden();
        $this->assertSame('2027-2028', $year->refresh()->title);

        $this->actingAs($this->institutional)->post($create, $yearData)->assertSessionHasNoErrors()->assertRedirect();
        $this->put($update, $yearUpdate)->assertSessionHasNoErrors()->assertRedirect();
        $this->post($calendar, $eventData)->assertSessionHasNoErrors()->assertRedirect();
        $this->post($semester, $semesterData)->assertSessionHasNoErrors()->assertRedirect();
        $this->assertDatabaseHas('academic_years', ['title' => $yearData['title']]);
        $this->assertSame($yearUpdate['title'], $year->refresh()->title);

        $role = Role::findByName('admin', 'web');
        $role->syncPermissions([]);
        $unprivileged = $this->admin();
        $this->actingAs($unprivileged)->post($create, $yearData)->assertForbidden();
        $this->put($update, $yearUpdate)->assertForbidden();
        $this->post($calendar, $eventData)->assertForbidden();
        $this->post($semester, $semesterData)->assertForbidden();
        $this->post($this->reference('university', $this->university->id), $this->referenceData('UNI', 'Université'))->assertForbidden();
    }

    public function test_year_details_only_include_candidate_counts_and_records_in_scope(): void
    {
        $year = $this->createYear();
        $law = $this->candidature($year, $this->law);
        $sciences = $this->candidature($year, $this->sciences);
        $url = route('dashboard.admin.academic-years.show', $year);

        $this->actingAs($this->lawAgent)->get($url)->assertInertia(fn (Assert $page) => $page
            ->where('enrollmentStats.total', 1)->has('enrollments.data', 1)->where('enrollments.data.0.id', $law->id));
        $this->actingAs($this->scienceAgent)->get($url)->assertInertia(fn (Assert $page) => $page
            ->where('enrollmentStats.total', 1)->has('enrollments.data', 1)->where('enrollments.data.0.id', $sciences->id));
        $this->actingAs($this->institutional)->get($url)->assertInertia(fn (Assert $page) => $page
            ->where('enrollmentStats.total', 2)->has('enrollments.data', 2));
    }

    private function admin(): User
    {
        $admin = User::factory()->create();
        $admin->assignRole(Role::findOrCreate('admin', 'web'));

        return $admin;
    }

    private function reference(string $kind, ?int $id = null): string
    {
        return route('dashboard.admin.academic-structure.references', ['kind' => $kind, 'id' => $id]);
    }

    private function referenceData(string $code, string $name): array
    {
        return ['code' => $code, 'name' => $name, 'is_active' => true, 'revision' => 0, 'reason' => 'Configuration pour la recette.'];
    }

    private function cycle(): AcademicCycle
    {
        return AcademicCycle::create([
            'university_id' => $this->university->id, 'code' => 'LIC', 'name' => 'Licence', 'normal_duration' => 3,
            'progression_mode' => 'annual', 'weighting_mode' => 'credits', 'periods' => [['code' => 'S1', 'name' => 'Semestre 1']],
        ]);
    }

    private function createYear(): AcademicYear
    {
        return AcademicYear::create(['title' => '2027-2028', 'start_date' => '2027-10-01', 'end_date' => '2028-09-30', 'status' => 'draft']);
    }

    private function candidature(AcademicYear $year, Faculty $faculty): Enrollment
    {
        $level = Level::create(['faculty_id' => $faculty->id, 'code' => 'L1', 'title' => 'Licence 1']);

        return Enrollment::create(['student_id' => User::factory()->create()->id, 'level_id' => $level->id, 'academic_year_id' => $year->id, 'status' => 'submitted']);
    }
}
