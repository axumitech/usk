<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

final class RestrictPlatformWorkspace
{
    public function handle(Request $request, Closure $next)
    {
        if ($request->user()?->hasRole('super-admin')) {
            abort_unless($request->routeIs('dashboard.index', 'dashboard.platform.*'), 403);
        }

        return $next($request);
    }
}
