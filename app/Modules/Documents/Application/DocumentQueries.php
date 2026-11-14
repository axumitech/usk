<?php

namespace App\Modules\Documents\Application;

use App\Models\Student\AcademicEnrollment;
use App\Models\Student\OfficialDocument;
use App\Models\Student\OfficialDocumentType;
use App\Models\Student\ServiceRequest;
use App\Modules\Student\Application\Services\AcademicAccessService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Validation\ValidationException;

final class DocumentQueries
{
    public const REQUEST_VIEWS = ['all', 'enrollment', 'schooling', 'success', 'duplicate'];

    public function __construct(private AcademicAccessService $access, private DocumentFacts $facts) {}

    public function requestableTypes(AcademicEnrollment $entry): Collection
    {
        if (! $this->access->decision($entry, 'documents_request')['allowed']) {
            return new Collection;
        }
        $faculty = $entry->level->faculty;

        return OfficialDocumentType::where('faculty_id', $faculty->id)->where('university_id', $faculty->university_id)
            ->where('active', true)->whereHas('university', fn ($query) => $query->where('is_active', true))
            ->whereHas('templates', fn ($query) => $query->whereNotNull('approved_at')->whereNull('withdrawn_at'))
            ->with('university')->orderBy('name')->get()->filter(fn ($type) => $type->policy['student_request'])->values();
    }

    public function duplicateCandidates(AcademicEnrollment $entry): array
    {
        return $this->duplicates($entry, $this->requestableTypes($entry));
    }

    private function duplicates(AcademicEnrollment $entry, Collection $types, ?\Illuminate\Support\Collection $pending = null): array
    {
        $types = $types->filter(fn ($type) => $type->kind !== 'card' && $type->policy['copies']);
        if ($types->isEmpty()) {
            return [];
        }
        $documents = OfficialDocument::where('academic_enrollment_id', $entry->id)->where('status', 'issued')
            ->whereIn('official_document_type_id', $types->modelKeys())->with('request:id,document_source_result_id')
            ->latest('id')->get()->groupBy('official_document_type_id');
        $pending ??= $this->pendingTypes($entry);
        $resultsAllowed = $this->access->decision($entry, 'results_view')['allowed'];

        return $types->map(function ($type) use ($entry, $documents, $pending, $resultsAllowed) {
            if (! $documents->has($type->id)) {
                return null;
            }
            try {
                $result = $this->facts->eligible($entry, $type, true);
            } catch (ValidationException) {
                return null;
            }
            $document = $documents[$type->id]->first(fn ($row) => ($resultsAllowed || ! $row->request->document_source_result_id)
                && ($row->snapshot['official_result_reference'] ?? null) === $result?->reference);

            return $document ? [
                'id' => $document->id, 'type_id' => $type->id, 'name' => $type->name,
                'number' => $document->number, 'pending' => $pending->has($type->id),
            ] : null;
        })->filter()->values()->all();
    }

    private function pendingTypes(AcademicEnrollment $entry): \Illuminate\Support\Collection
    {
        return $entry->serviceRequests()->whereNotNull('document_pending_key')->pluck('official_document_type_id')->flip();
    }

    public function student(AcademicEnrollment $entry, string $section): array
    {
        $decision = $this->access->decision($entry, 'documents_request');
        $allowed = $decision['allowed'];
        $cards = $section === 'card';
        $types = $this->requestableTypes($entry)->filter(fn ($type) => ($type->kind === 'card') === $cards)->values();
        $requests = $cards ? $entry->serviceRequests() : ServiceRequest::whereIn('academic_enrollment_id',
            $entry->profile->enrollments()->whereHas('application', fn ($q) => $q->where('student_id', $entry->profile->user_id))->select('id')
        )->with('enrollment:id,academic_year_id', 'enrollment.academicYear:id,title');
        $requests->whereHas('documentType', fn ($q) => $q->where('kind', $cards ? '=' : '!=', 'card'));
        $documents = OfficialDocument::where('academic_enrollment_id', $entry->id)
            ->whereHas('type', fn ($q) => $q->where('kind', $cards ? '=' : '!=', 'card'));
        $issuedTypes = $types->isNotEmpty() ? (clone $documents)->distinct()->pluck('official_document_type_id')->flip() : collect();
        $pending = $cards || $types->isEmpty() ? collect() : $this->pendingTypes($entry);
        $offeredTypes = $types->map(function ($type) use ($entry, $cards, $issuedTypes, $pending) {
            $reason = null;
            $hasPending = $pending->has($type->id);
            if (! $cards) {
                if ($hasPending) {
                    $reason = 'Une demande de ce type est déjà en traitement.';
                } elseif (! $issuedTypes->has($type->id)) {
                    try {
                        $this->facts->eligible($entry, $type, true);
                    } catch (ValidationException $exception) {
                        $reason = $exception->getMessage();
                    }
                }
            }

            return [
                'id' => $type->id, 'name' => $type->name, 'kind' => $type->kind,
                'copies' => $type->policy['copies'], 'financial_gate' => $type->policy['financial_gate'],
                'unavailable_reason' => $reason, 'pending' => $hasPending,
            ];
        });

        $center = [
            'can_request' => $allowed,
            'request_reason' => $allowed ? null : $decision['reason'],
            'types' => $offeredTypes,
            'available_types' => $offeredTypes->reject(fn ($type) => $issuedTypes->has($type['id']))->values(),
            'requests' => $requests->with(['documentType', 'documentTemplate'])->latest('id')->paginate(15, ['*'], 'document_requests_page')->withQueryString()
                ->through(fn ($row) => $this->request($row) + ($cards ? [] : ['year' => $row->enrollment?->academicYear?->title])),
        ];

        if (! $cards) {
            $center['duplicate_options'] = $this->duplicates($entry, $types, $pending);
        }

        if ($cards) {
            $resultsAllowed = $this->access->decision($entry, 'results_view')['allowed'];
            $center['documents'] = $documents->with(['type', 'request'])->latest('id')->paginate(15, ['*'], 'official_documents_page')->withQueryString()->through(fn ($document) => $this->row($document) + [
                'download' => $document->type->policy['download'] && $document->status === 'issued' &&
                    (! $document->type->policy['financial_gate'] || $allowed) && (! $document->request->document_source_result_id || $resultsAllowed)
                    ? route('dashboard.student.official-documents.download', ['academic' => $entry->id, 'document' => $document->reference]) : null,
            ]);
        }

        return $center;
    }

    public function request(ServiceRequest $request): array
    {
        return $request->only(['id', 'subject', 'status', 'response', 'document_revision', 'document_action', 'academic_enrollment_id', 'created_at']) + [
            'kind' => $request->documentType->kind, 'resubmit_allowed' => $request->documentType->policy['student_request'], 'type_id' => $request->official_document_type_id,
            'template_id' => $request->official_document_template_id,
            'signer_id' => $request->documentTemplate?->signer_id,
        ];
    }

    public function row(OfficialDocument $document): array
    {
        return $document->only(['id', 'number', 'reference', 'official_document_type_id', 'previous_id', 'academic_enrollment_id', 'issued_at', 'expires_at', 'printed_at', 'delivered_at']) + [
            'name' => $document->type->name, 'kind' => $document->type->kind, 'validity' => $document->validity(),
            'copies' => $document->type->policy['copies'], 'status' => $document->status, 'printable' => $document->type->policy['print'],
            'verify' => route('official-documents.verify', $document->reference),
        ];
    }
}
