<?php

namespace App\Modules\Student\Infrastructure\Http\Controllers;

use App\Modules\Student\Application\Services\AcademicAccessService;
use App\Modules\Student\Application\Services\StudentNotifications;
use App\Modules\Student\Application\Services\StudentPortalContext;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

final class StudentNotificationsController
{
    public function __invoke(
        Request $request,
        StudentPortalController $portal,
        StudentPortalContext $context,
        AcademicAccessService $access,
        StudentNotifications $notifications,
    ): Response {
        $input = $request->validate([
            'filter' => 'nullable|in:all,unread',
            'notifications_page' => 'nullable|integer|min:1',
        ]);
        $user = $request->user();
        abort_unless($user->hasRole('student') && $user->studentProfile, 403);

        if ($request->filled('academic') || $request->filled('application')) {
            $currentYear = $context->currentYearId();
            $entry = $portal->context($request, $currentYear);
            $chrome = $context->forEnrollment($entry, $access->permissions($entry), $currentYear);
        } else {
            $chrome = $context->forAccount($user, null);
        }

        return Inertia::render('dashboard/student/Notifications', [
            'studentChrome' => $chrome,
            'notifications' => fn () => $notifications->inbox($user, $chrome['academic_id'], $input['filter'] ?? 'all'),
        ]);
    }
}
