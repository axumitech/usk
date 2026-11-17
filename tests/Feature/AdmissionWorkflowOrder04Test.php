<?php

namespace Tests\Feature;

use App\Models\AcademicStructure\AcademicCycle;
use App\Models\AcademicStructure\AcademicProgram;
use App\Models\AcademicStructure\University;
use App\Models\AcademicYear;
use App\Models\AdmissionCondition;
use App\Models\Enrollment;
use App\Models\Faculty;
use App\Models\Level;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class AdmissionWorkflowOrder04Test extends TestCase
{
    use RefreshDatabase;

    private const CANDIDATE = '/app/dashboard/enrollments';

    private const ADMIN = '/app/dashboard/admin/enrollments';

    private User $candidate;

    private User $agent;

    private Faculty $faculty;

    private Level $level;

    private AcademicYear $year;

    private AcademicProgram $program;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        Mail::fake();
        Storage::fake('temp');
        Storage::fake('local');

        $this->candidate = User::factory()->create()->assignRole('user');
        $this->agent = User::factory()->create()->assignRole('admin');
        $university = University::create(['code' => 'USK-RECETTE', 'context_key' => 'current', 'name' => 'Université de recette']);
        $this->faculty = new Faculty(['code' => 'SC', 'name' => 'Sciences']);
        $this->faculty->forceFill(['university_id' => $university->id])->save();
        $this->agent->academicFaculties()->attach($this->faculty);
        $this->level = Level::create(['faculty_id' => $this->faculty->id, 'code' => 'L1', 'title' => 'Première licence']);
        $this->year = AcademicYear::create(['title' => 'Année de recette', 'status' => 'open', 'start_date' => '2026-10-01', 'end_date' => '2027-09-30']);
        $cycle = AcademicCycle::create(['code' => 'BAC', 'name' => 'Licence', 'university_id' => $university->id,
            'normal_duration' => 3, 'progression_mode' => 'annual', 'weighting_mode' => 'credits', 'periods' => [['code' => 'S1', 'name' => 'Semestre 1']]]);
        $this->program = $this->program('MAT', 'Mathématiques', $cycle->id);
    }

    public function test_programs_sharing_a_level_keep_separate_dossiers_but_do_not_duplicate_the_annual_enrollment(): void
    {
        $other = $this->program('PHY', 'Physique', $this->program->academic_cycle_id);
        $this->actingAs($this->candidate);
        $first = $this->draft($this->program);
        // A legacy draft may store the program identifier as a JSON string.
        $first->update(['form_snapshot' => array_replace($first->form_snapshot, ['academic_program_id' => (string) $this->program->id])]);
        $this->assertSame($first->id, $this->draft($this->program)->id);
        $second = $this->draft($other);
        $this->assertNotSame($first->id, $second->id);

        foreach ([$first, $second] as $application) {
            $this->postJson(self::CANDIDATE.'/'.$application->uuid.'/submit')->assertOk();
        }
        $this->postJson(self::CANDIDATE.'/save-progress', ['last_step' => 1, 'form_snapshot' => $this->snapshot($this->program)])
            ->assertUnprocessable()->assertJsonValidationErrors('uniqueness');
        $this->assertSame('Mathématiques', $first->fresh()->form_snapshot['program']);
        $this->assertSame('Physique', $second->fresh()->form_snapshot['program']);

        $this->actingAs($this->agent)->post(self::ADMIN.'/'.$first->id.'/validate', ['reason' => 'Dossier conforme au programme.'])
            ->assertRedirect()->assertSessionHasNoErrors();
        $this->post(self::ADMIN.'/'.$second->id.'/validate')->assertSessionHasErrors('decision');
        $this->assertDatabaseCount('academic_enrollments', 1);
        $this->assertNull($first->fresh()->enrolled_at);
        $this->assertSame('submitted', $second->fresh()->status->value);

        $this->actingAs($this->candidate->fresh())->get(self::CANDIDATE.'/'.$first->uuid)->assertInertia(fn (Assert $page) => $page
            ->where('enrollment.status', 'validated')->where('enrollment.academic_enrollment_status', 'pending_confirmation')
            ->where('enrollment.admission_reason', 'Dossier conforme au programme.')->has('enrollment.admitted_at'));
    }

    public function test_mismatched_faculty_or_program_cannot_be_saved(): void
    {
        $otherFaculty = Faculty::create(['code' => 'DR', 'name' => 'Droit']);
        $otherProgram = AcademicProgram::create(['code' => 'SEUL', 'name' => 'Programme sans ce niveau', 'faculty_id' => $this->faculty->id,
            'academic_cycle_id' => $this->program->academic_cycle_id]);
        $this->actingAs($this->candidate)->postJson(self::CANDIDATE.'/save-progress', [
            'last_step' => 1, 'form_snapshot' => array_replace($this->snapshot($this->program), ['faculty_id' => $otherFaculty->id]),
        ])->assertUnprocessable()->assertJsonValidationErrors('form_snapshot.level_id');
        $this->postJson(self::CANDIDATE.'/save-progress', ['last_step' => 1, 'form_snapshot' => $this->snapshot($otherProgram)])
            ->assertUnprocessable()->assertJsonValidationErrors('form_snapshot.academic_program_id');
        $this->assertDatabaseCount('enrollments', 0);
    }

    public function test_required_piece_can_be_corrected_and_reexamined_before_motivated_refusal(): void
    {
        AdmissionCondition::create(['faculty_id' => $this->faculty->id, 'level_id' => $this->level->id, 'title' => 'Diplôme',
            'section' => 'academic_info', 'is_required' => true]);
        $this->actingAs($this->candidate);
        $entry = $this->draft($this->program);
        $url = self::CANDIDATE.'/'.$entry->uuid;
        $this->postJson($url.'/submit')->assertUnprocessable();
        $piece = $this->postJson(self::CANDIDATE.'/documents/upload', ['key' => 'diplome', 'file' => UploadedFile::fake()->create('diplome.pdf', 10, 'application/pdf')])
            ->assertOk()->json('temp');
        $snapshot = $this->snapshot($this->program);
        $snapshot['documents'] = ['diplome' => ['filename' => $piece['filename'], 'mime' => $piece['mime'], 'temp' => $piece]];
        $this->postJson(self::CANDIDATE.'/save-progress', ['uuid' => $entry->uuid, 'last_step' => 4, 'form_snapshot' => $snapshot])->assertOk();
        $this->postJson($url.'/submit')->assertOk();
        $document = $entry->documents()->sole();
        $dossier = self::ADMIN.'/'.$entry->id;
        $review = $dossier.'/documents/'.$document->uuid.'/review';

        $this->actingAs($this->agent)->post($dossier.'/start-analysis')->assertSessionHasNoErrors();
        $this->post($review, ['verdict' => 'correction_requested', 'reason' => 'Pièce illisible.'])->assertSessionHasNoErrors();
        $this->post($dossier.'/request-corrections')->assertSessionHasNoErrors();
        $this->post($dossier.'/validate')->assertSessionHasErrors('decision');
        $this->actingAs($this->candidate)->get($url)->assertInertia(fn (Assert $page) => $page
            ->where('enrollment.status', 'pending')->where('enrollment.documents.0.can_replace', true));
        $this->post(self::CANDIDATE.'/documents/'.$document->uuid.'/replace', [
            'file' => UploadedFile::fake()->create('diplome-lisible.pdf', 10, 'application/pdf'),
        ])->assertSessionHasNoErrors();
        Storage::disk('local')->assertExists($document->path);
        $this->assertSame(2, $document->fresh()->version);

        $this->actingAs($this->agent)->get($dossier)->assertInertia(fn (Assert $page) => $page->where('enrollment.documents.0.needs_reexamination', true));
        $this->post($review, ['verdict' => 'accepted'])->assertSessionHasNoErrors();
        $this->post($dossier.'/reject')->assertSessionHasErrors('reason');
        $reason = 'Le niveau demandé ne correspond pas au parcours attesté.';
        $this->post($dossier.'/reject', ['reason' => $reason])->assertSessionHasNoErrors();
        $this->assertDatabaseCount('academic_enrollments', 0);
        $this->actingAs($this->candidate)->get($url)->assertInertia(fn (Assert $page) => $page
            ->where('enrollment.status', 'rejected')->where('enrollment.rejection_reason', $reason)->where('enrollment.academic_portal_url', null));
        $this->post($url.'/withdraw')->assertSessionHasErrors('withdrawal');
        $this->postJson(self::CANDIDATE.'/save-progress', ['last_step' => 1, 'form_snapshot' => $this->snapshot($this->program)])
            ->assertUnprocessable()->assertJsonValidationErrors('uniqueness');
    }

    private function program(string $code, string $name, int $cycleId): AcademicProgram
    {
        $program = AcademicProgram::create(['code' => $code, 'name' => $name, 'faculty_id' => $this->faculty->id, 'academic_cycle_id' => $cycleId]);
        $program->levels()->attach($this->level, ['position' => 1]);

        return $program;
    }

    private function snapshot(AcademicProgram $program): array
    {
        return ['faculty_id' => $this->faculty->id, 'level_id' => $this->level->id, 'year_id' => $this->year->id, 'academic_program_id' => $program->id,
            'name' => 'Candidat de recette', 'email' => $this->candidate->email, 'isConfirmed' => true, 'documents' => []];
    }

    private function draft(AcademicProgram $program): Enrollment
    {
        $uuid = $this->postJson(self::CANDIDATE.'/save-progress', ['last_step' => 4, 'form_snapshot' => $this->snapshot($program)])
            ->assertOk()->json('draft.uuid');

        return Enrollment::where('uuid', $uuid)->sole();
    }
}
