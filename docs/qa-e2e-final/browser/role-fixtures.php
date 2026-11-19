<?php

use Database\Seeders\FinalQa\UniversitySimulation;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

$server = realpath(getenv('USK_QA_SERVER_REPO') ?: dirname(__DIR__, 3));
require $server.'/docs/recette-manuelle-v2/scripts/bootstrap.php';
$app = recetteApplication();
$app->make(Kernel::class)->bootstrap();
app(UniversitySimulation::class)->guard();
DB::connection()->getPdo()->exec('PRAGMA query_only = ON');
$members = DB::table('academic_enrollments as e')
    ->join('student_profiles as p', 'p.id', '=', 'e.student_profile_id')->join('users as u', 'u.id', '=', 'p.user_id')
    ->join('academic_years as y', 'y.id', '=', 'e.academic_year_id')
    ->where('y.status', 'open')->where('e.enrollment_status', 'confirmed')->whereNotNull('e.academic_promotion_id')
    ->orderBy('u.id');
$mandates = DB::table('promotion_representatives as m')->whereColumn('m.user_id', 'u.id')
    ->whereColumn('m.academic_promotion_id', 'e.academic_promotion_id');
$representative = (clone $members)->whereExists(clone $mandates)->firstOrFail(['u.id', 'u.email', 'e.academic_promotion_id']);
$student = (clone $members)->whereNotExists(clone $mandates)->where('e.academic_promotion_id', $representative->academic_promotion_id)
    ->firstOrFail(['u.id', 'u.email']);
$other = DB::table('levels')->join('faculties', 'faculties.id', '=', 'levels.faculty_id')
    ->where('faculties.code', 'MED')->orderBy('levels.id')->value('levels.id');
echo json_encode(['representative' => $representative->email, 'student' => $student->email, 'foreignLevel' => $other], JSON_THROW_ON_ERROR);
