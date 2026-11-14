<?php

namespace App\Modules\Student\Application\Services;

use App\Mail\TransactionalEmail;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\ServiceRequest;
use App\Models\User;
use Carbon\CarbonImmutable;

final class StudentAppointmentAgenda
{
    private const OTHER = 'other-appointment';

    private const ROUTES = 'dashboard.admin.student-academic.';

    public static function services(): array
    {
        $procedures = config('student_services.appointments.procedures', []);

        return array_map(fn (array $procedure) => $procedure[2], $procedures);
    }

    public function week(User $actor, ?string $date, ?string $service): array
    {
        $timezone = StudentRequestService::APPOINTMENT_ZONE;
        $today = CarbonImmutable::today($timezone);
        $start = ($date ? CarbonImmutable::parse($date, $timezone) : $today)->startOfWeek(CarbonImmutable::MONDAY);
        $next = $start->addWeek();
        $services = self::services();
        $dedicatedServices = array_keys(array_diff_key($services, [self::OTHER => true]));
        $scope = AcademicStaffScope::apply(AcademicEnrollment::query(), $actor)->select('academic_enrollments.id');
        $backContext = array_filter(['agenda_week' => $start->toDateString(), 'agenda_service' => $service]);

        $appointments = ServiceRequest::query()
            ->with(['enrollment.profile.user'])
            ->whereIn('academic_enrollment_id', $scope)
            ->where('category', 'appointment')
            ->where('status', 'resolved')
            ->whereNotNull('appointment_confirmed_at')
            ->whereNull('appointment_cancelled_at')
            ->where('appointment_starts_at', '>=', $start->utc())
            ->where('appointment_starts_at', '<', $next->utc())
            ->when($service === self::OTHER, fn ($query) => $query->where(fn ($other) => $other
                ->whereNull('procedure')->orWhereNotIn('procedure', $dedicatedServices)))
            ->when($service !== null && $service !== self::OTHER, fn ($query) => $query->where('procedure', $service))
            ->orderBy('appointment_starts_at')->orderBy('id')
            ->get(['id', 'academic_enrollment_id', 'category', 'subject', 'procedure', 'appointment_starts_at', 'appointment_confirmed_at', 'appointment_location'])
            ->map(function (ServiceRequest $ticket) use ($services, $backContext) {
                $entry = $ticket->enrollment;
                $slot = StudentRequestService::appointment($ticket);
                $service = isset($services[$ticket->procedure]) ? $ticket->procedure : self::OTHER;

                return [
                    'id' => $ticket->id,
                    'subject' => $ticket->subject,
                    'service' => $services[$service],
                    'service_key' => $service,
                    'date' => $slot['date'],
                    'time' => $slot['time'],
                    'location' => $slot['location'],
                    'student_name' => TransactionalEmail::recipientName($entry->profile->user),
                    'matricule' => $entry->profile->matricule ?? $entry->matricule,
                    'detail_url' => route(self::ROUTES.'requests.show', ['ticket' => $ticket->id] + $backContext),
                ];
            });

        return [
            'week' => $start->toDateString(),
            'end' => $next->subDay()->toDateString(),
            'today' => $today->toDateString(),
            'timezone' => $timezone,
            'service' => $service,
            'services' => collect($services)->map(fn (string $label, string $key) => ['key' => $key, 'label' => $label])->values(),
            'appointments' => $appointments,
            'previous_url' => self::url($start->subWeek()->toDateString(), $service),
            'next_url' => self::url($next->toDateString(), $service),
            'today_url' => self::url($today->startOfWeek(CarbonImmutable::MONDAY)->toDateString(), $service),
            'index_url' => self::url(),
            'requests_url' => route(self::ROUTES.'index', ['tab' => 'requests']),
        ];
    }

    public static function url(?string $week = null, ?string $service = null): string
    {
        return route(self::ROUTES.'requests.agenda', array_filter(compact('week', 'service')));
    }
}
