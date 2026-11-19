<?php

declare(strict_types=1);

use App\Models\Student\AcademicOfficialResult;
use App\Models\User;
use Database\Seeders\FinalQa\UniversityAccounts;
use Database\Seeders\FinalQa\UniversityCatalog;
use Database\Seeders\FinalQa\UniversityFixtureStorage;
use Database\Seeders\FinalQa\UniversityPopulation;
use Database\Seeders\FinalQa\UniversitySimulation;
use Database\Seeders\RecetteV2\HistoricalAcademicFixtures;
use Database\Seeders\RecetteV2\StudentFinanceFixtures;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;

function prepareJuryFixture(): void
{
    $root = (string) getenv('USK_QA_FINAL_ROOT');
    if (PHP_SAPI !== 'cli' || ! preg_match('/^usk_qa_e2e-jury(?:-[a-z0-9_-]+)?$/i', basename(str_replace('\\', '/', $root)))
        || ! is_file($root.'/final-qa.json') || ! in_array((string) getenv('APP_ENV'), ['', 'local', 'testing'], true)) {
        throw new RuntimeException('Initialisez d’abord une racine QA privée de jury.');
    }
    putenv('USK_RECETTE_V2_ROOT='.$root);
    require dirname(__DIR__, 2).'/recette-manuelle-v2/scripts/bootstrap.php';
    $app = recetteApplication();
    $app->make(Kernel::class)->bootstrap();
    app(UniversitySimulation::class)->guard();
    if (User::count() !== 1 || \App\Models\AcademicYear::exists()) {
        throw new RuntimeException('Un profil neuf avec le seul administrateur initial est requis.');
    }
    Mail::fake();
    config(['queue.default' => 'sync']);
    UniversityFixtureStorage::transaction(function () use ($root) {
        $admin = User::where('email', 'admin@usk.test')->sole();
        $accounts = new UniversityAccounts(json_decode(file_get_contents($root.'/final-qa.json'), true, 512, JSON_THROW_ON_ERROR)['password']);
        $catalogue = app(UniversityCatalog::class);
        $finance = app(StudentFinanceFixtures::class);
        [$catalog, $entries] = Carbon::withTestNow('2025-10-05 10:00:00 Africa/Kinshasa', function () use ($catalogue, $finance, $accounts, $admin) {
            [$name, $departments] = UniversityCatalog::FACULTIES['dr'];
            $catalog = $catalogue->startYear($catalogue->create($admin, $accounts, ['dr' => [$name, ['dpr' => $departments['dpr']]]]), $admin, 'past');
            $finance->tariffs($admin, $catalog, 'past');
            $students = app(UniversityPopulation::class)->historical($catalog, $admin, $accounts, [3]);

            return [$catalog, $students['dpr']['L1']];
        });
        $professor = $catalog['professors']['dpr'];
        $portrait = 'professors/jury-fictif.png';
        Storage::disk('public')->put($portrait, file_get_contents(__DIR__.'/fixtures/illustration.png'));
        $professor->forceFill(['photo' => $portrait])->save();
        $teacher = User::findOrFail($professor->user_id);
        $dean = User::where('email', 'dean.dr@usk.test')->sole();
        $history = app(HistoricalAcademicFixtures::class);
        $sources = [];
        foreach ($catalog['offerings']['past']['dpr']['L1'] as $index => $offer) {
            $resources = $history->work($offer, $teacher, $admin, $entries, $index, ['etudiant.dpr.04' => ['11.00', '8.00']]);
            foreach ($resources as $resource) {
                $sources[$offer->curriculum_item_id][$resource->assessment()->sole()->id] = 5000;
            }
        }
        Carbon::withTestNow('2026-06-20 10:00:00 Africa/Kinshasa', fn () => $history->deliberation(
            $admin, $dean, $catalog, 'dpr', $sources, 'L1', ['etudiant.dpr.04' => 'resit_demo'], true));
        $ordinary = AcademicOfficialResult::published()->sole();
        if ($ordinary->decision !== 'resit_demo' || $ordinary->snapshot['credits']['earned'] !== 0
            || $ordinary->snapshot['credits']['planned'] !== 1000 || $ordinary->snapshot['annual'] !== '9.50') {
            throw new RuntimeException('Le résultat ordinaire doit comporter un EC acquis et un EC à reprendre.');
        }
    });
    file_put_contents($root.'/jury-temoin.json', json_encode(['date' => '2026-06-23', 'port' => 8072], JSON_THROW_ON_ERROR));
    echo "Jury ordinaire publié pour un seul étudiant, EC à 11 et 8 sur 20, UE de 10 crédits en attente de validation.".PHP_EOL;
}

try {
    prepareJuryFixture();
} catch (Throwable $error) {
    $reason = match (true) {
        $error instanceof \Illuminate\Validation\ValidationException => 'Validation des champs '.implode(', ', array_keys($error->errors())),
        $error instanceof \Illuminate\Database\QueryException => 'Contrainte de base de données '.$error->getCode(),
        $error::class === RuntimeException::class && $error->getFile() === __FILE__ => $error->getMessage(),
        default => 'Erreur '.$error::class,
    };
    fwrite(STDERR, 'Échec du provisionnement du jury : '.$reason.' ('.basename($error->getFile()).':'.$error->getLine().').'.PHP_EOL);
    exit(1);
}
