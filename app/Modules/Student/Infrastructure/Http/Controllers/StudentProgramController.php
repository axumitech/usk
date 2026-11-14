<?php

namespace App\Modules\Student\Infrastructure\Http\Controllers;

use App\Modules\AcademicYear\Application\AcademicCalendar;
use App\Modules\Student\Application\Services\AcademicAccessService;
use App\Modules\Student\Application\Services\StudentAcademicProgram;
use App\Modules\Student\Application\Services\StudentPortalContext;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

final class StudentProgramController
{
    public function __construct(
        private StudentPortalController $portal,
        private StudentPortalContext $context,
        private AcademicAccessService $access,
        private AcademicCalendar $calendar,
        private StudentAcademicProgram $program,
    ) {}

    public function show(Request $request, ?string $event = null): InertiaResponse
    {
        $currentYear = $this->context->currentYearId();
        $entry = $this->portal->context($request, $currentYear);
        $explicitContext = $request->filled('academic') || $request->filled('application');
        $selected = $event === null ? null : $this->calendar->find($event, $explicitContext ? $entry->academic_year_id : null);

        if ($selected && $selected->academic_year_id !== $entry->academic_year_id) {
            $entry = $this->portal->context($request, $selected->academic_year_id);
            abort_unless($entry->academic_year_id === $selected->academic_year_id, 404);
        }

        return Inertia::render('dashboard/student/Program', [
            'studentChrome' => fn () => $this->context->forEnrollment($entry, $this->access->permissions($entry), $currentYear),
            'program' => fn () => $this->program->read($entry, $selected),
        ]);
    }

    public function calendar(Request $request, ?string $event = null): Response
    {
        $entry = $this->portal->context($request, $this->context->currentYearId());
        $items = $event === null ? $this->calendar->entries($entry->academic_year_id) : [$this->calendar->find($event, $entry->academic_year_id)];
        $filename = $event === null ? 'calendrier-academique-'.$entry->academic_year_id : 'programme-'.$event;

        return response($this->calendar->export($items, $event !== null && $request->boolean('reminder')), 200, [
            'Content-Type' => 'text/calendar; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$filename.'.ics"',
            'Cache-Control' => 'private, no-store',
        ]);
    }
}
