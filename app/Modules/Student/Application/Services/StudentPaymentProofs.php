<?php

namespace App\Modules\Student\Application\Services;

use App\Models\Student\AcademicEnrollment;
use App\Models\Student\StudentPayment;
use App\Models\Student\StudentPaymentProof;
use App\Models\User;
use App\Support\DocumentUploadLimit;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Arr;
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

        return [
            'submit_url' => route('dashboard.student.payments.proofs.store', ['academic' => $entry->id], false),
            'max_kb' => DocumentUploadLimit::kilobytes(),
            'methods' => config('finance.methods'),
            'kinds' => array_map(fn ($kind) => [
                'id' => $kind,
                'label' => $this->kindTitle($kind, $statement['kind_titles']),
            ] + Arr::only($statement['kinds'][$kind] ?? [], ['balance_cents', 'overdue_cents', 'currency']), $kinds),
            'selected_kind' => is_string($selectedKind) && in_array($selectedKind, $kinds, true) ? $selectedKind : null,
            'submissions' => StudentPaymentProof::where('academic_enrollment_id', $entry->id)
                ->with('payment:id,status')->latest('id')->get()
                ->map(fn (StudentPaymentProof $proof) => $this->row($proof, $statement['kind_titles'], 'dashboard.student.payments.proofs.download'))->all(),
        ];
    }

    public function adminRows(AcademicEnrollment $entry, array $kindTitles): array
    {
        return StudentPaymentProof::where('academic_enrollment_id', $entry->id)->with('payment:id,status')
            ->orderByRaw("CASE WHEN status = 'pending' THEN 0 ELSE 1 END")->latest('id')->get()
            ->map(fn (StudentPaymentProof $proof) => $this->adminRow($proof, $kindTitles))->all();
    }

    public function adminRow(StudentPaymentProof $proof, array $kindTitles = []): array
    {
        return $this->row($proof, $kindTitles, 'dashboard.admin.finance.proofs.download') + [
            'review_url' => $proof->status === 'pending' ? route('dashboard.admin.finance.proofs.review', $proof, false) : null,
            'payment_id' => $proof->student_payment_id,
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
        $path = $file->store('student-payment-proofs/'.$entry->id, 'local');
        abort_if($path === false, 503, 'Le justificatif n’a pas pu être enregistré. Réessayez dans un instant.');

        try {
            return DB::transaction(function () use ($entry, $actor, $data, $amount, $path) {
                $entry = AcademicEnrollment::lockForUpdate()->findOrFail($entry->id);
                $this->authorizeStudent($entry, $actor);
                if ($data['kind'] !== 'unallocated' && ! $entry->obligations()->where('kind', $data['kind'])->exists()) {
                    throw ValidationException::withMessages(['kind' => 'Choisissez des frais de cette inscription ou un versement à affecter.']);
                }
                if (StudentPaymentProof::where('academic_enrollment_id', $entry->id)->where('reference', $data['reference'])
                    ->whereIn('status', ['pending', 'accepted'])->exists()) {
                    throw ValidationException::withMessages(['reference' => 'Un justificatif pour cette référence figure déjà sur votre compte.']);
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

    public function review(StudentPaymentProof $proof, User $actor, string $decision, string $reason): string
    {
        $this->finance->authorize($proof->enrollment, $actor);

        return DB::transaction(function () use ($proof, $actor, $decision, $reason) {
            $entry = AcademicEnrollment::lockForUpdate()->findOrFail($proof->academic_enrollment_id);
            $proof = StudentPaymentProof::lockForUpdate()->findOrFail($proof->id);
            $this->finance->authorize($entry, $actor);
            if ($proof->status !== 'pending') {
                throw ValidationException::withMessages(['decision' => 'Ce justificatif a déjà été traité. Rechargez le compte pour voir sa décision.']);
            }

            $approved = $decision === 'approve';
            $payment = $approved ? $this->recognize($proof, $entry, $actor, $reason) : null;
            $proof->update([
                'status' => $approved ? 'accepted' : 'rejected',
                'student_payment_id' => $payment?->id,
                'reviewed_by' => $actor->id,
                'review_note' => $reason,
                'reviewed_at' => now(),
            ]);
            Audit::record($actor->id, $approved ? 'payment_proof_accepted' : 'payment_proof_rejected', $proof, $reason,
                $payment ? ['student_payment_id' => $payment->id] : []);

            return $this->status($proof);
        }, 3);
    }

    public function authorizeStudent(AcademicEnrollment $entry, User $actor): void
    {
        abort_unless($actor->hasRole('student') && (int) $entry->profile->user_id === (int) $actor->id, 404);
    }

    private function recognize(StudentPaymentProof $proof, AcademicEnrollment $entry, User $actor, string $reason): StudentPayment
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
            $this->finance->transition($payment, $actor, 'confirmed', $reason);
            $payment->refresh();
        }

        return $payment;
    }

    private function row(StudentPaymentProof $proof, array $kindTitles, string $downloadRoute): array
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
            'submitted_at' => $proof->created_at->toISOString(),
            'review_note' => match (true) {
                $proof->status === 'rejected' => $proof->review_note,
                $proof->status === 'accepted' && $status === 'rejected' => 'Le versement rattaché a été annulé par la comptabilité.',
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
            'confirmed', 'refunded' => 'confirmed',
            default => 'rejected',
        };
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
