<?php

namespace App\Modules\Enrollment\Application\Services;

use App\Models\AcademicStructure\AdmissionCampaign;
use App\Models\AcademicYear;
use App\Models\Enrollment;
use App\Models\Faculty;
use App\Models\Level;

class AdmissionChoices
{
    public function forCandidate(?Enrollment $draft = null): array
    {
        $years = AcademicYear::where('status', 'open')->orderByDesc('start_date')->get();
        $levels = Level::with(['faculty', 'programs' => fn ($query) => $query->openForAdmission()
            ->select('academic_programs.id', 'academic_programs.faculty_id', 'academic_programs.name', 'academic_programs.code')])
            ->withExists('programs')
            ->where(fn ($query) => $query->admissible()->when($draft?->level_id, fn ($query, $id) => $query->orWhere('id', $id)))
            ->orderBy('id')->get();
        $campaigns = AdmissionCampaign::whereIn('academic_year_id', $years->modelKeys())
            ->whereIn('level_id', $levels->modelKeys())->get()
            ->keyBy(fn ($campaign) => $campaign->academic_program_id.':'.$campaign->academic_year_id.':'.$campaign->level_id);

        $contexts = [];
        foreach ($years as $year) {
            foreach ($levels as $level) {
                if (! $level->is_active || ! $level->faculty?->is_active
                    || ($year->university_id !== null && $level->faculty->university_id !== null
                        && (int) $year->university_id !== (int) $level->faculty->university_id)) {
                    continue;
                }
                // Keep legacy levels without a program; an inactive official program is not a legacy fallback.
                $programs = $level->programs->where('faculty_id', $level->faculty_id);
                $choices = $level->programs_exists ? $programs->modelKeys() : [null];
                foreach ($choices as $program) {
                    $campaign = $program === null ? null : $campaigns->get($program.':'.$year->id.':'.$level->id);
                    // Existing rule: a campaign constrains its context only when one has been configured.
                    if ($campaign && ! $campaign->acceptsApplications()) {
                        continue;
                    }
                    $contexts[] = ['year_id' => $year->id, 'faculty_id' => $level->faculty_id,
                        'academic_program_id' => $program, 'level_id' => $level->id];
                }
            }
        }

        return [
            'admissionContexts' => $contexts,
            'years' => $years->whereIn('id', array_unique(array_column($contexts, 'year_id')))->values()->map->only(['id', 'title']),
            'faculties' => Faculty::whereIn('id', $levels->pluck('faculty_id'))->orderBy('name')->get(['id', 'name']),
            'levelsByFaculty' => $levels->groupBy('faculty_id')->map(fn ($group) => $group->map(fn ($level) => [
                'id' => $level->id, 'title' => $level->title,
                'programs' => $level->programs->map->only(['id', 'name', 'code'])->values(),
            ])->values()),
        ];
    }
}
