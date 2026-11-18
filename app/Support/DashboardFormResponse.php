<?php

namespace App\Support;

use Closure;
use Illuminate\Http\RedirectResponse;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

final class DashboardFormResponse
{
    public static function run(string $formUrl, Closure $action): RedirectResponse
    {
        try {
            return $action();
        } catch (ValidationException $exception) {
            throw $exception->redirectTo($formUrl);
        }
    }

    public static function success(string $url, string $message): RedirectResponse
    {
        Inertia::flash('dashboardAction', $message);

        return redirect()->to($url, 303)->with('success', $message);
    }
}
