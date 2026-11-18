<?php

namespace App\Modules\Level\Infrastructure\Http\Requests;

use App\Models\AcademicStructure\AcademicProgram;
use App\Models\Level;
use App\Modules\Teaching\Application\Services\TeachingScope;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateLevelRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        if (! $this->user()->can('manage', AcademicProgram::class)) {
            return false;
        }

        $level = Level::findOrFail($this->route('id'));
        $destination = $this->integer('faculty_id');

        return TeachingScope::allows($this->user(), (int) $level->faculty_id)
            && ($destination < 1 || TeachingScope::allows($this->user(), $destination));
    }

    public function administrativeUrl(): string
    {
        $parameters = ['id' => $this->route('id')];
        $tab = $this->query('tab');
        if (in_array($tab, ['infos', 'conditions', 'prof', 'cours'], true)) {
            $parameters['tab'] = $tab;
        }

        return route('dashboard.admin.levels.details.show', $parameters);
    }

    protected function getRedirectUrl(): string
    {
        return $this->administrativeUrl();
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            //
            'faculty_id'   => 'required|exists:faculties,id',
            'title'        => 'required|string|max:255',
            'code'         => 'required|string|max:10',
            'image'        => 'nullable|image|mimes:jpg,jpeg,png,webp|max:2048',
            'tag'          => 'nullable|string|max:50',
            'description'  => 'nullable|string',
            'is_active'    => 'nullable|boolean',
        ];
    }

    public function messages(): array
    {
        return [
            'faculty_id.required' => 'La faculté est requise',
            'faculty_id.exists' => 'La faculté n\'existe pas',
            'title.required' => 'Le nom du niveau est obligatoire.',
            'code.required' => 'Le code du niveau est obligatoire.',
            'code.unique' => 'Le code du niveau existe déjà.',
            'image.image' => 'L\'image doit être une image.',
            'image.max' => 'L’image ne doit pas dépasser 2 Mo.',
        ];
    }
}
