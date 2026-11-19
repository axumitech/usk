<?php

namespace App\Notifications;

use Illuminate\Notifications\Notification;

final class PromotionMessage extends Notification
{
    public function __construct(private int $enrollment, private string $message) {}

    public function via(object $recipient): array
    {
        return ['database'];
    }

    public function toDatabase(object $recipient): array
    {
        return ['academic_enrollment_id' => $this->enrollment, 'reference' => 'Votre promotion',
            'title' => 'Message de votre chef de promotion', 'comment' => $this->message];
    }
}
