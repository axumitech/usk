<?php

namespace Database\Seeders;

use App\Support\UniversityRoles;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RolePermissionSeeder extends Seeder
{
    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        foreach (['approve academic graduation', 'approve academic diplomas'] as $permission) {
            Permission::findOrCreate($permission, 'web');
        }
        foreach (UniversityRoles::GRANTS as $name => $grants) {
            $role = Role::findOrCreate($name, 'web');
            foreach ($grants as $permission) {
                Permission::findOrCreate($permission, 'web');
            }
            if ($name === 'super-admin') {
                $role->syncPermissions($grants);
            } elseif ($name !== 'admin' || ! $role->users()->exists()) {
                $role->givePermissionTo($grants);
            }
        }
    }
}
