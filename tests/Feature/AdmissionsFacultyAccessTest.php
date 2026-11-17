<?php

namespace Tests\Feature;

use App\Models\AcademicStructure\AcademicCycle;
use App\Models\AcademicStructure\AcademicProgram;
use App\Models\AcademicStructure\University;
use App\Models\AcademicYear;
use App\Models\Enrollment;
use App\Models\EnrollmentDocument;
use App\Models\Faculty;
use App\Models\Level;
use App\Models\User;
use App\Notifications\EnrollmentDocumentReplacement;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

final class AdmissionsFacultyAccessTest extends TestCase
{
    use RefreshDatabase;

    private const ADMISSIONS = '/app/dashboard/admin/enrollments';

    private const NOTICES = '/app/dashboard/admin/notifications';

    private User $institutional;

    private User $agentA;

    private User $agentB;

    private User $candidate;

    private AcademicYear $year;

    private AcademicProgram $programA;

    private AcademicProgram $programB;

    private Enrollment $dossierA;

    private Enrollment $dossierB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        Mail::fake();
        Storage::fake('local');

        $this->institutional = User::factory()->create()->assignRole('admin');
        $this->candidate = User::factory()->create()->assignRole('user');
        $university = University::create(['code' => 'TEST', 'context_key' => 'current', 'name' => 'Université de recette']);
        $cycle = AcademicCycle::create(['university_id' => $university->id, 'code' => 'LIC', 'name' => 'Licence', 'normal_duration' => 3,
            'progression_mode' => 'annual', 'weighting_mode' => 'credits', 'periods' => [['code' => 'S1', 'name' => 'Semestre 1']]]);
        $this->year = new AcademicYear(['title' => 'Année de recette', 'start_date' => '2026-10-01', 'end_date' => '2027-09-30', 'status' => 'open']);
        $this->year->forceFill(['university_id' => $university->id])->save();

        [$this->agentA, $this->dossierA, $this->programA] = $this->facultyContext($university, $cycle, 'A');
        [$this->agentB, $this->dossierB, $this->programB] = $this->facultyContext($university, $cycle, 'B');
    }

    public function test_lists_totals_and_direct_details_respect_faculty_scope(): void
    {
        $this->actingAs($this->candidate)->get(self::ADMISSIONS)->assertForbidden();
        $this->actingAs($this->agentA)->get(self::ADMISSIONS)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->has('enrollments.data', 1)->where('enrollments.data.0.id', $this->dossierA->id)
            ->where('stats.total', 1)->has('faculties', 1)->has('levels', 1)->has('programs', 1)->has('agents', 2));
        $this->get(self::ADMISSIONS.'/overview')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('counts.new', 1)->has('priorities', 1)->where('priorities.0.id', $this->dossierA->id));
        $this->get(self::ADMISSIONS.'?faculty_id='.$this->programB->faculty_id)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->has('enrollments.data', 0));
        $this->get(self::ADMISSIONS.'/'.$this->dossierA->id)->assertOk();
        $this->get(self::ADMISSIONS.'/'.$this->dossierB->id)->assertForbidden();

        $this->actingAs($this->agentB)->get(self::ADMISSIONS.'/'.$this->dossierB->id)->assertOk();
        $this->actingAs($this->institutional)->get(self::ADMISSIONS)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->has('enrollments.data', 2)->where('stats.total', 2));
        $this->get(self::ADMISSIONS.'/'.$this->dossierB->id)->assertOk();
    }

    public function test_review_decisions_and_private_documents_require_the_faculty_scope(): void
    {
        $document = $this->document($this->dossierB);
        $foreign = self::ADMISSIONS.'/'.$this->dossierB->id;
        $this->actingAs($this->agentA)->post($foreign.'/start-analysis')->assertForbidden();
        $this->post($foreign.'/documents/'.$document->uuid.'/review', ['verdict' => 'accepted'])->assertForbidden();
        $this->post($foreign.'/request-corrections')->assertForbidden();
        $this->post($foreign.'/reject', ['reason' => 'Motif de décision de recette'])->assertForbidden();
        $this->post($foreign.'/validate')->assertForbidden();
        $this->assertDatabaseHas('enrollments', ['id' => $this->dossierB->id, 'status' => 'submitted']);
        $this->assertDatabaseMissing('enrollment_events', ['enrollment_id' => $this->dossierB->id]);

        foreach (['preview', 'download'] as $action) {
            $this->get(self::ADMISSIONS.'/documents/'.$document->uuid.'/'.$action)->assertForbidden();
            $this->get('/app/dashboard/enrollments/documents/'.$document->uuid.'/'.$action)->assertForbidden();
        }

        $this->actingAs($this->candidate)->get('/app/dashboard/enrollments/documents/'.$document->uuid.'/download')->assertDownload($document->filename);
        $this->actingAs($this->agentB)->get(self::ADMISSIONS.'/documents/'.$document->uuid.'/download')->assertDownload($document->filename);
        $this->post($foreign.'/start-analysis')->assertRedirect();
        $this->post($foreign.'/documents/'.$document->uuid.'/review', ['verdict' => 'accepted'])->assertRedirect();
        $this->post($foreign.'/reject', ['reason' => 'Motif de décision de recette'])->assertRedirect();
        $this->assertDatabaseHas('enrollments', ['id' => $this->dossierB->id, 'status' => 'rejected']);
    }

    public function test_campaign_lists_and_mutations_follow_the_program_faculty(): void
    {
        $url = self::ADMISSIONS.'/campaigns';
        $payload = ['academic_year_id' => $this->year->id, 'level_id' => $this->dossierB->level_id,
            'academic_program_id' => $this->programB->id, 'reason' => 'Campagne pour la recette', 'is_open' => false];
        $this->actingAs($this->agentA)->post($url, $payload)->assertForbidden();
        $this->get($url.'?level_id='.$this->dossierB->level_id)->assertForbidden();
        $this->actingAs($this->agentB)->post($url, $payload)->assertRedirect();
        $this->actingAs($this->agentA)->get($url)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->has('campaigns.data', 0)->has('programs', 1)->where('programs.0.id', $this->programA->id));
        $this->actingAs($this->institutional)->get($url)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->has('campaigns.data', 1)->has('programs', 2));
        $this->post($url, array_replace($payload, ['is_open' => true]))->assertRedirect();
        $this->assertDatabaseHas('admission_campaigns', ['academic_program_id' => $this->programB->id, 'is_open' => true]);
    }

    public function test_notice_delivery_display_and_open_respect_current_faculty_scope(): void
    {
        $document = $this->document($this->dossierA);
        $this->dossierA->update(['status' => 'pending']);
        $document->update(['review_status' => 'correction_requested']);
        $this->actingAs($this->candidate)->post('/app/dashboard/enrollments/documents/'.$document->uuid.'/replace', [
            'file' => UploadedFile::fake()->create('piece-corrigee.pdf', 2, 'application/pdf'),
        ])->assertRedirect()->assertSessionHasNoErrors();
        $this->assertCount(1, $this->agentA->notifications()->get());
        $this->assertCount(1, $this->institutional->notifications()->get());
        $this->assertCount(0, $this->agentB->notifications()->get());

        $notice = $this->agentA->notifications()->firstOrFail();
        $this->actingAs($this->agentA)->get(self::ADMISSIONS)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('adminNotifications.unread_count', 1)->where('adminNotifications.items.0.id', $notice->id));
        $this->post(self::NOTICES.'/'.$notice->id.'/open')->assertStatus(303);

        $this->agentB->notify(new EnrollmentDocumentReplacement($notice->data));
        $legacy = $this->agentB->notifications()->firstOrFail();
        $this->actingAs($this->agentB)->get(self::ADMISSIONS)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('adminNotifications.unread_count', 0)->has('adminNotifications.items', 0));
        $this->post(self::NOTICES.'/'.$legacy->id.'/open')->assertNotFound();
        $this->post(self::NOTICES.'/read-all')->assertRedirect();
        $this->assertNull($legacy->fresh()->read_at);
    }

    private function facultyContext(University $university, AcademicCycle $cycle, string $code): array
    {
        $faculty = new Faculty(['name' => 'Faculté '.$code, 'code' => $code]);
        $faculty->forceFill(['university_id' => $university->id])->save();
        $level = Level::create(['faculty_id' => $faculty->id, 'title' => 'Licence 1', 'code' => 'L1']);
        $agent = User::factory()->create()->assignRole('admin');
        $agent->academicFaculties()->attach($faculty);
        $program = AcademicProgram::create(['faculty_id' => $faculty->id, 'academic_cycle_id' => $cycle->id, 'code' => $code, 'name' => 'Programme '.$code]);
        $program->levels()->attach($level, ['position' => 1]);
        $dossier = Enrollment::create(['student_id' => $this->candidate->id, 'level_id' => $level->id,
            'academic_year_id' => $this->year->id, 'status' => 'submitted', 'form_snapshot' => ['academic_program_id' => $program->id]]);

        return [$agent, $dossier, $program];
    }

    private function document(Enrollment $dossier): EnrollmentDocument
    {
        $path = 'enrollments/'.$dossier->uuid.'/piece.pdf';
        $contents = "%PDF-1.4\nDocument de recette";
        Storage::disk('local')->put($path, $contents);

        return $dossier->documents()->create(['type' => 'document', 'key' => 'piece', 'disk' => 'local', 'path' => $path,
            'filename' => 'piece.pdf', 'mime' => 'application/pdf', 'size_bytes' => strlen($contents), 'sha256' => hash('sha256', $contents)]);
    }
}
