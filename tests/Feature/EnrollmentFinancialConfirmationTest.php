<?php

namespace Tests\Feature;

use App\Models\Student\AcademicEnrollment;
use App\Models\Student\StudentPayment;
use App\Models\User;
use App\Modules\Student\Application\Services\AcademicEnrollmentService;
use App\Modules\Student\Application\Services\EnrollmentFinancialConfirmation;
use App\Modules\Student\Application\Services\Money;
use App\Notifications\AcademicEnrollmentChanged;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Event;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Permission\Models\Role;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class EnrollmentFinancialConfirmationTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    private const FINANCE = '/app/dashboard/admin/finance';

    private const DOSSIERS = '/app/dashboard/admin/student-academic';

    public function test_pending_partial_and_wrong_allocations_cannot_confirm_the_enrollment(): void
    {
        config(['student.enrollment_auto_confirmation' => true]);
        [$admin, $student, $entry] = $this->pendingEnrollment();
        $first = $entry->obligations()->where('installment', 1)->sole();
        $second = $entry->obligations()->where('installment', 2)->sole();
        $this->actingAs($admin);

        $wrong = $this->recordPayment($entry, '50.00', 'unallocated', 'LATER-ONLY');
        $this->validatePayment($wrong);
        $this->post(self::FINANCE.'/payments/'.$wrong->id.'/allocate', [
            'allocations' => [['obligation_id' => $second->id, 'amount' => '50.00']],
            'reason' => 'Affectation explicite à la deuxième tranche.',
        ])->assertSessionHasNoErrors();
        $this->assertSame('pending_confirmation', $entry->fresh()->enrollment_status);
        $this->post(self::FINANCE.'/confirmations/'.$entry->id, $this->confirmationData($entry))->assertSessionHasErrors('enrollment_status');

        $partial = $this->recordPayment($entry, '10.00', 'tuition', 'PARTIAL-FIRST');
        $remaining = $this->recordPayment($entry, '40.00', 'tuition', 'REMAINING-FIRST');
        $this->validatePayment($partial);
        $this->artisan('student:confirm-covered-enrollments')->assertSuccessful();
        $this->assertSame('pending_confirmation', $entry->fresh()->enrollment_status);
        $this->actingAs($student)->get('/app/dashboard/student/fees?academic='.$entry->id)->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('academic.enrollment_status', 'pending_confirmation')
                ->where('first_installment.status', 'due')->where('first_installment.amount_cents', 5000)
                ->where('first_installment.paid_cents', 1000)->where('first_installment.remaining_cents', 4000)
                ->where('balance.pending_cents', 4000)->where('permissions.courses_view.allowed', false));

        $this->actingAs($admin);
        $this->validatePayment($remaining);
        $this->artisan('student:confirm-covered-enrollments')->assertSuccessful();
        $this->post(self::FINANCE.'/confirmations/'.$entry->id, $this->confirmationData($entry))->assertSessionHasNoErrors();
        $this->assertSame('confirmed', $entry->fresh()->enrollment_status);
        $this->assertDatabaseHas('student_obligations', ['id' => $first->id, 'amount_cents' => 5000]);
        $this->assertConfirmationCount($entry, $student);
    }

    public function test_manual_confirmation_checks_the_actor_and_is_idempotent_for_stale_submissions(): void
    {
        config(['student.enrollment_auto_confirmation' => false]);
        [$admin, $student, $entry] = $this->pendingEnrollment();
        $this->actingAs($admin);
        $this->validatePayment($this->recordPayment($entry, '50.00', 'tuition', 'FIRST'));
        $this->assertSame('pending_confirmation', $entry->fresh()->enrollment_status);

        $url = self::FINANCE.'/confirmations/'.$entry->id;
        $payload = $this->confirmationData($entry);
        $this->actingAs($student)->post($url, $payload)->assertForbidden();
        $this->actingAs($admin)->post($url, $payload)->assertSessionHasNoErrors();
        $this->post($url, $payload)->assertSessionHasNoErrors();
        $this->post($url, array_replace($payload, ['operation_key' => (string) Str::uuid()]))->assertSessionHasNoErrors();
        $this->assertSame('confirmed', $entry->fresh()->enrollment_status);
        $this->assertSame('confirmed', $entry->changes()->sole()->after['enrollment_status']);
        $this->assertConfirmationCount($entry, $student);
        $this->actingAs($student)->get('/app/dashboard/student/fees?academic='.$entry->id)->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('academic.enrollment_status', 'confirmed')
                ->where('first_installment.status', 'covered')->where('permissions.courses_view.allowed', true));
    }

    public function test_missing_and_inconsistent_tuition_obligations_block_confirmation(): void
    {
        config(['student.enrollment_auto_confirmation' => true]);
        [$admin, , $entry] = $this->pendingEnrollment(withTuition: false);
        $this->actingAs($admin)->get(self::FINANCE.'/confirmations')->assertInertia(fn (Assert $page) => $page
            ->where('entries.data.0.first_installment.status', 'absent'));
        $this->post(self::FINANCE.'/confirmations/'.$entry->id, $this->confirmationData($entry))->assertSessionHasErrors('enrollment_status');

        $entry->obligations()->create(['kind' => 'tuition', 'title' => 'Autre tranche', 'installment' => 2, 'amount_cents' => 10000]);
        $this->get(self::FINANCE.'/confirmations')->assertInertia(fn (Assert $page) => $page
            ->where('entries.data.0.first_installment.status', 'invalid'));
        $entry->obligations()->create(['kind' => 'tuition', 'title' => 'Tranche à contrôler', 'installment' => 1, 'amount_cents' => 5000, 'currency' => 'CDF']);
        $this->get(self::FINANCE.'/confirmations')->assertInertia(fn (Assert $page) => $page
            ->where('entries.data.0.first_installment.status', 'invalid'));
        $this->post(self::FINANCE.'/confirmations/'.$entry->id, $this->confirmationData($entry))->assertSessionHasErrors('enrollment_status');
        $this->artisan('student:confirm-covered-enrollments')->assertSuccessful();
        $this->assertSame('pending_confirmation', $entry->fresh()->enrollment_status);
    }

    public static function paymentReversals(): array
    {
        return ['remboursement' => [true, 1000], 'contrepassation' => [false, 5000]];
    }

    #[DataProvider('paymentReversals')]
    public function test_reversal_requires_review_without_revoking_confirmation(bool $refundPayment, int $outstanding): void
    {
        config(['student.enrollment_auto_confirmation' => true]);
        [$admin, $student, $entry] = $this->pendingEnrollment();
        $this->actingAs($admin);
        $payment = $this->recordPayment($entry, '50.00', 'tuition', 'PAID-FIRST');
        $this->validatePayment($payment);
        $this->assertSame('confirmed', $entry->fresh()->enrollment_status);

        $reason = 'Correction comptable sur la première tranche.';
        if ($refundPayment) {
            $this->post(self::FINANCE.'/payments/'.$payment->id.'/refunds', [
                'amount' => '10.00', 'operation_key' => (string) Str::uuid(), 'reason' => $reason,
            ])->assertSessionHasNoErrors();
            $refund = $payment->refunds()->sole();
            $url = self::FINANCE.'/refunds/'.$refund->id.'/status';
            $this->post($url, ['status' => 'approved', 'reason' => $reason])->assertSessionHasNoErrors();
            $payload = ['status' => 'executed', 'reason' => $reason, 'method' => 'bank_transfer', 'execution_reference' => 'REFUND-FIRST'];
        } else {
            $url = self::DOSSIERS.'/payments/'.$payment->id.'/status';
            $payload = ['status' => 'cancelled', 'reason' => $reason];
        }
        $this->post($url, $payload)->assertSessionHasNoErrors();
        $this->post($url, $payload)->assertSessionHasNoErrors();

        $this->assertSame('confirmed', $entry->fresh()->enrollment_status);
        $this->assertDatabaseHas('academic_audits', ['entity_id' => $entry->id, 'action' => 'academic_enrollment_first_installment_review_required']);
        $this->assertSame(1, \App\Models\Student\AcademicAudit::where('action', 'academic_enrollment_first_installment_review_required')->count());
        $this->assertConfirmationCount($entry, $student);
        $this->get(self::FINANCE.'?academic='.$entry->id)->assertInertia(fn (Assert $page) => $page
            ->where('enrollmentConfirmation.first_installment_review_required', true)
            ->where('enrollmentConfirmation.first_installment.remaining_cents', $outstanding));
        $this->actingAs($student)->get('/app/dashboard/student/annual-fees?academic='.$entry->id)->assertInertia(fn (Assert $page) => $page
            ->where('academic.enrollment_status', 'confirmed')->where('first_installment_review_required', true));
    }

    public static function activationAmounts(): array
    {
        return ['20 USD' => ['20.00', false], '29 USD' => ['29.00', false],
            '29.99 USD' => ['29.99', false], '30 USD' => ['30.00', true],
            '50 USD' => ['50.00', true], '100 USD' => ['100.00', true]];
    }

    #[DataProvider('activationAmounts')]
    public function test_default_threshold_confirms_only_validated_first_installment_payments_and_preserves_debt(string $amount, bool $activated): void
    {
        $this->assertTrue(EnrollmentFinancialConfirmation::automatic());
        $this->assertSame(30, EnrollmentFinancialConfirmation::percentage());
        [$admin, $student, $entry] = $this->pendingEnrollment(firstAmount: 10000);
        $statusChanges = 0;
        Event::listen('eloquent.updated: '.AcademicEnrollment::class, function (AcademicEnrollment $changed) use ($entry, &$statusChanges) {
            if ($changed->id === $entry->id && $changed->wasChanged('enrollment_status')) {
                $statusChanges++;
            }
        });
        $this->actingAs($admin);
        $payment = $this->recordPayment($entry, $amount, 'tuition', 'ACTIVATION-THRESHOLD');
        $this->assertSame('pending_confirmation', $entry->fresh()->enrollment_status);
        $this->validatePayment($payment);
        $this->validatePayment($payment);
        $this->artisan('student:confirm-covered-enrollments')->assertSuccessful();
        $this->artisan('student:confirm-covered-enrollments')->assertSuccessful();

        $paid = Money::cents($amount);
        $this->assertSame($activated ? 'confirmed' : 'pending_confirmation', $entry->fresh()->enrollment_status);
        $this->assertSame($activated ? 1 : 0, $statusChanges);
        $this->assertDatabaseHas('student_obligations', ['academic_enrollment_id' => $entry->id, 'installment' => 1, 'amount_cents' => 10000]);
        $this->assertSame($activated ? 1 : 0, \App\Models\Student\AcademicAudit::where('action', 'academic_enrollment_confirmed')->where('entity_id', $entry->id)->count());
        $this->assertSame($activated ? 1 : 0, $student->notifications()->where('type', AcademicEnrollmentChanged::class)->count());
        $this->actingAs($student)->get('/app/dashboard/student/fees?academic='.$entry->id)->assertInertia(fn (Assert $page) => $page
            ->where('first_installment.amount_cents', 10000)->where('first_installment.paid_cents', $paid)
            ->where('first_installment.remaining_cents', 10000 - $paid)
            ->where('first_installment.activation.automatic', true)->where('first_installment.activation.percentage', 30)
            ->where('first_installment.activation.required_cents', 3000)
            ->where('first_installment.activation.remaining_cents', max(0, 3000 - $paid))
            ->where('permissions.courses_view.allowed', $activated));
    }

    public function test_only_explicitly_allocated_general_payments_count_and_manual_initial_actions_are_hidden(): void
    {
        [$admin, $student, $entry] = $this->pendingEnrollment(firstAmount: 10000);
        $first = $entry->obligations()->where('installment', 1)->sole();
        $second = $entry->obligations()->where('installment', 2)->sole();
        $this->actingAs($admin);
        $payment = $this->recordPayment($entry, '60.00', 'unallocated', 'GENERAL-ALLOCATION');
        $this->validatePayment($payment);
        $this->assertSame('pending_confirmation', $entry->fresh()->enrollment_status);
        $this->post(self::FINANCE.'/payments/'.$payment->id.'/allocate', [
            'allocations' => [['obligation_id' => $second->id, 'amount' => '30.00']],
            'reason' => 'Versement validé affecté à la deuxième tranche uniquement.',
        ])->assertSessionHasNoErrors();
        $this->get(self::FINANCE.'?academic='.$entry->id)->assertInertia(fn (Assert $page) => $page
            ->where('enrollmentConfirmation.canConfirm', false)
            ->where('enrollmentConfirmation.first_installment.paid_cents', 0)
            ->where('enrollmentConfirmation.first_installment.activation.remaining_cents', 3000));
        $this->get(self::FINANCE.'/confirmations')->assertInertia(fn (Assert $page) => $page->where('automaticConfirmation', true));
        $this->get(self::DOSSIERS.'/administration?academic='.$entry->id)->assertInertia(fn (Assert $page) => $page
            ->where('enrollmentPolicy.activationPercentage', 30)
            ->where('transitions', fn ($values) => ! collect($values)->contains('confirmed')));
        $allocation = ['allocations' => [['obligation_id' => $first->id, 'amount' => '30.00']], 'reason' => 'Affectation validée au seuil de la première tranche.'];
        $this->actingAs($student)->post(self::FINANCE.'/payments/'.$payment->id.'/allocate', $allocation)->assertForbidden();
        $this->actingAs($admin)->post(self::FINANCE.'/payments/'.$payment->id.'/allocate', $allocation)->assertSessionHasNoErrors();
        $this->post(self::FINANCE.'/payments/'.$payment->id.'/allocate', $allocation)->assertSessionHasNoErrors();
        $this->assertSame('confirmed', $entry->fresh()->enrollment_status);
        $this->assertConfirmationCount($entry, $student);
    }

    public static function roundedPercentages(): array
    {
        return [[30, 3000, 3001], [50, 5000, 5001]];
    }

    #[DataProvider('roundedPercentages')]
    public function test_configured_threshold_rounds_up_to_the_cent(int $percentage, int $insufficient, int $required): void
    {
        config(['student.enrollment_activation_percentage' => $percentage]);
        [$admin, , $entry] = $this->pendingEnrollment(firstAmount: 10001);
        $this->actingAs($admin);
        $this->validatePayment($this->recordPayment($entry, Money::decimal($insufficient), 'tuition', 'ROUNDING-FIRST'));
        $this->assertSame('pending_confirmation', $entry->fresh()->enrollment_status);
        $this->get(self::FINANCE.'?academic='.$entry->id)->assertInertia(fn (Assert $page) => $page
            ->where('enrollmentConfirmation.first_installment.activation.required_cents', $required)
            ->where('enrollmentConfirmation.first_installment.activation.remaining_cents', 1));
        $this->validatePayment($this->recordPayment($entry, '0.01', 'tuition', 'ROUNDING-REMAINDER'));
        $this->assertSame('confirmed', $entry->fresh()->enrollment_status);
    }

    public static function invalidPercentages(): array
    {
        return [[0], [-1], [101], ['incorrect'], [30.5]];
    }

    #[DataProvider('invalidPercentages')]
    public function test_invalid_threshold_configuration_blocks_activation(mixed $percentage): void
    {
        config(['student.enrollment_activation_percentage' => $percentage]);
        [$admin, , $entry] = $this->pendingEnrollment(firstAmount: 10000);
        $this->actingAs($admin);
        $this->validatePayment($this->recordPayment($entry, '100.00', 'tuition', 'INVALID-CONFIG'));
        $this->assertSame('pending_confirmation', $entry->fresh()->enrollment_status);
        $this->get(self::FINANCE.'?academic='.$entry->id)->assertInertia(fn (Assert $page) => $page
            ->where('enrollmentConfirmation.first_installment.activation.required_cents', null)
            ->where('enrollmentConfirmation.first_installment.activation.eligible', false));
    }

    public function test_existing_qualifying_payments_are_rechecked_without_revalidation_or_duplicate_confirmation(): void
    {
        config(['student.enrollment_auto_confirmation' => false]);
        [$admin, $student, $entry] = $this->pendingEnrollment(firstAmount: 10000);
        $this->actingAs($admin);
        $this->validatePayment($this->recordPayment($entry, '30.00', 'tuition', 'EXISTING-VALIDATED'));
        $this->assertSame('pending_confirmation', $entry->fresh()->enrollment_status);
        config(['student.enrollment_auto_confirmation' => true]);
        $this->artisan('student:confirm-covered-enrollments')->assertSuccessful();
        $this->artisan('student:confirm-covered-enrollments')->assertSuccessful();
        $this->assertSame('confirmed', $entry->fresh()->enrollment_status);
        $this->assertConfirmationCount($entry, $student);
    }

    public function test_faculty_finance_verification_activates_without_requiring_manual_admission_permissions(): void
    {
        [, $student, $entry] = $this->pendingEnrollment(firstAmount: 10000);
        $role = Role::findByName('admin', 'web');
        $role->syncPermissions([]);
        $financePermission = \Spatie\Permission\Models\Permission::findOrCreate('manage academic finance', 'web');
        $agent = User::factory()->create()->assignRole($role)->givePermissionTo($financePermission);
        $agent->academicFaculties()->attach($entry->level->faculty_id);
        $this->assertFalse($agent->can('manage academic access'));
        $this->assertFalse($agent->can('manage', $entry));
        $this->actingAs($agent);
        $this->validatePayment($this->recordPayment($entry, '30.00', 'tuition', 'FACULTY-FINANCE-AUTO'));
        $this->assertSame('confirmed', $entry->fresh()->enrollment_status);
        $this->assertConfirmationCount($entry, $student);
    }

    public function test_administrative_release_rechecks_validated_money_and_replay_does_not_duplicate_confirmation(): void
    {
        [$admin, $student, $entry] = $this->pendingEnrollment(firstAmount: 10000);
        $entry->update(['enrollment_status' => 'under_review']);
        $this->actingAs($admin);
        $this->validatePayment($this->recordPayment($entry, '30.00', 'tuition', 'HELD-VALIDATED'));
        $this->assertSame('under_review', $entry->fresh()->enrollment_status);
        $data = ['operation_key' => (string) Str::uuid(), 'enrollment_status' => 'pending_confirmation',
            'expected_status' => 'under_review', 'expected_context' => AcademicEnrollmentService::contextToken($entry->fresh()),
            'reason' => 'Contrôle administratif terminé, reprise de la confirmation automatique.'];
        $service = app(AcademicEnrollmentService::class);
        $service->transition($entry->fresh(), $admin, $data);
        $service->transition($entry->fresh(), $admin, $data);
        $this->assertSame('confirmed', $entry->fresh()->enrollment_status);
        $this->assertSame(1, $entry->changes()->count());
        $this->assertSame(1, \App\Models\Student\AcademicAudit::where('action', 'academic_enrollment_confirmed')->where('entity_id', $entry->id)->count());
        $this->assertSame(1, $student->notifications()->get()->filter(fn ($notification) => $notification->type === AcademicEnrollmentChanged::class && ($notification->data['status'] ?? null) === 'confirmed')->count());
    }

    public function test_partial_activation_remains_confirmed_and_flags_review_after_refund_of_the_first_installment_only(): void
    {
        [$admin, $student, $entry] = $this->pendingEnrollment(firstAmount: 10000);
        $this->actingAs($admin);
        $payment = $this->recordPayment($entry, '30.00', 'tuition', 'PARTIAL-ACTIVATION');
        $this->validatePayment($payment);
        $this->assertSame('confirmed', $entry->fresh()->enrollment_status);
        $this->post(self::FINANCE.'/payments/'.$payment->id.'/refunds', ['amount' => '10.00',
            'operation_key' => (string) Str::uuid(), 'reason' => 'Remboursement fictif après activation partielle.'])->assertSessionHasNoErrors();
        $refund = $payment->refunds()->sole();
        $url = self::FINANCE.'/refunds/'.$refund->id.'/status';
        $this->post($url, ['status' => 'approved', 'reason' => 'Autorisation du remboursement fictif.'])->assertSessionHasNoErrors();
        $data = ['status' => 'executed', 'method' => 'other', 'execution_reference' => 'FICTIVE-REFUND-ACTIVATION',
            'reason' => 'Confirmation du décaissement exclusivement fictif.'];
        $this->post($url, $data)->assertSessionHasNoErrors();
        $this->post($url, $data)->assertSessionHasNoErrors();
        $this->assertSame('confirmed', $entry->fresh()->enrollment_status);
        $this->assertConfirmationCount($entry, $student);
        $this->assertSame(1, \App\Models\Student\AcademicAudit::where('action', 'academic_enrollment_first_installment_review_required')->where('entity_id', $entry->id)->count());
        $this->actingAs($student)->get('/app/dashboard/student/fees?academic='.$entry->id)->assertInertia(fn (Assert $page) => $page
            ->where('first_installment.remaining_cents', 8000)->where('first_installment.activation.remaining_cents', 1000)
            ->where('first_installment_review_required', true));
    }

    public static function blockingContexts(): array
    {
        return [['admission'], ['profile'], ['year'], ['correction_required'], ['suspended'], ['on_leave']];
    }

    public function test_refunding_another_obligation_does_not_flag_the_unchanged_first_installment(): void
    {
        [$admin, $student, $entry] = $this->pendingEnrollment(firstAmount: 10000);
        $this->actingAs($admin);
        $this->validatePayment($this->recordPayment($entry, '30.00', 'tuition', 'ACTIVE-FIRST'));
        $payment = $this->recordPayment($entry, '20.00', 'unallocated', 'SECOND-ONLY');
        $this->validatePayment($payment);
        $this->post(self::FINANCE.'/payments/'.$payment->id.'/allocate', [
            'allocations' => [['obligation_id' => $entry->obligations()->where('installment', 2)->sole()->id, 'amount' => '20.00']],
            'reason' => 'Paiement distinct affecté exclusivement à la seconde tranche.',
        ])->assertSessionHasNoErrors();
        $this->post(self::FINANCE.'/payments/'.$payment->id.'/refunds', ['amount' => '10.00',
            'operation_key' => (string) Str::uuid(), 'reason' => 'Remboursement fictif portant seulement sur la seconde tranche.'])->assertSessionHasNoErrors();
        $refund = $payment->refunds()->sole();
        $url = self::FINANCE.'/refunds/'.$refund->id.'/status';
        $this->post($url, ['status' => 'approved', 'reason' => 'Autorisation de remboursement de seconde tranche.'])->assertSessionHasNoErrors();
        $this->post($url, ['status' => 'executed', 'method' => 'other', 'execution_reference' => 'FICTIVE-SECOND-ONLY',
            'reason' => 'Décaissement fictif de seconde tranche contrôlé.'])->assertSessionHasNoErrors();
        $this->assertSame('confirmed', $entry->fresh()->enrollment_status);
        $this->assertSame(0, \App\Models\Student\AcademicAudit::where('action', 'academic_enrollment_first_installment_review_required')->where('entity_id', $entry->id)->count());
        $this->assertConfirmationCount($entry, $student);
    }

    #[DataProvider('blockingContexts')]
    public function test_financial_threshold_cannot_bypass_academic_context_or_resume_an_interrupted_enrollment(string $blocked): void
    {
        [$admin, $student, $entry] = $this->pendingEnrollment(firstAmount: 10000);
        match ($blocked) {
            'admission' => $entry->application->update(['status' => 'rejected']),
            'profile' => $entry->profile->update(['student_status' => 'inactive']),
            'year' => $entry->academicYear->update(['status' => 'closed']),
            default => $entry->update(['enrollment_status' => $blocked]),
        };
        $this->actingAs($admin);
        $this->validatePayment($this->recordPayment($entry, '30.00', 'tuition', 'BLOCKED-CONTEXT'));
        $this->artisan('student:confirm-covered-enrollments')->assertSuccessful();
        $this->assertNotSame('confirmed', $entry->fresh()->enrollment_status);
        $this->assertSame(0, $student->notifications()->where('type', AcademicEnrollmentChanged::class)->count());
        $this->get(self::FINANCE.'?academic='.$entry->id)->assertInertia(fn (Assert $page) => $page
            ->where('enrollmentConfirmation.first_installment.activation.action_required', 'Contactez le service des inscriptions pour régulariser votre situation académique.'));
        if (in_array($blocked, ['suspended', 'on_leave'], true)) {
            $this->post(self::DOSSIERS.'/'.$entry->id.'/transition', [
                'operation_key' => (string) Str::uuid(), 'expected_status' => $blocked,
                'enrollment_status' => 'confirmed', 'reason' => 'Une reprise exige les contrôles administratifs et financiers existants.',
            ])->assertSessionHasErrors('enrollment_status');
        }
    }

    public function test_newly_activated_student_keeps_only_their_own_academic_context(): void
    {
        [$admin, $student, $entry] = $this->pendingEnrollment(firstAmount: 10000);
        $other = User::factory()->create();
        $application = \App\Models\Enrollment::create(['student_id' => $other->id, 'level_id' => $entry->level_id,
            'academic_year_id' => $entry->academic_year_id, 'status' => 'validated']);
        $profile = \App\Models\Student\StudentProfile::create(['user_id' => $other->id, 'student_status' => 'active']);
        $foreign = $profile->enrollments()->create(['application_id' => $application->id,
            'level_id' => $entry->level_id, 'academic_year_id' => $entry->academic_year_id,
            'enrollment_status' => 'confirmed', 'currency' => 'USD']);
        $this->actingAs($admin);
        $this->validatePayment($this->recordPayment($entry, '30.00', 'tuition', 'OWN-CONTEXT-ONLY'));
        $this->assertSame('confirmed', $entry->fresh()->enrollment_status);
        $this->actingAs($student);
        foreach (['courses', 'fees', 'results'] as $section) {
            $response = $this->get('/app/dashboard/student/'.$section.'?academic='.$foreign->id);
            $this->assertContains($response->status(), [403, 404]);
        }
    }

    private function pendingEnrollment(bool $withTuition = true, int $firstAmount = 5000): array
    {
        $student = $this->studentContext();
        $admin = User::factory()->create()->assignRole(Role::findOrCreate('admin', 'web'));
        $entry = $student->studentProfile->enrollments()->sole();
        $entry->update(['enrollment_status' => 'pending_confirmation']);
        if ($withTuition) {
            $entry->obligations()->create(['kind' => 'tuition', 'title' => 'Première tranche', 'installment' => 1, 'amount_cents' => $firstAmount]);
            $entry->obligations()->create(['kind' => 'tuition', 'title' => 'Deuxième tranche', 'installment' => 2, 'amount_cents' => 10000]);
        }

        return [$admin, $student, $entry];
    }

    private function confirmationData(AcademicEnrollment $entry): array
    {
        return ['operation_key' => (string) Str::uuid(), 'expected_context' => AcademicEnrollmentService::contextToken($entry->fresh()),
            'reason' => 'Vérification du règlement de la première tranche.'];
    }

    private function recordPayment(AcademicEnrollment $entry, string $amount, string $kind, string $reference): StudentPayment
    {
        $this->post(self::DOSSIERS.'/'.$entry->id.'/payments', ['kind' => $kind, 'amount' => $amount, 'method' => 'bank_transfer',
            'reference' => $reference, 'note' => 'Versement synthétique de contrôle.'])->assertSessionHasNoErrors();

        return $entry->payments()->where('reference', $reference)->sole();
    }

    private function validatePayment(StudentPayment $payment): void
    {
        $this->post(self::DOSSIERS.'/payments/'.$payment->id.'/status', ['status' => 'confirmed',
            'reason' => 'Versement vérifié dans le relevé de test.'])->assertSessionHasNoErrors();
    }

    private function assertConfirmationCount(AcademicEnrollment $entry, User $student): void
    {
        $this->assertSame(1, \App\Models\Student\AcademicAudit::where('entity_id', $entry->id)->where('action', 'academic_enrollment_confirmed')->count());
        $this->assertSame(1, $student->notifications()->where('type', AcademicEnrollmentChanged::class)->count());
    }
}
