<?php

namespace Tests\Feature;

use App\Models\Student\AcademicEnrollment;
use App\Models\Student\ServiceRequest;
use App\Models\User;
use App\Notifications\StudentAppointmentNotice;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class StudentAppointmentAgendaTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    private const ADMIN_ROUTE = 'dashboard.admin.student-academic.';

    public function test_week_agenda_lists_only_scoped_confirmed_appointments_in_kinshasa_and_filters_by_service(): void
    {
        $this->travelTo(Carbon::parse('2026-11-16 08:00:00', 'Africa/Kinshasa'));
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $staff = $this->staff();
        $staff->academicFaculties()->attach($entry->level->faculty_id);
        $otherFaculty = DB::table('faculties')->insertGetId(['name' => 'Autre faculté', 'code' => 'OTHER']);
        $otherLevel = DB::table('levels')->insertGetId(['faculty_id' => $otherFaculty, 'title' => 'Autre niveau', 'code' => 'OTHER']);
        $otherApplication = $entry->application->replicate(['uuid', 'reference'])->fill(['level_id' => $otherLevel]);
        $otherApplication->save();
        $otherEntry = $entry->replicate(['matricule'])->fill(['level_id' => $otherLevel, 'application_id' => $otherApplication->id]);
        $otherEntry->save();

        $finance = $this->appointment($entry, ['appointment_starts_at' => '2026-11-15 23:10:00']);
        $legacy = $this->appointment($entry, ['appointment_starts_at' => '2026-11-22 22:59:00', 'procedure' => null]);
        $this->appointment($entry, ['appointment_starts_at' => '2026-11-22 23:00:00']);
        $this->appointment($otherEntry);
        $this->appointment($entry, ['appointment_confirmed_at' => null, 'status' => 'open']);
        $this->appointment($entry, ['appointment_cancelled_at' => now(), 'status' => 'cancelled']);

        $agenda = $this->adminUrl('agenda');
        $financeFilter = ['week' => '2026-11-16', 'service' => 'finance-appointment'];
        $financeContext = ['agenda_week' => '2026-11-16', 'agenda_service' => 'finance-appointment'];
        $detail = $this->adminUrl('show', ['ticket' => $finance->id] + $financeContext);

        $this->actingAs($staff)->get($agenda)->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/studentAcademic/Agenda')
            ->where('agenda.week', '2026-11-16')->where('agenda.end', '2026-11-22')->where('agenda.today', '2026-11-16')
            ->where('agenda.timezone', 'Africa/Kinshasa')->where('agenda.service', null)
            ->has('agenda.services', 4)->has('agenda.appointments', 2)
            ->where('agenda.appointments.0.id', $finance->id)->where('agenda.appointments.0.time', '00:10')
            ->where('agenda.appointments.1.id', $legacy->id)->where('agenda.appointments.1.service_key', 'other-appointment')
            ->where('agenda.appointments.1.service', 'Scolarité'));
        $this->get($this->adminUrl('agenda', $financeFilter))->assertInertia(fn (Assert $page) => $page
            ->where('agenda.service', 'finance-appointment')->has('agenda.appointments', 1)
            ->where('agenda.appointments.0.service', 'Service financier')->where('agenda.appointments.0.detail_url', $detail)
            ->where('agenda.previous_url', $this->adminUrl('agenda', ['week' => '2026-11-09'] + $financeFilter))
            ->where('agenda.next_url', $this->adminUrl('agenda', ['week' => '2026-11-23'] + $financeFilter))
            ->where('agenda.today_url', $this->adminUrl('agenda', $financeFilter)));
        $this->get($detail)->assertInertia(fn (Assert $page) => $page
            ->where('back_url', $this->adminUrl('agenda', $financeFilter))->where('back_label', 'Retour à l’agenda')
            ->where('actions.cancel_url', null)->where('actions.confirm_url', null));
        $this->get($this->adminUrl('agenda', ['service' => 'other-appointment']))->assertInertia(fn (Assert $page) => $page
            ->has('agenda.appointments', 1)->where('agenda.appointments.0.id', $legacy->id));
        $this->get($this->adminUrl('agenda', ['service' => 'unknown']))->assertSessionHasErrors('service');
        $this->actingAs($this->staff('manage academic finance'))->get($agenda)->assertForbidden();
        $this->actingAs($student)->get($agenda)->assertForbidden();
    }

    public function test_cancellation_removes_the_slot_from_the_agenda_and_notifies_only_the_student_once(): void
    {
        $this->travelTo(Carbon::parse('2026-11-16 08:00:00', 'Africa/Kinshasa'));
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $ticket = $this->appointment($entry, ['response' => 'Veuillez apporter votre carte étudiante.']);
        $staff = $this->staff();
        $context = ['agenda_week' => '2026-11-16', 'agenda_service' => 'finance-appointment'];
        $parameters = ['ticket' => $ticket->id] + $context;
        $detail = $this->adminUrl('show', $parameters);
        $cancel = $this->adminUrl('cancel', $parameters);
        $confirm = $this->adminUrl('confirm', $parameters);
        $input = ['reason' => 'Le service doit fermer exceptionnellement.', 'expected_revision' => 1];

        $this->actingAs($staff)->get($detail)->assertInertia(fn (Assert $page) => $page
            ->where('actions.cancel_url', $cancel)->where('ticket.appointment_cancellation', null));
        $this->post($cancel, ['expected_revision' => 1])->assertRedirect($detail)->assertSessionHasErrors('reason');
        $this->post($cancel, ['expected_revision' => 0] + $input)->assertRedirect($detail)->assertSessionHasErrors('expected_revision');

        $this->post($confirm, ['date' => '2026-11-24', 'time' => '15:00', 'location' => 'Bureau 12', 'expected_revision' => 1])
            ->assertStatus(303)->assertRedirect($detail);
        $this->get($this->adminUrl('agenda'))->assertInertia(fn (Assert $page) => $page->has('agenda.appointments', 0));
        $next = $this->adminUrl('agenda', ['week' => '2026-11-23']);
        $this->get($next)->assertInertia(fn (Assert $page) => $page
            ->has('agenda.appointments', 1)->where('agenda.appointments.0.time', '15:00'));
        $this->post($cancel, $input)->assertRedirect($detail)->assertSessionHasErrors('expected_revision');

        $input['expected_revision'] = 2;
        $this->post($cancel, $input)->assertStatus(303)->assertRedirect($detail);
        $this->post($cancel, $input)->assertStatus(303)->assertRedirect($detail);
        $this->assertDatabaseHas('student_service_requests', [
            'id' => $ticket->id, 'status' => 'cancelled', 'appointment_cancelled_by' => $staff->id,
            'appointment_revision' => 3, 'appointment_cancellation_reason' => $input['reason'],
            'appointment_starts_at' => '2026-11-24 14:00:00', 'response' => 'Veuillez apporter votre carte étudiante.',
        ]);
        $this->assertDatabaseHas('academic_audits', ['entity_id' => $ticket->id, 'action' => 'student_appointment_cancelled']);
        $this->get($next)->assertInertia(fn (Assert $page) => $page->has('agenda.appointments', 0));
        $this->get($detail)->assertInertia(fn (Assert $page) => $page
            ->where('ticket.appointment', null)->where('ticket.appointment_cancellation.reason', $input['reason'])
            ->where('actions.cancel_url', null)->where('actions.confirm_url', null)->where('actions.reply_url', null));
        $this->post($confirm, ['date' => '2026-11-24', 'time' => '15:00', 'location' => 'Bureau 12', 'expected_revision' => 3])
            ->assertRedirect($detail)->assertSessionHasErrors('expected_revision');
        $this->post($this->adminUrl('reply', $parameters + ['from_detail' => 1]), ['status' => 'resolved', 'response' => 'Modifier la réponse.'])
            ->assertRedirect($detail)->assertSessionHasErrors('status');

        $notices = $student->notifications()->where('type', StudentAppointmentNotice::class)->get();
        $this->assertCount(2, $notices);
        $notice = $notices->firstWhere('data.status', 'appointment_cancelled');
        $this->assertNotNull($notice);
        $this->assertFalse($staff->notifications()->where('type', StudentAppointmentNotice::class)->exists());
        $tracking = route('dashboard.student.index', ['section' => 'requests', 'academic' => $entry->id, 'request' => $ticket->id]);
        $this->actingAs($student)->post(route('dashboard.notifications.open', $notice->id))->assertStatus(303)->assertRedirect($tracking);
        $this->get($tracking)->assertInertia(fn (Assert $page) => $page
            ->where('scolarite.selected_request.appointment_confirmed', null)
            ->where('scolarite.selected_request.appointment_cancelled.date', '2026-11-24')
            ->where('scolarite.selected_request.appointment_cancelled.time', '15:00')
            ->where('scolarite.selected_request.appointment_cancelled.location', 'Bureau 12')
            ->where('scolarite.selected_request.appointment_cancelled.reason', $input['reason'])
            ->where('scolarite.selected_request.status', 'cancelled'));
    }

    public function test_only_authorized_staff_can_cancel_a_future_confirmed_appointment(): void
    {
        $this->travelTo(Carbon::parse('2026-11-16 08:00:00', 'Africa/Kinshasa'));
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $future = $this->appointment($entry);
        $past = $this->appointment($entry, ['appointment_starts_at' => '2026-11-15 10:00:00']);
        $pending = $this->appointment($entry, ['appointment_starts_at' => null, 'appointment_confirmed_at' => null, 'status' => 'open']);
        $external = $this->staff();
        $external->academicFaculties()->attach(DB::table('faculties')->insertGetId(['name' => 'Autre faculté', 'code' => 'OTHER']));
        $input = ['reason' => 'Motif d’annulation du rendez-vous.', 'expected_revision' => 1];

        $this->actingAs($external)->post($this->adminUrl('cancel', ['ticket' => $future->id]), $input)->assertForbidden();
        $this->actingAs($this->staff())->post($this->adminUrl('cancel', ['ticket' => $pending->id]), $input)->assertNotFound();
        $this->post($this->adminUrl('cancel', ['ticket' => $past->id]), $input)->assertSessionHasErrors('expected_revision');
        $this->post($this->adminUrl('confirm', ['ticket' => $past->id]), [
            'date' => '2026-11-17', 'time' => '10:00', 'location' => 'Bureau 12', 'expected_revision' => 1,
        ])->assertSessionHasErrors('time');
        $this->assertNull($future->fresh()->appointment_cancelled_at);
        $this->assertNull($past->fresh()->appointment_cancelled_at);
        $this->assertFalse($student->notifications()->where('type', StudentAppointmentNotice::class)->exists());
    }

    private function appointment(AcademicEnrollment $entry, array $fields = []): ServiceRequest
    {
        return $entry->serviceRequests()->create($fields + [
            'category' => 'appointment', 'procedure' => 'finance-appointment', 'subject' => 'Rendez-vous financier',
            'body' => 'Je souhaite faire vérifier mes frais universitaires.', 'status' => 'resolved',
            'appointment_starts_at' => '2026-11-18 13:00:00', 'appointment_confirmed_at' => now(),
            'appointment_location' => 'Bureau 2', 'appointment_revision' => 1,
        ]);
    }

    private function adminUrl(string $action, array $query = []): string
    {
        return route(self::ADMIN_ROUTE.'requests.'.$action, $query);
    }

    private function staff(string $permission = 'manage academic access'): User
    {
        $role = Role::findOrCreate('admin', 'web');
        $role->syncPermissions([]);

        return User::factory()->create()->assignRole($role)->givePermissionTo(Permission::findOrCreate($permission, 'web'));
    }
}
