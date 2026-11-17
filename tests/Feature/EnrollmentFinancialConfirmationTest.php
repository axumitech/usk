<?php

namespace Tests\Feature;

use App\Models\Student\AcademicEnrollment;
use App\Models\Student\StudentPayment;
use App\Models\User;
use App\Modules\Student\Application\Services\AcademicEnrollmentService;
use App\Notifications\AcademicEnrollmentChanged;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
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

        $partial = $this->recordPayment($entry, '20.00', 'tuition', 'PARTIAL-FIRST');
        $remaining = $this->recordPayment($entry, '30.00', 'tuition', 'REMAINING-FIRST');
        $this->validatePayment($partial);
        $this->artisan('student:confirm-covered-enrollments')->assertSuccessful();
        $this->assertSame('pending_confirmation', $entry->fresh()->enrollment_status);
        $this->actingAs($student)->get('/app/dashboard/student/fees?academic='.$entry->id)->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('academic.enrollment_status', 'pending_confirmation')
                ->where('first_installment.status', 'due')->where('first_installment.amount_cents', 5000)
                ->where('first_installment.paid_cents', 2000)->where('first_installment.remaining_cents', 3000)
                ->where('balance.pending_cents', 3000)->where('permissions.courses_view.allowed', false));

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

    private function pendingEnrollment(bool $withTuition = true): array
    {
        $student = $this->studentContext();
        $admin = User::factory()->create()->assignRole(Role::findOrCreate('admin', 'web'));
        $entry = $student->studentProfile->enrollments()->sole();
        $entry->update(['enrollment_status' => 'pending_confirmation']);
        if ($withTuition) {
            $entry->obligations()->create(['kind' => 'tuition', 'title' => 'Première tranche', 'installment' => 1, 'amount_cents' => 5000]);
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
