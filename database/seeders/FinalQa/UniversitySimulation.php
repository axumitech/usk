<?php

namespace Database\Seeders\FinalQa;

use App\Models\AcademicStructure\AcademicDepartment;
use App\Models\AcademicStructure\AdmissionCampaign;
use App\Models\AcademicStructure\University;
use App\Models\AcademicYear;
use App\Models\Faculty;
use App\Models\Student\AcademicAudit;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicOfficialResult;
use App\Models\Student\AcademicProgression;
use App\Models\Student\AbsenceJustification;
use App\Models\Student\OfficialDocument;
use App\Models\Student\ServiceRequest;
use App\Models\User;
use App\Modules\AcademicYear\Application\UseCases\CloseAcademicYear;
use App\Modules\Student\Application\Services\Audit;
use Database\Seeders\RecetteV2\AcademicCatalogFixtures;
use Database\Seeders\RecetteV2\RecipeDatabase;
use Database\Seeders\RecetteV2\StudentFinanceFixtures;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use RuntimeException;

final class UniversitySimulation
{
    private const INSTALLED = 'final_qa_university_installed';

    private function profile(): array
    {
        $file = RecipeDatabase::directory(base_path()).'/final-qa.json';
        if (! is_file($file) || is_link($file)) {
            throw new RuntimeException('Marqueur de simulation finale absent.');
        }

        return json_decode(file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
    }

    public function guard(): void
    {
        $root = getenv('USK_QA_FINAL_ROOT');
        if (! $root || ! is_dir($root) || realpath($root) !== realpath(RecipeDatabase::directory(base_path()))) {
            throw new RuntimeException('La connexion doit être initialisée par le lanceur QA final.');
        }
        $token = RecipeDatabase::assertConnection();
        $profile = $this->profile();
        if ($token !== ($profile['token'] ?? null) || ! is_string($profile['password'] ?? null)
            || ! app()->environment('local', 'testing') || config('mail.mailers.smtp.host') !== '127.0.0.1'
            || (int) config('mail.mailers.smtp.port') !== 1025
            || realpath(storage_path()) !== realpath(dirname(RecipeDatabase::profile(RecipeDatabase::directory(base_path()))['database']).'/storage')) {
            throw new RuntimeException('Identité du profil, stockage privé ou configuration SMTP de recette invalide.');
        }
    }

    public function bootstrap(): void
    {
        $this->guard();
        if (User::where('email', 'not like', '%@usk.test')->exists()) {
            throw new RuntimeException('Comptes étrangers au profil de simulation.');
        }
        DB::transaction(function () {
            if (User::where('email', 'admin@usk.test')->exists()) {
                return;
            }
            app(RolePermissionSeeder::class)->run();
            $accounts = new UniversityAccounts($this->profile()['password']);
            $admin = Carbon::withTestNow('2025-09-30 09:00:00 Africa/Kinshasa',
                fn () => $accounts->create('admin', 'Administration', 'Institution fictive', 'admin'));
            $admin->givePermissionTo(['manage academic progression', 'manage academic results', 'deliberate academic results',
                'approve academic progression', 'manage official documents', 'approve official documents', 'issue official documents', 'publish official results']);
        });
    }

    public function populate(): void
    {
        $this->guard();
        if (AcademicAudit::where('action', self::INSTALLED)->exists()) {
            return;
        }
        if (User::count() !== 1 || University::exists() || Faculty::exists() || AcademicYear::exists()) {
            throw new RuntimeException('Conservez le profil utilisé dans le navigateur. Choisissez un nouveau profil pour simuler la cohorte.');
        }
        $admin = User::where('email', 'admin@usk.test')->sole();
        $accounts = new UniversityAccounts($this->profile()['password']);
        $catalogue = app(UniversityCatalog::class);
        $population = app(UniversityPopulation::class);
        $fees = app(StudentFinanceFixtures::class);
        $mailer = Mail::getFacadeRoot();
        $queue = config('queue.default');
        Mail::fake();
        config(['queue.default' => 'sync']);
        try {
            UniversityFixtureStorage::transaction(function () use ($admin, $accounts, $catalogue, $population, $fees) {
                $accounts->create('plateforme', 'Supervision', 'Plateforme fictive', 'super-admin');
                $accounts->create('rectorat', 'Rectorat', 'Fictif', 'rector');
                $accounts->create('academique', 'Secrétariat', 'Fictif', 'academic-secretary');
                $candidate = $accounts->create('candidat', 'Candidat', 'Fictif', 'user');
                $candidate->assignRole('candidate');
                [$catalog, $students] = Carbon::withTestNow('2025-10-05 10:00:00 Africa/Kinshasa', function () use ($admin, $accounts, $catalogue, $population, $fees) {
                    $catalog = $catalogue->startYear($catalogue->create($admin, $accounts), $admin, 'past');
                    $fees->tariffs($admin, $catalog, 'past');

                    return [$catalog, $population->historical($catalog, $admin, $accounts)];
                });
                Carbon::withTestNow('2025-11-15 10:00:00 Africa/Kinshasa', fn () => app(UniversityRecords::class)->documents($catalog, $students, $admin));
                $population->results($catalog, $students, $admin);
                Carbon::withTestNow('2026-09-30 16:00:00 Africa/Kinshasa', function () use ($admin, $catalog) {
                    app(CloseAcademicYear::class)->execute($catalog['past_year']->id, $admin->id, UniversityCatalog::REASON);
                    AdmissionCampaign::where('academic_year_id', $catalog['past_year']->id)->update(['is_open' => false]);
                });
                Carbon::withTestNow('2026-11-18 09:00:00 Africa/Kinshasa', function () use ($catalogue, $admin, $catalog, $students, $fees, $population, $accounts) {
                    $catalog = $catalogue->startYear($catalog, $admin, 'current');
                    $fees->tariffs($admin, $catalog, 'current');
                    $population->renew($catalog, $students, $admin, $accounts);
                    $teachers = [];
                    foreach ($catalog['professors'] as $key => $teacher) {
                        $teachers['professeur.'.$key] = User::findOrFail($teacher->user_id);
                    }
                    app(AcademicCatalogFixtures::class)->content($catalog, $teachers);
                    Audit::record($admin->id, self::INSTALLED, $catalog['university'], UniversityCatalog::REASON);
                    $this->summary();
                });
            });
        } finally {
            Mail::swap($mailer);
            config(['queue.default' => $queue]);
        }
    }

    public function verify(): array
    {
        $this->guard();

        return $this->summary();
    }

    private function summary(): array
    {
        $past = AcademicYear::where('title', '2025-2026')->sole();
        $current = AcademicYear::where('title', '2026-2027')->sole();
        $departments = AcademicDepartment::orderBy('code')->get();
        $byDepartment = [];
        foreach ($departments as $department) {
            $entries = AcademicEnrollment::where('academic_year_id', $past->id)->where('academic_department_id', $department->id);
            $byDepartment[$department->code] = $entries->count();
            if ($entries->count() !== 20 || (clone $entries)->distinct()->count('level_id') < 2
                || (clone $entries)->whereNull('class_id')->exists() || (clone $entries)->whereNull('curriculum_version_id')->exists()
                || (clone $entries)->where('enrollment_status', '!=', 'completed')->exists()) {
                throw new RuntimeException('Effectifs, niveaux ou dossiers historiques incohérents dans '.$department->code);
            }
        }
        $published = AcademicOfficialResult::published()->whereHas('enrollment', fn ($q) => $q->where('academic_year_id', $past->id))->count();
        $progressions = AcademicProgression::where('academic_year_id', $current->id)->whereNotNull('target_enrollment_id')
            ->groupBy('kind')->selectRaw('kind, COUNT(*) AS total')->pluck('total', 'kind');
        $mandates = DB::table('promotion_representatives as mandates')
            ->join('student_profiles as profiles', 'profiles.user_id', '=', 'mandates.user_id')
            ->join('academic_enrollments as entries', 'entries.student_profile_id', '=', 'profiles.id')
            ->whereColumn('entries.academic_promotion_id', 'mandates.academic_promotion_id')
            ->where('entries.academic_year_id', $current->id)->where('entries.enrollment_status', 'confirmed')->count();
        $historicalRecords = [
            'cartes_delivrees' => OfficialDocument::whereNotNull('delivered_at')->whereHas('type', fn ($query) => $query->where('kind', 'card'))->count(),
            'attestations_emises' => OfficialDocument::whereHas('type', fn ($query) => $query->where('kind', 'enrollment'))->count(),
            'demandes_documentaires_en_attente' => ServiceRequest::whereNotNull('official_document_type_id')->where('status', 'open')->count(),
            'absences_justifiees' => AbsenceJustification::where('status', 'accepted')->count(),
            'recours_instruits' => ServiceRequest::whereNotNull('academic_official_result_id')->where('status', 'rejected')->count(),
        ];
        if (Faculty::count() !== 5 || count($byDepartment) !== 10 || array_sum($byDepartment) !== 200 || $past->status !== 'closed'
            || $current->status !== 'open' || $published !== 200 || ! $progressions->get('repeat') || ! $progressions->get('advance')
            || $departments->groupBy('faculty_id')->contains(fn ($group) => $group->count() !== 2)
            || min($historicalRecords) < 10 || $mandates !== 10
            || DB::select('PRAGMA foreign_key_check') !== [] || User::where('email', 'not like', '%@usk.test')->exists()) {
            throw new RuntimeException('Contrôles finaux de la simulation universitaire incomplets.');
        }

        return ['faculties' => Faculty::count(), 'historical_students_by_department' => $byDepartment, 'published_results' => $published, 'archives' => $historicalRecords,
            'enrollments_current' => AcademicEnrollment::where('academic_year_id', $current->id)->count(), 'renewals' => $progressions,
            'active_promotion_mandates' => $mandates, 'foreign_key_violations' => 0];
    }
}

