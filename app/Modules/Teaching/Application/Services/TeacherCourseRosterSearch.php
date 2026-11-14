<?php

namespace App\Modules\Teaching\Application\Services;

use Illuminate\Database\Eloquent\Builder;

final class TeacherCourseRosterSearch
{
    public static function apply(Builder $roster, string $search): Builder
    {
        $words = preg_split('/\s+/u', $search, -1, PREG_SPLIT_NO_EMPTY);
        if (! $words) {
            return $roster;
        }

        $pattern = static fn (string $value): string => '%'.mb_strtolower(strtr($value, ['!' => '!!', '%' => '!%', '_' => '!_'])).'%';
        $matricule = $pattern($search);

        return $roster->where(function (Builder $matches) use ($words, $pattern, $matricule) {
            $matches->whereHas('profile.user', function (Builder $name) use ($words, $pattern) {
                foreach ($words as $word) {
                    $like = $pattern($word);
                    $name->where(fn (Builder $part) => $part->whereRaw("LOWER(first_name) LIKE ? ESCAPE '!'", [$like])
                        ->orWhereRaw("LOWER(last_name) LIKE ? ESCAPE '!'", [$like]));
                }
            })->orWhereRaw("LOWER(academic_enrollments.matricule) LIKE ? ESCAPE '!'", [$matricule])
                ->orWhere(fn (Builder $fallback) => $fallback->whereNull('academic_enrollments.matricule')
                    ->whereHas('profile', fn (Builder $profile) => $profile->whereRaw("LOWER(matricule) LIKE ? ESCAPE '!'", [$matricule])));
        });
    }
}
