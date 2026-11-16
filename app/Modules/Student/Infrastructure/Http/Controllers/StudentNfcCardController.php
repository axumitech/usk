<?php

namespace App\Modules\Student\Infrastructure\Http\Controllers;

use App\Models\Student\AcademicEnrollment;
use App\Models\Student\StudentNfcCard;
use App\Modules\Student\Application\Services\AcademicStaffScope;
use App\Modules\Student\Application\Services\Audit;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

final class StudentNfcCardController
{
    public function index(Request $request): Response
    {
        $input = $request->validate(['q' => 'nullable|string|max:100']);
        $term = $input['q'] ?? '';
        $entries = AcademicStaffScope::apply(AcademicEnrollment::query(), $request->user())
            ->where(fn (Builder $scope) => $this->eligible($scope)->orWhereHas('nfcCard'))
            ->with(['profile.user', 'level', 'academicYear'])
            ->withExists('nfcCard');
        foreach (preg_split('/\s+/u', $term, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $part) {
            $entries->where(fn (Builder $search) => $search->where('matricule', 'like', "%{$part}%")
                ->orWhereHas('profile', fn ($profile) => $profile->where('matricule', 'like', "%{$part}%")
                    ->orWhereHas('user', fn ($user) => $user->where('first_name', 'like', "%{$part}%")
                        ->orWhere('post_name', 'like', "%{$part}%")->orWhere('last_name', 'like', "%{$part}%"))));
        }
        $rows = $entries->latest('academic_year_id')->orderBy('matricule')->orderBy('id')
            ->paginate(20)->appends(['q' => $term]);
        $eligible = $this->eligible(AcademicEnrollment::whereKey($rows->getCollection()->modelKeys()))->pluck('id')->flip();
        $rows->through(fn (AcademicEnrollment $entry) => [
            'id' => $entry->id,
            'name' => implode(' ', array_filter([$entry->profile->user->first_name, $entry->profile->user->post_name, $entry->profile->user->last_name])),
            'matricule' => $entry->matricule ?? $entry->profile->matricule,
            'year' => $entry->academicYear->title,
            'level' => $entry->level->title,
            'linked' => $entry->nfc_card_exists,
            'eligible' => $eligible->has($entry->id),
        ]);

        return Inertia::render('dashboard/cardIssuance/NfcCards', [
            'rows' => $rows,
            'term' => $term,
            'success' => $request->session()->get('success'),
        ]);
    }

    public function assign(Request $request, AcademicEnrollment $enrollment): RedirectResponse
    {
        $input = $request->validate(['uid' => 'required|string|max:64']);
        $actor = $request->user();

        try {
            DB::transaction(function () use ($enrollment, $input, $actor) {
                $entry = AcademicStaffScope::apply(AcademicEnrollment::query(), $actor)->lockForUpdate()->findOrFail($enrollment->id);
                if (! $this->eligible(AcademicEnrollment::whereKey($entry->id))->exists()) {
                    throw ValidationException::withMessages(['uid' => 'Cette inscription n’est plus active pour l’association d’une carte NFC.']);
                }

                $fingerprint = StudentNfcCard::fingerprint($input['uid']);
                $card = $entry->nfcCard()->firstOrNew();
                if ($card->uid_hash === $fingerprint) {
                    return;
                }
                $action = $card->exists ? 'student_nfc_card_replaced' : 'student_nfc_card_linked';
                $card->uid_hash = $fingerprint;
                $entry->nfcCard()->save($card);
                Audit::record($actor->id, $action, $entry);
            }, 3);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['uid' => 'Cette carte NFC est déjà associée à une autre inscription.']);
        }

        return back(303)->with('success', 'Carte NFC associée à l’inscription.');
    }

    public function remove(Request $request, AcademicEnrollment $enrollment): RedirectResponse
    {
        $actor = $request->user();
        DB::transaction(function () use ($enrollment, $actor) {
            $entry = AcademicStaffScope::apply(AcademicEnrollment::query(), $actor)->lockForUpdate()->findOrFail($enrollment->id);
            if ($entry->nfcCard()->delete()) {
                Audit::record($actor->id, 'student_nfc_card_removed', $entry);
            }
        }, 3);

        return back(303)->with('success', 'Association de la carte NFC retirée.');
    }

    private function eligible(Builder $entries): Builder
    {
        return $entries->where('enrollment_status', 'confirmed')
            ->whereHas('profile', fn ($profile) => $profile->where('student_status', 'active'))
            ->whereHas('academicYear', fn ($year) => $year->where('status', 'open'))
            ->whereHas('application', fn ($application) => $application->where('status', 'validated'));
    }
}
