<?php

namespace App\Modules\Student\Infrastructure\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\AcademicStructure\AcademicCycle;
use App\Models\AcademicStructure\AcademicProgram;
use App\Models\AcademicYear;
use App\Models\Faculty;
use App\Models\Level;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\FinanceTariff;
use App\Models\Student\PaymentRefund;
use App\Models\Student\StudentPayment;
use App\Models\Student\StudentPaymentProof;
use App\Models\User;
use App\Modules\Student\Application\Services\AcademicEnrollmentReadService;
use App\Modules\Student\Application\Services\AcademicEnrollmentService;
use App\Modules\Student\Application\Services\EnrollmentFinancialConfirmation;
use App\Modules\Student\Application\Services\FeeTariffService;
use App\Modules\Student\Application\Services\FinanceReceiptService;
use App\Modules\Student\Application\Services\FinanceReconciliationService;
use App\Modules\Student\Application\Services\FinanceReportingService;
use App\Modules\Student\Application\Services\PaymentAllocationService;
use App\Modules\Student\Application\Services\PaymentRefundService;
use App\Modules\Student\Application\Services\StudentFinanceService;
use App\Modules\Student\Application\Services\StudentPaymentProofs;
use App\Modules\Student\Infrastructure\Exports\FinanceWorkbook;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

final class FinanceController extends Controller
{
    private function staff(Request $r): void
    {
        abort_unless($r->user()->hasRole('admin') && $r->user()->can('manage academic finance'), 403);
    }

    private function filters(Request $r): array
    {
        return $r->validate(['q' => 'nullable|string|max:150', 'year' => 'nullable|integer|exists:academic_years,id', 'faculty' => 'nullable|integer|exists:faculties,id', 'program' => 'nullable|integer|exists:academic_programs,id', 'level' => 'nullable|integer|exists:levels,id', 'academic' => 'nullable|integer']);
    }

    public function index(Request $r, StudentFinanceService $finance, FinanceReportingService $reports, AcademicEnrollmentReadService $read, FeeTariffService $tariffService)
    {
        $this->staff($r);
        $actor = $r->user();
        $filters = $this->filters($r);
        if (isset($filters['academic'])) {
            $context = $r->validate($this->confirmationReturnRules());
            $entry = AcademicEnrollment::with(['profile.user', 'level.faculty', 'academicYear', 'curriculumVersion', 'promotion.program', 'admissionCohort.program', 'group.intake', 'group.promotion', 'application'])
                ->findOrFail($filters['academic']);

            return $this->account($r, $entry, $actor, $filters + $context, $finance, $read, $tariffService);
        }
        $facultyScope = $actor->academicFaculties();
        $hasFacultyScope = $facultyScope->exists();

        return Inertia::render('dashboard/finance/Index', [
            'entries' => $reports->entries($actor, $filters)->latest('academic_enrollments.id')->paginate(15)->withQueryString()->through(fn ($e) => $read->row($e)),
            'filters' => $filters, 'totals' => $reports->totals($actor, $filters), 'selected' => null,
            'cashflow' => fn () => $reports->cashflow($actor, $filters),
            'breakdowns' => fn () => $reports->breakdowns($actor, $filters),
            'statement' => null, 'adjustments' => null, 'obligations' => [], 'payments' => null,
            'refunds' => null, 'tariffs' => ['data' => []],
            'faculties' => $hasFacultyScope ? (clone $facultyScope)->orderBy('name')->get(['faculties.id', 'faculties.name'])->makeHidden('pivot') : Faculty::orderBy('name')->get(['id', 'name']),
            'programs' => AcademicProgram::when($hasFacultyScope, fn ($q) => $q->whereIn('faculty_id', (clone $facultyScope)->select('faculties.id')))->orderBy('name')->get(['id', 'name', 'faculty_id']),
            'levels' => Level::with('faculty:id,name')->when($hasFacultyScope, fn ($q) => $q->whereIn('faculty_id', (clone $facultyScope)->select('faculties.id')))->orderBy('title')->get(['id', 'title', 'faculty_id']),
            'cycles' => AcademicCycle::orderBy('name')->get(['id', 'name']),
            'years' => AcademicYear::orderByDesc('start_date')->get(['id', 'title']),
            'currencies' => config('finance.currencies'), 'methods' => config('finance.methods'), 'dualControl' => config('finance.dual_control'),
            'preview' => ($r->session()->get('finance.preview.actor_id') === $r->user()->id && $r->session()->get('finance.preview.expires_at', 0) >= now()->timestamp) ? $r->session()->get('finance.preview') : null,
        ]);
    }

    private function account(Request $request, AcademicEnrollment $entry, User $actor, array $filters, StudentFinanceService $finance, AcademicEnrollmentReadService $read, FeeTariffService $tariffs)
    {
        $finance->authorize($entry, $actor);
        if ($request->isMethod('GET') && $request->header('Purpose') !== 'prefetch' && $tariffs->applyToEnrollment($entry)) {
            $entry->refresh();
        }
        $dualControl = (bool) config('finance.dual_control');
        $fromConfirmations = (bool) ($filters['from_confirmations'] ?? false);
        $fromProofs = (bool) ($filters['from_proofs'] ?? false);
        $statement = $finance->statement($entry);
        $backUrl = $fromConfirmations
            ? route('dashboard.admin.finance.confirmations', array_filter([
                'q' => $filters['confirmation_q'] ?? null,
                'page' => $filters['confirmation_page'] ?? null,
            ], fn ($value) => $value !== null), false)
            : route('dashboard.admin.finance.index', Arr::only($filters, ['q', 'year', 'faculty', 'program', 'level']), false);
        if ($fromProofs) {
            $backUrl = route('dashboard.admin.finance.proofs.index', Arr::only($filters, ['q', 'page']), false);
        }

        return Inertia::render('dashboard/finance/Index', [
            'selected' => $read->row($entry),
            'filters' => $filters,
            'accountBackUrl' => $backUrl,
            'accountBackLabel' => $fromProofs ? 'Justificatifs de paiement' : ($fromConfirmations ? 'Inscriptions en attente' : 'Comptes étudiants'),
            'enrollmentConfirmation' => $this->enrollmentConfirmation($entry, $actor, $finance, $statement),
            'statement' => $statement,
            'paymentProofs' => fn () => app(StudentPaymentProofs::class)->adminRows($entry, $statement['kind_titles']),
            'adjustments' => $entry->adjustments()->latest('id')->paginate(15, ['*'], 'adjustments_page')->withQueryString(),
            'obligations' => $entry->obligations()->orderBy('installment')->orderBy('id')->get(),
            'pendingPaymentCount' => $entry->payments()->where('status', 'pending')->count(),
            'payments' => $entry->payments()->with('allocations')
                ->orderByRaw("CASE WHEN status = 'pending' THEN 0 ELSE 1 END")->latest('id')
                ->paginate(20, ['*'], 'payments_page')->withQueryString()->through(fn (StudentPayment $payment) => $payment->toArray() + [
                    'can_confirm' => $payment->status === 'pending' && (! $dualControl || (int) $payment->recorded_by !== (int) $actor->id),
                    'recorded_at' => $payment->created_at?->toIso8601String(),
                ]),
            'refunds' => PaymentRefund::whereIn('student_payment_id', $entry->payments()->select('id'))->latest('id')->paginate(15, ['*'], 'refunds_page')->withQueryString(),
            'tariffs' => ['data' => $tariffs->billableFor($entry, $actor)->orderBy('title')->get(['id', 'title', 'version', 'category', 'currency', 'status'])],
            'currencies' => config('finance.currencies'), 'methods' => config('finance.methods'), 'dualControl' => $dualControl,
            'entries' => ['data' => [], 'links' => [], 'total' => 0], 'totals' => [],
            'cashflow' => ['start_month' => '', 'end_month' => '', 'series' => []],
            'breakdowns' => ['faculties' => [], 'fee_kinds' => []],
            'faculties' => [], 'programs' => [], 'levels' => [], 'cycles' => [], 'years' => [], 'preview' => null,
        ]);
    }

    private function confirmationReturnRules(): array
    {
        return [
            'from_confirmations' => 'nullable|boolean',
            'confirmation_q' => 'nullable|string|max:150',
            'confirmation_page' => 'nullable|integer|min:1',
            'from_proofs' => 'nullable|boolean',
            'page' => 'nullable|integer|min:1',
        ];
    }

    public function proofs(Request $request, StudentPaymentProofs $proofs, AcademicEnrollmentReadService $enrollments)
    {
        $this->staff($request);
        $filters = $request->validate(['q' => 'nullable|string|max:150', 'page' => 'nullable|integer|min:1']);
        $actor = $request->user();
        $query = $proofs->pendingFor($actor)->with(['payment', 'enrollment.profile.user', 'enrollment.academicYear', 'enrollment.level.faculty']);
        if (! empty($filters['q'])) {
            $query->whereIn('academic_enrollment_id', $enrollments->query($actor, ['q' => $filters['q']])->select('academic_enrollments.id'));
        }
        $rows = $query->oldest('id')->paginate(20)->withQueryString();
        $rows->through(function (StudentPaymentProof $proof) use ($proofs, $filters, $rows) {
            $entry = $proof->enrollment;
            $row = $proofs->adminRow($proof);
            $target = $proof->status === 'accepted' ? '#paiements' : '#justificatif-'.$proof->id;

            return Arr::only($row, ['id', 'reference', 'kind_label', 'amount_cents', 'currency', 'submitted_at']) + [
                'student' => $entry->profile->user->full_name,
                'matricule' => $entry->matricule ?? $entry->profile->matricule,
                'faculty' => $entry->level->faculty->name,
                'year' => $entry->academicYear->title,
                'second_check' => $proof->status === 'accepted',
                'account_url' => route('dashboard.admin.finance.index', [
                    'academic' => $entry->id,
                    'from_proofs' => 1,
                    'q' => $filters['q'] ?? null,
                    'page' => $rows->currentPage(),
                ], false).$target,
            ];
        });

        return Inertia::render('dashboard/finance/PaymentProofs', ['rows' => $rows, 'filters' => Arr::only($filters, ['q'])]);
    }

    public function tariffs(Request $request, FeeTariffService $service)
    {
        $this->staff($request);
        $filters = $request->validate([
            'year' => 'nullable|integer|exists:academic_years,id',
            'faculty' => 'nullable|integer|exists:faculties,id',
            'level' => 'nullable|integer|exists:levels,id',
            'category' => 'nullable|string|max:50|regex:/^[a-z][a-z0-9_]*$/',
            'status' => 'nullable|in:draft,active,archived',
        ]);
        $faculties = $request->user()->academicFaculties();
        $facultyIds = $faculties->pluck('faculties.id');
        if ($facultyIds->isNotEmpty()) {
            abort_if(isset($filters['faculty']) && ! $facultyIds->contains($filters['faculty']), 403);
            abort_if(isset($filters['level']) && ! Level::whereKey($filters['level'])->whereIn('faculty_id', $facultyIds)->exists(), 403);
        }
        foreach (['year', 'faculty', 'level'] as $id) {
            if (isset($filters[$id])) {
                $filters[$id] = (int) $filters[$id];
            }
        }

        $years = AcademicYear::orderByDesc('start_date')->orderByDesc('id')->get(['id', 'title', 'status', 'start_date', 'end_date']);
        $open = $years->where('status', 'open');
        $today = today('Africa/Kinshasa')->toDateString();
        $current = $open->first(fn (AcademicYear $year) => $year->start_date <= $today && $year->end_date >= $today) ?? $open->first() ?? $years->first();
        $filters['year'] ??= $current?->id;

        $query = FinanceTariff::with(['academicYear:id,title,start_date,end_date,status', 'faculty:id,name', 'level:id,title,faculty_id', 'level.faculty:id,name', 'program:id,name,faculty_id', 'program.faculty:id,name'])
            ->where('academic_year_id', $filters['year'])
            ->when(isset($filters['level']), fn ($query) => $query->where('level_id', $filters['level']))
            ->when(isset($filters['category']), fn ($query) => $query->where('category', $filters['category']))
            ->when(isset($filters['status']), fn ($query) => $query->where('status', $filters['status']));
        $tariffFacultyIds = isset($filters['faculty']) ? [$filters['faculty']] : $facultyIds->all();
        if ($tariffFacultyIds !== []) {
            $query->where(function ($query) use ($tariffFacultyIds) {
                $query->whereIn('faculty_id', $tariffFacultyIds)
                    ->orWhereHas('program', fn ($program) => $program->whereIn('faculty_id', $tariffFacultyIds))
                    ->orWhere(fn ($query) => $query->whereNull('academic_program_id')->whereHas('level', fn ($level) => $level->whereIn('faculty_id', $tariffFacultyIds)));
            });
        }
        $tariffs = $query->latest('id')->paginate(15)->withQueryString();
        $scopes = $tariffs->getCollection()->pluck('scope_key')->unique();
        $latest = FinanceTariff::whereIn('scope_key', $scopes)->groupBy('scope_key')->selectRaw('scope_key, MAX(version) AS latest_version')->pluck('latest_version', 'scope_key');
        $active = FinanceTariff::whereIn('scope_key', $scopes)->where('status', 'active')->get()->groupBy('scope_key');

        return Inertia::render('dashboard/finance/Tariffs', [
            'tariffs' => $tariffs->through(function (FinanceTariff $tariff) use ($service, $latest, $active) {
                $overlap = $tariff->status === 'draft' ? ($active->get($tariff->scope_key) ?? collect())->filter(fn (FinanceTariff $current) => ($tariff->valid_until === null || $current->valid_from <= $tariff->valid_until)
                    && ($current->valid_until === null || $current->valid_until >= $tariff->valid_from)) : collect();

                return array_replace($tariff->toArray(), [
                    'valid_from' => $tariff->valid_from->toDateString(),
                    'valid_until' => $tariff->valid_until?->toDateString(),
                    'can_apply' => $service->canApply($tariff),
                    'replace_id' => $overlap->count() === 1 ? $overlap->first()->id : null,
                    'revision' => $service->revision($tariff, (int) $latest[$tariff->scope_key]),
                ]);
            }),
            'filters' => $filters,
            'years' => $years,
            'faculties' => Faculty::when($facultyIds->isNotEmpty(), fn ($query) => $query->whereKey($facultyIds->all()))->orderBy('name')->get(['id', 'name']),
            'levels' => Level::with('faculty:id,name')->when($facultyIds->isNotEmpty(), fn ($query) => $query->whereIn('faculty_id', $facultyIds))->orderBy('title')->get(['id', 'title', 'faculty_id']),
            'programs' => AcademicProgram::when($facultyIds->isNotEmpty(), fn ($query) => $query->whereIn('faculty_id', $facultyIds))->orderBy('name')->get(['id', 'name', 'faculty_id']),
            'cycles' => AcademicCycle::orderBy('name')->get(['id', 'name']),
            'currencies' => config('finance.currencies'),
            'canScopeUniversity' => $facultyIds->isEmpty(),
        ]);
    }

    public function confirmations(Request $request, AcademicEnrollmentReadService $read, StudentFinanceService $finance)
    {
        $this->staff($request);
        $filters = $request->validate(['q' => 'nullable|string|max:150']);
        $actor = $request->user();
        $requiresPayment = (bool) config('student.enrollment_requires_first_installment');

        return Inertia::render('dashboard/finance/Confirmations', [
            'filters' => $filters,
            'requiresPayment' => $requiresPayment,
            'automaticConfirmation' => EnrollmentFinancialConfirmation::automatic(),
            'entries' => $read->query($actor, $filters + ['status' => 'pending_confirmation'])
                ->with('application')->latest('academic_enrollments.id')->paginate(15)->withQueryString()
                ->through(fn (AcademicEnrollment $entry) => $read->row($entry) + $this->enrollmentConfirmation($entry, $actor, $finance)),
        ]);
    }

    private function enrollmentConfirmation(AcademicEnrollment $entry, User $actor, StudentFinanceService $finance, ?array $statement = null): array
    {
        $installment = $finance->firstTuitionInstallment($entry, $statement);

        return [
            'status' => $entry->enrollment_status,
            'blocker' => $entry->enrollment_status === 'pending_confirmation'
                ? app(EnrollmentFinancialConfirmation::class)->blocker($entry, $installment) : null,
            'canConfirm' => ! EnrollmentFinancialConfirmation::automatic() && $actor->can('manage', $entry),
            'context' => AcademicEnrollmentService::contextToken($entry),
            'first_installment' => $installment,
            'first_installment_review_required' => $finance->firstInstallmentReviewRequired($entry, $installment),
        ];
    }

    public function confirmEnrollment(Request $request, AcademicEnrollment $academic, AcademicEnrollmentService $service)
    {
        $this->staff($request);
        abort_unless($request->user()->can('manage', $academic), 403);
        $redirect = to_route('dashboard.admin.finance.confirmations', status: 303);
        if ($request->boolean('return_to_account')) {
            $filters = $this->filters($request);
            $context = $request->validate($this->confirmationReturnRules());
            $redirect = to_route('dashboard.admin.finance.index', ['academic' => $academic->id] + $filters + $context, 303);
        }
        try {
            $data = $request->validate([
                'operation_key' => 'required|uuid',
                'expected_context' => 'required|string|size:64',
                'reason' => 'required|string|min:10|max:1000',
            ]);
            $service->transition($academic, $request->user(), $data + [
                'expected_status' => 'pending_confirmation',
                'enrollment_status' => 'confirmed',
            ]);
        } catch (ValidationException $exception) {
            return $redirect->withErrors($exception->errors());
        }

        return $redirect->with('success', 'Inscription académique confirmée.');
    }

    public function tariff(Request $r, FeeTariffService $service)
    {
        $this->staff($r);
        $data = $r->validate($this->tariffFields(allowUndated: $r->boolean('automatic')) + [
            'academic_year_id' => 'required|integer|exists:academic_years,id',
            'academic_program_id' => 'nullable|integer|exists:academic_programs,id',
            'academic_cycle_id' => 'nullable|integer|exists:academic_cycles,id',
            'faculty_id' => 'nullable|integer|exists:faculties,id',
            'level_id' => 'nullable|integer|exists:levels,id',
            'category' => 'required|string|max:50|regex:/^[a-z][a-z0-9_]*$/',
            'kind' => 'required|string|max:50|regex:/^[a-z][a-z0-9_]*$/',
            'currency' => 'required|string|size:3',
            'automatic' => 'sometimes|boolean',
            'fee_scope' => 'nullable|in:university,faculty,level',
        ]);
        $tariff = $service->create($r->user(), $data);

        return redirect()->to($this->tariffWorkspaceUrl($r, $tariff), 303)->with('success', 'Version de barème créée en brouillon.');
    }

    public function updateTariff(Request $request, FinanceTariff $tariff, FeeTariffService $service)
    {
        $this->staff($request);
        $service->authorize($request->user(), $tariff->level_id, $tariff->academic_program_id, $tariff->faculty_id);
        $data = $request->validate($this->tariffFields(allowUndated: $tariff->automatic) + ['revision' => 'required|string|size:64']);
        $saved = $service->revise($tariff, $request->user(), $data);
        $message = $saved->is($tariff) ? 'Barème modifié.' : 'Nouvelle version créée en brouillon. Activez-la après contrôle.';

        return redirect()->to($this->tariffWorkspaceUrl($request, $saved), 303)->with('success', $message);
    }

    private function tariffFields(bool $allowUndated = false): array
    {
        return [
            'title' => 'required|string|max:180',
            'valid_from' => 'required|date_format:Y-m-d',
            'valid_until' => 'nullable|date_format:Y-m-d|after_or_equal:valid_from',
            'schedule' => 'required|array|min:1|max:24',
            'schedule.*.amount' => 'required',
            'schedule.*.due_at' => $allowUndated ? 'nullable|date_format:Y-m-d' : 'required|date_format:Y-m-d',
            'reason' => 'required|string|min:10|max:2000',
        ];
    }

    public function activate(Request $r, FinanceTariff $tariff, FeeTariffService $service)
    {
        $this->staff($r);
        $data = $r->validate(['reason' => 'required|string|min:10|max:2000', 'replace_id' => 'nullable|integer', 'revision' => 'nullable|string|size:64']);
        $counts = $service->activate($tariff, $r->user(), $data['reason'], $data['replace_id'] ?? null, $data['revision'] ?? null);
        $today = today('Africa/Kinshasa')->toDateString();
        $year = $tariff->academicYear;
        $message = match (true) {
            $counts !== null => "Barème activé. Échéanciers ajoutés : {$counts['applied']}. Dossiers avec frais ou historique conservés : {$counts['preserved']}.",
            ! $service->supportsAutomaticBilling($tariff) => 'Barème activé.',
            $year->end_date < $today || ($tariff->valid_until !== null && $tariff->valid_until->toDateString() < $today) => 'Barème activé. Sa période de validité est terminée.',
            default => 'Barème activé. L’affectation automatique aura lieu pendant sa période de validité si l’année académique est ouverte.',
        };

        return redirect()->to($this->tariffWorkspaceUrl($r, $tariff), 303)->with('success', $message);
    }

    public function applyTariff(Request $r, FinanceTariff $tariff, FeeTariffService $service)
    {
        $this->staff($r);
        $data = $r->validate(['reason' => 'required|string|min:10|max:2000']);
        $counts = $service->applyToEligible($tariff, $r->user(), $data['reason']);

        return redirect()->to($this->tariffWorkspaceUrl($r, $tariff), 303)
            ->with('success', "Inscriptions facturées : {$counts['applied']}. Dossiers avec obligations ou historique conservés : {$counts['preserved']}.");
    }

    private function tariffWorkspaceUrl(Request $request, FinanceTariff $tariff): string
    {
        $faculty = $tariff->faculty_id ?? $tariff->program?->faculty_id ?? $tariff->level?->faculty_id;
        $params = ['year' => $tariff->academic_year_id];
        foreach (['faculty' => $faculty, 'level' => $tariff->level_id, 'category' => $tariff->category, 'status' => $tariff->status] as $key => $value) {
            $query = $request->query($key);
            if ($value !== null && is_scalar($query) && (string) $query === (string) $value) {
                $params[$key] = $value;
            }
        }

        return route('dashboard.admin.finance.tariffs.index', $params);
    }

    public function bill(Request $r, AcademicEnrollment $academic, FeeTariffService $service)
    {
        $this->staff($r);
        $d = $r->validate(['tariff_id' => 'required|integer|exists:finance_tariffs,id', 'reason' => 'required|string|min:10|max:2000']);
        $service->bill(FinanceTariff::findOrFail($d['tariff_id']), $academic, $r->user(), $d['reason']);

        return back(303);
    }

    public function allocate(Request $r, StudentPayment $payment, PaymentAllocationService $service)
    {
        $this->staff($r);
        $d = $r->validate(['allocations' => 'required|array|min:1|max:24', 'allocations.*.obligation_id' => 'required|integer|distinct|exists:student_obligations,id', 'allocations.*.amount' => 'required', 'reason' => 'required|string|min:10|max:2000']);
        $service->allocate($payment, $r->user(), $d['allocations'], $d['reason']);

        return back(303);
    }

    public function refund(Request $r, StudentPayment $payment, PaymentRefundService $service)
    {
        $this->staff($r);
        $d = $r->validate(['amount' => 'required', 'operation_key' => 'required|uuid', 'reason' => 'required|string|min:10|max:2000']);
        $service->request($payment, $r->user(), $d);

        return back(303);
    }

    public function refundStatus(Request $r, PaymentRefund $refund, PaymentRefundService $service)
    {
        $this->staff($r);
        $d = $r->validate(['status' => 'required|in:approved,cancelled,executed', 'reason' => 'required|string|min:10|max:2000', 'method' => 'required_if:status,executed|nullable|string', 'execution_reference' => 'required_if:status,executed|nullable|string|max:180']);
        $service->transition($refund, $r->user(), $d);

        return back(303);
    }

    public function preview(Request $r, FinanceReconciliationService $service)
    {
        $this->staff($r);
        $d = $r->validate(['file' => 'required|file|max:2048', 'account' => 'required|string|max:100']);
        $rows = $service->preview($r->user(), $r->file('file')->get());
        $r->session()->put('finance.preview', ['actor_id' => $r->user()->id, 'rows' => $rows, 'account' => $d['account'], 'expires_at' => now()->addMinutes(30)->timestamp]);

        return back(303);
    }

    public function reconcile(Request $r, FinanceReconciliationService $service)
    {
        $this->staff($r);
        $d = $r->validate(['rows' => 'required|array|min:1|max:500', 'rows.*' => 'required|integer|distinct|min:0', 'reason' => 'required|string|min:10|max:2000']);
        $preview = $r->session()->get('finance.preview');
        abort_unless($preview && $preview['actor_id'] === $r->user()->id && $preview['expires_at'] >= now()->timestamp, 422, 'La prévisualisation a expiré.');
        $rows = array_map(function ($index) use ($preview) {
            abort_unless(isset($preview['rows'][$index]), 422);

            return $preview['rows'][$index];
        }, $d['rows']);
        $service->commit($r->user(), $preview['account'], $rows, $d['reason']);
        $r->session()->forget('finance.preview');

        return back(303);
    }

    public function export(Request $r, FinanceReportingService $reports)
    {
        $this->staff($r);
        $filters = $this->filters($r);
        $actor = $r->user();

        return response()->streamDownload(function () use ($reports, $filters, $actor) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['currency', 'billed_minor_units', 'confirmed_gross_minor_units', 'refunds_executed_minor_units', 'net_received_minor_units', 'pending_minor_units', 'cancelled_minor_units', 'legacy_reversals_minor_units', 'waived_minor_units', 'net_due_minor_units', 'balance_minor_units', 'overdue_minor_units'], ',', '"', '');
            foreach ($reports->totals($actor, $filters) as $row) {
                fputcsv($out, [$row['currency'], $row['billed_cents'], $row['gross_cents'], $row['refunded_cents'], $row['net_cents'], $row['pending_cents'], $row['cancelled_cents'], $row['legacy_reversal_cents'], $row['waived_cents'], $row['due_cents'], $row['balance_cents'], $row['overdue_cents']], ',', '"', '');
            } fclose($out);
        }, 'finance-totals.csv', ['Content-Type' => 'text/csv; charset=UTF-8', 'Cache-Control' => 'private, no-store']);
    }

    public function exportXlsx(Request $r, FinanceWorkbook $workbook)
    {
        $this->staff($r);

        return response($workbook->contents($r->user(), $this->filters($r)), 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => 'attachment; filename="finances-usk.xlsx"',
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function receipt(Request $r, StudentPayment $payment, StudentFinanceService $finance, FinanceReceiptService $receipts)
    {
        $this->staff($r);
        $finance->authorize($payment->enrollment, $r->user());
        abort_unless($payment->confirmed_at, 404);

        return response()->view('student.receipt', [
            'receipt' => $receipts->present($payment, $payment->enrollment),
            'backUrl' => route('dashboard.admin.finance.index', ['academic' => $payment->academic_enrollment_id], false),
        ])->header('Cache-Control', 'private, no-store');
    }

    public function verify(Request $r, StudentPayment $payment, FinanceReceiptService $receipts)
    {
        abort_unless($payment->confirmed_at, 404);

        $html = $r->query('format') === 'html';
        $verification = $receipts->verify($payment, localDate: $html);
        $response = $html
            ? response()->view('student.receipt-verification', compact('verification'))
            : response()->json($verification);

        return $response->withHeaders([
            'Cache-Control' => 'no-store',
            'Referrer-Policy' => 'no-referrer',
            'X-Robots-Tag' => 'noindex, nofollow',
        ]);
    }
}
