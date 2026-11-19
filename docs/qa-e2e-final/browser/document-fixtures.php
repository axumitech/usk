<?php

use App\Models\Student\AcademicEnrollment;
use App\Models\User;
use App\Modules\Documents\Application\DocumentAccess;
use Database\Seeders\FinalQa\UniversitySimulation;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

$server = realpath(getenv('USK_QA_SERVER_REPO') ?: dirname(__DIR__, 3));
require $server.'/docs/recette-manuelle-v2/scripts/bootstrap.php';
$app = recetteApplication();
$app->make(Kernel::class)->bootstrap();
$app->make(UniversitySimulation::class)->guard();
DB::connection()->getPdo()->exec('PRAGMA query_only = ON');
$issuer = User::where('email', 'registrar.med@usk.test')->sole();
$dean = User::where('email', 'dean.med@usk.test')->sole();
$faculty = $issuer->academicFaculties()->where('code', 'MED')->sole();
$access = app(DocumentAccess::class);
$access->staff($issuer, $faculty->id, DocumentAccess::MANAGE);
$access->staff($issuer, $faculty->id, DocumentAccess::ISSUE);
$access->staff($dean, $faculty->id, DocumentAccess::APPROVE);
$students = [];
foreach (['med' => 'etudiant.scl.01@usk.test', 'law' => 'etudiant.dpu.01@usk.test'] as $key => $email) {
    $entry = AcademicEnrollment::whereHas('profile.user', fn ($q) => $q->where('email', $email))
        ->whereHas('academicYear', fn ($q) => $q->where('status', 'open'))
        ->where('enrollment_status', 'confirmed')->with('level')->sole();
    if (($key === 'med') !== ((int) $entry->level->faculty_id === (int) $faculty->id)) {
        throw new RuntimeException('Portée facultaire des inscriptions incohérente.');
    }
    $students[$key] = ['email' => $email, 'entry' => $entry->id];
}
echo json_encode(['accounts' => ['registrar_med' => $issuer->only('id', 'email'), 'dean_med' => $dean->only('id', 'email')], 'students' => $students], JSON_THROW_ON_ERROR);
