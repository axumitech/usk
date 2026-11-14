<?php

namespace App\Modules\Student\Application\Services;

use App\Models\AcademicCalendarEvent;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicSemester;
use App\Modules\AcademicYear\Application\AcademicCalendar;

final class StudentAcademicProgram
{
    public function __construct(private AcademicCalendar $calendar) {}

    public function read(AcademicEnrollment $entry, AcademicCalendarEvent|AcademicSemester|null $event): array
    {
        $context = ['academic' => $entry->id];

        return [
            'academic_id' => $entry->id,
            'year' => $entry->academicYear->title,
            'faculty' => $entry->level->faculty->name,
            'level' => $entry->level->title,
            'today' => now('Africa/Kinshasa')->toDateString(),
            'events' => $event ? [] : $this->calendar->entries($entry->academic_year_id)
                ->map(fn ($item) => $this->present($item, $entry->id))->all(),
            'event' => $event ? $this->present($event, $entry->id) : null,
            'calendar_url' => route('dashboard.student.program.calendar', $context, false),
            'index_url' => route('dashboard.student.program', $context, false),
        ];
    }

    public function upcoming(AcademicEnrollment $entry, int $limit = 3): array
    {
        $today = now('Africa/Kinshasa')->toDateString();

        return $this->calendar->entries($entry->academic_year_id)
            ->filter(fn ($event) => $event instanceof AcademicSemester
                ? $event->start_date->toDateString() >= $today
                : $event->end_date->toDateString() >= $today)
            ->take($limit)->values()->map(fn ($event) => $this->present($event, $entry->id))->all();
    }

    private function present(AcademicCalendarEvent|AcademicSemester $event, int $academic): array
    {
        $semester = $event instanceof AcademicSemester;
        $id = $semester ? 'semestre-'.$event->id : $event->id;
        $params = ['event' => $id, 'academic' => $academic];

        return [
            'id' => $id,
            'title' => $this->calendar->title($event),
            'category' => $semester ? 'semester' : $event->category,
            'category_label' => $this->calendar->categoryLabel($event),
            'start_date' => $event->start_date->toDateString(),
            'end_date' => $event->end_date->toDateString(),
            'location' => $semester ? null : $event->location,
            'description' => $semester ? null : $event->description,
            'instructions' => $semester ? null : $event->instructions,
            'detail_url' => route('dashboard.student.program.event', $params, false),
            'share_url' => route('dashboard.student.program.event', ['event' => $id], false),
            'calendar_url' => route('dashboard.student.program.event-calendar', $params, false),
            'reminder_url' => route('dashboard.student.program.event-calendar', $params + ['reminder' => 1], false),
        ];
    }
}
