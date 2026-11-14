<?php

namespace App\Notifications;

use Illuminate\Notifications\Notification;

final class StudentAppointmentNotice extends Notification
{
    public function __construct(private int $enrollment, private int $ticket, private string $status) {}

    public function via(object $recipient): array
    {
        return ['database'];
    }

    public function toDatabase(object $recipient): array
    {
        return [
            'academic_enrollment_id' => $this->enrollment,
            'ticket_id' => $this->ticket,
            'status' => $this->status,
            'reference' => 'Rendez-vous de scolarité',
        ];
    }
}
