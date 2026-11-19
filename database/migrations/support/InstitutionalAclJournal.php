<?php

namespace Database\Migrations\Support;

use Closure;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Spatie\Permission\PermissionRegistrar;

/** Retains only the roles and permissions changed by these two data migrations. */
final class InstitutionalAclJournal
{
    public const TABLE = 'institutional_acl_migration_journal';

    public static function apply(string $step, array $roles, array $permissions, Closure $change): void
    {
        if (! Schema::hasTable(self::TABLE)) {
            Schema::create(self::TABLE, function (Blueprint $table) {
                $table->string('step', 40)->primary();
                $table->longText('before_state');
                $table->longText('after_state');
            });
        }
        $cache = app(PermissionRegistrar::class);
        $cache->forgetCachedPermissions();
        try {
            DB::transaction(function () use ($step, $roles, $permissions, $change) {
                if (DB::table(self::TABLE)->where('step', $step)->lockForUpdate()->exists()) {
                    return;
                }
                $before = self::snapshot($roles, $permissions);
                $change();
                $after = self::snapshot($roles, $permissions);
                foreach ($before as $kind => $rows) {
                    foreach ($rows as $name => $value) {
                        $guardHistoricalHolder = $step === 'platform' && $kind === 'roles';
                        if (! $guardHistoricalHolder && $value === $after[$kind][$name]) {
                            unset($before[$kind][$name], $after[$kind][$name]);
                        }
                    }
                }
                DB::table(self::TABLE)->insert(['step' => $step, 'before_state' => json_encode($before, JSON_THROW_ON_ERROR),
                    'after_state' => json_encode($after, JSON_THROW_ON_ERROR)]);
            });
        } finally {
            $cache->forgetCachedPermissions();
        }
    }

    private static function snapshot(array $roleNames, array $permissionNames): array
    {
        $roles = array_fill_keys($roleNames, null);
        $rows = DB::table('roles')->where('guard_name', 'web')->whereIn('name', $roleNames)->get();
        $ids = $rows->pluck('id');
        $grants = DB::table('role_has_permissions')->whereIn('role_id', $ids)->orderBy('permission_id')->get()->groupBy('role_id');
        $holders = DB::table('model_has_roles')->whereIn('role_id', $ids)->orderBy('model_type')->orderBy('model_id')->get()->groupBy('role_id');
        foreach ($rows as $role) {
            $roles[$role->name] = ['role' => (array) $role, 'grants' => $grants->get($role->id, collect())->map(fn ($r) => (array) $r)->all(),
                'holders' => $holders->get($role->id, collect())->map(fn ($r) => (array) $r)->all()];
        }
        $permissions = array_fill_keys($permissionNames, null);
        foreach (DB::table('permissions')->where('guard_name', 'web')->whereIn('name', $permissionNames)->get() as $permission) {
            $permissions[$permission->name] = (array) $permission;
        }

        return compact('roles', 'permissions');
    }

    public static function restore(string $step): void
    {
        if (! Schema::hasTable(self::TABLE)) {
            throw self::unrecoverable();
        }
        try {
            DB::transaction(function () use ($step) {
                $record = DB::table(self::TABLE)->where('step', $step)->lockForUpdate()->first();
                if (! $record) {
                    throw self::unrecoverable();
                }
                $before = json_decode($record->before_state, true, 512, JSON_THROW_ON_ERROR);
                $after = json_decode($record->after_state, true, 512, JSON_THROW_ON_ERROR);
                if (self::snapshot(array_keys($after['roles']), array_keys($after['permissions'])) !== $after) {
                    throw self::unrecoverable();
                }
                $oldRoleIds = collect($before['roles'])->filter()->pluck('role.id')->all();
                $roleIds = collect($after['roles'])->filter()->pluck('role.id')->all();
                $newPermissions = collect($after['permissions'])->filter(fn ($p, $name) => $p && ! $before['permissions'][$name])->pluck('id')->all();
                if (DB::table('model_has_permissions')->whereIn('permission_id', $newPermissions)->exists()
                    || DB::table('role_has_permissions')->whereIn('permission_id', $newPermissions)->whereNotIn('role_id', $roleIds)->exists()) {
                    throw self::unrecoverable();
                }
                foreach (['role_has_permissions', 'model_has_roles'] as $pivot) {
                    DB::table($pivot)->whereIn('role_id', $roleIds)->delete();
                }
                DB::table('roles')->whereIn('id', array_diff($roleIds, $oldRoleIds))->delete();
                foreach (array_filter($before['roles']) as $state) {
                    $role = $state['role'];
                    DB::table('roles')->updateOrInsert(['id' => $role['id']], $role);
                    foreach (['role_has_permissions' => 'grants', 'model_has_roles' => 'holders'] as $pivot => $field) {
                        foreach (array_chunk($state[$field], 100) as $chunk) {
                            DB::table($pivot)->insert($chunk);
                        }
                    }
                }
                DB::table('permissions')->whereIn('id', $newPermissions)->delete();
                DB::table(self::TABLE)->where('step', $step)->delete();
            });
        } finally {
            app(PermissionRegistrar::class)->forgetCachedPermissions();
        }
    }

    private static function unrecoverable(): RuntimeException
    {
        return new RuntimeException('Journal des habilitations absent ou état divergent. Restaurez la sauvegarde vérifiée en maintenance.');
    }
}
