<?php

namespace App\Modules\Results\Application;

use App\Models\Student\AcademicAssessment;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicOfficialResult;
use App\Models\Student\AcademicResultRule;
use App\Models\Student\AssessmentRecord;
use App\Modules\Student\Application\Services\AcademicAccessService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

final class StudentResultPeriods
{
    private const ACQUIRED = ['passed', 'compensated', 'recognized'];

    public function __construct(private AcademicAccessService $access) {}

    public function published(AcademicEnrollment $entry): Builder
    {
        return AcademicOfficialResult::published()->where('academic_enrollment_id', $entry->id)
            ->join('academic_deliberations', 'academic_deliberations.id', '=', 'academic_official_results.academic_deliberation_id')
            ->orderByDesc('academic_deliberations.published_at')->orderByDesc('academic_deliberations.id')
            ->select('academic_official_results.*')->with('run.rule');
    }

    public static function completePeriods(array $snapshot): array
    {
        $units = collect($snapshot['units'] ?? [])->keyBy('id');

        return array_filter($snapshot['periods'] ?? [], fn ($period) => ! empty($period['units'])
            && collect($period['units'])->every(fn ($id) => $units->has($id)
                && in_array($units[$id]['status'], [...self::ACQUIRED, 'failed', 'eliminatory'], true)));
    }

    public static function hasCompleteDocuments(array $snapshot): bool
    {
        $complete = self::completePeriods($snapshot);

        return $complete !== [] && count($complete) === count($snapshot['periods']);
    }

    public static function semesterNumber(string|int $code, ?string $name): ?int
    {
        foreach ([$code, $name] as $label) {
            $normalized = Str::lower(Str::ascii(trim((string) $label)));
            if (preg_match('/^(?:1|s[ ._-]*1|sem[ ._-]*1|semestre[ ._-]*1|1(?:er)? semestre|premier semestre)$/', $normalized)) {
                return 1;
            }
            if (preg_match('/^(?:2|s[ ._-]*2|sem[ ._-]*2|semestre[ ._-]*2|2(?:e|eme)? semestre|(?:deuxieme|second) semestre)$/', $normalized)) {
                return 2;
            }
        }

        return null;
    }

    /**
     * Use the latest edition of each published jury scope. A rectification supersedes its own older editions.
     */
    private function currentEditions(AcademicEnrollment $entry): Builder
    {
        return $this->published($entry)->whereNotExists(function ($query) {
            $query->selectRaw('1')->from('academic_deliberations as newer')
                ->whereColumn('newer.scope_key', 'academic_deliberations.scope_key')
                ->whereColumn('newer.edition', '>', 'academic_deliberations.edition')
                ->where('newer.state', 'published')->whereNotNull('newer.published_at');
        });
    }

    public function semesterEditions(AcademicEnrollment $entry, ?AcademicOfficialResult $preferred): array
    {
        $semesters = [];
        $editions = $this->currentEditions($entry)->lazy(15);
        if ($preferred) {
            $editions = $editions->prepend($preferred);
        }
        foreach ($editions as $edition) {
            foreach (self::completePeriods($edition->snapshot) as $key => $period) {
                $number = self::semesterNumber($key, $period['name'] ?? null);
                if ($number !== null && ! isset($semesters[$number])) {
                    $semesters[$number] = ['key' => (string) $key, 'period' => $period, 'edition' => $edition];
                }
            }
            if (count($semesters) === 2) {
                break;
            }
        }

        return $semesters;
    }

    public function publishedCredits(AcademicEnrollment $entry): ?array
    {
        $latestByPeriod = [];
        $planned = null;
        foreach ($this->currentEditions($entry)->lazy(15) as $edition) {
            $snapshot = $edition->snapshot;
            if (($edition->run->context['period_code'] ?? null) === null) {
                $planned ??= $snapshot['credits']['planned'];
            }
            foreach (self::completePeriods($snapshot) as $key => $period) {
                $latestByPeriod[$key] ??= collect($snapshot['units'])->whereIn('id', $period['units']);
            }
        }
        if ($latestByPeriod === []) {
            return null;
        }

        $units = collect($latestByPeriod)->collapse();
        $earned = $units->sum('earned_credits');

        return [
            'planned' => $planned,
            'earned' => $earned,
            'remaining' => $units->sum('credits') - $earned,
            'compensated' => $units->where('status', 'compensated')
                ->sum(fn ($unit) => $unit['earned_credits'] - min($unit['earned_credits'], $unit['recognized_credits'] ?? 0)),
        ];
    }

    public function progress(AcademicEnrollment $entry, array $editions): array
    {
        $courses = count($editions) < 2 && $this->access->decision($entry, 'courses_view')['allowed'] ? $this->courseProgress($entry) : [];
        $semesters = [];
        foreach ([1, 2] as $number) {
            $edition = $editions[$number] ?? null;
            $courseStates = $edition ? [] : ($courses[$number] ?? []);
            $passed = false;
            $status = 'in_progress';
            if ($edition) {
                $units = collect($edition['edition']->snapshot['units'])->whereIn('id', $edition['period']['units']);
                $passed = $units->every(fn ($unit) => in_array($unit['status'], self::ACQUIRED, true));
                $status = 'published';
            } elseif ($courseStates !== [] && collect($courseStates)->every(fn ($course) => $course['state'] === 'evaluated')) {
                $status = 'awaiting_publication';
            }
            $semesters[] = [
                'number' => $number,
                'period_key' => $edition['key'] ?? null,
                'reference' => $edition ? $edition['edition']->reference : null,
                'status' => $status,
                'passed' => $passed,
                'courses' => $courseStates,
            ];
        }

        return $semesters;
    }

    private function courseProgress(AcademicEnrollment $entry): array
    {
        $offers = $this->access->offerings($entry)->with(['course:id,code,title,semester', 'curriculumItem.unit', 'academicSemester:id,number'])->get();
        $assessments = AcademicAssessment::whereIn('state', ['published', 'closed'])
            ->whereHas('resource', fn ($resource) => $resource->visible()->forStudent($entry)->whereIn('academic_offering_id', $offers->modelKeys()))
            ->with(['resource:id,academic_offering_id', 'records' => fn ($records) => $records->where('academic_enrollment_id', $entry->id)
                ->select(['id', 'academic_assessment_id', 'academic_course_registration_id', 'participation', 'correction_state', 'points'])])
            ->get(['id', 'academic_resource_id', 'state', 'maximum_points'])->keyBy('id');
        $byOffer = $assessments->groupBy('resource.academic_offering_id');
        $registrations = $entry->courseRegistrations()->whereNull('withdrawn_at')->pluck('id', 'academic_offering_id');
        $curriculum = $this->access->curriculumItems($entry);
        $rules = $curriculum?->isNotEmpty() ? AcademicResultRule::where('curriculum_version_id', $entry->curriculum_version_id)
            ->where('level_id', $entry->level_id)->whereNotNull('approved_at')->whereDate('effective_on', '<=', now('Africa/Kinshasa')->toDateString())
            ->whereNull('configuration->base_rule_id')->orderByDesc('effective_on')->orderByDesc('id')->get() : collect();
        $courses = [];
        foreach ($offers->groupBy('course_id') as $courseId => $courseOffers) {
            $offer = $courseOffers->first();
            $reference = $this->access->reference($entry, $offer->course, $offer->curriculumItem);
            $unit = $offer->curriculumItem?->unit;
            $semester = self::semesterNumber($unit?->period_code ?? '', $unit?->period_name)
                ?? self::semesterNumber($offer->academicSemester?->number ?? $offer->semester ?? '', (string) $offer->course->semester);
            if (! in_array($semester, [1, 2], true)) {
                continue;
            }
            $rule = $unit ? ($rules->first(fn ($rule) => ($rule->configuration['period_code'] ?? null) === $unit->period_code)
                ?? $rules->first(fn ($rule) => ! isset($rule->configuration['period_code']))) : null;
            $required = $rule?->configuration['items'][$offer->curriculum_item_id] ?? null;
            $candidates = $required === null
                ? $courseOffers->flatMap(fn ($row) => $byOffer->get($row->id, collect()))->filter(fn ($item) => $item->maximum_points !== null)
                : collect(array_keys($required))->map(fn ($id) => $assessments->get($id));
            $evaluated = $candidates->isNotEmpty() && $candidates->every(function (?AcademicAssessment $assessment) use ($registrations) {
                $record = $assessment?->records->first();
                $registration = $assessment ? $registrations->get($assessment->resource->academic_offering_id) : null;

                return $assessment?->state === 'closed' && $record && $record->academic_course_registration_id === $registration
                    && in_array($record->correction_state, ['finalized', 'validated'], true)
                    && in_array($record->participation, AssessmentRecord::SCORED, true)
                    && $record->points !== null;
            });
            $courses[$semester][$courseId] = [
                'id' => $courseId, 'name' => $reference['title'], 'code' => $reference['code'],
                'state' => $evaluated ? 'evaluated' : 'pending',
                'is_optional' => $reference['is_optional'] ?? $offer->is_optional,
            ] + $this->progressUnit($reference);
        }

        $this->appendExpectedCourses($entry, $courses, $curriculum);

        return array_map(fn ($items) => collect($items)->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)->values()->all(), $courses);
    }

    private function appendExpectedCourses(AcademicEnrollment $entry, array &$courses, ?Collection $curriculum): void
    {
        if ($curriculum !== null) {
            foreach ($curriculum->reject->is_optional as $item) {
                $number = self::semesterNumber($item->unit->period_code, $item->unit->period_name);
                if ($number !== null) {
                    $courses[$number][$item->source_course_id] ??= [
                        'id' => $item->source_course_id, 'name' => $item->name, 'code' => $item->code, 'state' => 'pending',
                        'is_optional' => false,
                    ] + $this->progressUnit($this->access->unitReference($entry, $item));
                }
            }

            return;
        }
        foreach ($this->access->catalog($entry)->get(['id', 'code', 'title', 'semester']) as $course) {
            $number = self::semesterNumber($course->semester ?? '', null);
            if ($number !== null) {
                $courses[$number][$course->id] ??= [
                    'id' => $course->id, 'name' => $course->title, 'code' => $course->code, 'state' => 'pending',
                ];
            }
        }
    }

    private function progressUnit(array $reference): array
    {
        return [
            'unit_id' => $reference['unit_id'] ?? null, 'unit' => $reference['unit'] ?? null, 'unit_code' => $reference['unit_code'] ?? null,
            'unit_is_composite' => $reference['unit_is_composite'] ?? false,
        ];
    }
}
