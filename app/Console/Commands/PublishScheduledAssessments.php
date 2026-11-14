<?php

namespace App\Console\Commands;

use App\Models\Student\AcademicAssessment;
use App\Modules\Assessment\Application\AssessmentWorkflow;
use Illuminate\Console\Command;
use Throwable;

final class PublishScheduledAssessments extends Command
{
    protected $signature = 'assessment:publish-scheduled';

    protected $description = 'Publier les évaluations programmées arrivées à échéance.';

    public function handle(AssessmentWorkflow $workflow): int
    {
        $results = ['published' => 0, 'blocked' => 0, 'skipped' => 0];
        $errors = 0;
        AcademicAssessment::where('state', 'draft')->whereNull('scheduled_publish_error')
            ->where('scheduled_publish_at', '<=', now())->with('resource:id,academic_offering_id')
            ->eachById(function (AcademicAssessment $assessment) use ($workflow, &$results, &$errors) {
                try {
                    $results[$workflow->publishScheduled($assessment)]++;
                } catch (Throwable $error) {
                    report($error);
                    $errors++;
                    $this->warn('La publication de l’évaluation '.$assessment->id.' sera retentée.');
                }
            });

        $this->info("Évaluations publiées : {$results['published']}. Programmations bloquées : {$results['blocked']}.");

        return $errors ? self::FAILURE : self::SUCCESS;
    }
}
