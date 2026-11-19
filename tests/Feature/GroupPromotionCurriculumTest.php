<?php

namespace Tests\Feature;

use App\Models\AcademicStructure\AcademicCycle;
use App\Models\AcademicStructure\AcademicProgram;
use App\Models\AcademicStructure\AcademicPromotion;
use App\Models\AcademicStructure\CurriculumVersion;
use App\Models\AcademicStructure\University;
use App\Models\AcademicYear;
use App\Models\Classes;
use App\Models\Courses;
use App\Models\Faculty;
use App\Models\Intake;
use App\Models\Level;
use App\Models\Student\AcademicOffering;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class GroupPromotionCurriculumTest extends TestCase
{
    use RefreshDatabase;

    public function test_group_attachment_respects_each_versioned_offering_and_accepts_unversioned_history(): void
    {
        $university = University::create(['context_key' => 'current', 'code' => 'UNI', 'name' => 'Université de recette']);
        $faculty = Faculty::forceCreate(['university_id' => $university->id, 'code' => 'DR', 'name' => 'Droit']);
        $level = Level::create(['faculty_id' => $faculty->id, 'code' => 'L1', 'title' => 'Licence 1']);
        $year = AcademicYear::forceCreate(['university_id' => $university->id, 'title' => '2026-2027',
            'start_date' => '2026-10-01', 'end_date' => '2027-09-30', 'status' => 'open']);
        $periods = [['code' => 'S1', 'name' => 'Semestre 1']];
        $cycle = AcademicCycle::create(['university_id' => $university->id, 'code' => 'LIC', 'name' => 'Licence',
            'normal_duration' => 3, 'progression_mode' => 'annual', 'weighting_mode' => 'credits', 'periods' => $periods]);

        $promotions = [];
        foreach (['PUBLIC' => 'Droit public', 'PRIVE' => 'Droit privé'] as $code => $name) {
            $program = AcademicProgram::create(['faculty_id' => $faculty->id, 'academic_cycle_id' => $cycle->id, 'code' => $code, 'name' => $name]);
            $program->levels()->attach($level, ['position' => 1]);
            $promotions[$code] = AcademicPromotion::create(['academic_program_id' => $program->id, 'academic_year_id' => $year->id,
                'level_id' => $level->id, 'code' => $code.'-L1', 'name' => $name.' L1']);
        }
        $course = Courses::forceCreate(['level_id' => $level->id, 'code' => 'DR101', 'title' => 'Institutions', 'credits' => 3, 'semester' => 1]);
        $version = CurriculumVersion::create(['academic_program_id' => $promotions['PUBLIC']->academic_program_id, 'academic_year_id' => $year->id,
            'code' => 'PUB-V1', 'name' => 'Maquette Droit public', 'weighting_mode' => 'credits', 'program_snapshot' => ['name' => 'Droit public'], 'periods' => $periods]);
        $unit = $version->units()->create(['level_id' => $level->id, 'level_code' => $level->code, 'level_title' => $level->title,
            'period_code' => 'S1', 'period_name' => 'Semestre 1', 'code' => 'UE1', 'name' => 'Institutions']);
        $item = $unit->items()->create(['source_course_id' => $course->id, 'name' => $course->title, 'credits' => 3]);
        $version->refresh()->update(['status' => 'validated']);
        $version->update(['status' => 'published']);

        $admin = User::factory()->create();
        $this->actingAs($admin->assignRole(Role::findOrCreate('admin', 'web')));
        $offer = ['academic_year_id' => $year->id, 'level_id' => $level->id, 'course_id' => $course->id];
        $group = Classes::create(['faculty_id' => $faculty->id, 'level_id' => $level->id, 'intake_id' => Intake::create(['name' => 'Groupe de droit public'])->id]);
        AcademicOffering::create($offer + ['class_id' => $group->id, 'curriculum_item_id' => $item->id]);
        $this->assertDatabaseMissing('academic_enrollments', ['class_id' => $group->id]);

        $url = route('dashboard.admin.academic-structure.references', ['kind' => 'group-promotion', 'id' => $group->id]);
        $reason = ['revision' => 0, 'reason' => 'Rattachement vérifié par la scolarité.'];
        $this->post($url, $reason + ['academic_promotion_id' => $promotions['PRIVE']->id])
            ->assertSessionHasErrors(['group' => 'Une offre de ce groupe relève déjà de la maquette d’un autre programme.']);
        $this->assertNull($group->refresh()->academic_promotion_id);
        $this->assertDatabaseMissing('academic_audits', ['action' => 'promotion_group_attached', 'entity_id' => $group->id]);

        $this->post($url, $reason + ['academic_promotion_id' => $promotions['PUBLIC']->id])->assertRedirect()->assertSessionHasNoErrors();
        $this->assertEquals($promotions['PUBLIC']->id, $group->refresh()->academic_promotion_id);

        $legacy = Classes::create(['faculty_id' => $faculty->id, 'level_id' => $level->id, 'intake_id' => Intake::create(['name' => 'Groupe historique'])->id]);
        AcademicOffering::create($offer + ['class_id' => $legacy->id]);
        $this->post(route('dashboard.admin.academic-structure.references', ['kind' => 'group-promotion', 'id' => $legacy->id]),
            $reason + ['academic_promotion_id' => $promotions['PRIVE']->id])->assertRedirect()->assertSessionHasNoErrors();
        $this->assertEquals($promotions['PRIVE']->id, $legacy->refresh()->academic_promotion_id);
    }
}
