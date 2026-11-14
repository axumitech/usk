<?php

namespace App\Modules\Identity\Application\UseCases;

use App\Modules\Identity\Domain\Entities\User;
use App\Modules\Identity\Domain\Nationality;
use App\Modules\Identity\Domain\Repositories\UserRepository;
use Illuminate\Validation\ValidationException;

final class SocialLogin
{
    public function __construct(private UserRepository $repo) {}

    public function execute(string $provider, array $socialUser, ?string $nationalityCode = null): ?User
    {
        if (($socialUser['email_verified'] ?? false) !== true || ! filter_var($socialUser['email'] ?? null, FILTER_VALIDATE_EMAIL)) {
            throw ValidationException::withMessages(['email' => 'Le fournisseur doit confirmer votre adresse email. Utilisez la connexion par mot de passe.']);
        }
        $existing = $this->repo->findByEmail($socialUser['email']);

        if ($existing) {
            if (! $existing->isVerified()) {
                throw ValidationException::withMessages(['email' => 'Confirmez votre compte existant avant toute connexion externe.']);
            }

            return $existing;
        }

        if ($nationalityCode === null) {
            return null;
        }

        if (Nationality::label($nationalityCode) === null) {
            throw ValidationException::withMessages(['nationality_code' => Nationality::messages()['nationality_code.in']]);
        }

        $user = User::registerFromSocial(
            $provider,
            $socialUser['id'],
            $socialUser['last_name'],
            $socialUser['first_name'],
            $socialUser['email'],
            $nationalityCode,
        );

        return $this->repo->save($user);
    }
}
