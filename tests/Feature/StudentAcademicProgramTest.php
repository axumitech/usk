<?php

namespace Tests\Feature;

use App\Models\AcademicCalendarEvent;
use App\Models\AcademicYear;
use App\Models\Enrollment;
use App\Models\Student\AcademicSemester;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class StudentAcademicProgramTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    public function test_program_uses_the_enrollment_year_and_opening_a_shared_event_keeps_that_year(): void
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $previous = AcademicYear::create(['title' => '2025–2026', 'start_date' => '2025-10-01', 'end_date' => '2026-09-30', 'status' => 'closed']);
        $application = Enrollment::create(['student_id' => $student->id, 'level_id' => $entry->level_id, 'academic_year_id' => $previous->id, 'status' => 'validated']);
        $older = $student->studentProfile->enrollments()->create([
            'application_id' => $application->id, 'academic_year_id' => $previous->id, 'level_id' => $entry->level_id,
            'enrollment_status' => 'completed', 'currency' => 'USD',
        ]);
        $olderEvent = $this->event($previous->id, 'Rattrapages de l’année passée', 'resit', '2026-06-10', '2026-06-12');
        $outsideYear = AcademicYear::create(['title' => '2027–2028', 'start_date' => '2027-10-01', 'end_date' => '2028-09-30', 'status' => 'draft']);
        $unrelated = $this->event($outsideYear->id, 'Congé de l’année future', 'holiday', '2027-12-20', '2027-12-25');
        $opening = $this->event($entry->academic_year_id, 'Début des cours', 'courses', '2026-10-01', '2026-10-01');
        $semester = AcademicSemester::create(['academic_year_id' => $entry->academic_year_id, 'number' => 1, 'start_date' => '2026-10-02', 'end_date' => '2027-02-20']);
        $exam = $this->event($entry->academic_year_id, 'Examens du semestre 1', 'exam', '2027-02-21', '2027-02-26');
        $holiday = $this->event($entry->academic_year_id, 'Vacances académiques', 'holiday', '2027-02-28', '2027-03-08');
        $olderEvent->update(['location' => 'Bâtiment A', 'description' => 'Session de rattrapages.', 'instructions' => 'Présenter sa carte étudiante.']);

        $this->actingAs($student)->get(route('dashboard.student.program', ['academic' => $entry->id]))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('dashboard/student/Program')
                ->where('program.academic_id', $entry->id)->where('program.year', $entry->academicYear->title)
                ->has('program.events', 4)->where('program.events.0.id', $opening->id)
                ->where('program.events.1.id', 'semestre-'.$semester->id)->where('program.events.1.category', 'semester')
                ->where('program.events.1.start_date', '2026-10-02')->where('program.events.2.id', $exam->id)
                ->where('program.events.3.id', $holiday->id)->where('program.event', null));
        $this->get(route('dashboard.student.program.event', ['event' => $olderEvent->id, 'academic' => $entry->id]))->assertNotFound();
        $this->get(route('dashboard.student.program.event', ['event' => $unrelated->id]))->assertNotFound();
        $this->get(route('dashboard.student.program.event', ['event' => $olderEvent->id]))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('dashboard/student/Program')
                ->where('program.academic_id', $older->id)->where('program.event.title', $olderEvent->title)
                ->where('program.event.start_date', '2026-06-10')->where('program.event.end_date', '2026-06-12')
                ->where('program.event.location', $olderEvent->location)->where('program.event.description', $olderEvent->description)
                ->where('program.event.instructions', $olderEvent->instructions)
                ->where('program.event.share_url', route('dashboard.student.program.event', $olderEvent->id, false))
                ->where('program.index_url', route('dashboard.student.program', ['academic' => $older->id], false)));
    }

    public function test_calendar_download_includes_all_day_dates_and_reminder_only_when_requested(): void
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $title = 'Examens, première session ; préparation '.str_repeat('é', 30);
        $exam = $this->event($entry->academic_year_id, $title, 'exam', '2027-02-21', '2027-02-26');
        $semester = AcademicSemester::create(['academic_year_id' => $entry->academic_year_id, 'number' => 1, 'start_date' => '2026-10-02', 'end_date' => '2027-02-20']);
        $this->actingAs($student)->get(route('dashboard.student.program.calendar', ['academic' => $entry->id]))->assertOk()
            ->assertHeader('Content-Type', 'text/calendar; charset=UTF-8')->assertDownload('calendrier-academique-'.$entry->academic_year_id.'.ics')
            ->assertSee('Période de cours · Semestre 1', false)->assertSee('DTEND;VALUE=DATE:20270227', false)->assertDontSee('BEGIN:VALARM', false);
        $download = $this->get(route('dashboard.student.program.event-calendar', ['event' => $exam->id, 'academic' => $entry->id, 'reminder' => 1]))
            ->assertOk()->assertDownload('programme-'.$exam->id.'.ics')->assertSee('TRIGGER:-P1D', false)->assertDontSee('Période de cours', false);
        $lines = explode("\r\n", $download->getContent());
        $this->assertLessThanOrEqual(75, max(array_map('strlen', $lines)));
        $unfolded = str_replace("\r\n ", '', $download->getContent());
        $this->assertStringContainsString('SUMMARY:Examens\, première session \; préparation '.str_repeat('é', 30), $unfolded);
        $this->get(route('dashboard.student.program.event', ['event' => 'semestre-'.$semester->id, 'academic' => $entry->id]))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('program.event.category', 'semester'));
    }

    private function event(int $year, string $title, string $category, string $start, string $end): AcademicCalendarEvent
    {
        return AcademicCalendarEvent::create(['academic_year_id' => $year, 'title' => $title, 'category' => $category, 'start_date' => $start, 'end_date' => $end]);
    }
}
