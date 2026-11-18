<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_screen_can_be_rendered()
    {
        $response = $this->get('/app/login');

        $response->assertStatus(200);
    }

    public function test_users_can_authenticate_using_the_login_screen()
    {
        $user = User::factory()->create();

        $response = $this->post('/app/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $this->assertAuthenticated();
        $response->assertRedirect(route('dashboard.index', absolute: false));
        $this->get('/app/dashboard')->assertOk()->assertInertia(fn (Assert $page) => $page->hasFlash('dashboardArrival', true)->etc());
        $this->get('/app/dashboard')->assertOk()->assertInertia(fn (Assert $page) => $page->missingFlash('dashboardArrival')->etc());
    }

    public function test_dashboard_arrival_survives_the_redirect_to_the_candidate_space(): void
    {
        $user = User::factory()->create();
        $user->assignRole(Role::findOrCreate('candidate'));

        $this->post('/app/login', ['email' => $user->email, 'password' => 'password'])->assertRedirect('/app/dashboard');
        $this->get('/app/dashboard')->assertRedirect('/app/dashboard/enrollments');
        $this->get('/app/dashboard/enrollments')->assertOk()->assertInertia(fn (Assert $page) => $page->hasFlash('dashboardArrival', true)->etc());
        $this->get('/app/dashboard/enrollments')->assertOk()->assertInertia(fn (Assert $page) => $page->missingFlash('dashboardArrival')->etc());
    }

    public function test_users_can_not_authenticate_with_invalid_password()
    {
        $user = User::factory()->create();

        $this->get('/app/login')->assertOk()->assertHeader('Referrer-Policy', 'no-referrer');

        foreach ([$user->email, 'inconnu@example.test'] as $email) {
            // A public page opened in another tab becomes the session's previous URL.
            $this->get('/')->assertOk();
            $this->post('/app/login', ['email' => $email, 'password' => 'wrong-password'], [
                'X-Inertia' => 'true',
                'X-Requested-With' => 'XMLHttpRequest',
            ])->assertRedirectToRoute('login.show')
                ->assertSessionHasErrors(['email' => 'Identifiants invalides']);

            $this->get('/app/login')->assertInertia(fn (Assert $page) => $page
                ->component('dashboard/auth/Login')
                ->where('errors.email', 'Identifiants invalides'));
        }

        $this->assertGuest();
    }

    public function test_login_validation_keeps_the_login_screen_and_preserves_json_errors(): void
    {
        $this->get('/')->assertOk();
        $input = ['email' => 'adresse-invalide', 'password' => ''];
        $errors = [
            'email' => 'Saisissez une adresse email valide.',
            'password' => 'Saisissez votre mot de passe.',
        ];

        $this->post('/app/login', $input)->assertRedirectToRoute('login.show')->assertSessionHasErrors($errors);
        $this->postJson('/app/login', $input)->assertUnprocessable()->assertJsonValidationErrors($errors);
    }

    public function test_throttled_login_keeps_the_login_screen(): void
    {
        $user = User::factory()->create();
        $this->get('/')->assertOk();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->post('/app/login', ['email' => $user->email, 'password' => 'wrong-password'])
                ->assertRedirectToRoute('login.show')->assertSessionHasErrors(['email' => 'Identifiants invalides']);
        }

        $this->post('/app/login', ['email' => $user->email, 'password' => 'password'])
            ->assertRedirectToRoute('login.show')->assertSessionHasErrors('email');
        $this->assertStringStartsWith('Trop de tentatives.', session()->get('errors')->first('email'));
        $this->assertGuest();
    }

    public function test_users_can_logout()
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post('/app/logout');

        $this->assertGuest();
        $response->assertRedirect('/app/login');
    }

    #[DataProvider('logoutRoles')]
    public function test_logout_clears_private_session_and_returns_each_role_to_login_with_success(string $role): void
    {
        $user = User::factory()->create();
        $user->assignRole(Role::findOrCreate($role, 'web'));
        $this->post('/app/login', ['email' => $user->email, 'password' => 'password'])->assertRedirect();
        $this->assertAuthenticatedAs($user);
        $oldSession = session()->getId();

        $this->withSession(['private_marker' => 'private '.$role, '_token' => 'before-logout-token'])
            ->post('/app/logout')->assertRedirect('/app/login')
            ->assertSessionMissing('private_marker')->assertSessionHas('success', 'Déconnexion réussie.');
        $this->assertGuest();
        $this->assertNotSame($oldSession, session()->getId());
        $this->assertNotSame('before-logout-token', session()->token());
        $login = $this->get('/app/login')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/auth/Login')->where('auth.user', null)->where('flash.success', 'Déconnexion réussie.'));
        $this->assertTrue($login->viewData('page')['clearHistory']);
        $this->get('/app/dashboard')->assertRedirect('/app/login');
        $this->get('/app/login')->assertInertia(fn (Assert $page) => $page->where('flash.success', null));
    }

    public static function logoutRoles(): array
    {
        return ['étudiant' => ['student'], 'administrateur' => ['admin'], 'professeur' => ['professor']];
    }
}
