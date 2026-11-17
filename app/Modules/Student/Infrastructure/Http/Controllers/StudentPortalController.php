<?php

namespace App\Modules\Student\Infrastructure\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\AcademicCalendarEvent;
use App\Models\Level;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicProgression;
use App\Models\Student\AcademicResource;
use App\Models\Student\AcademicSubmission;
use App\Models\Student\AssessmentRecord;
use App\Models\Student\ServiceRequest;
use App\Modules\Assessment\Application\AssessmentAccess;
use App\Modules\Assessment\Application\AssessmentCopies;
use App\Modules\Assessment\Application\AssessmentStudent;
use App\Modules\Assessment\Application\AssessmentSubmissions;
use App\Modules\Assessment\Application\StudentAssignmentStatus;
use App\Modules\Assessment\Application\StudentEvaluationTimeline;
use App\Modules\Documents\Application\DocumentQueries;
use App\Modules\Documents\Application\StudentDocumentLibrary;
use App\Modules\Progression\Application\AcademicLifecycle;
use App\Modules\Results\Application\ResultInputs;
use App\Modules\Results\Application\StudentResultPeriods;
use App\Modules\Results\Infrastructure\Http\StudentResultsController;
use App\Modules\Student\Application\Services\AcademicAccessService;
use App\Modules\Student\Application\Services\AcademicProgressionService;
use App\Modules\Student\Application\Services\Audit;
use App\Modules\Student\Application\Services\CardEligibility;
use App\Modules\Student\Application\Services\FeeTariffService;
use App\Modules\Student\Application\Services\FinanceReceiptService;
use App\Modules\Student\Application\Services\Money;
use App\Modules\Student\Application\Services\StudentAnnouncements;
use App\Modules\Student\Application\Services\StudentFinanceActivity;
use App\Modules\Student\Application\Services\StudentFinanceService;
use App\Modules\Student\Application\Services\StudentPaymentProofs;
use App\Modules\Student\Application\Services\StudentOverviewService;
use App\Modules\Student\Application\Services\StudentPortalContext;
use App\Modules\Student\Application\Services\StudentProfileCompletion;
use App\Modules\Student\Application\Services\StudentScolarite;
use App\Modules\Student\Application\Services\StudentServiceCatalog;
use App\Modules\Teaching\Application\Services\LearningAccess;
use App\Modules\Teaching\Application\Services\LearningFiles;
use App\Modules\Teaching\Application\Services\TeachingTeam;
use App\Support\DocumentUploadLimit;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

class StudentPortalController extends Controller
{
    public function __construct(
        private AcademicAccessService $access,
        private StudentFinanceService $finance,
        private StudentPortalContext $portalContext,
    ) {}

    public function context(Request $request, ?int $preferredYearId = null): AcademicEnrollment
    {
        abort_unless($request->user()->hasRole('student'), 403);
        $profile = $request->user()->studentProfile;
        abort_unless($profile, 403, 'Votre profil étudiant n’est pas encore activé.');
        $selection = validator($request->query(), ['academic' => 'nullable|integer', 'application' => 'nullable|uuid'])->validate();
        $query = $profile->enrollments()->whereHas('application')->with(['profile.user', 'application', 'level.faculty', 'level.detail', 'academicYear', 'group.intake', 'department:id,name']);
        if (isset($selection['academic'])) {
            $query->where('academic_enrollments.id', $selection['academic']);
        }
        if (isset($selection['application'])) {
            $query->whereHas('application', fn ($q) => $q->where('uuid', $selection['application']))->orderBy('academic_enrollments.id');
        }
        if (! isset($selection['academic']) && ! isset($selection['application']) && $preferredYearId !== null) {
            $query->orderByRaw('case when academic_enrollments.academic_year_id = ? then 0 else 1 end', [$preferredYearId]);
        }

        return $query->join('academic_years', 'academic_years.id', '=', 'academic_enrollments.academic_year_id')->orderByDesc('academic_years.start_date')->orderByDesc('academic_enrollments.id')->select('academic_enrollments.*')->firstOrFail();
    }

    private function courseCredits(AcademicEnrollment $entry, Collection $courses, ?array $official): array
    {
        $planned = $official['planned'] ?? null;
        if ($planned === null) {
            $units = $this->access->curriculumItems($entry)?->groupBy('curriculum_unit_id');
            $registered = $courses->where('registered', true)->keyBy('course_id');
            $values = $units?->isNotEmpty()
                ? $units->map(function (Collection $items) use ($registered) {
                    $expected = $items->filter(fn ($item) => ! $item->is_optional || $registered->has($item->source_course_id));

                    return $expected->isEmpty() ? 0 : $items->first()->unit->creditTotal($expected);
                })
                : $courses->unique('course_id')->pluck('credits');
            $planned = $values->isNotEmpty() && ! $values->containsStrict(null)
                ? $values->sum(fn ($value) => (int) round((float) $value * 100))
                : null;
        }

        return [
            'earned' => $official['earned'] ?? null,
            'remaining' => $official['remaining'] ?? null,
            'compensated' => $official['compensated'] ?? null,
            'planned' => $planned,
        ];
    }

    private function requireFeature(AcademicEnrollment $entry, string $feature): void
    {
        $decision = $this->access->decision($entry, $feature);
        abort_unless($decision['allowed'], 403, $decision['reason'] ?? 'Accès refusé.');
    }

    private function resource(AcademicEnrollment $entry, int $id): AcademicResource
    {
        $this->requireFeature($entry, 'courses_view');
        $resource = AcademicResource::visible()->forStudent($entry)->with('supplementaryFor:id,kind')->findOrFail($id);
        abort_unless($this->access->offerings($entry)->whereKey($resource->academic_offering_id)->exists(), 404);

        return $resource;
    }

    public function acknowledgeWelcome(Request $request)
    {
        $entry = $this->context($request);
        $entry->profile->newQuery()->whereKey($entry->student_profile_id)->whereNull('welcome_seen_at')->update(['welcome_seen_at' => now()]);

        return back(303);
    }

    private function canChooseDepartment(AcademicEnrollment $entry): bool
    {
        return $entry->enrollment_status === 'confirmed'
            && $entry->profile->student_status === 'active'
            && $entry->academicYear->status === 'open';
    }

    public function chooseDepartment(Request $request)
    {
        $context = $this->context($request);
        $data = $request->validate(['academic_department_id' => 'required|integer']);
        $departmentId = (int) $data['academic_department_id'];

        DB::transaction(function () use ($request, $context, $departmentId) {
            $level = Level::lockForUpdate()->findOrFail($context->level_id);
            $entry = AcademicEnrollment::where('student_profile_id', $context->student_profile_id)
                ->lockForUpdate()->findOrFail($context->id);
            abort_unless($this->canChooseDepartment($entry), 403);
            if ((int) $entry->academic_department_id === $departmentId && $entry->academic_department_id !== null) {
                return;
            }
            if ($entry->academic_department_id !== null) {
                throw ValidationException::withMessages(['academic_department_id' => 'Le département de cette inscription a déjà été confirmé.']);
            }
            if (! $level->departmentOptions()->where('faculty_id', $level->faculty_id)->where('is_active', true)->whereKey($departmentId)->exists()) {
                throw ValidationException::withMessages(['academic_department_id' => 'Ce département ne fait pas partie des choix de votre niveau.']);
            }
            $entry->update(['academic_department_id' => $departmentId]);
            Audit::record($request->user()->id, 'student_department_selected', $entry, data: ['academic_department_id' => $departmentId]);
        });

        return redirect()->route('dashboard.student.index', ['section' => 'overview', 'academic' => $context->id]);
    }

    public function startRenewal(Request $request, AcademicProgression $progression, AcademicProgressionService $progressions)
    {
        $entry = $this->context($request);
        $target = $progressions->start($progression, $entry->profile);

        return redirect()->route('dashboard.student.index', ['section' => 'fees', 'academic' => $target->id], 303)
            ->with('success', 'Réinscription enregistrée.');
    }

    public function show(Request $request, string $section = 'overview')
    {
        $currentYearId = $this->portalContext->currentYearId();
        $entry = $this->context($request, in_array($section, ['overview', 'services', 'requests'], true) ? $currentYearId : null);
        $financeSection = in_array($section, ['fees', 'annual-fees'], true);
        if (($section === 'overview' || $financeSection) && $request->isMethod('GET')
            && $request->header('Purpose') !== 'prefetch' && app(FeeTariffService::class)->applyToEnrollment($entry)) {
            $entry->refresh();
        }
        $permissions = $this->access->permissions($entry);
        $sectionFeature = ['materials' => 'materials_download', 'assignments' => 'assignments_submit', 'evaluations' => 'evaluations_participate', 'results' => 'results_view'][$section] ?? null;
        if ($sectionFeature && ($permissions[$sectionFeature]['visible'] ?? true) === false) {
            abort(403, 'Ce service n’est pas proposé pour votre parcours.');
        }
        $feature = match ($section) {
            'courses','materials','assignments','evaluations' => 'courses_view','schedule' => 'schedule_view','results' => 'results_view',default => 'dashboard_view'
        };
        abort_unless($permissions[$feature]['allowed'], 403, $permissions[$feature]['reason'] ?? 'Accès refusé.');
        $courses = $this->access->courses($entry);
        $submissions = collect();
        $kindForSection = ['materials' => 'material', 'assignments' => 'assignment', 'evaluations' => 'evaluation', 'results' => 'result'][$section] ?? null;
        $offerings = $permissions['courses_view']['allowed'] && ($kindForSection !== null || in_array($section, ['overview', 'schedule'], true))
            ? $this->access->offerings($entry)->get(['id'])
            : collect();
        $resources = collect();
        $workPagination = null;
        $assignmentCounts = null;
        $workSection = in_array($section, ['assignments', 'evaluations'], true);
        $workRules = [
            'activity' => ['nullable', Rule::in(StudentAssignmentStatus::FILTERS)],
            'work' => 'nullable|integer|min:1',
        ];
        $isEvaluation = $section === 'evaluations';
        if ($isEvaluation) {
            $workRules['view'] = ['nullable', Rule::in(StudentEvaluationTimeline::VIEWS)];
        }
        $workFilter = $workSection ? $request->validate($workRules) : [];
        $evaluationView = $isEvaluation ? ($workFilter['view'] ?? 'upcoming') : null;
        $evaluationCounts = $isEvaluation && ! isset($workFilter['work']) ? array_fill_keys(StudentEvaluationTimeline::VIEWS, 0) : null;
        $evaluationTimeline = $isEvaluation ? new StudentEvaluationTimeline(now()) : null;
        $assessmentStudent = app(AssessmentStudent::class);
        if ($section === 'assignments') {
            $assignmentCounts = array_fill_keys(['all', ...StudentAssignmentStatus::FILTERS], 0);
        }
        if ($offerings->isNotEmpty() && ($section === 'overview' || $kindForSection !== null)) {
            $query = AcademicResource::visible()->forStudent($entry)->forLearningPermissions($permissions)
                ->with('offering.course')->whereIn('academic_offering_id', $offerings->pluck('id'));
            $query->when($kindForSection, fn ($q, $kind) => $kind === 'material' ? $q->whereIn('kind', ['material', 'syllabus', 'audio']) : $q->where('kind', $kind));
            if ($section === 'assignments') {
                if (isset($workFilter['work'])) {
                    $rows = $query->whereKey($workFilter['work'])->get();
                } else {
                    $statuses = new StudentAssignmentStatus($entry, $permissions['assignments_submit']['allowed'], $permissions['results_view']['allowed']);
                    $assignmentCounts = $statuses->counts($query);
                    $page = $statuses->filter($query, $workFilter['activity'] ?? null)->orderByDesc('id')->paginate(25, ['*'], 'work_page')->withQueryString();
                    $workPagination = ['links' => $page->linkCollection()];
                    $rows = $page->getCollection();
                }
                [$participants, $groupCopies] = $assessmentStudent->context($rows, $entry);
            } elseif ($evaluationTimeline) {
                $query = $evaluationTimeline->query($query)->with('session.registeredRoom');
                if ($evaluationCounts !== null) {
                    foreach (StudentEvaluationTimeline::VIEWS as $view) {
                        $evaluationCounts[$view] = $evaluationTimeline->filter(clone $query, $view)->count();
                    }
                }
                $evaluationTimeline->selectStatus($query);
                if (isset($workFilter['work'])) {
                    $rows = $query->whereKey($workFilter['work'])->get();
                    if (! isset($workFilter['view']) && ! isset($workFilter['activity'])
                        && in_array($rows->first()?->evaluation_status, ['past', 'cancelled'], true)) {
                        $evaluationView = 'past';
                    }
                } elseif (isset($workFilter['activity']) && ! isset($workFilter['view'])) {
                    $evaluationTimeline->legacyFilter($query, $workFilter['activity'], $entry, $permissions['results_view']['allowed']);
                    $page = $query->orderByDesc('academic_resources.id')->paginate(25, ['*'], 'work_page')->withQueryString();
                    $workPagination = ['links' => $page->linkCollection()];
                    $rows = $page->getCollection();
                } else {
                    $evaluationTimeline->filter($query, $evaluationView);
                    $page = $evaluationTimeline->sorted($query, $evaluationView)->paginate(25, ['*'], 'work_page')->withQueryString();
                    $workPagination = ['links' => $page->linkCollection()];
                    $rows = $page->getCollection();
                }
                [$participants, $groupCopies] = $assessmentStudent->context($rows, $entry);
            } else {
                $rows = $query->get();
                $participants = $groupCopies = collect();
            }
            if ($workSection) {
                $submissions = AcademicSubmission::where('academic_enrollment_id', $entry->id)->whereIn('academic_resource_id', $rows->modelKeys())
                    ->get()->keyBy('academic_resource_id');
            }
            $availableKinds = $permissions['materials_download']['allowed'] ? AcademicResource::CONTENT_KINDS : ['online', 'video'];
            $workSupports = $workSection && $permissions[$section === 'assignments' ? 'assignments_submit' : 'evaluations_participate']['allowed']
                ? AcademicResource::visible()->forStudent($entry)->whereIn('supplementary_for_id', $rows->modelKeys())
                    ->whereIn('kind', $availableKinds)->orderBy('position')->orderBy('id')->get(['id', 'kind', 'title', 'path', 'filename', 'size_bytes', 'supplementary_for_id'])
                    ->groupBy('supplementary_for_id')
                : collect();
            $resources = $rows->map(function ($r) use ($entry, $permissions, $submissions, $section, $workSupports, $workSection, $participants, $groupCopies, $assessmentStudent, $evaluationTimeline) {
                $feature = $workSection ? AssessmentAccess::feature($r) : LearningAccess::fileFeature($r);
                if (($permissions[$feature]['visible'] ?? true) === false) {
                    return null;
                }
                $allowed = $permissions[$feature]['allowed'];
                $submission = $groupCopies->get($r->id) ?? $submissions->get($r->id);
                $participant = $workSection && $r->assessment ? $participants->get($r->assessment->id) : null;
                $mayReadResults = $permissions['results_view']['allowed'];
                $assessment = $workSection && $r->assessment && ($allowed || $participant?->released_at && $mayReadResults)
                    ? $assessmentStudent->row($r, $entry, $participant, $submission, $allowed, $mayReadResults) : null;
                if ($workSection && ! $allowed && ! $assessment && $r->assessment) {
                    $submission = null;
                }
                $assignment = $section === 'assignments' ? $this->assignmentPresentation($r, $assessment, $submission, $allowed) : null;
                $evaluation = $evaluationTimeline?->presentation($r, $assessment, $allowed);

                return ['id' => $r->id, 'kind' => $r->kind, 'title' => $r->kind === 'result' && ! $allowed ? 'Résultat publié (accès soumis à une règle administrative)' : $r->title, 'body' => $allowed && $section !== 'overview' ? $r->body : null, 'course' => $this->access->reference($entry, $r->offering->course)['title'], 'allowed' => $allowed, 'reason' => $permissions[$feature]['reason'], 'download_url' => $r->path && $allowed ? '/app/dashboard/student/resources/'.$r->id.'/download?academic='.$entry->id : null, 'opens_at' => $r->opens_at, 'closes_at' => $r->closes_at, 'assessment' => $assessment, 'assignment' => $assignment, 'evaluation' => $evaluation, 'supports' => $workSupports->get($r->id, collect())->map(fn ($item) => [
                    'id' => $item->id, 'title' => $item->title,
                    'url' => route('dashboard.student.courses.show', ['course' => $r->offering->course_id, 'section' => match ($item->kind) {
                        'online' => 'online', 'video' => 'videos', default => 'files'
                    }, 'academic' => $entry->id, 'support' => $item->id]),
                    'download_url' => $item->path ? route('dashboard.student.resources.download', ['resource' => $item->id, 'academic' => $entry->id]) : null,
                    'filename' => $item->filename, 'size_bytes' => $item->size_bytes === null ? null : (int) $item->size_bytes,
                ]), 'submission' => $submission ? ['id' => $submission->id, 'body' => $submission->body, 'version' => $submission->version, 'submitted_at' => $submission->updated_at, 'filename' => $submission->filename, 'download_url' => $submission->path ? '/app/dashboard/student/submissions/'.$submission->id.'/download?academic='.$entry->id : null] : null];
            })->filter()->values();
        }
        if ($workSection && isset($workFilter['work'])) {
            abort_if($resources->isEmpty(), 404);
        }
        $scheduleRules = match ($section) {
            'schedule' => ['week' => 'nullable|date_format:Y-m-d', 'day' => 'nullable|date_format:Y-m-d', 'view' => 'nullable|in:week,list,exams'],
            'overview' => ['week' => 'nullable|date_format:Y-m-d'],
            default => [],
        };
        $scheduleInput = $scheduleRules ? $request->validate($scheduleRules) : [];
        $scheduleWeek = CarbonImmutable::parse($scheduleInput['week'] ?? $scheduleInput['day'] ?? now('Africa/Kinshasa')->toDateString(), 'Africa/Kinshasa')->startOfWeek();
        $calendarEvents = in_array($section, ['schedule', 'overview'], true) && $permissions['schedule_view']['allowed']
            ? AcademicCalendarEvent::where('academic_year_id', $entry->academic_year_id)
                ->whereIn('category', ['exam', 'resit'])
                ->where('start_date', '<', $scheduleWeek->addWeek()->toDateString())
                ->where('end_date', '>=', $scheduleWeek->toDateString())
                ->orderBy('start_date')->orderBy('id')
                ->get(['id', 'title', 'category', 'start_date', 'end_date'])
                ->map(fn (AcademicCalendarEvent $event) => $event->toArray() + ['category_label' => AcademicCalendarEvent::CATEGORIES[$event->category]])
            : [];
        $sessionsQuery = $this->access->sessions($entry)->with(['successor:id,replaces_session_id,starts_at', 'registeredRoom:id,name,building', 'offering.course', 'offering.professor', 'offering.assignments.professor']);
        if ($section === 'schedule') {
            $sessionsQuery->where('starts_at', '<', $scheduleWeek->addWeek()->utc())->where('ends_at', '>', $scheduleWeek->utc());
        } else {
            $sessionsQuery->whereNull('cancelled_at')->where('ends_at', '>=', now('Africa/Kinshasa')->startOfWeek()->utc())->limit(50);
        }
        $sessions = in_array($section, ['overview', 'schedule'], true) ? $sessionsQuery->orderBy('starts_at')->orderBy('id')->get() : collect();
        $sessionContent = $offerings->isNotEmpty() && $sessions->isNotEmpty()
            ? AcademicResource::visible()->forStudent($entry)->forLearningPermissions($permissions)->whereIn('academic_offering_id', $offerings->pluck('id'))
                ->whereIn('kind', $permissions['materials_download']['allowed'] ? AcademicResource::CONTENT_KINDS : ['online', 'video'])
                ->whereIn('academic_session_id', $sessions->pluck('id'))->distinct()->pluck('academic_session_id')->flip()
            : collect();
        $sessions = $sessions->map(function ($session) use ($entry, $sessionContent) {
            $offering = $session->offering;
            $reference = $this->access->reference($entry, $offering->course);
            $semester = $entry->curriculum_version_id ? $reference['semester'] : ($offering->semester ?: $reference['semester']);
            $room = $session->room ?: $session->registeredRoom?->name;
            $location = collect([$session->registeredRoom?->building, $room])->filter()->unique()->join(' · ');

            return [
                'id' => $session->id, 'course_id' => $offering->course_id, 'course' => $reference['title'],
                'semester' => match ((string) $semester) {
                    '1' => '1er semestre', '2' => '2e semestre', '' => null, default => (string) $semester
                },
                'activity_type' => $session->activity_type, 'starts_at' => $session->starts_at, 'ends_at' => $session->ends_at, 'room' => $room, 'location' => $location ?: null,
                'resource_url' => $sessionContent->has($session->id) ? route('dashboard.student.courses.show', ['course' => $offering->course_id, 'section' => 'online', 'academic' => $entry->id, 'session' => $session->id]) : null,
                'status' => $session->cancelled_at ? ($session->successor ? 'rescheduled' : 'cancelled') : 'published',
                'teacher' => TeachingTeam::leadNameAt($offering, $session->starts_at) ?? $offering->course->teacher, 'level_id' => $offering->level_id,
            ];
        });
        $detail = $entry->level->detail;
        $statement = $this->finance->statement($entry);
        $balance = $statement['balance'];
        $firstInstallment = $financeSection ? $this->finance->firstTuitionInstallment($entry, $statement) : null;
        $financeActivity = app(StudentFinanceActivity::class);
        $financeView = $section === 'transactions' ? ($request->query('view') === 'receipts' ? 'receipts' : 'history') : null;
        $paymentsPage = $financeView !== null ? $financeActivity->transactions($entry, $statement['kind_titles'], $financeView === 'receipts') : null;
        $studentChrome = $this->portalContext->forEnrollment($entry, $permissions, $currentYearId);

        $progression = in_array($section, ['overview', 'academics', 'fees'], true)
            ? AcademicProgression::with(['level:id,title', 'academicYear:id,title,status', 'target:id,enrollment_status'])
                ->where(fn ($q) => $q->where('source_enrollment_id', $entry->id)->orWhere('target_enrollment_id', $entry->id))
                ->orderByDesc('id')->first()
            : null;

        $lifecycle = $section === 'academics' ? \App\Models\Student\AcademicLifecycleCase::where('academic_enrollment_id', $entry->id)
            ->whereIn('status', ['approved', 'refused'])->latest('decided_at')->latest('id')->limit(20)
            ->get()->map(fn ($case) => $case->only(['reference', 'kind', 'status', 'decided_at'])) : [];
        $officialProgress = $section === 'academics' && $permissions['results_view']['allowed']
            ? app(ResultInputs::class)->latest($entry) : null;

        $courseResults = $section === 'courses' && $permissions['results_view']['allowed']
            ? app(StudentResultPeriods::class)->publishedCredits($entry) : null;

        return Inertia::render('dashboard/student/Portal', [
            'lifecycle' => $lifecycle,
            'course_credits' => $section === 'courses' ? $this->courseCredits($entry, $courses, $courseResults) : null,
            'progression_credits' => $officialProgress ? [
                'earned' => $officialProgress->snapshot['credits']['earned'], 'remaining' => $officialProgress->snapshot['credits']['remaining'],
                'reference' => $officialProgress->reference,
            ] : null,
            'progression' => $progression ? [
                'kind' => $progression->kind, 'due_on' => $progression->decision_snapshot['due_on'] ?? null,
                'retakes' => $progression->decision_snapshot['retakes'] ?? [],
                'id' => $progression->id, 'level' => $progression->level->title, 'year' => $progression->academicYear->title,
                'target_id' => $progression->target_enrollment_id, 'status' => $progression->target?->enrollment_status,
                'can_start' => $progression->target_enrollment_id === null && $progression->academicYear->status === 'open'
                    && $entry->profile->student_status === 'active'
                    && ($entry->enrollment_status === 'completed' || $progression->kind === 'resumption')
                    && ! \App\Modules\Progression\Application\AcademicLifecycle::interrupted($entry),
            ] : null,
            'department' => $entry->department?->only(['id', 'name']),
            'department_options' => $entry->academic_department_id === null && $this->canChooseDepartment($entry)
                ? $entry->level->departmentOptions()->where('faculty_id', $entry->level->faculty_id)->where('is_active', true)->orderBy('name')->get(['academic_departments.id', 'name'])->makeHidden('pivot')
                : [],
            'curriculum' => $this->access->curriculumContext($entry),
            'overview' => $section === 'overview' ? app(StudentOverviewService::class)->summary($entry, $permissions, $balance, $scheduleWeek) : null,
            'profile_completion' => $section === 'overview'
                ? fn () => app(StudentProfileCompletion::class)->summary($entry, $studentChrome['photo_url'] !== null) : null,
            'card_eligibility' => $section === 'card' ? (function () use ($entry) {
                $eligibility = app(\App\Modules\Student\Application\Services\CardEligibility::class);

                return $eligibility->summary($eligibility->query()->findOrFail($entry->id));
            })() : null,
            'profile_form' => $section === 'profile' ? ['values' => array_merge(array_fill_keys(config('student_profile.detail_fields'), null), $entry->profile->personal_details ?? [], $entry->profile->user->only(['first_name', 'last_name', 'post_name', 'gender', 'email'])), 'provinces' => config('student_profile.provinces')] : null,
            'profile_view' => $section === 'profile' ? match ($request->query('view')) {
                'personal' => 'personal', 'photo' => 'photo', 'settings' => 'settings', default => 'overview',
            } : null,
            'profile_edit_field' => $section === 'profile' && $request->query('view') === 'personal'
                ? app(StudentProfileCompletion::class)->editField($request->query('edit')) : null,
            'welcome_pending' => $entry->profile->welcome_seen_at === null,
            'section' => $section, 'academic' => ['id' => $entry->id, 'application_uuid' => $entry->application->uuid, 'reference' => $entry->application->reference, 'matricule' => $studentChrome['matricule'], 'application_status' => $entry->application->status->value, 'student_status' => $entry->profile->student_status, 'enrollment_status' => $entry->enrollment_status, 'level' => $entry->level->title, 'faculty' => $entry->level->faculty->name, 'year' => $entry->academicYear->title, 'group' => $entry->group?->intake?->name, 'fee_category' => $entry->fee_category, 'name' => $studentChrome['name'], 'email' => $entry->profile->user->email, 'phone' => $entry->profile->personal_details['phone'] ?? null, 'photo_url' => $studentChrome['photo_url']],
            'studentChrome' => $studentChrome,
            'finance_schedule' => $financeSection ? collect($statement['schedules'])->flatten(1)->sortBy(fn ($line) => $line['due_at'] ?? '9999-12-31')->values() : [],
            'first_installment' => $firstInstallment,
            'first_installment_review_required' => $firstInstallment !== null && $this->finance->firstInstallmentReviewRequired($entry, $firstInstallment),
            'finance_details' => match ($section) {
                'fees' => fn () => $financeActivity->overview($entry, $statement),
                'annual-fees' => fn () => $financeActivity->annual($statement),
                default => null,
            },
            'payment_proofs' => $section === 'fees' ? fn () => app(StudentPaymentProofs::class)->studentProps($entry, $statement, $request->query('kind')) : null,
            'finance_view' => $financeView,
            'payments_pagination' => ['links' => $paymentsPage?->linkCollection() ?? []],
            'permissions' => $permissions, 'balance' => $balance, 'obligations' => $entry->obligations()->get(['id', 'title', 'amount_cents', 'due_at', 'installment']),
            'tariffs' => collect(['national' => [$detail?->price_national_first, $detail?->price_national_second], 'foreign' => [$detail?->price_foreign_first, $detail?->price_foreign_second]])->map(fn ($values) => array_map(fn ($value) => $value !== null && $entry->currency === config('student.currency') ? \App\Modules\Student\Application\Services\Money::cents($value) : null, $values)),
            'official_results' => $section === 'results' ? app(\App\Modules\Results\Infrastructure\Http\StudentResultsController::class)->presentation($request, $entry) : null,
            'document_center' => in_array($section, ['documents', 'card'], true)
                ? app(DocumentQueries::class)->student($entry, $section) : null,
            'document_library' => $section === 'documents' ? fn () => app(StudentDocumentLibrary::class)
                ->forStudent($entry, StudentDocumentLibrary::filter($request->query('category'))) : null,
            'payments' => $paymentsPage?->items() ?? [], 'adjustments' => $this->finance->activeAdjustments($entry)->map(fn ($a) => $a->only(['id', 'type', 'fee_kind', 'amount_cents', 'funding_source', 'feature', 'starts_at', 'expires_at', 'schedule'])),
            'schedule_week' => $scheduleWeek->toDateString(),
            'schedule_day' => $scheduleInput['day'] ?? null,
            'schedule_view' => $scheduleInput['view'] ?? 'week',
            'calendar_events' => $calendarEvents,
            'courses' => $courses, 'sessions' => $sessions, 'upcoming_sessions' => $sessions->filter(fn ($session) => $session['ends_at']->gte(now()))->values(), 'resources' => $resources, 'work_pagination' => $workPagination, 'activity_filter' => $workFilter['activity'] ?? null,
            'work_id' => isset($workFilter['work']) ? (int) $workFilter['work'] : null, 'assignment_counts' => $assignmentCounts,
            'evaluation_view' => $evaluationView, 'evaluation_counts' => $evaluationCounts,
            'scolarite' => in_array($section, ['services', 'requests'], true) ? fn () => app(StudentScolarite::class)->page($request, $entry, $permissions, $section) : null,
            'success' => session('success'),
        ]);
    }

    private function assignmentPresentation(AcademicResource $resource, ?array $assessment, ?AcademicSubmission $submission, bool $allowed): array
    {
        $now = now();
        $status = $assessment['status'] ?? match (true) {
            $submission !== null => 'submitted',
            $resource->opens_at?->gt($now) => 'upcoming',
            $resource->closes_at?->lt($now) => 'ended',
            default => 'available',
        };
        $canSubmit = $assessment['can_submit'] ?? ($allowed && ! $resource->assessment
            && ! $resource->offering->archived_at && ! $resource->opens_at?->gt($now) && ! $resource->closes_at?->lt($now));

        return [
            'status' => $status,
            'can_submit' => $canSubmit,
            'teacher' => $assessment['teacher'] ?? $resource->offering->professor?->full_name ?? $resource->offering->course->teacher,
            'filename' => $allowed ? $resource->filename : null,
            'size_bytes' => $allowed && $resource->size_bytes !== null ? (int) $resource->size_bytes : null,
        ];
    }

    public function download(Request $request, int $resource, LearningFiles $files)
    {
        return $this->serveResource($request, $resource, $files, false);
    }

    public function preview(Request $request, int $resource, LearningFiles $files)
    {
        return $this->serveResource($request, $resource, $files, true);
    }

    private function serveResource(Request $request, int $id, LearningFiles $files, bool $inline)
    {
        $entry = $this->context($request);
        $resource = $this->resource($entry, $id);
        $this->requireFeature($entry, $resource->kind === 'assignment' ? 'assignments_submit' : LearningAccess::fileFeature($resource));
        if ($feature = LearningAccess::parentFeature($resource)) {
            $this->requireFeature($entry, $feature);
        }
        if ($inline) {
            abort_unless(in_array($resource->kind, AcademicResource::CONTENT_KINDS, true)
                || ($resource->kind === 'announcement' && StudentAnnouncements::previewable($resource)), 404);
        }
        $response = $files->stream($resource->only(AcademicResource::EDITION_FIELDS), $inline);
        if (! $inline && $request->isMethod('GET') && ! $request->headers->has('Range')
            && in_array($resource->kind, AcademicResource::CONTENT_KINDS, true)) {
            DB::table('academic_resources')->where('id', $resource->id)->increment('download_count');
        }

        return $response;
    }

    public function submit(Request $request, int $resource, AssessmentSubmissions $submissions)
    {
        $entry = $this->context($request);
        $resource = $this->resource($entry, $resource);
        abort_unless(in_array($resource->kind, ['assignment', 'evaluation'], true), 404);
        $this->requireFeature($entry, AssessmentAccess::feature($resource));
        $returnTo = $this->workReturnUrl($request, $entry, $resource);
        $rules = [
            'body' => 'required_without:file|nullable|string|max:20000',
            'file' => 'nullable|file|max:'.DocumentUploadLimit::kilobytes(),
            'operation_key' => 'nullable|uuid', 'expected_version' => 'nullable|integer|min:0',
        ];
        try {
            $data = $request->validate($rules);
            $submissions->submit($entry, $resource, $data, $request->file('file'), $request->user()->id);
        } catch (ValidationException $exception) {
            if ($returnTo) {
                $exception->redirectTo($returnTo);
            }
            throw $exception;
        }

        return ($returnTo ? redirect()->to($returnTo, 303) : back())->with('success', 'Votre travail a été transmis.');
    }

    private function workReturnUrl(Request $request, AcademicEnrollment $entry, AcademicResource $resource): ?string
    {
        $section = match ($resource->kind) {
            'assignment' => $request->boolean('assignment_detail') ? 'assignments' : null,
            'evaluation' => $request->boolean('evaluation_detail') ? 'evaluations' : null,
            default => null,
        };
        if ($section === null) {
            return null;
        }
        $activity = $request->query('activity');
        $view = $request->query('view');
        $page = filter_var($request->query('work_page'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 2]]);

        return route('dashboard.student.index', [
            'section' => $section, 'academic' => $entry->id,
            'view' => $section === 'evaluations' && in_array($view, StudentEvaluationTimeline::VIEWS, true) ? $view : null,
            'activity' => in_array($activity, StudentAssignmentStatus::FILTERS, true) ? $activity : null,
            'work' => $resource->id,
            'work_page' => $page ?: null,
        ]);
    }

    public function downloadSubmission(Request $request, int $submission, AssessmentAccess $access, AssessmentCopies $copies)
    {
        $work = $this->ownSubmission($this->context($request), $submission, $access);
        $data = $request->validate(['version' => 'nullable|integer|min:1']);

        return $copies->download($work, isset($data['version']) ? (int) $data['version'] : null);
    }

    public function submissionVersion(Request $request, int $submission, int $version, AssessmentAccess $access, AssessmentCopies $copies)
    {
        $entry = $this->context($request);
        $work = $this->ownSubmission($entry, $submission, $access);
        $edition = $copies->snapshot($work, $version);
        $parameters = ['submission' => $work->id, 'academic' => $entry->id];

        return Inertia::render('dashboard/student/SubmissionVersion', [
            'studentChrome' => fn () => $this->portalContext->forEnrollment($entry, $this->access->permissions($entry), $this->portalContext->currentYearId()),
            'title' => $work->resource->title, 'number' => $version, 'current' => (int) $work->version,
            'body' => $edition['body'], 'late' => $edition['late'], 'received_at' => $edition['received_at'],
            'download_url' => $edition['path'] ? route('dashboard.student.submissions.download', $parameters + ['version' => $version]) : null,
            'previous_url' => $version > 1 ? route('dashboard.student.submissions.version', $parameters + ['version' => $version - 1]) : null,
            'next_url' => $version < $work->version ? route('dashboard.student.submissions.version', $parameters + ['version' => $version + 1]) : null,
            'return_url' => route('dashboard.student.index', ['section' => $work->resource->kind === 'evaluation' ? 'evaluations' : 'assignments',
                'academic' => $entry->id, 'work' => $work->academic_resource_id]),
        ]);
    }

    private function ownSubmission(AcademicEnrollment $entry, int $submission, AssessmentAccess $access): AcademicSubmission
    {
        $work = AcademicSubmission::with('resource.assessment')->findOrFail($submission);
        $assessment = $work->resource->assessment;
        if ($assessment) {
            abort_unless($access->canReadWork($entry, $work->resource), 404);
        }
        if ($work->academic_enrollment_id !== $entry->id) {
            abort_unless($assessment && $assessment->records()->where('academic_enrollment_id', $entry->id)
                ->whereHas('group', fn ($group) => $group->where('leader_enrollment_id', $work->academic_enrollment_id))->exists(), 404);
        }

        return $work;
    }

    public function assessmentFeedback(Request $request, int $resource, AssessmentAccess $access, LearningFiles $files)
    {
        $entry = $this->context($request);
        $assessment = $this->resource($entry, $resource)->assessment()->firstOrFail();
        abort_unless($access->canReadFeedback($entry, $assessment), 404);
        $record = $assessment->records()->where('academic_enrollment_id', $entry->id)->whereNotNull('released_at')->firstOrFail();

        return $files->stream(['path' => $record->feedback_path, 'filename' => $record->feedback_filename]);
    }

    public function requestAssessmentReview(Request $request, int $resource, AssessmentAccess $access)
    {
        $entry = $this->context($request);
        $resource = $this->resource($entry, $resource);
        $returnTo = $this->workReturnUrl($request, $entry, $resource);
        try {
            $data = $request->validate(['body' => 'required|string|min:10|max:6000']);
        } catch (ValidationException $exception) {
            if ($returnTo) {
                $exception->redirectTo($returnTo);
            }
            throw $exception;
        }
        $assessment = $resource->assessment()->firstOrFail();
        DB::transaction(function () use ($entry, $assessment, $access, $request, $data) {
            $assessment = $assessment->newQuery()->sharedLock()->findOrFail($assessment->id);
            abort_unless($access->canReadFeedback($entry, $assessment), 404);
            $record = $assessment->records()->where('academic_enrollment_id', $entry->id)->whereNotNull('released_at')->lockForUpdate()->firstOrFail();
            if ($record->review_requested_revision === $record->revision) {
                return;
            }
            $ticket = ServiceRequest::create([
                'academic_enrollment_id' => $entry->id, 'category' => 'appeal',
                'subject' => 'Révision pédagogique · Évaluation '.$assessment->id.' · Correction '.$record->revision,
                'body' => $data['body'],
            ]);
            $record->update(['review_requested_revision' => $record->revision]);
            Audit::record($request->user()->id, 'assessment_review_requested', $record, null, ['ticket_id' => $ticket->id, 'revision' => $record->revision]);
        });

        return ($returnTo ? redirect()->to($returnTo, 303) : back(303))->with('success', 'Demande de révision enregistrée.');
    }

    public function receipt(Request $request, string $payment, FinanceReceiptService $receipts)
    {
        $entry = $this->context($request);
        $record = $entry->payments()->where('uuid', $payment)->whereNotNull('confirmed_at')->firstOrFail();

        return response()->view('student.receipt', [
            'receipt' => $receipts->present($record, $entry),
            'backUrl' => route('dashboard.student.index', ['section' => 'transactions', 'academic' => $entry->id, 'view' => 'receipts'], false),
        ])->header('Cache-Control', 'private, no-store');
    }

    public function requestService(Request $request, StudentScolarite $scolarite)
    {
        $entry = $this->context($request, $this->portalContext->currentYearId());
        if ($request->exists('procedure')) {
            return $this->submitProcedure($request, $entry, $scolarite);
        }
        $data = $request->validate(['category' => 'required|in:support,appeal,document,finance', 'subject' => 'required|string|max:180', 'body' => 'required|string|min:10|max:6000']);
        if ($data['category'] === 'document') {
            $this->requireFeature($entry, 'documents_request');
        }
        $ticket = ServiceRequest::create($data + ['academic_enrollment_id' => $entry->id]);
        Audit::record($request->user()->id, 'student_request_created', $ticket);

        return back()->with('success', 'Votre demande a été transmise à l’administration.');
    }

    private function submitProcedure(Request $request, AcademicEnrollment $entry, StudentScolarite $scolarite)
    {
        $slug = $request->input('procedure');
        $procedure = is_string($slug) ? StudentServiceCatalog::find($slug) : null;
        $appointment = ($procedure['category'] ?? null) === 'appointment';
        $returnUrl = route('dashboard.student.index', ['section' => 'services', 'academic' => $entry->id, 'procedure' => $procedure['id'] ?? null]);
        try {
            $data = $request->validate([
                'procedure' => ['required', 'string', Rule::in($procedure ? [$procedure['id']] : [])],
                'body' => 'required|string|min:10|max:6000',
                'file' => ($procedure['attachment'] ?? false) ? 'nullable|file|extensions:pdf,jpg,jpeg,png,webp|max:'.DocumentUploadLimit::kilobytes() : 'prohibited',
                'appointment_slot' => $appointment ? 'required|date_format:Y-m-d\TH:i' : 'prohibited',
                'operation_key' => 'nullable|uuid',
            ], messages: [
                'procedure.in' => 'Choisissez une démarche proposée dans Scolarité.',
                'body.required' => 'Décrivez votre demande.',
                'body.min' => 'Votre description doit contenir au moins 10 caractères.',
                'body.max' => 'Votre description ne peut pas dépasser 6 000 caractères.',
                'file.extensions' => 'Le justificatif doit être un fichier PDF, JPG, PNG ou WebP.',
                'file.max' => 'Le justificatif dépasse la taille maximale autorisée.',
                'appointment_slot.required' => 'Choisissez un créneau libre.',
                'appointment_slot.date_format' => 'Choisissez un créneau proposé.',
            ], attributes: ['procedure' => 'démarche', 'body' => 'description', 'file' => 'justificatif', 'appointment_slot' => 'créneau']);
            $ticket = $scolarite->submit($entry, $procedure, $data, $request->file('file'), $request->user()->id);
        } catch (ValidationException $error) {
            throw $error->redirectTo($returnUrl);
        }

        return redirect()->route('dashboard.student.index', ['section' => 'requests', 'academic' => $entry->id, 'request' => $ticket->id], 303)
            ->with('success', 'Votre demande a été transmise à l’administration.');
    }

    public function requestAttachment(Request $request, int $ticket, LearningFiles $files)
    {
        $entry = $this->context($request, $this->portalContext->currentYearId());
        $row = $entry->serviceRequests()->whereKey($ticket)->whereNotNull('request_attachment_path')->firstOrFail();

        return $files->stream(['path' => $row->request_attachment_path, 'filename' => $row->request_attachment_name]);
    }
}
