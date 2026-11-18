<?php

namespace App\Modules\Results\Infrastructure\Http;

use App\Models\AcademicStructure\CurriculumUnit;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicOfficialResult;
use App\Modules\Results\Application\ResultAppeals;
use App\Modules\Results\Application\ResultDocuments;
use App\Modules\Results\Application\StudentResultPeriods;
use App\Modules\Student\Application\Services\AcademicAccessService;
use App\Modules\Student\Infrastructure\Http\Controllers\StudentPortalController;
use App\Support\DocumentUploadLimit;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Validation\ValidationException;

final class StudentResultsController
{
    public function __construct(
        private AcademicAccessService $access,
        private ResultAppeals $appeals,
        private StudentResultPeriods $periods,
    ) {}

    public function presentation(Request $request, AcademicEnrollment $entry): array
    {
        if (! $this->access->decision($entry, 'results_view')['allowed']) {
            return ['items' => null, 'selected' => null, 'semesters' => [], 'selected_semester' => null];
        }
        $input = $request->validate(['official' => 'nullable|uuid', 'semester' => 'nullable|integer|in:1,2']);
        $query = $this->periods->published($entry);
        $preferred = isset($input['official']) ? (clone $query)->where('academic_official_results.reference', $input['official'])->firstOrFail() : null;
        $semesters = $this->periods->semesterEditions($entry, $preferred);
        $semester = isset($input['semester']) ? (int) $input['semester'] : null;
        $selected = $preferred ?? ($semester === null
            ? (reset($semesters)['edition'] ?? (clone $query)->first())
            : ($semesters[$semester]['edition'] ?? null));
        if ($semester === null && $selected) {
            foreach ($semesters as $number => $available) {
                if ($available['edition']->is($selected)) {
                    $semester = $number;
                    break;
                }
            }
        }

        return [
            'items' => $query->paginate(15, ['academic_official_results.*'], 'official_page')->withQueryString()->through(fn ($row) => $this->summary($row)),
            'selected' => $selected ? $this->details($entry, $selected) : null,
            'semesters' => $this->periods->progress($entry, $semesters),
            'selected_semester' => $semester,
        ];
    }

    private function details(AcademicEnrollment $entry, AcademicOfficialResult $selected): array
    {
        $periods = StudentResultPeriods::completePeriods($selected->snapshot);
        $unmapped = [];
        foreach ($periods as $key => $period) {
            if (StudentResultPeriods::semesterNumber($key, $period['name'] ?? null) === null) {
                $unmapped[] = (string) $key;
            }
        }
        $deadline = $this->appeals->deadline($selected);
        $completeDocuments = StudentResultPeriods::hasCompleteDocuments($selected->snapshot);
        $strictValidation = ($selected->snapshot['calculator'] ?? 1) >= 2;

        return $this->summary($selected) + [
            'credits' => $selected->snapshot['credits'],
            'periods' => (object) $periods,
            'unmapped_period_keys' => $unmapped,
            'can_download_documents' => $completeDocuments,
            'units' => collect($selected->snapshot['units'])->filter(fn ($unit) => isset($periods[$unit['period_code']]))
                ->values()->map(fn ($unit) => Arr::only($unit, ['id', 'name', 'code', 'period_code', 'credits', 'earned_credits', 'grade', 'status']) + [
                    'is_composite' => $unit['is_composite'] ?? (count($unit['items']) > 1 && ! CurriculumUnit::isCatalogGroup($unit['code'] ?? '', $unit['name'])),
                    'requires_all_items' => $strictValidation && ($unit['is_composite'] ?? false) && ! ($unit['ordinary_acquisition_preserved'] ?? false),
                    'ordinary_acquisition_preserved' => $unit['ordinary_acquisition_preserved'] ?? false,
                    'items' => collect($unit['items'])->map(fn ($item) => Arr::only($item, ['id', 'name', 'code', 'credits', 'coefficient', 'grade', 'status', 'selected'])),
                ]),
            'deadline' => $deadline,
            'can_appeal' => $deadline?->gte(now()) ?? false,
            'appeals' => $entry->serviceRequests()->where('academic_official_result_id', $selected->id)->get(['id', 'result_target', 'status', 'response', 'created_at']),
        ];
    }

    public function document(Request $request, string $reference, string $kind, StudentPortalController $portal, ResultDocuments $documents)
    {
        [$entry, $result] = $this->resolve($request, $reference, $portal);

        return $documents->issue($result->run, $request->user(), $kind, $result);
    }

    public function appeal(Request $request, string $reference, StudentPortalController $portal)
    {
        [$entry, $result] = $this->resolve($request, $reference, $portal);
        $semester = $request->integer('semester');
        $url = route('dashboard.student.index', [
            'section' => 'results', 'academic' => $entry->id, 'official' => $result->reference,
        ] + (in_array($semester, [1, 2], true) ? ['semester' => $semester] : []), false);
        try {
            $input = $request->validate([
                'target' => ['required', 'string', 'regex:/^(decision|ec:[0-9]+)$/D', 'max:80'],
                'body' => 'required|string|min:10|max:6000',
                'file' => DocumentUploadLimit::proofRules(required: false),
            ], DocumentUploadLimit::proofMessages() + [
                'target.required' => 'Choisissez le résultat concerné.',
                'target.string' => 'Choisissez un résultat autorisé.',
                'target.regex' => 'Choisissez un résultat autorisé.',
                'target.max' => 'Choisissez un résultat autorisé.',
                'body.required' => 'Expliquez le motif de votre recours.',
                'body.string' => 'Saisissez le motif en texte.',
                'body.min' => 'Saisissez au moins :min caractères pour expliquer le recours.',
                'body.max' => 'Le motif ne doit pas dépasser :max caractères.',
            ]);
            $appeal = $this->appeals->submit($result, $entry, $request->user(), $input, $request->file('file'));
        } catch (ValidationException $exception) {
            throw $exception->redirectTo($url);
        }

        return redirect()->to($url, 303)->with('success', 'Recours enregistré · Référence '.$appeal->id);
    }

    private function resolve(Request $request, string $reference, StudentPortalController $portal): array
    {
        $entry = $portal->context($request);
        abort_unless($this->access->decision($entry, 'results_view')['allowed'], 403);

        return [$entry, $this->periods->published($entry)->where('academic_official_results.reference', $reference)->firstOrFail()];
    }

    private function summary(AcademicOfficialResult $row): array
    {
        return ['reference' => $row->reference, 'edition' => $row->run->edition, 'published_at' => $row->run->published_at,
            'decision' => $row->run->context['decisions'][$row->decision]['label'], 'annual' => $row->snapshot['annual'],
            'period_scope' => $row->run->context['period_code'] ?? null, 'period_label' => $row->run->context['period_name'] ?? null,
            'context' => Arr::only($row->run->context, ['program', 'level', 'year', 'session', 'credit_label', 'scale']),
            'ordinary_reference' => $row->snapshot['ordinary_reference'],
        ];
    }
}
