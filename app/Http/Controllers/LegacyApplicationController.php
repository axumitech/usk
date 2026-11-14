<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

final class LegacyApplicationController
{
    public function __invoke(Request $request): RedirectResponse
    {
        $path = match ($request->path()) {
            'dashboard/auth/login' => '/login',
            'dashboard/auth/signup' => '/register',
            default => $request->getPathInfo(),
        };
        $query = $request->server('QUERY_STRING');

        // Keep the original method and body for clients using an old form or endpoint.
        return redirect('/app'.$path.($query ? '?'.$query : ''), 307);
    }
}
