<?php

namespace Tests\Feature;

use App\Models\AcademicStructure\University;
use App\Models\Student\OfficialDocumentType;
use App\Models\Student\ServiceRequest;
use App\Models\User;
use App\Modules\Documents\Application\DocumentAccess;
use App\Notifications\StudentAppointmentNotice;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class StudentRequestAdministrationTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    private const ADMIN_ROUTE = 'dashboard.admin.student-academic.';

    public function test_staff_opens_a_request_and_previews_its_private_attachment_and_replies_from_the_detail(): void
    {
        Storage::fake('local');
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $path = 'student-requests/'.$entry->id.'/receipt.pdf';
        Storage::disk('local')->put($path, "%PDF-1.4\nExemple de justificatif\n%%EOF\n");
        $ticket = $entry->serviceRequests()->create([
            'category' => 'finance',
            'procedure' => 'payment-verification',
            'subject' => 'Vérification du paiement',
            'body' => 'Je souhaite faire vérifier le paiement indiqué.',
            'request_attachment_path' => $path,
            'request_attachment_name' => 'justificatif.pdf',
        ]);
        $context = ['academic' => $entry->id, 'request_category' => 'finance', 'request_status' => 'open'];
        $queue = route(self::ADMIN_ROUTE.'index', ['tab' => 'requests'] + $context);
        $detail = $this->requestUrl('show', $ticket, $context);
        $reply = $this->requestUrl('reply', $ticket, $context + ['from_detail' => 1]);
        $preview = $this->requestUrl('preview', $ticket);
        $download = $this->requestUrl('attachment', $ticket);
        $actor = $this->staff();
        $actor->academicFaculties()->attach($entry->level->faculty_id);

        $this->actingAs($actor)->get($queue)->assertInertia(fn (Assert $page) => $page
            ->where('requests.data.0.detail_url', $detail));
        $this->get($detail)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/studentAcademic/Request')
            ->where('ticket.id', $ticket->id)
            ->where('ticket.attachment_preview_url', $preview)
            ->where('ticket.attachment_url', $download)
            ->where('ticket.attachment_mime', 'application/pdf')
            ->where('ticket.attachment_name', 'justificatif.pdf')
            ->where('ticket.is_appointment', false)
            ->where('ticket.responder_name', null)
            ->missing('ticket.request_attachment_path')
            ->where('student.id', $entry->id)
            ->where('actions.reply_url', $reply)
            ->where('actions.confirm_url', null)
            ->where('back_url', $queue));
        $this->get($preview)->assertOk()->assertHeader('Content-Type', 'application/pdf')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Content-Security-Policy', "sandbox; default-src 'none'; media-src 'self'; img-src 'self'");
        $this->get($download)->assertOk()->assertDownload('justificatif.pdf');
        Storage::disk('local')->put($path, 'Fichier différent du type déclaré.');
        $this->get($preview)->assertNotFound();
        $this->post($reply, ['status' => 'open'])->assertRedirect($detail)->assertSessionHasErrors('response');
        $this->post($reply, ['status' => 'resolved', 'response' => 'La comptabilité a vérifié le versement.'])
            ->assertStatus(303)->assertRedirect($detail);
        $this->get($detail)->assertInertia(fn (Assert $page) => $page
            ->where('ticket.status', 'resolved')
            ->where('ticket.response', 'La comptabilité a vérifié le versement.')
            ->where('ticket.responder_name', $actor->first_name.' '.$actor->last_name));

        $dossier = ['dossier_academic' => $entry->id, 'records_page' => 2];
        $this->get($this->requestUrl('show', $ticket, $dossier))->assertInertia(fn (Assert $page) => $page
            ->where('back_url', route(self::ADMIN_ROUTE.'show', ['academic' => $entry->id, 'section' => 'Demandes', 'records_page' => 2])));
    }

    public function test_confirm_and_reschedule_appointments_updates_the_student_tracking_and_notification_once_per_change(): void
    {
        $this->travelTo(Carbon::parse('2026-11-14 10:00:00', 'Africa/Kinshasa'));
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $ticket = $entry->serviceRequests()->create([
            'category' => 'appointment',
            'procedure' => 'finance-appointment',
            'subject' => 'Rendez-vous avec le service financier',
            'body' => 'Je souhaite faire vérifier mes frais universitaires.',
            'response' => 'Apportez votre justificatif de paiement.',
            'appointment_date' => '2026-11-16',
            'appointment_period' => 'morning',
        ]);
        $context = ['request_category' => 'appointment', 'requests_page' => 2, 'queue_ticket' => $ticket->id];
        $detail = $this->requestUrl('show', $ticket, $context);
        $confirm = $this->requestUrl('confirm', $ticket, $context);
        $reply = $this->requestUrl('reply', $ticket, $context + ['from_detail' => 1]);
        $input = ['date' => '2026-11-17', 'time' => '09:15', 'location' => 'Bâtiment A, bureau 2', 'expected_revision' => 0];

        $actor = $this->staff();
        $this->actingAs($actor)->get($detail)->assertInertia(fn (Assert $page) => $page
            ->where('ticket.is_appointment', true)->where('ticket.appointment', null)
            ->where('ticket.appointment_date', '2026-11-16')
            ->where('ticket.appointment_period', 'morning')
            ->where('actions.confirm_url', $confirm));
        $this->post($confirm, array_replace($input, ['date' => '2026-11-14', 'time' => '09:45']))
            ->assertRedirect($detail)->assertSessionHasErrors('time');
        $this->post($confirm, $input)->assertStatus(303)->assertRedirect($detail);
        $this->assertDatabaseHas('student_service_requests', [
            'id' => $ticket->id, 'appointment_date' => '2026-11-16 00:00:00', 'appointment_period' => 'morning',
            'appointment_starts_at' => '2026-11-17 08:15:00', 'appointment_location' => $input['location'], 'appointment_revision' => 1,
            'appointment_confirmed_by' => $actor->id, 'status' => 'resolved', 'response' => 'Apportez votre justificatif de paiement.',
        ]);
        $this->get($detail)->assertInertia(fn (Assert $page) => $page
            ->where('ticket.appointment.date', '2026-11-17')
            ->where('ticket.appointment.time', '09:15')
            ->where('ticket.appointment.location', $input['location'])
            ->where('ticket.appointment_revision', 1));
        $this->post($confirm, $input)->assertStatus(303)->assertRedirect($detail);
        $this->assertSame(1, $student->notifications()->where('type', StudentAppointmentNotice::class)->count());
        $this->post($reply, ['status' => 'open', 'response' => 'Réouverture non permise.'])->assertRedirect($detail)->assertSessionHasErrors('status');
        $changed = array_replace($input, ['time' => '14:30', 'response' => 'Présentez-vous avec votre carte étudiante.']);
        $this->post($confirm, $changed)->assertRedirect($detail)->assertSessionHasErrors('expected_revision');
        $this->post($confirm, array_replace($changed, ['expected_revision' => 1]))->assertStatus(303)->assertRedirect($detail);
        $this->assertDatabaseHas('academic_audits', ['entity_id' => $ticket->id, 'action' => 'student_appointment_confirmed']);
        $this->assertDatabaseHas('academic_audits', ['entity_id' => $ticket->id, 'action' => 'student_appointment_rescheduled']);
        $this->assertSame(2, $student->notifications()->where('type', StudentAppointmentNotice::class)->count());

        $tracking = route('dashboard.student.index', ['section' => 'requests', 'academic' => $entry->id, 'request' => $ticket->id]);
        $notice = $student->notifications()->where('type', StudentAppointmentNotice::class)
            ->get()->firstWhere('data.status', 'appointment_rescheduled');
        $this->actingAs($student)->get($tracking)->assertInertia(fn (Assert $page) => $page
            ->where('scolarite.selected_request.appointment_confirmed.date', '2026-11-17')
            ->where('scolarite.selected_request.appointment_confirmed.time', '14:30')
            ->where('scolarite.selected_request.appointment_confirmed.location', $input['location'])
            ->where('scolarite.selected_request.appointment_period', 'morning')
            ->where('scolarite.selected_request.response', $changed['response'])
            ->where('studentNotifications.unread_count', 2));
        $this->post(route('dashboard.notifications.open', $notice->id))->assertStatus(303)->assertRedirect($tracking);
        $this->assertNotNull($notice->fresh()->read_at);
    }

    public function test_detail_preview_and_confirmation_enforce_faculty_scope_and_keep_ordinary_requests_separate(): void
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $appointment = $entry->serviceRequests()->create(['category' => 'appointment', 'subject' => 'Rendez-vous', 'body' => 'Motif de la demande.']);
        $regular = $entry->serviceRequests()->create(['category' => 'support', 'subject' => 'Assistance', 'body' => 'Motif de la demande.']);
        $input = ['date' => now()->addDay()->toDateString(), 'time' => '10:00', 'location' => 'Bureau 1', 'expected_revision' => 0];
        $external = $this->staff();
        $external->academicFaculties()->attach(DB::table('faculties')->insertGetId(['name' => 'Hors périmètre', 'code' => 'EXT']));

        foreach ([$external, $this->staff('manage academic finance'), $student] as $actor) {
            $this->actingAs($actor)->get($this->requestUrl('show', $appointment))->assertForbidden();
            $this->get($this->requestUrl('preview', $appointment))->assertForbidden();
            $this->post($this->requestUrl('confirm', $appointment), $input)->assertForbidden();
        }
        $this->actingAs($this->staff())->post($this->requestUrl('confirm', $regular), $input)->assertNotFound();
        $this->assertNull($appointment->fresh()->appointment_starts_at);
        $this->assertNull($regular->fresh()->appointment_starts_at);
    }

    public function test_official_document_request_detail_keeps_its_specialized_workflow(): void
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $university = University::create(['name' => 'Université de test', 'code' => 'UTEST', 'is_active' => true]);
        $type = OfficialDocumentType::create([
            'university_id' => $university->id, 'faculty_id' => $entry->level->faculty_id, 'code' => 'ATT',
            'name' => 'Attestation', 'kind' => 'enrollment', 'policy' => ['student_request' => true],
        ]);
        $ticket = $entry->serviceRequests()->create([
            'category' => 'document', 'subject' => 'Attestation', 'body' => 'Motif de la demande officielle.', 'official_document_type_id' => $type->id,
        ]);
        $staff = $this->staff();
        $detail = $this->requestUrl('show', $ticket);
        $this->actingAs($staff)->get($detail)->assertInertia(fn (Assert $page) => $page
            ->where('actions.reply_url', null)->where('actions.confirm_url', null)->where('actions.specialized_url', null));
        $staff->givePermissionTo(Permission::findOrCreate(DocumentAccess::MANAGE, 'web'));
        $this->get($detail)->assertInertia(fn (Assert $page) => $page->where('actions.specialized_url', route('dashboard.admin.official-documents.index', [
            'academic' => $entry->id, 'type' => $type->id,
        ])));
        $this->post($this->requestUrl('reply', $ticket), ['status' => 'resolved', 'response' => 'Réponse non autorisée.'])->assertForbidden();
        $this->get(route(self::ADMIN_ROUTE.'show', ['academic' => $entry->id, 'section' => 'Demandes']))->assertInertia(fn (Assert $page) => $page
            ->where('dossier.requests.data.0.detail_url', $this->requestUrl('show', $ticket, ['dossier_academic' => $entry->id])));
    }

    private function requestUrl(string $action, ServiceRequest $ticket, array $query = []): string
    {
        return route(self::ADMIN_ROUTE.'requests.'.$action, ['ticket' => $ticket->id] + $query);
    }

    private function staff(string $permission = 'manage academic access'): User
    {
        $role = Role::findOrCreate('admin', 'web');
        $role->syncPermissions([]);

        return User::factory()->create()->assignRole($role)->givePermissionTo(Permission::findOrCreate($permission, 'web'));
    }
}
