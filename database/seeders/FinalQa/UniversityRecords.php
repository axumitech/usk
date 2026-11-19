<?php

namespace Database\Seeders\FinalQa;

use App\Models\Student\AcademicAttendance;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicOfficialResult;
use App\Models\Student\AcademicOffering;
use App\Models\Student\OfficialDocumentType;
use App\Models\User;
use App\Modules\Assessment\Application\AssessmentSubmissions;
use App\Modules\Assessment\Application\AssessmentWorkflow;
use App\Modules\Documents\Application\DocumentCatalog;
use App\Modules\Documents\Application\DocumentPdf;
use App\Modules\Documents\Application\DocumentWorkflow;
use App\Modules\Results\Application\ResultAppeals;
use App\Modules\Student\Application\Services\Audit;
use App\Modules\Teaching\Application\Services\LearningContent;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

final class UniversityRecords
{
    public function practice(AcademicOffering $offer, User $teacher, array $entries): void
    {
        $workflow = app(AssessmentWorkflow::class);
        $work = Carbon::withTestNow('2026-05-18 10:00:00 Africa/Kinshasa', function () use ($offer, $teacher, $workflow) {
            $pdf = app(DocumentPdf::class)->render('<h1>Support pédagogique fictif</h1><p>Exercice et consignes du cours témoin.</p>');
            app(LearningContent::class)->create($offer, $teacher, ['kind' => 'material', 'title' => 'Consignes de l’exercice formatif',
                'body' => 'Support réservé aux inscrits de ce cours.', 'publish' => true, 'notify' => false,
                'operation_key' => (string) Str::uuid(), 'reason' => UniversityCatalog::REASON],
                UploadedFile::fake()->createWithContent('consignes.pdf', $pdf));
            $work = $workflow->draft($offer, $teacher, ['title' => 'Exercice formatif hors moyenne annuelle', 'body' => 'Exercice de préparation fictif.',
                'category' => 'practical', 'session_code' => 'ordinaire', 'modality' => 'submission',
                'opens_at' => '2026-05-19T08:00', 'closes_at' => '2026-05-22T18:00', 'maximum_points' => '20', 'attempt_limit' => 1,
                'late_minutes' => 0, 'group_work' => false, 'feedback_policy' => 'validated', 'reason' => UniversityCatalog::REASON]);
            $workflow->lifecycle($work, $teacher, ['action' => 'publish', 'revision' => $work->assessment()->sole()->revision,
                'notify' => false, 'reason' => UniversityCatalog::REASON]);

            return $work;
        });
        Carbon::withTestNow('2026-05-20 10:00:00 Africa/Kinshasa', function () use ($work, $entries) {
            foreach (array_slice(array_values($entries), 1) as $entry) {
                app(AssessmentSubmissions::class)->submit($entry, $work, ['body' => 'Réponse individuelle fictive à l’exercice.',
                    'operation_key' => (string) Str::uuid(), 'expected_version' => 0], null, $entry->profile->user_id);
            }
        });
        Carbon::withTestNow('2026-05-23 10:00:00 Africa/Kinshasa', fn () => $workflow->lifecycle($work, $teacher, [
            'action' => 'close', 'revision' => $work->assessment()->sole()->revision, 'reason' => UniversityCatalog::REASON]));
    }

    public function documents(array $catalog, array $students, User $manager): void
    {
        $workflow = app(DocumentWorkflow::class);
        $types = [];
        foreach ($students as $key => $levels) {
            $faculty = $catalog['faculties'][$key];
            $code = $catalog['faculty_codes'][$key];
            $signer = User::where('email', 'dean.'.$code.'@usk.test')->sole();
            $issuer = User::where('email', 'registrar.'.$code.'@usk.test')->sole();
            $entries = array_values(reset($levels));
            foreach (['enrollment' => 'Attestation', 'card' => 'Carte'] as $kind => $label) {
                $type = $types[$code][$kind] ??= $this->type($kind, $label, $faculty->id, $catalog['university']->id, $manager, $signer);
                foreach ([4, 5] as $position) {
                    $entry = $entries[$position];
                    if ($kind === 'card') {
                        $this->photo($entry, $issuer);
                    }
                    $request = $workflow->submit($entry->fresh(), $type, $entry->profile->user, [
                        'action' => 'initial', 'operation_key' => (string) Str::uuid(), 'reason' => UniversityCatalog::REASON,
                    ], true);
                    if ($position === 5) {
                        continue;
                    }
                    $workflow->transition($request->refresh(), $manager, ['action' => 'review', 'revision' => $request->document_revision, 'reason' => UniversityCatalog::REASON]);
                    $workflow->transition($request->refresh(), $signer, ['action' => 'approve', 'revision' => $request->document_revision, 'reason' => UniversityCatalog::REASON]);
                    $document = $workflow->issue($request->refresh(), $issuer, $request->document_revision);
                    if ($kind === 'card') {
                        $workflow->lifecycle($document, $issuer, 'print', UniversityCatalog::REASON);
                        $workflow->lifecycle($document->refresh(), $issuer, 'deliver', UniversityCatalog::REASON);
                    }
                }
            }
        }
    }

    private function type(string $kind, string $name, int $faculty, int $university, User $manager, User $signer): OfficialDocumentType
    {
        $catalog = app(DocumentCatalog::class);
        $type = $catalog->createType($manager, ['faculty_id' => $faculty, 'university_id' => $university,
            'name' => $name.' de simulation', 'code' => $kind === 'card' ? 'CAR' : 'ATT', 'kind' => $kind, 'student_request' => true,
            'download' => true, 'print' => true, 'copies' => true, 'financial_gate' => true, 'valid_days' => $kind === 'card' ? 365 : null, 'reason' => UniversityCatalog::REASON]);
        $template = $catalog->template($manager, $type, ['title' => $name.' fictive USK', 'body' => 'SPÉCIMEN — {{ student }} — {{ year }}.',
            'signer_id' => $signer->id, 'capacity' => 'Doyen fictif', 'reason' => UniversityCatalog::REASON]
            + ($kind === 'card' ? ['width_mm' => 85.6, 'height_mm' => 53.98, 'margin_mm' => 3, 'color' => '#203852'] : []));
        $catalog->templateState($signer, $template, 'approve', UniversityCatalog::REASON);
        $catalog->activate($signer, $type, true, UniversityCatalog::REASON);

        return $type->refresh();
    }

    private function photo(AcademicEnrollment $entry, User $reviewer): void
    {
        $profile = $entry->profile;
        $path = 'qa-final/photos/'.$profile->id.'.png';
        $specimen = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+pBp0AAAAASUVORK5CYII=', true);
        if (! Storage::disk('local')->put($path, $specimen)) {
            throw new \RuntimeException('Le spécimen privé de photo ne peut être enregistré.');
        }
        $profile->forceFill(['photo_path' => $path])->save();
        $review = $entry->cardRequest()->create(['photo_version' => $profile->cardPhotoVersion(), 'status' => 'approved',
            'reviewed_at' => now(), 'reviewed_by' => $reviewer->id, 'decision_note' => UniversityCatalog::REASON]);
        Audit::record($reviewer->id, 'qa_card_photo_reviewed', $review, UniversityCatalog::REASON);
    }

    public function justify(AcademicAttendance $attendance, User $student, User $reviewer): void
    {
        $case = $attendance->justification()->create(['status' => 'submitted', 'reason' => 'Empêchement déclaré dans la simulation.',
            'submission_history' => [], 'revision' => 1]);
        Audit::record($student->id, 'absence_justification_submitted', $case, UniversityCatalog::REASON);
        $case->update(['status' => 'accepted', 'reviewed_by' => $reviewer->id, 'decided_at' => now(),
            'decision_reason' => 'Pièce fictive examinée pour cette séance.', 'revision' => 2]);
        Audit::record($reviewer->id, 'absence_justification_reviewed', $case, UniversityCatalog::REASON,
            ['from' => 'submitted', 'to' => 'accepted', 'revision' => 2]);
    }

    public function appeal(AcademicEnrollment $entry, User $manager, User $publisher): void
    {
        $result = AcademicOfficialResult::published()->where('academic_enrollment_id', $entry->id)->sole();
        $service = app(ResultAppeals::class);
        $appeal = $service->submit($result, $entry, $entry->profile->user, ['target' => 'decision',
            'body' => 'Je sollicite une vérification de la décision sur ce dossier fictif.'], null);
        foreach (['review', 'admit', 'investigate', 'reject'] as $action) {
            $appeal->refresh();
            $service->decide($appeal, $action === 'reject' ? $publisher : $manager, ['action' => $action,
                'revision' => $appeal->result_revision, 'assigned_to' => $manager->id, 'reason' => 'Vérification documentée des copies et des notes fictives.']);
        }
    }
}

