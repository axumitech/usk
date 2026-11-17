<?php

namespace App\Modules\Student\Application\Services;

use App\Models\Student\AcademicEnrollment;
use App\Models\Student\EnrollmentChange;
use App\Notifications\AcademicEnrollmentChanged;

final class EnrollmentFinancialConfirmation
{
    public function __construct(private StudentFinanceService $finance) {}

    public function blocker(AcademicEnrollment $entry, array $installment): ?string
    {
        return match (true) {
            $entry->application?->status?->value !== 'validated' => 'Candidature à valider',
            $entry->profile->student_status !== 'active' => 'Profil étudiant inactif',
            $entry->academicYear->status !== 'open' => 'Année académique fermée',
            ! config('student.enrollment_requires_first_installment') => null,
            $installment['status'] === 'absent' => 'Barème de la première tranche à établir',
            $installment['status'] === 'invalid' => 'Barème de la première tranche à vérifier',
            $installment['status'] !== 'covered' => 'Première tranche à couvrir',
            default => null,
        };
    }

    public function apply(AcademicEnrollment $entry, ?int $actorId): void
    {
        if (! config('student.enrollment_auto_confirmation') || ! config('student.enrollment_requires_first_installment')
            || $entry->enrollment_status !== 'pending_confirmation'
            || $this->blocker($entry, $this->finance->firstTuitionInstallment($entry)) !== null) {
            return;
        }
        $entry->update(['enrollment_status' => 'confirmed']);
        $this->record($entry, $actorId, 'pending_confirmation', 'Première tranche des frais académiques entièrement couverte.');
    }

    public function record(AcademicEnrollment $entry, ?int $actorId, string $previous, string $reason, ?EnrollmentChange $change = null): void
    {
        Audit::record($actorId, 'academic_enrollment_confirmed', $entry, $reason, [
            'from' => $previous, 'to' => 'confirmed', 'change_id' => $change?->id,
            'source' => $change === null ? 'automatic' : 'manual',
        ] + ($change?->only(['before', 'after']) ?? []));
        $entry->profile->user->notify(new AcademicEnrollmentChanged([
            'academic_enrollment_id' => $entry->id, 'action' => 'transition', 'status' => 'confirmed', 'change_id' => $change?->id,
        ]));
    }
}
