<?php

namespace App\Modules\Student\Application\Services;

use App\Models\AcademicStructure\AcademicProgram;
use App\Models\AcademicYear;
use App\Models\Level;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\FinanceTariff;
use App\Models\User;
use App\Modules\Identity\Domain\Nationality;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class FeeTariffService
{
    private const TUITION_CATEGORIES = ['national', 'foreign'];

    public function authorize(User $actor, ?int $levelId, ?int $programId): void
    {
        abort_unless($actor->hasRole('admin') && $actor->can('manage academic finance'), 403);
        $level = $levelId ? Level::findOrFail($levelId) : null;
        $program = $programId ? AcademicProgram::findOrFail($programId) : null;
        if ($level && $program && ! $program->levels()->whereKey($level->id)->exists()) {
            throw ValidationException::withMessages(['level_id' => 'Le niveau doit appartenir au programme.']);
        }
        if ($actor->academicFaculties()->exists()) {
            $faculty = $program?->faculty_id ?? $level?->faculty_id;
            abort_unless($faculty && $actor->academicFaculties()->whereKey($faculty)->exists(), 403);
        }
    }

    public function create(User $actor, array $data): FinanceTariff
    {
        $this->authorize($actor, $data['level_id'] ?? null, $data['academic_program_id'] ?? null);

        return DB::transaction(function () use ($actor, $data) {
            $year = AcademicYear::lockForUpdate()->findOrFail($data['academic_year_id']);
            if (! in_array($data['currency'], config('finance.currencies'), true)) {
                throw ValidationException::withMessages(['currency' => 'Cette devise doit être explicitement configurée.']);
            }
            if (! empty($data['academic_program_id']) && ! empty($data['academic_cycle_id']) && ! AcademicProgram::whereKey($data['academic_program_id'])->where('academic_cycle_id', $data['academic_cycle_id'])->exists()) {
                throw ValidationException::withMessages(['academic_cycle_id' => 'Le cycle ne correspond pas au programme.']);
            }
            $scope = array_intersect_key($data, array_flip(['academic_year_id', 'academic_program_id', 'academic_cycle_id', 'level_id', 'category', 'kind', 'currency']));
            foreach (['academic_program_id', 'academic_cycle_id', 'level_id'] as $key) {
                $scope[$key] = isset($scope[$key]) ? (int) $scope[$key] : null;
            }
            $scope['academic_year_id'] = (int) $scope['academic_year_id'];
            ksort($scope);
            $key = hash('sha256', json_encode($scope));
            $version = $this->latestVersion($key) + 1;
            $fields = $this->tariffFields($year, $data);

            return $this->createVersion($scope + ['scope_key' => $key], $version, $fields, $actor);
        }, 3);
    }

    public function revise(FinanceTariff $tariff, User $actor, array $data): FinanceTariff
    {
        $this->authorize($actor, $tariff->level_id, $tariff->academic_program_id);

        return DB::transaction(function () use ($tariff, $actor, $data) {
            $year = AcademicYear::lockForUpdate()->findOrFail($tariff->academic_year_id);
            $tariff = FinanceTariff::lockForUpdate()->findOrFail($tariff->id);
            if (! in_array($tariff->status, ['draft', 'active'], true)) {
                throw ValidationException::withMessages(['tariff' => 'Ce barème est archivé. Ouvrez sa version active pour préparer une modification.']);
            }
            $latestVersion = $this->latestVersion($tariff->scope_key);
            if (! hash_equals($this->revision($tariff, $latestVersion), $data['revision'])) {
                throw ValidationException::withMessages(['revision' => 'Ce barème a changé depuis son ouverture. Actualisez la page avant de réessayer.']);
            }
            $fields = $this->tariffFields($year, $data, enforceAnnualDueDates: true);
            if ($tariff->status === 'draft') {
                $before = $tariff->only(array_keys($fields));
                $tariff->update($fields);
                if ($tariff->wasChanged()) {
                    Audit::record($actor->id, 'finance_tariff_updated', $tariff, $data['reason'], ['before' => $before, 'version' => $tariff->version]);
                }

                return $tariff;
            }

            $scope = $tariff->only(['academic_year_id', 'academic_program_id', 'academic_cycle_id', 'level_id', 'category', 'kind', 'currency', 'scope_key']);

            return $this->createVersion($scope, $latestVersion + 1, $fields, $actor, $tariff->id);
        }, 3);
    }

    public function revision(FinanceTariff $tariff, int $latestVersion): string
    {
        return hash('sha256', json_encode([
            $tariff->id, $tariff->status, $tariff->title, $tariff->valid_from->toDateString(),
            $tariff->valid_until?->toDateString(), $tariff->schedule, $tariff->reason,
            $tariff->status === 'active' ? $latestVersion : $tariff->version,
        ], JSON_THROW_ON_ERROR));
    }

    private function latestVersion(string $scope): int
    {
        return (int) FinanceTariff::where('scope_key', $scope)->max('version');
    }

    private function createVersion(array $scope, int $version, array $fields, User $actor, ?int $sourceId = null): FinanceTariff
    {
        $tariff = FinanceTariff::create($scope + $fields + ['version' => $version, 'status' => 'draft', 'created_by' => $actor->id]);
        $audit = $sourceId === null ? ['version' => $version] : ['version' => $version, 'source_tariff_id' => $sourceId];
        Audit::record($actor->id, 'finance_tariff_created', $tariff, $fields['reason'], $audit);

        return $tariff;
    }

    private function tariffFields(AcademicYear $year, array $data, bool $enforceAnnualDueDates = false): array
    {
        if ($data['valid_from'] < $year->start_date || ($data['valid_until'] ?? $data['valid_from']) > $year->end_date) {
            throw ValidationException::withMessages(['valid_from' => 'La validité doit appartenir à l’année académique.']);
        }
        if (empty($data['schedule']) || count($data['schedule']) > 24) {
            throw ValidationException::withMessages(['schedule' => 'Un barème comporte entre 1 et 24 échéances.']);
        }
        $schedule = collect($data['schedule'])->map(function ($row) use ($data, $year, $enforceAnnualDueDates) {
            if ($row['due_at'] < $data['valid_from'] || ($enforceAnnualDueDates && $row['due_at'] > $year->end_date)) {
                throw ValidationException::withMessages(['schedule' => 'Chaque échéance doit être datée entre le début de validité et la fin de l’année académique.']);
            }

            return ['amount_cents' => Money::cents($row['amount']), 'due_at' => $row['due_at']];
        })->sortBy('due_at')->values()->all();
        if (array_sum(array_column($schedule, 'amount_cents')) === 0) {
            throw ValidationException::withMessages(['schedule' => 'Le montant total du barème doit être positif.']);
        }

        return ['title' => $data['title'], 'valid_from' => $data['valid_from'], 'valid_until' => $data['valid_until'] ?? null, 'schedule' => $schedule, 'reason' => $data['reason']];
    }

    public function activate(FinanceTariff $tariff, User $actor, string $reason, ?int $replaceId = null, ?string $revision = null): ?array
    {
        $this->authorize($actor, $tariff->level_id, $tariff->academic_program_id);
        DB::transaction(function () use ($tariff, $actor, $reason, $replaceId, $revision) {
            AcademicYear::lockForUpdate()->findOrFail($tariff->academic_year_id);
            $tariff = FinanceTariff::lockForUpdate()->findOrFail($tariff->id);
            if ($tariff->status === 'active') {
                return;
            }
            if ($tariff->status !== 'draft') {
                throw ValidationException::withMessages(['tariff' => 'Créez une nouvelle version pour un barème archivé.']);
            }
            if ($revision !== null && ! hash_equals($this->revision($tariff, $tariff->version), $revision)) {
                throw ValidationException::withMessages(['revision' => 'Ce barème a changé depuis son ouverture. Actualisez la page avant de réessayer.']);
            }
            $overlap = FinanceTariff::where('scope_key', $tariff->scope_key)->where('status', 'active')
                ->whereDate('valid_from', '<=', $tariff->valid_until?->toDateString() ?? '9999-12-31')
                ->where(fn ($q) => $q->whereNull('valid_until')->orWhereDate('valid_until', '>=', $tariff->valid_from->toDateString()))
                ->lockForUpdate()->get();
            foreach ($overlap as $old) {
                if ($replaceId !== $old->id || $overlap->count() > 1) {
                    throw ValidationException::withMessages(['replace_id' => 'Un barème actif chevauche cette validité. Désignez explicitement la version remplacée.']);
                }
                $old->update(['status' => 'archived']);
                Audit::record($actor->id, 'finance_tariff_archived', $old, $reason, ['replacement_id' => $tariff->id]);
            }
            $tariff->update(['status' => 'active']);
            Audit::record($actor->id, 'finance_tariff_activated', $tariff, $reason);
        }, 3);

        $tariff->refresh();

        return $this->canApply($tariff) ? $this->applyTuition($tariff, $actor, $reason) : null;
    }

    public function resolve(AcademicEnrollment $entry, string $category): ?FinanceTariff
    {
        return $this->effectiveTuitionTariffs($entry, $category)->first();
    }

    private function effectiveTuitionTariffs(AcademicEnrollment $entry, string $category): Builder
    {
        return $this->effective($this->tuitionTariffs($entry, $category))
            ->orderByRaw('CASE WHEN level_id IS NULL THEN 0 ELSE 8 END + CASE WHEN academic_program_id IS NULL THEN 0 ELSE 4 END + CASE WHEN academic_cycle_id IS NULL THEN 0 ELSE 2 END DESC')->latest('version');
    }

    public function hasPendingTuition(AcademicEnrollment $entry, string $category): bool
    {
        $today = today('Africa/Kinshasa')->toDateString();

        return $this->tuitionTariffs($entry, $category)
            ->where(fn ($q) => $q->where('status', 'draft')->orWhere(fn ($q) => $q->where('status', 'active')->whereDate('valid_from', '>', $today)))
            ->where(fn ($q) => $q->whereNull('valid_until')->orWhereDate('valid_until', '>=', $today))->exists();
    }

    private function tuitionTariffs(AcademicEnrollment $entry, string $category): Builder
    {
        return $this->enrollmentTariffs($entry)->where('kind', 'tuition')->where('category', $category);
    }

    private function enrollmentTariffs(AcademicEnrollment $entry): Builder
    {
        $program = $entry->curriculumVersion?->program;

        return FinanceTariff::where('academic_year_id', $entry->academic_year_id)->where('currency', $entry->currency)
            ->where(fn ($q) => $q->whereNull('level_id')->orWhere('level_id', $entry->level_id))
            ->where(fn ($q) => $q->whereNull('academic_program_id')->orWhere('academic_program_id', $program?->id ?? -1))
            ->where(fn ($q) => $q->whereNull('academic_cycle_id')->orWhere('academic_cycle_id', $program?->academic_cycle_id ?? -1));
    }

    private function effective(Builder $query): Builder
    {
        $today = today('Africa/Kinshasa')->toDateString();

        return $query->where('status', 'active')->whereDate('valid_from', '<=', $today)
            ->where(fn ($q) => $q->whereNull('valid_until')->orWhereDate('valid_until', '>=', $today));
    }

    public function bill(FinanceTariff $tariff, AcademicEnrollment $entry, User $actor, string $reason): void
    {
        app(StudentFinanceService::class)->authorize($entry, $actor);
        $this->authorize($actor, $tariff->level_id, $tariff->academic_program_id);
        DB::transaction(function () use ($tariff, $entry, $actor, $reason) {
            $entry = AcademicEnrollment::lockForUpdate()->findOrFail($entry->id);
            app(StudentFinanceService::class)->authorize($entry, $actor);
            $tariff = FinanceTariff::lockForUpdate()->findOrFail($tariff->id);
            if ($tariff->kind === 'tuition' && $entry->fee_category !== null && $entry->fee_category !== $tariff->category) {
                throw ValidationException::withMessages(['tariff' => 'Ce barème ne correspond pas à la catégorie tarifaire du dossier. Utilisez « Établir les frais » pour la corriger avant toute facturation.']);
            }
            $this->issue($tariff, $entry, $actor->id, $reason);
        }, 3);
    }

    public function billableFor(AcademicEnrollment $entry, User $actor): Builder
    {
        $faculties = $actor->academicFaculties();

        return $this->effective($this->enrollmentTariffs($entry))
            ->when($entry->fee_category !== null, fn ($query) => $query->where(fn ($fees) => $fees->where('kind', '!=', 'tuition')->orWhere('category', $entry->fee_category)))
            ->when($faculties->exists(), fn ($query) => $query->where(fn ($scope) => $scope->whereNotNull('level_id')->orWhereNotNull('academic_program_id')));
    }

    /** Called during an authorized assessment or renewal while the enrollment is locked. */
    public function billResolvedTuition(AcademicEnrollment $entry, int $actorId, string $category, string $reason, ?User $staff = null): bool
    {
        $tariff = $this->effectiveTuitionTariffs($entry, $category)->lockForUpdate()->first();
        if (! $tariff) {
            return false;
        }
        if ($staff) {
            $this->authorize($staff, $tariff->level_id, $tariff->academic_program_id);
        }

        $this->issue($tariff, $entry, $actorId, $reason);

        return true;
    }

    public function canApply(FinanceTariff $tariff): bool
    {
        $today = today('Africa/Kinshasa')->toDateString();
        $year = $tariff->academicYear;

        return $this->supportsAutomaticTuition($tariff)
            && $year->status === 'open' && $year->start_date <= $today && $year->end_date >= $today
            && $this->isEffective($tariff, $today);
    }

    public function supportsAutomaticTuition(FinanceTariff $tariff): bool
    {
        return $tariff->kind === 'tuition' && in_array($tariff->category, self::TUITION_CATEGORIES, true);
    }

    public function applyToEligible(FinanceTariff $tariff, User $actor, string $reason): array
    {
        $this->authorize($actor, $tariff->level_id, $tariff->academic_program_id);
        if (! $this->canApply($tariff)) {
            throw ValidationException::withMessages(['tariff' => 'Le barème de scolarité doit être actif et en vigueur dans l’année ouverte en cours.']);
        }

        return $this->applyTuition($tariff, $actor, $reason);
    }

    public function applyEffectiveTuition(): void
    {
        $today = today('Africa/Kinshasa')->toDateString();
        $tariffs = FinanceTariff::where('kind', 'tuition')->whereIn('category', self::TUITION_CATEGORIES)
            ->whereHas('academicYear', fn ($year) => $year->where('status', 'open')->whereDate('start_date', '<=', $today)->whereDate('end_date', '>=', $today));

        $this->effective($tariffs)->eachById(function (FinanceTariff $tariff): void {
            $this->applyTuition($tariff, null, 'Barème annuel en vigueur appliqué aux inscriptions en attente de frais.');
        });
    }

    private function applyTuition(FinanceTariff $tariff, ?User $actor, string $reason): array
    {
        $eligible = AcademicEnrollment::query()
            ->where('academic_year_id', $tariff->academic_year_id)
            ->where('currency', $tariff->currency)->whereIn('enrollment_status', ['pending_confirmation', 'confirmed'])
            ->when($tariff->level_id, fn ($q, $level) => $q->where('level_id', $level))
            ->whereHas('application', fn ($q) => $q->where('status', 'validated'))
            ->whereHas('profile', fn ($q) => $q->where('student_status', 'active'));
        $nationalCode = Nationality::DEMOCRATIC_REPUBLIC_OF_THE_CONGO;
        $codes = $tariff->category === 'national' ? [$nationalCode] : array_diff(array_keys(Nationality::choices()), [$nationalCode]);
        $eligible->where(fn ($entry) => $entry->where('fee_category', $tariff->category)
            ->orWhere(fn ($unclassified) => $unclassified->whereNull('fee_category')
                ->whereHas('profile.user', fn ($user) => $user->whereIn('nationality_code', $codes))));
        if ($actor) {
            AcademicStaffScope::apply($eligible, $actor);
        }

        $candidates = clone $eligible;
        if ($actor === null) {
            $candidates->whereDoesntHave('obligations', fn ($fees) => $fees->where('kind', 'tuition'))
                ->whereDoesntHave('payments', fn ($payments) => $payments->where('kind', 'tuition'))
                ->whereDoesntHave('adjustments', fn ($adjustments) => $adjustments->where('fee_kind', 'tuition'));
        }

        $counts = ['applied' => 0, 'preserved' => 0];
        $candidates->select('id')->chunkById(100, function ($entries) use ($eligible, $tariff, $actor, $reason, &$counts) {
            foreach ($entries as $candidate) {
                $outcome = DB::transaction(function () use ($eligible, $candidate, $tariff, $actor, $reason) {
                    $year = AcademicYear::lockForUpdate()->findOrFail($tariff->academic_year_id);
                    $entry = (clone $eligible)->whereKey($candidate->id)->lockForUpdate()->first();
                    $current = FinanceTariff::lockForUpdate()->findOrFail($tariff->id)->setRelation('academicYear', $year);
                    if (! $entry || ! $this->canApply($current) || $this->resolve($entry, $current->category)?->id !== $current->id) {
                        return null;
                    }
                    if ($entry->obligations()->where('kind', 'tuition')->exists() || $entry->payments()->where('kind', 'tuition')->exists()
                        || $entry->adjustments()->where('fee_kind', 'tuition')->exists()) {
                        return 'preserved';
                    }

                    $this->issue($current, $entry, $actor?->id, $reason);

                    return 'applied';
                }, 3);
                if ($outcome !== null) {
                    $counts[$outcome]++;
                }
            }
        });

        return $counts;
    }

    private function isEffective(FinanceTariff $tariff, string $today): bool
    {
        return $tariff->status === 'active' && $tariff->valid_from->toDateString() <= $today
            && ($tariff->valid_until === null || $tariff->valid_until->toDateString() >= $today);
    }

    private function issue(FinanceTariff $tariff, AcademicEnrollment $entry, ?int $actorId, string $reason): void
    {
        $program = $entry->curriculumVersion?->program;
        if (! $this->isEffective($tariff, today('Africa/Kinshasa')->toDateString())
            || (int) $tariff->academic_year_id !== (int) $entry->academic_year_id || $tariff->currency !== $entry->currency
            || ($tariff->level_id && (int) $tariff->level_id !== (int) $entry->level_id)
            || ($tariff->academic_program_id && (int) $tariff->academic_program_id !== (int) $program?->id)
            || ($tariff->academic_cycle_id && (int) $tariff->academic_cycle_id !== (int) $program?->academic_cycle_id)) {
            throw ValidationException::withMessages(['tariff' => 'Le barème ne correspond pas au contexte, à la devise ou à sa validité.']);
        }
        $existing = $entry->obligations()->where('kind', $tariff->kind)->get();
        if ($existing->isNotEmpty()) {
            if ($existing->every(fn ($o) => (int) $o->finance_tariff_id === (int) $tariff->id)) {
                return;
            }
            throw ValidationException::withMessages(['tariff' => 'Des obligations existent déjà ; aucune nouvelle version ne les remplace automatiquement.']);
        }
        foreach ($tariff->schedule as $index => $row) {
            $entry->obligations()->create([
                'finance_tariff_id' => $tariff->id, 'kind' => $tariff->kind, 'title' => $tariff->title.' · Échéance '.($index + 1),
                'installment' => $index + 1, 'currency' => $tariff->currency, 'amount_cents' => $row['amount_cents'], 'due_at' => $row['due_at'],
                'source_snapshot' => $tariff->only(['id', 'version', 'title', 'category', 'currency', 'schedule']),
            ]);
        }
        if ($tariff->kind === 'tuition') {
            $entry->update(['fee_category' => $tariff->category]);
        }
        Audit::record($actorId, 'finance_tariff_billed', $entry, $reason, ['tariff_id' => $tariff->id, 'version' => $tariff->version]);
        app(StudentFinanceService::class)->confirmPendingEnrollment($entry, $actorId);
    }
}
