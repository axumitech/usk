<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class RegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_screen_can_be_rendered()
    {
        $response = $this->get('/app/register');

        $response->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/auth/Signup')
            ->where('nationalities.CD', 'République démocratique du Congo (RDC)')
            ->where('nationalities.CG', 'République du Congo (Congo-Brazzaville)'));
    }

    public function test_new_users_can_register()
    {
        $this->seed(RolePermissionSeeder::class);
        $response = $this->post('/app/register', [
            'first_name' => 'Test',
            'last_name' => 'User',
            'gender' => 'other',
            'nationality_code' => 'CD',
            'email' => 'test@example.com',
            'password' => 'password',
            'password_confirmation' => 'password',
        ]);

        $this->assertAuthenticated();
        $response->assertRedirect(route('dashboard.index', absolute: false));
        $user = User::where('email', 'test@example.com')->firstOrFail();
        $this->assertSame('CD', $user->nationality_code);
        $this->assertSame('national', $user->feeCategoryFromNationality());
    }

    public function test_registration_rejects_missing_and_unrecognized_nationalities(): void
    {
        $account = [
            'first_name' => 'Test',
            'last_name' => 'User',
            'gender' => 'other',
            'email' => 'test@example.com',
            'password' => 'password',
            'password_confirmation' => 'password',
        ];

        $this->from('/app/register')->post('/app/register', $account)->assertSessionHasErrors('nationality_code');
        $this->post('/app/register', $account + ['nationality_code' => 'XX'])->assertSessionHasErrors('nationality_code');
        $this->assertGuest();
        $this->assertDatabaseMissing('users', ['email' => $account['email']]);
    }

    public function test_registration_validation_returns_to_the_form_when_the_previous_page_is_public(): void
    {
        $this->get('/app/register')->assertOk();
        $this->get('/')->assertOk();
        $this->post('/app/register', ['email' => 'adresse-invalide'], [
            'X-Inertia' => 'true',
            'X-Requested-With' => 'XMLHttpRequest',
        ])->assertRedirectToRoute('register.show')
            ->assertSessionHasErrors(['email' => 'Saisissez une adresse email valide.']);

        $this->get('/app/register')->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/auth/Signup')
            ->where('errors.email', 'Saisissez une adresse email valide.'));
        $this->assertGuest();
        $this->assertDatabaseCount('users', 0);
    }
}
