<?php

namespace App\Modules\Identity\Infrastructure\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Identity\Application\UseCases\RequestPasswordReset;
use App\Modules\Identity\Application\UseCases\ResetPassword;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

class PasswordResetController extends Controller
{
    public function request()
    {
        return Inertia::render('dashboard/auth/ForgotPassword', ['status' => session('status')]);
    }

    public function send(Request $request, RequestPasswordReset $useCase)
    {
        try {
            $validated = $request->validate(['email' => 'required|email'], ['email.*' => 'Saisissez une adresse email valide.']);
        } catch (ValidationException $exception) {
            throw $exception->redirectTo(route('password.request'));
        }
        $useCase->execute($validated['email']);

        return to_route('password.request', status: 303)->with('status', 'Si un compte correspond à cette adresse, vous recevrez un lien de réinitialisation.');
    }

    public function form(string $token, Request $request)
    {
        return Inertia::render('dashboard/auth/ResetPassword', [
            'token' => $token,
            'email' => $request->query('email'),
        ]);
    }

    public function reset(Request $request, ResetPassword $useCase)
    {
        $token = $request->input('token');
        $email = $request->input('email');
        $url = is_string($token) && preg_match('/^[a-zA-Z0-9_-]{1,128}$/D', $token)
            ? route('password.reset', ['token' => $token, 'email' => is_string($email) && strlen($email) <= 255 ? $email : null])
            : route('password.request');
        try {
            $validated = $request->validate([
                'token' => 'required|string|max:128',
                'email' => 'required|email|max:255',
                'password' => 'required|string|min:8|confirmed',
            ], [
                'token.*' => 'Le lien est invalide ou expiré.',
                'email.*' => 'Saisissez une adresse email valide.',
                'password.required' => 'Saisissez un nouveau mot de passe.',
                'password.min' => 'Utilisez au moins huit caractères.',
                'password.confirmed' => 'Les mots de passe ne correspondent pas.',
            ]);
        } catch (ValidationException $exception) {
            throw $exception->redirectTo($url);
        }

        $success = $useCase->execute(
            $validated['email'],
            $validated['password'],
            $validated['token']
        );

        return $success
            ? to_route('login.show', status: 303)->with(['status' => 'Mot de passe réinitialisé.', 'success' => 'Mot de passe réinitialisé.'])
            : redirect()->to($url, 303)->withErrors(['email' => 'Le lien est invalide ou expiré.']);
    }
}
