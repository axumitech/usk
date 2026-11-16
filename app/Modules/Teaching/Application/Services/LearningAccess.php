<?php

namespace App\Modules\Teaching\Application\Services;

use App\Models\Professor;
use App\Models\Student\AcademicOffering;
use App\Models\Student\AcademicResource;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

final class LearningAccess
{
    public function teacher(User $actor): ?Professor
    {
        return Professor::where('user_id', $actor->id)->where('is_active', true)->first();
    }

    public function teacherOfferings(Professor $teacher): Builder
    {
        return AcademicOffering::where(fn ($q) => $q->where('professor_id', $teacher->id)
            ->orWhere('assistant_professor_id', $teacher->id)
            ->orWhereHas('assignments', fn ($a) => $a->where('professor_id', $teacher->id)->whereNull('ends_at')));
    }

    public function instructor(AcademicOffering $offer, Professor $teacher): bool
    {
        return (int) $offer->professor_id === $teacher->id || $offer->assignments()
            ->where('professor_id', $teacher->id)->where('role', 'instructor')->whereNull('ends_at')->exists();
    }

    public function scope(User $actor): Builder
    {
        if ($actor->hasRole('admin') && $actor->can('publish academic content')) {
            return TeachingScope::offerings($actor);
        }
        $teacher = $this->teacher($actor);
        abort_unless($actor->hasRole('professor') && $teacher, 403);

        return $this->teacherOfferings($teacher);
    }

    public function read(User $actor, AcademicOffering $offer): void
    {
        abort_unless($this->scope($actor)->whereKey($offer->id)->exists(), 403);
    }

    public function canManage(User $actor, AcademicOffering $offer): bool
    {
        if ($actor->hasRole('admin')) {
            return ! $offer->archived_at && $actor->can('publish academic content') && TeachingScope::allows($actor, (int) $offer->level->faculty_id)
                && in_array($offer->academicYear->status, ['draft', 'open'], true);
        }

        return $this->teacherManagementRestriction($actor, $offer, $this->teacher($actor)) === null;
    }

    public function teacherManagementRestriction(User $actor, AcademicOffering $offer, ?Professor $teacher): ?string
    {
        return match (true) {
            (bool) $offer->archived_at => 'archived_course',
            ! $teacher || ! $actor->hasRole('professor') || ! $actor->can('manage courses') => 'permission_required',
            ! $this->instructor($offer, $teacher) => 'assistant_assignment',
            $offer->academicYear->status === 'draft' => 'academic_year_draft',
            $offer->academicYear->status === 'closed' => 'academic_year_closed',
            $offer->academicYear->status !== 'open' => 'academic_year_not_open',
            default => null,
        };
    }

    public function content(User $actor, AcademicResource $resource): void
    {
        $this->read($actor, $resource->offering);
        abort_unless($resource->student_profile_id === null && in_array($resource->kind, AcademicResource::CONTENT_KINDS, true), 404);
        if (! $actor->hasRole('admin') && ! $this->canManage($actor, $resource->offering)) {
            abort_unless(AcademicResource::visible()->whereKey($resource->id)->exists(), 404);
        }
    }

    public static function fileFeature(AcademicResource $resource): string
    {
        return match ($resource->kind) {
            'material', 'syllabus', 'audio' => 'materials_download',
            'evaluation' => 'evaluations_participate',
            'result' => 'results_view',
            'document' => 'documents_request',
            default => 'courses_view',
        };
    }

    public static function parentFeature(AcademicResource $resource): ?string
    {
        return match ($resource->supplementaryFor?->kind) {
            'assignment' => 'assignments_submit',
            'evaluation' => 'evaluations_participate',
            default => null,
        };
    }
}
