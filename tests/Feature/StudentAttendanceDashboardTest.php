<?php

namespace Tests\Feature;

use App\Models\Classes;
use App\Models\Courses;
use App\Models\Enrollment;
use App\Models\Intake;
use App\Models\Student\AcademicAttendance;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicOffering;
use App\Models\Student\AcademicSession;
use App\Models\Student\AccessRule;
use App\Models\Student\StudentProfile;
use App\Models\User;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class StudentAttendanceDashboardTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    public function test_attendance_summaries_and_history_follow_course_date_and_status_filters(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-06 12:00', 'UTC'));
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $algorithmique = $this->offering($entry, 'Algorithmique');
        $chimie = $this->offering($entry, 'Chimie');
        $url = route('dashboard.student.attendance', ['academic' => $entry->id]);

        $this->actingAs($student)->get($url)->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/student/Attendance')->where('academic.id', $entry->id)
            ->where('summary.recorded', 0)->where('summary.rate', null)
            ->has('courses', 2)->has('breakdown', 2)->has('trend', 0)->has('history.data', 0));

        $novemberSession = $this->makeSession($algorithmique, CarbonImmutable::parse('2026-10-31 23:15', 'UTC'));
        $this->attendance($entry, $novemberSession, 'present', ['source' => 'qr', 'checked_in_at' => $novemberSession->starts_at->addMinutes(2)]);
        $octoberSession = $this->makeSession($algorithmique, CarbonImmutable::parse('2026-10-31 22:00', 'UTC'));
        $this->attendance($entry, $octoberSession, 'late', ['source' => 'nfc', 'checked_in_at' => $octoberSession->starts_at->addMinutes(20)]);
        $excusedSession = $this->makeSession($algorithmique, now()->subDays(3));
        $this->attendance($entry, $excusedSession, 'absent')->justification()->create(['status' => 'accepted', 'reason' => 'Justificatif accepté.']);
        $this->attendance($entry, $this->makeSession($chimie, now()->subDays(2)), 'absent');
        $pending = $this->makeSession($chimie, now()->subDay());
        $ongoing = $this->makeSession($algorithmique, now()->subMinutes(10));
        $this->attendance($entry, $ongoing, 'present', ['source' => 'qr', 'checked_in_at' => now()]);

        $this->get($url)->assertInertia(fn (Assert $page) => $page
            ->where('summary.recorded', 4)->where('summary.present', 1)->where('summary.late', 1)
            ->where('summary.absent', 1)->where('summary.excused', 1)->where('summary.rate', 50)
            ->where('breakdown.0.id', $algorithmique->course_id)->where('breakdown.0.rate', 66.7)
            ->where('breakdown.1.id', $chimie->course_id)->where('breakdown.1.rate', 0)
            ->has('trend', 2)->where('trend.0.month', '2026-10')->where('trend.0.recorded', 1)
            ->where('trend.1.month', '2026-11')->where('trend.1.recorded', 3)
            ->where('history.total', 6)->where('history.data.0.id', $ongoing->id)->where('history.data.0.source', 'qr')
            ->where('history.data.1.id', $pending->id)->where('history.data.1.status', null)
            ->where('history.data.4.checked_in_at', '2026-10-31T23:17:00.000000Z')->where('history.data.5.source', 'nfc'));

        $this->get($url.'&status=excused')->assertInertia(fn (Assert $page) => $page
            ->where('summary.recorded', 4)->where('history.total', 1)->where('history.data.0.id', $excusedSession->id)
            ->where('history.data.0.status', 'excused')->where('history.data.0.source', 'manual'));
        $this->get($url.'&status=pending')->assertInertia(fn (Assert $page) => $page
            ->where('summary.recorded', 4)->where('history.total', 1)->where('history.data.0.id', $pending->id));
        $this->get($url.'&course='.$algorithmique->course_id.'&from=2026-11-01&to=2026-11-01')->assertInertia(fn (Assert $page) => $page
            ->where('summary.recorded', 1)->where('summary.rate', 100)->has('breakdown', 1)
            ->where('history.total', 1)->where('history.data.0.id', $novemberSession->id));
    }

    public function test_attendance_visibility_respects_enrollment_audience_and_schedule_access(): void
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $otherStudent = User::factory()->create();
        $otherProfile = StudentProfile::create(['user_id' => $otherStudent->id, 'student_status' => 'active']);
        $otherApplication = Enrollment::create([
            'student_id' => $otherStudent->id, 'level_id' => $entry->level_id, 'academic_year_id' => $entry->academic_year_id, 'status' => 'validated',
        ]);
        $otherEntry = $entry->replicate()->fill(['student_profile_id' => $otherProfile->id, 'application_id' => $otherApplication->id]);
        $otherEntry->save();
        $group = Classes::forceCreate([
            'faculty_id' => $entry->level->faculty_id, 'level_id' => $entry->level_id,
            'intake_id' => Intake::create(['name' => 'Autre promotion'])->id,
        ]);
        $offering = $this->offering($entry, 'Cours commun');
        $visible = $this->makeSession($offering, now()->subDays(5));
        $this->attendance($otherEntry, $visible, 'absent');
        foreach ([
            $this->makeSession($offering, now()->subDay(), ['cancelled_at' => now()]),
            $this->makeSession($offering, now()->subDays(2), ['is_published' => false]),
            $this->makeSession($offering, now()->addDay()),
            $this->makeSession($this->offering($entry, 'Cours de l’autre groupe', ['class_id' => $group->id]), now()->subDays(3)),
        ] as $excluded) {
            $this->attendance($entry, $excluded, 'absent');
        }

        $url = route('dashboard.student.attendance', ['academic' => $entry->id]);
        $this->actingAs($student)->get($url)->assertInertia(fn (Assert $page) => $page
            ->where('summary.recorded', 0)->has('courses', 1)
            ->where('history.total', 1)->where('history.data.0.id', $visible->id)->where('history.data.0.status', null)
            ->where('history.data.0.source', null));
        $this->get(route('dashboard.student.attendance', ['academic' => $otherEntry->id]))->assertNotFound();

        AccessRule::create(['feature' => 'schedule_view', 'academic_year_id' => $entry->academic_year_id, 'mode' => 'hidden', 'is_active' => true]);
        $this->get($url)->assertForbidden();
    }

    public function test_second_absence_keeps_the_student_projection_and_download_url(): void
    {
        Storage::fake('local');
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $course = $this->offering($entry, 'Droit public');
        $attachments = [];
        foreach ([3, 2] as $days) {
            $attendance = $this->attendance($entry, $this->makeSession($course, now()->subDays($days)), 'absent');
            $path = 'absence-justifications/specimen-'.$days.'.png';
            Storage::disk('local')->put($path, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jHV4AAAAASUVORK5CYII='));
            $attachments[] = $attendance->justification()->create(['status' => 'submitted', 'reason' => 'Pièce de recette', 'path' => $path]);
        }
        $second = $attachments[0];
        $url = route('dashboard.student.absences.file', $second);
        $this->actingAs($student)->get(route('dashboard.student.absences'))->assertInertia(fn (Assert $page) => $page
            ->where('staff', false)->has('records.data', 2)
            ->where('records.data.0.student', null)->where('records.data.1.student', null)
            ->where('records.data.1.case.id', $second->id)->where('records.data.1.case.download_url', $url));
        $this->get($url)->assertOk()->assertDownload();
        $this->actingAs(User::factory()->create()->assignRole('student'))->get($url)->assertNotFound();
    }

    private function offering(AcademicEnrollment $entry, string $title, array $overrides = []): AcademicOffering
    {
        $course = Courses::forceCreate(['level_id' => $entry->level_id, 'title' => $title, 'credits' => 3]);

        return AcademicOffering::create($overrides + [
            'course_id' => $course->id, 'level_id' => $entry->level_id, 'academic_year_id' => $entry->academic_year_id, 'is_published' => true,
        ]);
    }

    private function makeSession(AcademicOffering $offering, CarbonInterface $start, array $overrides = []): AcademicSession
    {
        return AcademicSession::create($overrides + [
            'academic_offering_id' => $offering->id, 'starts_at' => $start, 'ends_at' => $start->copy()->addHour(),
            'room' => 'Salle A', 'is_published' => true,
        ]);
    }

    private function attendance(AcademicEnrollment $entry, AcademicSession $session, string $status, array $metadata = []): AcademicAttendance
    {
        return AcademicAttendance::forceCreate($metadata + [
            'academic_session_id' => $session->id, 'academic_enrollment_id' => $entry->id, 'status' => $status, 'recorded_by' => $entry->profile->user_id,
        ]);
    }
}
