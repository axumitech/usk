<?php

namespace App\Modules\Student\Application\Services;

use App\Models\AcademicStructure\AcademicProgram;
use App\Models\AcademicYear;
use App\Models\Level;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicLifecycleCase;
use App\Models\Student\AcademicOfficialResult;
use App\Models\Student\AcademicProgression;
use App\Modules\Results\Application\StudentResultPeriods;
use Illuminate\Support\Collection;

final class StudentAcademicPathway
{
    private const RECORDED_STUDIES = ['confirmed', 'completed', 'on_leave', 'suspended', 'withdrawn', 'transferred'];

    private const TRANSITIONS = [
        'advance' => 'Passage au niveau suivant',
        'conditional' => 'Passage conditionnel',
        'repeat' => 'Redoublement',
        'resumption' => 'Reprise autorisée',
    ];

    private const MILESTONES = [
        'interruption' => 'Interruption approuvée',
        'resumption' => 'Reprise approuvée',
        'reorientation' => 'Réorientation approuvée',
        'external_transfer' => 'Transfert externe approuvé',
        'cycle' => 'Changement de cycle approuvé',
        'graduation' => 'Fin de cursus approuvée',
    ];

    public function __construct(private AcademicAccessService $access) {}

    public function read(AcademicEnrollment $selected, ?int $currentYear): array
    {
        $entries = $selected->profile->enrollments()->whereHas('application')
            ->with(['application:id,status,form_snapshot', 'level.faculty', 'level.programs.levels', 'level.programs.cycle',
                'academicYear', 'curriculumVersion.program.levels', 'curriculumVersion.program.cycle',
                'group.promotion', 'promotion', 'admissionCohort'])
            ->orderBy(AcademicYear::select('start_date')->whereColumn('academic_years.id', 'academic_enrollments.academic_year_id'))
            ->orderBy('id')->get();
        $ids = $entries->modelKeys();
        $lifecycle = AcademicLifecycleCase::whereIntegerInRaw('academic_enrollment_id', $ids)
            ->where('status', 'approved')->orderBy('decided_at')->orderBy('id')
            ->get(['id', 'academic_enrollment_id', 'kind', 'academic_official_result_id'])->groupBy('academic_enrollment_id');
        $results = $this->annualResults($ids);
        $decisions = AcademicProgression::whereIntegerInRaw('source_enrollment_id', $ids)
            ->with(['level:id,title', 'academicYear:id,title,start_date'])
            ->get(['id', 'source_enrollment_id', 'target_enrollment_id', 'academic_official_result_id', 'level_id', 'academic_year_id', 'kind'])
            ->keyBy('source_enrollment_id');

        $current = $entries->reverse()->first(function (AcademicEnrollment $entry) use ($currentYear, $lifecycle, $selected) {
            $lastPause = $lifecycle->get($entry->id, collect())->last(fn ($case) => in_array($case->kind, ['interruption', 'resumption'], true));

            return $selected->profile->student_status === 'active'
                && $entry->academic_year_id === $currentYear
                && $entry->enrollment_status === 'confirmed'
                && $entry->application->status?->value === 'validated'
                && $lastPause?->kind !== 'interruption';
        });

        $recorded = $entries->filter(fn ($entry) => in_array($entry->enrollment_status, self::RECORDED_STUDIES, true));
        $programsByEntry = $entries->mapWithKeys(fn ($entry) => [$entry->id => $this->program($entry)]);
        $programs = [];
        $groups = $entries->groupBy(function ($entry) use ($programsByEntry) {
            $program = $programsByEntry->get($entry->id);

            return $program ? 'program-'.$program->id : 'faculty-'.$entry->level->faculty_id;
        });
        $latestProgram = $programsByEntry->get(($current ?? $entries->last())->id);
        foreach ($groups as $key => $history) {
            $program = $programsByEntry->get($history->last()->id);
            $programs[] = $this->programMap($key, $program, $program !== null && $program->is($latestProgram),
                $history, $selected, $current, $results, $decisions, $lifecycle);
        }

        return [
            'academic_id' => $selected->id,
            'current' => $current ? [
                'id' => $current->id, 'level' => $current->level->title,
                'year' => $current->academicYear->title, 'faculty' => $current->level->faculty->name,
            ] : null,
            'counts' => [
                'years' => $recorded->pluck('academic_year_id')->unique()->count(),
                'levels' => $recorded->pluck('level_id')->unique()->count(),
                'validated' => collect($programs)->flatMap(fn ($program) => $program['levels'])
                    ->filter(fn ($level) => collect($level['attempts'])->contains('passed', true))->pluck('id')->unique()->count(),
            ],
            'programs' => $programs,
        ];
    }

    private function annualResults(array $ids): Collection
    {
        return AcademicOfficialResult::published()->whereIntegerInRaw('academic_enrollment_id', $ids)
            ->join('academic_deliberations', 'academic_deliberations.id', '=', 'academic_official_results.academic_deliberation_id')
            ->whereNull('academic_deliberations.context->period_code')
            ->orderByDesc('academic_deliberations.published_at')->orderByDesc('academic_deliberations.id')
            ->select('academic_official_results.*')->with('run.rule')->get()
            ->unique('academic_enrollment_id')->keyBy('academic_enrollment_id');
    }

    private function program(AcademicEnrollment $entry): ?AcademicProgram
    {
        if ($entry->curriculumVersion?->program) {
            return $entry->curriculumVersion->program;
        }

        $groupPromotion = $entry->group?->promotion;
        $officialReferences = collect([
            $entry->promotion?->academic_program_id,
            $entry->admissionCohort?->academic_program_id,
            $groupPromotion?->academic_year_id === $entry->academic_year_id ? $groupPromotion?->academic_program_id : null,
        ])->filter()->map(fn ($id) => (int) $id)->unique();
        $programs = $entry->level->programs->where('faculty_id', $entry->level->faculty_id);
        if ($officialReferences->isNotEmpty()) {
            return $officialReferences->count() === 1 ? $programs->firstWhere('id', $officialReferences->first()) : null;
        }
        $choice = (int) ($entry->application?->form_snapshot['academic_program_id'] ?? 0);
        if ($choice > 0) {
            return $programs->firstWhere('id', $choice);
        }
        $active = $programs->where('is_active', true);

        return $active->count() === 1 ? $active->first() : null;
    }

    private function programMap(
        string $key, ?AcademicProgram $program, bool $showFutureLevels, Collection $history, AcademicEnrollment $selected, ?AcademicEnrollment $current,
        Collection $results, Collection $decisions, Collection $lifecycle,
    ): array {
        $latest = $history->last();
        $version = $history->reverse()->first(fn ($entry) => filled($entry->curriculumVersion?->program_snapshot))?->curriculumVersion;
        $snapshot = $version?->program_snapshot ?? [];
        $order = collect($snapshot['level_order'] ?? $program?->levels->modelKeys() ?? [])
            ->map(fn ($id) => (int) $id)->unique()->values();
        $attempts = $history->groupBy('level_id');
        $pendingDestinations = $history->map(function (AcademicEnrollment $entry) use ($decisions, $results) {
            $decision = $decisions->get($entry->id);

            return $decision && $decision->target_enrollment_id === null && $this->isCurrentTransition($entry, $decision, $results->get($entry->id))
                ? $decision->level_id : null;
        })->filter()->values();
        $levelIds = $order->concat($attempts->keys())->concat($pendingDestinations)->unique()->values();
        $levels = Level::whereIntegerInRaw('id', $levelIds->all())->get(['id', 'title', 'code'])->keyBy('id');
        $catalogPosition = $order->filter(fn ($id) => $attempts->has($id))->keys()->last();
        $cards = [];
        foreach ($levelIds as $levelId) {
            $level = $levels->get($levelId);
            if (! $level) {
                continue;
            }

            $attemptRows = $attempts->get($levelId, collect())->map(fn ($entry) => $this->attempt(
                $entry, $selected, $current, $results->get($entry->id), $decisions->get($entry->id), $lifecycle->get($entry->id, collect())
            ))->values();
            $position = $order->search($levelId);
            $state = match (true) {
                $attemptRows->contains('current', true) => 'current',
                $attemptRows->contains('passed', true) => 'passed',
                $attemptRows->last()['interrupted'] ?? false => 'interrupted',
                $attemptRows->contains('attended', true) => 'attended',
                $attemptRows->isNotEmpty() || $pendingDestinations->contains($levelId) => 'pending',
                $showFutureLevels && $position !== false && $catalogPosition !== null && $position > $catalogPosition => 'planned',
                default => 'not_recorded',
            };
            $cards[] = [
                'id' => $level->id,
                'code' => $level->code,
                'title' => $level->title,
                'state' => $state,
                'attempts' => $attemptRows->all(),
            ];
        }

        return [
            'id' => $key,
            'title' => $snapshot['name'] ?? $program?->name ?? $latest->level->faculty->name,
            'cycle' => $snapshot['cycle'] ?? $program?->cycle?->name,
            'degree' => $snapshot['degree'] ?? $program?->degree,
            'levels' => $cards,
        ];
    }

    private function attempt(
        AcademicEnrollment $entry, AcademicEnrollment $selected, ?AcademicEnrollment $current,
        ?AcademicOfficialResult $result, ?AcademicProgression $transition, Collection $lifecycle,
    ): array {
        $decision = $result?->run->context['decisions'][$result->decision] ?? [];
        $snapshot = $result?->snapshot ?? [];
        $canSeeResult = $result !== null && $this->access->decision($entry, 'results_view')['allowed'];
        $certifiesLevel = ($decision['progression'] ?? null) === 'next' || $lifecycle->contains(fn ($case) => $case->kind === 'graduation' && $case->academic_official_result_id === $result?->id);
        $passed = $canSeeResult && $result->run->rule->curriculum_version_id === $entry->curriculum_version_id
            && $result->run->rule->level_id === $entry->level_id
            && ($snapshot['anomalies'] ?? []) === [] && ! ($snapshot['eliminatory'] ?? false)
            && $certifiesLevel
            && StudentResultPeriods::hasCompleteDocuments($snapshot)
            && collect($snapshot['units'])->every(fn ($unit) => in_array($unit['status'], ['passed', 'compensated', 'recognized'], true));
        $lastPause = $lifecycle->last(fn ($case) => in_array($case->kind, ['interruption', 'resumption'], true));
        $showTransition = $transition && ($transition->target_enrollment_id !== null || $this->isCurrentTransition($entry, $transition, $result));

        return [
            'id' => $entry->id,
            'year' => $entry->academicYear->title,
            'status' => $entry->enrollment_status,
            'selected' => $entry->is($selected),
            'current' => $current?->is($entry) ?? false,
            'passed' => $passed,
            'attended' => in_array($entry->enrollment_status, self::RECORDED_STUDIES, true),
            'interrupted' => $lastPause?->kind === 'interruption' || in_array($entry->enrollment_status, ['suspended', 'on_leave', 'withdrawn'], true),
            'result' => $canSeeResult && isset($decision['label']) ? [
                'label' => $decision['label'],
                'url' => route('dashboard.student.index', ['section' => 'results', 'academic' => $entry->id, 'official' => $result->reference], false),
            ] : null,
            'transition' => $showTransition ? [
                'label' => self::TRANSITIONS[$transition->kind] ?? 'Décision de progression',
                'level' => $transition->level->title, 'year' => $transition->academicYear->title,
            ] : null,
            'milestones' => $lifecycle->map(fn ($case) => self::MILESTONES[$case->kind] ?? null)->filter()->values()->all(),
        ];
    }

    private function isCurrentTransition(AcademicEnrollment $entry, AcademicProgression $transition, ?AcademicOfficialResult $result): bool
    {
        if ($result) {
            return $transition->academic_official_result_id === $result->id;
        }

        // The progression workflow accepts legacy decisions and certain resumptions without a result.
        return $transition->academic_official_result_id === null
            && ($entry->curriculum_version_id === null || $transition->kind === 'resumption');
    }
}
