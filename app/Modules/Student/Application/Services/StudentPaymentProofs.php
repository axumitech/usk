<?php

namespace App\Modules\Student\Application\Services;

use App\Models\Student\AcademicAudit;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\StudentPayment;
use App\Models\Student\StudentPaymentProof;
use App\Models\Student\StudentProfile;
use App\Models\User;
use App\Support\DocumentUploadLimit;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

final class StudentPaymentProofs
{
    public function __construct(private StudentFinanceService $finance) {}

    public function studentProps(AcademicEnrollment $entry, array $statement, mixed $selectedKind = null): array
    {
        $kinds = collect($statement['obligations'])->pluck('kind')->push('unallocated')->unique()->values()->all();
        $proofs = $this->forAccount($entry)->latest('id')->get();
        $cancellations = $this->cancellationDates($proofs);

        return [
            'submit_url' => route('dashboard.student.payments.proofs.store', ['academic' => $entry->id], false),
            'max_kb' => DocumentUploadLimit::kilobytes(),
            'methods' => config('finance.methods'),
            'kinds' => array_map(fn ($kind) => [
                'id' => $kind,
                'label' => $this->kindTitle($kind, $statement['kind_titles']),
            ] + Arr::only($statement['kinds'][$kind] ?? [], ['balance_cents', 'overdue_cents', 'currency']), $kinds),
            'selected_kind' => is_string($selectedKind) && in_array($selectedKind, $kinds, true) ? $selectedKind : null,
            'submissions' => $proofs->map(fn (StudentPaymentProof $proof) => $this->row(
                $proof, $statement['kind_titles'], 'dashboard.student.payments.proofs.download', $cancellations[$proof->student_payment_id] ?? null,
            ))->all(),
        ];
    }

    public function adminRows(AcademicEnrollment $entry, array $kindTitles, User $actor): array
    {
        $proofs = $this->forAccount($entry)
            ->orderByRaw("CASE WHEN status = 'pending' THEN 0 ELSE 1 END")->latest('id')->get();
        $cancellations = $this->cancellationDates($proofs);
        $matchedPayments = $entry->payments()->whereIn('reference', $proofs->where('status', 'pending')->pluck('reference'))
            ->get(['id', 'reference', 'status', 'recorded_by'])->keyBy('reference');
        $similarReceipts = [];
        $dualControl = (bool) config('finance.dual_control');

        return $proofs->map(function (StudentPaymentProof $proof) use ($entry, $actor, $kindTitles, $cancellations, $matchedPayments, $dualControl, &$similarReceipts) {
            $payment = $matchedPayments->get($proof->reference);
            $mayConfirm = $proof->status === 'pending' && $payment?->status !== 'confirmed'
                && (! $dualControl || ($payment?->status === 'pending' && (int) $payment->recorded_by !== (int) $actor->id));
            $group = implode(':', [$proof->kind, $proof->amount_cents, $proof->method]);

            return $this->adminRow($proof, $kindTitles, $cancellations[$proof->student_payment_id] ?? null) + [
                'requires_distinct_receipt_verification' => $mayConfirm && ($similarReceipts[$group] ??= $this->finance->hasSimilarConfirmedReceipt(
                    $entry, $proof->kind, $proof->amount_cents, $proof->method, $payment?->id,
                )),
            ];
        })->all();
    }

    public function adminRow(StudentPaymentProof $proof, array $kindTitles = [], ?string $cancelledAt = null): array
    {
        return $this->row($proof, $kindTitles, 'dashboard.admin.finance.proofs.download', $cancelledAt) + [
            'review_url' => $proof->status === 'pending' ? route('dashboard.admin.finance.proofs.review', $proof, false) : null,
            'payment_id' => $proof->student_payment_id,
            'decision_reason' => $proof->review_note,
        ];
    }

    public function pendingFor(User $actor): Builder
    {
        abort_unless($actor->hasRole('admin') && $actor->can('manage academic finance'), 403);

        return StudentPaymentProof::whereHas('enrollment', fn (Builder $entries) => AcademicStaffScope::apply($entries, $actor))
            ->where(fn ($proofs) => $proofs->where('status', 'pending')
                ->orWhere(fn ($staged) => $staged->where('status', 'accepted')->whereHas('payment', fn ($payments) => $payments->where('status', 'pending'))));
    }

    public function submit(AcademicEnrollment $entry, User $actor, array $data, UploadedFile $file): StudentPaymentProof
    {
        $this->authorizeStudent($entry, $actor);
        $amount = Money::cents(str_replace(',', '.', $data['amount']));
        if ($amount <= 0) {
            throw ValidationException::withMessages(['amount' => 'Indiquez un montant supérieur à zéro.']);
        }
        $fingerprint = hash_file('sha256', $file->getPathname());
        $path = $file->store('student-payment-proofs/'.$entry->id, 'local');
        abort_if($path === false, 503, 'Le justificatif n’a pas pu être enregistré. Réessayez dans un instant.');

        try {
            return DB::transaction(function () use ($entry, $actor, $data, $amount, $path, $fingerprint) {
                $entry = AcademicEnrollment::lockForUpdate()->findOrFail($entry->id);
                $this->authorizeStudent($entry, $actor);
                if ($data['kind'] !== 'unallocated' && ! $entry->obligations()->where('kind', $data['kind'])->exists()) {
                    throw ValidationException::withMessages(['kind' => 'Choisissez des frais de cette inscription ou un versement à affecter.']);
                }
                if (StudentPaymentProof::where('academic_enrollment_id', $entry->id)->where('reference', $data['reference'])
                    ->whereIn('status', ['pending', 'accepted'])->exists()) {
                    throw ValidationException::withMessages(['reference' => 'Un justificatif pour cette référence figure déjà sur votre compte.']);
                }
                if ($fingerprint && $fingerprint !== hash('sha256', '')) {
                    StudentProfile::lockForUpdate()->findOrFail($entry->student_profile_id);
                    if ($this->hasActiveCopy($entry, $fingerprint)) {
                        throw ValidationException::withMessages(['proof' => 'Ce fichier figure déjà parmi vos justificatifs en vérification ou acceptés.']);
                    }
                }
                $proof = StudentPaymentProof::create([
                    'academic_enrollment_id' => $entry->id,
                    'kind' => $data['kind'],
                    'amount_cents' => $amount,
                    'currency' => $entry->currency,
                    'method' => $data['method'],
                    'reference' => $data['reference'],
                    'file_path' => $path,
                    'status' => 'pending',
                ]);
                Audit::record($actor->id, 'payment_proof_submitted', $proof);

                return $proof;
            }, 3);
        } catch (Throwable $error) {
            Storage::disk('local')->delete($path);

            throw $error;
        }
    }

    private function hasActiveCopy(AcademicEnrollment $entry, string $fingerprint): bool
    {
        $disk = Storage::disk('local');
        $copies = StudentPaymentProof::whereHas('enrollment', fn ($query) => $query
            ->where('student_profile_id', $entry->student_profile_id)
            ->where('academic_year_id', $entry->academic_year_id))
            ->whereIn('status', ['pending', 'accepted'])
            ->pluck('file_path');
        foreach ($copies as $copy) {
            if ($disk->exists($copy) && $disk->checksum($copy, ['checksum_algo' => 'sha256']) === $fingerprint) {
                return true;
            }
        }

        return false;
    }

    public function review(
        StudentPaymentProof $proof,
        User $actor,
        string $decision,
        string $reason,
        ?string $reasonCode = null,
        bool $distinctReceiptVerified = false,
    ): string
    {
        $this->finance->authorize($proof->enrollment, $actor);

        return DB::transaction(function () use ($proof, $actor, $decision, $reason, $reasonCode, $distinctReceiptVerified) {
            $entry = AcademicEnrollment::lockForUpdate()->findOrFail($proof->academic_enrollment_id);
            $proof = StudentPaymentProof::lockForUpdate()->findOrFail($proof->id);
            $this->finance->authorize($entry, $actor);
            if ($proof->status !== 'pending') {
                throw ValidationException::withMessages(['decision' => 'Ce justificatif a déjà été traité. Rechargez le compte pour voir sa décision.']);
            }

            $approved = $decision === 'approve';
            $payment = $approved ? $this->recognize($proof, $entry, $actor, $reason, $distinctReceiptVerified) : null;
            $proof->update([
                'status' => $approved ? 'accepted' : 'rejected',
                'student_payment_id' => $payment?->id,
                'reviewed_by' => $actor->id,
                'review_note' => $reason,
                'reviewed_at' => now(),
            ]);
            Audit::record($actor->id, $approved ? 'payment_proof_accepted' : 'payment_proof_rejected', $proof, $reason, array_filter([
                'student_payment_id' => $payment?->id,
                'reason_code' => $reasonCode,
            ]));

            return $this->status($proof);
        }, 3);
    }

    public function authorizeStudent(AcademicEnrollment $entry, User $actor): void
    {
        abort_unless($actor->hasRole('student') && (int) $entry->profile->user_id === (int) $actor->id, 404);
    }

    private function recognize(
        StudentPaymentProof $proof,
        AcademicEnrollment $entry,
        User $actor,
        string $reason,
        bool $distinctReceiptVerified,
    ): StudentPayment
    {
        if ($proof->currency !== $entry->currency) {
            throw ValidationException::withMessages(['decision' => 'La devise de l’inscription a changé depuis le dépôt. Vérifiez le justificatif avant de le traiter.']);
        }
        $payment = $this->finance->record($entry, $actor, [
            'kind' => $proof->kind,
            'amount' => Money::decimal($proof->amount_cents),
            'method' => $proof->method,
            'reference' => $proof->reference,
            'note' => 'Versement vérifié à partir du justificatif étudiant n°'.$proof->id.'.',
        ]);
        if (! in_array($payment->status, ['pending', 'confirmed'], true)
            || StudentPaymentProof::where('student_payment_id', $payment->id)->exists()) {
            throw ValidationException::withMessages(['decision' => 'Cette écriture a été annulée, remboursée ou rattachée à un autre justificatif. Vérifiez la référence.']);
        }
        if ($payment->status === 'pending' && (! config('finance.dual_control') || (int) $payment->recorded_by !== (int) $actor->id)) {
            $this->finance->transition($payment, $actor, 'confirmed', $reason, distinctReceiptVerified: $distinctReceiptVerified);
            $payment->refresh();
        }

        return $payment;
    }

    private function row(StudentPaymentProof $proof, array $kindTitles, string $downloadRoute, ?string $cancelledAt): array
    {
        $status = $this->status($proof);

        return [
            'id' => $proof->id,
            'kind_label' => $this->kindTitle($proof->kind, $kindTitles),
            'amount_cents' => $proof->amount_cents,
            'currency' => $proof->currency,
            'method' => $proof->method,
            'reference' => $proof->reference,
            'status' => $status,
            'proof_status' => $proof->status,
            'payment_status' => $proof->payment?->status,
            'history' => $this->history($proof, $cancelledAt),
            'submitted_at' => $proof->created_at->toISOString(),
            'review_note' => match (true) {
                $proof->status === 'rejected' => $proof->review_note,
                $proof->status === 'accepted' && $status === 'pending' => 'Justificatif vérifié. Le versement attend la confirmation d’un autre agent.',
                default => null,
            },
            'download_url' => route($downloadRoute, $proof, false),
        ];
    }

    private function status(StudentPaymentProof $proof): string
    {
        if ($proof->status !== 'accepted') {
            return $proof->status;
        }

        return match ($proof->payment?->status) {
            'pending' => 'pending',
            'confirmed' => 'confirmed',
            default => 'accepted',
        };
    }

    private function forAccount(AcademicEnrollment $entry): Builder
    {
        return StudentPaymentProof::where('academic_enrollment_id', $entry->id)->with([
            'payment:id,status,created_at,confirmed_at',
            'payment.refunds' => fn ($refunds) => $refunds
                ->select('id', 'student_payment_id', 'executed_at', 'amount_cents')->where('status', 'executed'),
        ]);
    }

    private function cancellationDates(Collection $proofs): Collection
    {
        $ids = $proofs->filter(fn (StudentPaymentProof $proof) => $proof->payment?->status === 'cancelled')->pluck('student_payment_id');
        if ($ids->isEmpty()) {
            return collect();
        }

        return AcademicAudit::where('entity_type', 'student_payments')->where('action', 'payment_cancelled')
            ->whereIn('entity_id', $ids)->orderBy('id')->pluck('created_at', 'entity_id')
            ->map(fn ($date) => Carbon::parse($date)->toISOString());
    }

    private function history(StudentPaymentProof $proof, ?string $cancelledAt): array
    {
        $payment = $proof->payment;
        $events = [['event' => 'proof_submitted', 'at' => $proof->created_at->toISOString()]];
        if ($proof->reviewed_at !== null) {
            $events[] = ['event' => 'proof_'.$proof->status, 'at' => $proof->reviewed_at->toISOString()];
        }
        if ($payment?->created_at !== null) {
            $events[] = ['event' => 'payment_recorded', 'at' => $payment->created_at->toISOString()];
        }
        if ($payment?->confirmed_at !== null) {
            $events[] = ['event' => 'payment_confirmed', 'at' => $payment->confirmed_at->toISOString()];
        }
        if ($payment?->status === 'cancelled') {
            $events[] = ['event' => 'payment_cancelled', 'at' => $cancelledAt];
        }
        foreach ($payment?->relationLoaded('refunds') ? $payment->refunds : [] as $refund) {
            $events[] = ['event' => 'refund_executed', 'at' => $refund->executed_at?->toISOString(), 'amount_cents' => (int) $refund->amount_cents];
        }

        return collect($events)->sortBy(fn (array $event) => $event['at'] ?? '9999')->values()->all();
    }

    private function kindTitle(string $kind, array $kindTitles): string
    {
        return $kindTitles[$kind] ?? match ($kind) {
            'tuition' => 'Frais académiques',
            'unallocated' => 'Versement à affecter',
            default => Str::ucfirst(str_replace('_', ' ', $kind)),
        };
    }
}
