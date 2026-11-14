<?php

namespace Tests\Feature;

use App\Models\Student\AcademicAudit;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\ServiceRequest;
use App\Models\User;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

class StudentManagementTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    private function staff(array $permissions): User
    {
        $user = User::factory()->create();
        $role = Role::findOrCreate('admin', 'web');
        $role->syncPermissions([]);
        $user->assignRole($role);
        foreach ($permissions as $permission) {
            $user->givePermissionTo(Permission::findOrCreate($permission, 'web'));
        }

        return $user;
    }

    public function test_directory_searches_postname_and_paginates_without_financial_data(): void
    {
        $student = $this->studentContext();
        $student->update(['post_name' => 'Mukendi']);
        $staff = $this->staff(['manage academic access']);
        $this->actingAs($staff)->get('/app/dashboard/admin/student-academic?q=Mukendi')->assertInertia(fn (Assert $page) => $page
            ->has('students.data', 1)->where('students.data.0.name', $student->last_name.' Mukendi '.$student->first_name)
            ->where('balance', null)->where('students.per_page', 15));
        $this->get('/app/dashboard/admin/student-academic?q=Introuvable')->assertInertia(fn (Assert $page) => $page->has('students.data', 0));
    }

    public function test_directory_tabs_require_their_own_staff_permission(): void
    {
        $tabs = [
            'finance' => 'manage academic finance',
            'teaching' => 'publish academic content',
            'rules' => 'manage academic access',
            'requests' => 'manage academic access',
        ];

        foreach (array_unique($tabs) as $permission) {
            $this->actingAs($this->staff([$permission]))->get(route('dashboard.admin.student-academic.index'))->assertOk();
            foreach ($tabs as $tab => $requiredPermission) {
                $response = $this->get(route('dashboard.admin.student-academic.index', ['tab' => $tab]));
                if ($permission === $requiredPermission) {
                    $response->assertOk()->assertInertia(fn (Assert $page) => $page
                        ->component('dashboard/studentAcademic/Index')->where('filters.tab', $tab));
                } else {
                    $response->assertForbidden();
                }
            }
        }
    }

    public function test_summary_does_not_query_heavy_sections_and_finance_is_server_protected(): void
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->firstOrFail();
        $staff = $this->staff(['manage academic access']);
        DB::enableQueryLog();
        $this->actingAs($staff)->get('/app/dashboard/admin/student-academic/'.$entry->id)->assertInertia(fn (Assert $page) => $page
            ->where('section', 'Résumé')->where('dossier.finance', null)->has('dossier.attendance', 0)->has('dossier.timeline', 0));
        $sql = implode("\n", array_column(DB::getQueryLog(), 'query'));
        DB::disableQueryLog();
        $this->assertStringNotContainsString('from "academic_attendances"', $sql);
        $this->assertStringNotContainsString('from "student_payments"', $sql);
        $this->get('/app/dashboard/admin/student-academic/'.$entry->id.'?section=Finances')->assertInertia(fn (Assert $page) => $page->where('dossier.finance', null));
        $this->actingAs($this->staff(['manage academic finance']))->get('/app/dashboard/admin/student-academic/'.$entry->id.'?section=Finances')
            ->assertInertia(fn (Assert $page) => $page->has('dossier.finance.balance')->where('account', null)->where('dossier.identity', null));
    }

    public function test_requests_and_history_are_paginated_and_scoped_to_the_student(): void
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->firstOrFail();
        for ($i = 0; $i < 27; $i++) {
            ServiceRequest::create(['academic_enrollment_id' => $entry->id, 'category' => 'appeal', 'subject' => 'Demande '.$i, 'body' => 'Détail de la demande', 'status' => 'open']);
            AcademicAudit::create(['action' => 'student_profile_updated', 'entity_type' => 'student_profiles', 'entity_id' => $entry->student_profile_id]);
        }
        $this->actingAs($this->staff(['manage academic access']))->get('/app/dashboard/admin/student-academic/'.$entry->id.'?section=Demandes')
            ->assertInertia(fn (Assert $page) => $page->has('dossier.requests.data', 25));
        $this->get('/app/dashboard/admin/student-academic/'.$entry->id.'?section=Demandes&records_page=2')
            ->assertInertia(fn (Assert $page) => $page->has('dossier.requests.data', 2));
        $this->get('/app/dashboard/admin/student-academic/'.$entry->id.'?section=Historique')
            ->assertInertia(fn (Assert $page) => $page->has('dossier.timeline', 25)->where('dossier.records.more', true));
        $this->actingAs($student)->get('/app/dashboard/admin/student-academic/'.$entry->id)->assertForbidden();
        $this->actingAs($this->staff(['manage academic finance']))->get('/app/dashboard/admin/student-academic/'.$entry->id.'?section=Demandes')
            ->assertInertia(fn (Assert $page) => $page->where('dossier.requests', null));
    }

    public function test_account_actions_require_both_permissions_and_a_reason_and_never_return_secrets(): void
    {
        Notification::fake();
        $student = $this->studentContext();
        $student->forceFill(['email_verified_at' => null])->save();
        $entry = AcademicEnrollment::firstOrFail();
        $url = '/app/dashboard/admin/student-academic/'.$entry->id.'/account';
        $this->actingAs($this->staff(['manage academic access']))->post($url, ['action' => 'verify', 'reason' => 'Demande de vérification.'])->assertForbidden();
        $this->actingAs($this->staff(['manage academic access', 'manage users']))->post($url, ['action' => 'verify'])->assertSessionHasErrors('reason');
        $this->post($url, ['action' => 'verify', 'reason' => 'Demande de vérification.'])->assertSessionHasNoErrors();
        Notification::assertSentTo($student, VerifyEmail::class);
        $this->assertDatabaseHas('academic_audits', ['entity_type' => 'student_profiles', 'entity_id' => $entry->student_profile_id, 'action' => 'student_account_verify']);
        $this->get('/app/dashboard/admin/student-academic/'.$entry->id.'?section='.urlencode('Compte et sécurité'))->assertInertia(fn (Assert $page) => $page
            ->where('account.email', $student->email)->missing('account.password')->missing('student.password')->missing('account.remember_token'));
    }

    public function test_staff_can_filter_student_services_and_access_attachments_in_their_faculty(): void
    {
        Storage::fake('local');
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $appointmentDate = now()->addDays(7)->toDateString();
        $appointment = $entry->serviceRequests()->create([
            'category' => 'appointment', 'procedure' => 'registrar-appointment', 'subject' => 'Rendez-vous',
            'body' => 'Je souhaite compléter mon dossier.', 'status' => 'open',
            'appointment_date' => $appointmentDate, 'appointment_period' => 'morning',
        ]);
        $path = 'student-requests/'.$entry->id.'/payment.pdf';
        Storage::disk('local')->put($path, "%PDF-1.4\nPaiement de test\n%%EOF\n");
        $finance = $entry->serviceRequests()->create([
            'category' => 'finance', 'procedure' => 'payment-verification', 'subject' => 'Vérification du paiement',
            'body' => 'Mon paiement du 10 novembre reste à confirmer.', 'status' => 'resolved',
            'request_attachment_path' => $path, 'request_attachment_name' => 'paiement.pdf',
        ]);
        $queue = fn ($filters = []) => route('dashboard.admin.student-academic.index', ['tab' => 'requests'] + $filters);
        $attachment = route('dashboard.admin.student-academic.requests.attachment', ['ticket' => $finance->id]);
        $reply = route('dashboard.admin.student-academic.requests.reply', ['ticket' => $appointment->id]);
        $actor = $this->staff(['manage academic access']);
        $actor->academicFaculties()->attach($entry->level->faculty_id);

        $this->actingAs($actor)->get($queue(['request_category' => 'appointment', 'request_status' => 'open']))
            ->assertInertia(fn (Assert $page) => $page->has('requests.data', 1)->where('requests.data.0.id', $appointment->id)
                ->where('requests.data.0.procedure_label', 'Rendez-vous avec l’apparitorat')
                ->where('requests.data.0.service', 'Apparitorat')->where('requests.data.0.appointment_date', $appointmentDate)
                ->where('requests.data.0.appointment_period', 'morning')->where('requests.data.0.attachment_url', null));
        $this->get($queue(['request_status' => 'resolved']))->assertInertia(fn (Assert $page) => $page->has('requests.data', 1)
            ->where('requests.data.0.id', $finance->id)->where('requests.data.0.attachment_url', $attachment)
            ->where('requests.data.0.attachment_name', 'paiement.pdf')->missing('requests.data.0.request_attachment_path'));
        $this->get($queue(['ticket' => $finance->id]))->assertInertia(fn (Assert $page) => $page->has('requests.data', 1));
        $this->get($attachment)->assertOk()->assertDownload('paiement.pdf')->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->from($queue())->post($reply, ['status' => 'resolved', 'response' => 'Rendez-vous confirmé à 10 h, à l’apparitorat.'])->assertRedirect($queue());
        $this->assertDatabaseHas('student_service_requests', ['id' => $appointment->id, 'status' => 'resolved', 'responded_by' => $actor->id]);

        $outside = $this->staff(['manage academic access']);
        $outside->academicFaculties()->attach(DB::table('faculties')->insertGetId(['name' => 'Faculté externe', 'code' => 'EXT']));
        $this->actingAs($outside)->get($queue())->assertInertia(fn (Assert $page) => $page->has('requests.data', 0));
        $this->get($attachment)->assertForbidden();
        $this->actingAs($this->staff(['manage academic finance']))->get($attachment)->assertForbidden();
        $this->actingAs($student)->get($attachment)->assertForbidden();
    }
}
