<?php

namespace Tests\Feature;

use App\Models\Enrollment;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\FinanceTariff;
use App\Models\Student\StudentProfile;
use App\Models\User;
use App\Modules\Student\Application\Services\FeeTariffService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class AdditionalFinanceTariffsTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    public function test_an_additional_fee_can_be_issued_without_a_deadline_and_never_becomes_overdue(): void
    {
        [$admin, $medicine, $otherLevel] = $this->context();
        $this->actingAs($admin);
        $definition = $this->definition($medicine, 'library', 'Frais de bibliothèque', '12.50');
        $definition['schedule'] = [['amount' => '12.50']];
        $create = route('dashboard.admin.finance.tariffs');
        $this->post($create, array_replace($definition, ['automatic' => false, 'kind' => 'tuition', 'category' => 'national']))
            ->assertSessionHasErrors('schedule.0.due_at');
        $this->post($create, $definition + ['fee_scope' => 'level', 'level_id' => $medicine->level_id])->assertSessionHasNoErrors();
        $tariff = FinanceTariff::sole();
        $this->assertSame([['amount_cents' => 1250, 'due_at' => null]], $tariff->schedule);
        $this->put(route('dashboard.admin.finance.tariffs.update', $tariff), array_replace($definition, [
            'schedule' => [['amount' => '15.00', 'due_at' => '']],
            'revision' => app(FeeTariffService::class)->revision($tariff, $tariff->version),
        ]))->assertSessionHasNoErrors();
        $this->activate($tariff->fresh());
        $this->assertFalse($otherLevel->obligations()->exists());
        $this->travelTo(CarbonImmutable::parse('2027-03-01 10:00', 'Africa/Kinshasa'));

        $this->actingAs($medicine->profile->user)->get($this->financeUrl($medicine))->assertInertia(fn (Assert $page) => $page
            ->where('balance.balance_cents', 1500)->where('balance.overdue_cents', 0)
            ->has('finance_schedule', 1)->where('finance_schedule.0.title', 'Frais de bibliothèque')
            ->where('finance_schedule.0.due_at', null)->where('finance_schedule.0.status', 'upcoming'));
    }

    public function test_library_fee_for_first_year_medicine_only_appears_in_the_target_students_finances(): void
    {
        [$admin, $medicine, $medicineSecondYear, $law] = $this->context();
        $medicine->level->faculty->update(['name' => 'Faculté de Médecine']);
        $medicine->level->update(['title' => 'Première Licence']);
        $law->level->update(['title' => 'Première Licence']);
        $secondStudent = $this->enroll($medicine, $medicine->level_id);

        $target = [$medicine, $secondStudent];
        $otherStudents = [$medicineSecondYear, $law];
        foreach ([...$target, ...$otherStudents] as $entry) {
            $entry->obligations()->createMany([
                ['kind' => 'tuition', 'installment' => 1, 'title' => 'Première tranche', 'currency' => 'USD', 'amount_cents' => 45000, 'due_at' => '2026-12-12'],
                ['kind' => 'tuition', 'installment' => 2, 'title' => 'Deuxième tranche', 'currency' => 'USD', 'amount_cents' => 35300, 'due_at' => '2027-03-15'],
            ]);
        }

        $this->actingAs($admin);
        $tariff = $this->tariff($medicine, 'library', 'Frais de bibliothèque', '12.50', [
            'fee_scope' => 'level', 'level_id' => $medicine->level_id,
        ]);
        $this->assertDatabaseMissing('student_obligations', ['kind' => 'library']);
        $this->activate($tariff);

        foreach ($target as $entry) {
            $this->actingAs($entry->profile->user)->get($this->financeUrl($entry))->assertInertia(fn (Assert $page) => $page
                ->where('academic.faculty', 'Faculté de Médecine')->where('academic.level', 'Première Licence')
                ->where('balance.balance_cents', 81550)->has('finance_schedule', 3)
                ->where('finance_schedule.0.kind', 'library')->where('finance_schedule.0.kind_title', 'Frais de bibliothèque')
                ->where('finance_schedule.0.due_at', '2026-12-01')->where('finance_schedule.0.remaining_cents', 1250));
        }
        foreach ($otherStudents as $entry) {
            $this->actingAs($entry->profile->user)->get($this->financeUrl($entry))->assertInertia(fn (Assert $page) => $page
                ->where('balance.balance_cents', 80300)->has('finance_schedule', 2)
                ->where('finance_schedule', fn ($lines) => ! collect($lines)->contains('kind', 'library')));
        }

        $this->actingAs($admin);
        $this->activate($tariff);
        $this->assertDatabaseCount('student_obligations', 10);
    }

    public function test_activated_fees_bill_only_the_selected_scope_and_appear_in_student_finances(): void
    {
        [$admin, $medicine, $otherLevel, $law] = $this->context();
        config(['student.enrollment_auto_confirmation' => true, 'student.enrollment_requires_first_installment' => true]);
        $otherLevel->update(['enrollment_status' => 'pending_confirmation']);
        $differentCurrency = $this->enroll($medicine, $medicine->level_id, 'CDF');
        $medicine->obligations()->create([
            'kind' => 'tuition', 'installment' => 1, 'title' => 'Frais académiques déjà facturés', 'currency' => 'USD',
            'amount_cents' => 8000, 'due_at' => '2026-12-02',
        ]);
        $this->actingAs($admin);
        $campus = $this->tariff($medicine, 'library', 'Frais de bibliothèque', '12.50');
        $faculty = $this->tariff($medicine, 'lab_access', 'Accès aux laboratoires', '9.00', ['faculty_id' => $medicine->level->faculty_id]);
        $level = $this->tariff($medicine, 'practice', 'Travaux pratiques', '7.50', ['level_id' => $medicine->level_id]);

        foreach ([$campus, $faculty, $level] as $tariff) {
            $this->activate($tariff);
        }
        $this->assertSame(['lab_access', 'library', 'practice', 'tuition'], $medicine->obligations()->orderBy('kind')->pluck('kind')->all());
        $this->assertSame(['lab_access', 'library'], $otherLevel->obligations()->orderBy('kind')->pluck('kind')->all());
        $this->assertSame(['library'], $law->obligations()->pluck('kind')->all());
        $this->assertFalse($differentCurrency->obligations()->exists());
        $this->assertSame('pending_confirmation', $otherLevel->fresh()->enrollment_status);
        $this->get(route('dashboard.admin.finance.index'))->assertInertia(fn (Assert $page) => $page
            ->where('totals.0.currency', 'USD')->where('totals.0.balance_cents', 14300));

        $this->actingAs($medicine->profile->user)->get($this->financeUrl($medicine))->assertInertia(fn (Assert $page) => $page
            ->where('balance.balance_cents', 10900)->has('finance_schedule', 4)
            ->where('finance_schedule.0.due_at', '2026-12-01')
            ->where('finance_schedule', fn ($lines) => collect($lines)->contains(fn ($line) => $line['kind'] === 'library' && $line['remaining_cents'] === 1250)));
        $this->get($this->financeUrl($medicine))->assertOk();
        $this->assertDatabaseCount('student_obligations', 7);

        $late = $this->enroll($medicine, $medicine->level_id);
        $tuition = $late->obligations()->create([
            'kind' => 'tuition', 'installment' => 1, 'title' => 'Tranche de scolarité', 'currency' => 'USD',
            'amount_cents' => 1000, 'due_at' => '2026-12-02',
        ]);
        $this->actingAs($late->profile->user)->get($this->financeUrl($late))->assertInertia(fn (Assert $page) => $page
            ->where('balance.balance_cents', 3900)->has('finance_schedule', 4));
        $this->assertSame($tuition->id, $late->obligations()->where('kind', 'tuition')->sole()->id);
    }

    public function test_future_fees_choose_the_most_specific_scope_and_preserve_existing_bills(): void
    {
        [$admin, $medicine, $otherLevel, $law] = $this->context();
        $this->actingAs($admin);
        $scopeDate = ['valid_from' => '2026-11-17'];
        $campus = $this->tariff($medicine, 'library', 'Bibliothèque générale', '10.00', $scopeDate);
        $faculty = $this->tariff($medicine, 'library', 'Bibliothèque de médecine', '20.00', $scopeDate + ['faculty_id' => $medicine->level->faculty_id]);
        $level = $this->tariff($medicine, 'library', 'Bibliothèque du niveau', '30.00', $scopeDate + ['level_id' => $medicine->level_id]);
        foreach ([$campus, $faculty, $level] as $tariff) {
            $this->activate($tariff);
        }
        $this->assertDatabaseCount('student_obligations', 0);

        $previous = $law->obligations()->create([
            'kind' => 'library', 'installment' => 1, 'title' => 'Bibliothèque déjà facturée', 'currency' => 'USD',
            'amount_cents' => 500, 'due_at' => '2026-12-01',
        ]);
        $this->travelTo(CarbonImmutable::parse('2026-11-17 00:01', 'Africa/Kinshasa'));
        $this->actingAs($medicine->profile->user)->get($this->financeUrl($medicine))->assertInertia(fn (Assert $page) => $page
            ->where('balance.balance_cents', 3000)->where('finance_schedule.0.title', 'Bibliothèque du niveau · Échéance 1'));
        $this->artisan('student:apply-effective-fee-tariffs')->assertSuccessful();
        $this->assertSame($level->id, $medicine->obligations()->sole()->finance_tariff_id);
        $this->assertSame($faculty->id, $otherLevel->obligations()->sole()->finance_tariff_id);
        $this->assertSame($previous->id, $law->obligations()->sole()->id);
        $this->assertDatabaseCount('student_obligations', 3);
    }

    public function test_faculty_staff_can_only_publish_fees_for_their_scope(): void
    {
        [$admin, $medicine, , $law] = $this->context();
        $admin->academicFaculties()->attach($medicine->level->faculty_id);
        $this->actingAs($admin);
        $url = route('dashboard.admin.finance.tariffs');
        $data = $this->definition($medicine, 'library', 'Frais de bibliothèque', '10.00');
        $this->post($url, $data)->assertForbidden();
        $this->post($url, $data + ['faculty_id' => $law->level->faculty_id])->assertForbidden();
        $this->post($url, $data + ['level_id' => $law->level_id])->assertForbidden();
        $this->post($url, $data + ['faculty_id' => $medicine->level->faculty_id])->assertSessionHasNoErrors();
        $this->activate(FinanceTariff::sole());
        $this->assertDatabaseMissing('student_obligations', ['academic_enrollment_id' => $law->id]);
    }

    private function context(): array
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-16 10:00', 'Africa/Kinshasa'));
        $first = $this->studentContext();
        $medicine = $first->studentProfile->enrollments()->sole();
        $otherLevel = DB::table('levels')->insertGetId(['faculty_id' => $medicine->level->faculty_id, 'title' => 'Licence 2', 'code' => 'T2']);
        $lawFaculty = DB::table('faculties')->insertGetId(['name' => 'Droit', 'code' => 'LAW']);
        $lawLevel = DB::table('levels')->insertGetId(['faculty_id' => $lawFaculty, 'title' => 'Droit L1', 'code' => 'LAW1']);
        $admin = User::factory()->create();
        $admin->assignRole(Role::findOrCreate('admin', 'web'));
        $admin->givePermissionTo(Permission::findOrCreate('manage academic finance', 'web'));

        return [$admin, $medicine, $this->enroll($medicine, $otherLevel), $this->enroll($medicine, $lawLevel)];
    }

    private function enroll(AcademicEnrollment $example, int $level, string $currency = 'USD'): AcademicEnrollment
    {
        $student = User::factory()->create();
        $student->assignRole(Role::findOrCreate('student', 'web'));
        $application = Enrollment::create([
            'student_id' => $student->id, 'level_id' => $level, 'academic_year_id' => $example->academic_year_id, 'status' => 'validated',
        ]);
        $profile = StudentProfile::create(['user_id' => $student->id, 'student_status' => 'active']);

        return $profile->enrollments()->create([
            'application_id' => $application->id, 'level_id' => $level, 'academic_year_id' => $example->academic_year_id,
            'enrollment_status' => 'confirmed', 'currency' => $currency,
        ]);
    }

    private function definition(AcademicEnrollment $entry, string $kind, string $title, string $amount): array
    {
        return [
            'academic_year_id' => $entry->academic_year_id, 'automatic' => true, 'kind' => $kind, 'category' => 'all',
            'currency' => 'USD', 'title' => $title, 'valid_from' => '2026-10-01',
            'schedule' => [['due_at' => '2026-12-01', 'amount' => $amount]],
            'reason' => 'Frais complémentaires approuvés pour la période.',
        ];
    }

    private function tariff(AcademicEnrollment $entry, string $kind, string $title, string $amount, array $scope = []): FinanceTariff
    {
        $this->post(route('dashboard.admin.finance.tariffs'), $scope + $this->definition($entry, $kind, $title, $amount))
            ->assertSessionHasNoErrors();

        return FinanceTariff::where('title', $title)->sole();
    }

    private function activate(FinanceTariff $tariff): void
    {
        $this->post(route('dashboard.admin.finance.tariffs.activate', $tariff), ['reason' => 'Activation validée par la comptabilité.'])
            ->assertSessionHasNoErrors();
    }

    private function financeUrl(AcademicEnrollment $entry): string
    {
        return route('dashboard.student.index', ['section' => 'fees', 'academic' => $entry->id]);
    }
}
