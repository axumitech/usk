<?php

namespace App\Modules\Student\Infrastructure\Http\Requests;

use App\Modules\Student\Application\Services\AcademicEnrollmentService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

final class ChangeAcademicEnrollmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('manage', $this->route('academic')) ?? false;
    }

    public function workspaceUrl(): string
    {
        $filters = Validator::make($this->query(), [
            'q' => 'nullable|string|max:150', 'year' => 'nullable|integer|exists:academic_years,id',
            'status' => ['nullable', Rule::in(array_keys(AcademicEnrollmentService::TRANSITIONS))],
            'faculty' => 'nullable|integer|exists:faculties,id', 'program' => 'nullable|integer|exists:academic_programs,id',
            'level' => 'nullable|integer|exists:levels,id', 'promotion' => 'nullable|integer|exists:academic_promotions,id',
            'group' => 'nullable|integer|exists:classes,id',
        ]);

        return route('dashboard.admin.student-academic.administration', ['academic' => $this->route('academic')->id]
            + ($filters->passes() ? $filters->validated() : []));
    }

    protected function getRedirectUrl(): string
    {
        return $this->workspaceUrl();
    }

    public function messages(): array
    {
        return [
            'reason.required' => 'Indiquez le motif de la décision.',
            'reason.min' => 'Le motif doit contenir au moins 10 caractères.',
        ];
    }

    public function rules(): array
    {
        return [
            'expected_status' => ['required', Rule::in(array_keys(AcademicEnrollmentService::TRANSITIONS))],
            'expected_context' => 'sometimes|string|size:64',
            'service_request_id' => 'nullable|integer|exists:student_service_requests,id',
            'student_response' => 'required_with:service_request_id|nullable|string|min:5|max:6000',
            'operation_key' => 'required|uuid', 'reason' => 'required|string|min:10|max:1000',
            'enrollment_status' => ['required', Rule::in(array_keys(AcademicEnrollmentService::TRANSITIONS))],
            'class_id' => 'sometimes|nullable|integer|exists:classes,id',
            'academic_department_id' => 'sometimes|nullable|integer|exists:academic_departments,id',
            'ends_at' => 'nullable|date|after:now',
        ];
    }
}
