<?php

use App\Support\UniversityRoles;
use Database\Migrations\Support\InstitutionalAclJournal;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

require_once __DIR__.'/support/InstitutionalAclJournal.php';

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('department_staff')) {
            Schema::create('department_staff', function (Blueprint $table) {
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->foreignId('department_id')->constrained('academic_departments')->cascadeOnDelete();
                $table->primary(['user_id', 'department_id']);
            });
        }

        InstitutionalAclJournal::apply('platform', ['super admin', 'super-admin'], UniversityRoles::GRANTS['super-admin'], function () {
            $old = Role::where(['name' => 'super admin', 'guard_name' => 'web'])->first();
            if (! $old) {
                return;
            }
            $role = Role::where(['name' => 'super-admin', 'guard_name' => 'web'])->first();
            if (! $role) {
                $old->update(['name' => 'super-admin']);
                $role = $old;
            } else {
                $assignments = DB::table('model_has_roles')->where('role_id', $old->id);
                foreach ($assignments->cursor() as $assignment) {
                    DB::table('model_has_roles')->insertOrIgnore([
                        'role_id' => $role->id, 'model_type' => $assignment->model_type, 'model_id' => $assignment->model_id,
                    ]);
                }
                $old->delete();
            }
            foreach (UniversityRoles::GRANTS['super-admin'] as $name) {
                Permission::findOrCreate($name, 'web');
            }
            $role->syncPermissions(UniversityRoles::GRANTS['super-admin']);
        });
    }

    public function down(): void
    {
        if (DB::table('department_staff')->exists()) {
            throw new RuntimeException('Des délégations départementales ont été ajoutées. Restaurez la sauvegarde vérifiée en maintenance.');
        }
        InstitutionalAclJournal::restore('platform');
        Schema::drop('department_staff');
        if (! DB::table(InstitutionalAclJournal::TABLE)->exists()) {
            Schema::drop(InstitutionalAclJournal::TABLE);
        }
    }
};
