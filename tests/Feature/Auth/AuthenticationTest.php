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

        $this->post('/app/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ]);

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
