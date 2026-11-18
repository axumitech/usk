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
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

class AuthController extends Controller
{
    public function register(Request $request, RegisterUser $useCase)
    {
        try {
            $validated = $request->validate([
                'last_name' => 'required|string|max:255',
                'first_name' => 'required|string|max:255',
                'post_name' => 'nullable|string|max:255',
                'gender' => 'required|in:male,female,other',
                'nationality_code' => Nationality::rules(),
                'email' => 'required|email|unique:users',
                'password' => 'required|string|min:6|confirmed',
            ], [
                ...Nationality::messages(),
                'required' => 'Renseignez le champ « :attribute ».',
                'string' => 'Le champ « :attribute » doit contenir du texte.',
                'max' => 'Le champ « :attribute » ne peut pas dépasser :max caractères.',
                'gender.in' => 'Sélectionnez une valeur dans la liste.',
                'email.email' => 'Saisissez une adresse email valide.',
                'email.unique' => 'Cette adresse email ne peut pas être utilisée.',
                'password.min' => 'Le mot de passe doit contenir au moins :min caractères.',
                'password.confirmed' => 'Les mots de passe ne correspondent pas.',
            ], [
                'last_name' => 'nom',
                'first_name' => 'prénom',
                'post_name' => 'post-nom',
                'gender' => 'genre',
                'email' => 'adresse email',
                'password' => 'mot de passe',
            ]);
        } catch (ValidationException $exception) {
            throw $exception->redirectTo(route('register.show'));
        }

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
        try {
            $validated = $request->validate([
                'email' => 'required|email',
                'password' => 'required|string',
            ], [
                'email.required' => 'Saisissez votre adresse email.',
                'email.email' => 'Saisissez une adresse email valide.',
                'password.required' => 'Saisissez votre mot de passe.',
                'password.string' => 'Saisissez un mot de passe valide.',
            ]);

            $userId = $useCase->execute($validated['email'], $validated['password']);
            Auth::loginUsingId($userId);
            $request->session()->regenerate();
            Inertia::clearHistory();
            Inertia::flash('dashboardArrival', true);

            return redirect()->intended(route('dashboard.index'));
        } catch (ValidationException $exception) {
            throw $exception->redirectTo(route('login.show'));
        } catch (TooManyLoginAttemptsException $e) {
            return to_route('login.show')->withErrors([
                'email' => $e->getMessage(),
            ]);
        } catch (UserNotFoundException|InvalidCredentialsException) {
            return to_route('login.show')->withErrors(['email' => 'Identifiants invalides']);
        }
    }

    public function logout(Request $request)
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        Inertia::clearHistory();

        return redirect()->route('login.show')->with('success', 'Déconnexion réussie.');
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
