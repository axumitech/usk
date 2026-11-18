<?php

namespace Tests\Feature;

use App\Models\Faculty;
use App\Models\Level;
use App\Models\LevelDetail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

final class LevelAdministrativeNavigationTest extends TestCase
{
    use RefreshDatabase;

    public function test_level_update_without_referrer_returns_to_the_level_with_success_and_tab(): void
    {
        [$admin, $level] = $this->context();
        $destination = route('dashboard.admin.levels.details.show', ['id' => $level->id, 'tab' => 'cours']);
        $this->actingAs($admin)->put(route('dashboard.admin.levels.update', ['id' => $level->id, 'tab' => 'cours']), $this->payload($level))
            ->assertStatus(303)->assertRedirect($destination)->assertSessionHasNoErrors()
            ->assertSessionHas('success', 'Niveau mis à jour avec succès.');
        $this->assertDatabaseHas('levels', ['id' => $level->id, 'title' => 'Niveau modifié', 'is_active' => true]);
        $this->get($destination)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/levels/Show')->where('level.title', 'Niveau modifié')->where('initialTab', 'cours'));
    }

    public function test_public_referrer_or_arbitrary_return_context_cannot_change_the_destination(): void
    {
        [$admin, $level] = $this->context();
        $this->actingAs($admin)->withHeader('Referer', url('/'))->put(route('dashboard.admin.levels.update', [
            'id' => $level->id, 'tab' => 'https://example.test/',
        ]), $this->payload($level))->assertStatus(303)
            ->assertRedirect(route('dashboard.admin.levels.details.show', ['id' => $level->id]));
    }

    public function test_level_validation_preserves_the_form_values_and_administrative_context_without_referrer(): void
    {
        [$admin, $level] = $this->context();
        $this->actingAs($admin)->put(route('dashboard.admin.levels.update', ['id' => $level->id, 'tab' => 'prof']),
            array_replace($this->payload($level), ['title' => '', 'code' => 'DRAFT']))
            ->assertRedirect(route('dashboard.admin.levels.details.show', ['id' => $level->id, 'tab' => 'prof']))
            ->assertSessionHasErrors('title')->assertSessionHas('_old_input.code', 'DRAFT');
        $this->assertDatabaseHas('levels', ['id' => $level->id, 'title' => 'Licence 1', 'code' => 'L1']);
    }

    public function test_duplicate_code_keeps_the_form_in_the_level_workspace(): void
    {
        [$admin, $level] = $this->context();
        Level::create(['faculty_id' => $level->faculty_id, 'title' => 'Autre niveau', 'code' => 'L2']);
        $this->actingAs($admin)->put(route('dashboard.admin.levels.update', $level->id),
            array_replace($this->payload($level), ['code' => 'L2']))
            ->assertStatus(303)->assertRedirect(route('dashboard.admin.levels.details.show', ['id' => $level->id]))
            ->assertSessionHasErrors('code')->assertSessionHas('_old_input.title', 'Niveau modifié');
        $this->assertDatabaseHas('levels', ['id' => $level->id, 'code' => 'L1']);
    }

    public function test_level_detail_update_uses_the_level_id_and_not_the_detail_id(): void
    {
        [$admin, $level] = $this->context();
        $detail = LevelDetail::create(['level_id' => $level->id, 'duration_years' => 1, 'fees' => 35]);
        $this->assertNotSame($level->id, $detail->id);
        $this->actingAs($admin)->post(route('dashboard.admin.levels.details.update', ['id' => $detail->id, 'tab' => 'infos']), [
            '_method' => 'PUT', 'level_id' => $level->id, 'duration_years' => 2, 'language' => 'Français',
        ])->assertStatus(303)->assertRedirect(route('dashboard.admin.levels.details.show', ['id' => $level->id, 'tab' => 'infos']))
            ->assertSessionHasNoErrors()->assertSessionHas('success', 'Détails du niveau mis à jour avec succès.');
        $this->assertDatabaseHas('level_details', ['id' => $detail->id, 'duration_years' => 2, 'language' => 'Français', 'fees' => 35]);
    }

    public function test_detail_validation_returns_to_its_actual_level_without_referrer(): void
    {
        [$admin, $level] = $this->context();
        $detail = LevelDetail::create(['level_id' => $level->id, 'duration_years' => 1, 'fees' => 0]);
        $this->actingAs($admin)->put(route('dashboard.admin.levels.details.update', ['id' => $detail->id, 'tab' => 'infos']), [
            'level_id' => $level->id, 'credit_required' => -1, 'language' => 'Brouillon conservé',
        ])->assertRedirect(route('dashboard.admin.levels.details.show', ['id' => $level->id, 'tab' => 'infos']))
            ->assertSessionHasErrors('credit_required')->assertSessionHas('_old_input.language', 'Brouillon conservé');
    }

    public function test_creation_without_referrer_returns_to_the_level_catalog_and_student_cannot_update(): void
    {
        [$admin, $level] = $this->context();
        $this->actingAs($admin)->post(route('dashboard.admin.levels.store'), array_replace($this->payload($level), ['code' => 'L3']))
            ->assertStatus(303)->assertRedirect(route('dashboard.admin.levels.index'))->assertSessionHasNoErrors()
            ->assertSessionHas('success', 'Niveau créé avec succès.');
        $facultyUrl = route('dashboard.admin.faculties.show', $level->faculty_id);
        $this->from($facultyUrl)->post(route('dashboard.admin.levels.store'), array_replace($this->payload($level), ['code' => 'L4']))
            ->assertStatus(303)->assertRedirect($facultyUrl)->assertSessionHasNoErrors();
        $student = User::factory()->create()->assignRole(Role::findOrCreate('student', 'web'));
        $this->actingAs($student)->put(route('dashboard.admin.levels.update', $level->id), $this->payload($level))->assertForbidden();
        $this->assertDatabaseHas('levels', ['id' => $level->id, 'title' => 'Licence 1']);
    }

    private function context(): array
    {
        $admin = User::factory()->create()->assignRole(Role::findOrCreate('admin', 'web'));
        $admin->givePermissionTo(Permission::findOrCreate('manage academic access', 'web'));
        $faculty = Faculty::create(['name' => 'Faculté de test', 'code' => 'TEST']);
        Level::create(['faculty_id' => $faculty->id, 'title' => 'Niveau témoin', 'code' => 'L0']);
        $level = Level::create(['faculty_id' => $faculty->id, 'title' => 'Licence 1', 'code' => 'L1', 'is_active' => true]);

        return [$admin, $level];
    }

    private function payload(Level $level): array
    {
        return ['faculty_id' => $level->faculty_id, 'title' => 'Niveau modifié', 'code' => $level->code, 'is_active' => true];
    }
}
