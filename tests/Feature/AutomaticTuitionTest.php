<?php

namespace Tests\Feature;

use App\Models\AcademicStructure\AcademicCycle;
use App\Models\AcademicStructure\AcademicProgram;
use App\Models\AcademicStructure\AcademicPromotion;
use App\Models\AcademicStructure\University;
use App\Models\Enrollment;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\FinanceTariff;
use App\Models\User;
use App\Modules\Student\Application\Services\FeeTariffService;
use App\Modules\Student\Application\Services\StudentAdmissionService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Permission\Models\Role;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class AutomaticTuitionTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    public static function studentFinanceSections(): array
    {
        return ['financial account' => ['fees'], 'annual fees' => ['annual-fees']];
    }

    #[DataProvider('studentFinanceSections')]
    public function test_student_finance_catches_up_with_the_active_tariff_and_displays_both_installments(string $section): void
    {
        [$student, $entry] = $this->context();
        $tariff = $this->activateTariff($entry);
        $this->assertFalse($entry->obligations()->exists());
        $student->update(['nationality_code' => 'CD']);
        $url = route('dashboard.student.index', ['section' => $section, 'academic' => $entry->id]);

        $this->actingAs($student)->get($url)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('academic.fee_category', 'national')
            ->where('balance.assessed', true)->where('balance.balance_cents', 12550)
            ->has('finance_schedule', 2)
            ->where('finance_schedule.0.due_at', '2026-12-01')->where('finance_schedule.0.remaining_cents', 7550)
            ->where('finance_schedule.1.due_at', '2027-02-15')->where('finance_schedule.1.remaining_cents', 5000));
        $this->get($url)->assertOk();
        $this->assertSame([$tariff->id, $tariff->id], $entry->obligations()->orderBy('installment')->pluck('finance_tariff_id')->all());
        $this->assertDatabaseCount('student_obligations', 2);
    }

    public function test_finance_catch_up_preserves_issued_tuition_and_does_not_guess_a_missing_category(): void
    {
        [$student, $entry] = $this->context();
        $this->activateTariff($entry);

        $this->actingAs($student)->get($this->fees($entry))->assertInertia(fn (Assert $page) => $page
            ->where('academic.fee_category', null)->where('balance.assessed', false)->has('finance_schedule', 0));
        $original = $entry->obligations()->create([
            'kind' => 'tuition', 'title' => 'Tranche déjà émise', 'installment' => 1,
            'amount_cents' => 2100, 'currency' => 'USD', 'due_at' => '2026-11-20',
        ]);
        $student->update(['nationality_code' => 'CD']);
        $this->get($this->fees($entry))->assertInertia(fn (Assert $page) => $page
            ->where('balance.balance_cents', 2100)->has('finance_schedule', 1)
            ->where('finance_schedule.0.due_at', '2026-11-20'));
        $this->assertSame($original->id, $entry->obligations()->sole()->id);
    }

    public function test_future_tariff_becomes_available_on_its_start_date_in_kinshasa(): void
    {
        [$student, $entry] = $this->context();
        $student->update(['nationality_code' => 'CD']);
        $this->activateTariff($entry, ['valid_from' => '2026-11-17']);

        $this->actingAs($student)->get($this->fees($entry))->assertInertia(fn (Assert $page) => $page
            ->where('balance.assessed', false)->has('finance_schedule', 0));
        $this->travelTo(CarbonImmutable::parse('2026-11-17 00:01', 'Africa/Kinshasa'));
        $this->get($this->fees($entry))->assertInertia(fn (Assert $page) => $page
            ->where('balance.balance_cents', 12550)->has('finance_schedule', 2));
    }

    public function test_a_transfer_with_same_year_tuition_history_does_not_create_a_second_bill(): void
    {
        [$student, $target] = $this->context();
        $target->update(['enrollment_status' => 'pending_confirmation']);
        $source = $target->replicate()->forceFill(['enrollment_status' => 'transferred', 'context_slot' => null]);
        $source->save();
        $original = $source->obligations()->create([
            'kind' => 'tuition', 'title' => 'Tranche du dossier transféré', 'installment' => 1,
            'amount_cents' => 6200, 'currency' => 'USD', 'due_at' => '2026-11-20',
        ]);
        $this->activateTariff($target);
        $student->update(['nationality_code' => 'CD']);

        $this->actingAs($student)->get($this->fees($target))->assertInertia(fn (Assert $page) => $page
            ->where('balance.assessed', false)->has('finance_schedule', 0));
        $this->artisan('student:apply-effective-tuition-tariffs')->assertSuccessful();
        $this->assertFalse($target->obligations()->exists());
        $this->assertSame($original->id, $source->obligations()->sole()->id);
    }

    public function test_activation_without_a_staff_actor_and_activation_replay_bill_the_effective_tariff(): void
    {
        [, $context] = $this->context();
        $tariff = $this->activateTariff($context);
        $service = app(StudentAdmissionService::class);
        $firstApplication = $this->application($context, 'CD');
        $first = $service->activate($firstApplication, null, notify: false);
        $this->assertSame('national', $first->fresh()->fee_category);
        $this->assertSame(2, $first->obligations()->where('finance_tariff_id', $tariff->id)->count());

        $replayedApplication = $this->application($context, null);
        $unbilled = $service->activate($replayedApplication, null, notify: false);
        $this->assertFalse($unbilled->obligations()->exists());
        $replayedApplication->student->update(['nationality_code' => 'CD']);
        $replayed = $service->activate($replayedApplication, null, notify: false);
        $this->assertSame($unbilled->id, $replayed->id);
        $this->assertSame(2, $replayed->obligations()->where('finance_tariff_id', $tariff->id)->count());
    }

    public function test_program_tariff_uses_the_assigned_promotion_before_a_curriculum_is_published(): void
    {
        [$student, $entry] = $this->context();
        $university = University::create(['code' => 'USK', 'name' => 'Université de test']);
        $entry->level->faculty->update(['university_id' => $university->id]);
        $cycle = AcademicCycle::create([
            'university_id' => $university->id, 'code' => 'C1', 'name' => 'Cycle de test', 'normal_duration' => 3,
            'progression_mode' => 'custom', 'weighting_mode' => 'credits', 'periods' => [],
        ]);
        $program = AcademicProgram::create([
            'faculty_id' => $entry->level->faculty_id, 'academic_cycle_id' => $cycle->id,
            'code' => 'PROG', 'name' => 'Programme de test', 'is_active' => true,
        ]);
        $program->levels()->attach($entry->level_id, ['position' => 1]);
        $promotion = AcademicPromotion::create([
            'academic_program_id' => $program->id, 'academic_year_id' => $entry->academic_year_id,
            'level_id' => $entry->level_id, 'code' => 'PROMO', 'name' => 'Promotion de test',
        ]);
        $entry->update(['academic_promotion_id' => $promotion->id]);
        $tariff = $this->activateTariff($entry, ['academic_program_id' => $program->id, 'academic_cycle_id' => $cycle->id]);
        $student->update(['nationality_code' => 'CD']);

        $this->assertNull($entry->fresh()->curriculum_version_id);
        $this->actingAs($student)->get($this->fees($entry))->assertInertia(fn (Assert $page) => $page
            ->where('balance.balance_cents', 12550)->has('finance_schedule', 2));
        $this->assertSame(2, $entry->obligations()->where('finance_tariff_id', $tariff->id)->count());
    }

    private function context(): array
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-16 10:00', 'Africa/Kinshasa'));
        $student = $this->studentContext();

        return [$student, $student->studentProfile->enrollments()->sole()];
    }

    private function activateTariff(AcademicEnrollment $entry, array $scope = []): FinanceTariff
    {
        $admin = User::factory()->create();
        $admin->assignRole(Role::findOrCreate('admin', 'web'));
        $service = app(FeeTariffService::class);
        $tariff = $service->create($admin, $scope + [
            'academic_year_id' => $entry->academic_year_id, 'level_id' => $entry->level_id,
            'category' => 'national', 'kind' => 'tuition', 'title' => 'Barème annuel',
            'currency' => 'USD', 'valid_from' => '2026-10-01', 'valid_until' => '2027-09-30',
            'reason' => 'Barème approuvé pour cette année.',
            'schedule' => [['amount' => '75.50', 'due_at' => '2026-12-01'], ['amount' => '50.00', 'due_at' => '2027-02-15']],
        ]);
        $service->activate($tariff, $admin, 'Activation du barème académique.');

        return $tariff;
    }

    private function application(AcademicEnrollment $entry, ?string $nationality): Enrollment
    {
        $student = User::factory()->create(['nationality_code' => $nationality]);

        return Enrollment::create([
            'student_id' => $student->id, 'level_id' => $entry->level_id, 'academic_year_id' => $entry->academic_year_id,
            'status' => 'validated', 'meta' => ['required_documents' => []],
        ]);
    }

    private function fees(AcademicEnrollment $entry): string
    {
        return route('dashboard.student.index', ['section' => 'fees', 'academic' => $entry->id]);
    }
}
