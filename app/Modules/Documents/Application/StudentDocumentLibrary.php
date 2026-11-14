<?php

namespace App\Modules\Documents\Application;

use App\Models\EnrollmentDocument;
use App\Models\Student\AbsenceJustification;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicOfficialResult;
use App\Models\Student\AcademicResource;
use App\Models\Student\AcademicSubmission;
use App\Models\Student\CardIssuance;
use App\Models\Student\OfficialDocument;
use App\Models\Student\StudentPayment;
use App\Modules\Assessment\Application\AssessmentAccess;
use App\Modules\Enrollment\Domain\Enums\EnrollmentStatus;
use App\Modules\Results\Application\StudentResultPeriods;
use App\Modules\Student\Application\Services\AcademicAccessService;
use App\Modules\Teaching\Application\Services\LearningAccess;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as Query;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class StudentDocumentLibrary
{
    public const CATEGORIES = ['all', 'admissions', 'official', 'receipts', 'academic'];

    public function __construct(private AcademicAccessService $access, private AssessmentAccess $assessment, private DocumentFacts $facts) {}

    public static function filter(mixed $value): string
    {
        return in_array($value, self::CATEGORIES, true) ? $value : 'all';
    }

    public function forStudent(AcademicEnrollment $selected, string $filter): array
    {
        $profile = $selected->profile;
        $entries = $profile->enrollments()->whereHas('application', fn ($q) => $q->where('student_id', $profile->user_id))
            ->with(['academicYear:id,title,status', 'application:id,status', 'level:id,faculty_id', 'level.faculty:id,university_id'])
            ->get()->each(fn ($entry) => $entry->setRelation('profile', $profile))->keyBy('id');

        $permissions = in_array($filter, ['all', 'official', 'academic'], true)
            ? $entries->map(fn ($entry) => $this->access->permissions($entry))
            : collect();
        $sources = [];

        if (in_array($filter, ['all', 'admissions'], true)) {
            $sources[] = $this->source(
                EnrollmentDocument::where('review_status', 'accepted')->where('is_temp', false)
                    ->whereHas('enrollment', fn ($q) => $q->where('student_id', $profile->user_id)->where('status', EnrollmentStatus::VALIDATED)),
                'admission', '0', 'COALESCE(verified_at, updated_at)'
            );
        }

        if (in_array($filter, ['all', 'official'], true)) {
            $sources[] = $this->source(
                OfficialDocument::whereIn('academic_enrollment_id', $entries->keys())
                    ->where(fn ($q) => $q->whereNotNull('delivered_at')->orWhereHas('type', fn ($type) => $type->where('kind', '!=', 'card'))),
                'official', 'academic_enrollment_id', 'issued_at'
            );
            $sources[] = $this->source(
                CardIssuance::whereIn('academic_enrollment_id', $entries->keys())->whereNotNull('collected_at')->whereNull('replaced_by_official_id'),
                'legacy_card', 'academic_enrollment_id', 'collected_at'
            );
        }

        if (in_array($filter, ['all', 'receipts'], true)) {
            $sources[] = $this->source(
                StudentPayment::whereIn('academic_enrollment_id', $entries->keys())->whereNotNull('confirmed_at'),
                'receipt', 'academic_enrollment_id', 'confirmed_at'
            );
        }

        if (in_array($filter, ['all', 'academic'], true)) {
            array_push($sources, ...$this->resultSources($permissions));
            $sources[] = $this->source(
                AcademicSubmission::whereIn('academic_enrollment_id', $entries->keys()),
                'submission', 'academic_enrollment_id', 'updated_at'
            );
            $sources[] = $this->source(
                AbsenceJustification::whereNotNull('path')
                    ->join('academic_attendances', 'academic_attendances.id', '=', 'academic_absence_justifications.academic_attendance_id')
                    ->whereIn('academic_attendances.academic_enrollment_id', $entries->keys()),
                'absence', 'academic_attendances.academic_enrollment_id', 'academic_absence_justifications.updated_at'
            );
            foreach ($entries as $entry) {
                $rights = $permissions[$entry->id];
                $kinds = [];
                if ($rights['documents_request']['visible'] ?? true) {
                    $kinds[] = 'document';
                }
                if ($rights['results_view']['allowed']) {
                    $kinds[] = 'result';
                }
                if ($rights['courses_view']['allowed'] && $kinds !== []) {
                    $resources = AcademicResource::visible()->forStudent($entry)->forLearningPermissions($rights)
                        ->whereIn('kind', $kinds)->whereIn('academic_offering_id', $this->access->offerings($entry)->select('id'));
                    $sources[] = $this->source($resources, 'publication', (string) $entry->id, 'COALESCE(published_at, created_at)');
                }
            }
        }

        $query = array_shift($sources);
        foreach ($sources as $source) {
            $query->unionAll($source);
        }
        $page = DB::query()->fromSub($query, 'student_document_library')
            ->orderByDesc('event_at')->orderBy('source')->orderByDesc('record_id')->orderByDesc('entry_id')
            ->paginate(18, ['*'], 'documents_page')->withQueryString();

        $records = $this->records($page->getCollection());
        $page->setCollection($page->getCollection()->map(function ($row) use ($records, $entries, $permissions) {
            $record = $records[$row->source]->get($row->record_id);

            return $record ? $this->item($row, $record, $entries->get($row->entry_id), $permissions->get($row->entry_id)) : null;
        })->filter()->values());

        return ['filter' => $filter, 'items' => ['data' => $page->items(), 'links' => $page->linkCollection(), 'total' => $page->total()]];
    }

    private function source(Builder $query, string $source, string $entry, string $date): Query
    {
        $id = $query->getModel()->qualifyColumn('id');

        return $query->selectRaw("? as source, $id as record_id, $entry as entry_id, $date as event_at", [$source])->toBase();
    }

    private function resultSources(Collection $permissions): array
    {
        $ids = $permissions->filter(fn ($rights) => $rights['results_view']['allowed'])->keys();
        $results = AcademicOfficialResult::published()->whereIn('academic_enrollment_id', $ids);
        $reportIds = $transcriptIds = [];
        foreach ((clone $results)->with('run')->lazyById(50) as $result) {
            if (! StudentResultPeriods::hasCompleteDocuments($result->snapshot)) {
                continue;
            }
            $reportIds[] = $result->id;
            if (! isset($result->run->context['period_code'])) {
                $transcriptIds[] = $result->id;
            }
        }

        $results->join('academic_deliberations', 'academic_deliberations.id', '=', 'academic_official_results.academic_deliberation_id');

        return [
            $this->source((clone $results)->whereIntegerInRaw('academic_official_results.id', $reportIds), 'report', 'academic_enrollment_id', 'academic_deliberations.published_at'),
            $this->source($results->whereIntegerInRaw('academic_official_results.id', $transcriptIds), 'transcript', 'academic_enrollment_id', 'academic_deliberations.published_at'),
        ];
    }

    private function records(Collection $rows): array
    {
        $queries = [
            'admission' => EnrollmentDocument::with('enrollment:id,academic_year_id,meta', 'enrollment.academicYear:id,title'),
            'official' => OfficialDocument::with(['type' => fn ($query) => $query->with('university:id,is_active')
                ->withExists(['templates as has_approved_template' => fn ($templates) => $templates->whereNotNull('approved_at')->whereNull('withdrawn_at')]), 'request']),
            'legacy_card' => CardIssuance::query(),
            'receipt' => StudentPayment::query(),
            'report' => AcademicOfficialResult::with('run'),
            'transcript' => AcademicOfficialResult::with('run'),
            'publication' => AcademicResource::with('offering.course'),
            'submission' => AcademicSubmission::with('resource.assessment'),
            'absence' => AbsenceJustification::with(['attendance.session.offering.course', 'attendance.session.offering.curriculumItem']),
        ];

        return $rows->groupBy('source')->map(fn ($group, $source) => $queries[$source]
            ->whereKey($group->pluck('record_id')->unique()->values()->all())->get()->keyBy('id'))->all();
    }

    private function item(object $row, object $document, ?AcademicEnrollment $entry, ?array $permissions): array
    {
        $item = match ($row->source) {
            'admission' => $this->admission($document),
            'official' => $this->official($entry, $document, $permissions),
            'legacy_card' => [
                'title' => 'Carte étudiante',
                'category' => 'official',
                'subtitle' => 'Carte remise',
                'url' => route('dashboard.student.index', ['section' => 'card', 'academic' => $entry->id], false),
                'kind' => 'card',
                'status' => 'delivered',
            ],
            'receipt' => [
                'title' => 'Reçu de versement',
                'category' => 'receipts',
                'subtitle' => $document->kind === 'tuition' ? 'Frais académiques' : null,
                'reference' => $document->reference,
                'status' => $document->status,
                'amount_cents' => (int) $document->amount_cents,
                'currency' => $document->currency,
                'url' => route('dashboard.student.payments.receipt', ['payment' => $document->uuid, 'academic' => $entry->id], false),
                'kind' => 'receipt',
            ],
            'report', 'transcript' => $this->result($entry, $document, $row->source),
            'publication' => $this->publication($entry, $document, $permissions[LearningAccess::fileFeature($document)]),
            'submission' => $this->submission($entry, $document),
            'absence' => $this->absence($entry, $document),
        };

        return $item + [
            'id' => $row->source.'-'.$row->entry_id.'-'.$row->record_id,
            'year' => $entry?->academicYear?->title,
            'date' => $row->event_at ? Carbon::parse($row->event_at)->toISOString() : null,
        ];
    }

    private function admission(EnrollmentDocument $document): array
    {
        $application = $document->enrollment;
        $label = $application->meta['required_documents'][$document->key] ?? null;
        if (! is_string($label) || blank($label)) {
            $label = match ($document->key) {
                'diplome' => 'Diplôme',
                'photo' => 'Photo d’identité',
                'id_card', 'piece_identite' => 'Pièce d’identité',
                'acte_naissance' => 'Acte de naissance',
                'releve_notes' => 'Relevé de notes',
                default => $document->filename ?: 'Pièce d’inscription',
            };
        }

        return [
            'title' => $label,
            'category' => 'admissions',
            'year' => $application->academicYear?->title,
            'subtitle' => $document->filename !== $label ? $document->filename : null,
            'reference' => $application->reference,
            'status' => 'accepted',
            'mime' => $document->mime,
            'size_bytes' => (int) $document->size_bytes,
            'preview_url' => route('dashboard.enrollments.documents.preview', $document->uuid, false),
            'download_url' => route('dashboard.enrollments.documents.download', $document->uuid, false),
        ];
    }

    private function official(AcademicEnrollment $entry, OfficialDocument $document, array $permissions): array
    {
        $type = $document->type;
        $policy = $type->policy;
        $mayRequest = $permissions['documents_request']['allowed'];
        $mayRead = (! $policy['financial_gate'] || $mayRequest) && (! $document->request->document_source_result_id || $permissions['results_view']['allowed']);
        $mayCopy = $mayRequest && $mayRead && $type->kind !== 'card' && $policy['student_request']
            && $policy['copies'] && $type->has_approved_template && $document->status !== 'replaced';
        $result = null;
        if ($mayCopy) {
            try {
                $result = $this->facts->eligible($entry, $type, true);
            } catch (ValidationException) {
                $mayCopy = false;
            }
        }

        return [
            'title' => $type->name,
            'category' => 'official',
            'reference' => $document->number,
            'status' => $document->validity(),
            'kind' => $type->kind,
            'verify_url' => route('official-documents.verify', $document->reference, false),
            'download_url' => $policy['download'] && $document->status === 'issued' && $mayRead
                ? route('dashboard.student.official-documents.download', ['document' => $document->reference, 'academic' => $entry->id], false)
                : null,
            'url' => $type->kind === 'card' ? route('dashboard.student.index', ['section' => 'card', 'academic' => $entry->id], false) : null,
            'official' => [
                'id' => $document->id, 'academic_id' => $entry->id, 'type_id' => $type->id,
                'kind' => $type->kind, 'status' => $document->status,
                'copies' => $mayCopy,
                'duplicate' => $mayCopy && $document->status === 'issued'
                    && ($document->snapshot['official_result_reference'] ?? null) === $result?->reference,
            ],
        ];
    }

    private function result(AcademicEnrollment $entry, AcademicOfficialResult $result, string $kind): array
    {
        $run = $result->run;
        $context = $run->context;

        return [
            'title' => $kind === 'report' ? 'Bulletin de résultats' : 'Relevé annuel de notes',
            'category' => 'academic',
            'subtitle' => ($context['period_name'] ?? $context['session'] ?? 'Résultats').' · Édition '.$run->edition,
            'date' => $run->published_at,
            'kind' => $kind,
            'download_url' => route('dashboard.student.results.document', ['reference' => $result->reference, 'kind' => $kind, 'academic' => $entry->id], false),
        ];
    }

    private function publication(AcademicEnrollment $entry, AcademicResource $resource, array $decision): array
    {
        $allowed = $decision['allowed'];

        return [
            'title' => $resource->title,
            'category' => 'academic',
            'subtitle' => $resource->offering->course ? $this->access->reference($entry, $resource->offering->course)['title'] : null,
            'kind' => 'publication',
            'body' => $allowed ? $resource->body : null,
            'reason' => $allowed ? null : $decision['reason'],
            'mime' => $allowed ? $resource->mime : null,
            'size_bytes' => $allowed ? $resource->size_bytes : null,
            'download_url' => $resource->path && $allowed
                ? route('dashboard.student.resources.download', ['resource' => $resource->id, 'academic' => $entry->id], false)
                : null,
            'url' => ! $allowed ? route('dashboard.student.index', ['section' => 'fees', 'academic' => $entry->id], false) : null,
        ];
    }

    private function submission(AcademicEnrollment $entry, AcademicSubmission $work): array
    {
        $mayRead = ! $work->resource->assessment || $this->assessment->canReadWork($entry, $work->resource);
        $parameters = ['submission' => $work->id, 'academic' => $entry->id];

        return [
            'title' => $work->resource->title,
            'category' => 'academic',
            'subtitle' => 'Travail transmis · Version '.$work->version,
            'kind' => 'submission',
            'body' => $work->body,
            'download_url' => $mayRead && $work->path ? route('dashboard.student.submissions.download', $parameters, false) : null,
            'url' => $mayRead ? route('dashboard.student.submissions.version', $parameters + ['version' => $work->version], false) : null,
        ];
    }

    private function absence(AcademicEnrollment $entry, AbsenceJustification $absence): array
    {
        $offering = $absence->attendance->session->offering;

        return [
            'title' => 'Justificatif d’absence',
            'category' => 'academic',
            'subtitle' => $offering->curriculumItem?->name ?? $offering->course?->title,
            'kind' => 'absence',
            'status' => $absence->status,
            'download_url' => route('dashboard.student.absences.file', ['case' => $absence->id, 'academic' => $entry->id], false),
        ];
    }
}
