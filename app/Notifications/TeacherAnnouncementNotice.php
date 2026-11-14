<?php

namespace App\Notifications;

use App\Models\User;
use Illuminate\Notifications\Notification;

final class TeacherAnnouncementNotice extends Notification
{
    public function __construct(
        private int $academicEnrollmentId,
        private int $resourceId,
        private string $title,
        private string $course,
    ) {}

    public function deliver(User $recipient): void
    {
        $recipient->notifyNow($this);
    }

    public function via(object $recipient): array
    {
        return ['database'];
    }

    public function toDatabase(object $recipient): array
    {
        return [
            'academic_enrollment_id' => $this->academicEnrollmentId,
            'resource_id' => $this->resourceId,
            'title' => $this->title,
            'reference' => $this->course,
        ];
    }
}
