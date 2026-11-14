<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
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
}
