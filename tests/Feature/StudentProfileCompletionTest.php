<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class StudentProfileCompletionTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    public function test_the_overview_links_to_missing_fields_and_updates_after_the_student_saves(): void
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $student->studentProfile->forceFill([
            'personal_details' => ['birth_date' => ' ', 'province' => 'other', 'diploma_type' => 'state_diploma'],
        ])->save();
        $home = route('dashboard.student.index', ['section' => 'overview', 'academic' => $entry->id], false);
        $profile = ['section' => 'profile', 'academic' => $entry->id, 'view' => 'personal'];
        $birthUrl = route('dashboard.student.index', $profile + ['edit' => 'birth_date'], false);
        $photoUrl = route('dashboard.student.index', array_replace($profile, ['view' => 'photo']), false);

        $this->actingAs($student)->get($home)->assertInertia(fn (Assert $page) => $page
            ->where('profile_completion.href', $birthUrl)
            ->where('profile_completion.missing.0', [
                'key' => 'birth_date', 'label' => 'Date de naissance', 'section' => 'identity', 'href' => $birthUrl,
            ])
            ->where('profile_completion.missing', fn ($fields) => collect($fields)->contains(fn ($field) => $field['key'] === 'photo' && $field['href'] === $photoUrl)
                && collect($fields)->contains('key', 'other_province')
                && ! collect($fields)->contains('key', 'other_diploma')));
        $this->get($birthUrl)->assertInertia(fn (Assert $page) => $page
            ->where('profile_view', 'personal')->where('profile_edit_field', 'birth_date'));
        $this->get(route('dashboard.student.index', $profile + ['edit' => 'nationality_code'], false))
            ->assertInertia(fn (Assert $page) => $page->where('profile_edit_field', null));

        $this->post(route('dashboard.student.profile.update', ['academic' => $entry->id, 'view' => 'personal']), [
            'first_name' => $student->first_name, 'last_name' => $student->last_name, 'email' => $student->email,
            'birth_date' => '2003-05-15', 'province' => 'other', 'other_province' => 'Brazzaville',
        ])->assertRedirect(route('dashboard.student.index', $profile))->assertSessionHasNoErrors();
        $this->assertSame('2003-05-15', $student->studentProfile->fresh()->personal_details['birth_date']);
        $this->get($home)->assertInertia(fn (Assert $page) => $page
            ->where('profile_completion.missing', fn ($fields) => ! collect($fields)->contains('key', 'birth_date')
                && ! collect($fields)->contains('key', 'other_province')));
    }

    public function test_a_complete_profile_has_no_missing_items(): void
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $student->update(['gender' => 'female']);
        $student->studentProfile->forceFill(['photo_path' => 'student-profiles/current.webp', 'personal_details' => [
            'birth_date' => '2003-05-15',
            'birth_place' => 'Kinshasa',
            'marital_status' => 'single',
            'phone' => '+243 810 000 000',
            'province' => 'Kinshasa',
            'residence_commune' => 'Limete',
            'home_address' => 'Avenue de test',
            'emergency_name' => 'Contact de test',
            'emergency_phone' => '+243 820 000 000',
            'diploma_type' => 'other',
            'other_diploma' => 'Diplôme équivalent',
            'diploma_number' => 'DIP-123',
            'diploma_section' => 'Sciences',
            'diploma_school' => 'École de test',
            'diploma_year' => 2021,
        ]])->save();
        $home = route('dashboard.student.index', ['section' => 'overview', 'academic' => $entry->id], false);
        $profile = route('dashboard.student.index', ['section' => 'profile', 'academic' => $entry->id], false);
        $this->actingAs($student)->get($home)->assertInertia(fn (Assert $page) => $page
            ->where('profile_completion.href', $profile)
            ->where('profile_completion.completed', 20)
            ->where('profile_completion.total', 20)
            ->has('profile_completion.missing', 0));
    }
}
