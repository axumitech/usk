<?php

declare(strict_types=1);

use App\Models\AcademicYear;
use App\Models\Level;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicOfficialResult;
use App\Models\Student\AcademicProgression;
use App\Modules\Student\Application\Services\AcademicProgressionService;
use Database\Seeders\RecetteV2\RecipeDatabase;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

$root = (string) getenv('USK_RECETTE_V2_ROOT');
if (! preg_match('/^usk_qa_e2e-progression(?:-[a-z0-9_-]+)?$/i', basename(str_replace('\\', '/', $root)))
    || getenv('USK_RECETTE_V2_PORT') !== '8071' || getenv('USK_RECETTE_V2_BUILD_ONLY') !== 'true') {
    throw new RuntimeException('Deux témoins de progression attendus sur le port local 8071.');
}
$server = realpath(getenv('USK_QA_SERVER_REPO') ?: dirname(__DIR__, 3));
require $server.'/docs/recette-manuelle-v2/scripts/bootstrap.php';
$app = recetteApplication();
$app->make(Kernel::class)->bootstrap();
RecipeDatabase::assertConnection();
DB::statement('PRAGMA query_only = ON');
$year = AcademicYear::where('title', '2026-2027')->where('status', 'open')->sole();
$fields = ['id', 'matricule', 'level_id', 'academic_year_id', 'admission_cohort_id', 'academic_promotion_id', 'curriculum_version_id', 'enrollment_status'];
$rows = [];
foreach (['advance' => '02', 'repeat' => '03'] as $kind => $suffix) {
    $email = 'etudiant.dpr.'.$suffix.'@usk.test';
    $source = AcademicEnrollment::whereHas('profile.user', fn ($q) => $q->where('email', $email))
        ->whereHas('academicYear', fn ($q) => $q->where('title', '2025-2026')->where('status', 'closed'))->sole();
    $result = AcademicOfficialResult::published()->where('academic_enrollment_id', $source->id)->sole();
    $level = Level::where('code', $kind === 'advance' ? 'DPR-L2' : 'DPR-L1')->sole();
    $version = app(AcademicProgressionService::class)->targetVersions($source, $year->id, $level->id)->sole();
    $target = $source->profile->enrollments()->where('academic_year_id', $year->id)->get();
    if ($target->count() > 1) {
        throw new RuntimeException('Inscription annuelle dupliquée.');
    }
    $plan = AcademicProgression::where('source_enrollment_id', $source->id)->get();
    if ($plan->count() > 1) {
        throw new RuntimeException('Décision de progression dupliquée.');
    }
    $pastPayments = $source->payments()->orderBy('id')->get(['id', 'status', 'amount_cents', 'currency']);
    $targetTuition = $target->first()?->obligations()->where('kind', 'tuition')->orderBy('installment')
        ->get(['installment', 'amount_cents', 'currency', 'due_at']) ?? [];
    $rows[$kind] = [
        'email' => $email, 'source' => $source->only($fields),
        'official' => ['id' => $result->id, 'decision' => $result->decision, 'reference' => $result->reference,
            'snapshot_sha256' => hash('sha256', json_encode($result->snapshot, JSON_THROW_ON_ERROR))],
        'destination' => ['year_id' => $year->id, 'level_id' => $level->id, 'level' => $level->title, 'version_id' => $version->id,
            'promotion_id' => DB::table('academic_promotions')->where('academic_program_id', $version->academic_program_id)
                ->where('academic_year_id', $year->id)->where('level_id', $level->id)->where('is_active', true)->sole()->id],
        'decision' => $plan->first()?->only(['id', 'source_enrollment_id', 'target_enrollment_id', 'academic_official_result_id', 'kind']),
        'target' => $target->first()?->only($fields),
        'past_payments' => $pastPayments, 'target_tuition' => $targetTuition,
    ];
}
echo json_encode($rows, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
