<?php

namespace Database\Seeders\RecetteV2;

use App\Models\AcademicYear;
use App\Models\Enrollment;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\FinanceTariff;
use App\Models\Student\StudentObligation;
use App\Models\User;
use App\Modules\Documents\Application\DocumentPdf;
use App\Modules\Enrollment\Application\DTOs\SaveProgressDTO;
use App\Modules\Enrollment\Application\DTOs\SubmitEnrollmentDTO;
use App\Modules\Enrollment\Application\UseCases\ReviewEnrollment;
use App\Modules\Enrollment\Application\UseCases\SaveProgressUseCase;
use App\Modules\Enrollment\Application\UseCases\SubmitEnrollmentUseCase;
use App\Modules\Enrollment\Application\UseCases\ValidateEnrollmentUseCase;
use App\Modules\Enrollment\Domain\Enums\EnrollmentStatus;
use App\Modules\Enrollment\Domain\Services\EnrollmentValidator;
use App\Modules\Student\Application\Services\AcademicEnrollmentService;
use App\Modules\Student\Application\Services\FeeTariffService;
use App\Modules\Student\Application\Services\PaymentAllocationService;
use App\Modules\Student\Application\Services\StudentFinanceService;
use App\Modules\Student\Application\Services\StudentScolarite;
use App\Modules\Student\Application\Services\StudentServiceCatalog;
use App\Modules\Teaching\Application\Services\CourseRegistrationService;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/** Data builder called only after the dedicated local recette seeder's safety checks. */
final class StudentFinanceFixtures
{
    private const REASON = 'Recette locale V2 exclusivement fictive ; aucun tarif ni document officiel.';

    private ?string $pdf = null;

    /** @return array<string, AcademicEnrollment> */
    public function historical(array $users, array $catalog): array
    {
        $this->tariffs($users['admin'], $catalog, 'past');
        $entries = [];
        foreach (['etudiant.med' => 'med', 'etudiant.med2' => 'med', 'etudiant.med3' => 'med', 'etudiant.droit' => 'droit', 'etudiant.droit2' => 'droit'] as $key => $faculty) {
            $entry = $this->admit($users[$key], $users['admin'], $catalog, 'past', $faculty);
            $this->pay($entry, $users['finance.'.$faculty], $users['admin'], '100.00', $this->firstObligation($entry), 'past-'.$key);
            $this->register($entry->refresh(), $users['admin'], $catalog, 'past', $faculty, 'L1');
            $this->assertCase($entry, 'confirmed', 10000, 0);
            $entries[$key] = $entry->refresh();
        }

        return $entries;
    }

    /** Called after the historical workflow has created the witness's L2 renewal. */
    public function current(array $users, array $catalog, AcademicEnrollment $witness): array
    {
        $admin = $users['admin'];
        $this->tariffs($admin, $catalog, 'current');
        $entries = [];
        foreach (['etudiant.med2' => 'med', 'etudiant.med3' => 'med', 'etudiant.droit' => 'droit', 'etudiant.droit2' => 'droit', 'etudiant.droit3' => 'droit', 'etudiant.droit4' => 'droit'] as $key => $faculty) {
            $entries[$key] = $this->admit($users[$key], $admin, $catalog, 'current', $faculty);
        }

        $this->pay($entries['etudiant.med3'], $users['finance.med'], $admin, '20.00', $this->firstObligation($entries['etudiant.med3']), 'current-etudiant.med3');
        $this->pay($entries['etudiant.droit'], $users['finance.droit'], $admin, '30.00', $this->firstObligation($entries['etudiant.droit']), 'current-etudiant.droit');
        $this->register($entries['etudiant.droit']->refresh(), $admin, $catalog, 'current', 'droit', 'L1');

        $other = $entries['etudiant.droit2'];
        if (! $other->obligations()->where('kind', 'recette_admin')->exists()) {
            app(StudentFinanceService::class)->addObligation($other, $users['finance.droit'], [
                'kind' => 'recette_admin', 'installment' => 1, 'amount' => '30.00',
                'title' => 'Autre obligation fictive de recette (hors scolarité)',
                'due_at' => $catalog['current_year']->end_date, 'reason' => self::REASON,
            ]);
        }
        $this->pay($other, $users['finance.droit'], $admin, '30.00', $other->obligations()->where('kind', 'recette_admin')->sole(), 'current-etudiant.droit2-other');
        $this->pay($entries['etudiant.droit3'], $users['finance.droit'], $admin, '100.00', $this->firstObligation($entries['etudiant.droit3']), 'current-etudiant.droit3');
        // No course registration for E: its missing pedagogical registration remains observable.

        app(StudentFinanceService::class)->adjust($entries['etudiant.droit4'], $users['finance.droit'], [
            'type' => 'reduction', 'fee_kind' => 'tuition', 'amount' => '20.00', 'funding_source' => 'institution',
            'starts_at' => $catalog['current_year']->start_date, 'expires_at' => $catalog['current_year']->end_date,
            'reason' => self::REASON.' Aide approuvée sans paiement ; le seuil net reste exigé.',
            'operation_key' => $this->operation('aid-etudiant.droit4'),
        ]);

        if ((int) $witness->academic_year_id !== (int) $catalog['current_year']->id || (int) $witness->level_id !== (int) $catalog['levels']['med']['L2']->id) {
            throw new RuntimeException('La réinscription témoin doit provenir du workflow de progression vers la nouvelle L2.');
        }
        $this->assignGroup($witness, $admin, $catalog, 'current', 'med', 'L2');
        if (! app(FeeTariffService::class)->applyToEnrollment($witness, $admin->id) && ! $witness->obligations()->where('kind', 'tuition')->exists()) {
            throw new RuntimeException('Le barème fictif L2 doit être établi avant de financer la réinscription témoin.');
        }
        $this->pay($witness, $users['finance.med'], $admin, '30.00', $this->firstObligation($witness), 'current-etudiant.med-L2');
        $this->register($witness->refresh(), $admin, $catalog, 'current', 'med', 'L2');
        $entries['etudiant.med'] = $witness;

        app(StudentScolarite::class)->submit($entries['etudiant.med2'], StudentServiceCatalog::find(StudentServiceCatalog::ENROLLMENT_EXCEPTION), [
            'body' => self::REASON.' Demande d’examen en cours pour une inscription non activée ; aucun effet académique ou financier automatique.',
            'operation_key' => $this->operation('request-etudiant.med2'),
        ], null, $users['etudiant.med2']->id);

        foreach ([
            'etudiant.med2' => ['pending_confirmation', 0, 10000],
            'etudiant.med3' => ['pending_confirmation', 2000, 8000],
            'etudiant.droit' => ['confirmed', 3000, 7000],
            'etudiant.droit2' => ['pending_confirmation', 0, 10000],
            'etudiant.droit3' => ['confirmed', 10000, 0],
            'etudiant.droit4' => ['pending_confirmation', 0, 8000],
            'etudiant.med' => ['confirmed', 3000, 7000],
        ] as $key => [$status, $paid, $remaining]) {
            $this->assertCase($entries[$key], $status, $paid, $remaining);
            $entries[$key]->refresh();
        }

        return $entries;
    }

    private function tariffs(User $admin, array $catalog, string $phase): void
    {
        /** @var AcademicYear $year */
        $year = $catalog[$phase === 'past' ? 'past_year' : 'current_year'];
        foreach (['med', 'droit'] as $faculty) {
            foreach (['L1', 'L2'] as $level) {
                $scope = ['academic_year_id' => $year->id, 'level_id' => $catalog['levels'][$faculty][$level]->id, 'kind' => 'tuition', 'category' => 'national', 'currency' => 'USD'];
                $tariff = FinanceTariff::where($scope)->first();
                if (! $tariff) {
                    $tariff = app(FeeTariffService::class)->create($admin, $scope + [
                        'title' => 'RECETTE V2 — '.$year->title.' '.$faculty.' '.$level.' (100 USD fictifs)',
                        'valid_from' => $year->start_date, 'valid_until' => $year->end_date,
                        'schedule' => [['amount' => '100.00', 'due_at' => $year->end_date]], 'reason' => self::REASON,
                    ]);
                }
                app(FeeTariffService::class)->activate($tariff, $admin, self::REASON);
            }
        }
    }

    private function admit(User $user, User $admin, array $catalog, string $phase, string $faculty): AcademicEnrollment
    {
        $year = $catalog[$phase === 'past' ? 'past_year' : 'current_year'];
        $level = $catalog['levels'][$faculty]['L1'];
        $program = $catalog['programs'][$faculty];
        $application = Enrollment::where('student_id', $user->id)->where('academic_year_id', $year->id)->where('level_id', $level->id)->first();
        if (! $application || $application->status === EnrollmentStatus::DRAFT) {
            $snapshot = [
                'year_id' => $year->id, 'faculty_id' => $catalog['faculties'][$faculty]->id, 'academic_program_id' => $program->id,
                'level_id' => $level->id, 'name' => $user->full_name, 'email' => $user->email, 'program' => $program->name,
                'isConfirmed' => true, 'documents' => $application?->form_snapshot['documents'] ?? [],
            ];
            $application = app(SaveProgressUseCase::class)->execute(new SaveProgressDTO($application?->uuid, $user->id, 3, $snapshot));
            $pdf = $this->documentPdf();
            foreach (array_keys(app(EnrollmentValidator::class)->requiredDocuments($application)) as $key) {
                if ($application->documents()->where('key', $key)->exists()) {
                    continue;
                }
                $path = 'recette-v2/enrollments/'.$application->uuid.'/'.$key.'.pdf';
                if (! Storage::disk('local')->put($path, $pdf)) {
                    throw new RuntimeException('Impossible de préparer la pièce fictive de recette.');
                }
                $application->documents()->create([
                    'key' => $key, 'type' => 'document', 'disk' => 'local', 'path' => $path,
                    'filename' => 'RECETTE-FICTIVE-'.$key.'.pdf', 'mime' => 'application/pdf', 'size_bytes' => strlen($pdf),
                    'sha256' => hash('sha256', $pdf), 'is_temp' => true, 'verified' => false, 'review_status' => 'pending', 'version' => 1,
                ]);
            }
            $snapshot['documents'] = $application->documents()->get()->mapWithKeys(fn ($document) => [$document->key => $document->only(['uuid', 'filename', 'mime', 'size_bytes'])])->all();
            $application = app(SaveProgressUseCase::class)->execute(new SaveProgressDTO($application->uuid, $user->id, 4, $snapshot));
            $application = app(SubmitEnrollmentUseCase::class)->execute(new SubmitEnrollmentDTO($application->uuid, $user->id, self::REASON));
        }
        if ($application->status !== EnrollmentStatus::VALIDATED) {
            app(ReviewEnrollment::class)->start($application->id, $admin->id);
            foreach ($application->documents()->get() as $document) {
                app(ReviewEnrollment::class)->document($application->id, $document->uuid, $admin->id, 'accepted', null, []);
            }
            $application = app(ValidateEnrollmentUseCase::class)->execute($application->id, $admin->id, self::REASON);
        }
        $entry = AcademicEnrollment::where('application_id', $application->id)->where('academic_year_id', $year->id)->sole();
        app(StudentFinanceService::class)->assess($entry, $admin, 'national', reason: self::REASON);
        $this->assignGroup($entry->refresh(), $admin, $catalog, $phase, $faculty, 'L1');

        return $entry->refresh();
    }

    private function assignGroup(AcademicEnrollment $entry, User $admin, array $catalog, string $phase, string $faculty, string $level): void
    {
        $group = $catalog['groups'][$phase][$faculty][$level];
        $department = $catalog['departments'][$faculty];
        if ((int) $entry->class_id !== (int) $group->id || (int) $entry->academic_department_id !== (int) $department->id) {
            app(AcademicEnrollmentService::class)->transition($entry, $admin, [
                'enrollment_status' => $entry->enrollment_status, 'expected_status' => $entry->enrollment_status,
                'expected_context' => AcademicEnrollmentService::contextToken($entry), 'class_id' => $group->id,
                'academic_department_id' => $department->id,
                'operation_key' => $this->operation('group-'.$entry->id.'-'.$group->id), 'reason' => self::REASON,
            ]);
            $entry->refresh();
        }
    }

    private function firstObligation(AcademicEnrollment $entry): StudentObligation
    {
        return $entry->obligations()->where('kind', 'tuition')->where('installment', 1)->sole();
    }

    private function pay(AcademicEnrollment $entry, User $recorder, User $confirmer, string $amount, StudentObligation $obligation, string $key): void
    {
        $finance = app(StudentFinanceService::class);
        $payment = $finance->record($entry, $recorder, [
            'kind' => 'unallocated', 'method' => 'bank_transfer', 'amount' => $amount,
            'reference' => 'RECETTE-V2-'.strtoupper($key), 'note' => self::REASON.' Aucun transfert bancaire réel.',
        ]);
        $finance->transition($payment, $confirmer, 'confirmed', self::REASON);
        app(PaymentAllocationService::class)->allocate($payment->refresh(), $confirmer, [
            ['obligation_id' => $obligation->id, 'amount' => $amount],
        ], self::REASON);
    }

    private function register(AcademicEnrollment $entry, User $admin, array $catalog, string $phase, string $faculty, string $level): void
    {
        foreach ($catalog['offerings'][$phase][$faculty][$level] as $offering) {
            app(CourseRegistrationService::class)->register($offering, $entry, $admin, 'mandatory', self::REASON);
        }
    }

    private function assertCase(AcademicEnrollment $entry, string $status, int $paid, int $remaining): void
    {
        $entry->refresh();
        $first = app(StudentFinanceService::class)->firstTuitionInstallment($entry);
        if ($entry->enrollment_status !== $status || $first['paid_cents'] !== $paid || $first['remaining_cents'] !== $remaining) {
            throw new RuntimeException('Le scénario financier fictif ne correspond pas à la transition attendue : inscription '.$entry->id.'.');
        }
    }

    private function operation(string $key): string
    {
        $hash = hash('sha256', 'USK-RECETTE-V2-'.$key);

        return substr($hash, 0, 8).'-'.substr($hash, 8, 4).'-5'.substr($hash, 13, 3).'-8'.substr($hash, 17, 3).'-'.substr($hash, 20, 12);
    }

    private function documentPdf(): string
    {
        return $this->pdf ??= app(DocumentPdf::class)->render(
            '<!doctype html><html lang="fr"><body><h1>RECETTE USK — DOCUMENT FICTIF</h1>'
            .'<p>Pièce de démonstration pour le contrôle documentaire local. Aucune valeur administrative ou universitaire.</p></body></html>'
        );
    }
}
