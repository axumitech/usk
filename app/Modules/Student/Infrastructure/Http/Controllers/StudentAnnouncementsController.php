<?php

namespace App\Modules\Student\Infrastructure\Http\Controllers;

use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicResource;
use App\Modules\Student\Application\Services\AcademicAccessService;
use App\Modules\Student\Application\Services\StudentAnnouncements;
use App\Modules\Student\Application\Services\StudentPortalContext;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

final class StudentAnnouncementsController
{
    public function __construct(
        private StudentPortalController $portal,
        private StudentPortalContext $context,
        private AcademicAccessService $access,
        private StudentAnnouncements $announcements,
    ) {}

    public function show(Request $request): Response
    {
        $input = $request->validate([
            'announcement' => 'nullable|integer|min:1',
            'filter' => ['nullable', Rule::in(array_keys(StudentAnnouncements::FILTERS))],
            'saved' => ['nullable', 'string', 'max:2000', 'regex:/^[1-9][0-9]{0,18}(?:,[1-9][0-9]{0,18}){0,99}$/D'],
            'announcements_page' => 'nullable|integer|min:1',
        ]);
        $currentYear = $this->context->currentYearId();
        $entry = $this->portal->context($request, $currentYear);
        $permissions = $this->access->permissions($entry);
        $announcement = isset($input['announcement']) ? (int) $input['announcement'] : null;

        if ($announcement !== null && ! $request->filled('academic') && ! $request->filled('application')) {
            [$entry, $permissions] = $this->sharedContext($entry, $permissions, $announcement);
        }
        abort_unless($permissions['courses_view']['allowed'], 403, $permissions['courses_view']['reason'] ?? 'Accès refusé.');

        $filter = $input['filter'] ?? 'all';
        $saved = isset($input['saved']) ? array_values(array_unique(explode(',', $input['saved']))) : [];

        return Inertia::render('dashboard/student/Announcements', [
            'studentChrome' => fn () => $this->context->forEnrollment($entry, $permissions, $currentYear),
            'announcements' => fn () => $this->announcements->read($entry, $permissions, $filter, $saved, $announcement, (int) ($input['announcements_page'] ?? 1)),
        ]);
    }

    private function sharedContext(AcademicEnrollment $current, array $permissions, int $announcement): array
    {
        if ($permissions['courses_view']['allowed'] && $this->announcements->query($current, $permissions)->whereKey($announcement)->exists()) {
            return [$current, $permissions];
        }
        $resource = AcademicResource::visible()->where('kind', 'announcement')
            ->where(fn ($query) => $query->whereNull('student_profile_id')->orWhere('student_profile_id', $current->student_profile_id))
            ->with('offering:id,academic_year_id')->findOrFail($announcement);

        foreach ($current->profile->enrollments()->where('academic_year_id', $resource->offering->academic_year_id)
            ->whereKeyNot($current->id)->whereHas('application')->with(['profile.user', 'application', 'level.faculty', 'academicYear'])
            ->orderByDesc('id')->get() as $entry) {
            $permissions = $this->access->permissions($entry);
            if ($permissions['courses_view']['allowed'] && $this->announcements->query($entry, $permissions)->whereKey($announcement)->exists()) {
                return [$entry, $permissions];
            }
        }

        abort(404);
    }
}
