<?php

namespace App\Modules\Identity\Infrastructure\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Identity\Application\UseCases\SocialLogin;
use App\Modules\Identity\Domain\Entities\User;
use App\Modules\Identity\Domain\Nationality;
use App\Modules\Identity\Infrastructure\Services\SocialiteService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;

class SocialAuthController extends Controller
{
    private const PENDING_REGISTRATION = 'social.registration';

    public function redirect(string $provider, SocialiteService $service)
    {
        return $service->redirect($provider);
    }

    public function callback(Request $request, string $provider, SocialiteService $service, SocialLogin $useCase)
    {
        $socialUser = $service->user($provider);
        $user = $useCase->execute($provider, $socialUser);

        if ($user) {
            return $this->login($request, $user);
        }

        $request->session()->regenerate();
        $request->session()->put(self::PENDING_REGISTRATION, [
            'provider' => $provider,
            'account' => $socialUser,
            'expires_at' => now()->addMinutes(10)->timestamp,
        ]);

        return to_route('social-registration.show');
    }

    public function showRegistration(Request $request)
    {
        if ($this->pendingRegistration($request) === null) {
            return to_route('login.show');
        }

        return Inertia::render('dashboard/auth/SocialRegistration', ['nationalities' => Nationality::choices()]);
    }

    public function completeRegistration(Request $request, SocialLogin $useCase)
    {
        $pending = $this->pendingRegistration($request);
        if ($pending === null) {
            return to_route('login.show');
        }

        $validated = $request->validate(['nationality_code' => Nationality::rules()], Nationality::messages());
        $user = $useCase->execute($pending['provider'], $pending['account'], $validated['nationality_code']);

        return $this->login($request, $user);
    }

    private function pendingRegistration(Request $request): ?array
    {
        $pending = $request->session()->get(self::PENDING_REGISTRATION);
        if ($pending === null || $pending['expires_at'] <= now()->timestamp) {
            $request->session()->forget(self::PENDING_REGISTRATION);

            return null;
        }

        return $pending;
    }

    private function login(Request $request, User $user)
    {
        $request->session()->forget(self::PENDING_REGISTRATION);
        Auth::loginUsingId($user->id());
        $request->session()->regenerate();
        Inertia::clearHistory();
        Inertia::flash('dashboardArrival', true);

        return redirect()->intended(route('dashboard.index'));
    }
}
