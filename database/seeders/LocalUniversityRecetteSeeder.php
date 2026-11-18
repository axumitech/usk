<?php

namespace Database\Seeders;

use App\Models\Student\AcademicAudit;
use App\Models\User;
use App\Modules\AcademicYear\Application\UseCases\CloseAcademicYear;
use App\Modules\Student\Application\Services\Audit;
use Carbon\Carbon;
use Database\Seeders\RecetteV2\AcademicCatalogFixtures;
use Database\Seeders\RecetteV2\HistoricalAcademicFixtures;
use Database\Seeders\RecetteV2\RecipeAccounts;
use Database\Seeders\RecetteV2\RecipeDatabase;
use Database\Seeders\RecetteV2\StudentFinanceFixtures;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use RuntimeException;

final class LocalUniversityRecetteSeeder extends Seeder
{
    private const INSTALLED = 'local_university_recette_v2_installed';

    public function run(): void
    {
        $token = RecipeDatabase::assertConnection();
        if (User::query()->whereRaw('LOWER(email) NOT LIKE ?', ['%@usk.test'])->exists()) {
            throw new RuntimeException('La base contient des comptes extérieurs au domaine de recette.');
        }

        $marker = AcademicAudit::where('action', self::INSTALLED)->first();
        if ($marker !== null && ($marker->data['token'] ?? null) === $token) {
            $this->command?->info('Données fictives déjà installées.');

            return;
        }

        $this->assertEmpty();
        if (! config('student.enrollment_auto_confirmation') || ! config('student.enrollment_requires_first_installment')
            || (int) config('student.enrollment_activation_percentage') !== 30 || config('student.currency') !== 'USD') {
            throw new RuntimeException('La recette exige la première tranche en USD et son seuil automatique de 30 %.');
        }

        $mailer = Mail::getFacadeRoot();
        $queue = config('queue.default');
        Mail::fake();
        config(['queue.default' => 'sync']);

        try {
            DB::transaction(fn () => $this->installFixtures($token));
        } finally {
            Mail::swap($mailer);
            config(['queue.default' => $queue]);
        }

        $this->command?->info('Données fictives installées pour 2025–2026 et 2026–2027.');
    }

    private function assertEmpty(): void
    {
        // The academic portal migration installs unassigned Spatie roles and permissions.
        $tables = DB::table('sqlite_master')->where('type', 'table')->whereNotLike('name', 'sqlite_%')
            ->whereNotIn('name', ['migrations', 'roles', 'permissions', 'role_has_permissions'])->pluck('name');
        foreach ($tables as $table) {
            if (DB::table($table)->exists()) {
                throw new RuntimeException('La base contient des données sans marqueur de recette validé.');
            }
        }
    }

    private function installFixtures(int $token): void
    {
        $accounts = app(RecipeAccounts::class);
        $catalogue = app(AcademicCatalogFixtures::class);
        $finance = app(StudentFinanceFixtures::class);
        $history = app(HistoricalAcademicFixtures::class);

        [$users, $catalog, $entries] = Carbon::withTestNow('2025-10-05 10:00:00 Africa/Kinshasa', function () use ($accounts, $catalogue, $finance) {
            $users = $accounts->create();
            $catalog = $catalogue->past($users);
            $accounts->delegate($users, $catalog['faculties']);

            return [$users, $catalog, $finance->historical($users, $catalog)];
        });

        $prepared = $history->prepare($users, $catalog, $entries);
        Carbon::withTestNow('2026-09-30 16:00:00 Africa/Kinshasa', function () use ($users, $catalog) {
            app(CloseAcademicYear::class)->execute($catalog['past_year']->getKey(), $users['admin']->getKey(), 'Clôture fictive de la recette après les décisions annuelles.');
        });
        $catalog['past_year']->refresh();

        Carbon::withTestNow('2026-11-18 09:00:00 Africa/Kinshasa', function () use ($users, $catalog, $catalogue, $history, $prepared, $finance, $token) {
            $catalog = $catalogue->current($catalog, $users);
            $renewal = $history->renew($users, $catalog, $prepared);
            $finance->current($users, $catalog, $renewal);
            $catalogue->content($catalog, $users);

            Audit::record($users['admin']->getKey(), self::INSTALLED, $catalog['university'], data: ['token' => $token]);
        });
    }
}
