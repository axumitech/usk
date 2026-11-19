<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Courses;
use App\Models\Faculty;
use App\Models\Level;
use App\Models\Professor;
use App\Models\Student\AcademicOffering;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ProfessorDirectoryScopeTest extends TestCase
{
    use RefreshDatabase;

    private function course(string $code): Courses
    {
        $faculty = Faculty::create(['code' => $code, 'name' => $code]);
        $level = Level::create(['faculty_id' => $faculty->id, 'code' => 'L1', 'title' => 'Licence 1']);

        return Courses::forceCreate(['level_id' => $level->id, 'title' => 'Cours '.$code, 'semester' => 1, 'credits' => 3]);
    }

    private function person(string $name): Professor
    {
        return Professor::create(['first_name' => 'Enseignant', 'last_name' => $name, 'email' => $name.'@example.test', 'is_active' => true]);
    }

    public function test_faculty_directory_follows_shared_appointments_and_preserves_global_profile_management(): void
    {
        $law = $this->course('Droit');
        $health = $this->course('Sante');
        $year = AcademicYear::create(['title' => '2026-2027', 'start_date' => '2026-10-01', 'end_date' => '2027-09-30', 'status' => 'open']);
        $shared = $this->person('Commun');
        $external = $this->person('Externe');
        $assistant = $this->person('Assistant');
        $former = $this->person('Ancien');
        $legacy = $this->person('Titulaire');
        $levelCode = DB::table('level_codes')->insertGetId(['code' => 'L1QA', 'name' => 'Licence QA']);
        DB::table('professor_assignments')->insert(['professor_id' => $legacy->id, 'faculty_id' => $law->level->faculty_id, 'level_code_id' => $levelCode]);

        $localOffer = AcademicOffering::create(['level_id' => $law->level_id, 'course_id' => $law->id, 'academic_year_id' => $year->id, 'professor_id' => $shared->id]);
        $awayOffer = AcademicOffering::create(['level_id' => $health->level_id, 'course_id' => $health->id, 'academic_year_id' => $year->id, 'professor_id' => $shared->id, 'assistant_professor_id' => $external->id]);
        $member = $localOffer->assignments()->create(['role' => 'assistant', 'professor_id' => $assistant->id, 'starts_at' => now()->subDay()]);
        $localOffer->assignments()->create(['role' => 'assistant', 'professor_id' => $former->id, 'ends_at' => now()->subDay()]);

        $viceDean = User::factory()->create()->assignRole('vice-dean');
        $viceDean->academicFaculties()->attach($law->level->faculty_id);
        $admin = User::factory()->create()->assignRole('admin');
        $base = '/app/dashboard/admin/professors';
        $this->actingAs($viceDean)->get($base)->assertOk()->assertInertia(fn (Assert $p) => $p
            ->where('stats.total', 3)->where('stats.active', 3)->where('stats.assignments', 1)
            ->where('canManageProfiles', false)->where('canAssign', true)->has('professors.data', 3)
            ->where('professors.data.0.id', $assistant->id)->where('professors.data.1.id', $shared->id)
            ->where('professors.data.1.offerings_count', 1)->where('professors.data.2.id', $legacy->id)
            ->has('catalog', 1)->where('catalog.0.id', $law->id));
        $this->get($base.'?q=Externe')->assertInertia(fn (Assert $p) => $p->has('professors.data', 0));
        $this->get($base.'/'.$shared->id)->assertOk()->assertInertia(fn (Assert $p) => $p
            ->has('assignments', 1)->where('assignments.0.id', $localOffer->id)->has('professors', 3)
            ->has('catalog', 1)->where('canManageProfiles', false)->where('canLinkAccount', false));
        $this->get($base.'/'.$external->id)->assertNotFound();
        $this->get($base.'/'.$former->id)->assertNotFound();
        $this->get(route('dashboard.professor-photo', $external))->assertNotFound();

        $payload = ['first_name' => 'Enseignant', 'last_name' => 'Renomme', 'email' => $shared->email, 'is_active' => true];
        $this->put($base.'/'.$shared->id, $payload)->assertForbidden();
        $this->post($base, array_replace($payload, ['email' => 'nouveau@example.test']))->assertForbidden();
        $this->assertSame('Commun', $shared->fresh()->last_name);
        $assignment = ['course_id' => $law->id, 'academic_year_id' => $year->id, 'professor_id' => $shared->id, 'assistant_professor_id' => $external->id, 'is_published' => false];
        $this->put($base.'/assignments/'.$localOffer->id, $assignment)->assertForbidden();
        $this->post('/app/dashboard/admin/teaching/'.$localOffer->id.'/team', ['professor_id' => $external->id, 'role' => 'assistant', 'action' => 'assign', 'reason' => 'Affectation de recette pédagogique.'])->assertForbidden();
        $this->assertNull($localOffer->fresh()->assistant_professor_id);

        $this->actingAs($admin)->get($base)->assertInertia(fn (Assert $p) => $p->where('stats.total', 5)->where('stats.assignments', 2)
            ->where('canManageProfiles', true)->has('catalog', 2));
        $this->get($base.'/'.$shared->id)->assertInertia(fn (Assert $p) => $p->has('assignments', 2));
        $this->put($base.'/'.$shared->id, $payload)->assertRedirect()->assertSessionHasNoErrors();
        $this->assertSame('Renomme', $shared->fresh()->last_name);
        $this->put($base.'/assignments/'.$localOffer->id, $assignment)->assertRedirect()->assertSessionHasNoErrors();
        $this->assertEquals($external->id, $localOffer->fresh()->assistant_professor_id);
        $this->assertEquals($external->id, $awayOffer->fresh()->assistant_professor_id);

        $member->update(['ends_at' => now(), 'active_key' => null]);
        $this->actingAs($viceDean)->get($base.'/'.$external->id)->assertOk();
        $this->get($base.'/'.$assistant->id)->assertNotFound();
        $viceDean->academicFaculties()->sync([$health->level->faculty_id]);
        $this->get($base.'/'.$shared->id)->assertInertia(fn (Assert $p) => $p->has('assignments', 1)
            ->where('assignments.0.id', $awayOffer->id)->has('catalog', 1)->where('catalog.0.id', $health->id));
        $this->get($base.'/'.$legacy->id)->assertNotFound();
    }
}
