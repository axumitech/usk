<?php

declare(strict_types=1);

use App\Models\AcademicStructure\AcademicProgram;
use App\Models\AcademicStructure\AcademicPromotion;
use App\Models\AcademicStructure\CurriculumVersion;
use App\Models\Classes;
use App\Models\Intake;
use App\Models\Student\AcademicOffering;
use App\Models\User;
use App\Modules\AcademicStructure\Application\Services\StructureService;
use Database\Seeders\FinalQa\UniversityAccounts;
use Database\Seeders\FinalQa\UniversityCatalog;
use Database\Seeders\FinalQa\UniversitySimulation;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

function prepareAttachment(): array
{
    $root = realpath((string) getenv('USK_QA_FINAL_ROOT'));
    $server = realpath(getenv('USK_QA_SERVER_REPO') ?: dirname(__DIR__, 3));
    if (PHP_SAPI !== 'cli' || ! $root || ! $server || ! preg_match('/^usk_qa_e2e-rattachement(?:-[a-z0-9_-]+)?$/i', basename($root))
        || ! is_file($root.'/final-qa.json')) {
        throw new RuntimeException('Initialisez un profil signé réservé au rattachement.');
    }
    putenv('USK_RECETTE_V2_ROOT='.$root);
    require $server.'/docs/recette-manuelle-v2/scripts/bootstrap.php';
    $app = recetteApplication();
    $app->make(Kernel::class)->bootstrap();
    app(UniversitySimulation::class)->guard();
    Mail::fake();
    $fixture = DB::transaction(function () use ($root) {
        $admin = User::where('email', 'admin@usk.test')->sole();
        if (! AcademicProgram::exists()) {
            $catalog = app(UniversityCatalog::class);
            $accounts = new UniversityAccounts(json_decode(file_get_contents($root.'/final-qa.json'), true, 512, JSON_THROW_ON_ERROR)['password']);
            $catalog->startYear($catalog->create($admin, $accounts, ['dr' => ['Droit', ['dpu' => ['Droit public', 'LIC']]]]), $admin, 'current');
        }
        $program = AcademicProgram::where('code', 'QA-DPU')->sole();
        $level = $program->levels()->where('levels.code', 'DPU-L1')->sole();
        $source = AcademicPromotion::where('academic_program_id', $program->id)->where('level_id', $level->id)->sole();
        $version = CurriculumVersion::where('academic_year_id', $source->academic_year_id)
            ->where('academic_program_id', $program->id)->where('status', 'published')->sole();
        $item = $version->units()->where('level_id', $level->id)->firstOrFail()->items()->firstOrFail();
        $data = ['revision' => 0, 'is_active' => true, 'reason' => 'Simulation de rattachement historique en recette locale.'];
        $service = app(StructureService::class);
        $alternate = AcademicProgram::where('code', 'QA-DROIT-MIXTE')->first() ?? $service->save('program', $data + [
            'code' => 'QA-DROIT-MIXTE', 'name' => 'Parcours juridique comparé fictif', 'faculty_id' => $program->faculty_id,
            'academic_cycle_id' => $program->academic_cycle_id, 'level_ids' => [$level->id],
        ], $admin);
        $other = AcademicPromotion::where('academic_program_id', $alternate->id)->where('level_id', $level->id)->first() ?? $service->save('promotion', $data + [
            'academic_program_id' => $alternate->id, 'level_id' => $level->id, 'academic_year_id' => $source->academic_year_id,
            'code' => 'QA-CONTRASTE-L1', 'name' => 'Promotion de droit comparé fictive',
        ], $admin);
        $groups = [];
        foreach (['versionne', 'historique'] as $type) {
            $intake = Intake::create(['name' => 'Témoin '.$type.' '.bin2hex(random_bytes(4))]);
            $group = Classes::create(['faculty_id' => $program->faculty_id, 'level_id' => $level->id, 'intake_id' => $intake->id, 'status' => 'OPEN']);
            // Recréer un import antérieur au rattachement. Le service actuel exige déjà une promotion pour créer l’offre versionnée.
            $offer = AcademicOffering::create(['class_id' => $group->id, 'level_id' => $level->id, 'academic_year_id' => $source->academic_year_id,
                'course_id' => $item->source_course_id, 'curriculum_item_id' => $type === 'versionne' ? $item->id : null]);
            $groups[$type] = ['id' => $group->id, 'offre' => $offer->id];
        }

        return ['annee' => $source->academic_year_id, 'faculte' => $program->faculty_id, 'niveau' => $level->id, 'maquette' => $version->id,
            'programme' => ['id' => $program->id, 'promotion' => $source->id, 'code' => $source->code],
            'autre' => ['id' => $alternate->id, 'promotion' => $other->id, 'code' => $other->code], 'groupes' => $groups];
    });
    file_put_contents($root.'/rattachement-temoin.json', json_encode($fixture, JSON_THROW_ON_ERROR));

    return $fixture;
}

try {
    echo json_encode(prepareAttachment(), JSON_THROW_ON_ERROR).PHP_EOL;
} catch (Throwable $error) {
    $message = $error instanceof Illuminate\Validation\ValidationException ? implode(' ', array_merge(...array_values($error->errors())))
        : ($error instanceof Illuminate\Database\QueryException ? 'Contrainte de base de données '.$error->getCode() : $error::class);
    fwrite(STDERR, 'Préparation refusée : '.$message.PHP_EOL);
    exit(1);
}
