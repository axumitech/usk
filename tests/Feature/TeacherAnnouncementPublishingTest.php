<?php

namespace Tests\Feature;

use App\Models\Classes;
use App\Models\Courses;
use App\Models\Enrollment;
use App\Models\Intake;
use App\Models\Professor;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicOffering;
use App\Models\Student\AcademicResource;
use App\Models\Student\StudentProfile;
use App\Models\User;
use App\Notifications\TeacherAnnouncementNotice;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class TeacherAnnouncementPublishingTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    public function test_course_and_group_announcements_reach_only_their_students_and_open_as_read(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-14 10:00', 'Africa/Kinshasa'));
        Mail::fake();
        [$teacher, $professor] = $this->teacher();
        $first = $this->studentContext();
        $firstEntry = $first->studentProfile->enrollments()->sole();
        $groupA = $this->group($firstEntry, 'A');
        $groupB = $this->group($firstEntry, 'B');
        $firstEntry->update(['class_id' => $groupA->id]);
        [$second, $secondEntry] = $this->enrollStudent($firstEntry, $groupB);
        [$excluded, $excludedEntry] = $this->enrollStudent($firstEntry, $groupA);
        [$pending] = $this->enrollStudent($firstEntry, $groupA, 'pending_confirmation');
        $offering = $this->offering($firstEntry, $professor);
        $offering->exceptions()->create([
            'academic_enrollment_id' => $excludedEntry->id, 'action' => 'exclude',
            'reason' => 'Cours non suivi', 'authorized_by' => $teacher->id,
        ]);
        $store = route('dashboard.teaching.announcements.store');

        $course = $this->message($offering, 'Calendrier commun', 'Préparez le chapitre 3 pour la prochaine séance.');
        $this->actingAs($teacher)->get(route('dashboard.teaching.index'))->assertInertia(fn (Assert $page) => $page
            ->where('overview.links.publish_announcement', route('dashboard.teaching.announcements.store', [
                'year' => $firstEntry->academic_year_id, 'semester' => 'all',
            ], false))
            ->has('overview.announcement_targets', 1)->where('overview.announcement_targets.0.id', $offering->id)
            ->has('overview.announcement_targets.0.groups', 2)
            ->where('overview.announcement_targets.0.groups.0.id', $groupA->id)
            ->where('overview.announcement_targets.0.groups.1.id', $groupB->id));
        $this->get(route('dashboard.teaching.index', ['offering' => $offering->id]))->assertInertia(fn (Assert $page) => $page
            ->where('view', 'courses')->has('overview.announcement_targets', 1)
            ->where('overview.announcement_targets.0.id', $offering->id));
        $this->post($store, $course)->assertStatus(303)->assertSessionHasNoErrors()
            ->assertSessionHas('success', 'Annonce publiée. 2 étudiants ont reçu une notification.');
        $common = $offering->resources()->where('kind', 'announcement')->sole();
        $this->assertTrue($common->is_published);
        $this->assertNotNull($common->published_at);
        $this->assertNull($common->announcement_class_id);
        $this->assertSame($teacher->id, (int) $common->author_id);

        $this->travel(1)->seconds();
        $group = $this->message($offering, 'Changement de salle du groupe A', 'Rendez-vous en salle 203.') + ['group_id' => $groupA->id];
        $sent = $this->post($store, $group)->assertStatus(303)->assertSessionHasNoErrors()
            ->assertSessionHas('success', 'Annonce publiée. Un étudiant a reçu une notification.');
        $targeted = $offering->resources()->where('title', $group['title'])->sole();
        $this->assertSame($groupA->id, (int) $targeted->announcement_class_id);

        $this->post($store, $group)->assertRedirect($sent->headers->get('Location'))->assertSessionHasNoErrors();
        $this->post($store, array_replace($group, ['body' => 'Autre texte avec la même clé.']))->assertSessionHasErrors('operation_key');
        $this->assertSame(2, $offering->resources()->where('kind', 'announcement')->count());
        $this->assertSame(2, $first->notifications()->where('type', TeacherAnnouncementNotice::class)->count());
        $this->assertSame(1, $second->notifications()->where('type', TeacherAnnouncementNotice::class)->count());
        $this->assertFalse($excluded->notifications()->exists());
        $this->assertFalse($pending->notifications()->exists());
        $this->get(route('dashboard.teaching.index', ['view' => 'announcements', 'announcement' => $targeted->id]))
            ->assertInertia(fn (Assert $page) => $page->where('overview.selected_announcement.id', $targeted->id));

        $inbox = route('dashboard.student.notifications.index', ['academic' => $firstEntry->id]);
        $firstDetail = $this->announcementUrl($firstEntry, $targeted);
        $this->actingAs($first)->get($inbox)->assertInertia(fn (Assert $page) => $page
            ->where('notifications.unread_count', 2)
            ->where('notifications.items.data', fn ($items) => collect($items)
                ->where('kind', 'announcement')->pluck('title')->sort()->values()->all() === [$common->title, $targeted->title]));
        $targetedNotice = $first->notifications()->where('type', TeacherAnnouncementNotice::class)->get()
            ->first(fn ($notice) => $notice->data['resource_id'] === $targeted->id);
        $this->assertNotNull($targetedNotice);
        $open = route('dashboard.notifications.open', $targetedNotice->id);
        $this->post($open)->assertStatus(303)->assertRedirect($firstDetail);
        $this->assertNotNull($targetedNotice->refresh()->read_at);
        $this->get($firstDetail)->assertInertia(fn (Assert $page) => $page
            ->where('announcements.selected.description', $group['body']));

        $this->actingAs($second)->post($open)->assertNotFound();
        $this->get($this->announcementUrl($secondEntry, $targeted))->assertNotFound();
        $this->get(route('dashboard.student.announcements', ['announcement' => $targeted->id]))->assertNotFound();
        $this->get(route('dashboard.student.announcements', ['academic' => $secondEntry->id]))->assertInertia(fn (Assert $page) => $page
            ->has('announcements.items.data', 1)->where('announcements.items.data.0.id', $common->id));
        $this->get(route('dashboard.student.index', ['section' => 'overview', 'academic' => $secondEntry->id]))->assertInertia(fn (Assert $page) => $page
            ->has('overview.announcements', 1)->where('overview.announcements.0.id', $common->id));
        $this->get($this->announcementUrl($secondEntry, $common))->assertInertia(fn (Assert $page) => $page
            ->where('announcements.selected.description', $course['body']));
        $this->actingAs($excluded)->get($this->announcementUrl($excludedEntry, $common))->assertNotFound();
        $this->get($this->announcementUrl($excludedEntry, $targeted))->assertNotFound();
        Mail::assertNothingOutgoing();
    }

    public function test_only_an_authorized_instructor_can_send_to_a_group_in_the_offering(): void
    {
        [$teacher, $professor] = $this->teacher();
        [$assistant, $assistantProfile] = $this->teacher();
        [$outsider] = $this->teacher();
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $group = $this->group($entry, 'A');
        $otherGroup = $this->group($entry, 'B');
        $entry->update(['class_id' => $group->id]);
        $this->enrollStudent($entry, $otherGroup);
        $offering = $this->offering($entry, $professor, [
            'class_id' => $group->id,
            'assistant_professor_id' => $assistantProfile->id,
        ]);
        $store = route('dashboard.teaching.announcements.store');
        $message = $this->message($offering, 'Information de groupe', 'Consultez le calendrier mis à jour.');

        $this->actingAs($teacher)->post($store, $message + ['group_id' => $otherGroup->id])->assertSessionHasErrors('group_id');
        $this->actingAs($assistant)->get(route('dashboard.teaching.index'))->assertInertia(fn (Assert $page) => $page
            ->has('overview.announcement_targets', 0)->where('overview.links.publish_announcement', null));
        $this->post($store, $message)->assertForbidden();
        $this->actingAs($outsider)->post($store, $message)->assertForbidden();
        $this->actingAs($student)->post($store, $message)->assertForbidden();
        $this->assertFalse($offering->resources()->exists());
        $this->assertDatabaseCount('notifications', 0);
    }

    private function teacher(): array
    {
        $user = User::factory()->create();
        $user->assignRole(Role::findOrCreate('professor', 'web'));
        $user->givePermissionTo(Permission::findOrCreate('manage courses', 'web'));
        $professor = Professor::create([
            'first_name' => $user->first_name, 'last_name' => $user->last_name, 'email' => $user->email, 'is_active' => true,
        ]);
        $professor->forceFill(['user_id' => $user->id, 'photo' => 'professors/test-portrait.png'])->save();

        return [$user, $professor];
    }

    private function group(AcademicEnrollment $entry, string $section): Classes
    {
        return Classes::create([
            'faculty_id' => $entry->level->faculty_id, 'level_id' => $entry->level_id,
            'intake_id' => Intake::create(['name' => 'Promotion '.$section])->id,
        ]);
    }

    private function enrollStudent(AcademicEnrollment $sample, Classes $group, string $status = 'confirmed'): array
    {
        $user = User::factory()->create();
        $user->assignRole(Role::findOrCreate('student', 'web'));
        $context = ['level_id' => $sample->level_id, 'academic_year_id' => $sample->academic_year_id, 'class_id' => $group->id];
        $application = Enrollment::create($context + ['student_id' => $user->id, 'status' => 'validated']);
        $profile = StudentProfile::create(['user_id' => $user->id, 'student_status' => 'active']);
        $entry = $profile->enrollments()->create($context + ['application_id' => $application->id, 'enrollment_status' => $status, 'currency' => 'USD']);

        return [$user, $entry];
    }

    private function offering(AcademicEnrollment $entry, Professor $professor, array $fields = []): AcademicOffering
    {
        $course = Courses::forceCreate(['title' => 'Base de données', 'level_id' => $entry->level_id, 'semester' => 1]);

        return AcademicOffering::create($fields + [
            'course_id' => $course->id, 'level_id' => $entry->level_id, 'academic_year_id' => $entry->academic_year_id,
            'professor_id' => $professor->id, 'is_published' => true,
        ]);
    }

    private function message(AcademicOffering $offering, string $title, string $body): array
    {
        return ['offering_id' => $offering->id, 'title' => $title, 'body' => $body, 'operation_key' => (string) Str::uuid()];
    }

    private function announcementUrl(AcademicEnrollment $entry, AcademicResource $announcement): string
    {
        return route('dashboard.student.announcements', ['academic' => $entry->id, 'announcement' => $announcement->id]);
    }
}
