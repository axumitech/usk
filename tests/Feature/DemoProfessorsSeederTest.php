<?php

namespace Tests\Feature;

use App\Models\Professor;
use App\Models\User;
use Database\Seeders\DemoProfessorsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class DemoProfessorsSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_demo_profiles_can_sign_in_and_reseeding_preserves_administrative_edits(): void
    {
        $this->withoutVite();
        $this->seed(DemoProfessorsSeeder::class);
        $this->assertDatabaseCount('professors', 20);
        $this->assertDatabaseCount('users', 20);
        $professor = Professor::where('email', 'jean-pierre.kabeya@enseignants.example.test')->firstOrFail();
        $account = User::findOrFail($professor->user_id);
        $this->assertSame($professor->email, $account->email);
        $this->assertTrue($account->hasRole('professor'));
        $this->assertTrue($account->hasVerifiedEmail());
        $this->post(route('login'), ['email' => $account->email, 'password' => 'password'])->assertSessionHasNoErrors()->assertRedirect();
        $this->assertAuthenticatedAs($account);
        $this->get(route('dashboard.teaching.profile'))->assertOk();

        $professor->update(['speciality' => 'Spécialité modifiée', 'is_active' => false]);
        $other = User::where('email', 'marie-claire.ilunga@enseignants.example.test')->firstOrFail();
        $other->update(['password' => 'Mot de passe modifié en local']);
        $this->seed(DemoProfessorsSeeder::class);
        $this->assertDatabaseCount('professors', 20);
        $this->assertDatabaseCount('users', 20);
        $this->assertDatabaseHas('professors', ['id' => $professor->id, 'speciality' => 'Spécialité modifiée', 'is_active' => false]);
        $this->assertTrue(Hash::check('Mot de passe modifié en local', $other->fresh()->password));
        $this->assertTrue(Professor::all()->every(fn ($p) => str_ends_with($p->email, '.test') && str_contains($p->biography, 'fictif')));
        $this->assertDatabaseCount('academic_offerings', 0);
    }

    public function test_existing_profiles_get_accounts_when_their_demo_address_is_available(): void
    {
        $email = 'jean-pierre.kabeya@enseignants.example.test';
        $profile = Professor::create(['first_name' => 'Jean-Pierre', 'last_name' => 'Kabeya Mukendi', 'email' => $email, 'is_active' => true]);
        $occupied = User::factory()->create(['email' => 'Marie-Claire.Ilunga@enseignants.example.test']);

        $this->seed(DemoProfessorsSeeder::class);

        $this->assertSame($email, User::findOrFail($profile->fresh()->user_id)->email);
        $this->assertDatabaseHas('professors', ['email' => strtolower($occupied->email), 'user_id' => null]);
        $this->assertFalse($occupied->fresh()->hasRole('professor'));
        $this->assertSame($occupied->password, $occupied->fresh()->password);
    }

    public function test_password_accounts_are_only_created_in_local_and_test_environments(): void
    {
        $this->app->instance('env', 'production');

        $this->app->make(DemoProfessorsSeeder::class)->run();

        $this->assertDatabaseCount('professors', 20);
        $this->assertDatabaseCount('users', 0);
    }
}
