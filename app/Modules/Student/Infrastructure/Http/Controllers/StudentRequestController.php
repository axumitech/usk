<?php

namespace App\Modules\Student\Infrastructure\Http\Controllers;

use App\Mail\TransactionalEmail;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\ServiceRequest;
use App\Modules\Student\Application\Services\StudentAppointmentAgenda;
use App\Modules\Student\Application\Services\StudentAppointmentBooking;
use App\Modules\Student\Application\Services\StudentRequestService;
use App\Modules\Teaching\Application\Services\LearningFiles;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

final class StudentRequestController
{
    private const ROUTES = 'dashboard.admin.student-academic.';

    public function __construct(private StudentRequestService $requests, private StudentAppointmentBooking $booking) {}

    public function agenda(Request $request, StudentAppointmentAgenda $agenda)
    {
        Gate::authorize('manage academic access');
        $filters = $request->validate([
            'week' => 'nullable|date_format:Y-m-d',
            'service' => ['nullable', Rule::in(array_keys(StudentAppointmentAgenda::services()))],
        ]);

        $week = $agenda->week($request->user(), $filters['week'] ?? null, $filters['service'] ?? null);
        $week['availability_url'] = $this->canManageAvailability($request) ? $this->availabilityUrl($filters['service'] ?? null) : null;

        return Inertia::render('dashboard/studentAcademic/Agenda', ['agenda' => $week]);
    }

    public function availability(Request $request)
    {
        abort_unless($this->canManageAvailability($request), 403);
        $services = StudentAppointmentAgenda::services();
        $service = $this->availabilityService($request);

        return Inertia::render('dashboard/studentAcademic/Availability', [
            'availability' => [
                'service' => $service,
                'services' => collect($services)->map(fn (string $label, string $key) => [
                    'key' => $key, 'label' => $label, 'url' => $this->availabilityUrl($key),
                ])->values(),
                'slot_minutes' => StudentAppointmentBooking::SLOT_MINUTES,
                'update_url' => route(self::ROUTES.'requests.availability.update', ['service' => $service]),
                'agenda_url' => StudentAppointmentAgenda::url(service: $service),
            ] + $this->booking->schedule($service),
            'success' => session('success'),
        ]);
    }

    public function updateAvailability(Request $request)
    {
        abort_unless($this->canManageAvailability($request), 403);
        $service = $this->availabilityService($request);
        $returnUrl = $this->availabilityUrl($service);

        try {
            $data = $request->validate([
                'expected_revision' => 'required|integer|min:0',
                'windows' => 'present|array|list|max:48',
                'windows.*' => 'required|array:weekday,starts_at,ends_at',
                'windows.*.weekday' => 'required|integer|between:1,7',
                'windows.*.starts_at' => 'required|date_format:H:i',
                'windows.*.ends_at' => 'required|date_format:H:i',
            ], [
                'expected_revision.required' => 'Rechargez les disponibilités de ce service.',
                'windows.max' => 'Vous pouvez ajouter jusqu’à 48 plages par service.',
                'windows.*.weekday.between' => 'Choisissez un jour de la semaine.',
                'windows.*.starts_at.date_format' => 'Indiquez une heure de début valide.',
                'windows.*.ends_at.date_format' => 'Indiquez une heure de fin valide.',
            ]);
            $this->booking->saveWindows($service, $data['windows'], (int) $data['expected_revision']);
        } catch (ValidationException $error) {
            throw $error->redirectTo($returnUrl);
        }

        return redirect()->to($returnUrl, 303)->with('success', 'Les disponibilités du service ont été enregistrées.');
    }

    public function show(Request $request, ServiceRequest $ticket)
    {
        Gate::authorize('manage', $ticket->enrollment);
        $context = $this->context($request, $ticket);
        $row = $this->requests->staffRow($ticket, $request->user(), $context);
        $entry = $ticket->enrollment->loadMissing(['level.faculty', 'academicYear', 'profile.user']);
        $ticket->loadMissing('responder');
        $canReply = $ticket->official_document_type_id === null && $ticket->academic_official_result_id === null && ! $row['appointment_cancellation'];
        $canChangeSlot = $canReply && $row['is_appointment'] && (! $row['appointment'] || $ticket->appointment_starts_at->isFuture());
        $parameters = ['ticket' => $ticket->id] + $context;
        $slots = $canChangeSlot ? $this->availableAppointments($ticket, $entry->student_profile_id, $row['appointment_reservation'], $row['appointment']) : null;

        return Inertia::render('dashboard/studentAcademic/Request', [
            'ticket' => $row + ['responder_name' => $ticket->responder ? TransactionalEmail::recipientName($ticket->responder) : null],
            'appointment_slots' => $slots,
            'student' => [
                'id' => $entry->id,
                'name' => TransactionalEmail::recipientName($entry->profile->user),
                'matricule' => $entry->profile->matricule ?? $entry->matricule,
                'year' => $entry->academicYear->title,
                'level' => $entry->level->title,
                'faculty' => $entry->level->faculty->name,
                'dossier_url' => $this->dossierUrl($entry->id),
            ],
            'actions' => [
                'reply_url' => $canReply ? route(self::ROUTES.'requests.reply', $parameters + ['from_detail' => 1]) : null,
                'confirm_url' => $canChangeSlot ? route(self::ROUTES.'requests.confirm', $parameters) : null,
                'cancel_url' => $canChangeSlot && $row['appointment'] ? route(self::ROUTES.'requests.cancel', $parameters) : null,
                'specialized_url' => $canReply || $row['is_appointment'] ? null : $row['action_url'],
            ],
            'back_url' => $this->backUrl($context),
            'back_label' => match (true) {
                isset($context['agenda_week']) => 'Retour à l’agenda',
                isset($context['dossier_academic']) => 'Retour au dossier étudiant',
                default => 'Retour aux demandes',
            },
            'today' => today(StudentRequestService::APPOINTMENT_ZONE)->toDateString(),
            'success' => session('success'),
        ]);
    }

    public function respond(Request $request, ServiceRequest $ticket)
    {
        Gate::authorize('manage', $ticket->enrollment);
        $detail = $request->boolean('from_detail') ? $this->detailUrl($request, $ticket) : null;

        try {
            $data = $request->validate([
                'response' => 'required|string|min:5|max:6000',
                'status' => 'required|in:open,resolved',
            ], [
                'response.required' => 'Renseignez une réponse à l’étudiant.',
                'response.min' => 'La réponse doit contenir au moins 5 caractères.',
                'response.max' => 'La réponse ne peut pas dépasser 6 000 caractères.',
                'status.in' => 'Choisissez un statut proposé.',
            ]);
            $this->requests->respond($ticket, $request->user(), $data);
        } catch (ValidationException $error) {
            if ($detail !== null) {
                $error->redirectTo($detail);
            }

            throw $error;
        }

        return ($detail ? redirect()->to($detail, 303) : back())->with('success', 'Réponse publiée dans l’espace de l’étudiant.');
    }

    public function confirm(Request $request, ServiceRequest $ticket)
    {
        Gate::authorize('manage', $ticket->enrollment);
        $detail = $this->detailUrl($request, $ticket);

        try {
            $data = $request->validate([
                'date' => 'required|date_format:Y-m-d',
                'time' => 'required|date_format:H:i',
                'location' => 'required|string|max:180',
                'response' => 'nullable|string|min:5|max:6000',
                'expected_revision' => 'required|integer|min:0',
            ], [
                'date.required' => 'Indiquez la date du rendez-vous.',
                'date.date_format' => 'Indiquez une date valide.',
                'time.required' => 'Indiquez l’heure du rendez-vous.',
                'time.date_format' => 'Indiquez une heure valide.',
                'location.required' => 'Indiquez le lieu du rendez-vous.',
                'location.max' => 'Le lieu ne peut pas dépasser 180 caractères.',
                'response.min' => 'Le message doit contenir au moins 5 caractères.',
                'response.max' => 'Le message ne peut pas dépasser 6 000 caractères.',
                'expected_revision.required' => 'Rechargez la fiche avant de confirmer le rendez-vous.',
            ]);
            $this->requests->confirmAppointment($ticket, $request->user(), $data);
        } catch (ValidationException $error) {
            throw $error->redirectTo($detail);
        }

        return redirect()->to($detail, 303)->with('success', 'Le créneau est confirmé dans l’espace de l’étudiant.');
    }

    public function attachment(Request $request, ServiceRequest $ticket, LearningFiles $files)
    {
        return $this->requests->attachmentForStaff($ticket, $request->user(), $files);
    }

    public function cancel(Request $request, ServiceRequest $ticket)
    {
        Gate::authorize('manage', $ticket->enrollment);
        $detail = $this->detailUrl($request, $ticket);

        try {
            $data = $request->validate([
                'reason' => 'required|string|min:5|max:6000',
                'expected_revision' => 'required|integer|min:0',
            ], [
                'reason.required' => 'Indiquez le motif de l’annulation.',
                'reason.min' => 'Le motif doit contenir au moins 5 caractères.',
                'reason.max' => 'Le motif ne peut pas dépasser 6 000 caractères.',
                'expected_revision.required' => 'Rechargez la fiche avant d’annuler le rendez-vous.',
            ]);
            $this->requests->cancelAppointment($ticket, $request->user(), $data);
        } catch (ValidationException $error) {
            throw $error->redirectTo($detail);
        }

        return redirect()->to($detail, 303)->with('success', 'Le rendez-vous est annulé et l’étudiant a été notifié dans son espace.');
    }

    public function preview(Request $request, ServiceRequest $ticket, LearningFiles $files)
    {
        return $this->requests->attachmentForStaff($ticket, $request->user(), $files, true);
    }

    private function detailUrl(Request $request, ServiceRequest $ticket): string
    {
        return route(self::ROUTES.'requests.show', ['ticket' => $ticket->id] + $this->context($request, $ticket));
    }

    private function canManageAvailability(Request $request): bool
    {
        return $request->user()->can('manage academic access') && $request->user()->academicFaculties()->doesntExist();
    }

    private function availabilityService(Request $request): string
    {
        $services = StudentAppointmentAgenda::services();
        $input = validator($request->query(), ['service' => ['nullable', Rule::in(array_keys($services))]])->validate();

        return $input['service'] ?? array_key_first($services);
    }

    private function availabilityUrl(?string $service): string
    {
        return route(self::ROUTES.'requests.availability', ['service' => $service]);
    }

    private function availableAppointments(ServiceRequest $ticket, int $studentProfile, ?array $reserved, ?array $confirmed): ?array
    {
        $service = StudentAppointmentBooking::service($ticket->procedure);
        if (! $this->booking->isConfigured($service)) {
            return null;
        }

        $slots = $this->booking->slots($service, exceptTicket: $ticket->id, studentProfile: $studentProfile);
        $existing = $reserved ?? $confirmed;
        if (! $existing) {
            return $slots;
        }

        $start = CarbonImmutable::createFromFormat('!Y-m-d H:i', $existing['date'].' '.$existing['time'], StudentRequestService::APPOINTMENT_ZONE);
        if ($start->isFuture()) {
            $slots[] = [
                'date' => $existing['date'], 'time' => $existing['time'],
                'end_time' => $existing['end_time'] ?? $start->addMinutes(StudentAppointmentBooking::SLOT_MINUTES)->format('H:i'),
            ];
        }

        return collect($slots)->unique(fn (array $slot) => $slot['date'].'T'.$slot['time'])
            ->sortBy(fn (array $slot) => $slot['date'].'T'.$slot['time'])->values()->all();
    }

    private function context(Request $request, ServiceRequest $ticket): array
    {
        $context = validator($request->query(), [
            'academic' => 'nullable|integer|min:1',
            'request_category' => ['nullable', Rule::in(array_keys(StudentRequestService::staffCategories()))],
            'request_status' => 'nullable|in:open,resolved,cancelled',
            'requests_page' => 'nullable|integer|min:1',
            'queue_ticket' => 'nullable|integer|min:1',
            'dossier_academic' => 'nullable|integer|min:1',
            'records_page' => 'nullable|integer|min:1|max:100000',
            'agenda_week' => 'nullable|date_format:Y-m-d',
            'agenda_service' => ['nullable', Rule::in(array_keys(StudentAppointmentAgenda::services()))],
        ])->validate();

        if (isset($context['dossier_academic'])) {
            $dossier = AcademicEnrollment::where('student_profile_id', $ticket->enrollment->student_profile_id)->findOrFail($context['dossier_academic']);
            Gate::authorize('view', $dossier);
        }

        return array_filter($context);
    }

    private function backUrl(array $context): string
    {
        if (isset($context['agenda_week'])) {
            return StudentAppointmentAgenda::url($context['agenda_week'], $context['agenda_service'] ?? null);
        }

        if (isset($context['dossier_academic'])) {
            return $this->dossierUrl((int) $context['dossier_academic'], $context['records_page'] ?? null);
        }

        $context['ticket'] = $context['queue_ticket'] ?? null;
        unset($context['queue_ticket'], $context['records_page'], $context['agenda_service']);

        return route(self::ROUTES.'index', ['tab' => 'requests'] + $context);
    }

    private function dossierUrl(int $entry, ?int $page = null): string
    {
        return route(self::ROUTES.'show', ['academic' => $entry, 'section' => 'Demandes', 'records_page' => $page]);
    }
}
