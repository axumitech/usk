<?php

namespace App\Modules\Student\Application\Services;

use App\Models\Student\ServiceRequest;
use App\Models\Student\StudentAppointmentReservation;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use stdClass;

final class StudentAppointmentBooking
{
    public const SLOT_MINUTES = 30;

    public const BOOKING_DAYS = 28;

    private const OTHER = 'other-appointment';

    private const ZONE = StudentRequestService::APPOINTMENT_ZONE;

    public static function service(?string $procedure): string
    {
        return isset(StudentAppointmentAgenda::services()[$procedure]) ? $procedure : self::OTHER;
    }

    public function schedule(string $service): array
    {
        $row = DB::table('student_appointment_schedules')->where('service', $service)->first();

        return [
            'configured' => $row?->windows !== null,
            'windows' => $this->decodeWindows($row),
            'revision' => (int) ($row?->revision ?? 0),
        ];
    }

    public function isConfigured(string $service): bool
    {
        return DB::table('student_appointment_schedules')->where('service', $service)->whereNotNull('windows')->exists();
    }

    public function saveWindows(string $service, array $windows, ?int $expectedRevision = null): void
    {
        $windows = $this->normalizeWindows($windows);

        DB::transaction(function () use ($service, $windows, $expectedRevision) {
            $schedule = $this->lockService($service);
            if ($expectedRevision !== null && $expectedRevision !== (int) $schedule->revision) {
                throw ValidationException::withMessages(['expected_revision' => 'Les disponibilités ont été modifiées. Actualisez la page avant de réessayer.']);
            }
            if ($schedule->windows !== null && $windows === $this->decodeWindows($schedule)) {
                return;
            }

            DB::table('student_appointment_schedules')->where('service', $service)->update([
                'windows' => json_encode($windows, JSON_THROW_ON_ERROR),
                'revision' => $schedule->revision + 1,
            ]);
        }, 3);
    }

    public function slots(string $service, ?string $date = null, ?int $exceptTicket = null, ?int $studentProfile = null): array
    {
        $windows = $this->schedule($service)['windows'];
        if ($windows === []) {
            return [];
        }

        $now = CarbonImmutable::now(self::ZONE);
        $today = $now->startOfDay();
        $start = $date === null ? $today : CarbonImmutable::parse($date, self::ZONE)->startOfDay();
        $end = $today->addDays(self::BOOKING_DAYS);
        if ($start->lt($today) || $start->gte($end)) {
            return [];
        }
        if ($date !== null) {
            $end = $start->addDay();
        }

        $rangeStart = $start->subMinutes(self::SLOT_MINUTES)->utc();
        $rangeEnd = $end->utc();
        $occupied = $this->reservationQuery($service, $studentProfile, $exceptTicket, $rangeStart, $rangeEnd)->pluck('starts_at')
            ->merge($this->legacyQuery($service, $studentProfile, $exceptTicket, $rangeStart, $rangeEnd)->pluck('appointment_starts_at'))
            ->map(fn ($value) => CarbonImmutable::parse($value, 'UTC')->getTimestamp())
            ->sort()->values();
        $occupiedIndex = 0;
        $windowsByDay = collect($windows)->groupBy('weekday');
        $slots = [];

        for ($day = $start; $day->lt($end); $day = $day->addDay()) {
            foreach ($windowsByDay->get($day->isoWeekday(), []) as $window) {
                $first = $day->setTimeFromTimeString($window['starts_at']);
                $last = $day->setTimeFromTimeString($window['ends_at']);
                for ($slot = $first; $slot->lt($last); $slot = $slot->addMinutes(self::SLOT_MINUTES)) {
                    if ($slot->lte($now)) {
                        continue;
                    }
                    $slotStarts = $slot->getTimestamp();
                    $slotEnds = $slotStarts + self::SLOT_MINUTES * 60;
                    while (isset($occupied[$occupiedIndex]) && $slotStarts >= $occupied[$occupiedIndex] + self::SLOT_MINUTES * 60) {
                        $occupiedIndex++;
                    }
                    if (! isset($occupied[$occupiedIndex]) || $occupied[$occupiedIndex] >= $slotEnds) {
                        $slots[] = $this->slot($slot);
                    }
                }
            }
        }

        return $slots;
    }

    /** The request and its reservation are updated in the same transaction. */
    public function reserve(ServiceRequest $ticket, string $date, string $time, bool $requireAvailability = true): void
    {
        $service = self::service($ticket->procedure);
        $studentProfile = $ticket->enrollment->student_profile_id;
        $startsAt = CarbonImmutable::createFromFormat('!Y-m-d H:i', $date.' '.$time, self::ZONE);
        $utc = $startsAt->utc();
        $now = CarbonImmutable::now(self::ZONE);
        $this->lockStudent($studentProfile);
        $schedule = $this->lockService($service);

        $reservation = $ticket->appointmentReservation()->lockForUpdate()->first();
        if ($reservation?->starts_at->equalTo($utc)) {
            return;
        }

        if ($startsAt->lte($now)) {
            $this->unavailable();
        }
        if ($requireAvailability || $schedule->windows !== null) {
            if ($startsAt->gte($now->startOfDay()->addDays(self::BOOKING_DAYS))
                || ! $this->fitsWindow($startsAt, $this->decodeWindows($schedule))) {
                $this->unavailable();
            }
        }

        $rangeStart = $utc->subMinutes(self::SLOT_MINUTES);
        $rangeEnd = $utc->addMinutes(self::SLOT_MINUTES);
        if ($this->reservationQuery($service, $studentProfile, $ticket->id, $rangeStart, $rangeEnd)->lockForUpdate()->first(['starts_at'])
            || $this->legacyQuery($service, $studentProfile, $ticket->id, $rangeStart, $rangeEnd)->exists()) {
            $this->unavailable();
        }

        try {
            $ticket->appointmentReservation()->updateOrCreate([], [
                'student_profile_id' => $studentProfile,
                'service' => $service,
                'starts_at' => $utc,
            ]);
        } catch (UniqueConstraintViolationException) {
            $this->unavailable();
        }
        $ticket->unsetRelation('appointmentReservation');
    }

    public function release(ServiceRequest $ticket): void
    {
        $ticket->appointmentReservation()->delete();
        $ticket->unsetRelation('appointmentReservation');
    }

    public function reservation(ServiceRequest $ticket): ?array
    {
        if ($ticket->category !== 'appointment' || $ticket->appointment_cancelled_at) {
            return null;
        }

        $startsAt = $ticket->appointmentReservation?->starts_at;

        return $startsAt ? $this->slot($startsAt->setTimezone(self::ZONE)) : null;
    }

    public function beginWrite(int $studentProfile): void
    {
        // SQLite must acquire its write lock before reading to avoid a snapshot upgrade during a concurrent booking.
        if (DB::getDriverName() === 'sqlite') {
            $this->lockStudent($studentProfile);
        }
    }

    private function lockStudent(int $studentProfile): void
    {
        $table = DB::table('student_appointment_profile_locks');
        $table->insertOrIgnore(['student_profile_id' => $studentProfile]);
        $table->where('student_profile_id', $studentProfile)->lockForUpdate()->first();
    }

    private function lockService(string $service): stdClass
    {
        abort_unless(isset(StudentAppointmentAgenda::services()[$service]), 404);
        $table = DB::table('student_appointment_schedules');
        $table->insertOrIgnore(['service' => $service]);

        return $table->where('service', $service)->lockForUpdate()->first();
    }

    private function decodeWindows(?stdClass $schedule): array
    {
        return $schedule?->windows !== null ? json_decode($schedule->windows, true, flags: JSON_THROW_ON_ERROR) : [];
    }

    private function normalizeWindows(array $windows): array
    {
        $ordered = [];
        foreach ($windows as $index => $window) {
            $start = $window['starts_at'];
            $end = $window['ends_at'];
            $duration = $this->minutes($end) - $this->minutes($start);
            if ($duration <= 0 || $duration % self::SLOT_MINUTES !== 0) {
                throw ValidationException::withMessages([
                    "windows.{$index}.ends_at" => 'La fin doit suivre le début et la plage doit contenir des créneaux complets de 30 minutes.',
                ]);
            }
            $ordered[] = ['index' => $index, 'weekday' => (int) $window['weekday'], 'starts_at' => $start, 'ends_at' => $end];
        }
        usort($ordered, fn ($left, $right) => [$left['weekday'], $left['starts_at']] <=> [$right['weekday'], $right['starts_at']]);
        $previous = null;
        foreach ($ordered as &$window) {
            if ($previous && $previous['weekday'] === $window['weekday'] && $window['starts_at'] < $previous['ends_at']) {
                throw ValidationException::withMessages(["windows.{$window['index']}.starts_at" => 'Deux plages du même jour se chevauchent.']);
            }
            unset($window['index']);
            $previous = $window;
        }

        return $ordered;
    }

    private function fitsWindow(CarbonImmutable $startsAt, array $windows): bool
    {
        $minute = $startsAt->hour * 60 + $startsAt->minute;
        foreach ($windows as $window) {
            $first = $this->minutes($window['starts_at']);
            $last = $this->minutes($window['ends_at']);
            if ($window['weekday'] === $startsAt->isoWeekday() && $minute >= $first && $minute + self::SLOT_MINUTES <= $last
                && ($minute - $first) % self::SLOT_MINUTES === 0) {
                return true;
            }
        }

        return false;
    }

    private function minutes(string $time): int
    {
        [$hours, $minutes] = explode(':', $time);

        return (int) $hours * 60 + (int) $minutes;
    }

    private function reservationQuery(string $service, ?int $studentProfile, ?int $exceptTicket, CarbonImmutable $start, CarbonImmutable $end): Builder
    {
        return StudentAppointmentReservation::query()
            ->where(fn ($query) => $query->where('service', $service)
                ->when($studentProfile, fn ($scope) => $scope->orWhere('student_profile_id', $studentProfile)))
            ->when($exceptTicket, fn ($query) => $query->whereKeyNot($exceptTicket))
            ->where('starts_at', '>', $start)->where('starts_at', '<', $end);
    }

    private function legacyQuery(string $service, ?int $studentProfile, ?int $exceptTicket, CarbonImmutable $start, CarbonImmutable $end): Builder
    {
        $dedicatedServices = array_diff(array_keys(StudentAppointmentAgenda::services()), [self::OTHER]);

        return ServiceRequest::query()->where('category', 'appointment')->where('status', 'resolved')
            ->whereNotNull('appointment_confirmed_at')->whereNull('appointment_cancelled_at')
            ->whereDoesntHave('appointmentReservation')
            ->when($exceptTicket, fn ($query) => $query->whereKeyNot($exceptTicket))
            ->where('appointment_starts_at', '>', $start)->where('appointment_starts_at', '<', $end)
            ->where(function ($query) use ($service, $dedicatedServices, $studentProfile) {
                $query->where(fn ($scope) => $service === self::OTHER
                    ? $scope->whereNull('procedure')->orWhereNotIn('procedure', $dedicatedServices)
                    : $scope->where('procedure', $service));
                if ($studentProfile !== null) {
                    $query->orWhereHas('enrollment', fn ($entry) => $entry->where('student_profile_id', $studentProfile));
                }
            });
    }

    private function slot(CarbonImmutable $startsAt): array
    {
        return [
            'date' => $startsAt->toDateString(),
            'time' => $startsAt->format('H:i'),
            'end_time' => $startsAt->addMinutes(self::SLOT_MINUTES)->format('H:i'),
        ];
    }

    private function unavailable(): never
    {
        throw ValidationException::withMessages(['appointment_slot' => 'Ce créneau n’est plus disponible. Choisissez un autre horaire.']);
    }
}
