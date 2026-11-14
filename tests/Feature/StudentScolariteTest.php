<?php

namespace Tests\Feature;

use App\Models\Enrollment;
use App\Models\Student\AccessRule;
use App\Models\Student\ServiceRequest;
use App\Models\Student\StudentProfile;
use App\Models\User;
use App\Modules\Student\Application\Services\StudentAppointmentBooking;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class StudentScolariteTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    public function test_student_catalog_forms_and_history_use_the_selected_enrollment(): void
    {
        Storage::fake('local');
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $this->actingAs($student)->get($this->portal('services', $entry->id))->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/student/Portal')
            ->has('scolarite.categories', 5)
            ->has('scolarite.categories.0.procedures', 6)
            ->has('scolarite.categories.1.procedures', 8)
            ->has('scolarite.categories.2.procedures', 4)
            ->has('scolarite.categories.3.procedures', 7)
            ->has('scolarite.categories.4.procedures', 4)
            ->where('scolarite.counts.total', 0));
        $form = $this->portal('services', $entry->id, ['procedure' => 'payment-verification']);
        $this->get($form)->assertInertia(fn (Assert $page) => $page
            ->where('scolarite.active_category', 'finance')->where('scolarite.active_procedure', 'payment-verification'));
        $this->get($this->portal('services', $entry->id, ['category' => 'identity']))->assertInertia(fn (Assert $page) => $page
            ->where('scolarite.active_category', 'identity'));
        $this->get($this->portal('services', $entry->id, ['procedure' => 'unknown-procedure']))->assertNotFound();
        $operation = (string) Str::uuid();
        $body = 'Mon paiement du 2 novembre ne figure pas dans mon historique.';
        $submit = route('dashboard.student.requests', ['academic' => $entry->id]);
        $pdf = "%PDF-1.4\ncontenu de test\n%%EOF\n";
        $payload = ['procedure' => 'payment-verification', 'operation_key' => $operation, 'body' => $body];
        $this->post($submit, $payload + [
            'file' => UploadedFile::fake()->createWithContent('preuve.pdf', $pdf),
        ])->assertStatus(303)->assertSessionHasNoErrors();
        $ticket = ServiceRequest::sole();
        $this->assertDatabaseHas('student_service_requests', [
            'id' => $ticket->id, 'academic_enrollment_id' => $entry->id, 'category' => 'finance',
            'subject' => 'Vérification d’un paiement non reconnu', 'status' => 'open',
        ]);
        Storage::disk('local')->assertExists($ticket->request_attachment_path);
        $this->assertStringStartsWith('student-requests/'.$entry->id.'/', $ticket->request_attachment_path);

        $url = $this->portal('requests', $entry->id, ['request' => $ticket->id]);
        $this->post($submit, $payload + ['file' => UploadedFile::fake()->createWithContent('preuve.pdf', $pdf)])->assertRedirect($url);
        $this->assertDatabaseCount('student_service_requests', 1);
        $this->post($submit, ['body' => 'Cette seconde description est différente.'] + $payload)
            ->assertRedirect($form)->assertSessionHasErrors('operation_key');
        $this->get($url)->assertInertia(fn (Assert $page) => $page
            ->where('scolarite.selected_request.id', $ticket->id)
            ->where('scolarite.selected_request.body', $body)
            ->where('scolarite.selected_request.service', 'Service financier')
            ->where('scolarite.selected_request.status_group', 'open')
            ->where('scolarite.selected_request.attachment.name', 'preuve.pdf')
            ->missing('scolarite.selected_request.request_attachment_path'));
        $attachment = route('dashboard.student.requests.attachment', ['academic' => $entry->id, 'ticket' => $ticket->id]);
        $this->get($attachment)->assertDownload('preuve.pdf');

        $ticket->update(['status' => 'resolved', 'response' => 'Votre paiement a été vérifié.']);
        $this->get($this->portal('requests', $entry->id, ['status' => 'open']))->assertInertia(fn (Assert $page) => $page
            ->where('scolarite.counts.resolved', 1)->has('scolarite.requests.data', 0));
        $this->get($this->portal('requests', $entry->id, ['status' => 'resolved']))->assertInertia(fn (Assert $page) => $page
            ->has('scolarite.requests.data', 1)->where('scolarite.requests.data.0.response', 'Votre paiement a été vérifié.'));

        $other = User::factory()->create();
        $other->assignRole('student');
        $profile = StudentProfile::create(['user_id' => $other->id, 'student_status' => 'active']);
        $application = Enrollment::create(['student_id' => $other->id, 'level_id' => $entry->level_id, 'academic_year_id' => $entry->academic_year_id, 'status' => 'validated']);
        $otherEntry = $entry->replicate()->fill(['student_profile_id' => $profile->id, 'application_id' => $application->id]);
        $otherEntry->save();
        $this->actingAs($other)->get($this->portal('requests', $otherEntry->id, ['request' => $ticket->id]))->assertNotFound();
        $this->get(route('dashboard.student.requests.attachment', ['academic' => $otherEntry->id, 'ticket' => $ticket->id]))->assertNotFound();
    }

    public function test_appointments_are_pending_requests_with_a_reserved_slot(): void
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $url = route('dashboard.student.requests', ['academic' => $entry->id]);
        $this->actingAs($student);
        $appointment = ['procedure' => 'finance-appointment', 'body' => 'Je souhaite parler de mon échéancier.'];
        $this->post($url, $appointment)->assertSessionHasErrors('appointment_slot');
        $this->post($url, $appointment + ['appointment_slot' => 'invalid'])->assertSessionHasErrors('appointment_slot');
        $this->post($url, ['procedure' => 'made-up-action', 'body' => $appointment['body']])->assertSessionHasErrors('procedure');
        $this->post($url, ['procedure' => 'academic-appeal', 'body' => $appointment['body']])->assertSessionHasErrors('procedure');
        $this->assertDatabaseCount('student_service_requests', 0);

        $day = today('Africa/Kinshasa')->addWeek();
        $date = $day->toDateString();
        $this->post($url, $appointment + ['appointment_slot' => $date.'T09:00'])->assertSessionHasErrors('appointment_slot');
        app(StudentAppointmentBooking::class)->saveWindows('finance-appointment', [
            ['weekday' => $day->dayOfWeekIso, 'starts_at' => '09:00', 'ends_at' => '10:00'],
        ]);
        $this->post($url, $appointment + ['appointment_slot' => $date.'T09:00'])->assertStatus(303)->assertSessionHasNoErrors();
        $ticket = ServiceRequest::sole();
        $this->assertSame('open', $ticket->status);
        $this->assertSame('appointment', $ticket->category);
        $this->get($this->portal('requests', $entry->id, ['request' => $ticket->id]))->assertInertia(fn (Assert $page) => $page
            ->where('scolarite.selected_request.appointment_reservation.date', $date)->where('scolarite.selected_request.appointment_reservation.time', '09:00')
            ->where('scolarite.selected_request.appointment_date', null)->where('scolarite.selected_request.appointment_period', null)
            ->where('scolarite.selected_request.status', 'open')->where('scolarite.selected_request.response', null));
    }

    public function test_document_access_remains_enforced_and_general_support_remains_available(): void
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        AccessRule::create(['feature' => 'documents_request', 'level_id' => $entry->level_id, 'mode' => 'hidden', 'is_active' => true]);
        $url = route('dashboard.student.requests', ['academic' => $entry->id]);
        $this->actingAs($student)->get($this->portal('services', $entry->id, ['procedure' => 'attendance-certificate']))
            ->assertInertia(fn (Assert $page) => $page->where('scolarite.categories.0.procedures.1.href', null)
                ->where('scolarite.categories.0.procedures.1.unavailable_reason', 'Ce service n’est pas proposé pour votre parcours académique.'));
        $this->post($url, ['procedure' => 'attendance-certificate', 'body' => 'Je souhaite une attestation de fréquentation.'])->assertForbidden();
        $this->post($url, ['procedure' => 'general-support', 'body' => 'Je souhaite parler du suivi de mon dossier.'])->assertStatus(303)->assertSessionHasNoErrors();
        $this->assertDatabaseHas('student_service_requests', ['procedure' => 'general-support', 'category' => 'identity']);
    }

    private function portal(string $section, int $academic, array $query = []): string
    {
        return route('dashboard.student.index', ['section' => $section, 'academic' => $academic] + $query);
    }
}
