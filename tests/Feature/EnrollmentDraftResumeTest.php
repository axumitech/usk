<?php

namespace Tests\Feature;

use App\Models\AcademicStructure\AcademicCycle;
use App\Models\AcademicStructure\AcademicProgram;
use App\Models\AcademicStructure\AdmissionCampaign;
use App\Models\AcademicStructure\University;
use App\Models\AcademicYear;
use App\Models\AdmissionCondition;
use App\Models\Enrollment;
use App\Models\Faculty;
use App\Models\Level;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class EnrollmentDraftResumeTest extends TestCase
{
    use RefreshDatabase;

    private const SAVE = '/app/dashboard/enrollments/save-progress';

    private function context(): array
    {
        $candidate = User::factory()->create();
        $faculty = Faculty::create(['name' => 'Sciences', 'code' => 'SCI']);
        $level = Level::create(['faculty_id' => $faculty->id, 'code' => 'L1', 'title' => 'Licence 1']);
        $year = AcademicYear::create(['title' => 'Année de candidature', 'start_date' => '2026-10-01', 'end_date' => '2027-09-30', 'status' => 'open']);

        return [$candidate, $faculty, $level, $year];
    }

    private function program(Faculty $faculty, Level $level): AcademicProgram
    {
        $university = University::create(['context_key' => 'current', 'code' => 'USK', 'name' => 'Université de test']);
        $faculty->update(['university_id' => $university->id]);
        $cycle = AcademicCycle::create(['university_id' => $university->id, 'code' => 'C1', 'name' => 'Licence', 'normal_duration' => 3,
            'progression_mode' => 'annual', 'weighting_mode' => 'credits', 'periods' => [['code' => 'A', 'name' => 'Année']]]);
        $program = AcademicProgram::create(['faculty_id' => $faculty->id, 'academic_cycle_id' => $cycle->id, 'code' => 'SC', 'name' => 'Sciences']);
        $program->levels()->attach($level->id, ['position' => 1]);

        return $program;
    }

    public function test_partial_year_and_program_can_be_saved_before_selecting_a_level(): void
    {
        [$candidate, $faculty, $level, $year] = $this->context();
        $program = $this->program($faculty, $level);
        $uuid = $this->actingAs($candidate)->postJson(self::SAVE, ['last_step' => 1,
            'form_snapshot' => ['year_id' => $year->id, 'name' => '', 'email' => '', 'program' => ''],
        ])->assertOk()->assertJsonPath('draft.form_snapshot.program', null)->json('draft.uuid');

        $this->postJson(self::SAVE, ['uuid' => $uuid, 'last_step' => 1, 'form_snapshot' => [
            'faculty_id' => $faculty->id, 'academic_program_id' => $program->id, 'level_id' => null,
        ]])->assertOk()->assertJsonPath('draft.uuid', $uuid)->assertJsonPath('draft.form_snapshot.academic_program_id', $program->id);
        $this->assertNull(Enrollment::sole()->level_id);
        $this->assertDatabaseCount('enrollments', 1);

        $other = Faculty::create(['name' => 'Autre faculté', 'code' => 'AUT']);
        $this->postJson(self::SAVE, ['uuid' => $uuid, 'last_step' => 1, 'form_snapshot' => [
            'faculty_id' => $other->id, 'academic_program_id' => $program->id, 'level_id' => null,
        ]])->assertUnprocessable()->assertJsonValidationErrors('form_snapshot.academic_program_id');
    }

    public function test_explicit_context_clearing_does_not_restore_old_ids_or_remove_other_fields(): void
    {
        [$candidate, $faculty, $level, $year] = $this->context();
        $snapshot = ['year_id' => $year->id, 'faculty_id' => $faculty->id, 'level_id' => $level->id, 'name' => 'Nom conservé', 'email' => $candidate->email, 'program' => 'Sciences'];
        $uuid = $this->actingAs($candidate)->postJson(self::SAVE, ['last_step' => 2, 'form_snapshot' => $snapshot])->assertOk()->json('draft.uuid');
        $response = $this->postJson(self::SAVE, ['uuid' => $uuid, 'last_step' => 1, 'form_snapshot' => ['level_id' => null, 'year_id' => null]])->assertOk();
        $response->assertJsonPath('draft.form_snapshot.name', 'Nom conservé')->assertJsonPath('draft.form_snapshot.email', $candidate->email);
        $this->assertNull(Enrollment::sole()->level_id);
        $this->assertNull(Enrollment::sole()->academic_year_id);
    }

    public function test_partial_retries_reuse_the_uuid_without_overwriting_another_faculty(): void
    {
        [$candidate, $faculty, $level, $year] = $this->context();
        $payload = ['last_step' => 1, 'form_snapshot' => ['year_id' => $year->id, 'faculty_id' => (string) $faculty->id, 'name' => 'Premier brouillon']];
        $uuid = $this->actingAs($candidate)->postJson(self::SAVE, $payload)->assertOk()->json('draft.uuid');
        $payload['form_snapshot']['faculty_id'] = $faculty->id;
        $this->postJson(self::SAVE, $payload)->assertOk()->assertJsonPath('draft.uuid', $uuid);
        $other = Faculty::create(['name' => 'Autre faculté', 'code' => 'AUT']);
        $payload['form_snapshot']['faculty_id'] = $other->id;
        $payload['form_snapshot']['name'] = 'Autre choix';
        $otherUuid = $this->postJson(self::SAVE, $payload)->assertOk()->json('draft.uuid');
        $this->assertNotSame($uuid, $otherUuid);
        $this->assertSame('Premier brouillon', Enrollment::where('uuid', $uuid)->sole()->form_snapshot['name']);
        $this->assertDatabaseCount('enrollments', 2);
    }

    public function test_save_logout_resume_continue_and_submit_preserves_one_dossier_and_its_documents(): void
    {
        Mail::fake();
        Storage::fake('temp');
        Storage::fake('local');
        [$candidate, $faculty, $level, $year] = $this->context();
        $temp = $this->actingAs($candidate)->postJson('/app/dashboard/enrollments/documents/upload', [
            'key' => 'diploma', 'file' => UploadedFile::fake()->create('diplome.pdf', 10, 'application/pdf'),
        ])->assertOk()->json('temp');
        $snapshot = ['year_id' => $year->id, 'faculty_id' => $faculty->id, 'level_id' => $level->id,
            'name' => 'Nom conservé', 'email' => $candidate->email, 'program' => '',
            'documents' => ['diploma' => ['temp' => $temp, 'filename' => $temp['filename'], 'mime' => $temp['mime']]]];
        $saved = $this->postJson(self::SAVE, ['last_step' => 2, 'form_snapshot' => $snapshot])->assertOk()->assertJsonPath('draft.form_snapshot.program', null);
        $uuid = $saved->json('draft.uuid');
        $documentId = $saved->json('draft.form_snapshot.documents.diploma.uuid');
        $document = Enrollment::sole()->documents()->sole();
        AdmissionCondition::create(['faculty_id' => $faculty->id, 'level_id' => $level->id, 'title' => 'Attestation actualisée',
            'section' => 'academic_info', 'is_required' => true]);
        $this->post(route('logout'))->assertRedirect();
        $this->assertGuest();
        $this->get('/app/dashboard/enrollments/'.$uuid.'/edit')->assertRedirect();
        $this->post(route('login'), ['email' => $candidate->email, 'password' => 'password'])->assertRedirect();
        $this->assertAuthenticatedAs($candidate);
        $this->get('/app/dashboard/enrollments/'.$uuid.'/edit')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('draft.uuid', $uuid)->where('draft.last_step', 2)
            ->where('draft.form_snapshot.program', null)->where('draft.form_snapshot.year_id', $year->id)
            ->where('draft.form_snapshot.documents.diploma.uuid', $documentId));
        $this->getJson('/app/dashboard/enrollment/requirements?'.http_build_query([
            'faculty_id' => $faculty->id, 'level_id' => $level->id, 'year_id' => $year->id,
        ]))->assertOk()->assertJsonPath('payload.academic_info.0.key', 'attestation_actualisee');

        // A partial update omits documents; previously saved files must remain attached.
        $this->postJson(self::SAVE, ['uuid' => $uuid, 'last_step' => 3, 'form_snapshot' => ['program' => 'Sciences']])
            ->assertOk()->assertJsonPath('draft.form_snapshot.documents.diploma.uuid', $documentId);
        $this->postJson(self::SAVE, ['uuid' => $uuid, 'last_step' => 4, 'form_snapshot' => ['isConfirmed' => true]])->assertOk();
        $this->postJson('/app/dashboard/enrollments/'.$uuid.'/submit')->assertUnprocessable()
            ->assertJsonPath('message', 'Une pièce obligatoire est manquante : Attestation actualisée.');
        $newTemp = $this->postJson('/app/dashboard/enrollments/documents/upload', [
            'key' => 'attestation_actualisee', 'file' => UploadedFile::fake()->create('attestation.pdf', 10, 'application/pdf'),
        ])->assertOk()->json('temp');
        $documents = $saved->json('draft.form_snapshot.documents');
        $documents['attestation_actualisee'] = ['temp' => $newTemp, 'filename' => $newTemp['filename'], 'mime' => $newTemp['mime']];
        $this->postJson(self::SAVE, ['uuid' => $uuid, 'last_step' => 4, 'form_snapshot' => ['documents' => $documents]])->assertOk();
        $this->postJson('/app/dashboard/enrollments/'.$uuid.'/submit')->assertOk()->assertJsonPath('redirect', '/app/dashboard/enrollments');
        $this->assertDatabaseCount('enrollments', 1);
        $this->assertSame(1, Enrollment::sole()->events()->where('event', 'submitted')->count());
        $this->assertSame($documentId, Enrollment::sole()->documents()->where('key', 'diploma')->sole()->uuid);
        $this->assertSame(2, Enrollment::sole()->documents()->count());
        Storage::disk('local')->assertExists($document->path);
        $this->postJson(self::SAVE, ['uuid' => $uuid, 'last_step' => 2, 'form_snapshot' => ['name' => 'Changement interdit']])
            ->assertUnprocessable()->assertJsonValidationErrors('uuid');
        $this->assertSame('Nom conservé', Enrollment::sole()->form_snapshot['name']);
    }

    public function test_choices_filter_campaigns_by_year_and_keep_the_existing_no_campaign_fallback(): void
    {
        [$candidate, $faculty, $level, $year] = $this->context();
        $program = $this->program($faculty, $level);
        $nextYear = AcademicYear::create(['title' => 'Année suivante', 'start_date' => '2027-10-01', 'end_date' => '2028-09-30', 'status' => 'open']);
        $campaign = AdmissionCampaign::create(['academic_program_id' => $program->id, 'academic_year_id' => $year->id, 'level_id' => $level->id, 'is_open' => false]);
        $this->actingAs($candidate)->get('/app/dashboard/enrollments/create')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->has('years', 1)->where('years.0.id', $nextYear->id)->has('admissionContexts', 1)
            ->where('admissionContexts.0.year_id', $nextYear->id)->where('admissionContexts.0.academic_program_id', $program->id));

        foreach ([['is_open' => true, 'opens_on' => today('Africa/Kinshasa')->addDay()->toDateString(), 'closes_on' => null],
            ['is_open' => true, 'opens_on' => null, 'closes_on' => today('Africa/Kinshasa')->subDay()->toDateString()]] as $window) {
            $campaign->update($window);
            $this->get('/app/dashboard/enrollments/create')->assertInertia(fn (Assert $page) => $page->has('admissionContexts', 1)->where('years.0.id', $nextYear->id));
        }
        $campaign->update(['is_open' => true, 'opens_on' => null, 'closes_on' => null]);
        $this->get('/app/dashboard/enrollments/create')->assertInertia(fn (Assert $page) => $page->has('years', 2)->has('admissionContexts', 2));
    }

    public function test_resume_explains_a_closed_context_without_replacing_the_saved_year(): void
    {
        [$candidate, $faculty, $level, $year] = $this->context();
        $uuid = $this->actingAs($candidate)->postJson(self::SAVE, ['last_step' => 3, 'form_snapshot' => [
            'year_id' => $year->id, 'faculty_id' => $faculty->id, 'level_id' => $level->id, 'name' => 'Nom conservé', 'program' => 'Sciences',
        ]])->assertOk()->json('draft.uuid');
        $year->update(['status' => 'closed']);
        $this->get('/app/dashboard/enrollments/'.$uuid.'/edit')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->has('years', 0)->has('admissionContexts', 0)->where('draft.last_step', 3)
            ->where('draft.form_snapshot.year_id', $year->id)->where('draft.context.year', $year->title)
            ->where('draft.context.unavailable_reason', 'Cette année académique ne reçoit plus de candidatures.'));
        $this->postJson(self::SAVE, ['uuid' => $uuid, 'last_step' => 3, 'form_snapshot' => ['email' => $candidate->email]])->assertOk();
        $this->assertDatabaseCount('enrollments', 1);
    }

    public function test_nullable_level_migration_preserves_drafts_and_the_foreign_key_on_rollback(): void
    {
        [$candidate, $faculty, $level, $year] = $this->context();
        $uuid = $this->actingAs($candidate)->postJson(self::SAVE, ['last_step' => 1, 'form_snapshot' => ['year_id' => $year->id]])->assertOk()->json('draft.uuid');
        $migration = require database_path('migrations/2026_11_18_090000_allow_enrollment_drafts_without_a_level.php');
        try {
            $migration->down();
            $this->fail('A restrictive rollback must refuse to discard incomplete drafts.');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString('Aucune donnée n’a été supprimée', $exception->getMessage());
        }
        $this->assertSame($uuid, Enrollment::sole()->uuid);
        $this->postJson(self::SAVE, ['uuid' => $uuid, 'last_step' => 1, 'form_snapshot' => ['faculty_id' => $faculty->id, 'level_id' => $level->id]])->assertOk();
        $migration->down();
        $migration->up();
        $this->postJson(self::SAVE, ['uuid' => $uuid, 'last_step' => 1, 'form_snapshot' => ['level_id' => null]])->assertOk();
        $this->assertNull(Enrollment::sole()->level_id);
        $this->expectException(QueryException::class);
        Enrollment::where('uuid', $uuid)->update(['level_id' => 999999]);
    }
}
