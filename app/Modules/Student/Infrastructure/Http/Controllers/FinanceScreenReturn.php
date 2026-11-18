<?php

namespace App\Modules\Student\Infrastructure\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

final class FinanceScreenReturn
{
    private const ACCOUNT = 'dashboard.admin.finance.index';

    private const DIRECTORY = 'dashboard.admin.student-academic.index';

    private const LIST_FILTERS = [
        'q' => 'string|max:150', 'year' => 'integer|exists:academic_years,id',
        'faculty' => 'integer|exists:faculties,id', 'program' => 'integer|exists:academic_programs,id',
        'level' => 'integer|exists:levels,id',
    ];

    public static function forEnrollment(Request $request, int $academic): string
    {
        if (! $request->boolean('academic_return')) {
            return self::account($request, $academic);
        }

        $filters = self::filters($request->all(), [
            'q' => 'string|max:150', 'year' => 'integer|exists:academic_years,id',
            'faculty' => 'integer|exists:faculties,id', 'program' => 'integer|exists:academic_programs,id',
            'department' => 'integer|exists:academic_departments,id', 'level' => 'integer|exists:levels,id',
            'view' => 'in:table,grid', 'history' => 'in:1',
            'enrollment_status' => 'in:pending_confirmation,confirmed,completed,suspended,cancelled,on_leave',
        ]);

        return route(self::DIRECTORY, ['academic' => $academic, 'tab' => 'finance'] + $filters, false);
    }

    public static function account(Request $request, int $academic): string
    {
        $source = $request->boolean('finance_return') ? $request->all() : [];
        $filters = self::filters($source, self::LIST_FILTERS + [
            'from_confirmations' => 'in:1', 'confirmation_q' => 'string|max:150', 'confirmation_page' => 'integer|min:1',
            'from_proofs' => 'in:1', 'page' => 'integer|min:1', 'payments_page' => 'integer|min:1',
            'refunds_page' => 'integer|min:1', 'adjustments_page' => 'integer|min:1',
        ]);

        return route(self::ACCOUNT, ['academic' => $academic] + $filters, false);
    }

    public static function listing(Request $request): string
    {
        return route(self::ACCOUNT, self::filters($request->query(), self::LIST_FILTERS), false).'#reconciliation';
    }

    public static function update(string $url, int $academic, \Closure $operation): RedirectResponse
    {
        try {
            $message = $operation();
        } catch (ValidationException $exception) {
            throw $exception->redirectTo($url);
        }

        return self::completed($url, $academic, $message);
    }

    public static function completed(string $url, int $academic, string $message): RedirectResponse
    {
        Inertia::flash('financePayment', ['accountId' => $academic, 'message' => $message]);

        return redirect()->to($url, 303)->with('success', $message);
    }

    private static function filters(array $input, array $rules): array
    {
        $values = array_filter(Arr::only($input, array_keys($rules)), fn ($value) => is_string($value) || is_int($value));
        $validator = Validator::make($values, $rules);
        $validator->passes();

        return $validator->valid();
    }
}
