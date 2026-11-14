<?php

namespace App\Modules\AcademicStructure\Application\Services;

use App\Models\AcademicStructure\AcademicProgram;
use App\Models\AcademicStructure\University;
use App\Models\AcademicYear;
use App\Models\Level;
use App\Models\Student\FinanceTariff;
use App\Models\User;
use App\Modules\Student\Application\Services\FeeTariffService;
use App\Modules\Student\Application\Services\Money;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class AnnualCurriculumFees
{
    private const CATEGORIES = ['national', 'foreign'];

    public function __construct(private FeeTariffService $tariffs) {}

    public function generate(AcademicYear $year, array $levelIds, array $dueDates, User $actor): array
    {
        abort_unless($actor->hasRole('admin') && $actor->can('manage academic finance'), 403);

        return DB::transaction(function () use ($year, $levelIds, $dueDates, $actor) {
            $year = AcademicYear::lockForUpdate()->findOrFail($year->id);
            $this->validateDueDates($year, $dueDates);
            $levels = Level::whereKey($levelIds)->where('is_active', true)->with(['detail', 'faculty:id,name'])->orderBy('faculty_id')->orderBy('title')->get();
            $facultyScope = $actor->academicFaculties()->pluck('faculties.id');
            abort_if($facultyScope->isNotEmpty() && $levels->pluck('faculty_id')->diff($facultyScope)->isNotEmpty(), 403);

            return $this->report($year, $levels, $actor, $dueDates);
        }, 3);
    }

    public function validateDueDates(AcademicYear $year, array $dates): void
    {
        if ($dates[0] < $year->start_date || $dates[1] > $year->end_date || $dates[0] >= $dates[1]) {
            throw ValidationException::withMessages(['fee_due_dates' => 'Les deux échéances doivent être dans l’année académique et la deuxième doit suivre la première.']);
        }
    }

    public function view(University $institution, int $yearId, User $actor, ?AcademicProgram $program = null, ?int $level = null): array
    {
        $facultyScope = $actor->academicFaculties();
        $levels = Level::where('is_active', true)
            ->whereHas('faculty', fn ($query) => $query->where('university_id', $institution->id)->orWhereNull('university_id'))
            ->when($facultyScope->exists(), fn ($query) => $query->whereIn('faculty_id', $facultyScope->select('faculties.id')))
            ->when($program, fn ($query) => $query->whereIn('levels.id', $program->levels()->select('levels.id')))
            ->when($level, fn ($query) => $query->whereKey($level))
            ->with(['detail', 'faculty:id,name'])->orderBy('faculty_id')->orderBy('title')->get();

        return $this->report(AcademicYear::findOrFail($yearId), $levels, $actor, programId: $program?->id, levelId: $level);
    }

    private function report(AcademicYear $year, Collection $levels, User $actor, ?array $dueDates = null, ?int $programId = null, ?int $levelId = null): array
    {
        $currency = config('student.currency');
        $existing = FinanceTariff::where('academic_year_id', $year->id)->whereIn('level_id', $levels->modelKeys())
            ->whereIn('category', self::CATEGORIES)->whereIn('status', ['active', 'draft'])->where('kind', 'tuition')
            ->where('currency', $currency)->whereNull('academic_cycle_id')
            ->where(function ($query) use ($programId) {
                $query->whereNull('academic_program_id')->when($programId, fn ($scope) => $scope->orWhere('academic_program_id', $programId));
            })
            ->orderByRaw("CASE WHEN status = 'active' THEN 0 ELSE 1 END")
            ->orderByRaw('CASE WHEN academic_program_id IS NULL THEN 1 ELSE 0 END')
            ->latest('id')->get()->groupBy(fn (FinanceTariff $row) => $row->level_id.':'.$row->category);

        $rows = [];
        foreach ($levels as $level) {
            foreach (self::CATEGORIES as $category) {
                $row = [
                    'level_id' => $level->id,
                    'level' => $level->title,
                    'faculty' => $level->faculty->name,
                    'category' => $category,
                    'currency' => $currency,
                ];
                $tariff = $existing->get($level->id.':'.$category)?->first();
                if ($tariff) {
                    $rows[] = $row + $this->summary($tariff, 'existing');

                    continue;
                }

                $amounts = [$level->detail?->{"price_{$category}_first"}, $level->detail?->{"price_{$category}_second"}];
                if (in_array(null, $amounts, true) || array_sum(array_map(Money::cents(...), $amounts)) === 0) {
                    $rows[] = $row + ['status' => 'missing_amounts'];

                    continue;
                }
                if ($dueDates === null) {
                    $rows[] = $row + ['status' => 'not_generated'];

                    continue;
                }

                $tariff = $this->tariffs->create($actor, [
                    'academic_year_id' => $year->id,
                    'level_id' => $level->id,
                    'category' => $category,
                    'kind' => 'tuition',
                    'title' => 'Frais académiques · '.mb_strimwidth($level->title, 0, 125, '…').' · '.($category === 'national' ? 'Nationaux' : 'Étrangers'),
                    'currency' => $currency,
                    'valid_from' => $year->start_date,
                    'valid_until' => $year->end_date,
                    'schedule' => [
                        ['amount' => $amounts[0], 'due_at' => $dueDates[0]],
                        ['amount' => $amounts[1], 'due_at' => $dueDates[1]],
                    ],
                    'reason' => 'Génération annuelle des barèmes à partir des tranches du niveau.',
                ]);
                $rows[] = $row + $this->summary($tariff, 'created');
            }
        }

        return [
            'year_id' => $year->id,
            'url' => route('dashboard.admin.finance.tariffs.index', ['year' => $year->id, 'level' => $levelId], false),
            'rows' => $rows,
        ];
    }

    private function summary(FinanceTariff $tariff, string $status): array
    {
        return [
            'status' => $status,
            'tariff_id' => $tariff->id,
            'tariff_status' => $tariff->status,
            'schedule' => $tariff->schedule,
        ];
    }
}
