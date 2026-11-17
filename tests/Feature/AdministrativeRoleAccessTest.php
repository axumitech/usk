<?php

namespace Tests\Feature;

use App\Models\User;
use App\Modules\Documents\Application\DocumentAccess;
use App\Modules\Progression\Application\AcademicLifecycle;
use App\Modules\Results\Application\ResultsAccess;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

final class AdministrativeRoleAccessTest extends TestCase
{
    use RefreshDatabase;

    private const DASHBOARD = '/app/dashboard';

    public function test_super_admin_role_reaches_specialized_workspaces_using_assigned_permissions(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $role = Role::findByName('super admin');
        $role->syncPermissions(['view dashboard', ResultsAccess::MANAGE, DocumentAccess::MANAGE, AcademicLifecycle::MANAGE]);
        $global = User::factory()->create()->assignRole($role);

        $this->actingAs($global)->get(self::DASHBOARD)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/index/Index')->where('auth.user.roles', ['super admin']));
        $this->get(self::DASHBOARD.'/admin/academic-results')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('permissions.manage', true)->where('permissions.publish', false)->where('permissions.jury', false));
        $this->get(self::DASHBOARD.'/admin/official-documents')->assertOk();
        $this->get(self::DASHBOARD.'/admin/progression')->assertOk();
        $this->get(self::DASHBOARD.'/admin/enrollments')->assertForbidden();
        $this->get(self::DASHBOARD.'/admin/finance')->assertForbidden();
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
}
