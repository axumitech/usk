<?php

use App\Support\UniversityRoles;
use Database\Migrations\Support\InstitutionalAclJournal;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

require_once __DIR__.'/support/InstitutionalAclJournal.php';

return new class extends Migration
{
    public function up(): void
    {
        $extra = ['approve academic graduation', 'approve academic diplomas'];
        $permissions = array_unique(array_merge($extra, ...array_values(UniversityRoles::GRANTS)));
        InstitutionalAclJournal::apply('catalog', array_keys(UniversityRoles::GRANTS), $permissions, function () use ($extra) {
            $inhabited = DB::table('users')->exists();
            foreach ($extra as $name) {
                Permission::findOrCreate($name, 'web');
            }
            foreach (UniversityRoles::GRANTS as $name => $grants) {
                $previous = Role::where(['name' => $name, 'guard_name' => 'web'])->first();
                $role = $previous ?? Role::findOrCreate($name, 'web');
                foreach ($grants as $permission) {
                    Permission::findOrCreate($permission, 'web');
                }
                if ($name === 'super-admin') {
                    $role->syncPermissions($grants);
                    continue;
                }
                // Legacy role grants can differ by installation, including intentional revocations.
                if ($inhabited && $previous && in_array($name, ['admin', 'user', 'student', 'candidate', 'professor'], true)) {
                    continue;
                }
                $role->givePermissionTo($grants);
            }
        });
    }

    public function down(): void
    {
        InstitutionalAclJournal::restore('catalog');
    }
};
