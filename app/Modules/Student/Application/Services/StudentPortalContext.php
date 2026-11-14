<?php

namespace App\Modules\Student\Application\Services;

use App\Models\AcademicYear;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\StudentProfile;
use App\Models\User;
use Illuminate\Support\Collection;

final class StudentPortalContext
{
    public function __construct(private AcademicAccessService $access) {}

    public function currentYearId(): ?int
    {
        $today = now('Africa/Kinshasa')->toDateString();
        $openYears = AcademicYear::where('status', 'open')->orderByDesc('start_date')->orderByDesc('id');

        return (clone $openYears)->where('start_date', '<=', $today)->where('end_date', '>=', $today)->value('id')
            ?? $openYears->value('id');
    }

    public function forEnrollment(AcademicEnrollment $entry, array $permissions, ?int $currentYearId): array
    {
        return $this->presentation($entry->profile, $entry, $this->enrollments($entry->profile), $permissions, $currentYearId);
    }

    public function forAccount(User $user, ?int $requestedAcademicId): ?array
    {
        $profile = $user->studentProfile;
        if (! $profile) {
            return null;
        }

        $currentYearId = $this->currentYearId();
        $enrollments = $this->enrollments($profile);
        $entry = $enrollments->firstWhere('id', $requestedAcademicId)
            ?? $enrollments->firstWhere('academic_year_id', $currentYearId)
            ?? $enrollments->first();
        $permissions = $entry ? $this->access->permissions($entry) : [];

        return $this->presentation($profile, $entry, $enrollments, $permissions, $currentYearId);
    }

    private function enrollments(StudentProfile $profile): Collection
    {
        return $profile->enrollments()->whereHas('application')->with(['level.faculty', 'academicYear'])
            ->orderByDesc(AcademicYear::select('start_date')->whereColumn('academic_years.id', 'academic_enrollments.academic_year_id'))
            ->orderByDesc('id')->get();
    }

    private function presentation(
        StudentProfile $profile,
        ?AcademicEnrollment $entry,
        Collection $enrollments,
        array $permissions,
        ?int $currentYearId,
    ): array {
        $user = $profile->user;

        return [
            'name' => implode(' ', array_filter([$user->first_name, $user->post_name, $user->last_name])),
            'matricule' => $entry?->matricule ?? $profile->matricule,
            'photo_url' => $entry ? $this->photoUrl($profile, $entry) : null,
            'academic_id' => $entry?->id,
            'current_year_id' => $currentYearId,
            'options' => $enrollments->map(fn (AcademicEnrollment $option) => [
                'id' => $option->id,
                'year_id' => $option->academic_year_id,
                'year' => $option->academicYear->title,
                'label' => $option->level->title.' · '.$option->level->faculty->name.' · '.$option->academicYear->title,
                'is_current' => $option->academic_year_id === $currentYearId,
            ])->all(),
            'permissions' => $permissions,
        ];
    }

    private function photoUrl(StudentProfile $profile, AcademicEnrollment $entry): ?string
    {
        if ($profile->photo_path) {
            return route('dashboard.student.profile.photo', ['academic' => $entry->id, 'v' => $profile->updated_at->timestamp], false);
        }

        $photo = $entry->application->documents()->where('key', 'like', '%photo%')
            ->where('review_status', 'accepted')->where('mime', 'like', 'image/%')->first();

        return $photo ? route('dashboard.enrollments.documents.preview', $photo->uuid, false) : null;
    }
}
