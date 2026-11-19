<?php

namespace App\Http\Middleware;

use App\Models\AcademicStructure\AcademicProgram;
use App\Models\AdmissionCondition;
use App\Models\Level;
use App\Models\LevelDetail;
use App\Modules\Teaching\Application\Services\TeachingScope;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

final class AuthorizeLevelManagement
{
    public function handle(Request $request, Closure $next)
    {
        $course = $request->routeIs('*.details.courses.*');
        $ability = $request->isMethodSafe() ? 'viewAny' : ($course ? 'curriculum' : 'manage');
        Gate::authorize($ability, AcademicProgram::class);
        $facultyIds = [];
        $id = $request->route('id');
        if ($request->routeIs('*.admission-conditions.*') && $id !== null) {
            $condition = AdmissionCondition::with('level:id,faculty_id')->findOrFail($id);
            $facultyIds[] = $condition->faculty_id;
            $facultyIds[] = $condition->level?->faculty_id;
            abort_if(! $condition->faculty_id && ! $condition->level && $request->user()->academicFaculties()->exists(), 403);
        } elseif ($request->routeIs('*.details.update')) {
            $facultyIds[] = LevelDetail::findOrFail($id)->level()->firstOrFail()->faculty_id;
        } elseif ($id !== null) {
            $facultyIds[] = Level::findOrFail($id)->faculty_id;
        }
        if ($level = $request->route('level')) {
            $facultyIds[] = ($level instanceof Level ? $level : Level::findOrFail($level))->faculty_id;
        }
        if (! $request->isMethodSafe()) {
            $facultyIds[] = $request->integer('faculty_id');
            if ($destination = $request->integer('level_id')) {
                $facultyIds[] = Level::whereKey($destination)->value('faculty_id');
            }
        }
        foreach (array_unique(array_filter($facultyIds)) as $facultyId) {
            abort_unless(TeachingScope::allows($request->user(), (int) $facultyId), 403);
        }

        return $next($request);
    }
}
