<?php

use Database\Seeders\RecetteV2\RecipeDatabase;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

$server = realpath(getenv('USK_QA_SERVER_REPO') ?: dirname(__DIR__, 3));
require $server.'/docs/recette-manuelle-v2/scripts/bootstrap.php';

if (! getenv('USK_RECETTE_V2_ROOT') || ! getenv('USK_RECETTE_V2_PORT') || getenv('USK_RECETTE_V2_BUILD_ONLY') !== 'true') {
    throw new RuntimeException('Le profil QA, son port et le mode compilé doivent être explicites.');
}
$app = recetteApplication();
$app->make(Kernel::class)->bootstrap();
RecipeDatabase::assertConnection();
$pdo = DB::connection()->getPdo();
$pdo->exec('PRAGMA query_only = ON');
if (DB::table('users')->where('email', 'not like', '%@usk.test')->exists()) {
    throw new RuntimeException('Données extérieures au jeu fictif.');
}
$record = [
    'origin' => config('app.url'),
    'finance' => 'sqlite',
    'manifest' => hash_file('sha256', public_path('build/manifest.json')),
];
if (($argv[1] ?? '') === 'ledger') {
    $entry = DB::table('academic_enrollments as e')->join('student_profiles as p', 'p.id', '=', 'e.student_profile_id')
        ->join('users as u', 'u.id', '=', 'p.user_id')->join('academic_years as y', 'y.id', '=', 'e.academic_year_id')
        ->where('u.email', 'etudiant.med3@usk.test')->where('y.title', '2026-2027')->sole(['e.id', 'e.enrollment_status']);
    $rows = DB::table('student_payments')->where('academic_enrollment_id', $entry->id)->orderBy('id');
    $record += ['entry' => $entry->id, 'status' => $entry->enrollment_status,
        'paid' => (int) (clone $rows)->where('status', 'confirmed')->sum('amount_cents'),
        'payments' => $rows->get(['id', 'reference', 'status', 'amount_cents'])->map(fn ($row) => array_values((array) $row)),
        'proofs' => DB::table('student_payment_proofs')->where('academic_enrollment_id', $entry->id)->orderBy('id')
            ->get(['id', 'reference', 'status', 'student_payment_id'])->map(fn ($row) => array_values((array) $row)),
    ];
}
if (($argv[1] ?? '') === 'documents') {
    $record['accounts'] = DB::table('users')->whereIn('email', ['appariteur.med@usk.test', 'doyen.med@usk.test'])
        ->pluck('id', 'email');
    $record['entries'] = DB::table('academic_enrollments as e')->join('student_profiles as p', 'p.id', '=', 'e.student_profile_id')
        ->join('users as u', 'u.id', '=', 'p.user_id')->join('academic_years as y', 'y.id', '=', 'e.academic_year_id')
        ->whereIn('u.email', ['etudiant.med@usk.test', 'etudiant.droit@usk.test'])->where('y.title', '2026-2027')
        ->pluck('e.id', 'u.email');
}
if (($argv[1] ?? '') === 'carte') {
    $entry = App\Models\Student\AcademicEnrollment::query()->whereHas('profile.user', fn ($q) => $q->where('email', 'etudiant.dpu.01@usk.test'))
        ->whereHas('academicYear', fn ($q) => $q->where('status', 'open'))->with('profile')->sole();
    $record += ['entry' => $entry->id, 'matricule' => $entry->matricule, 'year' => $entry->academic_year_id,
        'photo' => (bool) $entry->profile->photo_path, 'cards' => DB::table('student_card_issuances')->where('academic_enrollment_id',$entry->id)
            ->get(['id','printed_at','collected_at'])];
}
if (($argv[1] ?? '') === 'resultat') {
    $result = App\Models\Student\AcademicOfficialResult::with(['run.rule', 'enrollment.profile.user'])
        ->whereHas('enrollment.profile.user', fn ($q) => $q->where('email','etudiant.droit@usk.test'))
        ->whereHas('enrollment.academicYear', fn ($q) => $q->where('title','2025-2026'))
        ->whereHas('run', fn ($q) => $q->whereIn('state',['approved','published']))->firstOrFail();
    $record += ['entry' => $result->academic_enrollment_id, 'run' => $result->run->id, 'rule' => $result->run->rule->id,
        'version' => $result->run->rule->curriculum_version_id, 'reference' => $result->reference,
        'state' => $result->run->state, 'published_at' => $result->run->published_at];
}
echo json_encode($record, JSON_THROW_ON_ERROR);
