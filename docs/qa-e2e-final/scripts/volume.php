<?php

declare(strict_types=1);

use App\Models\User;
use Database\Seeders\LocalUniversityRecetteSeeder;
use Database\Seeders\RecetteV2\RecipeDatabase;
use Illuminate\Contracts\Console\Kernel as Console;
use Illuminate\Contracts\Http\Kernel as Http;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

$server = realpath(getenv('USK_QA_SERVER_REPO') ?: dirname(__DIR__, 3));
require $server.'/docs/recette-manuelle-v2/scripts/bootstrap.php';

$root = getenv('USK_RECETTE_V2_ROOT') ?: '';
if (PHP_SAPI !== 'cli' || ! in_array(getenv('APP_ENV') ?: 'local', ['local', 'testing'], true)
    || basename(str_replace('\\', '/', $root)) !== 'usk_qa_e2e-volume'
    || ! realpath(dirname($root)) || is_link($root) || str_starts_with($root, '\\\\')
    || ! preg_match('~^(?:[a-z]:[/\\\\]|/(?!/))~i', $root)) {
    throw new RuntimeException('Choisir un nouveau profil local absolu nommé usk_qa_e2e-volume.');
}
$new = ! file_exists($root);
if (! $new && ! is_file($root.'/volume-qa')) {
    throw new RuntimeException('Ce profil préexistant ne porte pas le marqueur de charge.');
}
$app = recetteApplication($new);
$console = $app->make(Console::class);
$console->bootstrap();
set_exception_handler(static function (Throwable $error): void {
    fwrite(STDERR, $error::class.' ('.$error->getCode().') '.basename($error->getFile()).':'.$error->getLine().PHP_EOL);
    if ($error->getFile() === __FILE__) { fwrite(STDERR, $error->getMessage().PHP_EOL); }
    foreach ($error->getTrace() as $frame) {
        $file = str_replace('\\', '/', $frame['file'] ?? '');
        if ($file && ! str_contains($file, '/vendor/')) {
            fwrite(STDERR, basename($file).':'.($frame['line'] ?? 0).PHP_EOL);
        }
    }
    exit(1);
});
RecipeDatabase::assertConnection();
if ($new) {
    file_put_contents($root.'/volume-qa', 'Charge synthétique locale');
}
if ($console->call('migrate', ['--force' => true]) !== 0
    || $console->call('db:seed', ['--class' => LocalUniversityRecetteSeeder::class]) !== 0) {
    throw new RuntimeException('Préparation des fixtures de référence impossible.');
}
if (DB::table('users')->where('email', 'not like', '%@usk.test')->exists()) {
    throw new RuntimeException('Profil de charge non fictif.');
}
$admin = User::where('email', 'admin@usk.test')->firstOrFail();
$student = User::where('email', 'etudiant.med@usk.test')->firstOrFail();
$year = DB::table('academic_years')->where('status', 'open')->sole()->id;
$levels = DB::table('academic_enrollments')->where('academic_year_id', $year)->distinct()->pluck('level_id')->all();
$role = DB::table('roles')->where('guard_name', 'web')->where('name', 'student')->sole()->id;
$initial = DB::table('student_profiles')->count();
if ($initial !== 5000) {
    if ($initial !== 7 || ! $levels) { throw new RuntimeException('La population de départ diffère du jeu V2 attendu.'); }
    $now = now();
    $timestamps = ['created_at' => $now, 'updated_at' => $now];
    DB::transaction(function () use ($initial, $timestamps, $now, $levels, $admin, $student, $year, $role) {
        for ($n = 1; $n <= 5000 - $initial; $n++) {
            $code = sprintf('QA-VOL-%05d', $n);
            $user = DB::table('users')->insertGetId($timestamps + [
                'first_name' => 'Charge', 'last_name' => $code, 'email' => strtolower($code).'@usk.test',
                'password' => $student->getAuthPassword(), 'email_verified_at' => $now,
            ]);
            DB::table('model_has_roles')->insert(['role_id' => $role, 'model_id' => $user, 'model_type' => User::class]);
            $level = $levels[$n % count($levels)];
            $base = ['level_id' => $level, 'academic_year_id' => $year, 'matricule' => $code];
            $application = DB::table('enrollments')->insertGetId($base + $timestamps + [
                'uuid' => (string) Str::uuid(), 'student_id' => $user, 'status' => 'validated',
            ]);
            $profile = DB::table('student_profiles')->insertGetId($timestamps + [
                'user_id' => $user, 'matricule' => $code, 'student_status' => 'active',
            ]);
            $paid = $n % 2 === 0;
            $entry = DB::table('academic_enrollments')->insertGetId($base + $timestamps + [
                'student_profile_id' => $profile, 'application_id' => $application,
                'enrollment_status' => $paid ? 'confirmed' : 'pending_confirmation', 'fee_category' => 'national', 'currency' => 'USD',
            ]);
            $fee = DB::table('student_obligations')->insertGetId($timestamps + [
                'academic_enrollment_id' => $entry, 'kind' => 'tuition', 'title' => 'Tranche fictive pour la charge',
                'installment' => 1, 'amount_cents' => 10000, 'currency' => 'USD',
            ]);
            if ($paid) {
                $payment = DB::table('student_payments')->insertGetId($timestamps + [
                    'academic_enrollment_id' => $entry, 'uuid' => (string) Str::uuid(), 'kind' => 'tuition',
                    'amount_cents' => 3000, 'currency' => 'USD', 'status' => 'confirmed', 'method' => 'bank_transfer',
                    'reference' => $code, 'recorded_by' => $admin->id, 'confirmed_by' => $admin->id, 'confirmed_at' => $now,
                ]);
                DB::table('student_payment_allocations')->insert([
                    'student_payment_id' => $payment, 'student_obligation_id' => $fee, 'amount_cents' => 3000,
                    'allocated_by' => $admin->id, 'created_at' => $now,
                ]);
            }
        }
    });
}
$students = DB::table('student_profiles')->count();
if ($students !== 5000 || DB::select('PRAGMA foreign_key_check') || DB::scalar('PRAGMA quick_check') !== 'ok') {
    throw new RuntimeException('Contrôle du volume ou de l’intégrité en échec.');
}
$times = [];
$queries = [];
DB::listen(function ($q) use (&$queries) { $queries[] = $q->sql; });
$routes = [
    [$admin, '/app/dashboard/admin/student-academic?tab=students&q=QA-VOL'],
    [$admin, '/app/dashboard/admin/student-academic?tab=students&q=QA-VOL-00011'],
    [$admin, '/app/dashboard/admin/student-academic?tab=students&page=2'],
    [$admin, '/app/dashboard/admin/finance?q=QA-VOL'],
    [$student, '/app/dashboard/student/fees'],
];
$http = $app->make(Http::class);
foreach ($routes as [$actor, $route]) {
    $samples = [];
    for ($i = 0; $i < 11; $i++) {
        $app['auth']->guard()->setUser($actor);
        $request = Request::create($route, server: ['HTTP_ACCEPT' => 'text/html']);
        $queries = [];
        $start = hrtime(true);
        $response = $http->handle($request);
        $http->terminate($request, $response);
        if ($response->getStatusCode() !== 200) { throw new RuntimeException($route.' HTTP '.$response->getStatusCode()); }
        if ($i > 0) {
            $samples[] = ['ms' => round((hrtime(true) - $start) / 1e6, 2), 'queries' => count($queries)];
        }
    }
    $ms = array_column($samples, 'ms');
    sort($ms);
    $queryCounts = array_column($samples, 'queries');
    $times[] = ['route' => $route, 'role' => $actor->getRoleNames()->first(), 'n' => count($ms),
        'p50_ms' => $ms[4], 'p95_ms' => $ms[9], 'min_queries' => min($queryCounts), 'max_queries' => max($queryCounts)];
}
echo json_encode(['students' => $students, 'payments' => DB::table('student_payments')->count(),
    'integrity' => 'ok', 'mode' => 'Laravel HTTP kernel, SQLite, sequential', 'routes' => $times],
    JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL;
