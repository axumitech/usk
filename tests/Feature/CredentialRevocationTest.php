<?php

namespace Tests\Feature;

use App\Models\User;
use App\Modules\Identity\Application\Services\RevokeCredentials;
use App\Modules\Identity\Application\UseCases\ResetPassword;
use App\Modules\Identity\Application\UseCases\SocialLogin;
use Illuminate\Auth\Events\PasswordReset as PasswordResetEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as ProviderUser;
use Tests\TestCase;

class CredentialRevocationTest extends TestCase
{
    use RefreshDatabase;

    public function test_revocation_preserves_only_current_database_session_and_other_users_tokens(): void
    {
        config(['session.driver' => 'database']);
        $user = User::factory()->create();
        $other = User::factory()->create();
        foreach (['current', 'old'] as $id) {
            DB::table('sessions')->insert(['id' => $id, 'user_id' => $user->id, 'payload' => '', 'last_activity' => time()]);
        }
        foreach ([$user, $other] as $account) {
            DB::table('personal_access_tokens')->insert(['tokenable_type' => $account->getMorphClass(), 'tokenable_id' => $account->id, 'name' => 'test', 'token' => hash('sha256', (string) $account->id)]);
        }
        app(RevokeCredentials::class)->execute($user, 'current');
        $this->assertDatabaseHas('sessions', ['id' => 'current']);
        $this->assertDatabaseMissing('sessions', ['id' => 'old']);
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $user->id]);
        $this->assertDatabaseHas('personal_access_tokens', ['tokenable_id' => $other->id]);
    }

    public function test_stale_session_fingerprint_is_rejected_after_password_change(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $before = $user->password;
        $user->forceFill(['password' => 'New-password-123'])->save();
        $this->withSession(['password_hash_web' => $before])->get('/app/dashboard')->assertRedirect('/app/login');
        $this->assertGuest();
    }

    public function test_password_reset_revokes_sessions_and_token_cannot_be_replayed(): void
    {
        Event::fake([PasswordResetEvent::class]);
        config(['session.driver' => 'database']);
        $user = User::factory()->create();
        $before = $user->remember_token;
        DB::table('sessions')->insert(['id' => 'old', 'user_id' => $user->id, 'payload' => '', 'last_activity' => time()]);
        $token = Password::createToken($user);
        $reset = app(ResetPassword::class);
        $this->assertTrue($reset->execute($user->email, 'New-password-123', $token));
        $this->assertFalse($reset->execute($user->email, 'Replayed-password-123', $token));
        $this->assertDatabaseMissing('sessions', ['id' => 'old']);
        $this->assertNotSame($before, $user->fresh()->remember_token);
        Event::assertDispatched(PasswordResetEvent::class);
    }

    public function test_social_login_rejects_unverified_provider_email(): void
    {
        $this->expectException(ValidationException::class);
        app(SocialLogin::class)->execute('google', ['email' => 'claim@example.test', 'email_verified' => false]);
    }

    public function test_social_login_cannot_take_over_unverified_existing_account(): void
    {
        $user = User::factory()->unverified()->create();
        $this->expectException(ValidationException::class);
        app(SocialLogin::class)->execute('google', ['email' => $user->email, 'email_verified' => true]);
    }

    public function test_verified_social_registration_persists_verification_and_no_extra_privileges(): void
    {
        $providerUser = (new ProviderUser)->setRaw(['email_verified' => true])->map([
            'id' => 'provider-id',
            'email' => 'verified@example.test',
            'name' => 'Test Verified',
        ]);
        Socialite::shouldReceive('driver->user')->once()->andReturn($providerUser);
        $this->post(route('social-registration.complete'), ['nationality_code' => 'CG'])->assertRedirect(route('login.show'));
        $this->get('/auth/google/callback')->assertRedirect(route('social-registration.show'));
        $this->assertGuest();
        $this->assertDatabaseMissing('users', ['email' => 'verified@example.test']);
        $this->get(route('social-registration.show'))->assertOk();
        $this->post(route('social-registration.complete'), ['nationality_code' => 'CG'])->assertRedirect(route('dashboard.index'));

        $user = User::where('email', 'verified@example.test')->firstOrFail();
        $this->assertAuthenticatedAs($user);
        $this->assertTrue($user->hasVerifiedEmail());
        $this->assertTrue($user->hasRole('user'));
        $this->assertFalse($user->hasRole('admin'));
        $this->assertFalse($user->hasRole('student'));
        $this->assertSame('CG', $user->nationality_code);
        $this->assertSame('foreign', $user->feeCategoryFromNationality());
    }

    public function test_verified_social_sign_in_for_an_existing_account_does_not_change_nationality(): void
    {
        $existing = User::factory()->create();
        $providerUser = (new ProviderUser)->setRaw(['email_verified' => true])->map([
            'id' => 'provider-id',
            'email' => $existing->email,
            'name' => 'Test Verified',
        ]);
        Socialite::shouldReceive('driver->user')->once()->andReturn($providerUser);

        $this->get('/auth/google/callback')->assertRedirect(route('dashboard.index'));
        $this->assertAuthenticatedAs($existing);
        $this->assertNull($existing->fresh()->feeCategoryFromNationality());
    }
}
