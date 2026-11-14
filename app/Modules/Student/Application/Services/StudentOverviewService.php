<?php

namespace App\Modules\Student\Application\Services;

use App\Models\AdmissionCondition;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicResource;
use App\Modules\Teaching\Application\Services\TeachingTeam;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

final class StudentOverviewService
{
    public function __construct(
        private AcademicAccessService $access,
        private StudentFinanceService $finance,
        private StudentAcademicProgram $program,
        private StudentAnnouncements $announcements,
    ) {}

    public function summary(AcademicEnrollment $entry, array $permissions, array $balance, ?CarbonImmutable $selectedWeek = null): array
    {
        $now = now('Africa/Kinshasa');
        $offerings = $this->access->offerings($entry)->select('academic_offerings.id');
        $sessions = $this->access->sessions($entry)->whereNull('academic_sessions.cancelled_at');
        $today = (clone $sessions)->where('ends_at', '>', $now->copy()->startOfDay()->utc())
            ->where('starts_at', '<', $now->copy()->startOfDay()->addDay()->utc());
        $weekStart = $selectedWeek ?? $now->toImmutable()->startOfWeek();
        $week = (clone $sessions)->where('starts_at', '<', $weekStart->addWeek()->utc())->where('ends_at', '>', $weekStart->utc());
        $formatSessions = fn ($query) => $query->with(['registeredRoom:id,name,building', 'offering.course', 'offering.professor', 'offering.assignments.professor'])
            ->orderBy('starts_at')->orderBy('id')->get()->map(function ($session) use ($entry, $now) {
                $offering = $session->offering;
                $reference = $this->access->reference($entry, $offering->course);
                $semester = $entry->curriculum_version_id ? $reference['semester'] : ($offering->semester ?: $reference['semester']);
                $room = $session->room ?: $session->registeredRoom?->name;
                $location = collect([$session->registeredRoom?->building, $room])->filter()->unique()->join(' · ');

                return [
                    'id' => $session->id, 'course_id' => $offering->course_id, 'course' => $reference['title'],
                    'semester' => match ((string) $semester) {
                        '1' => '1er semestre', '2' => '2e semestre', '' => 'Semestre à préciser', default => (string) $semester
                    },
                    'starts_at' => $session->starts_at, 'ends_at' => $session->ends_at, 'room' => $room, 'location' => $location ?: null,
                    'teacher' => TeachingTeam::leadNameAt($offering, $session->starts_at) ?? $offering->course->teacher,
                    'ongoing' => $session->starts_at->lte($now) && $session->ends_at->gt($now),
                ];
            })->values();
        $resources = AcademicResource::visible()->forStudent($entry)->forLearningPermissions($permissions)
            ->whereIn('academic_offering_id', $offerings);
        $canReadCourses = $permissions['courses_view']['allowed'];
        $canReadResults = $canReadCourses && $permissions['results_view']['allowed'];
        $formatResource = fn ($resource) => [
            'id' => $resource->id, 'title' => $resource->title, 'course' => $this->access->reference($entry, $resource->offering->course)['title'],
            'excerpt' => $resource->kind === 'evaluation' && ! $permissions['evaluations_participate']['allowed'] ? '' : Str::limit(trim(strip_tags($resource->body ?? '')), 260),
            'updated_at' => $resource->updated_at, 'opens_at' => $resource->opens_at, 'closes_at' => $resource->closes_at,
        ];
        $results = $canReadResults ? (clone $resources)->with('offering.course')->where('kind', 'result')->where('student_profile_id', $entry->student_profile_id)->latest('updated_at')->orderByDesc('id')->limit(4)->get()->map($formatResource)->values() : collect();
        $announcements = $canReadCourses ? $this->announcements->overview($entry, $permissions) : [];
        $evaluations = $canReadCourses && ($permissions['evaluations_participate']['visible'] ?? true) ? (clone $resources)->with('offering.course')->where('kind', 'evaluation')->whereNotNull('opens_at')->where('opens_at', '>=', $now->copy()->utc())->where('opens_at', '<=', $now->copy()->addDays(14)->utc())->orderBy('opens_at')->limit(4)->get()->map($formatResource)->values() : collect();
        $ongoing = $canReadCourses && ($permissions['evaluations_participate']['visible'] ?? true) ? (clone $resources)->with('offering.course')->where('kind', 'evaluation')->whereNotNull('opens_at')->where('opens_at', '<=', $now->copy()->utc())->where(fn ($query) => $query->whereNull('closes_at')->orWhere('closes_at', '>', $now->copy()->utc()))->orderBy('closes_at')->limit(6)->get()->map($formatResource)->values() : collect();
        $fees = $entry->obligations()->distinct()->pluck('kind')->map(fn ($kind) => ['kind' => $kind, 'title' => $kind === 'tuition' ? 'Frais académiques' : 'Frais connexes · '.$entry->obligations()->where('kind', $kind)->value('title'), 'balance' => $this->finance->balance($entry, $kind)])->values();
        $documents = $entry->application->documents()->get(['key', 'review_status']);
        $required = AdmissionCondition::where('is_required', true)->whereIn('section', ['personal_info', 'academic_info'])
            ->where(fn ($query) => $query->where('level_id', $entry->level_id)->orWhere(fn ($faculty) => $faculty->whereNull('level_id')->where('faculty_id', $entry->level->faculty_id)))->get(['title']);
        $missing = $required->filter(fn ($condition) => ! $documents->contains('key', Str::slug($condition->title, '_')))->pluck('title')->values();
        $toReview = $documents->whereIn('review_status', ['rejected', 'correction_requested'])->count();
        $alerts = $this->accessAlerts($entry, $permissions);
        $appeals = $entry->serviceRequests()->where('category', 'appeal')
            ->whereIn('status', ['open', 'under_review', 'admissible', 'investigating'])->latest('id')->limit(4)->get(['id', 'subject', 'status']);
        foreach ($appeals as $appeal) {
            $title = match ($appeal->status) {
                'under_review' => 'Recours en cours d’examen',
                'admissible' => 'Recours déclaré recevable',
                'investigating' => 'Recours en cours d’instruction',
                default => 'Recours ou réclamation en cours',
            };
            $alerts->push([
                'id' => 'appeal-'.$appeal->id, 'tone' => 'warning', 'title' => $title,
                'message' => $appeal->subject, 'section' => 'requests',
            ]);
        }
        if ($balance['overdue_cents'] > 0) {
            $alerts->push(['id' => 'overdue', 'tone' => 'warning', 'title' => 'Une échéance de paiement est dépassée', 'message' => 'Consultez le montant en retard et contactez le service financier si nécessaire.', 'section' => 'fees']);
        }
        if ($missing->isNotEmpty() || $toReview > 0) {
            $alerts->push(['id' => 'documents', 'tone' => 'warning', 'title' => 'Votre dossier nécessite une vérification', 'message' => $missing->isNotEmpty() ? 'Pièces obligatoires absentes : '.$missing->implode(', ').'. Contactez le service des inscriptions.' : $toReview.' pièce(s) portent une remarque. Consultez votre dossier et les instructions du service.', 'section' => 'application']);
        }
        if ($evaluations->isNotEmpty()) {
            $alerts->push(['id' => 'evaluations', 'tone' => 'info', 'title' => 'Des évaluations approchent', 'message' => $evaluations->count().' évaluation(s) publiée(s) dans les 14 prochains jours. Consultez les dates et les modalités d’accès.', 'section' => 'evaluations']);
        }

        return [
            'fee_summary' => $fees, 'ongoing_evaluations' => $ongoing,
            'upcoming_events' => $this->program->upcoming($entry),
            'generated_at' => $now->toIso8601String(), 'schedule_week' => $weekStart->toDateString(), 'timezone' => 'Africa/Kinshasa',
            'today_count' => $permissions['schedule_view']['allowed'] ? (clone $today)->count() : 0,
            'week_count' => $permissions['schedule_view']['allowed'] ? (clone $week)->count() : 0,
            'today_sessions' => $permissions['schedule_view']['allowed'] ? $formatSessions(clone $today) : [],
            'week_sessions' => $permissions['schedule_view']['allowed'] ? $formatSessions(clone $week) : [],
            'alerts' => $alerts->values(), 'latest_results' => $results, 'announcements' => $announcements,
            'upcoming_evaluations' => $evaluations, 'missing_documents' => $missing,
            'course_count' => $canReadCourses ? $this->access->courses($entry)->count() : 0,
        ];
    }

    private function accessAlerts(AcademicEnrollment $entry, array $permissions): Collection
    {
        if ($entry->profile->student_status === 'suspended') {
            return collect([[
                'id' => 'suspended-profile', 'tone' => 'critical', 'title' => 'Votre profil étudiant est suspendu',
                'message' => 'Vos accès pédagogiques sont suspendus. Contactez le service des inscriptions pour connaître les démarches à suivre.',
                'section' => 'requests',
            ]]);
        }

        if ($entry->enrollment_status === 'pending_confirmation') {
            return collect([[
                'id' => 'pending-enrollment', 'tone' => 'warning', 'title' => 'Votre inscription est à confirmer',
                'message' => 'Consultez le suivi de votre inscription pour connaître les étapes restantes.', 'section' => 'enrollments',
            ]]);
        }

        $labels = ['courses_view' => 'Cours', 'schedule_view' => 'Horaire', 'results_view' => 'Résultats'];

        return collect($labels)->filter(fn ($label, $feature) => ($permissions[$feature]['visible'] ?? true)
            && ($permissions[$feature]['allowed'] ?? true) === false)
            ->map(fn ($label, $feature) => [
                'id' => 'restricted-'.$feature, 'tone' => 'critical', 'title' => $label.' · accès restreint',
                'message' => $permissions[$feature]['reason'] ?? 'Consultez le service des inscriptions pour connaître les conditions d’accès.',
                'section' => 'requests',
            ])->values();
    }
}
