<?php

namespace App\Modules\Student\Application\Services;

final class PaymentProofReviewReasons
{
    private const BY_DECISION = [
        'approve' => [
            'receipt_verified' => 'Paiement reçu et référence vérifiée.',
            'proof_matches' => 'Montant et justificatif conformes.',
            'other' => 'Autre motif',
        ],
        'reject' => [
            'amount_mismatch' => 'Montant non conforme.',
            'reference_missing' => 'Référence introuvable.',
            'unreadable' => 'Justificatif illisible.',
            'duplicate' => 'Justificatif déjà utilisé.',
            'other' => 'Autre motif',
        ],
    ];

    public static function options(): array
    {
        return self::BY_DECISION;
    }
}
