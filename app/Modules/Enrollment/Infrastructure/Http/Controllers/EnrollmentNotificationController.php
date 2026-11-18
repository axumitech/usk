<?php

namespace App\Modules\Enrollment\Infrastructure\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Enrollment;
use App\Modules\Student\Application\Services\AcademicAccessService;
use App\Modules\Student\Application\Services\StudentAnnouncements;
use App\Modules\Student\Application\Services\StudentNotifications;
use App\Modules\Student\Application\Services\StudentServiceCatalog;
use App\Notifications\AcademicAssessmentNotice;
use App\Notifications\AcademicEnrollmentChanged;
use App\Notifications\AcademicScheduleNotice;
use App\Notifications\FinancialOperationNotice;
use App\Notifications\LearningContentNotice;
use App\Notifications\OfficialDocumentNotice;
use App\Notifications\OfficialResultNotice;
use App\Notifications\StudentAdmissionActivated;
use App\Notifications\StudentAppointmentNotice;
use App\Notifications\StudentRequestAnswered;
use App\Notifications\TeacherAnnouncementNotice;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class EnrollmentNotificationController extends Controller
{
    public function open(Request $request, string $notification, StudentNotifications $notifications)
    {
        $notice = $notifications->forAdmissionsStaff($request->user())->findOrFail($notification);
        if ($notice->type === AcademicScheduleNotice::class) {
            $notice->markAsRead();
            return to_route('dashboard.admin.schedule.absences', [], 303);
        }
        $entry = Enrollment::findOrFail($notice->data['enrollment_id']);
        Gate::authorize('review', $entry);
        $document = $entry->documents()->where('uuid', $notice->data['document_uuid'])->firstOrFail();
        $notice->markAsRead();

        return redirect('/app/dashboard/admin/enrollments/'.$entry->id.'?'.http_build_query(['document' => $document->uuid]).'#review-document-'.$document->uuid, 303);
    }

    public function readAll(Request $request, StudentNotifications $notifications)
    {
        $notifications->forAdmissionsStaff($request->user())->whereNull('read_at')->update(['read_at' => now()]);

        return back();
    }

    public function openStudent(Request $request, string $notification, StudentNotifications $notifications)
    {
        $notice = $notifications->find($request->user(), $notification);
        if ($notice->type === StudentRequestAnswered::class) {
            abort_unless($request->user()->hasRole('student'), 403);
            $academic = $request->user()->studentProfile?->enrollments()->whereHas('application')->findOrFail($notice->data['academic_enrollment_id']);
            abort_unless($academic, 404);
            $ticket = $academic->serviceRequests()->where('procedure', StudentServiceCatalog::ENROLLMENT_EXCEPTION)->findOrFail($notice->data['ticket_id']);
            $notice->markAsRead();

            return to_route('dashboard.student.index', ['section' => 'requests', 'academic' => $academic->id, 'request' => $ticket->id], 303);
        }
        if ($notice->type === TeacherAnnouncementNotice::class) {
            abort_unless($request->user()->hasRole('student'), 403);
            $academic = $request->user()->studentProfile?->enrollments()->whereHas('application')->findOrFail($notice->data['academic_enrollment_id']);
            abort_unless($academic, 404);
            $permissions = app(AcademicAccessService::class)->permissions($academic);
            abort_unless($permissions['courses_view']['allowed'], 403, $permissions['courses_view']['reason'] ?? 'Accès refusé.');
            $announcement = app(StudentAnnouncements::class)->query($academic, $permissions)->findOrFail($notice->data['resource_id']);
            $notice->markAsRead();

            return to_route('dashboard.student.announcements', ['academic' => $academic->id, 'announcement' => $announcement->id], 303);
        }
        if ($notice->type === StudentAppointmentNotice::class) {
            $academic = $request->user()->studentProfile?->enrollments()->findOrFail($notice->data['academic_enrollment_id']);
            abort_unless($academic, 404);
            $ticket = $academic->serviceRequests()->where('category', 'appointment')->findOrFail($notice->data['ticket_id']);
            $notice->markAsRead();

            return to_route('dashboard.student.index', ['section' => 'requests', 'academic' => $academic->id, 'request' => $ticket->id], 303);
        }
        if ($notice->type === OfficialDocumentNotice::class) {
            $academic = $request->user()->studentProfile?->enrollments()->findOrFail($notice->data['academic_enrollment_id']);
            abort_unless($academic, 404);
            $notice->markAsRead();

            return to_route('dashboard.student.index', ['section' => $notice->data['section'], 'academic' => $academic->id], 303);
        }
        if ($notice->type === \App\Notifications\OfficialResultNotice::class) {
            $academic = $request->user()->studentProfile?->enrollments()->findOrFail($notice->data['academic_enrollment_id']);
            abort_unless($academic, 404);
            $notice->markAsRead();

            return to_route('dashboard.student.index', ['section' => 'results', 'academic' => $academic->id], 303);
        }
        if ($notice->type === \App\Notifications\AcademicAssessmentNotice::class) {
            $academic = $request->user()->studentProfile?->enrollments()->findOrFail($notice->data['academic_enrollment_id']);
            abort_unless($academic, 404);
            $notice->markAsRead();
            $parameters = ['section' => $notice->data['section'], 'academic' => $academic->id];
            if ($notice->data['status'] !== 'cancelled') {
                $parameters['work'] = $notice->data['resource_id'];
            }

            return to_route('dashboard.student.index', $parameters, 303);
        }
        if ($notice->type === \App\Notifications\LearningContentNotice::class) {
            $academic = $request->user()->studentProfile?->enrollments()->findOrFail($notice->data['academic_enrollment_id']);
            abort_unless($academic, 404);
            $notice->markAsRead();

            return to_route('dashboard.student.courses.show', ['course' => $notice->data['course_id'],
                'section' => $notice->data['section'], 'academic' => $academic->id], 303);
        }
        if ($notice->type === \App\Notifications\AcademicScheduleNotice::class) {
            $notice->markAsRead();
            if ($request->user()->hasRole('professor') && ! isset($notice->data['academic_enrollment_id'])) {
                return to_route('dashboard.teaching.index', ['offering' => $notice->data['offering_id']], 303);
            }
            $academic = $request->user()->studentProfile?->enrollments()->findOrFail($notice->data['academic_enrollment_id'] ?? -1);
            abort_unless($academic, 404);
            if ($notice->data['absence'] ?? false) {
                return to_route('dashboard.student.absences', [], 303);
            }
            return to_route('dashboard.student.index', ['section' => 'schedule', 'academic' => $academic->id, 'week' => $notice->data['week']], 303);
        }
        if ($notice->type === \App\Notifications\FinancialOperationNotice::class) {
            $academic = $request->user()->studentProfile?->enrollments()->findOrFail($notice->data['academic_enrollment_id']);
            abort_unless($academic, 404); $notice->markAsRead();
            return redirect()->route('dashboard.student.index', ['section' => 'transactions', 'academic' => $academic->id], 303);
        }
        if ($notice->type === \App\Notifications\AcademicEnrollmentChanged::class) {
            $academic = $request->user()->studentProfile?->enrollments()->findOrFail($notice->data['academic_enrollment_id']);
            abort_unless($academic, 404);
            $notice->markAsRead();
            return ! empty($notice->data['progression'])
                ? to_route('dashboard.student.index', ['section' => 'academics', 'academic' => $academic->id], 303)
                : to_route('dashboard.student.enrollments', [], 303);
        }
        $entry = $request->user()->enrollments()->findOrFail($notice->data['enrollment_id']);
        if ($notice->type === \App\Notifications\StudentAdmissionActivated::class) {
            $academic = $request->user()->studentProfile?->enrollments()->where('application_id', $entry->id)->firstOrFail();
            abort_unless($academic, 404);
            $notice->markAsRead();

            return redirect('/app/dashboard/student?academic='.$academic->id, 303);
        }
        $document = $entry->documents()->where('uuid', $notice->data['document_uuid'])->firstOrFail();
        $notice->markAsRead();

        return redirect('/app/dashboard/enrollments/'.$entry->uuid.'?'.http_build_query(['document' => $document->uuid]).'#student-document-'.$document->uuid, 303);
    }

    public function readAllStudent(Request $request, StudentNotifications $notifications)
    {
        $teacherOnly = $request->query('audience') === 'teacher';
        abort_if($teacherOnly && ! $request->user()->hasRole('professor'), 403);
        $context = $request->boolean('inbox')
            ? $request->validate(['academic' => 'nullable|integer', 'filter' => 'nullable|in:all,unread'])
            : null;
        $notifications->readAll($request->user(), $teacherOnly);
        if ($context !== null) {
            return to_route('dashboard.student.notifications.index', $context, 303);
        }

        return back();
    }
}
