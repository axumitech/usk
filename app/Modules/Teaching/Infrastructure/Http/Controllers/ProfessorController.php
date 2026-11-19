<?php

namespace App\Modules\Teaching\Infrastructure\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\Courses;
use App\Models\Professor;
use App\Models\User;
use App\Modules\Student\Application\Services\Audit;
use App\Modules\Teaching\Application\Services\TeachingAssignmentService;
use App\Modules\Teaching\Application\Services\TeachingScope;
use App\Modules\Teaching\Infrastructure\Http\Requests\SaveProfessorRequest;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class ProfessorController extends Controller
{
    private function directoryProfile(Professor $professor): array
    {
        return $professor->only(['id', 'first_name', 'last_name', 'email', 'phone', 'speciality', 'biography', 'is_active', 'offerings_count'])
            + ['photo_url' => $professor->portraitUrl()];
    }

    private function catalog(User $actor)
    {
        $facultyIds = $actor->academicFaculties()->pluck('faculties.id');

        return Courses::with(['level.faculty:id,name', 'level.departmentOptions' => fn ($q) => $q->where('is_active', true)->orderBy('name')])
            ->when($facultyIds->isNotEmpty(), fn ($courses) => $courses->whereHas('level', fn ($levels) => $levels->whereIn('faculty_id', $facultyIds)))
            ->orderBy('title')->get(['id', 'level_id', 'title', 'code', 'semester']);
    }

    public function index(Request $request)
    {
        $filters = $request->validate(['q' => 'nullable|string|max:150', 'status' => 'nullable|in:active,inactive']);
        $actor = $request->user();
        $directory = TeachingScope::professors($actor);
        $offerings = TeachingScope::offerings($actor);
        $query = (clone $directory)->when($filters['q'] ?? null, fn ($q, $term) => $q->where(fn ($s) => $s
            ->where('first_name', 'like', "%{$term}%")->orWhere('last_name', 'like', "%{$term}%")
            ->orWhere('email', 'like', "%{$term}%")->orWhere('speciality', 'like', "%{$term}%")))
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('is_active', $status === 'active'));
        return Inertia::render('dashboard/professors/Index', [
            'professors' => $query->withCount(['offerings' => fn ($query) => $query->whereIn('id', (clone $offerings)->select('id'))])
                ->orderBy('last_name')->orderBy('first_name')->paginate(12)->withQueryString()->through($this->directoryProfile(...)),
            'filters' => $filters,
            'canInvite' => ProfessorInvitationController::canInvite($request->user()),
            'canManageProfiles' => TeachingScope::canManageProfiles($actor),
            'stats' => ['total' => (clone $directory)->count(), 'active' => (clone $directory)->where('is_active', true)->count(), 'assignments' => $offerings->whereNotNull('professor_id')->count()],
            'catalog' => $this->catalog($actor),
            'years' => AcademicYear::orderByDesc('start_date')->get(['id', 'title']),
            'canAssign' => $request->user()->can('publish academic content'),
        ]);
    }

    public function show(Professor $professor, Request $request)
    {
        $actor = $request->user();
        $directory = TeachingScope::professors($actor);
        abort_unless((clone $directory)->whereKey($professor->id)->exists(), 404);
        $canManage = TeachingScope::canManageProfiles($actor);

        return Inertia::render('dashboard/professors/Show', [
            'professor' => $this->directoryProfile($professor),
            'invitationPending' => $canManage && $professor->invitation_expires_at?->isFuture(),
            'canManageProfiles' => $canManage,
            'canLinkAccount' => $canManage,
            'linkedAccount' => $canManage && $professor->user_id
                ? User::find($professor->user_id)?->email : null,
            'professors' => $directory->where(fn ($q) => $q->where('is_active', true)->orWhere('id', $professor->id))->orderBy('last_name')->get(['id', 'first_name', 'last_name', 'is_active']),
            'assignments' => TeachingScope::offerings($actor)->where('professor_id', $professor->id)->with(['course', 'level.faculty', 'academicYear', 'group.intake', 'department:id,name'])->orderByDesc('academic_year_id')->get(),
            'catalog' => $this->catalog($actor),
            'years' => AcademicYear::orderByDesc('start_date')->get(['id', 'title']),
            'canAssign' => $request->user()->can('publish academic content'),
        ]);
    }

    public function store(SaveProfessorRequest $request, ProfessorInvitationController $invitations)
    {
        $send = $request->boolean('send_invitation');
        abort_if($send && ! ProfessorInvitationController::canInvite($request->user()), 403);
        $professor = Professor::create($request->safe()->except('send_invitation'));
        Audit::record($request->user()->id, 'professor_created', $professor);
        $destination = to_route('dashboard.admin.professors.show', $professor);
        if ($send) {
            try {
                $invitations->deliver($professor, $request->user());
            } catch (\Illuminate\Validation\ValidationException $exception) {
                return $destination->withErrors($exception->errors());
            }
        }

        return $destination->with('success', $send ? 'Enseignant ajouté et invitation envoyée par e-mail.' : 'Enseignant ajouté.');
    }

    public function update(SaveProfessorRequest $request, Professor $professor)
    {
        \Illuminate\Support\Facades\DB::transaction(function () use ($request, $professor) {
            $profile = Professor::lockForUpdate()->findOrFail($professor->id);
            $profile->fill($request->safe()->except('send_invitation'));
            if ($profile->isDirty('email') || ! $profile->is_active) {
                $profile->forceFill(['invitation_hash' => null, 'invitation_expires_at' => null]);
            }
            $profile->save();
            Audit::record($request->user()->id, 'professor_updated', $profile);
        }, 3);

        return back()->with('success', 'Enseignant mis à jour.');
    }

    public function assign(Request $request, TeachingAssignmentService $service, ?int $offering = null)
    {
        abort_unless($request->user()->can('publish academic content'), 403);
        $data = $request->validate([
            'course_id' => 'required|integer|exists:courses,id',
            'academic_year_id' => 'required|integer|exists:academic_years,id',
            'academic_department_id' => 'nullable|integer|exists:academic_departments,id',
            'professor_id' => [$offering ? 'nullable' : 'required', 'integer', Rule::exists('professors', 'id')],
            'is_published' => 'required|boolean',
            'assistant_professor_id' => ['nullable', 'integer', 'different:professor_id', Rule::exists('professors', 'id')->where('is_active', true)],
            'group_leader_name' => 'nullable|string|max:180', 'delivery_mode' => 'sometimes|in:in_person,online,hybrid',
        ]);
        $service->save($data, $request->user()->id, $offering);
        return back()->with('success', 'Affectation enregistrée.');
    }
    public function account(Request $request, Professor $professor)
    {
        abort_unless(TeachingScope::canManageProfiles($request->user()), 403);
        $data = $request->validate(['email' => 'nullable|email|max:255', 'reason' => 'required|string|min:10|max:1000']);
        \Illuminate\Support\Facades\DB::transaction(function () use ($request, $professor, $data) {
            $account = empty($data['email']) ? null : \App\Models\User::role('professor')->whereNotNull('email_verified_at')->where('email', $data['email'])->lockForUpdate()->first();
            if ((! empty($data['email']) && ! $account) || ($account && Professor::where('user_id', $account->id)->whereKeyNot($professor->id)->exists())) {
                throw \Illuminate\Validation\ValidationException::withMessages(['email' => 'Choisissez un compte enseignant vérifié qui n’est pas déjà associé.']);
            }
            $profile = Professor::lockForUpdate()->findOrFail($professor->id);
            $old = $profile->user_id;
            if ((int) $old !== (int) $account?->id) {
                $profile->forceFill(['user_id' => $account?->id, 'invitation_hash' => null, 'invitation_expires_at' => null])->save();
                Audit::record($request->user()->id, 'professor_account_link_changed', $profile, $data['reason'], ['from' => $old, 'to' => $account?->id]);
            }
        }, 3);
        return back(303)->with('success', 'Rattachement du compte mis à jour.');
    }
}
