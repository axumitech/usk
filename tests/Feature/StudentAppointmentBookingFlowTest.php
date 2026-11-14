<?php

namespace Tests\Feature;

use App\Models\Enrollment;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\ServiceRequest;
use App\Models\Student\StudentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class StudentAppointmentBookingFlowTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    private const ADMIN_ROUTE = 'dashboard.admin.student-academic.requests.';

    private const SERVICE = 'finance-appointment';

    private const WINDOWS = [['weekday' => 1, 'starts_at' => '09:00', 'ends_at' => '11:00']];

    public function test_university_staff_can_publish_and_clear_independent_weekly_hours_with_revision_checks(): void
    {
        $entry = $this->studentContext()->studentProfile->enrollments()->sole();
        $scoped = $this->staff();
        $scoped->academicFaculties()->attach($entry->level->faculty_id);
        $parameters = ['service' => self::SERVICE];
        $settings = route(self::ADMIN_ROUTE.'availability', $parameters);
        $update = route(self::ADMIN_ROUTE.'availability.update', $parameters);
        $agenda = route(self::ADMIN_ROUTE.'agenda', $parameters);

        $this->actingAs($scoped)->get($agenda)->assertInertia(fn (Assert $page) => $page->where('agenda.availability_url', null));
        $this->get($settings)->assertForbidden();
        $this->put($update, ['windows' => self::WINDOWS, 'expected_revision' => 0])->assertForbidden();

        $this->actingAs($this->staff())->get($agenda)->assertInertia(fn (Assert $page) => $page->where('agenda.availability_url', $settings));
        $this->get($settings)->assertInertia(fn (Assert $page) => $page->component('dashboard/studentAcademic/Availability')
            ->where('availability.service', self::SERVICE)->where('availability.revision', 0)->where('availability.configured', false)
            ->where('availability.update_url', $update)->has('availability.services', 4));
        $this->put($update, ['windows' => self::WINDOWS, 'expected_revision' => 0])->assertStatus(303)->assertRedirect($settings);
        $this->get($settings)->assertInertia(fn (Assert $page) => $page
            ->where('availability.revision', 1)->where('availability.configured', true)->where('availability.windows', self::WINDOWS));
        $this->get(route(self::ADMIN_ROUTE.'availability', ['service' => 'registrar-appointment']))
            ->assertInertia(fn (Assert $page) => $page->where('availability.configured', false)->has('availability.windows', 0));
        $this->put($update, ['windows' => [], 'expected_revision' => 0])->assertRedirect($settings)->assertSessionHasErrors('expected_revision');
        $this->put($update, ['windows' => [], 'expected_revision' => 1])->assertStatus(303);
        $this->get($settings)->assertInertia(fn (Assert $page) => $page
            ->where('availability.revision', 2)->where('availability.configured', true)->has('availability.windows', 0));
    }

    public function test_pending_slots_are_exclusive_and_lifecycle_releases_them_after_moves_cancellation_or_closure(): void
    {
        $this->travelTo(Carbon::parse('2026-11-16 08:00:00', 'Africa/Kinshasa'));
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $other = $this->anotherStudent($entry);
        $otherEntry = $other->studentProfile->enrollments()->sole();
        $staff = $this->staff();
        $settings = route(self::ADMIN_ROUTE.'availability.update', ['service' => self::SERVICE]);
        $this->actingAs($staff)->put($settings, ['windows' => self::WINDOWS, 'expected_revision' => 0])->assertStatus(303);

        $hold = [
            'procedure' => self::SERVICE, 'body' => 'Je souhaite discuter de mon échéancier.',
            'appointment_slot' => '2026-11-16T09:00', 'operation_key' => (string) Str::uuid(),
        ];
        $create = route('dashboard.student.requests', ['academic' => $entry->id]);
        $this->actingAs($student)->post($create, $hold)->assertStatus(303);
        $this->post($create, $hold)->assertStatus(303);
        $ticket = ServiceRequest::sole();
        $this->assertSame('open', $ticket->status);

        $anotherCreate = route('dashboard.student.requests', ['academic' => $otherEntry->id]);
        $anotherHold = array_replace($hold, ['operation_key' => (string) Str::uuid()]);
        $this->actingAs($other)->get(route('dashboard.student.index', [
            'section' => 'services', 'academic' => $otherEntry->id, 'procedure' => self::SERVICE,
        ]))->assertInertia(fn (Assert $page) => $page->where('scolarite.appointment_slots.0.time', '09:30'));
        $this->post($anotherCreate, $anotherHold)->assertSessionHasErrors('appointment_slot');
        $this->assertDatabaseCount('student_service_requests', 1);

        $confirm = route(self::ADMIN_ROUTE.'confirm', $ticket);
        $detail = route(self::ADMIN_ROUTE.'show', $ticket);
        $confirmation = ['date' => '2026-11-16', 'time' => '09:00', 'location' => 'Bureau 4', 'expected_revision' => 0];
        $this->actingAs($staff)->get($detail)->assertInertia(fn (Assert $page) => $page
            ->where('ticket.appointment_reservation.time', '09:00')->where('appointment_slots.0.time', '09:00'));
        $this->put($settings, ['windows' => [], 'expected_revision' => 1])->assertStatus(303);
        $this->get($detail)->assertInertia(fn (Assert $page) => $page
            ->has('appointment_slots', 1)->where('appointment_slots.0.time', '09:00'));
        $this->post($confirm, $confirmation)->assertStatus(303);
        $this->put($settings, ['windows' => self::WINDOWS, 'expected_revision' => 2])->assertStatus(303);
        $this->post($confirm, array_replace($confirmation, ['time' => '10:00', 'expected_revision' => 1]))->assertStatus(303);
        $this->assertSame('10:00', $ticket->fresh()->appointment_starts_at->setTimezone('Africa/Kinshasa')->format('H:i'));

        $this->actingAs($other)->post($anotherCreate, $anotherHold)->assertStatus(303);
        $otherTicket = $otherEntry->serviceRequests()->sole();
        $this->actingAs($staff)->post($confirm, array_replace($confirmation, ['expected_revision' => 2]))
            ->assertSessionHasErrors('time');
        $this->assertSame('10:00', $ticket->fresh()->appointment_starts_at->setTimezone('Africa/Kinshasa')->format('H:i'));
        $this->post(route(self::ADMIN_ROUTE.'reply', $otherTicket), ['response' => 'Cette demande est clôturée.', 'status' => 'resolved'])->assertSessionHasNoErrors();
        $this->post(route(self::ADMIN_ROUTE.'cancel', $ticket), ['reason' => 'Le service est fermé.', 'expected_revision' => 2])->assertStatus(303);

        $this->actingAs($other)->post($anotherCreate, array_replace($anotherHold, [
            'appointment_slot' => '2026-11-16T10:00', 'operation_key' => (string) Str::uuid(),
        ]))->assertStatus(303);
        $this->post($anotherCreate, array_replace($anotherHold, ['operation_key' => (string) Str::uuid()]))->assertStatus(303);
        $this->assertDatabaseCount('student_service_requests', 4);
    }

    private function anotherStudent(AcademicEnrollment $entry): User
    {
        $student = User::factory()->create()->assignRole('student');
        $profile = StudentProfile::create(['user_id' => $student->id, 'student_status' => 'active']);
        $application = Enrollment::create([
            'student_id' => $student->id, 'level_id' => $entry->level_id, 'academic_year_id' => $entry->academic_year_id, 'status' => 'validated',
        ]);
        $entry->replicate()->fill(['student_profile_id' => $profile->id, 'application_id' => $application->id])->save();

        return $student;
    }

    private function staff(): User
    {
        return User::factory()->create()->assignRole(Role::findOrCreate('admin', 'web'))
            ->givePermissionTo(Permission::findOrCreate('manage academic access', 'web'));
    }
}
