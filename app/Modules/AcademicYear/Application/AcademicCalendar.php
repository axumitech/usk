<?php

namespace App\Modules\AcademicYear\Application;

use App\Models\AcademicCalendarEvent;
use App\Models\Student\AcademicSemester;
use Illuminate\Support\Collection;

final class AcademicCalendar
{
    /** @return Collection<int, AcademicCalendarEvent|AcademicSemester> */
    public function entries(int $yearId): Collection
    {
        return AcademicCalendarEvent::where('academic_year_id', $yearId)->orderBy('start_date')->orderBy('id')->get()->toBase()
            ->concat(AcademicSemester::where('academic_year_id', $yearId)->orderBy('number')->get())
            ->sortBy(fn ($entry) => $entry->start_date->toDateString())->values();
    }

    public function find(string $event, ?int $yearId = null): AcademicCalendarEvent|AcademicSemester
    {
        $semester = str_starts_with($event, 'semestre-');
        $model = $semester ? AcademicSemester::query() : AcademicCalendarEvent::query();

        return $model->when($yearId !== null, fn ($query) => $query->where('academic_year_id', $yearId))
            ->findOrFail($semester ? substr($event, strlen('semestre-')) : $event);
    }

    public function title(AcademicCalendarEvent|AcademicSemester $entry): string
    {
        return $entry instanceof AcademicSemester ? "Période de cours · Semestre {$entry->number}" : $entry->title;
    }

    public function categoryLabel(AcademicCalendarEvent|AcademicSemester $entry): string
    {
        return $entry instanceof AcademicSemester ? 'Période de cours' : (AcademicCalendarEvent::CATEGORIES[$entry->category] ?? 'Autre');
    }

    /** @param iterable<AcademicCalendarEvent|AcademicSemester> $entries */
    public function export(iterable $entries, bool $reminder = false): string
    {
        $lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//USK//Calendrier academique//FR', 'CALSCALE:GREGORIAN'];
        $host = parse_url(config('app.url'), PHP_URL_HOST) ?: 'usk';

        foreach ($entries as $entry) {
            $type = $entry instanceof AcademicSemester ? 'semester' : 'event';
            array_push($lines,
                'BEGIN:VEVENT',
                "UID:academic-{$type}-{$entry->id}@{$host}",
                'DTSTAMP:'.$entry->updated_at->utc()->format('Ymd\THis\Z'),
                'DTSTART;VALUE=DATE:'.$entry->start_date->format('Ymd'),
                'DTEND;VALUE=DATE:'.$entry->end_date->addDay()->format('Ymd'),
                'SUMMARY:'.$this->calendarText($this->title($entry)),
                'CATEGORIES:'.$this->calendarText($entry instanceof AcademicSemester ? 'Cours' : $this->categoryLabel($entry)),
            );

            if ($entry instanceof AcademicCalendarEvent) {
                if (filled($entry->location)) {
                    $lines[] = 'LOCATION:'.$this->calendarText($entry->location);
                }
                $description = array_filter([$entry->description, $entry->instructions], fn ($text) => filled($text));
                if ($description !== []) {
                    $lines[] = 'DESCRIPTION:'.$this->calendarText(implode("\n\n", $description));
                }
            }

            if ($reminder) {
                array_push($lines, 'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY',
                    'DESCRIPTION:'.$this->calendarText($this->title($entry)), 'END:VALARM');
            }

            $lines[] = 'END:VEVENT';
        }

        $lines[] = 'END:VCALENDAR';

        return implode("\r\n", array_map($this->fold(...), $lines))."\r\n";
    }

    private function calendarText(string $value): string
    {
        return str_replace(['\\', "\r\n", "\r", "\n", ';', ','], ['\\\\', '\n', '\n', '\n', '\;', '\,'], $value);
    }

    private function fold(string $line): string
    {
        $folded = '';
        while (strlen($line) > 75) {
            $part = mb_strcut($line, 0, 75, 'UTF-8');
            $folded .= $part."\r\n";
            $line = ' '.substr($line, strlen($part));
        }

        return $folded.$line;
    }
}
