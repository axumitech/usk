<?php

namespace App\Modules\Student\Infrastructure\Http\Controllers;

use App\Models\Student\StudentPaymentProof;
use App\Modules\Student\Application\Services\PaymentProofReviewReasons;
use App\Modules\Student\Application\Services\StudentFinanceService;
use App\Modules\Student\Application\Services\StudentPaymentProofs;
use App\Support\DocumentUploadLimit;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

final class StudentPaymentProofController
{
    public function __construct(private StudentPaymentProofs $proofs) {}

    public function store(Request $request, StudentPortalController $portal): RedirectResponse
    {
        $entry = $portal->context($request);
        $url = route('dashboard.student.index', ['section' => 'fees', 'academic' => $entry->id], false);
        try {
            $data = $request->validate([
                'kind' => 'required|string|max:50|regex:/^[a-z][a-z0-9_]*$/D',
                'amount' => 'required|string|max:20',
                'method' => ['required', 'string', Rule::in(config('finance.methods'))],
                'reference' => 'required|string|max:180',
                'proof' => DocumentUploadLimit::proofRules(),
            ], DocumentUploadLimit::proofMessages('proof'));
            $this->proofs->submit($entry, $request->user(), $data, $data['proof']);
        } catch (ValidationException $exception) {
            throw $exception->redirectTo($url);
        }

        return redirect()->to($url, 303)->with('success', 'Justificatif transmis. La comptabilité va vérifier le versement.');
    }

    public function studentDownload(Request $request, StudentPaymentProof $proof): StreamedResponse
    {
        $this->proofs->authorizeStudent($proof->enrollment, $request->user());

        return $this->download($proof);
    }

    public function adminDownload(Request $request, StudentPaymentProof $proof, StudentFinanceService $finance): StreamedResponse
    {
        $finance->authorize($proof->enrollment, $request->user());

        return $this->download($proof);
    }

    public function review(Request $request, StudentPaymentProof $proof, StudentFinanceService $finance): RedirectResponse
    {
        $finance->authorize($proof->enrollment, $request->user());
        $url = FinanceScreenReturn::account($request, $proof->academic_enrollment_id);
        try {
            $decision = $request->validate([
                'decision' => 'required|in:approve,reject',
            ], [
                'decision.required' => 'Indiquez la décision sur le justificatif.',
                'decision.in' => 'La décision sur le justificatif est invalide.',
            ])['decision'];
            $reasons = PaymentProofReviewReasons::options()[$decision];
            $requiresComment = ! $request->has('reason_code') || $request->input('reason_code') === 'other';
            $data = $request->validate([
                'reason_code' => ['sometimes', 'required', 'string', Rule::in(array_keys($reasons))],
                'reason' => [Rule::requiredIf($requiresComment), 'nullable', 'string', 'min:10', 'max:1000'],
                'distinct_receipt_verified' => ['sometimes', 'boolean'],
            ], [
                'reason_code.required' => 'Sélectionnez un motif de décision.',
                'reason_code.string' => 'Sélectionnez un motif de décision valide.',
                'reason_code.in' => 'Ce motif ne correspond pas à la décision choisie.',
                'reason.required' => 'Précisez le motif de cette décision.',
                'reason.string' => 'Le commentaire doit être du texte.',
                'reason.min' => 'Le commentaire doit contenir au moins 10 caractères.',
                'reason.max' => 'Le commentaire doit contenir au maximum 1 000 caractères.',
                'distinct_receipt_verified.boolean' => 'La vérification du reçu doit être confirmée avec la case prévue.',
            ]);
            $code = $data['reason_code'] ?? null;
            $reason = $requiresComment ? $data['reason'] : $reasons[$code];
            $status = $this->proofs->review($proof, $request->user(), $decision, $reason, $code, $request->boolean('distinct_receipt_verified'));
        } catch (ValidationException $exception) {
            throw $exception->redirectTo($url);
        }

        $message = match ($status) {
            'confirmed' => 'Justificatif accepté et versement confirmé.',
            'pending' => 'Justificatif vérifié. Un autre agent doit confirmer le versement.',
            default => 'Justificatif refusé. Le motif est visible dans le compte de l’étudiant.',
        };

        return redirect()->to($url, 303)->with('success', $message);
    }

    private function download(StudentPaymentProof $proof): StreamedResponse
    {
        $disk = Storage::disk('local');
        abort_unless($disk->exists($proof->file_path), 404);

        return $disk->download($proof->file_path, 'justificatif-'.$proof->id.'.'.pathinfo($proof->file_path, PATHINFO_EXTENSION), [
            'Cache-Control' => 'private, no-store',
            'Content-Type' => 'application/octet-stream',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
