<?php

namespace App\Notifications;

use Illuminate\Notifications\Notification;

final class StudentRequestAnswered extends Notification
{
    public function __construct(private int $enrollment, private int $ticket) {}

    public function via(object $recipient): array
    {
        return ['database'];
    }

    public function toDatabase(object $recipient): array
    {
        return [
            'academic_enrollment_id' => $this->enrollment,
            'ticket_id' => $this->ticket,
            'status' => 'request_answered',
            'reference' => 'Demande de dérogation n° '.$this->ticket,
        ];
    }
}
