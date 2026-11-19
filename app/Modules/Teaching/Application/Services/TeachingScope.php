<?php

namespace App\Modules\Teaching\Application\Services;

use App\Models\Professor;
use App\Models\Student\AcademicOffering;
use App\Models\Student\TeachingAssignment;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

final class TeachingScope
{
    public static function allows(User $actor, int $faculty): bool
    {
        return ! $actor->academicFaculties()->exists() || $actor->academicFaculties()->whereKey($faculty)->exists();
    }

    public static function authorize(User $actor, int $faculty, string $permission = 'publish academic content'): void
    {
        abort_unless($actor->hasRole('admin') && $actor->can($permission) && self::allows($actor, $faculty), 403);
    }

    public static function offerings(User $actor): Builder
    {
        return AcademicOffering::query()->when($actor->academicFaculties()->exists(), fn ($query) => $query
            ->whereHas('level', fn ($levels) => $levels->whereIn('faculty_id', $actor->academicFaculties()->select('faculties.id'))));
    }

    public static function professors(User $actor): Builder
    {
        $facultyIds = $actor->academicFaculties()->pluck('faculties.id');
        if ($facultyIds->isEmpty()) {
            return Professor::query();
        }

        $offers = AcademicOffering::whereHas('level', fn ($levels) => $levels->whereIn('faculty_id', $facultyIds))
            ->whereNull('archived_at')->whereHas('academicYear', fn ($years) => $years->whereIn('status', ['draft', 'open']));
        $members = TeachingAssignment::whereIn('academic_offering_id', (clone $offers)->select('id'))
            ->where(fn ($query) => $query->whereNull('starts_at')->orWhere('starts_at', '<=', now()))
            ->where(fn ($query) => $query->whereNull('ends_at')->orWhere('ends_at', '>', now()));

        return Professor::where(fn ($query) => $query
            ->whereIn('professors.id', DB::table('professor_assignments')->whereIn('faculty_id', $facultyIds)->select('professor_id'))
            ->orWhereIn('professors.id', (clone $offers)->select('professor_id'))
            ->orWhereIn('professors.id', (clone $offers)->select('assistant_professor_id'))
            ->orWhereIn('professors.id', $members->select('professor_id')));
    }

    public static function canManageProfiles(User $actor): bool
    {
        return $actor->hasRole(['admin']) && $actor->can('manage users') && ! $actor->academicFaculties()->exists();
    }
}
