<?php

namespace App\Modules\Student\Infrastructure\Http\Controllers;

use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicOffering;
use App\Models\Student\AcademicResource;
use App\Modules\Student\Application\Services\AcademicAccessService;
use App\Modules\Student\Application\Services\StudentMaterials;
use App\Modules\Student\Application\Services\StudentPortalContext;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

final class StudentMaterialsController
{
    public function __construct(
        private StudentPortalController $portal,
        private StudentPortalContext $context,
        private AcademicAccessService $access,
        private StudentMaterials $materials,
    ) {}

    public function show(Request $request, ?int $resource = null): Response
    {
        $filters = $request->validate([
            'filter' => ['nullable', Rule::in(array_keys(StudentMaterials::FILTERS))],
            'saved' => ['nullable', 'string', 'max:2000', 'regex:/^[1-9][0-9]{0,18}(?:,[1-9][0-9]{0,18}){0,99}$/D'],
            'materials_page' => 'nullable|integer|min:1',
        ]);
        $currentYear = $this->context->currentYearId();
        $entry = $this->portal->context($request, $currentYear);
        $permissions = $this->access->permissions($entry);
        if ($resource !== null && ! $request->filled('academic') && ! $request->filled('application')) {
            [$entry, $permissions] = $this->sharedContext($entry, $permissions, $resource);
        }
        abort_unless($permissions['courses_view']['allowed'], 403, $permissions['courses_view']['reason'] ?? 'Accès refusé.');
        abort_if(($permissions['materials_download']['visible'] ?? true) === false, 403, 'Ce service n’est pas proposé pour votre parcours.');

        $filter = $filters['filter'] ?? 'all';
        $saved = $filter === 'saved' && isset($filters['saved']) ? array_values(array_unique(explode(',', $filters['saved']))) : [];

        return Inertia::render('dashboard/student/Materials', [
            'studentChrome' => fn () => $this->context->forEnrollment($entry, $permissions, $currentYear),
            'materials' => fn () => $this->materials->read($entry, $permissions, $filter, $saved, $resource, (int) ($filters['materials_page'] ?? 1)),
        ]);
    }

    private function sharedContext(AcademicEnrollment $current, array $permissions, int $resource): array
    {
        $offering = AcademicResource::visible()->forStudent($current)->whereIn('kind', AcademicResource::CONTENT_KINDS)
            ->whereKey($resource)->value('academic_offering_id');
        $year = $offering ? AcademicOffering::whereKey($offering)->value('academic_year_id') : null;
        abort_unless($year, 404);
        if ($current->academic_year_id === $year && $this->mayOpen($current, $permissions, $resource)) {
            return [$current, $permissions];
        }

        foreach ($current->profile->enrollments()->where('academic_year_id', $year)->whereKeyNot($current->id)->whereHas('application')
            ->with(['profile.user', 'application', 'level.faculty', 'academicYear'])->orderByDesc('id')->get() as $entry) {
            $permissions = $this->access->permissions($entry);
            if ($this->mayOpen($entry, $permissions, $resource)) {
                return [$entry, $permissions];
            }
        }

        abort(404);
    }

    private function mayOpen(AcademicEnrollment $entry, array $permissions, int $resource): bool
    {
        return $permissions['courses_view']['allowed'] && ($permissions['materials_download']['visible'] ?? true)
            && $this->materials->has($entry, $permissions, $resource);
    }
}
