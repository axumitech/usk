<?php

namespace Tests\Feature;

use App\Models\Courses;
use App\Models\Professor;
use App\Models\Student\AbsenceJustification;
use App\Models\Student\AcademicAttendance;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicOffering;
use App\Models\Student\AcademicResource;
use App\Models\Student\AcademicRoom;
use App\Models\Student\AcademicSession;
use App\Models\Student\AccessRule;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class StudentCourseScheduleTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    public function test_course_details_keep_the_selected_session_in_its_academic_context(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-09 12:00', 'Africa/Kinshasa')->utc());
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $offering = $this->offering($entry, 'Algorithmique');
        $professor = Professor::create(['first_name' => 'Aline', 'last_name' => 'Kiala', 'email' => 'kiala@example.test']);
        $offering->update(['professor_id' => $professor->id]);
        $room = AcademicRoom::create(['code' => 'A', 'name' => 'Salle A', 'building' => 'Bâtiment B', 'campus' => 'Principal', 'capacity' => 40, 'type' => 'classe']);
        $selected = $this->makeSession($offering, CarbonImmutable::parse('2026-11-02 00:30', 'Africa/Kinshasa')->utc(), [
            'activity_type' => 'TD', 'academic_room_id' => $room->id,
        ]);
        $next = $this->makeSession($offering, now()->addDay());
        $unpublished = $this->makeSession($offering, now()->addDays(2), ['is_published' => false]);
        $unrelated = $this->makeSession($this->offering($entry, 'Droit'), now()->subDays(2));
        $material = AcademicResource::create([
            'academic_offering_id' => $offering->id, 'academic_session_id' => $selected->id, 'kind' => 'video', 'title' => 'Vidéo de la séance',
            'url' => 'https://example.test/video', 'is_published' => true,
        ]);
        AcademicResource::create([
            'academic_offering_id' => $offering->id, 'kind' => 'video', 'title' => 'Vidéo générale',
            'url' => 'https://example.test/general', 'is_published' => true,
        ]);

        $course = ['course' => $offering->course_id, 'academic' => $entry->id];
        $focus = $course + ['focus_session' => $selected->id, 'from' => 'schedule', 'return_week' => '2026-11-02', 'return_day' => '2026-11-02'];
        $details = route('dashboard.student.courses.show', $focus);
        $this->actingAs($student)->get($details)->assertInertia(fn (Assert $page) => $page->component('dashboard/student/Course')
            ->where('course.title', 'Algorithmique')->where('week', '2026-11-02')
            ->where('focused_session.id', $selected->id)->where('focused_session.room', 'Salle A')->where('focused_session.location', 'Bâtiment B · Salle A')
            ->where('focused_session.teacher', 'Aline Kiala')->where('focused_session.activity_type', 'TD')
            ->where('focused_session.has_resources', true)->where('resource_filters.session', null));
        $this->get(route('dashboard.student.courses.show', $course))->assertInertia(fn (Assert $page) => $page->where('focused_session.id', $next->id));
        $this->get(route('dashboard.student.courses.show', $focus + ['section' => 'supports']))->assertInertia(fn (Assert $page) => $page->has('resources', 2));
        $this->get(route('dashboard.student.courses.show', $focus + ['section' => 'supports', 'session' => $selected->id]))->assertInertia(fn (Assert $page) => $page
            ->has('resources', 1)->where('resources.0.id', $material->id)->where('focused_session.id', $selected->id));
        foreach ([$unpublished, $unrelated] as $hidden) {
            $this->get(route('dashboard.student.courses.show', $course + ['focus_session' => $hidden->id]))->assertNotFound();
        }

        $offering->update(['archived_at' => now()]);
        $this->get($details)->assertOk();
        $this->get(route('dashboard.student.courses.show', $focus + ['section' => 'supports']))->assertInertia(fn (Assert $page) => $page->has('resources', 0));
        AccessRule::create(['feature' => 'schedule_view', 'academic_year_id' => $entry->academic_year_id, 'mode' => 'hidden', 'is_active' => true]);
        $this->get($details)->assertNotFound();
    }

    public function test_course_sessions_show_presence_rate_from_finished_recorded_sessions(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-04 12:00', 'Africa/Kinshasa')->utc());
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $offering = $this->offering($entry, 'Algorithmique');
        $url = route('dashboard.student.courses.show', ['course' => $offering->course_id, 'academic' => $entry->id, 'section' => 'sessions']);
        $this->actingAs($student)->get($url)->assertInertia(fn (Assert $page) => $page
            ->where('attendance_summary.recorded', 0)->where('attendance_summary.rate', null));

        foreach (['present', 'late', 'absent'] as $index => $status) {
            $session = $this->makeSession($offering, now()->subHours(9 - 2 * $index));
            $attendance = AcademicAttendance::create([
                'academic_session_id' => $session->id, 'academic_enrollment_id' => $entry->id, 'status' => $status, 'recorded_by' => $student->id,
            ]);
            if ($status === 'absent') {
                $attendance->justification()->save(new AbsenceJustification(['status' => 'accepted', 'reason' => 'Justificatif accepté.']));
            }
        }
        $this->makeSession($offering, now()->subHours(3));
        $excluded = [
            $this->makeSession($offering, now()->subDay(), ['cancelled_at' => now()]),
            $this->makeSession($offering, now()->subDays(2), ['is_published' => false]),
            $this->makeSession($offering, now()->addDay()),
            $this->makeSession($this->offering($entry, 'Droit'), now()->subDays(3)),
        ];
        foreach ($excluded as $session) {
            AcademicAttendance::create([
                'academic_session_id' => $session->id, 'academic_enrollment_id' => $entry->id, 'status' => 'absent', 'recorded_by' => $student->id,
            ]);
        }

        $this->get($url)->assertInertia(fn (Assert $page) => $page
            ->where('attendance_summary.recorded', 3)->where('attendance_summary.attended', 2)
            ->where('attendance_summary.excused', 1)->where('attendance_summary.rate', 66.7));
    }

    private function offering(AcademicEnrollment $entry, string $title): AcademicOffering
    {
        $course = Courses::forceCreate(['level_id' => $entry->level_id, 'title' => $title, 'credits' => 3]);

        return AcademicOffering::create([
            'course_id' => $course->id, 'level_id' => $entry->level_id, 'academic_year_id' => $entry->academic_year_id, 'is_published' => true,
        ]);
    }

    private function makeSession(AcademicOffering $offering, CarbonInterface $start, array $overrides = []): AcademicSession
    {
        return AcademicSession::create($overrides + [
            'academic_offering_id' => $offering->id, 'starts_at' => $start, 'ends_at' => $start->copy()->addHour(), 'room' => 'Salle A', 'is_published' => true,
        ]);
    }
}
