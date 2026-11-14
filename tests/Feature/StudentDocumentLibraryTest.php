<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Courses;
use App\Models\Enrollment;
use App\Models\EnrollmentDocument;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicOffering;
use App\Models\Student\AcademicResource;
use App\Models\Student\AcademicSubmission;
use App\Models\Student\AccessRule;
use App\Models\Student\StudentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class StudentDocumentLibraryTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    public function test_it_lists_accepted_files_and_receipts_across_years_without_disclosing_other_students_documents(): void
    {
        $this->freezeSecond();
        Storage::fake('local');
        $student = $this->studentContext();
        $current = $student->studentProfile->enrollments()->sole();
        $historical = $this->previousEnrollment($current);
        $historical->application->update(['meta' => ['required_documents' => ['diplome' => 'Diplôme d’État']]]);
        $accepted = $this->admissionFile($historical->application, 'diplome', 'accepted');
        $this->admissionFile($current->application, 'identite', 'pending');
        $this->admissionFile($current->application, 'brouillon', 'accepted', true);
        $standalone = Enrollment::create([
            'student_id' => $student->id, 'level_id' => $historical->level_id,
            'academic_year_id' => $historical->academic_year_id, 'status' => 'validated',
        ]);
        $this->admissionFile($standalone, 'releve_notes', 'accepted');
        $unvalidated = Enrollment::create([
            'student_id' => $student->id, 'level_id' => $current->level_id,
            'academic_year_id' => $current->academic_year_id, 'status' => 'submitted',
        ]);
        $this->admissionFile($unvalidated, 'non-valide', 'accepted');
        $payment = $this->payment($historical, $student, true);
        $this->payment($current, $student, false);
        $outsider = User::factory()->create()->assignRole('student');
        $foreign = $this->previousEnrollment($current, $outsider);
        $this->admissionFile($foreign->application, 'confidentiel', 'accepted');
        $foreignReceipt = $this->payment($foreign, $outsider, true);

        $base = ['section' => 'documents', 'academic' => $current->id];
        $preview = route('dashboard.enrollments.documents.preview', $accepted->uuid, false);
        $download = route('dashboard.enrollments.documents.download', $accepted->uuid, false);
        $receipt = route('dashboard.student.payments.receipt', ['payment' => $payment->uuid, 'academic' => $historical->id], false);
        $this->actingAs($student)->get(route('dashboard.student.index', $base))->assertInertia(fn (Assert $page) => $page
            ->where('document_library.filter', 'all')->has('document_library.items.data', 3)->where('document_library.items.total', 3));
        $this->get(route('dashboard.student.index', $base + ['category' => 'admissions']))->assertInertia(fn (Assert $page) => $page
            ->where('document_library.filter', 'admissions')->has('document_library.items.data', 2)
            ->where('document_library.items.data.1.title', 'Diplôme d’État')
            ->where('document_library.items.data.1.year', '2025-2026')
            ->where('document_library.items.data.1.preview_url', $preview)
            ->where('document_library.items.data.1.download_url', $download));
        $this->get(route('dashboard.student.index', $base + ['category' => 'receipts']))->assertInertia(fn (Assert $page) => $page
            ->where('document_library.filter', 'receipts')->has('document_library.items.data', 1)
            ->where('document_library.items.data.0.url', $receipt)
            ->where('document_library.items.data.0.currency', 'CDF'));
        $this->get($download)->assertOk()->assertHeader('Cache-Control', 'max-age=0, no-store, private');
        $this->get($receipt)->assertOk()->assertSee($payment->reference);
        $this->get(route('dashboard.student.payments.receipt', ['payment' => $foreignReceipt->uuid, 'academic' => $current->id]))->assertNotFound();
        $this->get(route('dashboard.student.index', ['section' => 'documents', 'academic' => $foreign->id]))->assertNotFound();

        foreach (range(1, 17) as $index) {
            $this->admissionFile($standalone, "annexe-$index", 'accepted');
        }
        $admissions = $base + ['category' => 'admissions'];
        $secondPage = route('dashboard.student.index', $admissions + ['documents_page' => 2]);
        $this->get(route('dashboard.student.index', $admissions))->assertInertia(fn (Assert $page) => $page
            ->has('document_library.items.data', 18)->where('document_library.items.total', 19)
            ->where('document_library.items.links.3.url', $secondPage));
        $this->get($secondPage)->assertInertia(fn (Assert $page) => $page
            ->has('document_library.items.data', 1)->where('document_library.items.total', 19)
            ->where('document_library.items.data.0.download_url', $download));
        $this->actingAs($outsider)->get($download)->assertForbidden();
    }

    public function test_academic_documents_keep_their_original_enrollment_and_access_rules(): void
    {
        $this->freezeSecond();
        $student = $this->studentContext();
        $current = $student->studentProfile->enrollments()->sole();
        $historical = $this->previousEnrollment($current);
        $course = Courses::forceCreate(['title' => 'Cours historique', 'credits' => 2, 'semester' => 1, 'level_id' => $historical->level_id]);
        $offering = AcademicOffering::create([
            'course_id' => $course->id, 'level_id' => $historical->level_id, 'academic_year_id' => $historical->academic_year_id,
            'semester' => 1, 'is_published' => true,
        ]);
        $publication = AcademicResource::create([
            'academic_offering_id' => $offering->id, 'student_profile_id' => $student->studentProfile->id,
            'kind' => 'document', 'title' => 'Attestation de stage', 'body' => 'Rapport transmis par la faculté.',
            'path' => 'private/stage.pdf', 'is_published' => true,
        ]);
        $assignment = AcademicResource::create([
            'academic_offering_id' => $offering->id, 'kind' => 'assignment', 'title' => 'Exercice historique', 'is_published' => true,
        ]);
        $result = AcademicResource::create([
            'academic_offering_id' => $offering->id, 'student_profile_id' => $student->studentProfile->id,
            'kind' => 'result', 'title' => 'Résultat individuel', 'path' => 'private/resultat.pdf', 'is_published' => true,
        ]);
        AcademicResource::create([
            'academic_offering_id' => $offering->id, 'kind' => 'result',
            'title' => 'Résultat sans destinataire', 'path' => 'private/inconnu.pdf', 'is_published' => true,
        ]);
        AcademicSubmission::create([
            'academic_enrollment_id' => $historical->id, 'academic_resource_id' => $assignment->id, 'body' => 'Mon exercice transmis.',
        ]);
        $resultsRule = AccessRule::create([
            'feature' => 'results_view', 'academic_year_id' => $historical->academic_year_id, 'mode' => 'hidden', 'is_active' => true,
        ]);
        $route = route('dashboard.student.index', ['section' => 'documents', 'academic' => $current->id, 'category' => 'academic']);

        $this->actingAs($student)->get($route)->assertInertia(fn (Assert $page) => $page
            ->has('document_library.items.data', 2)
            ->where('document_library.items.data.0.title', $publication->title)
            ->where('document_library.items.data.0.body', null)
            ->where('document_library.items.data.0.download_url', null)
            ->where('document_library.items.data.1.body', 'Mon exercice transmis.'));
        AccessRule::create(['feature' => 'documents_request', 'academic_year_id' => $historical->academic_year_id, 'mode' => 'open', 'is_active' => true]);
        $this->get($route)->assertInertia(fn (Assert $page) => $page
            ->where('document_library.items.data.0.body', $publication->body)
            ->where('document_library.items.data.0.download_url', route('dashboard.student.resources.download', ['resource' => $publication->id, 'academic' => $historical->id], false)));
        $resultsRule->update(['mode' => 'open']);
        $this->get($route)->assertInertia(fn (Assert $page) => $page
            ->has('document_library.items.data', 3)
            ->where('document_library.items.data.0.title', $result->title)
            ->where('document_library.items.data.0.download_url', route('dashboard.student.resources.download', ['resource' => $result->id, 'academic' => $historical->id], false)));
    }

    private function previousEnrollment(AcademicEnrollment $entry, ?User $user = null): AcademicEnrollment
    {
        $year = AcademicYear::firstOrCreate(['title' => '2025-2026'], ['start_date' => '2025-10-01', 'end_date' => '2026-09-30', 'status' => 'closed']);
        $profile = $user ? StudentProfile::create(['user_id' => $user->id, 'student_status' => 'active']) : $entry->profile;
        $application = Enrollment::create([
            'student_id' => $profile->user_id, 'level_id' => $entry->level_id, 'academic_year_id' => $year->id, 'status' => 'validated',
        ]);

        return $profile->enrollments()->create([
            'application_id' => $application->id, 'level_id' => $entry->level_id, 'academic_year_id' => $year->id,
            'enrollment_status' => 'completed', 'currency' => 'CDF',
        ]);
    }

    private function admissionFile(Enrollment $application, string $key, string $status, bool $temporary = false): EnrollmentDocument
    {
        $path = 'private/'.Str::uuid().'.pdf';
        $bytes = '%PDF-1.4 Student document';
        Storage::disk('local')->put($path, $bytes);

        return $application->documents()->create([
            'type' => 'document', 'key' => $key, 'disk' => 'local', 'path' => $path, 'filename' => $key.'.pdf',
            'mime' => 'application/pdf', 'size_bytes' => strlen($bytes), 'sha256' => hash('sha256', $bytes),
            'review_status' => $status, 'is_temp' => $temporary, 'verified_at' => now()->subDay(),
        ]);
    }

    private function payment(AcademicEnrollment $entry, User $actor, bool $confirmed)
    {
        return $entry->payments()->create([
            'uuid' => Str::uuid(), 'kind' => 'tuition', 'amount_cents' => 150000, 'currency' => $entry->currency,
            'status' => $confirmed ? 'confirmed' : 'pending', 'method' => 'cash', 'reference' => 'PAY-'.Str::uuid(),
            'recorded_by' => $actor->id, 'confirmed_at' => $confirmed ? now() : null,
        ]);
    }
}
