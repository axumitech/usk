<?php

namespace App\Modules\Assessment\Application;

use App\Models\Student\AcademicAssessment;
use App\Models\Student\AcademicOffering;
use App\Models\Student\AcademicResource;
use App\Models\User;
use App\Modules\Teaching\Application\Services\LearningFiles;
use App\Support\DocumentUploadLimit;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Throwable;

final class AssessmentDraftOptions
{
    private const FORMATS = ['pdf', 'docx', 'pptx', 'xlsx', 'txt', 'jpg', 'jpeg', 'png', 'webp'];

    private const DEFAULT_FORMATS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

    private const SUBJECT_DIRECTORY = 'learning-content/assessment-subjects';

    public function __construct(private LearningFiles $files) {}

    public function rules(): array
    {
        $maximum = DocumentUploadLimit::kilobytes();

        return [
            'subject' => ['nullable', 'file', 'max:'.$maximum], 'remove_subject' => 'sometimes|boolean',
            'submission_formats' => 'nullable|array|list|min:1|max:'.count(self::FORMATS),
            'submission_formats.*' => ['required', 'string', 'distinct:strict', Rule::in(self::FORMATS)],
            'submission_max_kb' => 'nullable|integer|min:1|max:'.$maximum,
        ];
    }

    public function formConfig(): array
    {
        return ['formats' => self::FORMATS, 'default_formats' => self::DEFAULT_FORMATS, 'maximum_kb' => DocumentUploadLimit::kilobytes()];
    }

    public function presentation(AcademicResource $resource): array
    {
        return self::submissionRules($resource->assessment) + [
            'subject' => $resource->path ? [
                'filename' => $resource->filename ?? 'Sujet de l’évaluation',
                'size_bytes' => $resource->size_bytes === null ? null : (int) $resource->size_bytes,
            ] : null,
        ];
    }

    public static function submissionRules(?AcademicAssessment $assessment): array
    {
        $platformMaximum = DocumentUploadLimit::kilobytes();

        return [
            'submission_formats' => $assessment?->submission_formats ?? self::DEFAULT_FORMATS,
            'submission_max_kb' => min($assessment?->submission_max_kb ?? $platformMaximum, $platformMaximum),
        ];
    }

    public static function checkSubmission(array $file, ?AcademicAssessment $assessment): void
    {
        $rules = self::submissionRules($assessment);
        AssessmentRules::require(in_array($file['extension'], $rules['submission_formats'], true), 'file',
            'Formats autorisés : '.strtoupper(implode(', ', $rules['submission_formats'])).'.');
        AssessmentRules::require($file['size_bytes'] <= $rules['submission_max_kb'] * 1024, 'file',
            'Le fichier dépasse la taille maximale de '.$rules['submission_max_kb'].' Kio pour cette évaluation.');
    }

    public function save(AssessmentWorkflow $workflow, AcademicOffering $offering, User $actor, array $input, ?AcademicResource $resource = null, ?UploadedFile $subject = null): AcademicResource
    {
        $remove = (bool) ($input['remove_subject'] ?? false);
        AssessmentRules::require(! ($subject && $remove), 'subject', 'Choisissez entre remplacer et retirer le sujet.');
        $written = null;
        try {
            return DB::transaction(function () use ($workflow, $offering, $actor, $input, $resource, $subject, $remove, &$written) {
                // The existing workflow validates the draft and authorization while holding the offering lock.
                $draft = $workflow->draft($offering, $actor, $input, $resource);
                $settings = $input['modality'] === 'submission' ? Arr::only($input, ['submission_formats', 'submission_max_kb'])
                    : ['submission_formats' => null, 'submission_max_kb' => null];
                if ($settings) {
                    $draft->assessment()->firstOrFail()->fill($settings)->save();
                }
                if ($subject || $remove) {
                    $previous = $draft->path;
                    $disk = $draft->disk;
                    $draft->fill($subject ? $this->storeSubject($subject, $written) : [
                        'path' => null, 'filename' => null, 'mime' => null, 'size_bytes' => null, 'sha256' => null,
                    ])->save();

                    if ($disk === 'local' && $previous && str_starts_with($previous, self::SUBJECT_DIRECTORY.'/')) {
                        DB::afterCommit(static function () use ($previous) {
                            try {
                                Storage::disk('local')->delete($previous);
                            } catch (Throwable $error) {
                                // Keep the committed subject usable; the file audit can identify residual files.
                                report($error);
                            }
                        });
                    }
                }

                return $draft;
            });
        } catch (Throwable $error) {
            if ($written !== null) {
                Storage::disk('local')->delete($written);
            }
            throw $error;
        }
    }

    private function storeSubject(UploadedFile $subject, ?string &$written): array
    {
        try {
            return $this->files->store($subject, $this->files->inspect($subject, 'material'), $written, self::SUBJECT_DIRECTORY);
        } catch (ValidationException $error) {
            throw ValidationException::withMessages(['subject' => $error->errors()['file'] ?? ['Le sujet n’a pas pu être enregistré.']]);
        }
    }
}
