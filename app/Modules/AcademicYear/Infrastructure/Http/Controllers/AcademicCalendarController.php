<?php

namespace App\Modules\AcademicYear\Infrastructure\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\AcademicCalendarEvent;
use App\Models\AcademicYear;
use App\Models\Student\AcademicSemester;
use App\Modules\AcademicYear\Application\AcademicCalendar;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

class AcademicCalendarController extends Controller
{
    public function index(Request $request)
    {
        $filters = $request->validate(['academic_year_id' => 'nullable|integer|exists:academic_years,id']);
        $years = AcademicYear::orderByDesc('start_date')->orderByDesc('id')->get(['id', 'title', 'start_date', 'end_date']);
        $today = now('Africa/Kinshasa')->toDateString();
        $year = isset($filters['academic_year_id'])
            ? $years->find($filters['academic_year_id'])
            : ($years->first(fn (AcademicYear $year) => $year->start_date <= $today && $year->end_date >= $today) ?? $years->first());

        return Inertia::render('dashboard/academicYear/Calendar', [
            'years' => $years,
            'year' => $year,
            'events' => $year ? $this->events($year->id)->get() : [],
            'semesters' => $year ? $this->semesters($year->id)->get(['id', 'number', 'start_date', 'end_date']) : [],
            'categories' => AcademicCalendarEvent::CATEGORIES,
        ]);
    }

    public function save(Request $request, AcademicYear $year, ?int $event = null)
    {
        $data = $request->validate([
            'title' => 'required|string|max:160',
            'category' => ['required', Rule::in(array_keys(AcademicCalendarEvent::CATEGORIES))],
            'start_date' => 'required|date_format:Y-m-d',
            'end_date' => 'required|date_format:Y-m-d|after_or_equal:start_date',
            'location' => 'nullable|string|max:160',
            'description' => 'nullable|string|max:3000',
            'instructions' => 'nullable|string|max:2000',
        ]);

        DB::transaction(function () use ($year, $event, $data) {
            $lockedYear = AcademicYear::whereKey($year->id)->lockForUpdate()->firstOrFail();
            if ($data['start_date'] < $lockedYear->start_date || $data['end_date'] > $lockedYear->end_date) {
                throw ValidationException::withMessages(['start_date' => 'Les dates doivent être comprises dans l’année académique.']);
            }

            $entry = $event ? $this->events($lockedYear->id)->findOrFail($event) : new AcademicCalendarEvent(['academic_year_id' => $lockedYear->id]);
            $entry->fill($data)->save();
        }, 3);

        return back()->with('success', 'Événement enregistré.');
    }

    public function destroy(AcademicYear $year, int $event)
    {
        DB::transaction(function () use ($year, $event) {
            $lockedYear = AcademicYear::whereKey($year->id)->lockForUpdate()->firstOrFail();
            $this->events($lockedYear->id)->findOrFail($event)->delete();
        }, 3);

        return redirect()->route('dashboard.admin.academic-years.calendar.index', ['academic_year_id' => $year->id])
            ->with('success', 'Événement supprimé.');
    }

    public function export(AcademicYear $year, AcademicCalendar $calendar)
    {
        $entries = $this->semesters($year->id)->get()->toBase()->concat($this->events($year->id)->get());

        return response($calendar->export($entries), 200, [
            'Content-Type' => 'text/calendar; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="calendrier-academique-'.$year->id.'.ics"',
        ]);
    }

    private function events(int $yearId): Builder
    {
        return AcademicCalendarEvent::where('academic_year_id', $yearId)->orderBy('start_date')->orderBy('id');
    }

    private function semesters(int $yearId): Builder
    {
        return AcademicSemester::where('academic_year_id', $yearId)->orderBy('number');
    }
}
