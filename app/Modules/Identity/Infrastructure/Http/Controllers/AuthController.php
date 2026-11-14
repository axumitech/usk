<?php

namespace App\Modules\Identity\Infrastructure\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Identity\Application\UseCases\LoginUser;
use App\Modules\Identity\Application\UseCases\RegisterUser;
use App\Modules\Identity\Domain\Exceptions\InvalidCredentialsException;
use App\Modules\Identity\Domain\Exceptions\TooManyLoginAttemptsException;
use App\Modules\Identity\Domain\Exceptions\UserNotFoundException;
use App\Modules\Identity\Domain\Nationality;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;

class AuthController extends Controller
{
    public function register(Request $request, RegisterUser $useCase)
    {
        $validated = $request->validate([
            'last_name' => 'required|string|max:255',
            'first_name' => 'required|string|max:255',
            'post_name' => 'nullable|string|max:255',
            'gender' => 'required|in:male,female,other',
            'nationality_code' => Nationality::rules(),
            'email' => 'required|email|unique:users',
            'password' => 'required|min:6|confirmed',
        ], Nationality::messages());

        $user = $useCase->execute(
            $validated['last_name'],
            $validated['first_name'],
            $validated['post_name'] ?? null,
            $validated['gender'],
            $validated['email'],
            $validated['password'],
            $validated['nationality_code'],
        );

        Auth::loginUsingId($user->id());
        $request->session()->regenerate();

        return redirect()->route('dashboard.index');
    }

    public function login(Request $request, LoginUser $useCase)
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        try {
            $userId = $useCase->execute($validated['email'], $validated['password']);
            Auth::loginUsingId($userId);
            $request->session()->regenerate();
            Inertia::clearHistory();
            Inertia::flash('dashboardArrival', true);

            return redirect()->intended(route('dashboard.index'));
        } catch (TooManyLoginAttemptsException $e) {
            return back()->withErrors([
                'email' => $e->getMessage(),
            ]);
        } catch (UserNotFoundException|InvalidCredentialsException $e) {
            return back()->withErrors(['email' => 'Identifiants invalides']);
        }
    }

    public function logout(Request $request)
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        Inertia::clearHistory();

        return redirect()->route('login.show');
    }

    public function showRegister()
    {

        return inertia('dashboard/auth/Signup', [
            'status' => session('status'),
            'nationalities' => Nationality::choices(),
        ]);
    }

    public function showLogin(Request $request)
    {
        if ($request->is('app/login')) {
            Inertia::clearHistory();
        }

        return inertia('dashboard/auth/Login', [
            'status' => session('status'),
        ]);
    }
}
