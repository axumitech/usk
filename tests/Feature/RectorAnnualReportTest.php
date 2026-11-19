<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Enrollment;
use App\Models\Faculty;
use App\Models\Level;
use App\Models\Student\AcademicEnrollment;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class RectorAnnualReportTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    public function test_report_separates_people_records_years_and_cash_by_currency(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $level = Level::create(['faculty_id' => $entry->level->faculty_id, 'title' => 'Deuxième niveau', 'code' => 'T2']);
        $second = $this->enrollment($entry, $level->id, $entry->academic_year_id, 'pending_confirmation', 'CDF');
        $previous = AcademicYear::create(['title' => '2025-2026', 'start_date' => '2025-10-01', 'end_date' => '2026-09-30', 'status' => 'closed']);
        $history = $this->enrollment($entry, $level->id, $previous->id, 'completed', 'USD');
        $rector = User::factory()->create()->assignRole('rector');
        $unrelated = Faculty::create(['name' => 'Autre faculté', 'code' => 'AUT']);
        $rector->academicFaculties()->attach($unrelated);

        $receipt = $this->payment($entry, $rector, 'confirmed', 3000);
        $this->payment($entry, $rector, 'pending', 500);
        $this->payment($entry, $rector, 'cancelled', 400);
        $this->payment($entry, $rector, 'refunded', 600);
        $this->payment($second, $rector, 'confirmed', 15000);
        $this->payment($history, $rector, 'confirmed', 90000);
        foreach (['executed' => 1000, 'requested' => 300] as $state => $amount) {
            DB::table('student_payment_refunds')->insert([
                'uuid' => (string) Str::uuid(), 'operation_key' => (string) Str::uuid(),
                'student_payment_id' => $receipt, 'amount_cents' => $amount, 'requested_by' => $rector->id,
                'reason' => 'Motif confidentiel du remboursement', 'status' => $state,
            ]);
        }
        DB::table('student_obligations')->insert([
            'academic_enrollment_id' => $entry->id, 'title' => 'Frais confidentiels de test',
            'kind' => 'tuition', 'installment' => 1, 'amount_cents' => 10000,
        ]);

        $this->actingAs($rector)->get(route('dashboard.delegation'))->assertOk()
            ->assertDontSee($student->email)->assertDontSee('Motif confidentiel')->assertDontSee('Frais confidentiels')
            ->assertInertia(fn (Assert $page) => $page->where('title', 'Rectorat')
                ->where('indicators.Années ouvertes', 1)->where('indicators.Inscriptions confirmées des années ouvertes', 1)
                ->where('report.year_id', $entry->academic_year_id)->where('report.students', 1)->where('report.enrollments', 2)
                ->where('report.statuses.confirmed', 1)->where('report.statuses.pending_confirmation', 1)
                ->where('report.faculties.0.students', 1)->where('report.faculties.0.enrollments', 2)->where('report.faculties.0.confirmed', 1)
                ->where('report.faculties.1.students', 0)
                ->has('report.finance', 2)->where('report.finance.0.currency', 'CDF')->where('report.finance.0.net_cents', 15000)
                ->where('report.finance.1.currency', 'USD')->where('report.finance.1.gross_cents', 3600)
                ->where('report.finance.1.refunded_cents', 1000)->where('report.finance.1.legacy_reversal_cents', 600)
                ->where('report.finance.1.net_cents', 2000)->where('report.finance.1.pending_cents', 500)
                ->where('report.finance.1.due_cents', 10000)->where('report.finance.1.balance_cents', 8000)
                ->where('report.results.students', 0)->missing('report.payments')->missing('report.profiles'));
        $this->get(route('dashboard.delegation', ['year' => $previous->id]))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('report.year_id', $previous->id)->where('report.students', 1)->where('report.enrollments', 1)
            ->where('report.statuses.completed', 1)->missing('report.statuses.confirmed')
            ->has('report.finance', 1)->where('report.finance.0.net_cents', 90000)
            ->where('indicators.Inscriptions confirmées des années ouvertes', 1));
        $this->get(route('dashboard.delegation', ['year' => 999999]))->assertSessionHasErrors('year');
        $this->get('/app/dashboard/admin/finance')->assertForbidden();
        $this->get(route('dashboard.admin.student-academic.show', $entry))->assertForbidden();
    }

    public function test_empty_institution_and_other_roles_keep_their_own_workspaces(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $this->actingAs(User::factory()->create()->assignRole('rector'))->get(route('dashboard.delegation'))
            ->assertInertia(fn (Assert $page) => $page->has('years', 0)->where('report', null)->where('indicators.Années ouvertes', 0));
        $this->actingAs(User::factory()->create()->assignRole('department-head'))->get(route('dashboard.delegation'))
            ->assertInertia(fn (Assert $page) => $page->has('programs')->missing('report')->missing('years')->missing('indicators'));
    }

    private function enrollment(AcademicEnrollment $entry, int $level, int $year, string $status, string $currency): AcademicEnrollment
    {
        $application = Enrollment::create([
            'student_id' => $entry->profile->user_id, 'level_id' => $level, 'academic_year_id' => $year, 'status' => 'validated',
        ]);

        return AcademicEnrollment::create([
            'student_profile_id' => $entry->student_profile_id, 'application_id' => $application->id,
            'level_id' => $level, 'academic_year_id' => $year, 'enrollment_status' => $status, 'currency' => $currency,
        ]);
    }

    private function payment(AcademicEnrollment $entry, User $actor, string $status, int $amount): int
    {
        return DB::table('student_payments')->insertGetId([
            'academic_enrollment_id' => $entry->id, 'currency' => $entry->currency, 'recorded_by' => $actor->id,
            'amount_cents' => $amount, 'uuid' => (string) Str::uuid(), 'reference' => (string) Str::uuid(),
            'method' => 'cash', 'kind' => 'tuition', 'status' => $status,
        ]);
    }
}
