<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Enrollment;
use App\Models\LevelDetail;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\FinanceTariff;
use App\Models\Student\StudentObligation;
use App\Models\Student\StudentPayment;
use App\Models\Student\StudentProfile;
use App\Models\User;
use App\Modules\Student\Application\Services\AcademicAccessService;
use App\Modules\Student\Application\Services\FeeTariffService;
use App\Modules\Student\Application\Services\FinanceMutation;
use App\Modules\Student\Application\Services\FinanceReconciliationService;
use App\Modules\Student\Application\Services\FinanceReportingService;
use App\Modules\Student\Application\Services\Money;
use App\Modules\Student\Application\Services\PaymentAllocationService;
use App\Modules\Student\Application\Services\PaymentRefundService;
use App\Modules\Student\Application\Services\StudentFinanceService;
use App\Notifications\FinancialOperationNotice;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Role;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

class UniversityFinanceTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    private function context(): array
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->firstOrFail();
        $admin = User::factory()->create();
        $admin->assignRole(Role::findOrCreate('admin', 'web'));

        return [$admin, $student, $entry, app(StudentFinanceService::class)];
    }

    private function obligation(AcademicEnrollment $entry, string $kind = 'tuition', int $amount = 10000, ?string $due = null): StudentObligation
    {
        return $entry->obligations()->create(['kind' => $kind, 'title' => 'Frais '.$kind, 'installment' => 1, 'amount_cents' => $amount, 'currency' => $entry->currency, 'due_at' => $due]);
    }

    private function pay(AcademicEnrollment $entry, User $admin, string $amount, string $kind = 'tuition'): StudentPayment
    {
        $service = app(StudentFinanceService::class);
        $payment = $service->record($entry, $admin, ['amount' => $amount, 'kind' => $kind, 'method' => 'bank_transfer', 'reference' => 'PAY-'.Str::uuid(), 'note' => 'Pièce de versement contrôlée.']);
        $service->transition($payment, $admin, 'confirmed', 'Versement vérifié par le service financier.');

        return $payment->fresh();
    }

    private function invalid(callable $action, string $field): void
    {
        try {
            $action();
            $this->fail('Expected financial validation.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey($field, $e->errors());
        }
    }

    public function test_student_finance_shows_assigned_fees_and_only_reconciles_staff_confirmed_payments(): void
    {
        [$admin, $student, $entry, $finance] = $this->context();
        $this->travelTo(CarbonImmutable::parse('2026-11-10 12:00', 'Africa/Kinshasa'));
        $this->obligation($entry, due: '2026-10-20');
        $finance->adjust($entry, $admin, ['type' => 'reduction', 'amount' => '20.00', 'reason' => 'Réduction académique approuvée.']);
        $finance->adjust($entry, $admin, ['type' => 'plan', 'schedule' => [['due_at' => '2026-12-01', 'amount' => '80.00']], 'reason' => 'Report de la date de versement.']);
        $adminAccount = '/app/dashboard/admin/student-academic/'.$entry->id;
        $this->actingAs($admin)->post($adminAccount.'/obligations', [
            'kind' => 'laboratory', 'title' => 'Travaux pratiques de laboratoire', 'installment' => 1,
            'amount' => '35.00', 'due_at' => '2026-11-20', 'reason' => 'Frais du laboratoire ajoutés au dossier.',
        ])->assertSessionHasNoErrors();
        $this->post($adminAccount.'/obligations', [
            'kind' => 'registration', 'title' => 'Droits d’inscription', 'installment' => 1,
            'amount' => '15.00', 'due_at' => '2026-10-15', 'reason' => 'Droits d’inscription confirmés.',
        ])->assertSessionHasNoErrors();
        $payment = ['kind' => 'laboratory', 'amount' => '35.00', 'method' => 'cash', 'reference' => 'PREUVE-LABO', 'note' => 'Preuve contrôlée au guichet.'];
        $this->post($adminAccount.'/payments', $payment)->assertSessionHasNoErrors();
        $pending = StudentPayment::where('reference', 'PREUVE-LABO')->sole();
        $confirmed = $this->pay($entry, $admin, '30.00');
        $finance->adjust($entry, $admin, ['type' => 'exemption', 'fee_kind' => 'registration', 'reason' => 'Exonération totale des droits d’inscription.']);

        $fees = route('dashboard.student.index', ['section' => 'fees', 'academic' => $entry->id]);
        $transactions = route('dashboard.student.index', ['section' => 'transactions', 'academic' => $entry->id]);
        $this->actingAs($student)->post($adminAccount.'/payments', $payment)->assertForbidden();
        $this->post('/app/dashboard/student/payments', $payment)->assertNotFound();
        $this->get($fees)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('balance.total_cents', 15000)->where('balance.waived_cents', 3500)
            ->where('balance.paid_cents', 3000)->where('balance.pending_cents', 3500)->where('balance.balance_cents', 8500)
            ->where('balance.overdue_cents', 0)->has('finance_details.obligations', 3)
            ->where('finance_details.obligations.0.status', 'exempted')
            ->where('finance_details.obligations.1.kind_title', 'Frais académiques')->where('finance_details.obligations.1.status', 'partial')
            ->where('finance_details.obligations.1.paid_cents', 3000)->where('finance_details.obligations.1.waived_cents', 2000)
            ->where('finance_details.obligations.1.due_at', null)->where('finance_details.obligations.1.rescheduled', true)
            ->where('finance_details.obligations.1.remaining_cents', 5000)
            ->where('finance_details.obligations.2.title', 'Travaux pratiques de laboratoire')
            ->where('finance_details.obligations.2.currency', 'USD')->where('finance_details.obligations.2.paid_cents', 0)
            ->where('finance_schedule.0.status', 'exempted')
            ->where('finance_schedule.2.due_at', '2026-12-01')->where('finance_schedule.2.remaining_cents', 5000)
            ->where('finance_details.recent_payments.1.kind_title', 'Travaux pratiques de laboratoire')
            ->where('finance_details.recent_payments.1.receipt_url', null)
            ->has('finance_details.receipt_payments', 1)->where('finance_details.receipt_payments.0.id', $confirmed->id));
        $this->get($transactions)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('finance_view', 'history')->has('payments', 2));
        $this->get($transactions.'&view=receipts')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('finance_view', 'receipts')->has('payments', 1)->where('payments.0.id', $confirmed->id));

        $this->actingAs($admin)->post(route('dashboard.admin.student-academic.payments.status', ['payment' => $pending->id]), [
            'status' => 'confirmed', 'reason' => 'Preuve du versement vérifiée par la caisse.',
        ])->assertSessionHasNoErrors();
        $this->actingAs($student)->get($fees)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('balance.pending_cents', 0)->where('balance.balance_cents', 5000)
            ->where('finance_details.obligations.2.status', 'paid')->where('finance_details.obligations.2.paid_cents', 3500)
            ->has('finance_details.receipt_payments', 2));
        $this->get(route('dashboard.student.payments.receipt', ['payment' => $pending->uuid, 'academic' => $entry->id]))
            ->assertOk()->assertSee('PREUVE-LABO');
    }

    public function test_student_finance_filters_year_and_keeps_the_original_payment_currencies(): void
    {
        [$admin, $student, $entry] = $this->context();
        $old = $entry->replicate();
        $old->academic_year_id = AcademicYear::create(['title' => '2025-2026', 'start_date' => '2025-10-01', 'end_date' => '2026-09-30', 'status' => 'closed'])->id;
        $old->currency = 'CDF';
        $old->save();
        $this->obligation($old, amount: 120000);
        $payment = $this->pay($old, $admin, '250.00');

        $this->actingAs($student)->get(route('dashboard.student.index', ['section' => 'fees', 'academic' => $entry->id]))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('balance.currency', 'USD')->where('balance.assessed', false)
                ->has('finance_details.obligations', 0)->has('finance_details.recent_payments', 0));
        $this->get(route('dashboard.student.index', ['section' => 'fees', 'academic' => $old->id]))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('academic.year', '2025-2026')
                ->where('balance.currency', 'CDF')->where('balance.balance_cents', 95000)
                ->where('finance_details.obligations.0.currency', 'CDF')->where('finance_details.recent_payments.0.currency', 'CDF')
                ->where('finance_details.recent_payments.0.id', $payment->id)
                ->where('finance_details.receipts_url', '/app/dashboard/student/transactions?academic='.$old->id.'&view=receipts'));
        $this->get(route('dashboard.student.payments.receipt', ['payment' => $payment->uuid, 'academic' => $entry->id]))->assertNotFound();
    }

    public function test_annual_fees_and_proof_choices_belong_to_the_selected_enrollment(): void
    {
        [, $student, $entry] = $this->context();
        $old = $entry->replicate();
        $old->academic_year_id = AcademicYear::create(['title' => '2025-2026', 'start_date' => '2025-10-01', 'end_date' => '2026-09-30', 'status' => 'closed'])->id;
        $old->currency = 'CDF';
        $old->save();
        $this->obligation($entry, kind: 'tuition', due: '2027-01-15');
        $this->obligation($old, kind: 'library', amount: 125000);

        $annual = fn ($id) => route('dashboard.student.index', ['section' => 'annual-fees', 'academic' => $id]);
        $proof = fn ($id, $kind) => route('dashboard.student.index', ['section' => 'fees', 'academic' => $id, 'kind' => $kind]);
        $this->actingAs($student)->get($annual($entry->id))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('section', 'annual-fees')->where('academic.year', '2026-2027')
            ->where('balance.balance_cents', 10000)->has('studentChrome.options', 2)
            ->where('finance_details.kinds.tuition.currency', 'USD')->missing('finance_details.kinds.library'));
        $this->get($annual($old->id))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('academic.year', '2025-2026')->where('balance.balance_cents', 125000)
            ->where('finance_details.kinds.library.currency', 'CDF')->missing('finance_details.kinds.tuition')
            ->where('finance_details.kinds.library.overdue_cents', 0)
            ->has('finance_schedule', 1)->where('finance_schedule.0.due_at', null));

        $this->get($proof($old->id, 'library'))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('payment_proofs.selected_kind', 'library')->where('payment_proofs.kinds.0.balance_cents', 125000));
        foreach (['library', ['tuition']] as $invalidKind) {
            $this->get($proof($entry->id, $invalidKind))->assertOk()->assertInertia(fn (Assert $page) => $page
                ->where('payment_proofs.selected_kind', null)->has('payment_proofs.kinds', 2)
                ->where('payment_proofs.kinds.0.id', 'tuition')->where('payment_proofs.kinds.1.id', 'unallocated')
                ->missing('payment_proofs.kinds.1.balance_cents'));
        }

        $other = User::factory()->create();
        $other->assignRole('student');
        StudentProfile::create(['user_id' => $other->id, 'student_status' => 'active']);
        $this->actingAs($other)->get($annual($old->id))->assertNotFound();
    }

    public function test_student_finance_does_not_count_unallocated_cash_towards_fee_coverage(): void
    {
        [$admin, $student, $entry] = $this->context();
        $fee = $this->obligation($entry);
        $payment = $this->pay($entry, $admin, '40.00', 'unallocated');
        app(PaymentAllocationService::class)->allocate($payment, $admin, [
            ['obligation_id' => $fee->id, 'amount' => '15.00'],
        ], 'Affectation partielle du versement à la scolarité.');

        $this->actingAs($student)->get(route('dashboard.student.index', ['section' => 'fees', 'academic' => $entry->id]))->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('balance.paid_cents', 4000)->where('balance.unallocated_cents', 2500)->where('balance.balance_cents', 8500)
                ->where('finance_details.obligations.0.paid_cents', 1500)->where('finance_details.obligations.0.remaining_cents', 8500)
                ->where('finance_details.receipt_payments.0.kind_title', 'Versement général'));
    }

    public function test_money_is_exact_and_binary_floats_and_excess_precision_are_refused(): void
    {
        $this->assertSame(1, Money::cents('0.01'));
        $this->assertSame(101, Money::cents('1.01'));
        $this->assertSame('999999999.99', Money::decimal(Money::cents('999999999.99')));
        foreach (['-1', '1.001', '1e3', 0.1 + 0.2] as $bad) {
            $this->invalid(fn () => Money::cents($bad), 'amount');
        }
    }

    public function test_legacy_billing_is_idempotent_nonretroactive_and_obligations_are_immutable(): void
    {
        [$admin,,$entry,$finance] = $this->context();
        $detail = LevelDetail::create(['level_id' => $entry->level_id, 'price_national_first' => '10.10', 'price_national_second' => '20.20']);
        $finance->assess($entry, $admin, 'national', [], 'Barème initial validé et affecté.');
        $detail->update(['price_national_first' => '99.99']);
        $finance->assess($entry, $admin, 'national', [], 'Réexécution du même contexte tarifaire.');
        $this->assertSame(3030, $finance->balance($entry)['total_cents']);
        $this->assertDatabaseCount('student_obligations', 2);
        $obligation = $entry->obligations()->firstOrFail();
        $this->assertSame('10.10', $obligation->source_snapshot['amount']);
        $this->invalid(fn () => $obligation->update(['amount_cents' => 99999]), 'obligation');
    }

    public function test_payment_reference_replay_and_validated_payment_immutability(): void
    {
        [$admin,,$entry,$finance] = $this->context();
        $this->obligation($entry);
        $data = ['amount' => '25.35', 'method' => 'cash', 'reference' => 'SAME-REFERENCE', 'note' => 'Justification de caisse contrôlée.'];
        $p = $finance->record($entry, $admin, $data);
        $again = $finance->record($entry, $admin, $data);
        $this->assertSame($p->id, $again->id);
        $this->invalid(fn () => $finance->record($entry, $admin, array_replace($data, ['amount' => '30.00'])), 'reference');
        $finance->transition($p, $admin, 'confirmed', 'Contrôle documentaire réalisé.');
        $finance->transition($p, $admin, 'confirmed', 'Rejeu de confirmation sans nouvelle écriture.');
        $this->invalid(fn () => $p->fresh()->update(['amount_cents' => 1]), 'payment');
        $this->invalid(fn () => FinanceMutation::run(fn () => $p->fresh()->update(['amount_cents' => 1])), 'payment');
        $this->invalid(fn () => $p->fresh()->delete(), 'payment');
        $this->assertDatabaseCount('student_payments', 1);
        $this->assertSame(2535, $finance->balance($entry)['paid_cents']);
    }

    public function test_a_payment_can_cover_multiple_obligations_without_duplicate_allocations(): void
    {
        [$admin,,$entry,$finance] = $this->context();
        $tuition = $this->obligation($entry, 'tuition', 10000, today()->subDay()->toDateString());
        $lab = $this->obligation($entry, 'lab', 5000, today()->addMonth()->toDateString());
        $p = $this->pay($entry, $admin, '120.00', 'unallocated');
        $this->assertSame(15000, $finance->balance($entry)['balance_cents']);
        $this->assertSame(12000, $finance->balance($entry)['unallocated_cents']);
        $rows = [['obligation_id' => $tuition->id, 'amount' => '100.00'], ['obligation_id' => $lab->id, 'amount' => '20.00']];
        $service = app(PaymentAllocationService::class);
        $service->allocate($p, $admin, $rows, 'Affectation contrôlée aux deux frais.');
        $service->allocate($p, $admin, $rows, 'Rejeu des affectations déjà publiées.');
        $balance = $finance->balance($entry);
        $this->assertSame(3000, $balance['balance_cents']);
        $this->assertSame(0, $balance['overdue_cents']);
        $this->assertSame(0, $balance['unallocated_cents']);
        $this->assertDatabaseCount('student_payment_allocations', 2);
        $report = app(FinanceReportingService::class)->totals($admin, [])[0];
        $this->assertSame($balance['balance_cents'], $report['balance_cents']);
        $this->assertSame($balance['overdue_cents'], $report['overdue_cents']);
    }

    public function test_allocations_cannot_cross_student_context_currency_or_available_amount(): void
    {
        [$admin,,$entry] = $this->context();
        $o = $this->obligation($entry);
        $other = $entry->replicate();
        $other->academic_year_id = AcademicYear::create(['title' => 'Autre', 'start_date' => '2028-10-01', 'end_date' => '2029-09-30', 'status' => 'draft'])->id;
        $other->save();
        $foreign = $this->obligation($other, 'lab');
        $p = $this->pay($entry, $admin, '50.00', 'unallocated');
        $service = app(PaymentAllocationService::class);
        $this->invalid(fn () => $service->allocate($p, $admin, [['obligation_id' => $o->id, 'amount' => '60.00']], 'Montant soumis au contrôle.'), 'allocations');
        try {
            $service->allocate($p, $admin, [['obligation_id' => $o->id, 'amount' => '10.00'], ['obligation_id' => $foreign->id, 'amount' => '10.00']], 'Tentative de mélange de contextes.');
            $this->fail('Foreign obligation must be refused.');
        } catch (ModelNotFoundException) {
            $this->assertDatabaseCount('student_payment_allocations', 0);
        }
    }

    public function test_refunds_require_authorization_and_executed_reference_and_are_bounded_and_idempotent(): void
    {
        [$admin,$student,$entry,$finance] = $this->context();
        $this->obligation($entry);
        $p = $this->pay($entry, $admin, '100.00');
        $service = app(PaymentRefundService::class);
        $data = ['amount' => '30.00', 'operation_key' => (string) Str::uuid(), 'reason' => 'Demande de remboursement partiel.'];
        $refund = $service->request($p, $admin, $data);
        $this->assertSame(10000, $finance->balance($entry)['paid_cents']);
        $this->invalid(fn () => $service->transition($refund, $admin, ['status' => 'executed', 'reason' => 'Exécution sans autorisation préalable.', 'method' => 'cash', 'execution_reference' => 'NO-AUTH']), 'refund');
        $service->transition($refund, $admin, ['status' => 'approved', 'reason' => 'Autorisation vérifiée et motivée.']);
        $this->assertSame(10000, $finance->balance($entry)['paid_cents']);
        $execute = ['status' => 'executed', 'method' => 'bank_transfer', 'execution_reference' => 'OUT-001', 'reason' => 'Décaissement réellement contrôlé.'];
        $service->transition($refund, $admin, $execute);
        $service->transition($refund, $admin, $execute);
        $this->assertSame($refund->id, $service->request($p, $admin, $data)->id);
        $this->assertSame(7000, $finance->balance($entry)['paid_cents']);
        $this->assertSame(3000, $finance->balance($entry)['balance_cents']);
        $this->assertSame('confirmed', $p->fresh()->status);
        $this->actingAs($student)->get('/app/dashboard/student/transactions?academic='.$entry->id)->assertInertia(fn (Assert $page) => $page->where('payments.0.refunded_cents', 3000)->where('payments.0.currency', 'USD'));
        $verificationUrl = URL::signedRoute('finance.receipts.verify', ['payment' => $p->uuid, 'format' => 'html']);
        $receiptUrl = route('dashboard.student.payments.receipt', ['payment' => $p->uuid, 'academic' => $entry->id]);
        $this->get(URL::signedRoute('finance.receipts.verify', ['payment' => $p->uuid]))->assertJson(['state' => 'partially_refunded']);
        $this->get($receiptUrl)->assertOk()->assertDontSeeText('Montant payé')->assertViewHas('receipt', fn ($receipt) => $receipt['state'] === 'partially_refunded'
            && $receipt['amount_cents'] === 10000 && $receipt['refunded_cents'] === 3000 && $receipt['net_cents'] === 7000);
        $this->invalid(fn () => $service->request($p, $admin, ['amount' => '80.00', 'operation_key' => (string) Str::uuid(), 'reason' => 'Dépassement du montant remboursable.']), 'amount');
        $this->invalid(fn () => $finance->transition($p, $admin, 'cancelled', 'Annulation incompatible avec remboursement.'), 'payment');
        $remaining = $service->request($p, $admin, ['amount' => '70.00', 'operation_key' => (string) Str::uuid(), 'reason' => 'Solde du remboursement autorisé.']);
        $service->transition($remaining, $admin, ['status' => 'approved', 'reason' => 'Autorisation du solde du remboursement.']);
        $service->transition($remaining, $admin, array_replace($execute, ['execution_reference' => 'OUT-002']));
        $this->assertSame('refunded', $p->fresh()->status);
        $this->assertSame(10000, $finance->balance($entry)['refunded_cents']);
        $this->assertSame(0, $finance->balance($entry)['paid_cents']);
        $this->assertSame(10000, (int) $p->fresh()->amount_cents);
        $this->get($verificationUrl)->assertOk()->assertViewHas('verification.state', 'invalid');
        $this->get($receiptUrl)->assertOk()->assertDontSeeText('Montant payé')->assertViewHas('receipt', fn ($receipt) => $receipt['state'] === 'refunded'
            && $receipt['amount_cents'] === 10000 && $receipt['refunded_cents'] === 10000 && $receipt['net_cents'] === 0);
    }

    public function test_partial_refund_reverses_explicit_allocations_without_deleting_them(): void
    {
        [$admin,,$entry,$finance] = $this->context();
        $o = $this->obligation($entry);
        $p = $this->pay($entry, $admin, '100.00', 'unallocated');
        app(PaymentAllocationService::class)->allocate($p, $admin, [['obligation_id' => $o->id, 'amount' => '100.00']], 'Affectation initiale des fonds.');
        $service = app(PaymentRefundService::class);
        $refund = $service->request($p, $admin, ['amount' => '20.00', 'operation_key' => (string) Str::uuid(), 'reason' => 'Retour partiel des fonds autorisé.']);
        $service->transition($refund, $admin, ['status' => 'approved', 'reason' => 'Autorisation du retour partiel.']);
        $service->transition($refund, $admin, ['status' => 'executed', 'method' => 'cash', 'execution_reference' => 'CASH-OUT', 'reason' => 'Sortie de caisse attestée.']);
        $this->assertSame(8000, $finance->balance($entry, 'tuition')['paid_cents']);
        $this->assertSame(2000, $finance->balance($entry)['balance_cents']);
        $this->assertDatabaseCount('student_payment_allocations', 1);
        $this->assertDatabaseCount('student_refund_allocations', 1);
        $this->assertSame(2000, app(FinanceReportingService::class)->totals($admin, [])[0]['balance_cents']);
    }

    public function test_approved_plan_changes_overdue_amount_without_erasing_payments_and_replacement_is_historical(): void
    {
        [$admin,,$entry,$finance] = $this->context();
        $this->obligation($entry, 'tuition', 10000, today()->subDays(10)->toDateString());
        $this->pay($entry, $admin, '20.00');
        $this->assertSame(8000, $finance->balance($entry)['overdue_cents']);
        $data = ['type' => 'plan', 'reason' => 'Moratoire autorisé et documenté.', 'schedule' => [['amount' => '60.00', 'due_at' => today()->addMonth()->toDateString()], ['amount' => '40.00', 'due_at' => today()->addMonths(2)->toDateString()]]];
        $first = $finance->adjust($entry, $admin, $data);
        $this->assertSame(0, $finance->balance($entry)['overdue_cents']);
        $this->invalid(fn () => $finance->adjust($entry, $admin, ['type' => 'scholarship', 'amount' => '10.00', 'reason' => 'Aide qui nécessite un réaménagement.']), 'adjustment');
        $finance->adjust($entry, $admin, array_replace($data, ['schedule' => [['amount' => '100.00', 'due_at' => today()->addMonths(3)->toDateString()]]]));
        $this->assertFalse($first->fresh()->is_active);
        $this->assertDatabaseCount('student_payments', 1);
        $this->assertSame(0, app(FinanceReportingService::class)->totals($admin, [])[0]['overdue_cents']);
    }

    public function test_percentage_aids_use_integer_rounding_and_third_party_pledges_are_not_discounts(): void
    {
        [$admin,,$entry,$finance] = $this->context();
        $this->obligation($entry, 'tuition', 101);
        $grant = $finance->adjust($entry, $admin, ['type' => 'scholarship', 'percentage' => '50', 'reason' => 'Bourse institutionnelle à cinquante pour cent.', 'operation_key' => (string) Str::uuid()]);
        $this->assertSame(51, (int) $grant->amount_cents);
        $this->assertSame(50, $finance->balance($entry)['due_cents']);
        $finance->adjust($entry, $admin, ['type' => 'scholarship', 'amount' => '0.50', 'funding_source' => 'third_party', 'reason' => 'Prise en charge attendue d’un tiers.']);
        $this->assertSame(50, $finance->balance($entry)['due_cents']);
        $this->invalid(fn () => $finance->adjust($entry, $admin, ['type' => 'exemption', 'reason' => 'Exonération incompatible avec bourse existante.']), 'adjustment');
    }

    public function test_versioned_tariffs_are_scoped_and_replace_explicitly_without_rebilling(): void
    {
        [$admin,,$entry,$finance] = $this->context();
        $service = app(FeeTariffService::class);
        $data = ['academic_year_id' => $entry->academic_year_id, 'level_id' => $entry->level_id, 'category' => 'national', 'kind' => 'tuition', 'title' => 'Tarif versionné', 'currency' => 'USD', 'valid_from' => today()->toDateString(), 'valid_until' => null, 'reason' => 'Version du barème validée par la finance.', 'schedule' => [['amount' => '25.50', 'due_at' => today()->addWeek()->toDateString()]]];
        $v1 = $service->create($admin, $data);
        $service->activate($v1, $admin, 'Activation du premier barème.');
        $service->bill($v1, $entry, $admin, 'Émission des frais validés.');
        $service->bill($v1, $entry, $admin, 'Rejeu de facturation déjà émise.');
        $v2 = $service->create($admin, array_replace($data, ['schedule' => [['amount' => '50.00', 'due_at' => today()->addWeek()->toDateString()]]]));
        $this->invalid(fn () => $service->activate($v2, $admin, 'Activation sans remplacement explicite.'), 'replace_id');
        $service->activate($v2, $admin, 'Remplacement explicite de la version active.', $v1->id);
        $this->invalid(fn () => $service->bill($v2, $entry, $admin, 'Tentative de refacturation rétroactive.'), 'tariff');
        $this->assertSame(2550, $finance->balance($entry)['total_cents']);
        $this->assertDatabaseCount('student_obligations', 1);
        $this->assertSame($v1->id, $entry->obligations()->sole()->finance_tariff_id);
    }

    public function test_annual_tariff_activation_preserves_existing_fees_and_only_bills_matching_students(): void
    {
        [$admin, $student, $entry] = $this->context();
        $this->travelTo(CarbonImmutable::parse('2026-11-10 12:00', 'Africa/Kinshasa'));
        $this->obligation($entry, 'laboratory', 5000);
        $otherEntries = [];
        foreach (['national', 'foreign', null, null] as $category) {
            $other = User::factory()->create();
            $context = ['level_id' => $entry->level_id, 'academic_year_id' => $entry->academic_year_id];
            $application = Enrollment::create($context + ['student_id' => $other->id, 'status' => 'validated']);
            $profile = StudentProfile::create(['user_id' => $other->id, 'student_status' => 'active']);
            $otherEntries[] = $profile->enrollments()->create($context + ['application_id' => $application->id, 'enrollment_status' => 'confirmed', 'fee_category' => $category, 'currency' => 'USD']);
        }
        [$existing, $foreign, $unclassified, $declaredNational] = $otherEntries;
        $existing->profile->user->update(['nationality_code' => 'CG']);
        $foreign->profile->user->update(['nationality_code' => 'CD']);
        $declaredNational->profile->user->update(['nationality_code' => 'CD']);
        $original = $this->obligation($existing, due: '2026-11-15');
        $oldYear = AcademicYear::create(['title' => '2025–2026', 'start_date' => '2025-10-01', 'end_date' => '2026-09-30', 'status' => 'closed']);
        $historical = $entry->replicate();
        $historical->academic_year_id = $oldYear->id;
        $historical->save();

        $service = app(FeeTariffService::class);
        $data = [
            'academic_year_id' => $entry->academic_year_id, 'level_id' => $entry->level_id,
            'category' => 'national', 'kind' => 'tuition', 'title' => 'Barème annuel national', 'currency' => 'USD',
            'valid_from' => '2026-10-01', 'valid_until' => '2027-09-30', 'reason' => 'Frais annuels préparés depuis la maquette.',
            'schedule' => [['amount' => '0.00', 'due_at' => '2026-11-20'], ['amount' => '120.00', 'due_at' => '2027-02-01']],
        ];
        $tariff = $service->create($admin, $data);
        $historicalTariff = $service->create($admin, array_replace($data, ['academic_year_id' => $oldYear->id, 'valid_from' => '2025-10-01', 'valid_until' => '2026-09-30']));
        $service->activate($historicalTariff, $admin, 'Ancien barème conservé pour l’historique.');
        $action = route('dashboard.admin.finance.tariffs.apply', $tariff);
        $activate = route('dashboard.admin.finance.tariffs.activate', $tariff);
        $reason = ['reason' => 'Émission des frais contrôlés pour les inscrits concernés.'];
        $this->actingAs($student)->post($action, $reason)->assertForbidden();
        $this->actingAs($admin)->post($action, $reason)->assertSessionHasErrors('tariff');
        $this->post(route('dashboard.admin.finance.tariffs.apply', $historicalTariff), $reason)->assertSessionHasErrors('tariff');
        $this->post('/app/dashboard/admin/student-academic/'.$entry->id.'/fees', $reason + ['category' => 'national'])
            ->assertSessionHas('success', 'Catégorie confirmée. Le barème pourra être affecté dès son activation et son entrée en vigueur.');
        $this->assertSame('national', $entry->fresh()->fee_category);
        $this->assertDatabaseHas('academic_audits', ['actor_id' => $admin->id, 'action' => 'fee_category_confirmed', 'entity_id' => $entry->id]);
        $this->post($activate, $reason)->assertSessionHas('success', 'Barème activé. Échéanciers ajoutés : 2. Dossiers avec frais ou historique conservés : 1.');
        $this->assertSame('national', $declaredNational->fresh()->fee_category);
        $this->assertSame(2, $declaredNational->obligations()->where('finance_tariff_id', $tariff->id)->count());
        $this->get(route('dashboard.admin.finance.tariffs.index', ['year' => $entry->academic_year_id, 'level' => $entry->level_id]))
            ->assertInertia(fn (Assert $page) => $page->has('tariffs.data', 1)
                ->where('tariffs.data.0.id', $tariff->id)->where('tariffs.data.0.can_apply', true)
                ->where('tariffs.data.0.academic_year.id', $entry->academic_year_id)->where('tariffs.data.0.level.id', $entry->level_id));

        $this->post($activate, $reason)->assertSessionHas('success', 'Barème activé. Échéanciers ajoutés : 0. Dossiers avec frais ou historique conservés : 3.');
        $this->post($action, $reason)->assertSessionHas('success', 'Inscriptions facturées : 0. Dossiers avec obligations ou historique conservés : 3.');
        $this->post('/app/dashboard/admin/student-academic/'.$entry->id.'/fees', $reason + ['category' => 'foreign'])->assertSessionHasErrors('category');
        $this->assertSame($original->id, $existing->obligations()->sole()->id);
        $this->assertSame(10000, (int) $original->refresh()->amount_cents);
        $this->assertSame('2026-11-15', $original->due_at->toDateString());
        foreach ([$foreign, $unclassified, $historical] as $unchanged) {
            $this->assertFalse($unchanged->obligations()->exists());
        }
        $this->assertSame([0, 12000], $entry->obligations()->where('finance_tariff_id', $tariff->id)->orderBy('installment')->pluck('amount_cents')->all());
        $this->actingAs($student)->get(route('dashboard.student.index', ['section' => 'fees', 'academic' => $entry->id]))
            ->assertInertia(fn (Assert $page) => $page->where('academic.fee_category', 'national')
                ->where('balance.total_cents', 17000)->has('finance_details.obligations', 3)
                ->where('finance_schedule.0.due_at', '2026-11-20')->where('finance_schedule.1.due_at', '2027-02-01'));
    }

    public function test_future_tariff_is_applied_automatically_when_its_validity_begins(): void
    {
        [$admin, $student, $entry] = $this->context();
        $this->travelTo(CarbonImmutable::parse('2026-11-10 12:00', 'Africa/Kinshasa'));
        $student->update(['nationality_code' => 'CG']);
        $tariff = app(FeeTariffService::class)->create($admin, [
            'academic_year_id' => $entry->academic_year_id, 'level_id' => $entry->level_id,
            'category' => 'foreign', 'kind' => 'tuition', 'title' => 'Barème annuel étranger', 'currency' => 'USD',
            'valid_from' => '2026-11-11', 'valid_until' => '2027-09-30', 'reason' => 'Barème à effet différé pour l’année ouverte.',
            'schedule' => [['amount' => '215.00', 'due_at' => '2026-12-01']],
        ]);
        $this->actingAs($admin)->post(route('dashboard.admin.finance.tariffs.activate', $tariff), ['reason' => 'Activation du barème à effet différé.'])
            ->assertSessionHasNoErrors();
        $this->artisan('student:apply-effective-tuition-tariffs')->assertSuccessful();
        $this->assertFalse($entry->obligations()->exists());

        $this->travelTo(CarbonImmutable::parse('2026-11-11 00:01', 'Africa/Kinshasa'));
        $this->artisan('student:apply-effective-tuition-tariffs')->assertSuccessful();
        $this->artisan('student:apply-effective-tuition-tariffs')->assertSuccessful();
        $this->assertSame('foreign', $entry->refresh()->fee_category);
        $this->assertSame($tariff->id, $entry->obligations()->sole()->finance_tariff_id);
        $this->actingAs($student)->get(route('dashboard.student.index', ['section' => 'fees', 'academic' => $entry->id]))
            ->assertInertia(fn (Assert $page) => $page->has('finance_schedule', 1)
                ->where('finance_schedule.0.amount_cents', 21500)->where('finance_schedule.0.due_at', '2026-12-01'));
    }

    public function test_annual_tariff_workspace_edits_drafts_and_revises_active_versions_without_changing_issued_fees(): void
    {
        [$admin, $student, $entry] = $this->context();
        $this->travelTo(CarbonImmutable::parse('2026-11-10 12:00', 'Africa/Kinshasa'));
        $service = app(FeeTariffService::class);
        $scope = ['academic_year_id' => $entry->academic_year_id, 'level_id' => $entry->level_id, 'category' => 'national', 'kind' => 'tuition', 'currency' => 'USD'];
        $original = [
            'title' => 'Barème généré avec la maquette', 'valid_from' => '2026-10-01', 'valid_until' => '2027-09-30',
            'reason' => 'Génération annuelle des frais académiques.',
            'schedule' => [['amount' => '125.50', 'due_at' => '2026-12-01'], ['amount' => '0.00', 'due_at' => '2027-03-01']],
        ];
        $draft = $service->create($admin, $scope + $original);
        $workspace = route('dashboard.admin.finance.tariffs.index', ['year' => $entry->academic_year_id, 'level' => $entry->level_id, 'status' => 'draft']);
        $update = route('dashboard.admin.finance.tariffs.update', ['tariff' => $draft->id, 'level' => $entry->level_id, 'status' => 'draft']);
        $changes = array_replace($original, ['reason' => 'Ajustement des frais avant publication.', 'schedule' => [['amount' => '150.00', 'due_at' => '2026-12-15'], ['amount' => '0.00', 'due_at' => '2027-03-01']]]);
        $draftRevision = $service->revision($draft, 1);
        $this->actingAs($student)->get($workspace)->assertForbidden();
        $this->put($update, $changes + ['revision' => $draftRevision])->assertForbidden();

        $this->actingAs($admin)->get($workspace)->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/finance/Tariffs')->where('filters.year', $entry->academic_year_id)
            ->has('tariffs.data', 1)->where('tariffs.data.0.valid_from', '2026-10-01')
            ->where('tariffs.data.0.revision', $draftRevision));
        $this->put($update, array_replace($changes, ['schedule' => [['amount' => '150.00', 'due_at' => '2027-10-01']]]) + ['revision' => $draftRevision])
            ->assertSessionHasErrors('schedule');
        $this->put($update, $changes + ['revision' => $draftRevision])->assertRedirect($workspace);
        $this->assertDatabaseCount('finance_tariffs', 1);
        $this->assertSame(15000, $draft->refresh()->schedule[0]['amount_cents']);
        $this->put($update, $original + ['revision' => $draftRevision])->assertSessionHasErrors('revision');

        $activate = route('dashboard.admin.finance.tariffs.activate', ['tariff' => $draft->id]);
        $this->post($activate, ['reason' => 'Activation avant confirmation du nouveau montant.', 'revision' => $draftRevision])->assertSessionHasErrors('revision');
        $this->post($activate, ['reason' => 'Validation du nouveau montant du barème.', 'revision' => $service->revision($draft, 1)])->assertSessionHasNoErrors();
        $service->bill($draft, $entry, $admin, 'Émission des frais déjà validés.');
        $active = $draft->refresh();
        $activeRevision = $service->revision($active, 1);
        $next = array_replace($changes, ['reason' => 'Nouvelle version pour les inscriptions suivantes.', 'schedule' => [['amount' => '185.00', 'due_at' => '2027-01-15']]]);
        $updateActive = route('dashboard.admin.finance.tariffs.update', ['tariff' => $active->id, 'level' => $entry->level_id, 'status' => 'active']);
        $this->put($updateActive, $next + ['revision' => $activeRevision])->assertRedirect(route('dashboard.admin.finance.tariffs.index', ['year' => $entry->academic_year_id, 'level' => $entry->level_id]));
        $this->put($updateActive, $next + ['revision' => $activeRevision])->assertSessionHasErrors('revision');

        $replacement = FinanceTariff::where('version', 2)->sole();
        $this->assertSame('draft', $replacement->status);
        $this->assertSame('active', $active->refresh()->status);
        $this->assertSame(18500, $replacement->schedule[0]['amount_cents']);
        $this->get($workspace)->assertInertia(fn (Assert $page) => $page
            ->where('tariffs.data.0.id', $replacement->id)->where('tariffs.data.0.replace_id', $active->id));
        $this->post(route('dashboard.admin.finance.tariffs.activate', $replacement), ['reason' => 'Activation explicite de la version révisée.', 'replace_id' => $active->id, 'revision' => $service->revision($replacement, 2)])
            ->assertSessionHasNoErrors();
        $this->assertSame('archived', $active->refresh()->status);
        $this->assertSame(15000, $entry->obligations()->where('installment', 1)->sole()->amount_cents);
        $this->assertSame($active->id, $entry->obligations()->where('installment', 1)->sole()->finance_tariff_id);

        $foreign = $service->create($admin, array_replace($scope, ['category' => 'foreign']) + $original);
        $service->activate($foreign, $admin, 'Activation du barème des étudiants étrangers.');
        $this->post(route('dashboard.admin.finance.bill', ['academic' => $entry->id]), ['tariff_id' => $foreign->id, 'reason' => 'Contrôle de la catégorie avant facturation.'])
            ->assertSessionHasErrors('tariff');

        $otherFaculty = DB::table('faculties')->insertGetId(['name' => 'Faculté hors périmètre', 'code' => 'TF-AUTRE']);
        $scopedAdmin = User::factory()->create();
        $scopedAdmin->assignRole('admin');
        $scopedAdmin->academicFaculties()->attach($otherFaculty);
        $this->actingAs($scopedAdmin)->get(route('dashboard.admin.finance.tariffs.index'))
            ->assertInertia(fn (Assert $page) => $page->where('filters.year', $entry->academic_year_id)->has('tariffs.data', 0));
        $this->get($workspace)->assertForbidden();
        $this->put($updateActive, $next + ['revision' => $activeRevision])->assertForbidden();
    }

    public function test_financial_access_tracks_overdue_installments_and_staff_confirmed_payments(): void
    {
        [$admin, $student, $entry, $finance] = $this->context();
        $this->travelTo(CarbonImmutable::parse('2026-11-10 23:00', 'Africa/Kinshasa'));
        $this->obligation($entry, due: '2026-11-10');
        $entry->obligations()->create(['kind' => 'tuition', 'title' => 'Deuxième échéance', 'installment' => 2, 'amount_cents' => 15000, 'currency' => 'USD', 'due_at' => '2027-02-01']);
        $this->actingAs($admin)->post(route('dashboard.admin.student-academic.rules'), [
            'feature' => 'materials_download', 'fee_kind' => 'tuition', 'mode' => 'due_installments',
            'academic_year_id' => $entry->academic_year_id, 'level_id' => $entry->level_id, 'reason' => 'Accès défini selon les échéances de l’année.',
        ])->assertSessionHasNoErrors();
        $access = app(AcademicAccessService::class);
        $this->assertTrue($access->decision($entry, 'materials_download')['allowed']);
        $this->travel(2)->hours();
        $this->assertFalse($access->decision($entry, 'materials_download')['allowed']);
        $this->assertTrue($access->decision($entry, 'payments_view')['allowed']);
        $pending = $finance->record($entry, $admin, ['amount' => '100.00', 'kind' => 'tuition', 'method' => 'cash', 'reference' => 'PREUVE-ANNUELLE', 'note' => 'Bordereau déposé au service financier.']);
        $this->assertFalse($access->decision($entry, 'materials_download')['allowed']);
        $finance->transition($pending, $admin, 'confirmed', 'Bordereau vérifié par le service financier.');
        $this->assertTrue($access->decision($entry, 'materials_download')['allowed']);
        $this->actingAs($student)->get(route('dashboard.student.index', ['section' => 'fees', 'academic' => $entry->id]))
            ->assertInertia(fn (Assert $page) => $page->where('balance.balance_cents', 15000)->where('balance.overdue_cents', 0));
    }

    public function test_csv_reconciliation_requires_exact_match_and_explicit_commit(): void
    {
        [$admin,,$entry,$finance] = $this->context();
        $this->obligation($entry);
        $p = $finance->record($entry, $admin, ['amount' => '30.00', 'method' => 'bank_transfer', 'reference' => 'BANK-REF', 'note' => 'Versement à rapprocher.']);
        $service = app(FinanceReconciliationService::class);
        $csv = "bank_reference,payment_reference,amount,currency,date\nOP1,BANK-REF,30.00,USD,".today()->toDateString()."\nOP2,BANK-REF,31.00,USD,".today()->toDateString()."\nOP1,BANK-REF,30.00,USD,".today()->toDateString()."\n";
        $rows = $service->preview($admin, $csv);
        $this->assertSame(['match', 'mismatch', 'duplicate'], array_column($rows, 'state'));
        $this->assertSame('pending', $p->fresh()->status);
        $service->commit($admin, 'BANK-ACCOUNT', [$rows[0]], 'Rapprochement explicite après contrôle du relevé.');
        $service->commit($admin, 'BANK-ACCOUNT', [$rows[0]], 'Rejeu du rapprochement de la même opération.');
        $this->assertSame('confirmed', $p->fresh()->status);
        $this->assertDatabaseCount('finance_bank_lines', 1);
        $this->invalid(fn () => $service->commit($admin, 'BANK-ACCOUNT', [$rows[1]], 'Une ressemblance ne vaut pas rapprochement.'), 'rows');
    }

    public function test_receipt_snapshot_verification_and_ownership_are_safe(): void
    {
        [$admin,$student,$entry] = $this->context();
        $this->travelTo(CarbonImmutable::parse('2026-11-15 23:30:00', 'UTC'));
        $entry->obligations()->create([
            'kind' => 'library', 'title' => 'Frais de bibliothèque', 'installment' => 1, 'amount_cents' => 10000, 'currency' => $entry->currency,
        ]);
        $p = $this->pay($entry, $admin, '100.00', 'library');
        $snapshot = $p->receipt_snapshot;
        $this->assertSame('Frais de bibliothèque', $snapshot['kind_title']);
        unset($snapshot['kind_title']);
        FinanceMutation::run(fn () => $p->update(['receipt_snapshot' => $snapshot]));
        $student->update(['first_name' => 'Nom ultérieurement corrigé']);
        $url = URL::signedRoute('finance.receipts.verify', ['payment' => $p->uuid, 'format' => 'html']);
        $public = ['receipt' => $p->uuid, 'state' => 'valid', 'issued_at' => $p->confirmed_at->toDateString()];
        $this->get(URL::signedRoute('finance.receipts.verify', ['payment' => $p->uuid]))->assertOk()->assertExactJson($public);
        $this->get($url, ['Accept' => 'text/html'])
            ->assertOk()->assertViewIs('student.receipt-verification')->assertViewHas('verification', array_replace($public, ['issued_at' => '2026-11-16']))
            ->assertDontSee($snapshot['name'])->assertDontSee($snapshot['reference']);
        $this->get($url.'&montant=50', ['Accept' => 'text/html'])->assertForbidden();
        $this->get('/finance/receipts/'.$p->uuid.'/verify', ['Accept' => 'text/html'])->assertForbidden();

        $receiptUrl = route('dashboard.student.payments.receipt', ['payment' => $p->uuid, 'academic' => $entry->id]);
        $this->actingAs($student)->get($receiptUrl)->assertOk()->assertSee($snapshot['name'])->assertDontSee('Nom ultérieurement corrigé')
            ->assertSeeText('Payé')->assertSeeText('Montant payé')->assertSeeText('16/11/2026 à 00:30')
            ->assertSee('assets/usk/logo.png')->assertSee('alt="QR code de vérification du reçu"', false)
            ->assertViewHas('receipt', fn ($receipt) => $receipt['state'] === 'paid' && $receipt['kind_title'] === 'Frais de bibliothèque'
                && $receipt['verification_url'] === $url && str_starts_with($receipt['qr_image'], 'data:image/png;base64,'));
        $this->assertSame($snapshot, $p->fresh()->receipt_snapshot);
        $other = User::factory()->create();
        $other->assignRole('student');
        $this->actingAs($other)->get($receiptUrl)->assertForbidden();
        $this->actingAs($admin)->get(route('dashboard.admin.finance.receipt', $p))->assertOk()->assertViewHas('receipt.verification_url', $url);
    }

    public function test_finance_dashboard_export_and_mutations_enforce_roles_and_faculty_scope(): void
    {
        [$admin,$student,$entry] = $this->context();
        $this->obligation($entry);
        $this->actingAs($student)->get('/app/dashboard/admin/finance')->assertForbidden();
        $this->post('/app/dashboard/admin/student-academic/'.$entry->id.'/payments', ['amount' => '1.00', 'kind' => 'tuition', 'method' => 'cash', 'reference' => 'HACK', 'note' => 'Tentative cliente interdite.'])->assertForbidden();
        $account = route('dashboard.admin.finance.index', ['academic' => $entry->id]);
        $this->actingAs($admin)->get($account)->assertInertia(fn (Assert $p) => $p
            ->component('dashboard/finance/Index')->where('selected.id', $entry->id)
            ->where('statement.balance.balance_cents', 10000)->has('entries.data', 0)->has('totals', 0));
        $this->get('/app/dashboard/admin/finance/export')->assertOk()->assertHeader('Content-Type', 'text/csv; charset=UTF-8')
            ->assertSessionHas('_previous.url', $account);
        $faculty = DB::table('faculties')->insertGetId(['name' => 'Autre faculté', 'code' => 'OTHER']);
        $admin->academicFaculties()->attach($faculty);
        $this->get('/app/dashboard/admin/finance')->assertInertia(fn (Assert $p) => $p->has('entries.data', 0)->has('totals', 0));
        $this->get('/app/dashboard/admin/finance?academic='.$entry->id)->assertForbidden();
    }

    public function test_financial_account_surfaces_pending_payments_and_authorized_checker(): void
    {
        [$admin, , $entry] = $this->context();
        $this->obligation($entry);
        $account = route('dashboard.admin.finance.index', ['academic' => $entry->id]);
        $this->actingAs($admin)->from($account)->post(route('dashboard.admin.student-academic.payments', $entry->id), [
            'kind' => 'tuition', 'amount' => '25.00', 'method' => 'cash', 'reference' => 'PENDING-ACCOUNT', 'note' => 'Pièce à contrôler au guichet.',
        ])->assertRedirect($account)->assertSessionHasNoErrors();
        $pending = StudentPayment::where('reference', 'PENDING-ACCOUNT')->sole();
        $confirmed = $this->pay($entry, $admin, '10.00');
        config(['finance.dual_control' => true]);

        $this->actingAs($admin)->get($account)->assertInertia(fn (Assert $page) => $page
            ->where('pendingPaymentCount', 1)
            ->where('payments.data.0.id', $pending->id)
            ->where('payments.data.0.can_confirm', false)
            ->where('payments.data.0.note', 'Pièce à contrôler au guichet.')
            ->where('payments.data.0.recorded_at', $pending->created_at->toIso8601String())
            ->where('payments.data.1.id', $confirmed->id)
            ->where('statement.balance.balance_cents', 9000));

        $checker = User::factory()->create()->assignRole('admin');
        $this->actingAs($checker)->get($account)->assertInertia(fn (Assert $page) => $page
            ->where('payments.data.0.can_confirm', true));
        $this->from($account)->post(route('dashboard.admin.student-academic.payments.status', $pending->id), [
            'status' => 'confirmed', 'reason' => 'Pièce de versement vérifiée au guichet.',
        ])->assertRedirect($account)->assertSessionHasNoErrors();
        $this->get($account)->assertInertia(fn (Assert $page) => $page
            ->where('pendingPaymentCount', 0)->where('statement.balance.balance_cents', 6500));
    }

    public function test_two_currencies_are_never_aggregated_and_checker_can_be_required(): void
    {
        [$admin,,$entry,$finance] = $this->context();
        $this->obligation($entry);
        $p = $finance->record($entry, $admin, ['amount' => '10.00', 'method' => 'cash', 'reference' => 'DUAL', 'note' => 'Saisie par le premier agent.']);
        config(['finance.dual_control' => true]);
        $this->invalid(fn () => $finance->transition($p, $admin, 'confirmed', 'Auto-confirmation interdite en double contrôle.'), 'payment');
        $checker = User::factory()->create();
        $checker->assignRole('admin');
        $finance->transition($p, $checker, 'confirmed', 'Vérification par un autre agent.');
        $other = $entry->replicate();
        $other->academic_year_id = AcademicYear::create(['title' => '2027-2028', 'start_date' => '2027-10-01', 'end_date' => '2028-09-30', 'status' => 'draft'])->id;
        $other->currency = 'CDF';
        $other->save();
        $this->obligation($other, 'tuition', 100000);
        $totals = collect(app(FinanceReportingService::class)->totals($admin, []))->keyBy('currency');
        $this->assertCount(2, $totals);
        $this->assertSame(10000, $totals['USD']['billed_cents']);
        $this->assertSame(100000, $totals['CDF']['billed_cents']);
    }

    public function test_finance_cashflow_groups_dated_receipts_and_refunds_by_local_month_and_filtered_currency(): void
    {
        [$admin, , $entry, $finance] = $this->context();
        $this->obligation($entry);
        $this->travelTo(CarbonImmutable::parse('2026-10-31 23:30:00', 'UTC'));
        $payment = $this->pay($entry, $admin, '40.00');
        $cancelled = $this->pay($entry, $admin, '15.00');
        $finance->transition($cancelled, $admin, 'cancelled', 'Contrepassation de l’écriture erronée.');
        $refunds = app(PaymentRefundService::class);
        $refund = $refunds->request($payment, $admin, ['amount' => '40.00', 'operation_key' => (string) Str::uuid(), 'reason' => 'Remboursement intégral de ce versement.']);
        $refunds->transition($refund, $admin, ['status' => 'approved', 'reason' => 'Remboursement autorisé par la caisse.']);
        $this->travelTo(CarbonImmutable::parse('2026-11-30 23:30:00', 'UTC'));
        $refunds->transition($refund, $admin, ['status' => 'executed', 'reason' => 'Décaissement vérifié et rapproché.', 'method' => 'cash', 'execution_reference' => 'CASHFLOW-REFUND']);

        $faculty = DB::table('faculties')->insertGetId(['name' => 'Autre faculté', 'code' => 'OTHER']);
        $level = DB::table('levels')->insertGetId(['faculty_id' => $faculty, 'title' => 'Autre niveau', 'code' => 'A1']);
        $other = $entry->replicate();
        $other->academic_year_id = AcademicYear::create(['title' => '2025-2026', 'start_date' => '2025-10-01', 'end_date' => '2026-09-30', 'status' => 'closed'])->id;
        $other->level_id = $level;
        $other->currency = 'CDF';
        $other->save();
        $this->obligation($other, amount: 120000);
        $this->pay($other, $admin, '1000.00');

        $this->actingAs($admin)->get(route('dashboard.admin.finance.index'))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->has('cashflow.series', 2)
            ->where('cashflow.series.0.currency', 'CDF')
            ->where('cashflow.series.0.months.11.net_cents', 100000)
            ->where('cashflow.series.1.currency', 'USD'));
        $this->get(route('dashboard.admin.finance.index', ['year' => $entry->academic_year_id]))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('cashflow.start_month', '2026-01')
            ->where('cashflow.end_month', '2026-12')
            ->has('cashflow.series', 1)
            ->where('cashflow.series.0.currency', 'USD')
            ->has('cashflow.series.0.months', 12)
            ->where('cashflow.series.0.months.9.gross_cents', 0)
            ->where('cashflow.series.0.months.10', ['month' => '2026-11', 'gross_cents' => 4000, 'refunded_cents' => 0, 'net_cents' => 4000])
            ->where('cashflow.series.0.months.11', ['month' => '2026-12', 'gross_cents' => 0, 'refunded_cents' => 4000, 'net_cents' => -4000]));

        $admin->academicFaculties()->attach($entry->level->faculty_id);
        $this->get(route('dashboard.admin.finance.index'))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->has('faculties', 1)
            ->where('faculties.0.id', $entry->level->faculty_id)
            ->missing('faculties.0.pivot')
            ->has('cashflow.series', 1)
            ->where('cashflow.series.0.currency', 'USD'));
        $this->get(route('dashboard.admin.finance.index', ['faculty' => $faculty]))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->has('cashflow.series', 0));
    }

    public function test_finance_breakdowns_reconcile_fee_and_faculty_totals_with_the_filtered_ledger(): void
    {
        [$admin, , $entry, $finance] = $this->context();
        $yesterday = today('Africa/Kinshasa')->subDay()->toDateString();
        $this->obligation($entry, 'tuition', 10000, $yesterday);
        $this->obligation($entry, 'lab', 2000);
        $this->pay($entry, $admin, '25.00');
        $finance->adjust($entry, $admin, [
            'type' => 'scholarship',
            'fee_kind' => 'tuition',
            'amount' => '10.00',
            'reason' => 'Bourse affectée aux frais de scolarité.',
        ]);

        $faculty = DB::table('faculties')->insertGetId(['name' => 'Faculté des sciences', 'code' => 'SCI']);
        $level = DB::table('levels')->insertGetId(['faculty_id' => $faculty, 'title' => 'Sciences', 'code' => 'SCI1']);
        $other = $entry->replicate();
        $other->level_id = $level;
        $other->save();
        $this->obligation($other, 'tuition', 50000, $yesterday);

        $older = $other->replicate();
        $older->academic_year_id = AcademicYear::create(['title' => '2025-2026', 'start_date' => '2025-10-01', 'end_date' => '2026-09-30', 'status' => 'closed'])->id;
        $older->currency = 'CDF';
        $older->save();
        $this->obligation($older, 'tuition', 120000, $yesterday);

        $reports = app(FinanceReportingService::class);
        $breakdowns = $reports->breakdowns($admin, []);
        $this->assertSame(['CDF', 'USD', 'USD'], array_column($breakdowns['faculties'], 'currency'));
        $this->assertSame($faculty, $breakdowns['faculties'][1]['faculty_id']);
        $this->assertSame(50000, $breakdowns['faculties'][1]['balance_cents']);

        foreach ($reports->totals($admin, []) as $total) {
            foreach ($breakdowns as $rows) {
                $matching = collect($rows)->where('currency', $total['currency']);
                foreach (['billed_cents', 'waived_cents', 'due_cents', 'balance_cents', 'overdue_cents'] as $field) {
                    $this->assertSame($total[$field], $matching->sum($field), $field);
                }
                $this->assertSame($total['due_cents'] - $total['balance_cents'], $matching->sum('covered_cents'));
            }
        }

        $this->actingAs($admin)->get(route('dashboard.admin.finance.index', ['year' => $entry->academic_year_id, 'level' => $entry->level_id]))
            ->assertOk()->assertInertia(fn (Assert $page) => $page
            ->has('breakdowns.faculties', 1)
            ->where('breakdowns.faculties.0.faculty_id', $entry->level->faculty_id)
            ->where('breakdowns.faculties.0.billed_cents', 12000)
            ->where('breakdowns.faculties.0.balance_cents', 8500)
            ->where('breakdowns.faculties.0.overdue_cents', 6500)
            ->has('breakdowns.fee_kinds', 2)
            ->where('breakdowns.fee_kinds.0.kind', 'tuition')
            ->where('breakdowns.fee_kinds.0.covered_cents', 2500));

        $admin->academicFaculties()->attach($entry->level->faculty_id);
        $this->get(route('dashboard.admin.finance.index', ['faculty' => $faculty]))->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->has('breakdowns.faculties', 0)
                ->has('breakdowns.fee_kinds', 0));
    }

    public function test_payment_notifications_are_private_and_idempotent(): void
    {
        [$admin,$student,$entry,$finance] = $this->context();
        $this->obligation($entry);
        $p = $this->pay($entry, $admin, '10.00');
        $finance->transition($p, $admin, 'confirmed', 'Rejeu de la confirmation déjà enregistrée.');
        $notices = $student->notifications()->where('type', FinancialOperationNotice::class)->get();
        $this->assertCount(1, $notices);
        $this->assertSame($entry->id, $notices->first()->data['academic_enrollment_id']);
        $this->assertArrayNotHasKey('amount_cents', $notices->first()->data);
        $this->assertSame('confirmed', $notices->first()->data['status']);
    }

    public function test_http_csv_preview_is_actor_bound_and_commit_is_explicit(): void
    {
        [$admin,,$entry,$finance] = $this->context();
        $this->obligation($entry);
        $p = $finance->record($entry, $admin, ['amount' => '20.00', 'reference' => 'HTTP-BANK', 'method' => 'bank_transfer', 'note' => 'Versement avec référence bancaire.']);
        $csv = "bank_reference,payment_reference,amount,currency,date\nHTTP-OP,HTTP-BANK,20.00,USD,".today()->toDateString()."\n";
        $this->actingAs($admin)->post('/app/dashboard/admin/finance/reconciliation/preview', ['file' => UploadedFile::fake()->createWithContent('bank.csv', $csv), 'account' => 'Journal banque'])->assertStatus(303);
        $this->assertSame('pending', $p->fresh()->status);
        $this->assertDatabaseCount('finance_bank_lines', 0);
        $this->post('/app/dashboard/admin/finance/reconciliation/commit', ['rows' => [0], 'reason' => 'Rapprochement explicitement contrôlé.'])->assertStatus(303);
        $this->assertSame('confirmed', $p->fresh()->status);
        $this->assertDatabaseCount('finance_bank_lines', 1);
        $this->post('/app/dashboard/admin/finance/reconciliation/commit', ['rows' => [0], 'reason' => 'Prévisualisation déjà consommée.'])->assertStatus(422);
    }

    public function test_refund_records_cannot_be_edited_outside_audited_workflow(): void
    {
        [$admin,,$entry] = $this->context();
        $this->obligation($entry);
        $p = $this->pay($entry, $admin, '100.00');
        $service = app(PaymentRefundService::class);
        $refund = $service->request($p, $admin, ['amount' => '10.00', 'operation_key' => (string) Str::uuid(), 'reason' => 'Demande de remboursement contrôlée.']);
        $this->invalid(fn () => $refund->update(['status' => 'executed']), 'refund');
        $this->invalid(fn () => $refund->delete(), 'refund');
        $this->assertSame('requested', $refund->fresh()->status);
    }
}
