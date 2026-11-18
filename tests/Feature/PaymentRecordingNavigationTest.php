<?php

namespace Tests\Feature;

use App\Http\Middleware\HandleInertiaRequests;
use App\Models\Student\AcademicAudit;
use App\Models\Student\StudentPayment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
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

    private function inertiaHeaders(string $url): array
    {
        return [
            'X-Inertia' => 'true',
            'X-Requested-With' => 'XMLHttpRequest',
            'X-Inertia-Version' => app(HandleInertiaRequests::class)->version(Request::create($url)) ?? '',
        ];
    }

    private function assertSameDestination(string $expected, string $actual): void
    {
        $this->assertSame(parse_url($expected, PHP_URL_PATH), parse_url($actual, PHP_URL_PATH));
        parse_str(parse_url($expected, PHP_URL_QUERY) ?? '', $expectedParameters);
        parse_str(parse_url($actual, PHP_URL_QUERY) ?? '', $actualParameters);
        $this->assertEquals($expectedParameters, $actualParameters);
    }

    public function test_recording_and_confirming_a_payment_returns_to_its_account_with_feedback(): void
    {
        [$entry, $agent] = $this->context();
        config(['finance.dual_control' => false]);
        $filters = ['q' => 'etudiant.med3@usk.test', 'from_proofs' => '1', 'page' => '2'];
        $parameters = ['academic' => $entry->id] + $filters;
        $account = route('dashboard.admin.finance.index', $parameters);
        $relativeAccount = route('dashboard.admin.finance.index', $parameters, false);
        $headers = $this->inertiaHeaders($account);
        $returnContext = ['finance_return' => true, 'academic' => 999999, 'payments_page' => -1] + $filters;
        $recorded = 'Versement enregistré. Il attend la confirmation comptable.';

        $response = $this->actingAs($agent)->withSession(['_previous' => ['url' => route('dashboard.index')]])
            ->post(route('dashboard.admin.student-academic.payments', $entry), $this->paymentPayload($returnContext), $headers);

        $response->assertStatus(303)->assertHeader('Location', $account)
            ->assertSessionHas('success', $recorded)
            ->assertInertiaFlash('financePayment', ['accountId' => $entry->id, 'message' => $recorded]);
        $page = $this->get($response->headers->get('Location'), $headers);
        $page->assertOk()
            ->assertJsonPath('component', 'dashboard/finance/Index')
            ->assertJsonPath('props.selected.id', $entry->id)
            ->assertJsonPath('props.flash.success', $recorded)
            ->assertJsonPath('flash.financePayment.message', $recorded)
            ->assertJsonPath('props.payments.data.0.status', 'pending')
            ->assertJsonPath('props.statement.balance.pending_cents', 3000)
            ->assertJsonPath('props.statement.balance.paid_cents', 0)
            ->assertJsonPath('props.statement.balance.balance_cents', 10000);
        $this->assertSameDestination($relativeAccount, $page->json('url'));

        $payment = $entry->payments()->sole();
        $confirmed = "Versement confirmé. Le solde de l'étudiant a été actualisé.";
        $response = $this->post(route('dashboard.admin.student-academic.payments.status', $payment), [
            'status' => 'confirmed',
            'reason' => 'Reçu vérifié par la comptabilité.',
        ] + $returnContext, $headers);

        $response->assertStatus(303)->assertHeader('Location', $account)
            ->assertSessionHas('success', $confirmed)
            ->assertInertiaFlash('financePayment', ['accountId' => $entry->id, 'message' => $confirmed]);
        $page = $this->get($response->headers->get('Location'), $headers);
        $page->assertOk()
            ->assertJsonPath('component', 'dashboard/finance/Index')
            ->assertJsonPath('props.selected.id', $entry->id)
            ->assertJsonPath('props.flash.success', $confirmed)
            ->assertJsonPath('flash.financePayment.message', $confirmed)
            ->assertJsonPath('props.payments.data.0.status', 'confirmed')
            ->assertJsonPath('props.statement.balance.pending_cents', 0)
            ->assertJsonPath('props.statement.balance.paid_cents', 3000)
            ->assertJsonPath('props.statement.balance.balance_cents', 7000);
        $this->assertSameDestination($relativeAccount, $page->json('url'));
        $this->get($account, $headers)->assertOk()->assertJsonMissingPath('flash.financePayment');
        $this->assertDatabaseCount('student_payments', 1);
    }

    public function test_invalid_payment_keeps_the_form_context_and_creates_no_entry(): void
    {
        [$entry, $agent] = $this->context();
        $account = route('dashboard.admin.finance.index', ['academic' => $entry->id, 'q' => 'test']);
        $referer = route('dashboard.admin.finance.index', ['academic' => $entry->id, 'from_proofs' => '1', 'page' => '2']);
        $headers = $this->inertiaHeaders($account);
        $error = 'Le montant doit être supérieur à zéro.';

        $this->actingAs($agent)->from($referer)
            ->post(route('dashboard.admin.student-academic.payments', $entry), $this->paymentPayload([
                'amount' => '0', 'finance_return' => true, 'q' => 'test', 'academic' => 999999,
            ]), $headers)->assertRedirect($account)
            ->assertSessionHasErrors(['amount' => $error])
            ->assertSessionHasInput('reference', 'REC-CI-001')
            ->assertInertiaFlashMissing('financePayment');
        $this->get($account, $headers)->assertOk()
            ->assertJsonPath('component', 'dashboard/finance/Index')
            ->assertJsonPath('props.selected.id', $entry->id)
            ->assertJsonPath('props.errors.amount', $error)
            ->assertJsonMissingPath('flash.financePayment');
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

    public function test_additional_fee_returns_to_the_source_finance_tab_with_feedback(): void
    {
        [$entry, $agent] = $this->context();
        $returnContext = ['academic_return' => true, 'q' => 'Dossier fictif', 'year' => $entry->academic_year_id];
        $url = route('dashboard.admin.student-academic.index', [
            'academic' => $entry->id, 'tab' => 'finance', 'q' => 'Dossier fictif', 'year' => $entry->academic_year_id,
        ]);
        $action = route('dashboard.admin.student-academic.obligations', $entry);
        $data = ['kind' => 'library', 'title' => 'Bibliothèque', 'installment' => 1, 'amount' => '12.00'];
        $this->actingAs($agent)->withSession(['_previous' => ['url' => route('dashboard.index')]])->post($action, $data + $returnContext)
            ->assertRedirect($url)->assertSessionHasErrors('reason')->assertSessionHasInput('title', 'Bibliothèque')
            ->assertInertiaFlashMissing('financePayment');
        $this->assertDatabaseMissing('student_obligations', ['kind' => 'library']);

        $message = 'Obligation complémentaire enregistrée avec sa justification.';
        $this->post($action, $data + $returnContext + ['reason' => 'Frais approuvés pour la bibliothèque.'])
            ->assertStatus(303)->assertRedirect($url)
            ->assertInertiaFlash('financePayment', ['accountId' => $entry->id, 'message' => $message]);
        $this->assertDatabaseHas('student_obligations', ['academic_enrollment_id' => $entry->id, 'kind' => 'library', 'amount_cents' => 1200]);
    }

    public function test_cancellation_keeps_the_finance_account_and_reports_the_recalculated_balance(): void
    {
        [$entry, $agent] = $this->context();
        config(['finance.dual_control' => false]);
        $this->actingAs($agent)->post(route('dashboard.admin.student-academic.payments', $entry), $this->paymentPayload());
        $payment = $entry->payments()->sole();
        $action = route('dashboard.admin.student-academic.payments.status', $payment);
        $this->post($action, ['status' => 'confirmed', 'reason' => 'Reçu contrôlé en comptabilité.'])->assertSessionHasNoErrors();

        $url = route('dashboard.admin.finance.index', ['academic' => $entry->id, 'q' => 'Dossier fictif']);
        $message = 'Versement annulé et conservé dans l’historique. Le solde et les droits ont été recalculés.';
        $headers = $this->inertiaHeaders($url);
        $this->withSession(['_previous' => ['url' => route('dashboard.index')]])->post($action, [
            'status' => 'cancelled', 'reason' => 'Écriture fictive à contrepasser.', 'finance_return' => true, 'q' => 'Dossier fictif',
        ], $headers)->assertStatus(303)->assertRedirect($url)
            ->assertInertiaFlash('financePayment', ['accountId' => $entry->id, 'message' => $message]);
        $this->get($url, $headers)->assertOk()
            ->assertJsonPath('component', 'dashboard/finance/Index')
            ->assertJsonPath('props.selected.id', $entry->id)
            ->assertJsonPath('props.payments.data.0.status', 'cancelled')
            ->assertJsonPath('props.statement.balance.paid_cents', 0)
            ->assertJsonPath('flash.financePayment.message', $message);
        $this->assertDatabaseCount('student_payments', 1);
    }
}
