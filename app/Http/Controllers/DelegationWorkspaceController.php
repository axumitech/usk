<?php

namespace App\Http\Controllers;

use App\Models\AcademicStructure\AcademicProgram;
use App\Models\AcademicStructure\AcademicPromotion;
use App\Models\Student\AcademicEnrollment;
use App\Models\User;
use App\Modules\Student\Application\Services\Audit;
use App\Modules\Student\Application\Services\RectorReport;
use App\Notifications\PromotionMessage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

final class DelegationWorkspaceController
{
    public function index(Request $request, RectorReport $report)
    {
        $actor = $request->user();
        if ($actor->hasRole('rector') && $actor->can('view institutional indicators')) {
            $filters = $request->validate(['year' => ['nullable', 'integer', 'exists:academic_years,id']]);

            return Inertia::render('dashboard/delegation/Index', ['title' => 'Rectorat']
                + $report->overview(isset($filters['year']) ? (int) $filters['year'] : null));
        }
        if ($actor->hasRole('department-head') && $actor->can('view department programs')) {
            $assigned = DB::table('department_staff')->where('user_id', $actor->id)->select('department_id');

            return Inertia::render('dashboard/delegation/Index', ['title' => 'Direction de département',
                'programs' => AcademicProgram::whereIn('academic_department_id', $assigned)->orderBy('name')
                    ->get(['id', 'code', 'name', 'is_active'])]);
        }
        abort_unless($actor->hasRole('promotion-representative') && $actor->hasRole('student')
            && $actor->can('communicate with own promotion'), 403);

        return Inertia::render('dashboard/delegation/Index', ['title' => 'Représentation de promotion',
            'promotions' => AcademicPromotion::whereIn('id', $this->mandates($actor)->select('academic_promotion_id'))
                ->orderBy('name')->get(['id', 'name'])]);
    }

    public function publish(Request $request)
    {
        $actor = $request->user();
        abort_unless($actor->hasRole('student'), 403);
        $data = $request->validate(['promotion' => 'required|integer|min:1', 'message' => 'required|string|min:5|max:500']);
        DB::transaction(function () use ($actor, $data) {
            $entry = $this->mandates($actor)->where('academic_promotion_id', $data['promotion'])->lockForUpdate()->firstOrFail();
            $recipients = AcademicEnrollment::with('profile.user')->where([
                'academic_year_id' => $entry->academic_year_id, 'academic_promotion_id' => $entry->academic_promotion_id,
                'enrollment_status' => 'confirmed',
            ])->get();
            foreach ($recipients as $recipient) {
                $recipient->profile?->user?->notifyNow(new PromotionMessage($recipient->id, $data['message']));
            }
            Audit::record($actor->id, 'promotion_message_published', $entry->promotion);
        });

        return back(303)->with('success', 'Message transmis aux étudiants de la promotion.');
    }

    private function mandates(User $actor)
    {
        return AcademicEnrollment::whereHas('profile', fn ($profile) => $profile->where('user_id', $actor->id))
            ->where('enrollment_status', 'confirmed')->whereIn('academic_promotion_id',
                DB::table('promotion_representatives')->where('user_id', $actor->id)->select('academic_promotion_id'))
            ->whereHas('academicYear', fn ($year) => $year->where('status', 'open'))
            ->whereHas('promotion', fn ($promotion) => $promotion->where('is_active', true)
                ->whereColumn('academic_promotions.academic_year_id', 'academic_enrollments.academic_year_id'));
    }
}
