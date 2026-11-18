<?php

namespace Tests\Feature;

use App\Models\Student\AcademicEnrollment;
use App\Models\Student\StudentPayment;
use App\Models\Student\StudentPaymentProof;
use App\Models\User;
use App\Modules\Student\Application\Services\StudentFinanceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class StudentPaymentProofTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    public function test_a_versement_for_an_enrollment_form_covers_only_that_fee_on_the_annual_page(): void
    {
        [$student, $entry, $admin, , $account] = $this->financeContext();
        $entry->obligations()->create([
            'kind' => 'fiche_enrolement', 'title' => 'Fiche d’enrôlement', 'installment' => 1,
            'amount_cents' => 1200, 'currency' => 'USD', 'due_at' => null,
        ]);
        $academic = ['academic' => $entry->id];
        $annual = route('dashboard.student.index', $academic + ['section' => 'annual-fees']);
        $paymentForm = route('dashboard.student.index', $academic + ['section' => 'fees', 'kind' => 'fiche_enrolement']);
        $this->actingAs($student)->get($paymentForm)->assertInertia(fn (Assert $page) => $page
            ->where('payment_proofs.selected_kind', 'fiche_enrolement')
            ->where('payment_proofs.kinds', fn ($types) => collect($types)->contains(
                fn ($type) => $type['id'] === 'fiche_enrolement' && $type['label'] === 'Fiche d’enrôlement' && $type['balance_cents'] === 1200
            )));
        $this->post(route('dashboard.student.payments.proofs.store', $academic), array_replace($this->deposit(), [
            'kind' => 'fiche_enrolement', 'amount' => '12.00',
        ]))->assertSessionHasNoErrors();
        $this->get($annual)->assertInertia(fn (Assert $page) => $page
            ->where('balance.balance_cents', 19200)
            ->where('finance_details.kinds.tuition.balance_cents', 18000)
            ->where('finance_details.kinds.fiche_enrolement.balance_cents', 1200));

        $proof = StudentPaymentProof::sole();
        $adminFinance = route('dashboard.admin.student-academic.index', $academic + ['tab' => 'finance']);
        $this->actingAs($admin)->get($adminFinance)->assertInertia(fn (Assert $page) => $page
            ->where('payment_fee_kinds', fn ($types) => collect($types)->contains(
                fn ($type) => $type['id'] === 'fiche_enrolement' && $type['label'] === 'Fiche d’enrôlement' && $type['balance_cents'] === 1200
            )));
        $this->from($account)->post(route('dashboard.admin.finance.proofs.review', $proof), $this->decision())
            ->assertSessionHasNoErrors();
        $this->assertDatabaseHas('student_payments', ['kind' => 'fiche_enrolement', 'status' => 'confirmed', 'amount_cents' => 1200]);
        $this->actingAs($student)->get($annual)->assertInertia(fn (Assert $page) => $page
            ->where('balance.balance_cents', 18000)
            ->where('finance_details.kinds.tuition.balance_cents', 18000)
            ->where('finance_details.kinds.fiche_enrolement.balance_cents', 0)
            ->where('finance_details.kinds.fiche_enrolement.paid_cents', 1200));
    }

    public function test_student_sees_exact_installments_and_the_balance_only_changes_after_staff_confirms(): void
    {
        [$student, $entry, $admin, $fees, $account] = $this->financeContext();
        $this->actingAs($student)->get($fees)->assertInertia(fn (Assert $page) => $page
            ->where('balance.assessed', true)->where('balance.balance_cents', 18000)
            ->where('finance_schedule.0.title', 'Première tranche')->where('finance_schedule.0.due_at', '2026-11-24')
            ->where('finance_schedule.0.remaining_cents', 10000)->where('finance_schedule.1.remaining_cents', 8000));
        $this->post(route('dashboard.student.payments.proofs.store', ['academic' => $entry->id]), $this->deposit())
            ->assertRedirect($fees)->assertSessionHasNoErrors();
        $proof = StudentPaymentProof::sole();
        Storage::disk('local')->assertExists($proof->file_path);
        $this->assertDatabaseCount('student_payments', 0);
        $this->get($fees)->assertInertia(fn (Assert $page) => $page
            ->where('balance.balance_cents', 18000)->where('payment_proofs.submissions.0.status', 'pending')
            ->missing('payment_proofs.submissions.0.file_path'));
        $this->get(route('dashboard.student.payments.proofs.download', $proof))->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');
        $review = route('dashboard.admin.finance.proofs.review', $proof);
        $this->post($review, $this->decision())->assertForbidden();

        $this->actingAs($admin)->get(route('dashboard.admin.finance.proofs.index'))->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/finance/PaymentProofs')->where('rows.total', 1)->where('rows.data.0.amount_cents', 5000));
        $this->get($account)->assertInertia(fn (Assert $page) => $page
            ->where('statement.balance.balance_cents', 18000)->where('paymentProofs.0.status', 'pending'));
        $this->get(route('dashboard.admin.finance.proofs.download', $proof))->assertOk();
        $this->from($account)->post($review, $this->decision())->assertRedirect($account)->assertSessionHasNoErrors();
        $payment = StudentPayment::sole();
        $this->assertSame('confirmed', $payment->status);
        $this->assertSame(5000, (int) $payment->amount_cents);
        $this->assertNotNull($payment->receipt_snapshot);
        $this->actingAs($student)->get($fees)->assertInertia(fn (Assert $page) => $page
            ->where('balance.balance_cents', 13000)->where('finance_schedule.0.remaining_cents', 5000)
            ->where('finance_schedule.1.remaining_cents', 8000)
            ->where('payment_proofs.submissions.0.status', 'confirmed'));
    }

    public function test_invalid_or_duplicate_proofs_are_rejected_and_refusal_allows_a_corrected_deposit(): void
    {
        [$student, $entry, $admin, $fees, $account] = $this->financeContext();
        $submit = route('dashboard.student.payments.proofs.store', ['academic' => $entry->id]);
        $invalid = $this->deposit();
        $invalid['proof'] = UploadedFile::fake()->create('virement.html', 1, 'text/html');
        $this->actingAs($student)->from($fees)->post($submit, $invalid)->assertRedirect($fees)->assertSessionHasErrors('proof')
            ->assertSessionHasInput('reference', $invalid['reference'])->assertSessionHasInput('amount', $invalid['amount']);
        $oversized = $this->deposit();
        $oversized['proof'] = UploadedFile::fake()->image('virement.png')->size(\App\Support\DocumentUploadLimit::images() + 1);
        $this->post($submit, $oversized)->assertRedirect($fees)->assertSessionHasErrors('proof');
        $this->assertDatabaseCount('student_payment_proofs', 0);
        $this->post($submit, $this->deposit())->assertSessionHasNoErrors();
        $this->post($submit, $this->deposit())->assertRedirect($fees)->assertSessionHasErrors('reference');
        $this->assertDatabaseCount('student_payment_proofs', 1);

        $proof = StudentPaymentProof::sole();
        $review = route('dashboard.admin.finance.proofs.review', $proof);
        $this->actingAs($admin)->from($account)->post($review, $this->decision('reject'))->assertRedirect($account)->assertSessionHasNoErrors();
        $this->assertDatabaseCount('student_payments', 0);
        $this->actingAs($student)->get($fees)->assertInertia(fn (Assert $page) => $page
            ->where('balance.balance_cents', 18000)->where('payment_proofs.submissions.0.status', 'rejected')
            ->where('payment_proofs.submissions.0.review_note', $this->decision('reject')['reason']));
        $this->post($submit, $this->deposit())->assertSessionHasNoErrors();
        $this->assertDatabaseCount('student_payment_proofs', 2);
    }

    public function test_proofs_are_private_and_the_second_check_uses_the_existing_financial_controls(): void
    {
        [$student, $entry, $admin, $fees, $account] = $this->financeContext();
        config(['finance.dual_control' => true]);
        $this->actingAs($student)->post(route('dashboard.student.payments.proofs.store', ['academic' => $entry->id]), $this->deposit());
        $proof = StudentPaymentProof::sole();
        $outsider = User::factory()->create();
        $outsider->assignRole(Role::findOrCreate('student', 'web'));
        $this->actingAs($outsider)->get(route('dashboard.student.payments.proofs.download', $proof))
            ->assertStatus(404);
        $outsideFaculty = DB::table('faculties')->insertGetId(['name' => 'Autre faculté', 'code' => 'OTHER']);
        $outsideAdmin = $this->financeAdmin();
        $outsideAdmin->academicFaculties()->attach($outsideFaculty);
        $this->actingAs($outsideAdmin)->get(route('dashboard.admin.finance.proofs.download', $proof))->assertForbidden();
        $this->get(route('dashboard.admin.finance.proofs.index'))->assertInertia(fn (Assert $page) => $page->where('rows.total', 0));

        $this->actingAs($admin)->from($account)->post(route('dashboard.admin.finance.proofs.review', $proof), $this->decision())
            ->assertRedirect($account)->assertSessionHasNoErrors();
        $payment = StudentPayment::sole();
        $this->assertSame('pending', $payment->status);
        $approve = route('dashboard.admin.student-academic.payments.status', $payment);
        $confirmation = ['status' => 'confirmed', 'reason' => 'Versement vérifié par le second agent.'];
        $this->post($approve, $confirmation)->assertSessionHasErrors('payment');
        $this->actingAs($this->financeAdmin())->get(route('dashboard.admin.finance.proofs.index'))->assertInertia(fn (Assert $page) => $page
            ->where('rows.total', 1)->where('rows.data.0.second_check', true));
        $this->from($account)->post($approve, $confirmation)->assertRedirect($account)->assertSessionHasNoErrors();
        $this->actingAs($student)->get($fees)->assertInertia(fn (Assert $page) => $page
            ->where('balance.balance_cents', 13000)->where('payment_proofs.submissions.0.status', 'confirmed'));
    }

    public function test_matching_existing_payment_is_linked_instead_of_credited_twice(): void
    {
        [$student, $entry, $admin, $fees, $account] = $this->financeContext();
        $finance = app(StudentFinanceService::class);
        $payment = $finance->record($entry, $admin, [
            'kind' => 'tuition', 'amount' => '50.00', 'method' => 'bank_transfer',
            'reference' => 'VIREMENT-137', 'note' => 'Pièce présentée au guichet.',
        ]);
        $finance->transition($payment, $admin, 'confirmed', 'Versement contrôlé au guichet.');
        $this->actingAs($student)->post(route('dashboard.student.payments.proofs.store', ['academic' => $entry->id]), $this->deposit())
            ->assertSessionHasNoErrors();
        $proof = StudentPaymentProof::sole();
        $this->actingAs($admin)->from($account)->post(route('dashboard.admin.finance.proofs.review', $proof), $this->decision())
            ->assertSessionHasNoErrors();
        $this->assertDatabaseCount('student_payments', 1);
        $this->assertSame($payment->id, (int) $proof->fresh()->student_payment_id);
        $this->actingAs($student)->get($fees)->assertInertia(fn (Assert $page) => $page
            ->where('balance.balance_cents', 13000)->where('payment_proofs.submissions.0.status', 'confirmed'));
    }

    private function financeContext(): array
    {
        Storage::fake('local');
        $this->travelTo(now()->setDate(2026, 11, 16)->setTime(10, 0));
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $this->bill($entry, 1, 'Première tranche', 10000, '2026-11-24');
        $this->bill($entry, 2, 'Deuxième tranche', 8000, '2027-02-15');
        $fees = route('dashboard.student.index', ['section' => 'fees', 'academic' => $entry->id]);
        $account = route('dashboard.admin.finance.index', ['academic' => $entry->id]);

        return [$student, $entry, $this->financeAdmin(), $fees, $account];
    }

    private function financeAdmin(): User
    {
        $admin = User::factory()->create();
        $admin->assignRole(Role::findOrCreate('admin', 'web'));
        $admin->givePermissionTo(Permission::findOrCreate('manage academic finance', 'web'));

        return $admin;
    }

    private function bill(AcademicEnrollment $entry, int $number, string $title, int $amount, string $due): void
    {
        $entry->obligations()->create([
            'kind' => 'tuition', 'title' => $title, 'installment' => $number,
            'amount_cents' => $amount, 'currency' => $entry->currency, 'due_at' => $due,
        ]);
    }

    private function deposit(): array
    {
        return [
            'kind' => 'tuition', 'amount' => '50.00', 'method' => 'bank_transfer',
            'reference' => 'VIREMENT-137', 'proof' => UploadedFile::fake()->create('virement.pdf', 1, 'application/pdf'),
        ];
    }

    private function decision(string $decision = 'approve'): array
    {
        return [
            'decision' => $decision,
            'reason' => $decision === 'approve' ? 'Versement rapproché avec le relevé bancaire.' : 'La référence sur le justificatif est illisible.',
        ];
    }
}
