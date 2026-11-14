<?php

namespace App\Modules\Student\Infrastructure\Http\Controllers;

use App\Modules\Student\Application\Services\AcademicAccessService;
use App\Modules\Student\Application\Services\StudentAcademicPathway;
use App\Modules\Student\Application\Services\StudentPortalContext;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

final class StudentPathwayController
{
    public function __invoke(
        Request $request, StudentPortalController $portal, StudentPortalContext $context,
        AcademicAccessService $access, StudentAcademicPathway $pathway,
    ): Response {
        $currentYear = $context->currentYearId();
        $entry = $portal->context($request, $currentYear);

        return Inertia::render('dashboard/student/Pathway', [
            'studentChrome' => fn () => $context->forEnrollment($entry, $access->permissions($entry), $currentYear),
            'pathway' => fn () => $pathway->read($entry, $currentYear),
        ]);
    }
}
