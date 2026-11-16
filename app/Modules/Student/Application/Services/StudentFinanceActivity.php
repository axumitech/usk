<?php

namespace App\Modules\Student\Application\Services;

use App\Models\Student\AcademicEnrollment;
use App\Models\Student\StudentPayment;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Str;

final class StudentFinanceActivity
{
    public function annual(array $statement): array
    {
        return [
            'obligations' => $statement['obligations'],
            'kinds' => $statement['kinds'],
            'kind_titles' => $statement['kind_titles'],
            'can_submit_proof' => true,
        ];
    }

    public function overview(AcademicEnrollment $entry, array $statement): array
    {
        $history = $this->payments($entry)->latest('id');
        $receipts = $this->payments($entry)->whereNotNull('confirmed_at')->latest('confirmed_at')->latest('id');
        $parameters = ['section' => 'transactions', 'academic' => $entry->id];

        return $this->annual($statement) + [
            'recent_payments' => $history->limit(4)->get()->map(fn ($payment) => $this->payment($entry, $payment, $statement['kind_titles'])),
            'receipt_payments' => $receipts->limit(4)->get()->map(fn ($payment) => $this->payment($entry, $payment, $statement['kind_titles'])),
            'history_url' => route('dashboard.student.index', $parameters, absolute: false),
            'receipts_url' => route('dashboard.student.index', $parameters + ['view' => 'receipts'], absolute: false),
        ];
    }

    public function transactions(AcademicEnrollment $entry, array $kindTitles, bool $receipts): LengthAwarePaginator
    {
        return $this->payments($entry)
            ->when($receipts, fn ($query) => $query->whereNotNull('confirmed_at')->latest('confirmed_at'))
            ->latest('id')->paginate(20, ['*'], 'payments_page')->withQueryString()
            ->through(fn ($payment) => $this->payment($entry, $payment, $kindTitles));
    }

    private function payments(AcademicEnrollment $entry): HasMany
    {
        return $entry->payments()->withSum(['refunds as refunded_cents' => fn ($query) => $query->where('status', 'executed')], 'amount_cents');
    }

    private function payment(AcademicEnrollment $entry, StudentPayment $payment, array $kindTitles): array
    {
        return [
            'id' => $payment->id,
            'uuid' => $payment->uuid,
            'reference' => $payment->reference,
            'kind' => $payment->kind,
            'kind_title' => $kindTitles[$payment->kind] ?? Str::ucfirst(str_replace('_', ' ', $payment->kind)),
            'amount_cents' => (int) $payment->amount_cents,
            'currency' => $payment->currency,
            'refunded_cents' => (int) $payment->refunded_cents,
            'status' => $payment->status,
            'method' => $payment->method,
            'created_at' => $payment->created_at,
            'confirmed_at' => $payment->confirmed_at,
            'receipt_url' => $payment->confirmed_at
                ? route('dashboard.student.payments.receipt', ['payment' => $payment->uuid, 'academic' => $entry->id], absolute: false)
                : null,
        ];
    }
}
