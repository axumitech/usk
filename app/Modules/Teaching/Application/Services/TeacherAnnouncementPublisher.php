<?php

namespace App\Modules\Teaching\Application\Services;

use App\Models\AcademicYear;
use App\Models\Classes;
use App\Models\Professor;
use App\Models\Student\AcademicAudit;
use App\Models\Student\AcademicOffering;
use App\Models\Student\AcademicResource;
use App\Models\User;
use App\Modules\Student\Application\Services\AcademicAccessService;
use App\Modules\Student\Application\Services\Audit;
use App\Notifications\TeacherAnnouncementNotice;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class TeacherAnnouncementPublisher
{
    private const AUDIT_ACTION = 'teacher_announcement_published';

    public function __construct(
        private LearningAccess $learning,
        private CourseAudience $audience,
        private AcademicAccessService $access,
    ) {}

    public function targets(Builder $offerings, User $actor, ?Professor $teacher): array
    {
        if (! $teacher || ! $actor->hasRole('professor') || ! $actor->can('manage courses')) {
            return [];
        }

        return $this->writable($offerings, $teacher)->with(['course', 'curriculumItem', 'level.faculty', 'group.intake'])
            ->orderBy('id')->get()->map(fn (AcademicOffering $offer) => [
                'id' => $offer->id,
                'title' => $this->courseTitle($offer),
                'level' => $offer->level->title,
                'faculty' => $offer->level->faculty?->name,
                'group' => CourseAudience::groupLabel($offer->group),
                'groups' => Classes::with('intake')->whereIn('id', $this->audience->roster($offer)
                    ->whereNotNull('class_id')->select('class_id'))->orderBy('intake_id')->orderBy('id')->get()
                    ->map(fn (Classes $group) => ['id' => $group->id, 'label' => CourseAudience::groupLabel($group)])->all(),
            ])->all();
    }

    /** @return array{announcement: AcademicResource, recipients: int} */
    public function publish(User $actor, array $input): array
    {
        abort_unless($actor->hasRole('professor') && $actor->can('manage courses'), 403);
        $offeringId = (int) $input['offering_id'];
        $groupId = isset($input['group_id']) ? (int) $input['group_id'] : null;
        $title = $input['title'];
        $body = $input['body'];
        $key = $input['operation_key'];
        $hash = hash('sha256', json_encode(['teacher_announcement', $actor->id, $offeringId, $groupId, $title, $body], JSON_THROW_ON_ERROR));

        return DB::transaction(function () use ($actor, $offeringId, $groupId, $title, $body, $key, $hash) {
            // Match the lock order used by teaching and learning changes.
            AcademicYear::orderBy('id')->lockForUpdate()->firstOrFail();
            $teacher = $this->learning->teacher($actor);
            $offer = AcademicOffering::lockForUpdate()->findOrFail($offeringId);
            abort_unless($teacher && $this->learning->instructor($offer, $teacher), 403);

            $existing = AcademicResource::where('operation_key', $key)->first();
            if ($existing) {
                if (! hash_equals((string) $existing->operation_hash, $hash)) {
                    throw ValidationException::withMessages(['operation_key' => 'Cette annonce a déjà été envoyée avec un autre contenu.']);
                }
                $audit = AcademicAudit::where('entity_type', $existing->getTable())->where('entity_id', $existing->id)
                    ->where('action', self::AUDIT_ACTION)->first();

                return ['announcement' => $existing, 'recipients' => (int) ($audit?->data['recipients'] ?? 0)];
            }

            abort_unless($this->writable(AcademicOffering::query(), $teacher)->whereKey($offer->id)->exists(), 403);
            $roster = $this->audience->roster($offer)->when($groupId !== null, fn ($query) => $query->where('class_id', $groupId));
            if ($groupId !== null && ! (clone $roster)->exists()) {
                throw ValidationException::withMessages(['group_id' => 'Choisissez un groupe inscrit à ce cours.']);
            }

            $resource = $offer->resources()->create([
                'kind' => 'announcement', 'title' => $title, 'body' => $body, 'announcement_class_id' => $groupId,
                'author_id' => $actor->id, 'disk' => 'local', 'is_published' => true, 'published_at' => now(),
                'operation_key' => $key, 'operation_hash' => $hash,
            ]);

            $delivered = [];
            $course = $this->courseTitle($offer);
            $roster->with(['profile.user', 'application', 'academicYear'])->chunkById(100, function ($entries) use ($offer, $resource, $title, $course, &$delivered): void {
                foreach ($entries as $entry) {
                    $recipient = $entry->profile->user;
                    if (isset($delivered[$recipient->id]) || ! $recipient->hasRole('student')
                        || ! $this->access->decision($entry, 'courses_view')['allowed'] || ! $this->access->offerings($entry)->whereKey($offer->id)->exists()) {
                        continue;
                    }
                    (new TeacherAnnouncementNotice($entry->id, $resource->id, $title, $course))->deliver($recipient);
                    $delivered[$recipient->id] = true;
                }
            });
            $recipients = count($delivered);
            Audit::record($actor->id, self::AUDIT_ACTION, $resource, data: [
                'offering_id' => $offer->id, 'class_id' => $groupId ?? $offer->class_id, 'recipients' => $recipients,
            ]);

            return ['announcement' => $resource, 'recipients' => $recipients];
        }, 3);
    }

    private function writable(Builder $offerings, Professor $teacher): Builder
    {
        return $offerings->where('is_published', true)->whereNull('archived_at')
            ->whereHas('academicYear', fn ($year) => $year->where('status', 'open'))
            ->where(fn ($query) => $query->where('professor_id', $teacher->id)
                ->orWhereHas('assignments', fn ($assignments) => $assignments->where('professor_id', $teacher->id)
                    ->where('role', 'instructor')->whereNull('ends_at')));
    }

    private function courseTitle(AcademicOffering $offer): string
    {
        return $offer->curriculumItem?->name ?? $offer->course->title;
    }
}
