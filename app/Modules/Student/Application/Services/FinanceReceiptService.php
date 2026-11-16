<?php

namespace App\Modules\Student\Application\Services;

use App\Models\AcademicStructure\University;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\StudentPayment;
use App\Modules\Documents\Application\DocumentPdf;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;

final class FinanceReceiptService
{
    private const LOCAL_TIMEZONE = 'Africa/Kinshasa';

    public function __construct(private DocumentPdf $documents) {}

    public function capture(StudentPayment $payment, AcademicEnrollment $entry): void
    {
        if ($payment->receipt_snapshot || ! $payment->confirmed_at) {
            return;
        }
        FinanceMutation::run(fn () => $payment->update(['receipt_snapshot' => [
            'reference' => $payment->reference, 'uuid' => $payment->uuid, 'amount_cents' => (int) $payment->amount_cents, 'currency' => $payment->currency, 'method' => $payment->method,
            'name' => trim(implode(' ', array_filter([$entry->profile->user->last_name, $entry->profile->user->post_name, $entry->profile->user->first_name]))),
            'matricule' => $entry->profile->matricule ?? $entry->matricule, 'faculty' => $entry->level->faculty->name, 'level' => $entry->level->title, 'year' => $entry->academicYear->title,
            'institution' => University::where('context_key', 'current')->value('name') ?? config('app.name'), 'confirmed_at' => $payment->confirmed_at->toIso8601String(), 'confirmed_by' => $payment->confirmed_by,
            'kind_title' => $this->kindTitle($entry, $payment->kind),
        ]]));
    }

    public function present(StudentPayment $payment, AcademicEnrollment $entry): array
    {
        $snapshot = $payment->receipt_snapshot ?? [];
        $amount = (int) ($snapshot['amount_cents'] ?? $payment->amount_cents);
        $refunded = $this->executedRefunds($payment);
        $state = $this->state($payment, $refunded);
        $method = $snapshot['method'] ?? $payment->method;
        $verificationUrl = URL::signedRoute('finance.receipts.verify', ['payment' => $payment->uuid, 'format' => 'html']);

        return [
            'institution' => $snapshot['institution'] ?? config('app.name'),
            'reference' => $snapshot['reference'] ?? $payment->reference,
            'uuid' => $payment->uuid,
            'name' => $snapshot['name'] ?? $entry->profile->user->full_name,
            'matricule' => $snapshot['matricule'] ?? $entry->profile->matricule ?? $entry->matricule ?? 'Non renseigné',
            'faculty' => $snapshot['faculty'] ?? $entry->level->faculty->name,
            'level' => $snapshot['level'] ?? $entry->level->title,
            'year' => $snapshot['year'] ?? $entry->academicYear->title,
            'kind_title' => $snapshot['kind_title'] ?? $this->kindTitle($entry, $payment->kind),
            'method' => match ($method) {
                'cash' => 'Espèces',
                'bank_transfer' => 'Virement bancaire',
                'mobile_money' => 'Mobile Money',
                'card' => 'Carte bancaire',
                'cheque' => 'Chèque',
                'other' => 'Autre moyen vérifié',
                default => $method,
            },
            'confirmed_at' => $payment->confirmed_at->copy()->timezone(self::LOCAL_TIMEZONE)->format('d/m/Y à H:i'),
            'currency' => $snapshot['currency'] ?? $payment->currency,
            'amount_cents' => $amount,
            'refunded_cents' => $refunded,
            'net_cents' => in_array($state, ['paid', 'partially_refunded'], true) ? max(0, $amount - $refunded) : 0,
            'state' => $state,
            'verification_url' => $verificationUrl,
            'qr_image' => $this->documents->qr($verificationUrl),
        ];
    }

    public function verify(StudentPayment $payment, bool $localDate = false): array
    {
        $issuedAt = $localDate ? $payment->confirmed_at->copy()->timezone(self::LOCAL_TIMEZONE) : $payment->confirmed_at;

        return [
            'receipt' => $payment->uuid,
            'state' => match ($this->state($payment, $this->executedRefunds($payment))) {
                'paid' => 'valid',
                'partially_refunded' => 'partially_refunded',
                default => 'invalid',
            },
            'issued_at' => $issuedAt->toDateString(),
        ];
    }

    private function executedRefunds(StudentPayment $payment): int
    {
        return (int) $payment->refunds()->where('status', 'executed')->sum('amount_cents');
    }

    private function state(StudentPayment $payment, int $refunded): string
    {
        if ($payment->status === 'refunded' && $refunded > 0) {
            return 'refunded';
        }
        if ($payment->status !== 'confirmed') {
            return 'invalid';
        }
        if ($refunded === 0) {
            return 'paid';
        }

        return $refunded < (int) $payment->amount_cents ? 'partially_refunded' : 'refunded';
    }

    private function kindTitle(AcademicEnrollment $entry, string $kind): string
    {
        return match ($kind) {
            'tuition' => 'Frais académiques',
            'unallocated' => 'Versement général',
            default => $this->obligationTitle($entry, $kind),
        };
    }

    private function obligationTitle(AcademicEnrollment $entry, string $kind): string
    {
        $obligations = $entry->obligations()->where('kind', $kind)
            ->orderByRaw('CASE WHEN due_at IS NULL THEN 1 ELSE 0 END')->orderBy('due_at')->orderBy('installment')->orderBy('id')
            ->limit(2)->get(['title', 'source_snapshot']);
        $first = $obligations->first();

        return $first?->source_snapshot['title']
            ?? ($obligations->count() === 1 ? $first->title : Str::ucfirst(str_replace('_', ' ', $kind)));
    }
}
