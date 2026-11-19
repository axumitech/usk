<?php

declare(strict_types=1);

use Database\Seeders\FinalQa\UniversitySimulation;
use Database\Seeders\RecetteV2\RecipeDatabase;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require dirname(__DIR__, 2).'/recette-manuelle-v2/scripts/bootstrap.php';

try {
    $mode = $argv[1] ?? '';
    if (PHP_SAPI !== 'cli' || ! in_array($mode, ['init', 'simulate', 'simulate-progression', 'verify'], true)) {
        throw new RuntimeException('Usage : php docs/qa-e2e-final/scripts/university.php init|simulate|simulate-progression|verify');
    }
    if (! in_array(strtolower((string) getenv('APP_ENV')), ['', 'local', 'testing', 'qa'], true)) {
        throw new RuntimeException('Cette commande exige un environnement local de recette.');
    }
    $root = rtrim((string) getenv('USK_QA_FINAL_ROOT'), '/\\');
    if (! preg_match('/^usk_qa_e2e(?:[-_][a-z0-9_-]+)?$/i', basename(str_replace('\\', '/', $root)))
        || ! preg_match('~^(?:[A-Za-z]:[/\\\\]|/(?!/))~', $root)
        || str_starts_with($root, '\\\\') || ! is_dir(dirname($root)) || is_link($root)) {
        throw new RuntimeException('USK_QA_FINAL_ROOT doit être un chemin absolu local sous un parent existant et se terminer par usk_qa_e2e ou usk_qa_e2e-<suffixe>.');
    }
    $new = ! file_exists($root);
    if ($mode === 'simulate-progression' && (! $new || ! preg_match('/^usk_qa_e2e-progression(?:-[a-z0-9_-]+)?$/i', basename(str_replace('\\', '/', $root))))) {
        throw new RuntimeException('La préparation des deux témoins exige une nouvelle racine privée usk_qa_e2e-progression.');
    }
    if ($new && $mode === 'verify') {
        throw new RuntimeException('Profil QA absent.');
    }
    if (! $new && ! is_file($root.'/final-qa.json')) {
        throw new RuntimeException('Ce répertoire préexistant ne porte pas le marqueur QA final.');
    }
    putenv('USK_RECETTE_V2_ROOT='.$root);
    $app = recetteApplication($new);
    if ($new) {
        $profile = RecipeDatabase::profile($root);
        $handle = fopen($root.'/final-qa.json', 'x');
        if (! $handle) {
            throw new RuntimeException('Impossible de créer le marqueur QA final.');
        }
        fwrite($handle, json_encode(['token' => $profile['token'], 'password' => bin2hex(random_bytes(18))], JSON_THROW_ON_ERROR));
        fclose($handle);
        chmod($root.'/final-qa.json', 0600);
    }
    $kernel = $app->make(Kernel::class);
    $kernel->bootstrap();
    $simulation = app(UniversitySimulation::class);
    $simulation->guard();
    if ($mode === 'verify') {
        DB::statement('PRAGMA query_only = ON');
        echo json_encode($simulation->verify(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR).PHP_EOL;
        exit(0);
    }
    if ($kernel->call('migrate', ['--force' => true]) !== 0) {
        throw new RuntimeException('Échec des migrations du profil QA dédié.');
    }
    $simulation->bootstrap();
    if ($mode === 'simulate-progression') {
        $simulation->populate(progressionWitnesses: true);
        echo "Témoins de progression préparés : deux résultats publiés, aucune réinscription.".PHP_EOL;
    } elseif ($mode === 'simulate') {
        $simulation->populate();
        echo json_encode($simulation->verify(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR).PHP_EOL;
    } else {
        echo "Profil initialisé. Compte institutionnel fictif : admin@usk.test. Mot de passe dans final-qa.json du profil privé.".PHP_EOL;
    }
} catch (Throwable $exception) {
    $message = $exception->getMessage();
    if ($exception instanceof Illuminate\Database\QueryException) {
        $driver = $exception->errorInfo[2] ?? '';
        $detail = preg_match('/(?:UNIQUE constraint failed|NOT NULL constraint failed|CHECK constraint failed):\s*([a-zA-Z0-9_., ]+)/', $driver, $matches)
            ? $matches[0]
            : (str_contains($driver, 'FOREIGN KEY constraint failed') ? 'FOREIGN KEY constraint failed' : 'Contrainte de base de données');
        $message = 'SQLSTATE '.$exception->getCode().' '.$detail;
    }
    foreach ($exception->getTrace() as $frame) {
        $file = str_replace('\\', '/', $frame['file'] ?? '');
        if (str_contains($file, '/database/seeders/')) {
            $message .= ' — '.basename($file).':'.$frame['line'];
            break;
        }
    }
    fwrite(STDERR, $message.PHP_EOL);
    if ($exception instanceof Illuminate\Validation\ValidationException) {
        fwrite(STDERR, json_encode($exception->errors(), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR).PHP_EOL);
    }
    exit(1);
}
