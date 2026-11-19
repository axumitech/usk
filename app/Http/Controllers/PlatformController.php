<?php

namespace App\Http\Controllers;

use App\Models\AcademicStructure\University;
use App\Models\Student\AcademicAudit;
use App\Models\User;
use App\Modules\AcademicStructure\Application\Services\StructureService;
use App\Modules\Student\Application\Services\Audit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Spatie\Permission\PermissionRegistrar;

final class PlatformController
{
    public function index()
    {
        return Inertia::render('dashboard/platform/Index', [
            'institution' => University::where('context_key', 'current')->first(['code', 'name', 'acronym', 'revision']),
            'services' => [
                'Laravel' => app()->version(), 'PHP' => PHP_MAJOR_VERSION.'.'.PHP_MINOR_VERSION,
                'File de traitement' => config('queue.default'), 'Transport de courrier' => config('mail.default'),
            ],
            'events' => AcademicAudit::whereIn('action', ['academic_structure_university_saved', 'institutional_admin_granted', 'institutional_admin_revoked', 'platform_permission_cache_refreshed'])
                ->latest('id')->limit(25)->get(['id', 'action', 'created_at']),
        ]);
    }

    public function institution(Request $request, StructureService $service)
    {
        $data = $request->validate([
            'code' => ['required', 'alpha_dash', 'max:60'], 'name' => 'required|string|max:255',
            'acronym' => 'nullable|string|max:60', 'revision' => 'required|integer|min:0',
            'reason' => 'required|string|min:8|max:500',
        ]);
        $service->save('university', $data, $request->user());

        return back(303)->with('success', 'Identité institutionnelle enregistrée.');
    }

    public function delegate(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email|max:255', 'operation' => ['required', Rule::in(['grant', 'revoke'])],
            'reason' => 'required|string|min:8|max:500', 'current_password' => 'required|current_password:web',
        ]);
        DB::transaction(function () use ($data, $request) {
            // Serialize the last-administrator check across concurrent delegations.
            $admin = \Spatie\Permission\Models\Role::where(['name' => 'admin', 'guard_name' => 'web'])->lockForUpdate()->firstOrFail();
            $target = User::where('email', $data['email'])->lockForUpdate()->first();
            if (! $target || ! $target->hasVerifiedEmail() || $target->is($request->user())
                || $target->academicFaculties()->exists() || $target->getRoleNames()->diff(['user', 'admin'])->isNotEmpty()
                || $target->studentProfile()->exists() || $target->enrollments()->exists()) {
                throw ValidationException::withMessages(['email' => 'Un compte administratif dédié et vérifié est requis.']);
            }
            $grant = $data['operation'] === 'grant';
            if ($target->hasRole($admin) === $grant) {
                return;
            }
            if (! $grant && User::administrators()->role($admin)->whereDoesntHave('academicFaculties')->count() <= 1) {
                throw ValidationException::withMessages(['operation' => 'Conservez au moins un administrateur institutionnel.']);
            }
            if ($grant) {
                $target->assignRole($admin);
            } else {
                $target->removeRole($admin);
            }
            Audit::record($request->user()->id, $grant ? 'institutional_admin_granted' : 'institutional_admin_revoked', $target, $data['reason']);
        });

        return back(303)->with('success', 'Délégation institutionnelle enregistrée.');
    }

    public function refresh(Request $request, PermissionRegistrar $registrar)
    {
        $data = $request->validate(['reason' => 'required|string|min:8|max:500']);
        $registrar->forgetCachedPermissions();
        Audit::record($request->user()->id, 'platform_permission_cache_refreshed', $request->user(), $data['reason']);

        return back(303)->with('success', 'Cache des permissions actualisé.');
    }
}
