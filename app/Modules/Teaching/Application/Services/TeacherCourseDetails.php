<?php

namespace App\Modules\Teaching\Application\Services;

use App\Models\Classes;
use App\Models\Professor;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicOffering;
use App\Models\Student\AcademicResource;
use App\Models\Student\AcademicSession;
use App\Models\Student\ContentSection;
use App\Models\User;
use App\Modules\Assessment\Application\AssessmentAccess;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Pagination\LengthAwarePaginator;

final class TeacherCourseDetails
{
    public function __construct(
        private CourseAudience $audience,
        private LearningAccess $learning,
        private AssessmentAccess $assessments,
        private AttendanceAccess $attendance,
        private TeacherCourseOverview $overview,
        private TeacherCourseGradebook $gradebook,
    ) {}

    public function read(User $actor, Professor $teacher, AcademicOffering $offering, array $input, bool $canPublish, array $period): array
    {
        $tab = $input['tab'] ?? 'overview';
        $canSeeStudents = $actor->can('manage students') && $this->learning->instructor($offering, $teacher);
        $canSeeAssessments = $actor->can('manage courses') && $this->assessments->scope($actor)->whereKey($offering->id)->exists();
        if (($tab === 'students' && ! $canSeeStudents) || (in_array($tab, ['assessments', 'grades'], true) && ! $canSeeAssessments)) {
            $tab = 'overview';
        }
        $parameters = ['offering' => $offering->id];

        return [
            'courseTab' => $tab, 'canSeeCourseStudents' => $canSeeStudents, 'canSeeCourseAssessments' => $canSeeAssessments,
            'canSeeCourseGrades' => $canSeeAssessments,
            'courseOverview' => $tab === 'overview' ? $this->overview->read($offering, $canPublish, $period) : null,
            'gradebook' => $tab === 'grades' ? $this->gradebook->read($offering, $period, $canSeeStudents) : null,
            'courseLinks' => [
                'assessments' => $canSeeAssessments ? route('dashboard.teaching.assessments.index', $parameters, false) : null,
                'resources' => route('dashboard.teaching.learning.index', $parameters, false),
            ],
            'sessions' => $tab === 'sessions' ? $this->sessions($offering, $actor, $teacher) : null,
            'assessments' => $tab === 'assessments' ? $this->assessments($offering) : null,
        ] + match ($tab) {
            'students' => $this->students($offering, $input['group'] ?? null, trim($input['q'] ?? '')),
            'resources' => $this->resources($offering, $canPublish, $input['section'] ?? null),
            default => [],
        };
    }

    public function cardCounts(User $actor, Collection $offerings): array
    {
        if ($offerings->isEmpty()) {
            return [];
        }

        $ids = $offerings->modelKeys();
        $editableIds = $offerings->filter(fn (AcademicOffering $offering) => $this->learning->canManage($actor, $offering))->modelKeys();
        $supports = $this->supportQuery()->whereIn('academic_offering_id', $ids)
            ->where(fn (Builder $query) => $query->visible()->orWhereIn('academic_offering_id', $editableIds))
            ->selectRaw('academic_offering_id, COUNT(*) as total')->groupBy('academic_offering_id')->pluck('total', 'academic_offering_id');
        $assessableIds = $actor->can('manage courses') ? $this->assessments->scope($actor)->whereKey($ids)->pluck('id') : collect();
        $assessments = $assessableIds->isNotEmpty() ? $this->assessmentQuery()->whereIn('academic_offering_id', $assessableIds)
            ->selectRaw('academic_offering_id, COUNT(*) as total')->groupBy('academic_offering_id')->pluck('total', 'academic_offering_id') : collect();
        $assessable = $assessableIds->flip();

        return $offerings->mapWithKeys(fn (AcademicOffering $offering) => [$offering->id => [
            'resources_count' => (int) $supports->get($offering->id, 0),
            'assessments_count' => $assessable->has($offering->id) ? (int) $assessments->get($offering->id, 0) : null,
        ]])->all();
    }

    private function students(AcademicOffering $offering, ?string $filter, string $search): array
    {
        $roster = $this->audience->roster($offering);
        $totals = (clone $roster)->selectRaw('class_id, COUNT(DISTINCT student_profile_id) as total')->groupBy('class_id')->get();
        $groups = Classes::with('intake:id,name')->whereIn('id', $totals->pluck('class_id')->filter())->get()->keyBy('id');
        $selection = $filter === null || $filter === 'unassigned' ? $filter : (int) $filter;
        abort_if(is_int($selection) && ! $groups->has($selection), 404);

        $labels = $groups->map(fn (Classes $group) => CourseAudience::groupLabel($group));
        $frequencies = $labels->countBy();
        $labels = $labels->map(fn ($label, $id) => $frequencies[$label] > 1 ? "$label · Groupe #$id" : $label);
        $options = $totals->map(fn ($row) => [
            'id' => $row->class_id === null ? null : (int) $row->class_id,
            'label' => $labels->get($row->class_id) ?? 'Sans groupe',
            'count' => (int) $row->total,
        ])->sortBy([['label', 'asc'], ['id', 'asc']])->values()->all();
        $roster->when($selection === 'unassigned', fn ($query) => $query->whereNull('class_id'))
            ->when(is_int($selection), fn ($query) => $query->where('class_id', $selection));
        $students = TeacherCourseRosterSearch::apply($roster, $search)->with('profile.user')->orderByRaw('CASE WHEN class_id IS NULL THEN 1 ELSE 0 END')
            ->orderBy('class_id')->orderBy('matricule')->orderBy('id')->paginate(20, ['*'], 'students_page')->withQueryString()
            ->through(fn (AcademicEnrollment $entry) => CourseAudience::studentRow($entry) + [
                'group' => $labels->get($entry->class_id) ?? 'Sans groupe',
                'group_id' => $entry->class_id === null ? null : (int) $entry->class_id,
            ]);

        return ['studentGroups' => $options, 'studentGroup' => $selection, 'studentSearch' => $search, 'students' => $students];
    }

    private function sessions(AcademicOffering $offering, User $actor, Professor $teacher): LengthAwarePaginator
    {
        $rows = $offering->sessions()->where('is_published', true)
            ->with(['successor:id,replaces_session_id,starts_at,room', 'registeredRoom:id,name,building'])
            ->orderByDesc('starts_at')->orderByDesc('id')->paginate(15, ['id', 'replaces_session_id', 'starts_at', 'ends_at',
                'room', 'academic_room_id', 'activity_type', 'is_published', 'cancelled_at'], 'sessions_page')->withQueryString();

        return $rows->through(function (AcademicSession $session) use ($offering, $actor, $teacher) {
            $session->setRelation('offering', $offering);
            $room = $session->room ?: $session->registeredRoom?->name;
            $location = collect([$session->registeredRoom?->building, $room])->filter()->unique()->join(' · ');

            return $session->only(['id', 'starts_at', 'ends_at', 'activity_type', 'is_published', 'cancelled_at', 'successor']) + [
                'room' => $room, 'location' => $location ?: null,
                'status' => $session->cancelled_at ? ($session->successor ? 'rescheduled' : 'cancelled') : 'published',
                'attendance_url' => ! $session->cancelled_at && $this->attendance->canRead($actor, $teacher, $session)
                    ? route('dashboard.teaching.attendance', $session->id, false) : null,
            ];
        });
    }

    private function assessments(AcademicOffering $offering): LengthAwarePaginator
    {
        $categories = config('assessment.categories');

        return $this->assessmentQuery()->where('academic_offering_id', $offering->id)->with('assessment')->latest('id')
            ->paginate(15, ['id', 'title', 'kind', 'opens_at', 'closes_at'], 'assessments_page')->withQueryString()
            ->through(fn (AcademicResource $resource) => $resource->only(['id', 'title', 'kind', 'opens_at', 'closes_at']) + [
                'category' => $resource->assessment?->category,
                'category_label' => $resource->assessment ? ($categories[$resource->assessment->category] ?? $resource->assessment->category) : null,
                'state' => $resource->assessment?->state ?? 'published',
                'url' => $resource->assessment ? route('dashboard.teaching.assessments.index', ['offering' => $offering->id, 'resource' => $resource->id], false) : null,
            ]);
    }

    private function assessmentQuery(): Builder
    {
        return AcademicResource::query()->whereNull('student_profile_id')->whereIn('kind', ['assignment', 'evaluation'])
            ->where(fn (Builder $query) => $query->visible()->orWhereHas('assessment'));
    }

    private function supportQuery(): Builder
    {
        return AcademicResource::query()->whereNull('student_profile_id')->whereIn('kind', AcademicResource::CONTENT_KINDS);
    }

    private function resources(AcademicOffering $offering, bool $canPublish, ?string $filter): array
    {
        $sections = ContentSection::where('academic_offering_id', $offering->id)->orderBy('position')->orderBy('id')->get(['id', 'title']);
        $selection = $filter === null || $filter === 'unassigned' ? $filter : (int) $filter;
        abort_if(is_int($selection) && ! $sections->contains('id', $selection), 404);

        $query = $this->supportQuery()->where('academic_resources.academic_offering_id', $offering->id)
            ->when(! $canPublish, fn (Builder $query) => $query->visible())
            ->leftJoin('academic_content_sections as chapter', fn ($join) => $join
                ->on('chapter.id', '=', 'academic_resources.academic_content_section_id')
                ->on('chapter.academic_offering_id', '=', 'academic_resources.academic_offering_id'));
        $totals = (clone $query)->selectRaw('chapter.id as section_id, COUNT(*) as total')->groupBy('chapter.id')->pluck('total', 'section_id');
        $resources = $query->when($selection === 'unassigned', fn (Builder $query) => $query->whereNull('chapter.id'))
            ->when(is_int($selection), fn (Builder $query) => $query->where('chapter.id', $selection))
            ->orderByRaw('CASE WHEN chapter.id IS NULL THEN 1 ELSE 0 END')->orderBy('chapter.position')->orderBy('chapter.id')
            ->orderBy('academic_resources.position')->orderBy('academic_resources.id')
            ->paginate(15, ['academic_resources.*', 'chapter.id as section_id', 'chapter.title as section'], 'resources_page')->withQueryString()
            ->through(fn (AcademicResource $resource) => $resource->only(['id', 'title', 'kind', 'is_published', 'filename', 'size_bytes', 'published_at']) + [
                'section_id' => $resource->section_id === null ? null : (int) $resource->section_id,
                'section' => $resource->section,
                'url' => $resource->url && preg_match('#^https?://#i', $resource->url) ? $resource->url : null,
                'status' => $resource->archived_at ? 'archived' : ($resource->is_published ? 'published' : 'draft'),
                'detail_url' => route('dashboard.teaching.learning.index', ['offering' => $offering->id, 'resource' => $resource->id], false),
                'download_url' => $resource->path ? route('dashboard.teaching.file', $resource->id, false) : null,
            ]);

        return [
            'resources' => $resources,
            'resourcesSections' => $sections->map(fn (ContentSection $section) => ['id' => $section->id, 'title' => $section->title, 'count' => (int) $totals->get($section->id, 0)])->all(),
            'resourceSection' => $selection,
            'resourceUnassignedCount' => (int) $totals->get('', 0),
            'resourcesTotal' => (int) $totals->sum(),
        ];
    }
}
