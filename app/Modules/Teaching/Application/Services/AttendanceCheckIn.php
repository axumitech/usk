<?php

namespace App\Modules\Teaching\Application\Services;

use App\Models\Student\AcademicAttendance;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicSession;
use App\Models\Student\StudentNfcCard;
use App\Models\User;
use App\Modules\Student\Application\Services\Audit;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class AttendanceCheckIn
{
    public function __construct(private AttendanceAccess $access, private CourseAudience $audience) {}

    public function qrEnrollment(AcademicSession $session, User $student): AcademicEnrollment
    {
        abort_unless($student->hasRole('student'), 403);

        $entries = $this->eligible($session)->whereHas('profile', fn ($profile) => $profile->where('user_id', $student->id))
            ->limit(2)->get();
        abort_if($entries->isEmpty(), 403, 'Ce cours ne figure pas dans votre inscription pour cette séance.');
        abort_if($entries->count() > 1, 409, 'Plusieurs inscriptions correspondent à cette séance. Demandez à l’enseignant de vérifier votre feuille d’appel.');

        return $entries->first();
    }

    public function byQr(AcademicSession $session, User $student): array
    {
        return DB::transaction(function () use ($session, $student) {
            $locked = AcademicSession::lockForUpdate()->findOrFail($session->id);
            $this->requireOpen($locked);

            return $this->record($locked, $this->qrEnrollment($locked, $student), $student, 'qr');
        }, 3);
    }

    public function byNfc(AcademicSession $session, User $teacher, string $uid): array
    {
        $fingerprint = StudentNfcCard::fingerprint($uid);

        return DB::transaction(function () use ($session, $teacher, $fingerprint) {
            $locked = AcademicSession::lockForUpdate()->findOrFail($session->id);
            $this->access->authorize($teacher, $locked);
            $this->requireOpen($locked);

            $card = StudentNfcCard::where('uid_hash', $fingerprint)->lockForUpdate()->first();
            if (! $card) {
                throw ValidationException::withMessages(['uid' => 'Cette carte NFC n’est pas associée à une inscription.']);
            }
            $entry = $this->eligible($locked)->find($card->academic_enrollment_id);
            if (! $entry) {
                throw ValidationException::withMessages(['uid' => 'Cette carte ne correspond pas à une inscription active pour cette séance.']);
            }

            return $this->record($locked, $entry, $teacher, 'nfc');
        }, 3);
    }

    public function requireOpen(AcademicSession $session): void
    {
        abort_unless($this->access->checkInIsOpen($session), 422, 'Le pointage est ouvert uniquement pendant une séance publiée et en cours.');
    }

    private function eligible(AcademicSession $session): Builder
    {
        return $this->audience->roster($session->offering, $session->starts_at)
            ->where('enrollment_status', 'confirmed')
            ->whereHas('profile', fn ($profile) => $profile->where('student_status', 'active'))
            ->whereHas('application', fn ($application) => $application->where('status', 'validated'))
            ->with('profile.user');
    }

    private function record(AcademicSession $session, AcademicEnrollment $entry, User $actor, string $source): array
    {
        $attendance = AcademicAttendance::where('academic_session_id', $session->id)
            ->where('academic_enrollment_id', $entry->id)->first();
        $duplicate = $attendance !== null;
        if ($duplicate) {
            abort_unless(in_array($attendance->status, ['present', 'late'], true), 409,
                'Un statut a déjà été saisi dans la feuille d’appel. Adressez-vous à l’enseignant pour le faire vérifier.');
        } else {
            $registrationId = $session->offering->registrations()->where('academic_enrollment_id', $entry->id)
                ->where('registered_at', '<=', $session->starts_at)
                ->where(fn ($scope) => $scope->whereNull('withdrawn_at')->orWhere('withdrawn_at', '>', $session->starts_at))
                ->value('id');
            $attendance = AcademicAttendance::create([
                'academic_session_id' => $session->id,
                'academic_enrollment_id' => $entry->id,
                'academic_course_registration_id' => $registrationId,
                'status' => 'present',
                'recorded_by' => $actor->id,
                'source' => $source,
                'checked_in_at' => now(),
            ]);
            $session->increment('attendance_revision');
            Audit::record($actor->id, 'attendance_status_changed', $attendance, data: [
                'from' => null, 'to' => 'present', 'session_id' => $session->id, 'source' => $source,
            ]);
        }

        return [
            'name' => $entry->profile->user->full_name,
            'status' => $attendance->status,
            'checked_in_at' => $attendance->checked_in_at,
            'duplicate' => $duplicate,
        ];
    }
}
