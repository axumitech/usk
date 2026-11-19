<?php

namespace Database\Seeders\RecetteV2;

use App\Models\Student\AcademicDeliberation;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicOffering;
use App\Models\Student\AcademicProgression;
use App\Models\Student\AcademicResultRule;
use App\Models\Student\AcademicSubmission;
use App\Models\User;
use App\Modules\Assessment\Application\AssessmentCorrections;
use App\Modules\Assessment\Application\AssessmentSubmissions;
use App\Modules\Assessment\Application\AssessmentWorkflow;
use App\Modules\Results\Application\Deliberations;
use App\Modules\Results\Application\ResultRules;
use App\Modules\Student\Application\Services\AcademicEnrollmentService;
use App\Modules\Student\Application\Services\AcademicProgressionService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use LogicException;

/** Called only by the guarded local recette seeder, never by DatabaseSeeder. */
final class HistoricalAcademicFixtures
{
    private const REASON = 'RECETTE V2 : opération et règlement exclusivement fictifs, sans valeur universitaire officielle.';

    private const SCORES = [
        'etudiant.med' => ['16.00', '14.00'],
        'etudiant.med2' => ['6.00', '8.00'],
        'etudiant.med3' => ['11.00', '8.00'],
        'etudiant.droit' => ['15.00', '13.00'],
        'etudiant.droit2' => ['9.00', '7.00'],
    ];

    /** Prepare while 2025–2026 is open; all returned enrollments are completed before closure. */
    public function prepare(array $users, array $catalog, array $entries): array
    {
        $admin = $users['admin'];
        $works = $rules = $runs = $results = [];

        foreach (['med', 'droit'] as $faculty) {
            $publisher = $users['doyen.'.$faculty];
            $students = array_filter($entries, fn ($entry, $key) => isset(self::SCORES[$key])
                && (int) $entry->level->faculty_id === (int) $catalog['faculties'][$faculty]->id, ARRAY_FILTER_USE_BOTH);
            $sources = [];
            foreach ($catalog['offerings']['past'][$faculty]['L1'] as $index => $offer) {
                $works[$faculty][$index] = $this->work($offer, $users['professeur.'.$faculty], $admin, $students, $index);
                $sources[$offer->curriculum_item_id] = [];
                foreach ($works[$faculty][$index] as $resource) {
                    $sources[$offer->curriculum_item_id][$resource->assessment()->sole()->id] = 5000;
                }
            }

            [$rules[$faculty], $runs[$faculty]] = Carbon::withTestNow(Carbon::parse('2026-06-20 10:00', 'Africa/Kinshasa'),
                fn () => $this->deliberation($admin, $publisher, $catalog, $faculty, $sources, secretary: $users['vicedoyen.'.$faculty]));
            foreach ($students as $key => $entry) {
                $results[$key] = $runs[$faculty]->results()->where('academic_enrollment_id', $entry->id)->sole();
            }
        }

        $unpublished = Carbon::withTestNow(Carbon::parse('2026-06-01 09:00', 'Africa/Kinshasa'), function () use ($catalog, $users) {
            $offer = $catalog['offerings']['past']['droit']['L1'][0];
            $title = '[RECETTE V2] Évaluation historique non publiée';

            return $offer->resources()->where('title', $title)->first()
                ?? app(AssessmentWorkflow::class)->draft($offer, $users['professeur.droit'], $this->details($title, 'exam') + [
                    'opens_at' => '2026-06-25T09:00', 'closes_at' => '2026-06-27T18:00',
                ]);
        });

        Carbon::withTestNow(Carbon::parse('2026-09-20 10:00', 'Africa/Kinshasa'), function () use ($entries, $admin) {
            foreach ($entries as $entry) {
                $entry = $entry->fresh();
                if ($entry->enrollment_status !== 'completed') {
                    app(AcademicEnrollmentService::class)->transition($entry, $admin, [
                        'expected_status' => 'confirmed', 'expected_context' => AcademicEnrollmentService::contextToken($entry),
                        'enrollment_status' => 'completed', 'operation_key' => (string) Str::uuid(), 'reason' => self::REASON,
                    ]);
                }
            }
        });

        return ['entries' => array_map(fn (AcademicEnrollment $entry) => $entry->fresh(), $entries), 'assessments' => $works, 'rules' => $rules, 'runs' => $runs,
            'results' => $results, 'unpublished_assessment' => $unpublished];
    }

    /** Run after the new year and its published curriculum exist; finance handles the new dues afterwards. */
    public function renew(array $users, array $catalog, array $prepared): AcademicEnrollment
    {
        $source = $prepared['entries']['etudiant.med']->fresh();
        $result = $prepared['results']['etudiant.med'];
        $service = app(AcademicProgressionService::class);
        $service->decide($source, $users['admin'], [
            'level_id' => $catalog['levels']['med']['L2']->id,
            'academic_year_id' => $catalog['current_year']->id,
            'academic_official_result_id' => $result->id,
            'target_curriculum_version_id' => $catalog['versions']['current']['med']->id,
            'reason' => self::REASON,
        ]);
        $decision = AcademicProgression::where('source_enrollment_id', $source->id)->sole();
        $target = $service->start($decision, $source->profile);
        $group = $catalog['groups']['current']['med']['L2'];
        if ((int) $target->class_id !== (int) $group->id) {
            $target = app(AcademicEnrollmentService::class)->transition($target, $users['admin'], [
                'expected_status' => $target->enrollment_status,
                'expected_context' => AcademicEnrollmentService::contextToken($target),
                'enrollment_status' => $target->enrollment_status, 'class_id' => $group->id,
                'operation_key' => (string) Str::uuid(), 'reason' => self::REASON,
            ]);
        }

        return $target->fresh();
    }

    public function work(AcademicOffering $offer, User $teacher, User $admin, array $entries, int $index, array $scores = self::SCORES): array
    {
        $workflow = app(AssessmentWorkflow::class);
        $corrections = app(AssessmentCorrections::class);
        $resources = [];
        foreach (['practical' => 'Devoir', 'exam' => 'Évaluation'] as $category => $label) {
            $title = '[RECETTE V2] '.$label.' historique — EC '.($index + 1);
            $resource = Carbon::withTestNow(Carbon::parse('2026-05-04 08:00', 'Africa/Kinshasa'), function () use ($offer, $teacher, $workflow, $title, $category) {
                $resource = $offer->resources()->where('title', $title)->first()
                    ?? $workflow->draft($offer, $teacher, $this->details($title, $category) + [
                        'opens_at' => '2026-05-05T09:00', 'closes_at' => '2026-05-07T18:00',
                    ]);
                if ($resource->assessment()->sole()->state === 'draft') {
                    $workflow->lifecycle($resource, $teacher, ['action' => 'publish',
                        'revision' => $resource->assessment()->sole()->revision, 'reason' => self::REASON, 'notify' => false]);
                }

                return $resource->fresh();
            });

            if ($resource->assessment()->sole()->state === 'published') {
                Carbon::withTestNow(Carbon::parse('2026-05-06 10:00', 'Africa/Kinshasa'), function () use ($entries, $resource) {
                    foreach ($entries as $entry) {
                        if (! AcademicSubmission::where('academic_resource_id', $resource->id)->where('academic_enrollment_id', $entry->id)->exists()) {
                            app(AssessmentSubmissions::class)->submit($entry, $resource, [
                                'body' => 'Copie fictive de recette : analyse, démarche et réponse de démonstration.',
                                'operation_key' => (string) Str::uuid(), 'expected_version' => 0,
                            ], null, $entry->profile->user_id);
                        }
                    }
                });
            }

            Carbon::withTestNow(Carbon::parse('2026-05-08 10:00', 'Africa/Kinshasa'), function () use ($entries, $resource, $teacher, $admin, $workflow, $corrections, $index, $scores) {
                if ($resource->assessment()->sole()->state === 'published') {
                    $workflow->lifecycle($resource, $teacher, ['action' => 'close',
                        'revision' => $resource->assessment()->sole()->revision, 'reason' => self::REASON]);
                }
                foreach ($entries as $key => $entry) {
                    $record = $resource->assessment()->sole()->records()->where('academic_enrollment_id', $entry->id)->sole();
                    if ($record->correction_state === 'draft') {
                        if ($record->participation !== 'submitted') {
                            throw new LogicException('La copie fictive doit avoir été déposée avant la correction.');
                        }
                        $corrections->save($resource, $teacher, $record, [
                            'revision' => $record->revision, 'participation' => 'submitted', 'points' => $scores[$key][$index],
                            'feedback' => 'Correction fictive : résultat expliqué et pistes de travail pour la démonstration.', 'reason' => self::REASON,
                        ], null);
                        $corrections->record($resource, $teacher, $record->fresh(), ['action' => 'finalize',
                            'revision' => $record->fresh()->revision, 'reason' => self::REASON]);
                    }
                }
                $assessment = $resource->assessment()->sole();
                if ($assessment->records()->where('correction_state', 'finalized')->exists()) {
                    $corrections->batch($resource, $admin, ['action' => 'validate', 'revision' => $assessment->revision, 'reason' => self::REASON]);
                }
                if ($assessment->records()->where('correction_state', 'validated')->whereNull('released_at')->exists()) {
                    $corrections->batch($resource, $admin, ['action' => 'release',
                        'revision' => $resource->assessment()->sole()->revision, 'reason' => self::REASON, 'notify' => false]);
                }
            });
            $resources[] = $resource->fresh();
        }

        return $resources;
    }

    private function details(string $title, string $category): array
    {
        return ['title' => $title, 'category' => $category, 'session_code' => 'ordinaire', 'modality' => 'submission',
            'maximum_points' => '20.00', 'weight' => '50.00', 'attempt_limit' => 2, 'late_minutes' => 0,
            'group_work' => false, 'feedback_policy' => 'validated', 'body' => 'Sujet exclusivement fictif de recette.', 'reason' => self::REASON];
    }

    public function deliberation(User $admin, User $publisher, array $catalog, string $faculty, array $sources, string $levelKey = 'L1', array $decisions = [], ?bool $publish = null, ?User $secretary = null): array
    {
        $secretary ??= $publisher;
        $version = $catalog['versions']['past'][$faculty];
        $code = 'RECETTEV2-'.strtoupper($faculty).'-2526'.($levelKey === 'L1' ? '' : '-'.$levelKey);
        $rules = app(ResultRules::class);
        $rule = AcademicResultRule::where('curriculum_version_id', $version->id)->where('code', $code)->first()
            ?? $rules->create($version, $admin, [
                'level_id' => $catalog['levels'][$faculty][$levelKey]->id, 'code' => $code, 'session_code' => 'ordinaire',
                'effective_on' => '2025-10-01', 'reference' => self::REASON,
                'configuration' => [
                    'scale' => 2000, 'precision' => 2, 'rounding' => 'half_up', 'weighting' => 'uniform',
                    'ec_pass' => 1000, 'ue_pass' => 1000, 'compensation' => 'none', 'credit_label' => 'crédits fictifs',
                    'allow_equivalence' => false, 'appeal_days' => 7, 'quorum' => 2, 'items' => $sources,
                    'decisions' => [
                        'pass_demo' => ['label' => 'Réussite '.$levelKey.' — décision fictive', 'permits_incomplete' => false,
                            'permits_eliminatory' => false, 'progression' => 'next', 'minimum_credits' => 1000],
                        'repeat_demo' => ['label' => 'Échec '.$levelKey.' / redoublement — décision fictive', 'permits_incomplete' => false,
                            'permits_eliminatory' => false, 'progression' => 'same', 'retake' => 'whole_year'],
                        'resit_demo' => ['label' => 'Rattrapage requis — décision fictive', 'permits_incomplete' => false,
                            'permits_eliminatory' => false, 'progression' => 'none'],
                    ],
                ],
            ]);
        if (! $rule->approved_at) {
            $rules->approve($rule, $publisher, self::REASON);
        }
        $deliberations = app(Deliberations::class);
        $run = AcademicDeliberation::where('academic_result_rule_id', $rule->id)->latest('edition')->first()
            ?? $deliberations->prepare($rule->fresh(), $admin, ['meeting_at' => '2026-06-20T09:00',
                'chair' => $admin->id, 'secretary' => $secretary->id, 'members' => [$admin->id, $secretary->id], 'reason' => self::REASON]);
        if ($run->refresh()->state === 'prepared') {
            $deliberations->transition($run, $admin, ['action' => 'open', 'revision' => $run->revision,
                'attendance' => [$admin->id, $secretary->id], 'reason' => self::REASON]);
        }
        if ($run->fresh()->state === 'open') {
            foreach ($run->results()->with('enrollment.profile.user')->get() as $result) {
                $local = strstr($result->enrollment->profile->user->email, '@', true);
                $decision = $decisions[$local] ?? match ($local) {
                    'etudiant.med', 'etudiant.droit' => 'pass_demo',
                    'etudiant.med2' => 'repeat_demo',
                    'etudiant.med3', 'etudiant.droit2' => 'resit_demo',
                    default => throw new LogicException('Un dossier inattendu ne peut recevoir une décision fictive.'),
                };
                if ($result->decision === null) {
                    $deliberations->decision($run, $result, $admin, ['revision' => $run->fresh()->revision,
                        'decision' => $decision, 'reason' => self::REASON]);
                }
            }
            $deliberations->transition($run, $admin, ['action' => 'approve', 'revision' => $run->fresh()->revision, 'reason' => self::REASON]);
        }
        if (($publish ?? ($faculty === 'med')) && $run->fresh()->state === 'approved') {
            $deliberations->transition($run, $publisher, ['action' => 'publish', 'revision' => $run->fresh()->revision,
                'reason' => self::REASON, 'notify' => false]);
        }

        return [$rule->fresh(), $run->fresh()];
    }
}
