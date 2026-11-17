<?php

use App\Models\AcademicCalendarEvent;
use App\Models\AcademicStructure\AcademicCycle;
use App\Models\AcademicStructure\AcademicProgram;
use App\Models\AcademicStructure\AcademicPromotion;
use App\Models\AcademicStructure\University;
use App\Models\AcademicYear;
use App\Models\Classes;
use App\Models\Courses;
use App\Models\Enrollment;
use App\Models\Faculty;
use App\Models\Intake;
use App\Models\Level;
use App\Models\Professor;
use App\Models\Student\AcademicOffering;
use App\Models\Student\AcademicRoom;
use App\Models\Student\AcademicSemester;
use App\Models\Student\AccessRule;
use App\Models\Student\StudentProfile;
use App\Models\User;
use App\Modules\AcademicStructure\Application\Services\CurriculumService;
use App\Modules\AcademicStructure\Application\Services\StructureService;
use App\Modules\Student\Application\Services\FeeTariffService;
use App\Modules\Student\Application\Services\StudentFinanceService;
use App\Modules\Teaching\Application\Services\CourseRegistrationService;
use App\Modules\Teaching\Application\Services\ScheduleService;
use App\Modules\Teaching\Application\Services\TeachingOfferingService;
use App\Modules\Teaching\Application\Services\TeachingTeam;
use Carbon\CarbonImmutable;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

require getenv('USK_RECIPE_REPO').'/vendor/autoload.php';
$app = require getenv('USK_RECIPE_REPO').'/bootstrap/app.php';
$app->useEnvironmentPath(__DIR__);
$app->useStoragePath(__DIR__.'/storage');
$app->make(Kernel::class)->bootstrap();
if (!app()->environment('testing') || config('database.default') !== 'sqlite'
    || realpath(config('database.connections.sqlite.database')) !== realpath(__DIR__.'/demo.sqlite')) {
    throw new RuntimeException('La base doit être la base isolée de recette.');
}
if (\Illuminate\Support\Facades\Schema::hasTable('users') && User::exists()) { throw new RuntimeException('Une recette existante ne doit pas être réinitialisée.'); }
if (Artisan::call('migrate', ['--force' => true]) !== 0) {
    throw new RuntimeException('Initialisation de la base isolée impossible.');
}
app(RolePermissionSeeder::class)->run();
Role::findByName('admin')->syncPermissions([]);
app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();

$fx = ['accounts'=>[], 'faculties'=>[], 'programs'=>[], 'levels'=>[], 'groups'=>[], 'courses'=>[], 'versions'=>[], 'items'=>[], 'offerings'=>[], 'students'=>[], 'all_students'=>[]];
$account = function(string $key, string $first, string $last, string $role, array $permissions=[], ?int $faculty=null) use (&$fx) {
    $user=User::factory()->create(['first_name'=>$first, 'last_name'=>$last, 'email'=>str_replace('_','.', $key).'@usk-recette.example.test',
        'password'=>getenv('USK_RECIPE_PASSWORD'), 'nationality_code'=>'CD']);
    $user->assignRole($role);
    if ($permissions) $user->givePermissionTo($permissions);
    if ($faculty) $user->academicFaculties()->attach($faculty);
    $fx['accounts'][$key]=['email'=>$user->email, 'name'=>$user->full_name, 'user'=>$user->id, 'id'=>$user->id, 'role'=>$role, 'permissions'=>$user->getAllPermissions()->pluck('name')->all(), 'faculty'=>$faculty];
    return $user;
};
$admin=$account('institutional','Ariane','Institution Recette','admin',Permission::pluck('name')->all());
$structure=app(StructureService::class);
$common=['revision'=>0, 'is_active'=>true, 'reason'=>'Structure exclusivement fictive pour la recette finale.'];
$uni=$structure->save('university',$common+['code'=>'USK-DEMO','name'=>'USK de démonstration — DONNÉES FICTIVES'],$admin);
$today=CarbonImmutable::today('Africa/Kinshasa');
$start=$today->subMonths(2)->startOfMonth();
$year=AcademicYear::create(['title'=>'Année actuelle de démonstration','start_date'=>$start->toDateString(),'end_date'=>$start->addYear()->subDay()->toDateString(),'status'=>'open']);
$year->forceFill(['university_id'=>$uni->id])->save();
$past=AcademicYear::create(['title'=>'Année précédente de démonstration','start_date'=>$start->subYear()->toDateString(),'end_date'=>$start->subDay()->toDateString(),'status'=>'closed']);
$past->forceFill(['university_id'=>$uni->id])->save();
$fx['year']=$year->id;
$fx['past_year']=$past->id;
$fx['year_start']=$start->toDateString();
$fx['session_day']=$today->addDays(3)->toDateString();
$fx['week']=$today->addDays(3)->startOfWeek()->toDateString();
$semester=AcademicSemester::create(['academic_year_id'=>$year->id,'number'=>1,'start_date'=>$start->toDateString(),'end_date'=>$start->addMonths(5)->endOfMonth()->toDateString()]);
$fx['semester']=$semester->id;
AcademicCalendarEvent::create(['academic_year_id'=>$year->id,'category'=>'exam','title'=>'Examens fictifs de démonstration','start_date'=>$today->addDays(2)->toDateString(),'end_date'=>$today->addDays(4)->toDateString()]);
AcademicCalendarEvent::create(['academic_year_id'=>$year->id,'category'=>'resit','title'=>'Rattrapages fictifs de démonstration','start_date'=>$today->addMonths(4)->toDateString(),'end_date'=>$today->addMonths(4)->addDays(3)->toDateString()]);
AcademicCalendarEvent::create(['academic_year_id'=>$year->id,'category'=>'holiday','title'=>'Congés fictifs de démonstration','start_date'=>$today->addMonths(2)->toDateString(),'end_date'=>$today->addMonths(2)->addDays(7)->toDateString()]);
AcademicRoom::create(['code'=>'DEMO-A','name'=>'Auditoire de démonstration A','campus'=>'Démonstration','building'=>'Bâtiment fictif','capacity'=>30,'type'=>'classroom','is_active'=>true]);
AcademicRoom::create(['code'=>'DEMO-B','name'=>'Auditoire de démonstration B','campus'=>'Démonstration','building'=>'Bâtiment fictif','capacity'=>30,'type'=>'classroom','is_active'=>true]);
$academic=['view dashboard','publish academic content','manage academic access','manage academic results','deliberate academic results','publish official results','approve official documents'];
$registrar=['view dashboard','manage academic access','manage official documents','issue official documents'];
$finance=['view dashboard','manage academic finance','manage academic access'];

foreach (['med'=>['Médecine','MED','Sciences biomédicales','Fondements biomédicaux'],'law'=>['Droit','DRO','Droit général','Introduction au droit']] as $key=>$labels) {
    [$facultyName,$code,$programName,$courseName]=$labels;
    $faculty=Faculty::create(['name'=>$facultyName.' — DÉMONSTRATION','code'=>$code,'is_active'=>true]);
    $faculty->forceFill(['university_id'=>$uni->id])->save();
    $fx['faculties'][$key]=$faculty->id;
    $cycle=$structure->save('cycle',$common+['code'=>'L-'.$code,'name'=>'Cycle Licence — '.$code.' de recette','normal_duration'=>3,'progression_mode'=>'annual','weighting_mode'=>'both',
        'periods'=>[['code'=>'S1','name'=>'Semestre 1'],['code'=>'S2','name'=>'Semestre 2']]],$admin);
    $level=Level::create(['faculty_id'=>$faculty->id,'title'=>'Licence 1 '.$facultyName.' — DÉMO','code'=>'L1-'.$code,'is_active'=>true]);
    $level2=Level::create(['faculty_id'=>$faculty->id,'title'=>'Licence 2 '.$facultyName.' — DÉMO','code'=>'L2-'.$code,'is_active'=>true]);
    $program=$structure->save('program',$common+['code'=>$code.'-L','name'=>$programName.' — DÉMO','faculty_id'=>$faculty->id,'academic_cycle_id'=>$cycle->id,'level_ids'=>[$level->id,$level2->id]],$admin);
    $fx['programs'][$key]=$program->id; $fx['levels'][$key]=$level->id; $fx['levels'][$key.'_second']=$level2->id;
    $fx['groups'][$key]=[];
    foreach ([[$level,'A'],[$level,'B'],[$level2,'N2']] as [$groupLevel,$suffix]) {
        $promotion=AcademicPromotion::firstOrCreate(['academic_program_id'=>$program->id,'academic_year_id'=>$year->id,'level_id'=>$groupLevel->id],
            ['code'=>$code.'-P-'.$groupLevel->id,'name'=>'Promotion '.$facultyName.' '.$groupLevel->code.' — DÉMO','is_active'=>true]);
        $group=Classes::create(['faculty_id'=>$faculty->id,'level_id'=>$groupLevel->id,'intake_id'=>Intake::create(['name'=>'Groupe '.$code.' '.$suffix.' — DÉMO'])->id,'status'=>'OPEN','capacity'=>30]);
        $group->forceFill(['academic_promotion_id'=>$promotion->id])->save();
        $fx['groups'][$key][$suffix]=$group->id;
    }
    $dean=$account('dean_'.$key,'Doyen',$facultyName.' Recette','admin',$academic,$faculty->id);
    $vice=$account('vice_'.$key,'Vice-doyen',$facultyName.' Recette','admin',$academic,$faculty->id);
    $account('registrar_'.$key,'Appariteur',$facultyName.' Recette','admin',$registrar,$faculty->id);
    $account('finance_'.$key,'Finances',$facultyName.' Recette','admin',$finance,$faculty->id);
    $teacherUser=$account('teacher_'.$key,$key==='med'?'Anne':'Paul',$facultyName.' Recette','professor');
    $teacher=Professor::create(['first_name'=>$teacherUser->first_name,'last_name'=>$teacherUser->last_name,'email'=>$teacherUser->email,'is_active'=>true]);

    $portrait='professors/recette-'.$teacher->id.'.png';
    Storage::disk('public')->put($portrait,base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+pBp0AAAAASUVORK5CYII='));
    $teacher->forceFill(['user_id'=>$teacherUser->id,'photo'=>$portrait])->save();
    $fx['accounts']['teacher_'.$key]['professor']=$teacher->id;
    $course=(new Courses)->forceFill(['level_id'=>$level->id,'title'=>$courseName.' — DÉMO','code'=>$code.'-101','semester'=>1,'credits'=>5,'cmi_hours'=>20,'td_hours'=>10,'catalog_status'=>'active']);
    $course->save();
    $next=(new Courses)->forceFill(['level_id'=>$level2->id,'title'=>'Applications '.$facultyName.' — DÉMO','code'=>$code.'-201','semester'=>1,'credits'=>5,'cmi_hours'=>20,'catalog_status'=>'active']);
    $next->save();
    $fx['courses'][$key]=$course->id;
    $fx['courses'][$key.'_second']=$next->id;
    $curricula=app(CurriculumService::class);
    $version=$curricula->draft(['academic_program_id'=>$program->id,'academic_year_id'=>$year->id,'code'=>$code.'-DEMO-V1','name'=>'Maquette '.$facultyName.' — DÉMO','reason'=>$common['reason']],$admin);
    $units=[];
    foreach ([[$level,$course],[$level2,$next]] as [$unitLevel,$unitCourse]) {
        $units[]=['level_id'=>$unitLevel->id,'period_code'=>'S1','code'=>'UE-'.$unitLevel->id,'name'=>'Enseignements '.$unitLevel->code.' de recette','expected_credits'=>'5.00',
            'items'=>[['source_course_id'=>$unitCourse->id,'credits'=>'5.00','coefficient'=>'2.000','cmi_hours'=>20,'td_hours'=>10]]];
    }
    $version=$curricula->saveDraft($version->id,['revision'=>(int)$version->revision,'units'=>$units,'reason'=>$common['reason']],$admin);
    foreach ($curricula->levelWorkspace($version,$program) as $workspace) $version=$curricula->approveLevel($version->id,$workspace['id'],$version->revision,$workspace['signature'],$admin);
    $version=$curricula->transition($version->id,'validate',$version->revision,$common['reason'],$admin);
    $version=$curricula->transition($version->id,'publish',$version->revision,$common['reason'],$admin);
    $fx['versions'][$key]=$version->id;
    $item=$version->units()->where('level_id',$level->id)->sole()->items()->sole();
    $fx['items'][$key]=$item->id;
    $offers=app(TeachingOfferingService::class);
    $offering=$offers->create($admin,['academic_year_id'=>$year->id,'curriculum_item_id'=>$item->id,'class_id'=>$fx['groups'][$key]['A'],'reason'=>$common['reason']]);
    app(TeachingTeam::class)->change($offering,$admin,['professor_id'=>$teacher->id,'role'=>'lead','action'=>'assign','reason'=>$common['reason']]);
    $offers->transition($offering,$admin,'publish',$common['reason']);
    $fx['offerings'][$key]=$offering->id;
    $slot=$today->addDays($key==='med'?3:4)->toDateString();
    app(ScheduleService::class)->save(['academic_offering_id'=>$offering->id,'starts_at'=>$slot.'T10:00','ends_at'=>$slot.'T12:00','room'=>$key==='med'?'Auditoire démo A':'Auditoire démo B','repeat_count'=>1,'is_published'=>true],$admin->id);
    $tariffs=app(FeeTariffService::class);
    $tariff=$tariffs->create($admin,['academic_year_id'=>$year->id,'level_id'=>$level->id,'category'=>'national','kind'=>'tuition','currency'=>'USD','title'=>'Frais fictifs '.$facultyName,
        'valid_from'=>$year->start_date,'valid_until'=>$year->end_date,'schedule'=>[['amount'=>'50.00','due_at'=>$today->addDays(20)->toDateString()],['amount'=>'70.00','due_at'=>$today->addMonths(3)->toDateString()]],'reason'=>'Barème fictif de démonstration.']);
    $tariffs->activate($tariff,$admin,'Approbation du seul barème fictif de démonstration.');
    \App\Models\AcademicStructure\AdmissionCampaign::create(['academic_program_id'=>$program->id,'academic_year_id'=>$year->id,'level_id'=>$level->id,'is_open'=>true,'additional_documents'=>['Attestation fictive de recette']]);
    foreach (range(1,6) as $number) {
        $student=$account($number===1?'student_'.$key:'student_'.$key.'_'.$number,'Étudiant '.$number,$facultyName.' Recette','student');
        $entryLevel=in_array($number,[2,4],true)?$level2:$level;
        $entryYear=$number===6?$past:$year;
        $status=match($number){3,4=>'pending_confirmation',5=>$key==='med'?'suspended':'on_leave',6=>'completed',default=>'confirmed'};
        $groupKey=in_array($number,[2,4],true)?'N2':'A';
        $application=Enrollment::create(['student_id'=>$student->id,'level_id'=>$entryLevel->id,'academic_year_id'=>$entryYear->id,'status'=>'validated',
            'form_snapshot'=>['academic_program_id'=>$program->id,'program'=>$program->name],'meta'=>['required_documents'=>[]]]);
        $profile=StudentProfile::create(['user_id'=>$student->id,'student_status'=>'active','matricule'=>$code.'-DEMO-'.$number]);
        $profile->forceFill(['welcome_seen_at'=>now()])->save();
        $promotionId=$entryYear->id===$year->id?Classes::findOrFail($fx['groups'][$key][$groupKey])->academic_promotion_id:null;
        $entry=$profile->enrollments()->create(['application_id'=>$application->id,'level_id'=>$entryLevel->id,'academic_year_id'=>$entryYear->id,
            'class_id'=>$entryYear->id===$year->id?$fx['groups'][$key][$groupKey]:null,'academic_promotion_id'=>$promotionId,
            'enrollment_status'=>$status,'currency'=>'USD','fee_category'=>'national','matricule'=>$profile->matricule]);
        if($entryYear->id===$year->id) $curricula->bind($version->id,$entry->id,$admin,$common['reason']);
        $studentRow=['entry'=>$entry->id,'user'=>$student->id,'email'=>$student->email,'name'=>$student->full_name,'status'=>$status,'faculty'=>$key,'number'=>$number];
        $fx['all_students'][]=$studentRow;
        if($number===1){
            $fx['students'][$key]=$studentRow;
            app(FeeTariffService::class)->applyToEnrollment($entry,$admin->id);
            $payment=app(StudentFinanceService::class)->record($entry,$admin,['amount'=>'50.00','method'=>'bank_transfer','kind'=>'tuition','reference'=>'DEMO-'.$code.'-INITIAL','note'=>'Versement exclusivement fictif de recette.']);
            app(StudentFinanceService::class)->transition($payment,$admin,'confirmed','Rapprochement de recette sans transaction bancaire.');
            app(CourseRegistrationService::class)->sync($offering,$admin,'Inscription pédagogique de recette confirmée explicitement.');
        }
    }
    AcademicOffering::create(['course_id'=>$course->id,'level_id'=>$level->id,'academic_year_id'=>$past->id,'is_published'=>true]);
}
foreach(['materials_download','assignments_submit','evaluations_participate','results_view','documents_request'] as $feature) {
    AccessRule::create(['academic_year_id'=>$year->id,'feature'=>$feature,'mode'=>'open','is_active'=>true,'allow_exemption'=>true,'regulation_reference'=>'Accès technique de recette sur données fictives.']);
}
$account('candidate_correction','Candidat','Correction Recette','candidate');
$account('candidate_rejected','Candidat','Refus Recette','candidate');
$fx['accounts']['candidate']=['email'=>'nouveau.candidat@usk-recette.example.test','name'=>'Nouveau Candidat Recette','role'=>'user','permissions'=>['view dashboard'],'faculty'=>null];
$fx['university']=$uni->id;
file_put_contents(__DIR__.'/fixture.json',json_encode($fx,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
echo "Université de démonstration créée avec 12 étudiants fictifs et comptes facultaires bornés.\n";
