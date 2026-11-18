<?php

namespace App\Modules\Enrollment\Domain\Services;

use Illuminate\Validation\ValidationException;

final class DocumentReviewReasons
{
    public const LABELS = [
        'unreadable' => 'Document illisible',
        'incomplete' => 'Document incomplet',
        'expired' => 'Document expiré',
        'incorrect' => 'Document incorrect',
        'inconsistent' => 'Informations incohérentes',
        'non_compliant' => 'Document non conforme',
        'other' => 'Autre motif',
    ];

    public static function summarize(string $verdict, array $codes, string $detail): array
    {
        if (! in_array($verdict, ['rejected', 'correction_requested'], true)) {
            if ($codes !== [] || $detail !== '') {
                throw ValidationException::withMessages(['reason_codes' => 'Les motifs s’appliquent aux pièces refusées ou à corriger.']);
            }

            return ['codes' => [], 'reason' => ''];
        }

        $selected = array_intersect_key(self::LABELS, array_fill_keys($codes, true));
        if ($selected === [] || count($selected) !== count($codes)) {
            throw ValidationException::withMessages(['reason_codes' => 'Sélectionnez au moins un motif valide, sans doublon.']);
        }

        if (isset($selected['other']) && mb_strlen($detail) < 3) {
            throw ValidationException::withMessages(['reason' => 'Précisez l’autre motif en au moins trois caractères.']);
        }
        if (! isset($selected['other']) && $detail !== '') {
            throw ValidationException::withMessages(['reason' => 'Sélectionnez « Autre motif » pour ajouter une précision.']);
        }
        if (isset($selected['other'])) {
            $selected['other'] .= ' : '.$detail;
        }

        return ['codes' => array_keys($selected), 'reason' => implode(' ; ', $selected)];
    }
}
