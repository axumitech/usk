<?php

namespace App\Modules\Teaching\Infrastructure\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Student\AcademicAttendance;
use App\Models\Student\AcademicSession;
use App\Modules\Student\Application\Services\Audit;
use App\Modules\Teaching\Application\Services\AttendanceAccess;
use App\Modules\Teaching\Application\Services\CourseAudience;
use App\Modules\Teaching\Application\Services\TeacherDashboard;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

class AttendanceController extends Controller
{
    public function __construct(private AttendanceAccess $access, private CourseAudience $audience) {}

    public function show(Request $request, AcademicSession $session, TeacherDashboard $dashboard)
    {
        $actor = $request->user();
        $this->access->authorize($actor, $session);
        $session->load(['offering.course', 'offering.curriculumItem', 'offering.level', 'offering.academicYear', 'registeredRoom:id,name,building']);
        $students = $this->audience->roster($session->offering, $session->starts_at)->with('profile.user')->orderBy('matricule')->orderBy('id')
            ->paginate(50)->withQueryString();
        $records = AcademicAttendance::where('academic_session_id', $session->id)
            ->whereIn('academic_enrollment_id', $students->getCollection()->pluck('id'))
            ->get(['academic_enrollment_id', 'status', 'source', 'checked_in_at'])->keyBy('academic_enrollment_id');
        $data = $students->through(fn ($entry) => CourseAudience::studentRow($entry) + [
            'status' => $records->get($entry->id)?->status ?? '',
            'source' => $records->get($entry->id)?->source,
            'checked_in_at' => $records->get($entry->id)?->checked_in_at,
        ]);
        $admin = $actor->hasRole('admin');
        $room = $session->room ?: $session->registeredRoom?->name;
        $location = collect([$session->registeredRoom?->building, $room])->filter()->unique()->join(' · ');
        $context = $admin ? [] : $this->scheduleContext($request, $session, $dashboard);

        return Inertia::render('dashboard/schedule/Attendance', [
            'session' => ['id' => $session->id, 'title' => $session->offering->curriculumItem?->name ?? $session->offering->course->title,
                'level' => $session->offering->level->title, 'year' => $session->offering->academicYear->title, 'starts_at' => $session->starts_at, 'ends_at' => $session->ends_at, 'room' => $location],
            'canRecord' => $this->access->canRecord($actor, $session),
            'checkIn' => ! $admin && $this->access->checkInIsOpen($session) ? [
                'qr_url' => route('dashboard.teaching.attendance.qr', $session, false),
                'nfc_url' => route('dashboard.teaching.attendance.nfc', $session, false),
            ] : null,
            'closed' => (bool) $session->attendance_closed_at || $session->offering->academicYear->status === 'closed',
            'revision' => $session->attendance_revision,
            'students' => $data->items(), 'pagination' => ['links' => $data->linkCollection()],
            'teacher' => ! $admin,
            'returnUrl' => isset($context['week']) ? $dashboard->scheduleSessionUrl($session, array_diff_key($context, ['page' => true])) : null,
            'saveUrl' => $admin ? null : route('dashboard.teaching.attendance.save', ['session' => $session->id] + $context, false),
        ]);
    }

    public function save(Request $request, AcademicSession $session, TeacherDashboard $dashboard)
    {
        $this->access->authorize($request->user(), $session);
        $input = $request->validate([
            'records' => 'required|array|min:1|max:1000', 'records.*.id' => 'required|integer|distinct',
            'records.*.status' => 'required|in:present,absent,late,excused',
            'revision' => 'nullable|integer|min:0', 'reason' => 'nullable|string|min:5|max:1000',
        ]);
        DB::transaction(function () use ($session, $request, $input) {
            $session = AcademicSession::lockForUpdate()->findOrFail($session->id);
            $actor = $request->user();
            $this->access->authorize($actor, $session);
            abort_if(! $session->is_published || $session->cancelled_at || $session->starts_at->isFuture(), 422, 'L’appel exige une séance publiée et commencée.');
            abort_unless($this->access->canRecord($actor, $session), 403);
            $closed = $session->attendance_closed_at || $session->offering->academicYear->status === 'closed';
            if ($closed && (! isset($input['reason'], $input['revision']))) {
                throw ValidationException::withMessages(['reason' => 'Une correction après clôture exige un motif et une version à jour.']);
            }
            $ids = array_column($input['records'], 'id');
            $eligible = $this->audience->roster($session->offering, $session->starts_at)->whereIn('id', $ids)->pluck('id');
            if ($eligible->count() !== count($ids)) {
                throw ValidationException::withMessages(['records' => 'Un étudiant ne fait pas partie du public de la séance.']);
            }
            $records = AcademicAttendance::where('academic_session_id', $session->id)->whereIn('academic_enrollment_id', $ids)
                ->with('justification:id,academic_attendance_id')->get()->keyBy('academic_enrollment_id');
            $changes = array_filter($input['records'], fn ($row) => $records->get($row['id'])?->status !== $row['status']);
            if (! $changes) {
                return;
            }
            if (isset($input['revision']) && (int) $input['revision'] !== $session->attendance_revision) {
                throw ValidationException::withMessages(['revision' => 'L’appel a changé. Rechargez la page avant de corriger.']);
            }
            $registrations = $session->offering->registrations()->whereIn('academic_enrollment_id', $ids)
                ->where('registered_at', '<=', $session->starts_at)->where(fn ($q) => $q->whereNull('withdrawn_at')->orWhere('withdrawn_at', '>', $session->starts_at))
                ->pluck('id', 'academic_enrollment_id');
            foreach ($changes as $change) {
                $record = $records->get($change['id']);
                if ($record?->justification) {
                    throw ValidationException::withMessages(['records' => 'Une absence avec justificatif conserve son constat initial.']);
                }
                if ($change['status'] === 'excused' && ! $actor->hasRole('admin')) {
                    throw ValidationException::withMessages(['records' => 'La qualification administrative relève du service habilité.']);
                }
                $before = $record?->status;
                $record ??= new AcademicAttendance(['academic_session_id' => $session->id, 'academic_enrollment_id' => $change['id']]);
                $record->fill(['status' => $change['status'], 'recorded_by' => $actor->id, 'academic_course_registration_id' => $registrations->get($change['id'])])->save();
                Audit::record($actor->id, 'attendance_status_changed', $record, $input['reason'] ?? null, ['from' => $before, 'to' => $record->status, 'session_id' => $session->id]);
            }
            $session->increment('attendance_revision');
            Audit::record($actor->id, 'attendance_recorded', $session, $input['reason'] ?? null, ['count' => count($changes)]);
        }, 3);

        $redirect = $request->user()->hasRole('admin') ? back() : to_route('dashboard.teaching.attendance',
            ['session' => $session->id] + $this->scheduleContext($request, $session, $dashboard, acceptPrevious: true), 303);

        return $redirect->with('success', 'Présences enregistrées.');
    }

    private function scheduleContext(Request $request, AcademicSession $session, TeacherDashboard $dashboard, bool $acceptPrevious = false): array
    {
        $query = $request->query();
        if ($acceptPrevious && ! $query) {
            $previous = parse_url(url()->previous());
            if (($previous['path'] ?? null) === route('dashboard.teaching.attendance', $session->id, false)) {
                parse_str($previous['query'] ?? '', $query);
            }
        }
        $validator = Validator::make($query, [
            'week' => 'nullable|date_format:Y-m-d', 'day' => 'nullable|date_format:Y-m-d',
            'semester' => 'nullable|in:all,1,2', 'page' => 'nullable|integer|min:1',
        ]);
        if ($validator->fails()) {
            return [];
        }
        $context = $validator->validated();

        return $dashboard->attendanceScheduleContext($session, $context) + (isset($context['page']) ? ['page' => (int) $context['page']] : []);
    }
}
