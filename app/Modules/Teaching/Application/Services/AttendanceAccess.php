<?php

namespace App\Modules\Teaching\Application\Services;

use App\Models\Professor;
use App\Models\Student\AcademicSession;
use App\Models\User;

final class AttendanceAccess
{
    public function authorize(User $actor, AcademicSession $session): void
    {
        $offer = $session->offering;
        if ($actor->hasRole('admin')) {
            TeachingScope::authorize($actor, (int) $offer->level->faculty_id);

            return;
        }
        $teacher = Professor::where('user_id', $actor->id)->where('is_active', true)->first();
        abort_unless($teacher && $this->canRead($actor, $teacher, $session), 403);
    }

    public function canRead(User $actor, Professor $teacher, AcademicSession $session): bool
    {
        $offer = $session->offering;
        if (! $actor->hasRole('professor') || ! $actor->can('manage students') || ! $session->is_published || ! $offer->is_published
            || ! in_array($teacher->id, TeachingTeam::idsAt($offer, $session->starts_at))) {
            return false;
        }

        return (int) $offer->professor_id === $teacher->id
            || $offer->assignments->contains(fn ($assignment) => (int) $assignment->professor_id === $teacher->id && $assignment->role === 'instructor'
                && ! $assignment->ends_at && (! $assignment->starts_at || $assignment->starts_at <= $session->starts_at));
    }

    public function canRecord(User $actor, AcademicSession $session): bool
    {
        return $session->is_published && ! $session->cancelled_at && $session->starts_at->lte(now())
            && ($actor->hasRole('admin') || (! $session->attendance_closed_at && $session->offering->academicYear->status === 'open'));
    }
}
