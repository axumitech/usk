<?php

namespace App\Modules\Teaching\Application\Services;

use App\Models\AcademicYear;
use App\Models\Student\AcademicOffering;
use App\Models\Student\ContentSection;
use App\Models\User;
use App\Modules\Student\Application\Services\Audit;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class TeacherCourseOverview
{
    public function __construct(private LearningAccess $access) {}

    public function read(AcademicOffering $offering, bool $canEdit, array $period = []): array
    {
        $now = now();
        $sessions = $offering->sessions()->where('is_published', true)->whereNull('cancelled_at');
        $schedule = (clone $sessions)->selectRaw('COUNT(*) AS total, COUNT(CASE WHEN ends_at <= ? THEN 1 END) AS elapsed', [$now])->first();
        $catalogDescription = $offering->curriculumItem ? $offering->curriculumItem->description : $offering->course->description;

        return [
            'presentation' => $offering->teaching_presentation ?? $catalogDescription,
            'presentation_override' => $canEdit ? $offering->teaching_presentation : null,
            'objectives' => $offering->teaching_objectives,
            'revision' => $offering->teaching_overview_revision,
            'sections' => ContentSection::where('academic_offering_id', $offering->id)->orderBy('position')->orderBy('id')->get(['id', 'title']),
            'schedule' => [
                'elapsed' => (int) $schedule->elapsed,
                'total' => (int) $schedule->total,
                'next_at' => $sessions->where('starts_at', '>', $now)->orderBy('starts_at')->first(['starts_at'])?->starts_at,
            ],
            'update_url' => $canEdit ? route('dashboard.teaching.overview.update', ['offering' => $offering->id] + $period, false) : null,
        ];
    }

    public function update(User $actor, AcademicOffering $offering, array $data): void
    {
        DB::transaction(function () use ($actor, $offering, $data) {
            // Lock in the same order as teaching assignments and learning content updates.
            AcademicYear::orderBy('id')->lockForUpdate()->firstOrFail();
            $offering = AcademicOffering::lockForUpdate()->findOrFail($offering->id);
            abort_unless($this->access->canManage($actor, $offering), 403);

            if ($offering->teaching_overview_revision !== (int) $data['revision']) {
                throw ValidationException::withMessages(['revision' => 'La présentation du cours a changé. Rechargez la fiche avant de la modifier.']);
            }

            if ($offering->teaching_presentation === $data['presentation'] && $offering->teaching_objectives === $data['objectives']) {
                return;
            }

            $offering->forceFill([
                'teaching_presentation' => $data['presentation'],
                'teaching_objectives' => $data['objectives'],
                'teaching_overview_revision' => $offering->teaching_overview_revision + 1,
            ])->save();
            Audit::record($actor->id, 'teaching_overview_updated', $offering, data: ['revision' => $offering->teaching_overview_revision]);
        }, 3);
    }
}
