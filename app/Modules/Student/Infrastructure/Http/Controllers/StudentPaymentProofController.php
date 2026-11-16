<?php

namespace App\Modules\Student\Infrastructure\Http\Controllers;

use App\Models\Student\StudentPaymentProof;
use App\Modules\Student\Application\Services\StudentFinanceService;
use App\Modules\Student\Application\Services\StudentPaymentProofs;
use App\Support\DocumentUploadLimit;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
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
                'proof' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png,webp', 'extensions:pdf,jpg,jpeg,png,webp', 'max:'.DocumentUploadLimit::kilobytes()],
            ]);
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
        $url = $this->accountUrl($request, $proof);
        try {
            $data = $request->validate([
                'decision' => 'required|in:approve,reject',
                'reason' => 'required|string|min:10|max:1000',
            ]);
            $status = $this->proofs->review($proof, $request->user(), $data['decision'], $data['reason']);
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

    private function accountUrl(Request $request, StudentPaymentProof $proof): string
    {
        $parameters = ['academic' => $proof->academic_enrollment_id];
        $referer = parse_url($request->headers->get('referer') ?? '');
        if (($referer['path'] ?? null) === route('dashboard.admin.finance.index', [], false)) {
            parse_str($referer['query'] ?? '', $query);
            if (($query['academic'] ?? null) === (string) $proof->academic_enrollment_id) {
                $parameters += Arr::only(array_filter($query, 'is_string'), [
                    'q', 'year', 'faculty', 'program', 'level', 'from_confirmations', 'confirmation_q', 'confirmation_page',
                    'from_proofs', 'page', 'payments_page', 'refunds_page', 'adjustments_page',
                ]);
            }
        }

        return route('dashboard.admin.finance.index', $parameters, false);
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
