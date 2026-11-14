<?php

namespace App\Modules\Student\Application\Services;

use App\Models\Student\ServiceRequest;
use App\Models\User;
use App\Modules\Documents\Application\DocumentAccess;
use App\Modules\Results\Application\ResultsAccess;
use App\Modules\Teaching\Application\Services\LearningFiles;
use App\Modules\Teaching\Application\Services\TeachingScope;
use App\Notifications\StudentAppointmentNotice;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class StudentRequestService
{
    public const APPOINTMENT_ZONE = 'Africa/Kinshasa';

    public function __construct(private StudentAppointmentBooking $booking) {}

    private const ATTACHMENT_MIMES = [
        'pdf' => 'application/pdf',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
    ];

    public static function staffCategories(): array
    {
        return array_column(config('student_services'), 'label', 'category') + [
            'appeal' => 'Recours académiques',
            'support' => 'Assistance',
        ];
    }

    public function staffRow(ServiceRequest $ticket, User $actor, array $context = []): array
    {
        $procedure = StudentServiceCatalog::find($ticket->procedure);
        $document = $ticket->official_document_type_id !== null;
        $result = $ticket->academic_official_result_id !== null;
        $resultRun = $result && $actor->canAny([ResultsAccess::MANAGE, ResultsAccess::PUBLISH]) ? $ticket->officialResult?->run : null;
        $canReadResult = $resultRun && isset($resultRun->context['faculty_id']) && TeachingScope::allows($actor, (int) $resultRun->context['faculty_id']);
        $mime = $document || $result ? null : $this->attachmentMime($ticket);
        $hasResultFile = $canReadResult && $ticket->result_attachment;
        $hasGeneralFile = ! $document && ! $result && $ticket->request_attachment_path;
        $action = match (true) {
            $document && $actor->canAny([DocumentAccess::MANAGE, DocumentAccess::APPROVE, DocumentAccess::ISSUE]) => route('dashboard.admin.official-documents.index', ['academic' => $ticket->academic_enrollment_id, 'type' => $ticket->official_document_type_id]),
            $canReadResult => route('dashboard.admin.results.index', ['run' => $resultRun->id]),
            $document || $result => null,
            default => route('dashboard.admin.student-academic.index', ['tab' => 'requests', 'academic' => $ticket->academic_enrollment_id, 'ticket' => $ticket->id]),
        };

        return $ticket->only(['id', 'academic_enrollment_id', 'category', 'subject', 'body', 'status', 'response', 'created_at', 'updated_at']) + [
            'category_label' => self::staffCategories()[$ticket->category] ?? 'Autre démarche',
            'procedure_label' => $procedure['label'] ?? null,
            'service' => $procedure['service'] ?? null,
            'is_appointment' => $ticket->category === 'appointment',
            'appointment' => self::appointment($ticket),
            'appointment_cancellation' => self::appointmentCancellation($ticket),
            'appointment_reservation' => $ticket->category === 'appointment' ? $this->booking->reservation($ticket) : null,
            'appointment_revision' => (int) $ticket->appointment_revision,
            'appointment_date' => $ticket->appointment_date?->toDateString(),
            'appointment_period' => $ticket->appointment_period,
            'attachment_mime' => $mime,
            'attachment_name' => match (true) {
                $hasResultFile => 'Justificatif du recours',
                $hasGeneralFile => $ticket->request_attachment_name,
                default => null,
            },
            'attachment_url' => match (true) {
                $hasResultFile => route('dashboard.admin.results.appeal-file', $ticket),
                $hasGeneralFile => route('dashboard.admin.student-academic.requests.attachment', ['ticket' => $ticket->id]),
                default => null,
            },
            'attachment_preview_url' => $mime !== null
                ? route('dashboard.admin.student-academic.requests.preview', ['ticket' => $ticket->id])
                : null,
            'detail_url' => route('dashboard.admin.student-academic.requests.show', ['ticket' => $ticket->id] + $context),
            'action_url' => $action,
        ];
    }

    public function attachmentForStaff(ServiceRequest $ticket, User $actor, LearningFiles $files, bool $inline = false)
    {
        Gate::forUser($actor)->authorize('manage', $ticket->enrollment);
        abort_if($ticket->academic_official_result_id !== null || $ticket->official_document_type_id !== null, 404);

        return $files->stream([
            'disk' => 'local', 'path' => $ticket->request_attachment_path, 'filename' => $ticket->request_attachment_name,
            'mime' => $this->attachmentMime($ticket),
        ], $inline);
    }

    private function attachmentMime(ServiceRequest $ticket): ?string
    {
        return self::ATTACHMENT_MIMES[strtolower(pathinfo($ticket->request_attachment_path ?? '', PATHINFO_EXTENSION))] ?? null;
    }

    public static function appointment(ServiceRequest $ticket): ?array
    {
        return $ticket->appointment_cancelled_at ? null : self::confirmedSlot($ticket);
    }

    public static function appointmentCancellation(ServiceRequest $ticket): ?array
    {
        $slot = $ticket->appointment_cancelled_at ? self::confirmedSlot($ticket) : null;

        return $slot ? [
            'date' => $slot['date'], 'time' => $slot['time'], 'location' => $slot['location'],
            'cancelled_at' => $ticket->appointment_cancelled_at->toISOString(), 'reason' => $ticket->appointment_cancellation_reason,
        ] : null;
    }

    private static function confirmedSlot(ServiceRequest $ticket): ?array
    {
        if ($ticket->category !== 'appointment' || ! $ticket->appointment_starts_at || ! $ticket->appointment_confirmed_at) {
            return null;
        }

        $local = $ticket->appointment_starts_at->setTimezone(self::APPOINTMENT_ZONE);

        return [
            'date' => $local->toDateString(),
            'time' => $local->format('H:i'),
            'location' => $ticket->appointment_location,
            'confirmed_at' => $ticket->appointment_confirmed_at->toISOString(),
        ];
    }

    public function respond(ServiceRequest $ticket, User $actor, array $data): void
    {
        Gate::forUser($actor)->authorize('manage', $ticket->enrollment);
        DB::transaction(function () use ($ticket, $actor, $data) {
            if ($ticket->category === 'appointment') {
                $this->booking->beginWrite($ticket->enrollment->student_profile_id);
            }
            $ticket = ServiceRequest::lockForUpdate()->findOrFail($ticket->id);
            abort_if($ticket->academic_official_result_id !== null || $ticket->official_document_type_id !== null, 403, 'Utilisez le suivi spécialisé de cette demande.');
            if ($ticket->appointment_cancelled_at) {
                throw ValidationException::withMessages(['status' => 'Le rendez-vous est annulé.']);
            }
            if (self::appointment($ticket) && $data['status'] === 'open') {
                throw ValidationException::withMessages(['status' => 'Le rendez-vous est confirmé. Utilisez la fiche pour modifier le créneau.']);
            }
            if ($ticket->status === $data['status'] && $ticket->response === $data['response']) {
                return;
            }
            $updates = $data + ['responded_by' => $actor->id];
            if ($ticket->category === 'appointment') {
                $updates['appointment_revision'] = $ticket->appointment_revision + 1;
                if ($data['status'] === 'resolved' && ! self::appointment($ticket)) {
                    $this->booking->release($ticket);
                }
            }
            $ticket->update($updates);
            Audit::record($actor->id, 'student_request_answered', $ticket);
        }, 3);
    }

    public function confirmAppointment(ServiceRequest $ticket, User $actor, array $data): void
    {
        Gate::forUser($actor)->authorize('manage', $ticket->enrollment);
        $startsAt = CarbonImmutable::createFromFormat('!Y-m-d H:i', $data['date'].' '.$data['time'], self::APPOINTMENT_ZONE)->utc();

        DB::transaction(function () use ($ticket, $actor, $data, $startsAt) {
            $this->booking->beginWrite($ticket->enrollment->student_profile_id);
            $ticket = ServiceRequest::lockForUpdate()->findOrFail($ticket->id);
            abort_unless($ticket->category === 'appointment' && $ticket->academic_official_result_id === null && $ticket->official_document_type_id === null, 404);
            if ($ticket->appointment_cancelled_at) {
                throw ValidationException::withMessages(['expected_revision' => 'Le rendez-vous a été annulé. Rechargez sa fiche.']);
            }

            $previous = self::appointment($ticket);
            $slotChanged = ! $ticket->appointment_starts_at?->equalTo($startsAt) || $ticket->appointment_location !== $data['location'];
            $response = $data['response'] ?? $ticket->response;
            if ($previous !== null && ! $slotChanged && $response === $ticket->response) {
                return;
            }
            if ($ticket->appointment_revision !== (int) $data['expected_revision']) {
                throw ValidationException::withMessages(['expected_revision' => 'Le rendez-vous a été modifié. Rechargez sa fiche avant de continuer.']);
            }
            if ($previous !== null && ! $slotChanged) {
                $ticket->update([
                    'response' => $response, 'responded_by' => $actor->id, 'appointment_revision' => $ticket->appointment_revision + 1,
                ]);
                Audit::record($actor->id, 'student_request_answered', $ticket);

                return;
            }
            if ($previous !== null && $ticket->appointment_starts_at->lte(now())) {
                throw ValidationException::withMessages(['time' => 'Ce rendez-vous a déjà eu lieu.']);
            }
            if ($startsAt->lte(now())) {
                throw ValidationException::withMessages(['time' => 'Choisissez un créneau à venir.']);
            }
            if ($previous === null || ! $ticket->appointment_starts_at->equalTo($startsAt)) {
                try {
                    $this->booking->reserve($ticket, $data['date'], $data['time'], requireAvailability: false);
                } catch (ValidationException $error) {
                    throw ValidationException::withMessages(['time' => $error->errors()['appointment_slot'] ?? 'Ce créneau est indisponible.']);
                }
            }

            $ticket->update([
                'appointment_starts_at' => $startsAt,
                'appointment_location' => $data['location'],
                'appointment_confirmed_at' => now(),
                'appointment_confirmed_by' => $actor->id,
                'appointment_revision' => $ticket->appointment_revision + 1,
                'status' => 'resolved',
                'response' => $response,
                'responded_by' => $response !== $ticket->response ? $actor->id : $ticket->responded_by,
            ]);
            Audit::record($actor->id, $previous ? 'student_appointment_rescheduled' : 'student_appointment_confirmed', $ticket, data: [
                'appointment' => self::appointment($ticket), 'previous' => $previous,
            ]);
            $this->notifyAppointment($ticket, $previous === null ? 'appointment_confirmed' : 'appointment_rescheduled');
        }, 3);
    }

    public function cancelAppointment(ServiceRequest $ticket, User $actor, array $data): void
    {
        Gate::forUser($actor)->authorize('manage', $ticket->enrollment);

        DB::transaction(function () use ($ticket, $actor, $data) {
            $this->booking->beginWrite($ticket->enrollment->student_profile_id);
            $ticket = ServiceRequest::lockForUpdate()->findOrFail($ticket->id);
            abort_unless($ticket->official_document_type_id === null && $ticket->academic_official_result_id === null, 404);
            $slot = self::confirmedSlot($ticket);
            abort_unless($slot, 404);
            if ($ticket->appointment_cancelled_at && $ticket->appointment_cancellation_reason === $data['reason']) {
                return;
            }
            if ($ticket->appointment_revision !== (int) $data['expected_revision'] || $ticket->appointment_cancelled_at) {
                throw ValidationException::withMessages(['expected_revision' => 'Le rendez-vous a été modifié. Rechargez sa fiche avant de continuer.']);
            }
            if ($ticket->appointment_starts_at->lte(now())) {
                throw ValidationException::withMessages(['expected_revision' => 'Ce rendez-vous a déjà eu lieu.']);
            }

            $this->booking->release($ticket);
            $ticket->update([
                'appointment_cancelled_at' => now(),
                'appointment_cancelled_by' => $actor->id,
                'appointment_cancellation_reason' => $data['reason'],
                'appointment_revision' => $ticket->appointment_revision + 1,
                'status' => 'cancelled',
            ]);
            Audit::record($actor->id, 'student_appointment_cancelled', $ticket, reason: $data['reason'], data: ['appointment' => $slot]);
            $this->notifyAppointment($ticket, 'appointment_cancelled');
        }, 3);
    }

    private function notifyAppointment(ServiceRequest $ticket, string $status): void
    {
        $ticket->enrollment->profile->user->notify(new StudentAppointmentNotice($ticket->academic_enrollment_id, $ticket->id, $status));
    }
}
