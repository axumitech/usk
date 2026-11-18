<?php

use App\Models\AcademicStructure\AcademicProgram;
use App\Models\AcademicStructure\CurriculumVersion;
use App\Models\AcademicStructure\University;
use App\Models\AcademicYear;
use App\Models\Faculty;
use App\Models\Professor;
use App\Models\Student\AcademicAssessment;
use App\Models\Student\AcademicAudit;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicOffering;
use App\Models\Student\AcademicOfficialResult;
use App\Models\Student\AcademicProgression;
use App\Models\Student\AcademicResource;
use App\Models\Student\AcademicSession;
use App\Models\Student\AssessmentRecord;
use App\Models\Student\CourseRegistration;
use App\Models\Student\FinanceTariff;
use App\Models\Student\StudentPayment;
use App\Models\Student\StudentProfile;
use App\Models\User;
use App\Modules\Results\Application\StudentResultPeriods;
use App\Modules\Student\Application\Services\AcademicAccessService;
use App\Modules\Student\Application\Services\AcademicStaffScope;
use App\Modules\Student\Application\Services\StudentAnnouncements;
use App\Modules\Student\Application\Services\StudentFinanceService;
use App\Modules\Teaching\Application\Services\CourseAudience;
use Database\Seeders\RecetteV2\RecipeDatabase;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

require __DIR__.'/bootstrap.php';

$checks = $failures = 0;
$check = function (bool $valid, string $label) use (&$checks, &$failures): void {
    $checks++;
    $failures += $valid ? 0 : 1;
    echo ($valid ? '[OK] ' : '[ECHEC] ').$label.PHP_EOL;
};
$section = function (string $label, Closure $verify) use ($check): void {
    echo PHP_EOL.$label.PHP_EOL;
    try {
        $verify();
    } catch (Throwable $error) {
        // Exception messages can contain SQL bindings; never print them or password hashes.
        $check(false, $label.' interrompue ('.class_basename($error).').');
    }
};

try {
    $app = recetteApplication();
    $app->make(Kernel::class)->bootstrap();
    $token = RecipeDatabase::assertConnection();
    $pdo = DB::connection()->getPdo();
    $pdo->exec('PRAGMA query_only = ON');
    $check((int) $pdo->query('PRAGMA query_only')->fetchColumn() === 1, 'Connexion SQLite de recette vérifiée et protégée en lecture seule.');
    $marker = AcademicAudit::where('action', 'local_university_recette_v2_installed')->first();
    $check($marker !== null && ($marker->data['token'] ?? null) === $token, 'Installation complète identifiée par son marqueur.');
    $check(DB::select('PRAGMA foreign_key_check') === [], 'Aucune violation de clé étrangère.');

    $users = User::with(['roles', 'permissions', 'academicFaculties'])->get()->keyBy(fn (User $user) => strstr($user->email, '@', true));
    $years = AcademicYear::all()->keyBy('title');
    $faculties = Faculty::whereIn('code', ['RECMED', 'RECDR'])->get()->keyBy('code');
    $finance = app(StudentFinanceService::class);
    $entry = fn (string $key, string $year): AcademicEnrollment => AcademicEnrollment::with(['application', 'academicYear', 'level.faculty', 'profile.user', 'curriculumVersion'])
        ->where('student_profile_id', StudentProfile::where('user_id', $users[$key]->id)->sole()->id)
        ->where('academic_year_id', $years[$year]->id)->sole();

    $section('Comptes et délégations', function () use ($users, $faculties, $check): void {
        $expected = ['admin', 'superadmin', 'etudiant.med', 'etudiant.med2', 'etudiant.med3', 'etudiant.droit', 'etudiant.droit2', 'etudiant.droit3', 'etudiant.droit4'];
        foreach (['med', 'droit'] as $faculty) {
            foreach (['doyen', 'vicedoyen', 'appariteur', 'finance', 'professeur', 'candidat'] as $role) {
                $expected[] = $role.'.'.$faculty;
            }
        }
        sort($expected);
        $actual = $users->keys()->sort()->values()->all();
        $check($users->count() === 21 && $actual === $expected && $users->every(fn ($user) => str_ends_with($user->email, '@usk.test')), '21 comptes attendus, exclusivement fictifs.');
        $check($users->count() === 21 && $users->every(fn ($user) => $user->getRawOriginal('password') !== 'password' && Hash::check('password', $user->getRawOriginal('password'))), 'Les 21 mots de passe de test sont correctement hachés et utilisables.');
        $rolesValid = $users['admin']->getRoleNames()->contains('admin') && $users['superadmin']->getRoleNames()->contains('super admin');
        foreach (['med', 'droit'] as $faculty) {
            $rolesValid = $rolesValid && $users['professeur.'.$faculty]->hasRole('professor') && $users['candidat.'.$faculty]->hasRole('candidate');
        }
        foreach ($users->filter(fn ($user, $key) => str_starts_with($key, 'etudiant.')) as $user) {
            $rolesValid = $rolesValid && $user->hasRole('student') && $user->studentProfile?->student_status === 'active';
        }
        $check($rolesValid, 'Rôles institutionnels, professeurs, candidats et sept profils étudiants actifs.');
        $check($users['admin']->academicFaculties->isEmpty() && $users['superadmin']->academicFaculties->isEmpty(), 'Comptes institutionnels sans restriction facultaire artificielle.');
        $delegations = [
            'doyen' => ['manage academic access', 'approve academic progression', 'publish official results'],
            'vicedoyen' => ['publish academic content', 'manage academic progression', 'manage academic results', 'deliberate academic results'],
            'appariteur' => ['manage academic access'], 'finance' => ['manage academic finance'],
        ];
        foreach (['med' => 'RECMED', 'droit' => 'RECDR'] as $faculty => $code) {
            $valid = true;
            foreach ($delegations as $role => $permissions) {
                $user = $users[$role.'.'.$faculty];
                $expectedPermissions = collect(['view dashboard', ...$permissions])->sort()->values()->all();
                $scope = $user->academicFaculties->pluck('id')->map(fn ($id) => (int) $id)->all();
                $visible = AcademicStaffScope::apply(AcademicEnrollment::query(), $user)->with('level')->get();
                $valid = $valid && $user->getRoleNames()->contains('admin') && $scope === [(int) $faculties[$code]->id]
                    && $user->getAllPermissions()->pluck('name')->sort()->values()->all() === $expectedPermissions
                    && $visible->isNotEmpty() && $visible->every(fn ($row) => (int) $row->level->faculty_id === (int) $faculties[$code]->id);
            }
            $check($valid, 'Quatre agents '.$faculty.' : droits délégués exacts et dossiers limités à leur faculté.');
        }
        $check($users->filter(fn ($user, $key) => str_starts_with($key, 'candidat.'))->every(fn ($user) => ! $user->studentProfile && ! $user->enrollments()->exists()), 'Les deux candidats restent disponibles pour commencer leur candidature.');
    });

    $section('Structure et inscriptions annuelles', function () use ($years, $faculties, $check): void {
        $university = University::where('code', 'RECETTE-V2')->sole();
        $check($years->count() === 2 && $years['2025-2026']->status === 'closed' && $years['2026-2027']->status === 'open'
            && AcademicYear::where('status', 'open')->count() === 1 && $years->every(fn ($year) => (int) $year->university_id === (int) $university->id), '2025–2026 clôturée, 2026–2027 seule année ouverte du même établissement.');
        $programs = AcademicProgram::with(['cycle', 'levels', 'department'])->get();
        $check($faculties->count() === 2 && $programs->count() === 2 && $programs->every(fn ($program) => $program->cycle?->code === 'REC-LICENCE'
            && $program->levels->count() === 2 && $program->department?->faculty_id === $program->faculty_id
            && $program->levels->every(fn ($level) => (int) $level->faculty_id === (int) $program->faculty_id)), 'Médecine et Droit : programmes Licence, département et niveaux L1/L2 cohérents.');
        $versions = CurriculumVersion::with('units.items')->get();
        $check($versions->count() === 4 && $versions->every(fn ($version) => $version->status === 'published' && $version->published_at !== null
            && $version->units->count() === 2 && $version->units->every(fn ($unit) => $unit->items->count() === 2)), 'Quatre maquettes publiées avec deux niveaux et deux EC par niveau.');
        $entries = AcademicEnrollment::with(['academicYear', 'curriculumVersion', 'group', 'admissionCohort'])->get();
        $check(StudentProfile::count() === 7 && $entries->count() === 12
            && $entries->where('academic_year_id', $years['2025-2026']->id)->count() === 5
            && $entries->where('academic_year_id', $years['2026-2027']->id)->count() === 7
            && $entries->every(fn ($row) => $row->class_id !== null && $row->academic_department_id !== null
                && (int) $row->curriculumVersion?->academic_year_id === (int) $row->academic_year_id), 'Sept profils, cinq contextes historiques et sept courants, avec groupes/départements et maquettes de leur année.');
        $registrations = CourseRegistration::with(['offering', 'enrollment'])->get();
        $check($registrations->count() === 14 && $registrations->every(fn ($row) => (int) $row->offering->academic_year_id === (int) $row->enrollment->academic_year_id
            && (int) $row->offering->level_id === (int) $row->enrollment->level_id)
            && $registrations->whereNotNull('active_key')->pluck('active_key')->duplicates()->isEmpty(), '14 inscriptions pédagogiques explicites, sans doublon ni mélange L1/L2 ou d’années.');
    });

    $section('Finances et activation', function () use ($entry, $finance, $check): void {
        $tariffs = FinanceTariff::all();
        $check($tariffs->count() === 8 && $tariffs->every(fn ($tariff) => $tariff->status === 'active' && $tariff->currency === 'USD'
            && $tariff->kind === 'tuition' && count($tariff->schedule) === 1 && (int) $tariff->schedule[0]['amount_cents'] === 10000), 'Huit barèmes annuels/niveaux : première tranche fictive de 100 USD.');
        foreach ([
            'A · etudiant.med2' => ['etudiant.med2', 'pending_confirmation', 0, 10000],
            'B · etudiant.med3' => ['etudiant.med3', 'pending_confirmation', 2000, 8000],
            'C · etudiant.droit' => ['etudiant.droit', 'confirmed', 3000, 7000],
            'D · etudiant.droit2' => ['etudiant.droit2', 'pending_confirmation', 0, 10000],
            'E · etudiant.droit3' => ['etudiant.droit3', 'confirmed', 10000, 0],
        ] as $label => [$key, $status, $paid, $remaining]) {
            $row = $entry($key, '2026-2027');
            $first = $finance->firstTuitionInstallment($row);
            $check($row->enrollment_status === $status && $first['amount_cents'] === 10000 && $first['paid_cents'] === $paid
                && $first['remaining_cents'] === $remaining && $first['activation']['percentage'] === 30,
                $label.' : '.$row->enrollment_status.', première tranche validée '.number_format($first['paid_cents'] / 100, 2, '.', '').' USD, reste '.number_format($first['remaining_cents'] / 100, 2, '.', '').' USD.');
        }
        $other = $entry('etudiant.droit2', '2026-2027');
        $otherBalance = $finance->balance($other, 'recette_admin');
        $check($otherBalance['assessed'] && $otherBalance['paid_cents'] === 3000 && $otherBalance['balance_cents'] === 0, 'D : le versement est affecté à une autre obligation, sans couvrir la première tranche.');
        $aid = $entry('etudiant.droit4', '2026-2027');
        $first = $finance->firstTuitionInstallment($aid);
        $check($aid->adjustments()->where('type', 'reduction')->where('amount_cents', 2000)->where('is_active', true)->exists()
            && $aid->payments()->count() === 0 && $aid->enrollment_status === 'pending_confirmation' && $first['waived_cents'] === 2000
            && $first['activation']['required_cents'] === 2400, 'Aide approuvée de 20 USD sans paiement ; seuil net de 24 USD encore exigé.');
        $caseA = $entry('etudiant.med2', '2026-2027');
        $check($caseA->serviceRequests()->where('procedure', 'enrollment-exception')->where('status', 'open')->count() === 1
            && $caseA->enrollment_status === 'pending_confirmation', 'Demande administrative en cours sans activation de l’étudiant A.');
        $payments = StudentPayment::with('allocations.obligation')->get();
        $check($payments->count() === 10 && $payments->every(fn ($payment) => $payment->status === 'confirmed'
            && $payment->recorded_by !== $payment->confirmed_by && $payment->allocations->count() === 1
            && (int) $payment->allocations->sum('amount_cents') === (int) $payment->amount_cents
            && $payment->allocations->every(fn ($allocation) => (int) $allocation->obligation->academic_enrollment_id === (int) $payment->academic_enrollment_id)), 'Dix versements contrôlés par un autre agent et explicitement affectés aux bonnes inscriptions.');
        $check($entry('etudiant.droit', '2026-2027')->courseRegistrations()->whereNull('withdrawn_at')->count() === 2
            && $entry('etudiant.droit3', '2026-2027')->courseRegistrations()->count() === 0, 'C dispose de deux EC ; E reste confirmé avec inscription pédagogique manquante.');
    });

    $section('Historique, résultats et progression', function () use ($entry, $finance, $check): void {
        foreach (['etudiant.med' => ['pass_demo', 'published'], 'etudiant.med2' => ['repeat_demo', 'published'], 'etudiant.med3' => ['resit_demo', 'published'], 'etudiant.droit' => ['pass_demo', 'approved'], 'etudiant.droit2' => ['resit_demo', 'approved']] as $key => [$decision, $publication]) {
            $past = $entry($key, '2025-2026');
            $result = AcademicOfficialResult::with('run')->where('academic_enrollment_id', $past->id)->sole();
            $records = AssessmentRecord::where('academic_enrollment_id', $past->id)->get();
            $check($past->enrollment_status === 'completed' && $finance->firstTuitionInstallment($past)['paid_cents'] === 10000
                && $result->decision === $decision && $result->run->state === $publication && $records->count() === 4
                && $records->every(fn ($record) => $record->participation === 'submitted' && $record->correction_state === 'validated' && $record->released_at !== null && $record->points !== null), $key.' : année terminée, frais conservés, quatre corrections et décision '.$decision.' / '.$publication.'.');
            $check(app(StudentResultPeriods::class)->published($past)->count() === ($publication === 'published' ? 1 : 0), $key.' : visibilité étudiante conforme à la publication officielle.');
        }
        $drafts = AcademicAssessment::where('state', 'draft')->whereHas('resource.offering.academicYear', fn ($query) => $query->where('title', '2025-2026'))->count();
        $check($drafts === 1 && AcademicOfficialResult::published()->count() === 3, 'Une évaluation historique non publiée ; trois résultats officiels publiés et deux approuvés non publiés.');
        $past = $entry('etudiant.med', '2025-2026');
        $current = $entry('etudiant.med', '2026-2027');
        $progression = AcademicProgression::where('source_enrollment_id', $past->id)->sole();
        $check($progression->kind === 'advance' && (int) $progression->target_enrollment_id === (int) $current->id
            && (int) $past->level_id !== (int) $current->level_id && $past->curriculum_version_id !== $current->curriculum_version_id
            && $past->curriculumVersion->academic_year_id !== $current->curriculumVersion->academic_year_id
            && $current->enrollment_status === 'confirmed' && $current->courseRegistrations()->count() === 2
            && $finance->firstTuitionInstallment($current)['remaining_cents'] === 7000,
            'Témoin Médecine L1 → L2 : décision officielle, maquettes et obligations séparées, 30 USD validés dans la nouvelle année.');
    });

    $section('Espaces professeurs et cloisonnement des contenus', function () use ($users, $years, $entry, $check): void {
        foreach (['med', 'droit'] as $faculty) {
            $teacher = Professor::where('user_id', $users['professeur.'.$faculty]->id)->sole();
            $offerings = AcademicOffering::where('academic_year_id', $years['2026-2027']->id)
                ->whereHas('assignments', fn ($query) => $query->where('professor_id', $teacher->id)->whereNull('ends_at'))->with(['sessions', 'level'])->get();
            $public = $offerings->filter(fn ($offer) => app(CourseAudience::class)->roster($offer)->exists());
            $material = AcademicResource::whereIn('academic_offering_id', $public->pluck('id'))->where('kind', 'material')->where('is_published', true)->first();
            $check($teacher->is_active && $offerings->count() === 4 && $public->isNotEmpty()
                && $offerings->every(fn ($offer) => $offer->is_published && $offer->sessions->where('is_published', true)->isNotEmpty())
                && $material !== null && in_array($material->disk, ['local', 'private'], true) && Storage::disk($material->disk)->exists($material->path)
                && AcademicAssessment::where('state', 'published')->whereHas('resource', fn ($query) => $query->whereIn('academic_offering_id', $public->pluck('id')))->exists(), 'Professeur '.$faculty.' : profil actif, quatre offres, séances, public inscrit, support privé et devoir publié.');
            $student = $entry($faculty === 'med' ? 'etudiant.med' : 'etudiant.droit', '2026-2027');
            $permissions = app(AcademicAccessService::class)->permissions($student);
            $announcements = app(StudentAnnouncements::class)->query($student, $permissions)->with('offering.level')->get();
            $check($announcements->isNotEmpty() && $announcements->every(fn ($row) => (int) $row->offering->level->faculty_id === (int) $student->level->faculty_id), 'Annonces '.$faculty.' visibles uniquement dans le public de ses cours et de sa faculté.');
        }
        $check(AcademicSession::count() === 16 && AcademicOffering::count() === 16 && AcademicAssessment::count() === 11, 'Catalogue léger : 16 offres, 16 séances et 11 devoirs/évaluations.');
    });

    echo PHP_EOL.'Compteurs : '.$users->count().' comptes, '.AcademicEnrollment::count().' inscriptions annuelles, '.CourseRegistration::count().' inscriptions pédagogiques, '
        .StudentPayment::count().' versements, '.AcademicOfficialResult::count().' résultats officiels.'.PHP_EOL;
    echo $checks.' contrôles, '.$failures.' échec(s). '.($failures === 0 ? 'VALIDÉ' : 'NON VALIDÉ').PHP_EOL;
    exit($failures === 0 ? 0 : 1);
} catch (Throwable $error) {
    fwrite(STDERR, 'Vérification impossible : '.get_class($error).'. Vérifiez le profil isolé et l’installation de la recette.'.PHP_EOL);
    exit(1);
}
