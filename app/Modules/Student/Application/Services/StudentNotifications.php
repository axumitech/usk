<?php

namespace App\Modules\Student\Application\Services;

use App\Models\Enrollment;
use App\Models\User;
use App\Notifications\AcademicAssessmentNotice;
use App\Notifications\AcademicEnrollmentChanged;
use App\Notifications\AcademicScheduleNotice;
use App\Notifications\EnrollmentDocumentReviewed;
use App\Notifications\EnrollmentDocumentReplacement;
use App\Notifications\FinancialOperationNotice;
use App\Notifications\LearningContentNotice;
use App\Notifications\OfficialDocumentNotice;
use App\Notifications\OfficialResultNotice;
use App\Notifications\StudentAdmissionActivated;
use App\Notifications\StudentAppointmentNotice;
use App\Notifications\TeacherAnnouncementNotice;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\DB;

final class StudentNotifications
{
    private const KINDS = [
        EnrollmentDocumentReviewed::class => 'document',
        StudentAdmissionActivated::class => 'admission',
        AcademicEnrollmentChanged::class => 'enrollment',
        FinancialOperationNotice::class => 'finance',
        AcademicScheduleNotice::class => 'schedule',
        LearningContentNotice::class => 'learning',
        AcademicAssessmentNotice::class => 'assessment',
        OfficialResultNotice::class => 'results',
        OfficialDocumentNotice::class => 'official_document',
        StudentAppointmentNotice::class => 'student_request',
        TeacherAnnouncementNotice::class => 'announcement',
    ];

    public function forAdmissionsStaff(User $user): MorphMany
    {
        $query = $user->notifications()->whereIn('type', [EnrollmentDocumentReplacement::class, AcademicScheduleNotice::class]);
        if ($user->academicFaculties()->exists()) {
            $grammar = $query->getBaseQuery()->getGrammar();
            // Notifications store JSON as text. PostgreSQL needs a cast before extracting the identifier.
            $enrollmentId = $user->getConnection()->getDriverName() === 'pgsql'
                ? "CAST(\"data\" AS JSONB)->>'enrollment_id'"
                : $grammar->wrap('data->enrollment_id');
            $visible = AcademicStaffScope::apply(Enrollment::query(), $user)->selectRaw('CAST(enrollments.id AS VARCHAR)');
            $query->where(fn ($notice) => $notice->where('type', AcademicScheduleNotice::class)
                ->orWhereIn(DB::raw("CAST($enrollmentId AS VARCHAR)"), $visible));
        }

        return $query;
    }

    public function summary(User $user, bool $teacherOnly = false): array
    {
        $notifications = $this->query($user, $teacherOnly);

        return [
            'unread_count' => (clone $notifications)->whereNull('read_at')->count(),
            'items' => $notifications->orderByRaw('read_at IS NOT NULL')->orderByDesc('id')
                ->limit(15)->get()->map($this->present(...)),
        ];
    }

    public function inbox(User $user, ?int $academicId, string $filter): array
    {
        $notifications = $this->query($user);
        $parameters = $academicId === null ? [] : ['academic' => $academicId];
        $unreadParameters = $parameters + ['filter' => 'unread'];
        $viewParameters = $filter === 'unread' ? $unreadParameters : $parameters;
        $unreadCount = (clone $notifications)->whereNull('read_at')->count();

        return [
            'filter' => $filter,
            'unread_count' => $unreadCount,
            'items' => $notifications->when($filter === 'unread', fn ($query) => $query->whereNull('read_at'))
                ->orderByDesc('id')->paginate(15, ['*'], 'notifications_page')
                ->appends($viewParameters)->through($this->present(...)),
            'index_url' => route('dashboard.student.notifications.index', $parameters, false),
            'unread_url' => route('dashboard.student.notifications.index', $unreadParameters, false),
            'read_all_url' => route('dashboard.notifications.read-all', ['inbox' => 1] + $viewParameters, false),
        ];
    }

    public function find(User $user, string $notification): DatabaseNotification
    {
        return $this->query($user)->findOrFail($notification);
    }

    public function readAll(User $user, bool $teacherOnly = false): void
    {
        $this->query($user, $teacherOnly)->whereNull('read_at')->update(['read_at' => now()]);
    }

    private function query(User $user, bool $teacherOnly = false): MorphMany
    {
        $query = $user->notifications()->whereIn('type', array_keys(self::KINDS));
        if ($teacherOnly) {
            $query->where('type', AcademicScheduleNotice::class)->whereNull('data->academic_enrollment_id')->whereNotNull('data->offering_id');
        }

        return $query;
    }

    private function present(DatabaseNotification $notice): array
    {
        return [
            'id' => $notice->id,
            'reference' => $notice->data['reference'] ?? 'Inscription académique',
            'filename' => $notice->data['filename'] ?? '',
            'kind' => self::KINDS[$notice->type],
            'title' => $notice->type === TeacherAnnouncementNotice::class ? ($notice->data['title'] ?? null) : null,
            'status' => $notice->data['status'] ?? null,
            'version' => $notice->data['version'] ?? null,
            'verdict' => $notice->data['verdict'] ?? null,
            'comment' => $notice->data['comment'] ?? null,
            'created_at' => $notice->created_at->toISOString(),
            'read_at' => $notice->read_at?->toISOString(),
            'open_url' => route('dashboard.notifications.open', $notice->id),
        ];
    }
}
