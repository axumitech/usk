<?php

namespace App\Modules\Student\Application\Services;

use App\Models\AcademicStructure\AcademicProgram;
use App\Models\AcademicYear;
use App\Models\Level;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\FinanceTariff;
use App\Models\User;
use App\Modules\AcademicStructure\Application\Services\CurriculumService;
use App\Modules\Identity\Domain\Nationality;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class FeeTariffService
{
    private const TUITION_CATEGORIES = ['national', 'foreign'];

    public function authorize(User $actor, ?int $levelId, ?int $programId, ?int $facultyId = null): void
    {
        abort_unless($actor->hasRole('admin') && $actor->can('manage academic finance'), 403);
        $level = $levelId ? Level::findOrFail($levelId) : null;
        $program = $programId ? AcademicProgram::findOrFail($programId) : null;
        if ($level && $program && ! $program->levels()->whereKey($level->id)->exists()) {
            throw ValidationException::withMessages(['level_id' => 'Le niveau doit appartenir au programme.']);
        }
        if ($actor->academicFaculties()->exists()) {
            $faculty = $facultyId ?? $program?->faculty_id ?? $level?->faculty_id;
            abort_unless($faculty && $actor->academicFaculties()->whereKey($faculty)->exists(), 403);
        }
    }

    public function create(User $actor, array $data): FinanceTariff
    {
        $automatic = (bool) ($data['automatic'] ?? false);
        if ($automatic) {
            if ($data['category'] !== 'all' || in_array($data['kind'], ['tuition', 'unallocated'], true)) {
                throw ValidationException::withMessages(['kind' => 'Choisissez un code de frais complémentaires et la catégorie « Tous les étudiants ».']);
            }
            if (isset($data['academic_program_id']) || isset($data['academic_cycle_id']) || isset($data['faculty_id'], $data['level_id'])) {
                throw ValidationException::withMessages(['faculty_id' => 'Choisissez un seul périmètre : université, faculté ou niveau.']);
            }
            $scope = isset($data['level_id']) ? 'level' : (isset($data['faculty_id']) ? 'faculty' : 'university');
            if (isset($data['fee_scope']) && $data['fee_scope'] !== $scope) {
                throw ValidationException::withMessages(['fee_scope' => 'Renseignez le niveau ou la faculté correspondant au périmètre choisi.']);
            }
        } elseif (isset($data['faculty_id'])) {
            throw ValidationException::withMessages(['faculty_id' => 'Le ciblage par faculté s’applique aux frais complémentaires automatiques.']);
        }
        $this->authorize($actor, $data['level_id'] ?? null, $data['academic_program_id'] ?? null, $data['faculty_id'] ?? null);

        return DB::transaction(function () use ($actor, $data, $automatic) {
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
            if ($automatic) {
                $scope['automatic'] = true;
                $scope['faculty_id'] = isset($data['faculty_id']) ? (int) $data['faculty_id'] : null;
            }
            ksort($scope);
            $key = hash('sha256', json_encode($scope));
            $version = $this->latestVersion($key) + 1;
            $fields = $this->tariffFields($year, $data, enforceAnnualDueDates: $automatic, allowUndated: $automatic);

            return $this->createVersion($scope + ['scope_key' => $key], $version, $fields, $actor);
        }, 3);
    }

    public function revise(FinanceTariff $tariff, User $actor, array $data): FinanceTariff
    {
        $this->authorize($actor, $tariff->level_id, $tariff->academic_program_id, $tariff->faculty_id);

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
            $fields = $this->tariffFields($year, $data, enforceAnnualDueDates: true, allowUndated: $tariff->automatic);
            if ($tariff->status === 'draft') {
                $before = $tariff->only(array_keys($fields));
                $tariff->update($fields);
                if ($tariff->wasChanged()) {
                    Audit::record($actor->id, 'finance_tariff_updated', $tariff, $data['reason'], ['before' => $before, 'version' => $tariff->version]);
                }

                return $tariff;
            }

            $scope = $tariff->only(['academic_year_id', 'academic_program_id', 'academic_cycle_id', 'level_id', 'faculty_id', 'automatic', 'category', 'kind', 'currency', 'scope_key']);

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

    private function tariffFields(AcademicYear $year, array $data, bool $enforceAnnualDueDates = false, bool $allowUndated = false): array
    {
        if ($data['valid_from'] < $year->start_date || ($data['valid_until'] ?? $data['valid_from']) > $year->end_date) {
            throw ValidationException::withMessages(['valid_from' => 'La validité doit appartenir à l’année académique.']);
        }
        if (empty($data['schedule']) || count($data['schedule']) > 24) {
            throw ValidationException::withMessages(['schedule' => 'Un barème comporte entre 1 et 24 échéances.']);
        }
        $schedule = collect($data['schedule'])->map(function ($row) use ($data, $year, $enforceAnnualDueDates, $allowUndated) {
            $dueAt = ($row['due_at'] ?? '') === '' ? null : $row['due_at'];
            if ($dueAt === null && ! $allowUndated) {
                throw ValidationException::withMessages(['schedule' => 'Indiquez une date limite pour chaque échéance.']);
            }
            if ($dueAt !== null && ($dueAt < $data['valid_from'] || ($enforceAnnualDueDates && $dueAt > $year->end_date))) {
                throw ValidationException::withMessages(['schedule' => 'Chaque échéance doit être datée entre le début de validité et la fin de l’année académique.']);
            }

            return ['amount_cents' => Money::cents($row['amount']), 'due_at' => $dueAt];
        })->sortBy(fn ($row) => $row['due_at'] ?? '9999-12-31')->values()->all();
        if (array_sum(array_column($schedule, 'amount_cents')) === 0) {
            throw ValidationException::withMessages(['schedule' => 'Le montant total du barème doit être positif.']);
        }

        return ['title' => $data['title'], 'valid_from' => $data['valid_from'], 'valid_until' => $data['valid_until'] ?? null, 'schedule' => $schedule, 'reason' => $data['reason']];
    }

    public function activate(FinanceTariff $tariff, User $actor, string $reason, ?int $replaceId = null, ?string $revision = null): ?array
    {
        $this->authorize($actor, $tariff->level_id, $tariff->academic_program_id, $tariff->faculty_id);
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

        return $this->canApply($tariff) ? $this->applyTariffToEnrollments($tariff, $actor, $reason) : null;
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
        $program = $this->program($entry);

        return $this->tariffsInEnrollmentScope($entry)
            ->where(fn ($q) => $q->whereNull('academic_program_id')->orWhere('academic_program_id', $program?->id ?? -1))
            ->where(fn ($q) => $q->whereNull('academic_cycle_id')->orWhere('academic_cycle_id', $program?->academic_cycle_id ?? -1));
    }

    private function tariffsInEnrollmentScope(AcademicEnrollment $entry): Builder
    {
        return FinanceTariff::where('academic_year_id', $entry->academic_year_id)->where('currency', $entry->currency)
            ->where(fn ($query) => $query->whereNull('level_id')->orWhere('level_id', $entry->level_id))
            ->where(fn ($query) => $query->whereNull('faculty_id')->orWhere('faculty_id', $entry->level->faculty_id));
    }

    private function effectiveAncillaryTariffs(AcademicEnrollment $entry): Builder
    {
        return $this->effective($this->tariffsInEnrollmentScope($entry)->where('automatic', true)->where('category', 'all'))
            ->orderByRaw('CASE WHEN level_id IS NOT NULL THEN 2 WHEN faculty_id IS NOT NULL THEN 1 ELSE 0 END DESC')
            ->latest('version')->latest('id');
    }

    private function program(AcademicEnrollment $entry): ?AcademicProgram
    {
        if ($program = $entry->curriculumVersion?->program) {
            return $program;
        }

        $programId = app(CurriculumService::class)->enrollmentProgram($entry);

        return $programId === null ? null : AcademicProgram::find($programId);
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
        $this->authorize($actor, $tariff->level_id, $tariff->academic_program_id, $tariff->faculty_id);
        DB::transaction(function () use ($tariff, $entry, $actor, $reason) {
            $year = $tariff->automatic ? AcademicYear::lockForUpdate()->findOrFail($entry->academic_year_id) : null;
            $entry = AcademicEnrollment::lockForUpdate()->findOrFail($entry->id);
            app(StudentFinanceService::class)->authorize($entry, $actor);
            $tariff = FinanceTariff::lockForUpdate()->findOrFail($tariff->id);
            if ($year) {
                $entry->setRelation('academicYear', $year);
                if (! $this->canBillEnrollment($entry) || (int) $this->effectiveAncillaryTariffs($entry)->where('kind', $tariff->kind)->value('id') !== $tariff->id
                    || $this->hasTransferredFeeHistory($entry, $tariff->kind)) {
                    throw ValidationException::withMessages(['tariff' => 'Ce barème complémentaire ne peut pas être appliqué à cette inscription.']);
                }
            }
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
            ->when($faculties->exists(), fn ($query) => $query->where(fn ($scope) => $scope->whereNotNull('level_id')->orWhereNotNull('academic_program_id')->orWhereNotNull('faculty_id')));
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

        return $this->supportsAutomaticBilling($tariff)
            && $year->status === 'open' && $year->start_date <= $today && $year->end_date >= $today
            && $this->isEffective($tariff, $today);
    }

    private function supportsAutomaticTuition(FinanceTariff $tariff): bool
    {
        return $tariff->kind === 'tuition' && in_array($tariff->category, self::TUITION_CATEGORIES, true);
    }

    public function supportsAutomaticBilling(FinanceTariff $tariff): bool
    {
        return $tariff->automatic || $this->supportsAutomaticTuition($tariff);
    }

    public function applyToEligible(FinanceTariff $tariff, User $actor, string $reason): array
    {
        $this->authorize($actor, $tariff->level_id, $tariff->academic_program_id, $tariff->faculty_id);
        if (! $this->canApply($tariff)) {
            throw ValidationException::withMessages(['tariff' => 'Le barème doit être actif et en vigueur dans l’année ouverte en cours.']);
        }

        return $this->applyTariffToEnrollments($tariff, $actor, $reason);
    }

    public function applyEffectiveTuition(): void
    {
        $this->currentTariffs()->where('kind', 'tuition')->whereIn('category', self::TUITION_CATEGORIES)->eachById(function (FinanceTariff $tariff): void {
            $this->applyTariffToEnrollments($tariff, null, 'Barème annuel en vigueur appliqué aux inscriptions en attente de frais.');
        });
    }

    public function applyEffectiveAncillaryFees(): void
    {
        $this->currentTariffs()->where('automatic', true)->eachById(function (FinanceTariff $tariff): void {
            $this->applyTariffToEnrollments($tariff, null, 'Barème complémentaire en vigueur appliqué aux inscriptions éligibles.');
        });
    }

    private function currentTariffs(): Builder
    {
        $today = today('Africa/Kinshasa')->toDateString();

        return $this->effective(FinanceTariff::whereHas('academicYear', fn ($year) => $year->where('status', 'open')
            ->whereDate('start_date', '<=', $today)->whereDate('end_date', '>=', $today)));
    }

    public function applyToEnrollment(AcademicEnrollment $entry, ?int $actorId = null): bool
    {
        $tuitionApplied = $this->applyTuitionToEnrollment($entry, $actorId);
        $ancillaryApplied = $this->applyAncillaryToEnrollment($entry, $actorId);

        return $tuitionApplied || $ancillaryApplied;
    }

    private function applyTuitionToEnrollment(AcademicEnrollment $entry, ?int $actorId): bool
    {
        if (! $this->canBillEnrollment($entry) || $this->hasFeeHistory($entry, 'tuition')) {
            return false;
        }
        $category = $this->category($entry);
        if (! in_array($category, self::TUITION_CATEGORIES, true) || ! $this->resolve($entry, $category)) {
            return false;
        }

        return DB::transaction(function () use ($entry, $actorId) {
            $year = AcademicYear::lockForUpdate()->findOrFail($entry->academic_year_id);
            $entry = AcademicEnrollment::lockForUpdate()->findOrFail($entry->id)->setRelation('academicYear', $year);
            if (! $this->canBillEnrollment($entry) || $this->hasFeeHistory($entry, 'tuition') || $this->hasTransferredFeeHistory($entry, 'tuition')) {
                return false;
            }
            $category = $this->category($entry);
            if (! in_array($category, self::TUITION_CATEGORIES, true)) {
                return false;
            }
            $tariff = $this->effectiveTuitionTariffs($entry, $category)->lockForUpdate()->first();
            if (! $tariff) {
                return false;
            }

            $this->issue($tariff, $entry, $actorId, 'Barème de scolarité en vigueur appliqué automatiquement à l’inscription.');

            return true;
        }, 3);
    }

    private function applyAncillaryToEnrollment(AcademicEnrollment $entry, ?int $actorId): bool
    {
        if (! $this->canBillEnrollment($entry)
            || ! $this->effectiveAncillaryTariffs($entry)->whereNotIn('kind', $entry->obligations()->select('kind'))->exists()) {
            return false;
        }

        return DB::transaction(function () use ($entry, $actorId) {
            $year = AcademicYear::lockForUpdate()->findOrFail($entry->academic_year_id);
            $entry = AcademicEnrollment::lockForUpdate()->findOrFail($entry->id)->setRelation('academicYear', $year);
            if (! $this->canBillEnrollment($entry)) {
                return false;
            }

            $applied = false;
            foreach ($this->effectiveAncillaryTariffs($entry)->lockForUpdate()->get()->unique('kind') as $tariff) {
                if ($this->hasFeeHistory($entry, $tariff->kind) || $this->hasTransferredFeeHistory($entry, $tariff->kind)) {
                    continue;
                }
                $this->issue($tariff, $entry, $actorId, 'Barème complémentaire en vigueur appliqué automatiquement à l’inscription.');
                $applied = true;
            }

            return $applied;
        }, 3);
    }

    private function canBillEnrollment(AcademicEnrollment $entry): bool
    {
        $year = $entry->academicYear;
        $today = today('Africa/Kinshasa')->toDateString();

        return $year->status === 'open' && $year->start_date <= $today && $year->end_date >= $today
            && in_array($entry->enrollment_status, ['pending_confirmation', 'confirmed'], true)
            && $entry->profile->student_status === 'active' && $entry->application?->status?->value === 'validated';
    }

    private function category(AcademicEnrollment $entry): ?string
    {
        return $entry->fee_category ?? $entry->profile->user->feeCategoryFromNationality();
    }

    private function hasFeeHistory(AcademicEnrollment $entry, string $kind): bool
    {
        return $entry->obligations()->where('kind', $kind)->exists()
            || $entry->payments()->where('kind', $kind)->exists()
            || $entry->adjustments()->where('fee_kind', $kind)->exists();
    }

    private function hasTransferredFeeHistory(AcademicEnrollment $entry, string $kind): bool
    {
        return AcademicEnrollment::where('student_profile_id', $entry->student_profile_id)
            ->where('academic_year_id', $entry->academic_year_id)
            ->where('application_id', $entry->application_id)
            ->where('enrollment_status', 'transferred')
            ->where(fn ($history) => $history->whereHas('obligations', fn ($fees) => $fees->where('kind', $kind))
                ->orWhereHas('payments', fn ($payments) => $payments->where('kind', $kind))
                ->orWhereHas('adjustments', fn ($adjustments) => $adjustments->where('fee_kind', $kind)))
            ->exists();
    }

    private function applyTariffToEnrollments(FinanceTariff $tariff, ?User $actor, string $reason): array
    {
        $eligible = AcademicEnrollment::query()
            ->where('academic_year_id', $tariff->academic_year_id)
            ->where('currency', $tariff->currency)->whereIn('enrollment_status', ['pending_confirmation', 'confirmed'])
            ->when($tariff->level_id, fn ($q, $level) => $q->where('level_id', $level))
            ->when($tariff->faculty_id, fn ($q, $faculty) => $q->whereHas('level', fn ($level) => $level->where('faculty_id', $faculty)))
            ->whereHas('application', fn ($q) => $q->where('status', 'validated'))
            ->whereHas('profile', fn ($q) => $q->where('student_status', 'active'));
        if ($this->supportsAutomaticTuition($tariff)) {
            $nationalCode = Nationality::DEMOCRATIC_REPUBLIC_OF_THE_CONGO;
            $codes = $tariff->category === 'national' ? [$nationalCode] : array_diff(array_keys(Nationality::choices()), [$nationalCode]);
            $eligible->where(fn ($entry) => $entry->where('fee_category', $tariff->category)
                ->orWhere(fn ($unclassified) => $unclassified->whereNull('fee_category')
                    ->whereHas('profile.user', fn ($user) => $user->whereIn('nationality_code', $codes))));
        }
        if ($actor) {
            AcademicStaffScope::apply($eligible, $actor);
        }

        $candidates = clone $eligible;
        if ($actor === null) {
            $candidates->whereDoesntHave('obligations', fn ($fees) => $fees->where('kind', $tariff->kind))
                ->whereDoesntHave('payments', fn ($payments) => $payments->where('kind', $tariff->kind))
                ->whereDoesntHave('adjustments', fn ($adjustments) => $adjustments->where('fee_kind', $tariff->kind));
        }

        $counts = ['applied' => 0, 'preserved' => 0];
        $candidates->select('id')->chunkById(100, function ($entries) use ($eligible, $tariff, $actor, $reason, &$counts) {
            foreach ($entries as $candidate) {
                $outcome = DB::transaction(function () use ($eligible, $candidate, $tariff, $actor, $reason) {
                    $year = AcademicYear::lockForUpdate()->findOrFail($tariff->academic_year_id);
                    $entry = (clone $eligible)->whereKey($candidate->id)->lockForUpdate()->first();
                    $current = FinanceTariff::lockForUpdate()->findOrFail($tariff->id)->setRelation('academicYear', $year);
                    if (! $entry || ! $this->canApply($current)) {
                        return null;
                    }
                    $selectedId = $current->automatic
                        ? (int) $this->effectiveAncillaryTariffs($entry)->where('kind', $current->kind)->value('id')
                        : $this->resolve($entry, $current->category)?->id;
                    if ($selectedId !== $current->id) {
                        return null;
                    }
                    if ($this->hasFeeHistory($entry, $current->kind) || $this->hasTransferredFeeHistory($entry, $current->kind)) {
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
        $program = $tariff->academic_program_id || $tariff->academic_cycle_id ? $this->program($entry) : null;
        if (! $this->isEffective($tariff, today('Africa/Kinshasa')->toDateString())
            || (int) $tariff->academic_year_id !== (int) $entry->academic_year_id || $tariff->currency !== $entry->currency
            || ($tariff->level_id && (int) $tariff->level_id !== (int) $entry->level_id)
            || ($tariff->faculty_id && (int) $tariff->faculty_id !== (int) $entry->level->faculty_id)
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
        $schedule = $tariff->schedule;
        foreach ($schedule as $index => $row) {
            $dueAt = $row['due_at'] ?? null;
            $title = match (true) {
                $dueAt !== null => $tariff->title.' · Échéance '.($index + 1),
                count($schedule) > 1 => $tariff->title.' · Ligne '.($index + 1),
                default => $tariff->title,
            };
            $entry->obligations()->create([
                'finance_tariff_id' => $tariff->id, 'kind' => $tariff->kind, 'title' => $title,
                'installment' => $index + 1, 'currency' => $tariff->currency, 'amount_cents' => $row['amount_cents'], 'due_at' => $dueAt,
                'source_snapshot' => $tariff->only(['id', 'version', 'title', 'category', 'currency', 'schedule']),
            ]);
        }
        if ($tariff->kind === 'tuition') {
            $entry->update(['fee_category' => $tariff->category]);
        }
        Audit::record($actorId, 'finance_tariff_billed', $entry, $reason, ['tariff_id' => $tariff->id, 'version' => $tariff->version]);
        if (! $tariff->automatic) {
            app(StudentFinanceService::class)->confirmPendingEnrollment($entry, $actorId);
        }
    }
}
