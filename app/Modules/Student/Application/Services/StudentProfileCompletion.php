<?php

namespace App\Modules\Student\Application\Services;

use App\Models\Student\AcademicEnrollment;

final class StudentProfileCompletion
{
    private const FIELDS = [
        'birth_date' => ['Date de naissance', 'identity'],
        'birth_place' => ['Lieu de naissance', 'identity'],
        'first_name' => ['Prénom', 'identity'],
        'last_name' => ['Nom', 'identity'],
        'gender' => ['Sexe', 'identity'],
        'marital_status' => ['État civil', 'identity'],
        'phone' => ['Téléphone', 'contact'],
        'email' => ['Adresse e-mail', 'contact'],
        'province' => ['Province d’origine', 'address'],
        'residence_commune' => ['Commune de résidence', 'address'],
        'home_address' => ['Adresse du domicile', 'address'],
        'emergency_name' => ['Nom du contact d’urgence', 'emergency'],
        'emergency_phone' => ['Téléphone du contact d’urgence', 'emergency'],
        'diploma_type' => ['Type de diplôme', 'diploma'],
        'diploma_number' => ['Numéro du diplôme', 'diploma'],
        'diploma_section' => ['Section du diplôme', 'diploma'],
        'diploma_school' => ['Établissement du diplôme', 'diploma'],
        'diploma_year' => ['Année d’obtention du diplôme', 'diploma'],
        'photo' => ['Photo de profil', 'photo'],
    ];

    private const CONDITIONAL_FIELDS = [
        'other_province' => ['Province ou région à préciser', 'address', 'province'],
        'other_diploma' => ['Diplôme à préciser', 'diploma', 'diploma_type'],
    ];

    public function summary(AcademicEnrollment $entry, bool $hasPhoto): array
    {
        $profile = $entry->profile;
        $details = $profile->personal_details ?? [];
        $values = $profile->user->only(['first_name', 'last_name', 'gender', 'email'])
            + ['photo' => $hasPhoto ? true : null] + $details;
        $fields = self::FIELDS;
        foreach (self::CONDITIONAL_FIELDS as $key => [$label, $section, $parent]) {
            if (($values[$parent] ?? null) === 'other') {
                $fields[$key] = [$label, $section];
            }
        }

        $profileRoute = ['section' => 'profile', 'academic' => $entry->id];
        $missing = [];
        foreach ($fields as $key => [$label, $section]) {
            if (filled($values[$key] ?? null)) {
                continue;
            }
            $edit = $key === 'photo' ? ['view' => 'photo'] : ['view' => 'personal', 'edit' => $key];
            $missing[] = ['key' => $key, 'label' => $label, 'section' => $section, 'href' => route('dashboard.student.index', $profileRoute + $edit, false)];
        }

        return [
            'missing' => $missing,
            'href' => $missing[0]['href'] ?? route('dashboard.student.index', $profileRoute, false),
            'completed' => count($fields) - count($missing),
            'total' => count($fields),
        ];
    }

    public function editField(mixed $field): ?string
    {
        return is_string($field) && $field !== 'photo' && (isset(self::FIELDS[$field]) || isset(self::CONDITIONAL_FIELDS[$field]))
            ? $field
            : null;
    }
}
