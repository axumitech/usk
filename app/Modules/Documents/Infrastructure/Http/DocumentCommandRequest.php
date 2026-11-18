<?php

namespace App\Modules\Documents\Infrastructure\Http;

use App\Models\Student\OfficialDocumentType;
use App\Modules\Documents\Application\DocumentQueries;
use App\Modules\Documents\Application\StudentDocumentLibrary;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class DocumentCommandRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function libraryUrl(?int $actionAcademic = null): ?string
    {
        if (! $this->routeIs('dashboard.student.official-documents.submit', 'dashboard.student.official-documents.transition')
            || ! $this->query->has('library_academic')) {
            return null;
        }
        $profile = $this->user()?->studentProfile;
        $display = filter_var($this->query('library_academic'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        $academic = $display && $profile?->enrollments()
            ->whereHas('application', fn ($q) => $q->where('student_id', $profile->user_id))
            ->whereKey($display)->exists() ? $display : $actionAcademic;

        $view = $this->query('request');
        $view = in_array($view, DocumentQueries::REQUEST_VIEWS, true) ? $view : null;

        return route('dashboard.student.index', [
            'section' => 'documents', 'academic' => $academic, 'category' => StudentDocumentLibrary::filter($this->query('category')),
            'request' => $view,
        ]).($view ? '#student-document-services' : '');
    }

    public function adminWorkspace(): string
    {
        $parameters = match ($this->route()->getActionMethod()) {
            'activate', 'template' => ['type' => $this->route('type')->id],
            'templateState' => ['type' => $this->route('template')->official_document_type_id],
            'submit' => ['academic' => $this->route('entry')->id],
            default => [],
        };
        foreach (['academic', 'type'] as $field) {
            $value = filter_var($this->query($field), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
            if ($value !== false) {
                $parameters[$field] ??= $value;
            }
        }
        foreach ([
            'status' => ['open', 'reviewed', 'correction', 'approved', 'refused', 'issued'],
            'kind' => OfficialDocumentType::KINDS,
            'archive' => ['print', 'delivery', 'issued', 'revoked', 'replaced'],
        ] as $field => $values) {
            $value = $this->query($field);
            if (in_array($value, $values, true)) {
                $parameters[$field] = $value;
            }
        }
        $q = $this->query('q');
        if (is_string($q) && mb_strlen($q) <= 100) {
            $parameters['q'] = $q;
        }

        return route('dashboard.admin.official-documents.index', $parameters);
    }

    protected function getRedirectUrl()
    {
        if ($this->routeIs('dashboard.admin.official-documents.*')) {
            return $this->adminWorkspace();
        }

        return $this->libraryUrl() ?? parent::getRedirectUrl();
    }

    public function rules(): array
    {
        $reason = 'required|string|min:5|max:2000';
        $revision = 'required|integer|min:1';
        $asset = 'nullable|file|extensions:png|mimes:png|max:256|dimensions:max_width=1200,max_height=1200';

        return match ($this->route()->getActionMethod()) {
            'type' => [
                'university_id' => 'required|integer|min:1', 'faculty_id' => 'required|integer|min:1',
                'code' => 'required|alpha_dash:ascii|max:25', 'name' => 'required|string|max:140',
                'kind' => ['required', Rule::in(OfficialDocumentType::KINDS)], 'student_request' => 'required|boolean',
                'download' => 'required|boolean', 'print' => 'required|boolean', 'copies' => 'required|boolean', 'financial_gate' => 'required|boolean',
                'valid_days' => 'nullable|integer|between:0,3650', 'decisions' => 'nullable|string|max:600|regex:/^[a-z0-9_,\s-]+$/D',
                'minimum_credits' => 'nullable|integer|between:0,10000000', 'program_id' => 'nullable|integer|min:1',
                'regulation' => 'nullable|string|max:500', 'retention' => 'nullable|string|max:500', 'reason' => $reason,
            ],
            'activate' => ['active' => 'required|boolean', 'reason' => $reason],
            'template' => [
                'title' => 'required|string|max:140', 'body' => 'required|string|max:3500',
                'signer_id' => 'required|integer|min:1', 'capacity' => 'required|string|max:140', 'reason' => $reason,
                'width_mm' => 'nullable|numeric|between:65,110', 'height_mm' => 'nullable|numeric|between:45,80',
                'margin_mm' => 'nullable|integer|between:2,8', 'color' => 'nullable|string|regex:/^#[0-9a-fA-F]{6}$/D',
                'logo' => $asset, 'signature' => $asset, 'stamp' => $asset,
            ],
            'templateState' => ['action' => 'required|in:approve,withdraw', 'reason' => $reason],
            'submit' => ['type_id' => 'required|integer|min:1', 'action' => 'required|in:initial,duplicate,replace',
                'previous_id' => 'nullable|integer|min:1', 'reason' => $reason, 'operation_key' => 'required|uuid'],
            'transition' => ['action' => 'required|in:review,correct,resubmit,refuse,approve,recheck', 'revision' => $revision, 'reason' => $reason,
                'mandate' => 'nullable|string|min:5|max:1000'],
            'issue' => ['revision' => $revision],
            'lifecycle' => ['action' => 'required|in:print,deliver,revoke', 'reason' => $reason],
            'revokeResult' => ['reason' => $reason],
            default => [],
        };
    }
}
