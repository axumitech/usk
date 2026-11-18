<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    public function test_reset_password_link_screen_can_be_rendered()
    {
        $response = $this->get('/app/forgot-password');

        $response->assertStatus(200);
    }

    public function test_reset_password_link_can_be_requested()
    {
        Notification::fake();

        $user = User::factory()->create();

        $this->withSession(['_previous' => ['url' => url('/')]])
            ->post('/app/forgot-password', ['email' => $user->email], ['X-Inertia' => 'true'])
            ->assertStatus(303)->assertRedirectToRoute('password.request')
            ->assertSessionHas('status', 'Si un compte correspond à cette adresse, vous recevrez un lien de réinitialisation.');
        Notification::assertSentTo($user, ResetPassword::class);

        $this->get('/app/forgot-password')->assertInertia(fn ($page) => $page
            ->component('dashboard/auth/ForgotPassword')
            ->where('status', 'Si un compte correspond à cette adresse, vous recevrez un lien de réinitialisation.'));
    }

    public function test_reset_password_screen_can_be_rendered()
    {
        Notification::fake();

        $user = User::factory()->create();

        $this->post('/app/forgot-password', ['email' => $user->email]);

        Notification::assertSentTo($user, ResetPassword::class, function ($notification) {
            $response = $this->get('/app/reset-password/'.$notification->token);

            $response->assertStatus(200);

            return true;
        });
    }

    public function test_password_can_be_reset_with_valid_token()
    {
        Notification::fake();

        $user = User::factory()->create();

        $this->post('/app/forgot-password', ['email' => $user->email]);

        Notification::assertSentTo($user, ResetPassword::class, function ($notification) use ($user) {
            $response = $this->post('/app/reset-password', [
                'token' => $notification->token,
                'email' => $user->email,
                'password' => 'password',
                'password_confirmation' => 'password',
            ]);

            $response
                ->assertStatus(303)
                ->assertSessionHasNoErrors()
                ->assertSessionHas('success', 'Mot de passe réinitialisé.')
                ->assertRedirectToRoute('login.show');

            return true;
        });
    }
}
