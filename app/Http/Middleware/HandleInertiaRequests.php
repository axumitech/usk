<?php

namespace App\Http\Middleware;

use App\Modules\Site\Application\UseCases\GetSiteInfo;
use App\Modules\Student\Application\Services\StudentNotifications;
use App\Modules\Teaching\Application\Services\LearningAccess;
use App\Notifications\AcademicScheduleNotice;
use App\Notifications\EnrollmentDocumentReplacement;
use Closure;
use Illuminate\Foundation\Inspiring;
use Illuminate\Http\Request;
use Inertia\Middleware;
use Tighten\Ziggy\Ziggy;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    public function __construct(
        private GetSiteInfo $getSiteInfo
    ) {}

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    public function handle(Request $request, Closure $next)
    {
        if (! $request->is('app/*')) {
            return parent::handle($request, $next);
        }

        $historyEncryption = config('inertia.history.encrypt');
        config(['inertia.history.encrypt' => true]);

        try {
            return parent::handle($request, $next);
        } finally {
            config(['inertia.history.encrypt' => $historyEncryption]);
        }
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        [$message, $author] = str(Inspiring::quotes()->random())->explode('-');
        $teacher = fn () => $request->user()?->hasRole('professor')
            ? once(fn () => app(LearningAccess::class)->teacher($request->user()))
            : null;

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'flash' => fn () => ['success' => $request->session()->get('success')],
            'quote' => ['message' => trim($message), 'author' => trim($author)],
            'auth' => [
                'user' => $request->user() ? [
                    'id' => $request->user()->id,
                    'first_name' => $request->user()->first_name,
                    'last_name' => $request->user()->last_name,
                    'post_name' => $request->user()->post_name,
                    'email' => $request->user()->email,
                    'roles' => $request->user()->getRoleNames(),
                    'permissions' => $request->user()->getAllPermissions()->pluck('name'),
                    'hasAcademicFacultyScope' => $request->user()->hasRole('admin') && $request->user()->academicFaculties()->exists(),
                ] : null,
            ],
            'site' => $this->getSiteInfo->execute(),
            'studentPortalActive' => fn () => $request->user()?->hasRole('student') && $request->user()->studentProfile()->exists(),
            'teachingProfileActive' => fn () => $teacher() !== null,
            'teachingIdentity' => function () use ($request, $teacher) {
                $profile = $request->is('app/dashboard/teacher', 'app/dashboard/teacher/*') ? $teacher() : null;
                if (! $profile) {
                    return null;
                }

                return ['name' => $profile->full_name, 'photo_url' => $profile->portraitUrl()];
            },
            'ziggy' => fn (): array => [
                ...(new Ziggy)->toArray(),
                'location' => $request->url(),
            ],
            'adminNotifications' => function () use ($request) {
                if (! $request->user()?->hasRole('admin') || ! $request->user()->can('manage academic access')) {
                    return null;
                }
                $query = $request->user()->notifications()->whereIn('type', [\App\Notifications\EnrollmentDocumentReplacement::class, \App\Notifications\AcademicScheduleNotice::class]);

                return [
                    'unread_count' => (clone $query)->whereNull('read_at')->count(),
                    'items' => $query->orderByRaw('read_at IS NOT NULL')->latest()->limit(15)->get()->map(fn ($notice) => [
                        'id' => $notice->id, 'reference' => $notice->data['reference'], 'student_name' => $notice->data['student_name'] ?? null,
                        'filename' => $notice->data['filename'] ?? '', 'version' => $notice->data['version'] ?? null,
                        'kind' => $notice->type === \App\Notifications\AcademicScheduleNotice::class ? 'schedule' : 'document', 'status' => $notice->data['status'] ?? null,
                        'created_at' => $notice->created_at->toISOString(), 'read_at' => $notice->read_at?->toISOString(),
                        'open_url' => route('dashboard.admin.notifications.open', $notice->id),
                    ]),
                ];
            },
            'studentNotifications' => function () use ($request) {
                $user = $request->user();

                return $user && ! $request->is('app/dashboard/teacher', 'app/dashboard/teacher/*')
                    ? app(StudentNotifications::class)->summary($user)
                    : null;
            },
            'teacherNotifications' => function () use ($request) {
                $user = $request->user();

                return $request->is('app/dashboard/teacher', 'app/dashboard/teacher/*') && $user?->hasRole('professor')
                    ? app(StudentNotifications::class)->summary($user, teacherOnly: true)
                    : null;
            },
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
        ];
    }
}
