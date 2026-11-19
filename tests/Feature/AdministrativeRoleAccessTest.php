<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\AcademicStructure\AcademicDepartment;
use App\Models\AcademicStructure\AcademicCycle;
use App\Models\AcademicStructure\AcademicProgram;
use App\Models\AcademicStructure\AcademicPromotion;
use App\Models\AcademicStructure\University;
use App\Models\Enrollment;
use App\Models\Faculty;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\StudentProfile;
use App\Modules\Results\Application\ResultsAccess;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use App\Support\UniversityRoles;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class AdministrativeRoleAccessTest extends TestCase
{
    use RefreshDatabase, \Tests\Support\CreatesStudentContext;

    private const DASHBOARD = '/app/dashboard';

    public function test_platform_is_separate_from_institutional_and_financial_workspaces(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $platform = User::factory()->create()->assignRole('super-admin');
        $this->actingAs($platform)->get(self::DASHBOARD)->assertRedirect(route('dashboard.platform.index'));
        $this->get(route('dashboard.platform.index'))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/platform/Index')->has('services')->missing('students')->missing('finance'));
        foreach (['finance', 'enrollments', 'academic-results', 'official-documents', 'progression'] as $area) {
            $this->get(self::DASHBOARD.'/admin/'.$area)->assertForbidden();
        }
        $this->actingAs(User::factory()->create()->assignRole('admin'))->get(route('dashboard.platform.index'))->assertForbidden();
    }

    public function test_platform_delegation_is_verified_audited_and_idempotent(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $platform = User::factory()->create()->assignRole('super-admin');
        $target = User::factory()->create()->assignRole('user');
        $parameters = ['email' => $target->email, 'operation' => 'grant', 'reason' => 'Délégation de recette',
            'current_password' => 'password'];
        $url = route('dashboard.platform.delegate');
        $this->actingAs($platform)->post($url, array_replace($parameters, ['current_password' => 'invalid']))->assertSessionHasErrors('current_password');
        $this->post($url, $parameters)->assertSessionHasNoErrors();
        $this->post($url, $parameters)->assertSessionHasNoErrors();
        $this->assertTrue($target->fresh()->hasRole('admin'));
        $this->assertSame(1, DB::table('academic_audits')->where('action', 'institutional_admin_granted')->count());
        $this->post($url, array_replace($parameters, ['operation' => 'revoke']))->assertSessionHasErrors('operation');
    }

    public function test_historical_mixed_platform_accounts_and_unassigned_delegates_are_excluded_from_institutional_access(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $platform = User::factory()->create()->assignRole(['admin', 'super-admin', 'student']);
        $platform->givePermissionTo('manage academic finance');
        $unassigned = User::factory()->create()->assignRole('admissions-officer');
        $this->assertFalse($platform->hasRole('admin'));
        $this->assertFalse($platform->hasRole('student'));
        $this->assertFalse($platform->can('manage academic finance'));
        $this->assertTrue($platform->can('view platform'));
        $this->assertEqualsCanonicalizing(UniversityRoles::GRANTS['super-admin'], $platform->getAllPermissions()->pluck('name')->all());
        $this->assertFalse(User::administrators()->whereKey($platform)->exists());
        $this->assertFalse(User::administrators()->whereKey($unassigned)->exists());
        $faculty = Faculty::create(['name' => 'Faculté de délégation', 'code' => 'DEL']);
        $unassigned->academicFaculties()->attach($faculty);
        $this->assertTrue(User::administrators()->whereKey($unassigned)->exists());
        $this->actingAs($unassigned)->get(route('dashboard.admin.academic-structure.index'))->assertForbidden();
        $this->actingAs($platform)->get(route('dashboard.platform.index'))->assertOk()->assertInertia(fn (Assert $page) => $page->where('studentNotifications', null));
        $this->get(self::DASHBOARD.'/admin/finance')->assertForbidden();
        $this->get(self::DASHBOARD.'/enrollments')->assertForbidden();
    }

    public function test_all_named_roles_receive_only_their_declared_permissions_after_reseeding(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $this->seed(RolePermissionSeeder::class);
        foreach (UniversityRoles::GRANTS as $role => $grants) {
            $actor = User::factory()->create()->assignRole($role);
            $this->assertEqualsCanonicalizing($grants, $actor->getAllPermissions()->pluck('name')->all(), $role);
        }
    }

    public function test_faculty_officers_require_an_assignment_and_only_enter_delegated_areas(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $faculty = Faculty::create(['name' => 'Faculté fictive', 'code' => 'FIC']);
        $other = Faculty::create(['name' => 'Autre faculté fictive', 'code' => 'AUT']);
        $foreign = $other->levels()->create(['title' => 'Licence', 'code' => 'L1']);
        $finance = User::factory()->create()->assignRole('finance-officer');
        $this->actingAs($finance)->get(self::DASHBOARD.'/admin/finance')->assertForbidden();
        $finance->academicFaculties()->attach($faculty);
        $this->get(self::DASHBOARD.'/admin/finance')->assertOk();
        $this->get(self::DASHBOARD.'/admin/enrollments')->assertForbidden();
        $this->get(self::DASHBOARD.'/admin/levels')->assertForbidden();
        $dean = User::factory()->create()->assignRole('dean');
        $dean->academicFaculties()->attach($faculty);
        $this->actingAs($dean)->get(self::DASHBOARD.'/admin/levels')->assertOk();
        $this->get(route('dashboard.admin.levels.details.show', $foreign))->assertForbidden();
        $this->post(route('dashboard.admin.levels.admission-conditions.copy-previous', $foreign))->assertForbidden();
        $this->get(self::DASHBOARD.'/admin/finance')->assertForbidden();
    }

    public function test_rector_department_and_representative_receive_distinct_scoped_workspaces(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $faculty = Faculty::create(['name' => 'Faculté fictive', 'code' => 'FIC']);
        $department = AcademicDepartment::create(['name' => 'Droit privé', 'code' => 'DRP', 'faculty_id' => $faculty->id]);
        $head = User::factory()->create()->assignRole('department-head');
        DB::table('department_staff')->insert(['user_id' => $head->id, 'department_id' => $department->id]);
        $this->actingAs($head)->get(route('dashboard.delegation'))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('title', 'Direction de département')->has('programs', 0)->missing('indicators'));
        $this->get(self::DASHBOARD.'/admin/enrollments')->assertForbidden();
        $this->actingAs(User::factory()->create()->assignRole('rector'))->get(route('dashboard.delegation'))
            ->assertOk()->assertInertia(fn (Assert $page) => $page->has('indicators')->missing('programs'));
        $representative = User::factory()->create()->assignRole(['student', 'promotion-representative']);
        $this->actingAs($representative)->get(route('dashboard.delegation'))->assertOk()->assertInertia(fn (Assert $page) => $page->has('promotions', 0));
        $this->post(route('dashboard.delegation.publish'), ['promotion' => 1, 'message' => 'Réunion de promotion'])->assertNotFound();
    }

    public function test_specialized_permission_is_required_and_does_not_replace_the_administrative_role(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $admin = User::factory()->create()->assignRole('admin');
        $user = User::factory()->create()->assignRole('user')->givePermissionTo(ResultsAccess::MANAGE);
        $results = self::DASHBOARD.'/admin/academic-results';
        $documents = self::DASHBOARD.'/admin/official-documents';

        $this->actingAs($user)->get($results)->assertForbidden();
        $this->actingAs($admin)->get($results)->assertForbidden();
        $this->get($documents)->assertForbidden();
        $admin->givePermissionTo(ResultsAccess::MANAGE);
        $this->get($results)->assertOk();
        $this->get($documents)->assertForbidden();
    }

    public function test_promotion_message_requires_current_mandate_and_only_reaches_confirmed_members(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $representative = $this->studentContext()->assignRole('promotion-representative');
        $entry = $representative->studentProfile->enrollments()->sole();
        $university = University::create(['context_key' => 'current', 'code' => 'TEST', 'name' => 'Université de test']);
        $cycle = AcademicCycle::create(['university_id' => $university->id, 'name' => 'Licence', 'code' => 'L', 'normal_duration' => 3,
            'progression_mode' => 'annual', 'weighting_mode' => 'credits', 'periods' => []]);
        $program = AcademicProgram::create(['faculty_id' => $entry->level->faculty_id, 'academic_cycle_id' => $cycle->id,
            'code' => 'LAW', 'name' => 'Droit']);
        $promotion = AcademicPromotion::create(['academic_program_id' => $program->id, 'level_id' => $entry->level_id,
            'academic_year_id' => $entry->academic_year_id, 'name' => 'Promotion de recette', 'code' => 'L1']);
        $entry->update(['academic_promotion_id' => $promotion->id]);
        $members = [];
        foreach (['confirmed', 'pending_confirmation'] as $status) {
            $student = User::factory()->create()->assignRole('student');
            $profile = StudentProfile::create(['user_id' => $student->id, 'student_status' => 'active']);
            $application = Enrollment::create(['student_id' => $student->id, 'level_id' => $entry->level_id,
                'academic_year_id' => $entry->academic_year_id, 'status' => 'validated']);
            AcademicEnrollment::create(['student_profile_id' => $profile->id, 'application_id' => $application->id,
                'academic_promotion_id' => $promotion->id, 'academic_year_id' => $entry->academic_year_id,
                'level_id' => $entry->level_id, 'enrollment_status' => $status, 'currency' => 'USD']);
            $members[$status] = $student;
        }
        $parameters = ['promotion' => $promotion->id, 'message' => 'Réunion de promotion jeudi.'];
        $publish = route('dashboard.delegation.publish');
        $this->actingAs($representative)->post($publish, $parameters)->assertNotFound();
        DB::table('promotion_representatives')->insert(['user_id' => $representative->id, 'academic_promotion_id' => $promotion->id]);
        $this->get(route('dashboard.delegation'))->assertInertia(fn (Assert $page) => $page->has('promotions', 1)->where('promotions.0.id', $promotion->id));
        $this->post($publish, $parameters)->assertStatus(303);
        $this->assertSame(1, $members['confirmed']->notifications()->where('type', \App\Notifications\PromotionMessage::class)->count());
        $this->assertSame(0, $members['pending_confirmation']->notifications()->count());
        $entry->academicYear->forceFill(['status' => 'closed'])->save();
        $this->post($publish, $parameters)->assertNotFound();
    }
}
