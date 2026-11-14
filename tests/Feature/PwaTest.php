<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\URL;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class PwaTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_and_app_documents_have_separate_installation_boundaries(): void
    {
        $this->get('/')->assertOk()->assertDontSee('rel="manifest"', false)->assertSee('href="/app/"', false);
        $this->get('/app/')->assertRedirect('/app/login');
        $this->get('/app/login')->assertOk()->assertSee('rel="manifest"', false)->assertSee('id="usk-launch"', false);
        $this->get('/app/sw.js')->assertOk()->assertHeader('Content-Type', 'application/javascript; charset=UTF-8')
            ->assertHeaderMissing('Set-Cookie')->assertSee('const VERSION =', false);
    }

    public function test_legacy_links_preserve_query_and_method_and_private_routes_require_session(): void
    {
        $this->get('/dashboard/student/fees?academic=42')
            ->assertStatus(307)->assertRedirect('/app/dashboard/student/fees?academic=42');
        $this->post('/logout')->assertStatus(307)->assertRedirect('/app/logout');
        $this->get('/app/dashboard/student/fees?academic=42')->assertRedirect('/app/login')
            ->assertSessionHas('url.intended', url('/app/dashboard/student/fees?academic=42'));
        $response = $this->getJson('/app/dashboard/student/fees');
        $response->assertUnauthorized();
        $this->assertTrue($response->headers->hasCacheControlDirective('no-store'));
    }

    public function test_login_resumes_the_deep_link_and_entry_still_routes_by_role(): void
    {
        $user = User::factory()->create();
        $user->assignRole(Role::findOrCreate('candidate'));

        $this->get('/app/dashboard/enrollments?source=mail')->assertRedirect('/app/login');
        $this->post('/app/login', ['email' => $user->email, 'password' => 'password'])
            ->assertRedirect('/app/dashboard/enrollments?source=mail');
        $this->get('/app/')->assertRedirect('/app/dashboard');
        $this->get('/app/dashboard')->assertRedirect('/app/dashboard/enrollments');
        $response = $this->get('/app/dashboard/enrollments');
        $response->assertOk();
        $this->assertTrue($response->viewData('page')['encryptHistory']);
        $this->assertTrue($response->headers->hasCacheControlDirective('no-store'));
        $this->post('/app/logout')->assertRedirect('/app/login');
        $this->assertGuest();
    }

    public function test_old_signed_verification_link_remains_valid(): void
    {
        $user = User::factory()->unverified()->create();
        $old = URL::signedRoute('verification.verify', [
            'id' => $user->id,
            'hash' => sha1($user->email),
        ]);
        $path = url('/email/verify/'.$user->id.'/'.sha1($user->email));
        $legacy = $path.'?signature='.hash_hmac('sha256', $path, config('app.key'));
        $this->assertStringContainsString('/app/email/verify/', $old);
        $this->actingAs($user)->get($legacy)->assertRedirect('/app/dashboard');
        $this->assertTrue($user->fresh()->hasVerifiedEmail());
    }
}
