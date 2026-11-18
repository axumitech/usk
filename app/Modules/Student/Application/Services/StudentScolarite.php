<?php

namespace App\Modules\Student\Application\Services;

use App\Models\Student\AcademicEnrollment;
use App\Models\Student\ServiceRequest;
use App\Modules\Teaching\Application\Services\LearningFiles;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Throwable;

final class StudentScolarite
{
    private const CLOSED = ['resolved', 'refused', 'accepted', 'rejected', 'inadmissible', 'issued', 'withdrawn', 'revoked', 'cancelled'];

    public function __construct(
        private StudentServiceCatalog $catalog,
        private AcademicAccessService $access,
        private LearningFiles $files,
        private StudentAppointmentBooking $booking,
    ) {}

    public function page(Request $request, AcademicEnrollment $entry, array $permissions, string $section): array
    {
        $input = $request->validate([
            'category' => ['nullable', Rule::in(array_keys(config('student_services')))],
            'procedure' => 'nullable|string|max:48',
            'request' => 'nullable|integer|min:1',
            'status' => 'nullable|in:all,open,resolved',
            'requests_page' => 'nullable|integer|min:1',
        ]);
        $procedure = StudentServiceCatalog::find($input['procedure'] ?? null);
        abort_if(isset($input['procedure']) && $procedure === null, 404);
        $category = $procedure['group'] ?? $input['category'] ?? null;
        $status = $input['status'] ?? 'all';

        $query = ServiceRequest::whereBelongsTo($entry, 'enrollment');
        $totals = (clone $query)->selectRaw('status, COUNT(*) AS aggregate')->groupBy('status')->pluck('aggregate', 'status');
        $resolved = (int) $totals->only(self::CLOSED)->sum();
        $total = (int) $totals->sum();
        $relations = ['documentType', 'officialResult.run', 'appointmentReservation'];
        $selected = isset($input['request']) ? $query->with($relations)->findOrFail($input['request']) : null;
        $page = null;

        if ($section === 'requests' && ! $selected && $procedure === null) {
            $page = $query->with($relations)
                ->when($status === 'open', fn ($rows) => $rows->whereNotIn('status', self::CLOSED))
                ->when($status === 'resolved', fn ($rows) => $rows->whereIn('status', self::CLOSED))
                ->latest('id')->paginate(15, ['*'], 'requests_page')
                ->appends(['academic' => $entry->id, 'status' => $status === 'all' ? null : $status])
                ->through(fn (ServiceRequest $ticket) => $this->ticket($entry, $ticket, $permissions));
        }

        return [
            'categories' => $this->catalog->categories($entry, $permissions),
            'active_category' => $category,
            'active_procedure' => $procedure['id'] ?? null,
            'appointment_slots' => ($procedure['category'] ?? null) === 'appointment'
                ? $this->booking->slots($procedure['id'], studentProfile: $entry->student_profile_id) : [],
            'status' => $status,
            'counts' => ['total' => $total, 'open' => $total - $resolved, 'resolved' => $resolved],
            'requests' => $page ? ['data' => $page->items(), 'links' => $page->linkCollection(), 'total' => $page->total()] : ['data' => [], 'links' => [], 'total' => 0],
            'selected_request' => $selected ? $this->ticket($entry, $selected, $permissions) : null,
        ];
    }

    public function submit(AcademicEnrollment $entry, array $procedure, array $input, ?UploadedFile $file, int $actor): ServiceRequest
    {
        $facts = $file ? $this->files->inspect($file, 'material') : [];
        $appointment = $procedure['category'] === 'appointment';
        $fingerprint = hash('sha256', json_encode([
            $procedure['id'], $input['body'], $input['appointment_slot'] ?? null, null, $facts,
        ], JSON_THROW_ON_ERROR));
        $written = null;

        try {
            return DB::transaction(function () use ($entry, $procedure, $input, $file, $actor, $facts, $fingerprint, $appointment, &$written) {
                if ($appointment) {
                    $this->booking->beginWrite($entry->student_profile_id);
                }
                $entry = AcademicEnrollment::lockForUpdate()->findOrFail($entry->id);
                if (! empty($input['operation_key'])) {
                    $existing = $entry->serviceRequests()->where('request_operation_key', $input['operation_key'])->first();
                    if ($existing) {
                        if ($existing->request_operation_hash !== $fingerprint) {
                            throw ValidationException::withMessages(['operation_key' => 'Cet envoi correspond à une autre demande. Rechargez le formulaire.']);
                        }

                        return $existing;
                    }
                }

                $available = $this->catalog->forStudent($entry, $this->access->permissions($entry), $procedure);
                abort_if($available['unavailable_reason'], 403, $available['unavailable_reason'] ?? '');
                if ($available['mode'] === 'link') {
                    throw ValidationException::withMessages(['procedure' => 'Utilisez la démarche indiquée pour ce service.']);
                }
                if ($file) {
                    $this->files->store($file, $facts, $written, 'student-requests/'.$entry->id);
                }
                $ticket = $entry->serviceRequests()->create([
                    'category' => $procedure['category'], 'procedure' => $procedure['id'], 'subject' => $procedure['label'], 'body' => $input['body'],
                    'request_attachment_path' => $written, 'request_attachment_name' => $facts['filename'] ?? null,
                    'request_operation_key' => $input['operation_key'] ?? null, 'request_operation_hash' => isset($input['operation_key']) ? $fingerprint : null,
                ]);
                if ($appointment) {
                    [$date, $time] = explode('T', $input['appointment_slot']);
                    $this->booking->reserve($ticket, $date, $time);
                }
                Audit::record($actor, 'student_request_created', $ticket, data: ['procedure' => $procedure['id']]);

                return $ticket;
            }, $appointment ? 3 : 1);
        } catch (Throwable $error) {
            if ($written !== null) {
                Storage::disk('local')->delete($written);
            }
            throw $error;
        }
    }

    private function ticket(AcademicEnrollment $entry, ServiceRequest $ticket, array $permissions): array
    {
        $procedure = StudentServiceCatalog::find($ticket->procedure);
        $document = $ticket->documentType;
        $workflow = match (true) {
            $document !== null => 'document',
            $ticket->academic_official_result_id !== null => 'result',
            default => 'general',
        };
        $url = match ($workflow) {
            'document' => $this->documentLink($entry, $document->kind),
            'result' => $permissions['results_view']['allowed'] && $ticket->officialResult?->run?->state === 'published' ? route(
                'dashboard.student.index', ['section' => 'results', 'academic' => $entry->id, 'official' => $ticket->officialResult->reference], false
            ) : null,
            default => null,
        };
        $group = $procedure['group'] ?? match ($ticket->category) {
            'document' => $document?->kind === 'card' ? 'identity' : 'documents',
            'appeal', 'academic' => 'academic',
            'finance' => 'finance',
            'appointment' => 'appointments',
            default => 'identity',
        };

        return $ticket->only(['id', 'category', 'procedure', 'subject', 'body', 'status', 'response', 'created_at', 'updated_at']) + [
            'category_label' => config("student_services.{$group}.label"),
            'procedure_label' => $procedure['label'] ?? $ticket->subject,
            'procedure_notice' => $procedure['notice'] ?? null,
            'service' => $procedure['service'] ?? config("student_services.{$group}.service"),
            'workflow' => $workflow,
            'status_group' => in_array($ticket->status, self::CLOSED, true) ? 'resolved' : 'open',
            'appointment_date' => $ticket->appointment_date?->toDateString(),
            'appointment_period' => $ticket->appointment_period,
            'appointment_reservation' => $ticket->category === 'appointment' ? $this->booking->reservation($ticket) : null,
            'appointment_confirmed' => StudentRequestService::appointment($ticket),
            'appointment_cancelled' => StudentRequestService::appointmentCancellation($ticket),
            'href' => $url,
            'link_label' => match ($workflow) {
                'document' => $document->kind === 'card' ? 'Ouvrir ma carte étudiante' : 'Suivre la demande documentaire',
                'result' => 'Ouvrir le résultat concerné',
                default => null,
            },
            'attachment' => $ticket->request_attachment_path ? [
                'name' => $ticket->request_attachment_name,
                'url' => route('dashboard.student.requests.attachment', ['ticket' => $ticket->id, 'academic' => $entry->id], false),
            ] : null,
        ];
    }

    private function documentLink(AcademicEnrollment $entry, string $kind): string
    {
        if ($kind === 'card') {
            return route('dashboard.student.index', ['section' => 'card', 'academic' => $entry->id], false);
        }

        return route('dashboard.student.index', ['section' => 'documents', 'academic' => $entry->id, 'category' => 'official'], false).'#student-document-requests-heading';
    }
}
