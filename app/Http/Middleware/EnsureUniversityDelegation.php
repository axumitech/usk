<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

final class EnsureUniversityDelegation
{
    public function handle(Request $request, Closure $next)
    {
        $actor = $request->user();
        abort_unless($actor?->hasRole('admin'), 403);
        $areas = $actor->delegatedAreas();
        $name = (string) $request->route()->getName();
        $area = match ($name) {
            'dashboard.admin.student-academic.fees', 'dashboard.admin.student-academic.obligations',
            'dashboard.admin.student-academic.payments', 'dashboard.admin.student-academic.payments.status',
            'dashboard.admin.student-academic.adjustments', 'dashboard.admin.student-academic.adjustments.revoke' => 'finance',
            default => explode('.', $name)[2] ?? '',
        };
        abort_unless($areas === null || in_array($area, $areas, true), 403);

        return $next($request);
    }
}
