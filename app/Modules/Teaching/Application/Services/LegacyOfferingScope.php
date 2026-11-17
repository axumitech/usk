<?php

namespace App\Modules\Teaching\Application\Services;

use App\Models\AcademicStructure\CurriculumVersion;
use App\Models\Level;
use App\Models\Student\AcademicOffering;
use Illuminate\Support\Collection;

final class LegacyOfferingScope
{
    /** @return Collection<int, AcademicOffering> */
    public function forCurriculum(CurriculumVersion $version, ?int $yearId, array $relations = []): Collection
    {
        if ($yearId === null) {
            return collect();
        }

        $version->loadMissing('program.faculty', 'units.items');
        $program = $version->program;
        $subjectsByLevel = $version->units->groupBy('level_id')
            ->map(fn (Collection $units) => $units->flatMap(fn ($unit) => $unit->items->pluck('source_course_id'))->unique());
        $levels = Level::where('faculty_id', $program->faculty_id)->whereIn('id', $subjectsByLevel->keys())
            ->with('programs:id,faculty_id,academic_department_id')->get()->keyBy('id');

        return AcademicOffering::whereNull('curriculum_item_id')->whereNull('archived_at')->where('academic_year_id', $yearId)
            ->whereHas('academicYear', fn ($year) => $year->whereNull('university_id')->orWhere('university_id', $program->faculty->university_id))
            ->whereIn('level_id', $levels->keys())->whereIn('course_id', $subjectsByLevel->collapse()->unique())
            ->where(fn ($q) => $q->whereNull('academic_department_id')->orWhere('academic_department_id', $program->academic_department_id))
            ->with($relations)->with('group.promotion')->orderBy('id')->get()
            ->filter(function (AcademicOffering $offer) use ($program, $subjectsByLevel, $levels, $yearId) {
                if (! $subjectsByLevel[$offer->level_id]->contains($offer->course_id)) {
                    return false;
                }

                $group = $offer->group;
                if ($group && ((int) $group->faculty_id !== (int) $program->faculty_id || (int) $group->level_id !== (int) $offer->level_id)) {
                    return false;
                }
                if ($promotion = $group?->promotion) {
                    return (int) $promotion->academic_program_id === (int) $program->id
                        && (int) $promotion->academic_year_id === $yearId
                        && (int) $promotion->level_id === (int) $offer->level_id;
                }

                // A shared catalogue course cannot establish ownership of a broad historical audience.
                $programs = $levels[$offer->level_id]->programs->where('faculty_id', $program->faculty_id)
                    ->when($offer->academic_department_id !== null, fn ($rows) => $rows->where('academic_department_id', $offer->academic_department_id));

                return $programs->count() === 1 && (int) $programs->first()->id === (int) $program->id;
            })->values();
    }
}
