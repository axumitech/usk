<?php

declare(strict_types=1);

use App\Http\Middleware\HandleInertiaRequests;
use App\Models\Student\AcademicOfficialResult;
use App\Models\Student\AcademicResultDocument;
use App\Models\User;
use App\Notifications\AcademicScheduleNotice;
use Database\Seeders\RecetteV2\RecipeDatabase;
use Illuminate\Contracts\Console\Kernel as Console;
use Illuminate\Contracts\Http\Kernel as Http;
use Illuminate\Http\Request;
use Illuminate\Queue\WorkerOptions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;

require dirname(__DIR__, 2).'/recette-manuelle-v2/scripts/bootstrap.php';

function assertVolume(bool $ok, string $reason): void
{
    if (! $ok) {
        throw new RuntimeException($reason);
    }
}

function summaryVolume(array $values): array
{
    sort($values, SORT_NUMERIC);
    $n = count($values);

    return ['n' => $n, 'median' => round(($values[(int) floor(($n - 1) / 2)] + $values[(int) ceil(($n - 1) / 2)]) / 2, 2),
        'p95' => round($values[(int) ceil($n * .95) - 1], 2), 'min' => min($values), 'max' => max($values)];
}

function clockMs(int $started): float
{
    return round((hrtime(true) - $started) / 1e6, 2);
}

try {
    $root = realpath((string) getenv('USK_RECETTE_V2_ROOT'));
    assertVolume(PHP_SAPI === 'cli' && in_array(getenv('APP_ENV') ?: 'local', ['local', 'testing'], true) && $root !== false
        && ! str_starts_with($root, '\\\\') && basename($root) === 'usk_qa_e2e-volume'
        && is_file($root.'/volume-qa') && ! is_link($root.'/volume-qa')
        && trim(file_get_contents($root.'/volume-qa')) === 'Charge synthétique locale', 'Le profil de charge dédié est requis.');
    $app = recetteApplication();
    $app->make(Console::class)->bootstrap();
    RecipeDatabase::assertConnection();
    assertVolume(DB::table('student_profiles')->count() === 5000 && ! User::where('email', 'not like', '%@usk.test')->exists()
        && config('queue.default') === 'database', 'La population ou la file du profil de volume est inattendue.');
    $options = $argv[1] ?? 'run';
    $n = 10;
    if ($options === 'worker') {
        $queue = $argv[2] ?? '';
        assertVolume((bool) preg_match('/^qa-perf-[a-f0-9]{16}$/D', $queue), 'La file de mesure dédiée est requise.');
        $worker = $app['queue.worker'];
        $settings = new WorkerOptions(name: 'qa-perf', maxTries: 1, sleep: 0, timeout: 30);
        $times = [];
        $sqlCounts = [];
        $sql = 0;
        DB::listen(static function () use (&$sql) { $sql++; });
        for ($i = 0; $i <= $n; $i++) {
            $sql = 0;
            $started = hrtime(true);
            $worker->runNextJob('database', $queue, $settings);
            $duration = clockMs($started);
            $count = $sql;
            if ($i > 0) {
                $times[] = $duration;
                $sqlCounts[] = $count;
            }
        }
        echo json_encode(['traitement_ms' => summaryVolume($times), 'requetes_sql' => summaryVolume($sqlCounts)], JSON_THROW_ON_ERROR).PHP_EOL;
        exit(0);
    }
    assertVolume($options === 'run', 'Commande de mesure inconnue.');
    $admin = User::where('email', 'admin@usk.test')->sole();
    $http = $app->make(Http::class);
    $counts = [];
    DB::listen(static function ($event) use (&$counts) {
        $sql = preg_replace('/\\bin\\s*\\(\\s*(?:[0-9?]+\\s*(?:,\\s*)?)+\\)/i', 'in (?)', strtolower($event->sql));
        if (preg_match('/^select\\b.*?\\bfrom\\s+["\x60]?([a-z0-9_]+)/i', $sql, $match)) {
            $key = $match[1].'-'.substr(hash('sha256', $sql), 0, 8);
        } else {
            $key = 'autres';
        }
        $counts[$key] = ($counts[$key] ?? 0) + 1;
    });
    $report = ['profils' => 5000, 'paiements' => DB::table('student_payments')->count(), 'echauffements_par_mesure' => 1,
        'moteur' => 'SQLite local, noyau HTTP Laravel, requêtes séquentielles', 'annuaire' => []];
    $stage = storage_path('framework/pdf-volume-'.bin2hex(random_bytes(8)));
    assertVolume(mkdir($stage, 0700), 'Création du disque temporaire PDF impossible.');
    $originalDisk = config('filesystems.disks.local.root');
    try {
        DB::beginTransaction();
        foreach (['QA-VOL-00011' => 1, 'QA-VOL-0001' => 10, 'QA-VOL' => 15] as $term => $expectedRows) {
            $times = $sqlCounts = [];
            $repetitions = [];
            for ($i = 0; $i <= $n; $i++) {
                $app['auth']->guard()->setUser($admin);
                $request = Request::create('/app/dashboard/admin/student-academic', 'GET', ['tab' => 'students', 'q' => $term], server: ['HTTP_X_INERTIA' => 'true', 'HTTP_ACCEPT' => 'text/html']);
                $request->headers->set('X-Inertia-Version', $app->make(HandleInertiaRequests::class)->version($request) ?? '');
                $counts = [];
                $start = hrtime(true);
                $response = $http->handle($request);
                $http->terminate($request, $response);
                $elapsed = clockMs($start);
                $statements = $counts;
                $page = json_decode($response->getContent(), true);
                $rows = count($page['props']['students']['data'] ?? []);
                assertVolume($response->getStatusCode() === 200 && $rows === $expectedRows, 'Annuaire : HTTP '.$response->getStatusCode().' et '.$rows.' dossiers pour '.$expectedRows.' attendus.');
                if ($i > 0) {
                    $times[] = $elapsed;
                    $sqlCounts[] = array_sum($statements);
                    foreach ($statements as $fingerprint => $count) {
                        if ($count > 1) {
                            $repetitions[$fingerprint] = max($count, $repetitions[$fingerprint] ?? 0);
                        }
                    }
                }
            }
            arsort($repetitions);
            $report['annuaire'][] = ['lignes_affichees' => $expectedRows, 'temps_ms' => summaryVolume($times),
                'requetes_sql' => summaryVolume($sqlCounts), 'formes_repetees_max' => $repetitions];
        }
        config(['filesystems.disks.local.root' => $stage]);
        Storage::forgetDisk('local');
        $result = AcademicOfficialResult::published()->with('enrollment.profile.user')
            ->whereNotIn('id', AcademicResultDocument::where('document_key', 'like', 'report:%')->whereNotNull('academic_official_result_id')->select('academic_official_result_id'))->firstOrFail();
        $entry = $result->enrollment;
        $route = route('dashboard.student.results.document', ['reference' => $result->reference, 'kind' => 'report', 'academic' => $entry->id], false);
        $times = $sqlCounts = $sizes = [];
        for ($i = 0; $i <= $n; $i++) {
            DB::beginTransaction();
            try {
                $app['auth']->guard()->setUser($entry->profile->user);
                $request = Request::create($route);
                $counts = [];
                $start = hrtime(true);
                $response = $http->handle($request);
                $http->terminate($request, $response);
                $elapsed = clockMs($start);
                $queries = array_sum($counts);
                $bytes = $response->getContent();
                assertVolume($response->getStatusCode() === 200 && str_starts_with((string) $bytes, '%PDF-'), 'Le bulletin PDF attendu est indisponible (HTTP '.$response->getStatusCode().').');
                $document = AcademicResultDocument::where('academic_official_result_id', $result->id)->where('document_key', 'like', 'report:%')->sole();
                assertVolume(hash_equals($document->sha256, hash('sha256', $bytes)), 'Empreinte du bulletin invalide.');
                if ($i > 0) {
                    $times[] = $elapsed;
                    $sqlCounts[] = $queries;
                    $sizes[] = strlen($bytes);
                }
            } finally {
                DB::rollBack();
            }
        }
        $report['generation_bulletin_pdf'] = ['temps_ms' => summaryVolume($times), 'requetes_sql' => summaryVolume($sqlCounts),
            'octets_min' => min($sizes), 'octets_max' => max($sizes), 'empreintes_conformes' => $n];
    } finally {
        if (DB::transactionLevel()) {
            DB::rollBack();
        }
        config(['filesystems.disks.local.root' => $originalDisk]);
        Storage::forgetDisk('local');
        File::deleteDirectory($stage);
    }

    $queue = 'qa-perf-'.bin2hex(random_bytes(8));
    $recipient = User::where('email', 'etudiant.med@usk.test')->sole();
    $enqueue = [];
    for ($i = 0; $i <= $n; $i++) {
        $start = hrtime(true);
        $recipient->notify((new AcademicScheduleNotice(['reference' => 'Notification de mesure fictive', 'qa_volume' => $queue]))->onConnection('database')->onQueue($queue));
        if ($i > 0) {
            $enqueue[] = clockMs($start);
        }
    }
    assertVolume(DB::table('jobs')->where('queue', $queue)->count() === $n + 1, 'Nombre de travaux placé dans la file incorrect.');
    $process = new Process([PHP_BINARY, __FILE__, 'worker', $queue], base_path());
    $process->setTimeout(180);
    $start = hrtime(true);
    $process->mustRun();
    $workerElapsed = clockMs($start);
    $workerReport = json_decode($process->getOutput(), true, 512, JSON_THROW_ON_ERROR);
    $delivered = $recipient->notifications()->where('type', AcademicScheduleNotice::class)->where('data->qa_volume', $queue)->count();
    $remaining = DB::table('jobs')->where('queue', $queue)->count();
    $failed = DB::table('failed_jobs')->where('queue', $queue)->count();
    assertVolume($delivered === $n + 1 && $remaining === 0 && $failed === 0, 'Incohérence entre nombre de travaux et notifications.');
    $report['file'] = ['transport' => 'database', 'canal' => 'notification applicative', 'travaux' => $n + 1, 'notifies' => $delivered,
        'restants' => $remaining, 'echecs' => $failed, 'envoi_ms' => summaryVolume($enqueue), 'worker_total_ms' => $workerElapsed] + $workerReport;
    echo json_encode($report, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE).PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, $error::class.' — '.basename($error->getFile()).':'.$error->getLine().PHP_EOL);
    if ($error instanceof RuntimeException && $error->getFile() === __FILE__) {
        fwrite(STDERR, $error->getMessage().PHP_EOL);
    }
    exit(1);
}

