<?php

namespace Tests\Feature;

use App\Models\Enrollment;
use App\Models\Student\StudentProfile;
use App\Models\User;
use App\Modules\Student\Application\Services\StudentServiceCatalog;
use App\Notifications\FinancialOperationNotice;
use App\Notifications\StudentRequestAnswered;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Role;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class StudentNotificationsTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    public function test_student_inbox_paginates_private_notices_and_preserves_the_selected_context(): void
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $other = User::factory()->create();
        $oldest = null;
        for ($index = 1; $index <= 16; $index++) {
            $student->notify(new FinancialOperationNotice(['academic_enrollment_id' => $entry->id, 'reference' => 'Versement '.$index]));
            $oldest ??= $student->notifications()->sole();
            $this->travel(1)->seconds();
        }
        $context = ['level_id' => $entry->level_id, 'academic_year_id' => $entry->academic_year_id];
        $otherApplication = Enrollment::create($context + ['student_id' => $other->id, 'status' => 'validated']);
        $otherProfile = StudentProfile::create(['user_id' => $other->id, 'student_status' => 'active']);
        $otherEntry = $otherProfile->enrollments()->create($context + [
            'application_id' => $otherApplication->id, 'enrollment_status' => 'confirmed', 'currency' => 'USD',
        ]);
        $other->notify(new FinancialOperationNotice(['academic_enrollment_id' => $otherEntry->id, 'reference' => 'Versement privé']));
        $index = route('dashboard.student.notifications.index', ['academic' => $entry->id], false);
        $unread = $index.'&filter=unread';

        $this->get($index)->assertRedirect(route('login.show'));
        $this->actingAs($other)->get($index)->assertForbidden();
        $this->actingAs($student)->get($index)->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/student/Notifications')->where('studentChrome.academic_id', $entry->id)
            ->where('notifications.filter', 'all')->where('notifications.unread_count', 16)
            ->where('notifications.index_url', $index)->where('notifications.unread_url', $unread)
            ->has('notifications.items.data', 15)->where('notifications.items.total', 16)
            ->where('notifications.items.data.0.reference', 'Versement 16')
            ->where('notifications.items.next_page_url', fn ($url) => str_contains($url, 'academic='.$entry->id.'&notifications_page=2')));
        $this->get($unread.'&notifications_page=2')->assertInertia(fn (Assert $page) => $page
            ->where('notifications.filter', 'unread')->where('notifications.items.current_page', 2)
            ->where('notifications.items.data.0.id', $oldest->id)
            ->where('notifications.items.data.0.open_url', route('dashboard.notifications.open', $oldest->id))
            ->missing('notifications.items.data.0.data'));
        $this->get(route('dashboard.student.notifications.index', ['academic' => $otherEntry->id]))->assertNotFound();
        $this->post(route('dashboard.notifications.open', $other->notifications()->sole()->id))->assertNotFound();

        $this->post(route('dashboard.notifications.open', $oldest->id))->assertRedirect(route('dashboard.student.index', ['section' => 'transactions', 'academic' => $entry->id]));
        $this->assertNotNull($oldest->fresh()->read_at);
        $this->get($unread)->assertInertia(fn (Assert $page) => $page->where('notifications.unread_count', 15)->where('notifications.items.total', 15));
        $this->post(route('dashboard.notifications.read-all', ['inbox' => 1, 'academic' => $entry->id, 'filter' => 'unread']))
            ->assertStatus(303)->assertRedirect($unread);
        $this->assertSame(0, $student->unreadNotifications()->count());
        $this->assertSame(1, $other->unreadNotifications()->count());
        $this->get($unread)->assertInertia(fn (Assert $page) => $page
            ->where('notifications.unread_count', 0)->has('notifications.items.data', 0));
    }

    public function test_exception_answer_notification_opens_only_the_recipients_request_in_its_own_enrollment(): void
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $ticket = $entry->serviceRequests()->create(['category' => 'academic', 'procedure' => StudentServiceCatalog::ENROLLMENT_EXCEPTION,
            'subject' => 'Demander une dérogation', 'body' => 'Examinez ma situation exceptionnelle.']);
        $student->notify(new StudentRequestAnswered($entry->id, $ticket->id));
        $notice = $student->notifications()->sole();
        $context = ['level_id' => $entry->level_id, 'academic_year_id' => $entry->academic_year_id];
        $other = User::factory()->create();
        $other->assignRole('student');
        $profile = StudentProfile::create(['user_id' => $other->id, 'student_status' => 'active']);
        $application = Enrollment::create($context + ['student_id' => $other->id, 'status' => 'validated']);
        $otherEntry = $profile->enrollments()->create($context + ['application_id' => $application->id,
            'enrollment_status' => 'confirmed', 'currency' => 'USD']);
        $otherTicket = $otherEntry->serviceRequests()->create(['category' => 'academic', 'procedure' => StudentServiceCatalog::ENROLLMENT_EXCEPTION,
            'subject' => 'Demander une dérogation', 'body' => 'Une autre situation à examiner.']);

        $this->actingAs($other)->post(route('dashboard.notifications.open', $notice->id))->assertNotFound();
        $this->actingAs($student)->get(route('dashboard.student.notifications.index', ['academic' => $entry->id]))
            ->assertInertia(fn (Assert $page) => $page->where('notifications.items.data.0.kind', 'student_request')
                ->where('notifications.items.data.0.status', 'request_answered'));
        $this->post(route('dashboard.notifications.open', $notice->id))->assertStatus(303)->assertRedirect(route('dashboard.student.index', [
            'section' => 'requests', 'academic' => $entry->id, 'request' => $ticket->id,
        ]));
        $this->assertNotNull($notice->fresh()->read_at);

        // Even a notification attributed to this recipient cannot point outside their enrollment or request.
        foreach ([[$otherEntry->id, $otherTicket->id], [$entry->id, $otherTicket->id]] as [$academic, $request]) {
            $student->notify(new StudentRequestAnswered($academic, $request));
            $invalid = $student->notifications()->whereNull('read_at')->sole();
            $this->post(route('dashboard.notifications.open', $invalid->id))->assertNotFound();
            $this->assertNull($invalid->fresh()->read_at);
            $invalid->markAsRead();
        }
    }

    public function test_student_profile_without_an_enrollment_can_open_an_empty_inbox(): void
    {
        $student = User::factory()->create();
        $student->assignRole(Role::findOrCreate('student', 'web'));
        StudentProfile::create(['user_id' => $student->id, 'student_status' => 'active']);

        $this->actingAs($student)->get(route('dashboard.student.notifications.index'))->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/student/Notifications')->where('studentChrome.academic_id', null)
            ->where('notifications.unread_count', 0)->has('notifications.items.data', 0));
    }
}
