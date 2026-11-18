<?php

namespace App\Modules\Student\Infrastructure\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Validator;

final class FinanceScreenReturn
{
    private const ACCOUNT = 'dashboard.admin.finance.index';

    private const DIRECTORY = 'dashboard.admin.student-academic.index';

    public static function forPayment(Request $request, int $academic): string
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
        $referer = parse_url($request->headers->get('referer') ?? '');
        $previous = [];
        if (($referer['host'] ?? null) === $request->getHost()
            && ($referer['path'] ?? null) === route(self::ACCOUNT, [], false)) {
            parse_str($referer['query'] ?? '', $previous);
            if (($previous['academic'] ?? null) !== (string) $academic) {
                $previous = [];
            }
        }

        $source = $request->boolean('finance_return') ? $request->all() + $previous : $previous;
        $filters = self::filters($source, [
            'q' => 'string|max:150', 'year' => 'integer|exists:academic_years,id',
            'faculty' => 'integer|exists:faculties,id', 'program' => 'integer|exists:academic_programs,id',
            'level' => 'integer|exists:levels,id', 'from_confirmations' => 'in:1',
            'confirmation_q' => 'string|max:150', 'confirmation_page' => 'integer|min:1',
            'from_proofs' => 'in:1', 'page' => 'integer|min:1', 'payments_page' => 'integer|min:1',
            'refunds_page' => 'integer|min:1', 'adjustments_page' => 'integer|min:1',
        ]);

        return route(self::ACCOUNT, ['academic' => $academic] + $filters, false);
    }

    private static function filters(array $input, array $rules): array
    {
        $values = array_filter(Arr::only($input, array_keys($rules)), fn ($value) => is_string($value) || is_int($value));
        $validator = Validator::make($values, $rules);
        $validator->passes();

        return $validator->valid();
    }
}
