<?php

namespace Tests\Feature;

use App\Models\Enrollment;
use App\Models\Student\StudentProfile;
use App\Models\User;
use App\Modules\Student\Application\Services\StudentAppointmentBooking;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class StudentAppointmentBookingEngineTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    private const FINANCE = 'finance-appointment';

    private const REGISTRAR = 'registrar-appointment';

    public function test_windows_validate_duration_and_overlap_and_an_empty_schedule_stays_configured(): void
    {
        $booking = app(StudentAppointmentBooking::class);
        $this->assertFalse($booking->isConfigured(self::FINANCE));
        $this->rejects(fn () => $booking->saveWindows(self::FINANCE, [$this->window(1, '08:30', '09:15')]), 'windows.0.ends_at');
        $this->rejects(fn () => $booking->saveWindows(self::FINANCE, [
            $this->window(1, '09:00', '10:00'), $this->window(1, '08:30', '09:30'),
        ]), 'windows.0.starts_at');
        $booking->saveWindows(self::FINANCE, [], 0);
        $this->assertSame(['configured' => true, 'windows' => [], 'revision' => 1], $booking->schedule(self::FINANCE));
        $this->rejects(fn () => $booking->saveWindows(self::FINANCE, [$this->window(1, '08:30', '09:30')], 0), 'expected_revision');

        $ticket = $this->studentContext()->studentProfile->enrollments()->sole()->serviceRequests()->create($this->ticket(self::FINANCE));
        $this->travelTo(Carbon::parse('2026-11-16 08:00', 'Africa/Kinshasa'));
        $this->rejects(fn () => DB::transaction(fn () => $booking->reserve($ticket, '2026-11-16', '08:30', false)));
    }

    public function test_reservations_are_exclusive_by_service_and_student_even_if_windows_shift(): void
    {
        $this->travelTo(Carbon::parse('2026-11-16 08:00', 'Africa/Kinshasa'));
        $entry = $this->studentContext()->studentProfile->enrollments()->sole();
        $otherUser = User::factory()->create();
        $otherProfile = StudentProfile::create(['user_id' => $otherUser->id, 'student_status' => 'active']);
        $otherApplication = Enrollment::create([
            'student_id' => $otherUser->id, 'level_id' => $entry->level_id, 'academic_year_id' => $entry->academic_year_id, 'status' => 'validated',
        ]);
        $otherEntry = $otherProfile->enrollments()->create([
            'application_id' => $otherApplication->id, 'level_id' => $entry->level_id, 'academic_year_id' => $entry->academic_year_id,
            'enrollment_status' => 'confirmed', 'currency' => 'USD',
        ]);
        $finance = $entry->serviceRequests()->create($this->ticket(self::FINANCE));
        $registrar = $entry->serviceRequests()->create($this->ticket(self::REGISTRAR));
        $otherFinance = $otherEntry->serviceRequests()->create($this->ticket(self::FINANCE));
        $booking = app(StudentAppointmentBooking::class);
        $booking->saveWindows(self::FINANCE, [$this->window(1, '08:30', '10:30')]);
        $booking->saveWindows(self::REGISTRAR, [$this->window(1, '08:30', '10:30')]);
        DB::transaction(fn () => $booking->reserve($finance, '2026-11-16', '09:00'));
        $this->assertDatabaseHas('student_appointment_reservations', [
            'student_service_request_id' => $finance->id, 'service' => self::FINANCE, 'starts_at' => '2026-11-16 08:00:00',
        ]);
        $this->rejects(fn () => DB::transaction(fn () => $booking->reserve($otherFinance, '2026-11-16', '09:00')));
        $this->rejects(fn () => DB::transaction(fn () => $booking->reserve($registrar, '2026-11-16', '09:00')));
        $this->assertSame(['08:30', '09:30', '10:00'], array_column($booking->slots(self::REGISTRAR, '2026-11-16', studentProfile: $entry->student_profile_id), 'time'));

        $booking->saveWindows(self::FINANCE, [$this->window(1, '08:45', '10:45')]);
        DB::transaction(fn () => $booking->reserve($finance, '2026-11-16', '09:00'));
        $this->assertSame(['09:45', '10:15'], array_column($booking->slots(self::FINANCE, '2026-11-16'), 'time'));
        $this->rejects(fn () => DB::transaction(fn () => $booking->reserve($otherFinance, '2026-11-16', '09:15')));
        $this->assertSame('09:00', $booking->reservation($finance)['time']);

        DB::transaction(fn () => $booking->reserve($finance, '2026-11-16', '10:15'));
        DB::transaction(fn () => $booking->reserve($otherFinance, '2026-11-16', '09:15'));
        $this->rejects(fn () => DB::transaction(fn () => $booking->reserve($finance, '2026-11-16', '09:15')));
        $this->assertSame('10:15', $booking->reservation($finance)['time']);
        DB::transaction(fn () => $booking->release($otherFinance));
        $this->assertNull($booking->reservation($otherFinance));
        DB::transaction(fn () => $booking->reserve($finance, '2026-11-16', '09:15'));
        $this->assertSame('09:15', $booking->reservation($finance)['time']);
        $this->assertSame(['08:45', '09:45', '10:15'], array_column($booking->slots(self::FINANCE, '2026-11-16'), 'time'));
    }

    public function test_legacy_confirmed_slots_block_overlap_and_only_future_published_dates_are_offered(): void
    {
        $this->travelTo(Carbon::parse('2026-11-16 08:45', 'Africa/Kinshasa'));
        $entry = $this->studentContext()->studentProfile->enrollments()->sole();
        $entry->serviceRequests()->create([
            'status' => 'resolved', 'appointment_starts_at' => '2026-11-16 08:10:00', 'appointment_confirmed_at' => now(),
        ] + $this->ticket(self::FINANCE));
        $ticket = $entry->serviceRequests()->create($this->ticket(self::FINANCE));
        $booking = app(StudentAppointmentBooking::class);
        $booking->saveWindows(self::FINANCE, [$this->window(1, '08:30', '10:30')]);
        $this->assertSame([['date' => '2026-11-16', 'time' => '10:00', 'end_time' => '10:30']], $booking->slots(self::FINANCE, '2026-11-16'));
        $this->rejects(fn () => DB::transaction(fn () => $booking->reserve($ticket, '2026-11-16', '09:30')));
        $this->rejects(fn () => DB::transaction(fn () => $booking->reserve($ticket, '2026-11-16', '08:30')));
        $this->rejects(fn () => DB::transaction(fn () => $booking->reserve($ticket, '2026-12-14', '10:00')));
        $this->assertSame([], $booking->slots(self::FINANCE, '2026-12-14'));
    }

    private function window(int $weekday, string $start, string $end): array
    {
        return ['weekday' => $weekday, 'starts_at' => $start, 'ends_at' => $end];
    }

    private function ticket(string $procedure): array
    {
        return ['category' => 'appointment', 'procedure' => $procedure, 'subject' => 'Demande de rendez-vous', 'body' => 'Motif à examiner.'];
    }

    private function rejects(callable $action, string $field = 'appointment_slot'): void
    {
        try {
            $action();
            $this->fail('Une erreur de validation est attendue.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey($field, $exception->errors());
        }
    }
}
