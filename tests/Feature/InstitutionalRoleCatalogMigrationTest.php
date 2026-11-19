<?php

namespace Tests\Feature;

use App\Models\Faculty;
use App\Models\User;
use App\Support\UniversityRoles;
use Database\Migrations\Support\InstitutionalAclJournal;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

final class InstitutionalRoleCatalogMigrationTest extends TestCase
{
    use RefreshDatabase;

    private const CATALOG = 'migrations/2026_11_19_202000_install_institutional_role_catalog.php';
    private const PLATFORM = 'migrations/2026_11_19_200000_separate_platform_administration.php';

    public function test_migrate_without_seeding_installs_the_catalog_without_assigning_accounts(): void
    {
        foreach (UniversityRoles::GRANTS as $name => $expected) {
            $this->assertEqualsCanonicalizing($expected, Role::findByName($name, 'web')->permissions->pluck('name')->all(), $name);
        }
        $this->assertDatabaseHas('permissions', ['name' => 'approve academic diplomas', 'guard_name' => 'web']);
        $this->assertDatabaseCount('model_has_roles', 0);
    }

    public function test_update_after_predecessor_without_old_platform_role_preserves_local_rights_and_scopes(): void
    {
        DB::table(InstitutionalAclJournal::TABLE)->delete();
        Role::findByName('super-admin', 'web')->delete();
        Role::findByName('registrar', 'web')->delete();
        $this->assertDatabaseMissing('roles', ['name' => 'super admin', 'guard_name' => 'web']);
        $local = Permission::findOrCreate('local archive review', 'web');
        $personal = Permission::findOrCreate('local personal audit', 'web');
        $admin = Role::findByName('admin', 'web');
        $admin->syncPermissions([$local]);
        $dean = Role::findByName('dean', 'web');
        $dean->syncPermissions([$local]);
        $person = User::factory()->create()->assignRole($dean)->givePermissionTo($personal);
        $faculty = Faculty::create(['name' => 'Faculté de test', 'code' => 'MIG']);
        $person->academicFaculties()->attach($faculty);
        $this->assertFalse($person->can('approve official documents'));
        $migration = require database_path(self::CATALOG);
        $migration->up();
        $migration->up();
        $this->assertTrue($person->fresh()->can('approve official documents'));
        $this->assertTrue($person->fresh()->can('local personal audit'));
        $this->assertTrue($person->fresh()->can('local archive review'));
        $this->assertEquals([$faculty->id], $person->academicFaculties()->pluck('faculties.id')->all());
        $this->assertEquals([$local->id], $admin->fresh()->permissions->pluck('id')->all());
        $this->assertEqualsCanonicalizing(UniversityRoles::GRANTS['registrar'], Role::findByName('registrar')->permissions->pluck('name')->all());
        $this->assertEqualsCanonicalizing(UniversityRoles::GRANTS['super-admin'], Role::findByName('super-admin')->permissions->pluck('name')->all());
        $this->assertDatabaseCount('model_has_roles', 1);
    }

    public function test_recovery_preserves_technical_membership_and_never_restores_unlimited_rights_to_new_holders(): void
    {
        $migration = require database_path(self::CATALOG);
        $migration->down();
        $role = Role::findOrCreate('super-admin', 'web');
        $person = User::factory()->create()->assignRole($role);
        $role->givePermissionTo('manage academic finance');
        $migration->up();
        $this->assertFalse($role->fresh()->hasPermissionTo('manage academic finance'));
        User::factory()->create()->assignRole($role);
        foreach ([$migration, require database_path(self::PLATFORM)] as $step) {
            try {
                $step->down();
                $this->fail('Restaurer automatiquement un partage ancien sans inventaire serait ambigu.');
            } catch (\RuntimeException $error) {
                $this->assertStringContainsString('sauvegarde vérifiée', $error->getMessage());
            }
        }
        $this->assertSame(1, DB::table('model_has_roles')->where('model_id', $person->id)->where('role_id', $role->id)->count());
        $this->assertFalse($person->fresh()->can('manage academic finance'));
        $this->assertDatabaseMissing('roles', ['name' => 'super admin', 'guard_name' => 'web']);
    }

    public function test_catalog_rollback_refuses_to_remove_a_new_permission_now_used_outside_its_roles(): void
    {
        $actor = User::factory()->create()->givePermissionTo('approve academic diplomas');
        try {
            (require database_path(self::CATALOG))->down();
            $this->fail('Une habilitation directe utilisée doit survivre.');
        } catch (\RuntimeException $error) {
            $this->assertStringContainsString('divergent', $error->getMessage());
        }
        $this->assertTrue($actor->fresh()->can('approve academic diplomas'));
    }

    public function test_new_installation_can_return_to_its_previous_schema_and_a_historical_merge_restores_exact_holders(): void
    {
        $catalog = require database_path(self::CATALOG);
        $platform = require database_path(self::PLATFORM);
        // MySQL commits DDL. RefreshDatabase rebuilds its isolated test schema after this test.
        if (DB::getDriverName() === 'mysql') {
            DB::connection()->commit();
        }
        $catalog->down();
        $platform->down();
        $this->assertFalse(Schema::hasTable('department_staff'));
        $this->assertFalse(Schema::hasTable(InstitutionalAclJournal::TABLE));
        $this->assertDatabaseMissing('roles', ['name' => 'super-admin']);
        $old = Role::findOrCreate('super admin', 'web');
        $canonical = Role::findOrCreate('super-admin', 'web');
        $historical = Permission::findOrCreate('local historical approval', 'web');
        $custom = Permission::findOrCreate('local technical archive', 'web');
        $old->givePermissionTo($historical);
        $canonical->givePermissionTo($custom);
        $one = User::factory()->create()->assignRole($old);
        $two = User::factory()->create()->assignRole($canonical)->givePermissionTo($custom);
        $platform->up();
        $catalog->up();
        $this->assertEqualsCanonicalizing([$one->id, $two->id], Role::findByName('super-admin')->users()->pluck('users.id')->all());
        $this->assertDatabaseMissing('roles', ['name' => 'super admin']);
        $catalog->down();
        $platform->down();
        $this->assertEquals([$one->id], Role::findByName('super admin')->users()->pluck('users.id')->all());
        $this->assertEquals([$two->id], Role::findByName('super-admin')->users()->pluck('users.id')->all());
        $this->assertEquals([$historical->id], $old->fresh()->permissions->pluck('id')->all());
        $this->assertEquals([$custom->id], $canonical->fresh()->permissions->pluck('id')->all());
        $this->assertDatabaseHas('model_has_permissions', ['model_id' => $two->id, 'permission_id' => $custom->id]);
    }

    public function test_unjournaled_prior_platform_migration_requires_the_verified_backup(): void
    {
        DB::table(InstitutionalAclJournal::TABLE)->where('step', 'platform')->delete();
        $this->expectExceptionMessage('sauvegarde vérifiée');
        (require database_path(self::PLATFORM))->down();
    }
}
