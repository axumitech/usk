<?php

namespace App\Modules\Enrollment\Infrastructure\Persistence;

use App\Models\Enrollment;
use App\Modules\Enrollment\Domain\Enums\EnrollmentStatus;
use App\Modules\Enrollment\Domain\Exceptions\EnrollmentNotFoundException;
use App\Modules\Enrollment\Domain\Repositories\EnrollmentRepositoryInterface;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class EloquentEnrollmentRepository implements EnrollmentRepositoryInterface
{
    public function findById(int $id): ?Enrollment
    {
        return Enrollment::find($id);
    }

    public function findByUuid(string $uuid): ?Enrollment
    {
        return Enrollment::where('uuid', $uuid)->first();
    }

    public function findByIdOrFail(int $id): Enrollment
    {
        $enrollment = $this->findById($id);

        if (! $enrollment) {
            throw EnrollmentNotFoundException::withId($id);
        }

        return $enrollment;
    }

    public function findByUuidOrFail(string $uuid): Enrollment
    {
        $enrollment = $this->findByUuid($uuid);

        if (! $enrollment) {
            throw EnrollmentNotFoundException::withUuid($uuid);
        }

        return $enrollment;
    }

    public function findDraftForStudent(int $studentId): ?Enrollment
    {
        return Enrollment::where('student_id', $studentId)
            ->where('status', EnrollmentStatus::DRAFT->value)
            ->where(function ($query) {
                $query->whereNull('draft_expires_at')
                    ->orWhere('draft_expires_at', '>', Carbon::now());
            })
            ->latest()
            ->first();
    }

    public function findDraftForContext(int $studentId, ?int $levelId, ?int $yearId, ?int $programId, ?int $facultyId = null): ?Enrollment
    {
        return Enrollment::forStudent($studentId)->drafts()
            ->where('level_id', $levelId)->where('academic_year_id', $yearId)
            ->where(fn ($query) => $this->sameProgram($query, $programId))
            ->when($levelId === null, fn ($query) => $query->where(function ($query) use ($facultyId) {
                $field = 'form_snapshot->faculty_id';
                if ($facultyId === null) {
                    $query->whereNull($field)->orWhere($field, '');
                } else {
                    $query->whereJsonContains($field, $facultyId)->orWhereJsonContains($field, (string) $facultyId);
                }
            }))
            ->where(fn ($query) => $query->whereNull('draft_expires_at')->orWhere('draft_expires_at', '>', now()))
            ->latest('id')->lockForUpdate()->first();
    }

    public function findByStudent(int $studentId, ?EnrollmentStatus $status = null): Collection
    {
        $query = Enrollment::where('student_id', $studentId);

        if ($status) {
            $query->where('status', $status->value);
        }

        return $query->orderBy('created_at', 'desc')->get();
    }

    public function save(Enrollment $enrollment): Enrollment
    {
        $enrollment->save();

        return $enrollment->fresh();
    }

    public function delete(Enrollment $enrollment): bool
    {
        return $enrollment->delete();
    }

    public function generateMatricule(int $levelId, int $yearId): string
    {
        $last = Enrollment::where('level_id', $levelId)
            ->where('academic_year_id', $yearId)
            ->whereNotNull('matricule')
            ->orderBy('matricule', 'desc')
            ->value('matricule');

        return $last ?? '';
    }

    public function existsMatricule(string $matricule): bool
    {
        return Enrollment::where('matricule', $matricule)->exists();
    }

    public function getExpiredDrafts(): Collection
    {
        return Enrollment::where('status', EnrollmentStatus::DRAFT->value)
            ->where('draft_expires_at', '<', Carbon::now())
            ->get();
    }

    public function checkUniqueness(int $studentId, int $levelId, int $yearId, ?int $programId, ?int $excludeId = null): bool
    {
        $query = Enrollment::where('student_id', $studentId)
            ->where('level_id', $levelId)
            ->where('academic_year_id', $yearId)
            ->where('status', '!=', EnrollmentStatus::CANCELLED->value)
            ->where(fn ($q) => $q->where('status', '!=', EnrollmentStatus::DRAFT->value)
                ->orWhereNull('draft_expires_at')->orWhere('draft_expires_at', '>', now()));

        if ($excludeId) {
            $query->where('id', '!=', $excludeId);
        }

        if ($programId !== null) {
            $query->where(fn ($program) => $program->where(fn ($match) => $this->sameProgram($match, $programId))
                // An already filed legacy application without a program cannot be assigned to a different program by inference.
                ->orWhere(fn ($legacy) => $legacy->where('status', '!=', EnrollmentStatus::DRAFT->value)
                    ->where(fn ($missing) => $this->sameProgram($missing, null))));
        }

        return $query->exists();
    }

    private function sameProgram(Builder $query, ?int $programId): void
    {
        $field = 'form_snapshot->academic_program_id';
        if ($programId === null) {
            $query->whereNull($field)->orWhere($field, '');

            return;
        }

        // Drafts and applications created before normalization may contain a string identifier.
        $query->whereJsonContains($field, $programId)->orWhereJsonContains($field, (string) $programId);
    }
}
