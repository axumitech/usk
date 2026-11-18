<?php

namespace App\Modules\Student\Application\Services;

use App\Models\Student\AcademicEnrollment;
use App\Models\Student\EnrollmentChange;
use App\Notifications\AcademicEnrollmentChanged;

final class EnrollmentFinancialConfirmation
{
    public function __construct(private StudentFinanceService $finance) {}

    public static function automatic(): bool
    {
        return (bool) config('student.enrollment_auto_confirmation') && (bool) config('student.enrollment_requires_first_installment');
    }

    public static function percentage(): ?int
    {
        $value = config('student.enrollment_activation_percentage');
        if (! is_int($value) && ! is_string($value)) {
            return null;
        }
        $percentage = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 100]]);

        return $percentage === false ? null : $percentage;
    }

    private function threshold(array $installment): array
    {
        $percentage = self::percentage();
        if ($percentage === null || ! in_array($installment['status'], ['due', 'covered'], true)) {
            return ['percentage' => $percentage, 'base_cents' => null, 'required_cents' => null, 'remaining_cents' => null];
        }
        $base = max(0, $installment['amount_cents'] - $installment['waived_cents']);
        // Round upwards to the next cent: the validated payment must reach at least the configured percentage.
        $required = intdiv($base, 100) * $percentage + intdiv(($base % 100) * $percentage + 99, 100);

        return ['percentage' => $percentage, 'base_cents' => $base, 'required_cents' => $required,
            'remaining_cents' => max(0, $required - $installment['paid_cents'])];
    }

    public function activation(AcademicEnrollment $entry, array $installment): ?array
    {
        if (! config('student.enrollment_requires_first_installment')) {
            return null;
        }
        $blocker = $this->blocker($entry, $installment);
        $administrativeHold = ! in_array($entry->enrollment_status, ['pending_confirmation', 'confirmed', 'completed'], true);
        if ($blocker === null && $administrativeHold) {
            $blocker = 'Une décision administrative est requise avant l’activation de cette inscription';
        }
        $action = null;
        if ($blocker !== null) {
            $action = match (true) {
                $entry->application?->status?->value !== 'validated',
                $entry->profile->student_status !== 'active',
                $entry->academicYear->status !== 'open',
                $administrativeHold => 'Contactez le service des inscriptions pour régulariser votre situation académique.',
                in_array($installment['status'], ['absent', 'invalid'], true), self::percentage() === null => 'Contactez le service financier pour régulariser cette condition.',
                default => 'Faites vérifier vos versements et leur affectation à la première tranche par le service financier.',
            };
        }

        return ['automatic' => self::automatic()] + $this->threshold($installment)
            + ['eligible' => $blocker === null, 'blocker' => $blocker, 'action_required' => $action];
    }

    public function blocker(AcademicEnrollment $entry, array $installment): ?string
    {
        $threshold = $this->threshold($installment);

        return match (true) {
            $entry->application?->status?->value !== 'validated' => 'Candidature à valider',
            $entry->profile->student_status !== 'active' => 'Profil étudiant inactif',
            $entry->academicYear->status !== 'open' => 'Année académique fermée',
            ! config('student.enrollment_requires_first_installment') => null,
            $installment['status'] === 'absent' => 'Barème de la première tranche à établir',
            $installment['status'] === 'invalid' => 'Barème de la première tranche à vérifier',
            $threshold['percentage'] === null => 'Le pourcentage d’activation doit être configuré entre 1 et 100',
            in_array($entry->enrollment_status, ['suspended', 'on_leave'], true) && $installment['status'] !== 'covered' => 'Première tranche à couvrir avant la reprise administrative',
            $threshold['remaining_cents'] > 0 => 'Seuil d’activation de '.$threshold['percentage'].' % de la première tranche à atteindre avec des paiements validés et affectés',
            default => null,
        };
    }

    public function apply(AcademicEnrollment $entry, ?int $actorId): void
    {
        if (! self::automatic() || $entry->enrollment_status !== 'pending_confirmation') {
            return;
        }
        $installment = $this->finance->firstTuitionInstallment($entry);
        if ($this->blocker($entry, $installment) !== null) {
            return;
        }
        $entry->update(['enrollment_status' => 'confirmed']);
        $this->record($entry, $actorId, 'pending_confirmation',
            'Seuil d’activation de '.self::percentage().' % de la première tranche atteint ; le solde financier reste dû.',
            activation: $this->threshold($installment) + ['paid_cents' => $installment['paid_cents'], 'waived_cents' => $installment['waived_cents']]);
    }

    public function record(AcademicEnrollment $entry, ?int $actorId, string $previous, string $reason, ?EnrollmentChange $change = null, ?array $activation = null): void
    {
        Audit::record($actorId, 'academic_enrollment_confirmed', $entry, $reason, [
            'from' => $previous, 'to' => 'confirmed', 'change_id' => $change?->id,
            'source' => $change === null ? 'automatic' : 'manual',
            'activation' => $activation,
        ] + ($change?->only(['before', 'after']) ?? []));
        $entry->profile->user->notify(new AcademicEnrollmentChanged([
            'academic_enrollment_id' => $entry->id, 'action' => 'transition', 'status' => 'confirmed', 'change_id' => $change?->id,
        ]));
    }
}
