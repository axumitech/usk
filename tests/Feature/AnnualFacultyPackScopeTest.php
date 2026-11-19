<?php

namespace Tests\Feature;

use App\Models\AcademicStructure\AcademicCycle;
use App\Models\AcademicStructure\AcademicDepartment;
use App\Models\AcademicStructure\AcademicProgram;
use App\Models\AcademicStructure\CurriculumVersion;
use App\Models\AcademicStructure\University;
use App\Models\AcademicYear;
use App\Models\Faculty;
use App\Models\Level;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

final class AnnualFacultyPackScopeTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_curriculum_page_limits_drafts_and_choices_to_each_staff_members_assigned_faculties(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $university = University::create(['context_key' => 'current', 'code' => 'UNI', 'name' => 'Université fictive']);
        $year = AcademicYear::forceCreate(['university_id' => $university->id, 'title' => '2026-2027', 'start_date' => '2026-10-01',
            'end_date' => '2027-09-30', 'status' => 'open']);
        $cycle = AcademicCycle::create(['university_id' => $university->id, 'code' => 'LIC', 'name' => 'Licence', 'normal_duration' => 3,
            'progression_mode' => 'annual', 'weighting_mode' => 'credits', 'periods' => [['code' => 'AN', 'name' => 'Année']]]);
        $rows = [];
        foreach (['DR' => 'Droit', 'MED' => 'Médecine'] as $code => $name) {
            $faculty = Faculty::forceCreate(['university_id' => $university->id, 'code' => $code, 'name' => $name, 'is_active' => true]);
            $department = AcademicDepartment::create(['faculty_id' => $faculty->id, 'code' => $code, 'name' => $name]);
            $level = Level::create(['faculty_id' => $faculty->id, 'code' => $code.'-L1', 'title' => 'L1 '.$name, 'is_active' => true]);
            $program = AcademicProgram::create(['faculty_id' => $faculty->id, 'academic_cycle_id' => $cycle->id,
                'academic_department_id' => $department->id, 'code' => $code, 'name' => 'Licence de '.$name]);
            $program->levels()->attach($level, ['position' => 1]);
            $version = CurriculumVersion::create(['academic_program_id' => $program->id, 'academic_year_id' => $year->id,
                'code' => 'V1', 'name' => 'Brouillon '.$name, 'status' => 'draft', 'weighting_mode' => 'credits',
                'periods' => [['code' => 'AN', 'name' => 'Année']], 'program_snapshot' => []]);
            $rows[$code] = compact('faculty', 'department', 'level', 'program', 'version');
        }
        $url = route('dashboard.admin.academic-structure.index', ['tab' => 'curriculum', 'year' => $year->id]);
        foreach (['dean' => 'DR', 'vice-dean' => 'MED'] as $role => $code) {
            $row = $rows[$code];
            $delegate = User::factory()->create()->assignRole($role);
            $delegate->academicFaculties()->attach($row['faculty']);
            $this->actingAs($delegate)->get($url)->assertOk()->assertInertia(fn (Assert $page) => $page
                ->has('facultyPack', 1)->where('facultyPack.0.id', $row['faculty']->id)
                ->has('facultyPack.0.versions', 1)->where('facultyPack.0.versions.0.id', $row['version']->id)
                ->has('faculties', 1)->where('faculties.0.id', $row['faculty']->id)
                ->has('departments', 1)->where('departments.0.id', $row['department']->id)
                ->has('levels', 1)->where('levels.0.id', $row['level']->id)
                ->has('programs.data', 1)->where('programs.data.0.id', $row['program']->id));
        }
        $admin = User::factory()->create()->assignRole('admin');
        $this->actingAs($admin)->get($url)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->has('facultyPack', 2)->where('facultyPack.0.versions.0.id', $rows['DR']['version']->id)
            ->where('facultyPack.1.versions.0.id', $rows['MED']['version']->id)
            ->has('faculties', 2)->has('departments', 2)->has('levels', 2)->has('programs.data', 2));
    }
}
