<?php
use App\Models\User;
use App\Models\Enrollment;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicAudit;
use App\Models\Student\AcademicResource;
use App\Modules\Student\Application\Services\StudentFinanceService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\URL;

require getenv('USK_RECIPE_REPO').'/vendor/autoload.php';
$app=require getenv('USK_RECIPE_REPO').'/bootstrap/app.php';
$app->useEnvironmentPath(__DIR__);
$app->useStoragePath(__DIR__.'/storage');
$app->make(Kernel::class)->bootstrap();
if(!app()->environment('testing') || config('database.default')!=='sqlite'
 || realpath(config('database.connections.sqlite.database'))!==realpath(__DIR__.'/demo.sqlite')) throw new RuntimeException('Isolated database required');
if (is_file(__DIR__.'/clock.json')) {
    if (getenv('APP_ENV') !== 'testing' || realpath(getenv('DB_DATABASE')) !== realpath(__DIR__.'/demo.sqlite')) {
        throw new RuntimeException('Simulated clock requires the isolated demo database.');
    }
    $recipeClock = json_decode(file_get_contents(__DIR__.'/clock.json'), true, 512, JSON_THROW_ON_ERROR);
    \Carbon\Carbon::setTestNow($recipeClock['now']);
    \Carbon\CarbonImmutable::setTestNow($recipeClock['now']);
}
$action=$argv[1]??'summary';
$data=json_decode($argv[2]??'{}',true,512,JSON_THROW_ON_ERROR);
$result=match($action){
 'verification_link'=>(function()use($data){
    if(!str_ends_with($data['email']??'', '@usk-recette.example.test')) throw new RuntimeException('Fictional account required');
    $u=User::where('email',$data['email'])->sole();
    return ['url'=>URL::temporarySignedRoute('verification.verify',now()->addMinutes(30),['id'=>$u->id,'hash'=>sha1($u->getEmailForVerification())])];
 })(),
 'student'=>(function()use($data){
    $u=User::where('email',$data['email'])->sole();
    return ['user'=>$u->id,'verified'=>$u->hasVerifiedEmail(),'roles'=>$u->getRoleNames()->all(),
      'applications'=>Enrollment::where('student_id',$u->id)->get(['id','uuid','status','level_id','academic_year_id']),
      'entries'=>$u->studentProfile?->enrollments()->get(['id','application_id','level_id','academic_year_id','curriculum_version_id','class_id','enrollment_status'])??[]];
 })(),
 'ledger'=>(function()use($data){
    $e=AcademicEnrollment::findOrFail($data['entry']);
    $f=app(StudentFinanceService::class);
    return ['enrollment_status'=>$e->enrollment_status,'first_installment'=>$f->firstTuitionInstallment($e),
      'proofs'=>\App\Models\Student\StudentPaymentProof::where('academic_enrollment_id',$e->id)->get(['id','reference','status','student_payment_id']),
      'payments'=>$e->payments()->with('allocations','refunds')->get()->makeHidden(['note']),
      'audit'=>AcademicAudit::where('entity_type',$e->getTable())->where('entity_id',$e->id)->get(['action','data']),
      'confirmation_audits'=>AcademicAudit::where('entity_type',$e->getTable())->where('entity_id',$e->id)->where('action','academic_enrollment_confirmed')->count(),
      'confirmation_notices'=>$e->profile->user->notifications()->get()->filter(fn($n)=>$n->type===\App\Notifications\AcademicEnrollmentChanged::class && ($n->data['academic_enrollment_id']??null)==$e->id && ($n->data['status']??null)==='confirmed')->count()];
 })(),
 'summary'=>['users'=>User::count(),'students'=>\App\Models\Student\StudentProfile::count(),'enrollments'=>AcademicEnrollment::count(),
   'offers'=>\App\Models\Student\AcademicOffering::count(),'sessions'=>\App\Models\Student\AcademicSession::count(),'assessments'=>\App\Models\Student\AcademicAssessment::count(),
   'official_results'=>\App\Models\Student\AcademicOfficialResult::count(),'documents'=>\App\Models\Student\OfficialDocument::count()],
 'history'=>(function()use($data){
    $entry=AcademicEnrollment::findOrFail($data['entry']);
    return ['entry'=>$entry->only(['id','enrollment_status','class_id','curriculum_version_id','academic_year_id']),
      'changes'=>\App\Models\Student\EnrollmentChange::where('academic_enrollment_id',$entry->id)->get(['id','action','before','after']),
      'submissions'=>\App\Models\Student\AcademicSubmission::where('academic_enrollment_id',$entry->id)->get(['id','academic_resource_id','version']),
      'registrations'=>\App\Models\Student\CourseRegistration::where('academic_enrollment_id',$entry->id)->get(['id','academic_offering_id','withdrawn_at'])];
 })(),
 'assessment'=>(function()use($data){
    $r=AcademicResource::with(['assessment.records.handoffs'])->findOrFail($data['resource']);
    return $r->only(['id','academic_offering_id','kind','is_published'])+['assessment'=>$r->assessment];
 })(),
 default=>throw new RuntimeException('Unknown read-only probe'),
};
echo json_encode($result,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
