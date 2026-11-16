<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Courses;
use App\Models\Enrollment;
use App\Models\Faculty;
use App\Models\Level;
use App\Models\Student\AcademicOffering;
use App\Models\Student\AcademicResource;
use App\Models\Student\AcademicSession;
use App\Models\Student\StudentProfile;
use App\Models\User;
use Carbon\Carbon;
use Database\Seeders\CompleteAcademicYearSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CompleteAcademicYearSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_complete_year_is_consistent_preserves_existing_data_and_is_repeatable(): void
    {
        $this->travelTo(Carbon::parse('2026-11-02 12:00', 'Africa/Kinshasa'));
        Storage::fake('local');
        Mail::fake();
        Notification::fake();
        config(['academic_demo.password' => 'DemoTest-2026!', 'academic_demo.year' => '2026-2027']);
        $faculty = Faculty::create(['code' => 'INFO', 'name' => 'Faculté indépendante']);
        $level = Level::create(['faculty_id' => $faculty->id, 'code' => 'M1', 'title' => 'Master personnalisé']);
        $custom = (new Courses)->forceFill(['level_id' => $level->id, 'title' => 'Cours existant', 'code' => 'EXISTANT', 'credits' => 3]);
        $custom->save();
        $this->seed(CompleteAcademicYearSeeder::class);
        $year = AcademicYear::where('title', '2026-2027')->firstOrFail();
        $this->assertSame('open', $year->status);
        $this->assertDatabaseCount('academic_semesters', 2);
        $this->assertDatabaseCount('courses', 181);
        $this->assertDatabaseCount('professors', 20);
        $this->assertDatabaseCount('academic_offerings', 180);
        $this->assertSame(0, User::role('student')->count());
        foreach (['enrollments', 'student_profiles', 'academic_enrollments', 'student_obligations', 'student_payments', 'academic_attendances', 'academic_submissions'] as $table) {
            $this->assertDatabaseEmpty($table);
        }
        $this->assertSame(180, AcademicResource::where('kind', 'material')->count());
        $this->assertSame(180, AcademicResource::where('kind', 'assignment')->count());
        $this->assertSame(180, AcademicResource::where('kind', 'evaluation')->count());
        $this->assertSame(0, AcademicResource::where('kind', 'result')->count());
        $hours = [];
        $active = [];
        foreach (AcademicSession::with('offering.course')->orderBy('starts_at')->get() as $session) {
            $from = $session->starts_at->getTimestamp();
            $to = $session->ends_at->getTimestamp();
            $hours[$session->academic_offering_id] = ($hours[$session->academic_offering_id] ?? 0) + ($to - $from) / 3600;
            $active = array_filter($active, fn ($item) => $item->ends_at->getTimestamp() > $from);
            foreach ($active as $other) {
                $this->assertNotSame($other->room, $session->room, 'Double réservation de salle');
                $this->assertNotSame($other->offering->professor_id, $session->offering->professor_id, 'Double réservation d’enseignant');
                $this->assertNotSame($other->offering->level_id, $session->offering->level_id, 'Chevauchement de promotion');
            }
            $active[] = $session;
            $this->assertGreaterThanOrEqual($year->start_date, $session->starts_at->setTimezone('Africa/Kinshasa')->toDateString());
            $this->assertLessThanOrEqual($year->end_date, $session->ends_at->setTimezone('Africa/Kinshasa')->toDateString());
        }
        foreach (AcademicOffering::with('course')->get() as $offering) {
            $this->assertEquals($offering->course->cmi_hours + $offering->course->td_hours + $offering->course->tp_hours, $hours[$offering->id]);
        }
        foreach (Level::where('id', '!=', $level->id)->with('detail')->get() as $promotion) {
            $this->assertLessThanOrEqual($promotion->detail->credit_required, Courses::where('level_id', $promotion->id)->sum('credits'));
        }
        foreach (AcademicResource::whereNotNull('path')->get() as $resource) {
            Storage::disk('local')->assertExists($resource->path);
        }
        $student = User::factory()->create(['email' => 'demo.student.med.l1.1@usk.example.test', 'first_name' => 'Nom modifié']);
        $student->assignRole('student');
        $profile = StudentProfile::create(['user_id' => $student->id, 'matricule' => 'MED-DEMO-1']);
        $demoLevel = Level::where('code', 'L1')->whereBelongsTo(Faculty::where('code', 'MED')->firstOrFail())->firstOrFail();
        $application = Enrollment::create([
            'student_id' => $student->id, 'level_id' => $demoLevel->id, 'academic_year_id' => $year->id,
            'status' => 'validated', 'notes' => 'Dossier existant', 'meta' => ['demo' => true],
        ]);
        $entry = $profile->enrollments()->create([
            'application_id' => $application->id, 'level_id' => $demoLevel->id, 'academic_year_id' => $year->id,
            'matricule' => $profile->matricule, 'enrollment_status' => 'confirmed',
        ]);
        $tables = ['academic_years', 'levels', 'courses', 'professors', 'academic_offerings', 'academic_sessions', 'users', 'enrollments', 'academic_enrollments', 'student_profiles', 'student_obligations', 'student_payments', 'academic_resources', 'academic_attendances', 'academic_submissions', 'academic_audits'];
        $counts = [];
        foreach ($tables as $table) {
            $counts[$table] = DB::table($table)->count();
        }
        $this->seed(CompleteAcademicYearSeeder::class);
        foreach ($counts as $table => $count) {
            $this->assertSame($count, DB::table($table)->count(), $table);
        }
        $this->assertSame('Nom modifié', $student->fresh()->first_name);
        $this->assertSame('Dossier existant', $application->fresh()->notes);
        $this->assertDatabaseHas('academic_enrollments', ['id' => $entry->id, 'student_profile_id' => $profile->id, 'enrollment_status' => 'confirmed']);
        $this->assertSame('Cours existant', $custom->fresh()->title);
        $this->assertFalse(Level::where('id', '!=', $level->id)->where('is_active', true)->exists());
        Mail::assertNothingSent();
        Notification::assertNothingSent();
    }
}
