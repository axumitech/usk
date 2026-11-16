<?php

namespace App\Modules\Teaching\Infrastructure\Http\Controllers;

use App\Models\Student\AcademicAttendance;
use App\Models\Student\AcademicSession;
use App\Modules\Student\Application\Services\AcademicAccessService;
use App\Modules\Teaching\Application\Services\AttendanceAccess;
use App\Modules\Teaching\Application\Services\AttendanceCheckIn;
use BaconQrCode\Renderer\GDLibRenderer;
use BaconQrCode\Writer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

final class AttendanceCheckInController
{
    public function __construct(private AttendanceAccess $access, private AttendanceCheckIn $checkIn) {}

    public function qr(Request $request, AcademicSession $session): JsonResponse
    {
        $this->access->authorize($request->user(), $session);
        $this->checkIn->requireOpen($session);

        $expiresAt = now()->addMinutes(2)->min($session->ends_at);
        $url = URL::temporarySignedRoute('dashboard.student.attendance.check-in', $expiresAt, ['session' => $session->id]);
        $image = (new Writer(new GDLibRenderer(520)))->writeString($url);

        return response()->json([
            'image' => 'data:image/png;base64,'.base64_encode($image),
            'expires_at' => $expiresAt,
        ])->header('Cache-Control', 'private, no-store');
    }

    public function nfc(Request $request, AcademicSession $session): JsonResponse
    {
        $this->access->authorize($request->user(), $session);
        $input = $request->validate(['uid' => 'required|string|max:64']);

        return response()->json($this->checkIn->byNfc($session, $request->user(), $input['uid']))->header('Cache-Control', 'private, no-store');
    }

    public function show(Request $request, AcademicSession $session, AcademicAccessService $studentAccess): Response
    {
        $this->validateQr($request);
        $this->checkIn->requireOpen($session);
        $entry = $this->checkIn->qrEnrollment($session, $request->user());
        $attendance = AcademicAttendance::where('academic_session_id', $session->id)->where('academic_enrollment_id', $entry->id)->first();

        return Inertia::render('dashboard/student/AttendanceCheckIn', [
            'course' => $session->offering->curriculumItem?->name ?? $session->offering->course->title,
            'startsAt' => $session->starts_at,
            'submitUrl' => $request->getRequestUri(),
            'attendanceUrl' => $studentAccess->decision($entry, 'schedule_view')['allowed']
                ? route('dashboard.student.attendance', ['academic' => $entry->id], false) : null,
            'existing' => $attendance ? ['status' => $attendance->status, 'checked_in_at' => $attendance->checked_in_at] : null,
        ])->toResponse($request)->header('Cache-Control', 'private, no-store')->header('Referrer-Policy', 'no-referrer');
    }

    public function confirm(Request $request, AcademicSession $session): JsonResponse
    {
        $this->validateQr($request);

        return response()->json($this->checkIn->byQr($session, $request->user()))->header('Cache-Control', 'private, no-store');
    }

    private function validateQr(Request $request): void
    {
        abort_unless($request->hasValidSignature(), 403, 'Ce QR code a expiré ou est invalide. Scannez le code affiché par l’enseignant.');
    }
}
