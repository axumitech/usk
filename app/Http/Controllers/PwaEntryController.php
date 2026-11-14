<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

final class PwaEntryController
{
    public function __invoke(Request $request): RedirectResponse
    {
        return to_route($request->user() ? 'dashboard.index' : 'login.show');
    }
}
