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
        $area = explode('.', (string) $request->route()->getName())[2] ?? '';
        abort_unless($areas === null || in_array($area, $areas, true), 403);

        return $next($request);
    }
}
