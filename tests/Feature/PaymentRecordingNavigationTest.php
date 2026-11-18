<?php

namespace Tests\Feature;

use App\Models\Student\AcademicAudit;
use App\Models\Student\StudentPayment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

class PaymentRecordingNavigationTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    private function context(): array
    {
        $entry = $this->studentContext()->studentProfile->enrollments()->sole();
        $entry->obligations()->create(['kind' => 'tuition', 'title' => 'Première tranche', 'installment' => 1, 'amount_cents' => 10000]);
        $agent = User::factory()->create()->assignRole(Role::findOrCreate('admin', 'web'));
        $agent->givePermissionTo(Permission::findOrCreate('manage academic finance', 'web'));

        return [$entry, $agent];
    }

    private function paymentPayload(array $overrides = []): array
    {
        return array_replace([
            'kind' => 'tuition',
            'amount' => '30.00',
            'method' => 'bank_transfer',
            'reference' => 'REC-CI-001',
            'note' => 'Rapprochement comptable fictif.',
        ], $overrides);
    }

    public function test_recorded_payment_returns_to_its_account_with_a_previous_public_page(): void
    {
        [$entry, $agent] = $this->context();
        $response = $this->actingAs($agent)->withSession(['_previous' => ['url' => url('/')]])
            ->post(route('dashboard.admin.student-academic.payments', $entry), $this->paymentPayload([
                'finance_return' => true, 'from_proofs' => '1', 'page' => '2',
            ]));

        $this->assertDatabaseHas('student_payments', ['academic_enrollment_id' => $entry->id, 'status' => 'pending', 'amount_cents' => 3000]);
        $response->assertStatus(303)->assertRedirect(route('dashboard.admin.finance.index', [
            'academic' => $entry->id, 'from_proofs' => '1', 'page' => '2',
        ]))->assertSessionHas('success', 'Versement enregistré en attente de confirmation comptable.');
    }

    public function test_invalid_payment_keeps_the_form_context_and_creates_no_entry(): void
    {
        [$entry, $agent] = $this->context();
        $this->actingAs($agent)->withSession(['_previous' => ['url' => url('/')]])
            ->post(route('dashboard.admin.student-academic.payments', $entry), $this->paymentPayload([
                'amount' => '0', 'finance_return' => true, 'q' => 'test', 'academic' => 999999,
            ]))->assertRedirect(route('dashboard.admin.finance.index', ['academic' => $entry->id, 'q' => 'test']))
            ->assertSessionHasErrors(['amount' => 'Le montant doit être supérieur à zéro.'])
            ->assertSessionHasInput('reference', 'REC-CI-001');
        $this->assertDatabaseCount('student_payments', 0);
    }

    public function test_replaying_a_payment_operation_adds_only_one_entry_and_one_audit_event(): void
    {
        [$entry, $agent] = $this->context();
        $url = route('dashboard.admin.student-academic.payments', $entry);
        $body = $this->paymentPayload(['operation_id' => (string) Str::uuid()]);
        $this->actingAs($agent)->post($url, $body)->assertSessionHasNoErrors();
        $this->post($url, $body)->assertSessionHasNoErrors()->assertSessionHas('success', 'Ce versement est déjà enregistré et reste en attente de confirmation comptable.');
        $this->post($url, array_replace($body, ['reference' => 'REC-CI-002']))->assertSessionHasErrors('operation_id');

        $payment = StudentPayment::sole();
        $this->assertSame('REC-CI-001', $payment->reference);
        $this->assertSame(1, AcademicAudit::where('action', 'payment_recorded')->where('entity_id', $payment->id)->count());
    }

    public function test_payment_transition_returns_to_the_account_and_keeps_dual_validation(): void
    {
        [$entry, $agent] = $this->context();
        config(['finance.dual_control' => true]);
        $this->actingAs($agent)->post(route('dashboard.admin.student-academic.payments', $entry), $this->paymentPayload());
        $payment = $entry->payments()->sole();
        $transition = route('dashboard.admin.student-academic.payments.status', $payment);
        $return = route('dashboard.admin.finance.index', ['academic' => $entry->id]);
        $body = ['status' => 'confirmed', 'reason' => 'Virement vérifié par la comptabilité.'];

        $this->post($transition, $body)->assertRedirect($return)->assertSessionHasErrors('payment');
        $this->assertSame('pending', $payment->fresh()->status);
        $supervisor = User::factory()->create()->assignRole(Role::findByName('admin', 'web'));
        $supervisor->givePermissionTo(Permission::findByName('manage academic finance', 'web'));
        $this->actingAs($supervisor)->post($transition, $body)->assertStatus(303)->assertRedirect($return);
        $this->assertSame('confirmed', $payment->fresh()->status);
    }

    public function test_a_similar_receipt_with_a_different_reference_needs_an_explicit_check_before_confirmation(): void
    {
        [$entry, $agent] = $this->context();
        config(['finance.dual_control' => false]);
        $create = route('dashboard.admin.student-academic.payments', $entry);
        $this->actingAs($agent)->post($create, $this->paymentPayload())->assertSessionHasNoErrors();
        $this->post($create, $this->paymentPayload(['reference' => 'REC-CI-ALIAS']))->assertSessionHasNoErrors();
        [$first, $second] = $entry->payments()->orderBy('id')->get()->all();
        $confirmation = ['status' => 'confirmed', 'reason' => 'Reçu original vérifié par le comptable.'];
        $this->post(route('dashboard.admin.student-academic.payments.status', $first), $confirmation)->assertSessionHasNoErrors();
        $this->post(route('dashboard.admin.student-academic.payments.status', $second), $confirmation)
            ->assertSessionHasErrors('distinct_receipt_verified');

        $this->assertSame('pending', $second->fresh()->status);
        $this->assertSame(3000, app(\App\Modules\Student\Application\Services\StudentFinanceService::class)->balance($entry)['paid_cents']);

        $this->post(route('dashboard.admin.student-academic.payments.status', $second), $confirmation + [
            'distinct_receipt_verified' => true,
        ])->assertSessionHasNoErrors();
        $this->assertSame('confirmed', $second->fresh()->status);
        $this->assertTrue(AcademicAudit::where('action', 'payment_confirmed')->where('entity_id', $second->id)->sole()->data['distinct_receipt_verified']);
    }

    public function test_academic_origin_keeps_its_finance_tab_without_using_the_public_referer(): void
    {
        [$entry, $agent] = $this->context();
        $this->actingAs($agent)->from(url('/'))->post(route('dashboard.admin.student-academic.payments', $entry), $this->paymentPayload([
            'academic_return' => true, 'year' => $entry->academic_year_id, 'q' => 'Dossier fictif',
        ]))->assertStatus(303)->assertRedirect(route('dashboard.admin.student-academic.index', [
            'academic' => $entry->id, 'tab' => 'finance', 'year' => $entry->academic_year_id, 'q' => 'Dossier fictif',
        ]));
    }
}
