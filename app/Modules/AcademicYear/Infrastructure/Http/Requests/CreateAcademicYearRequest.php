<?php

namespace App\Modules\AcademicYear\Infrastructure\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CreateAcademicYearRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user?->can('manage academic access') && ! $user->academicFaculties()->exists();
    }

    public function rules(): array
    {
        return [
            'title' => 'required|string|unique:academic_years,title',
            'start_date' => 'required|date',
            'end_date' => 'required|date|after:start_date',
        ];
    }

    public function messages(): array
    {
        return [
            'title.required' => "Le titre est obligatoire.",
            'title.unique'   => "Cette année académique existe déjà.",
            'end_date.after' => "La date de fin doit être après la date de début.",
        ];
    }
}
