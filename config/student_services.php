<?php

return [
    'documents' => [
        'label' => 'Documents administratifs',
        'description' => 'Demandez une attestation, un relevé ou une copie de document.',
        'category' => 'document',
        'service' => 'Secrétariat académique',
        'procedures' => [
            'enrollment-certificate' => ['Attestation d’inscription', 'Précisez le motif et, si nécessaire, le destinataire de l’attestation.'],
            'attendance-certificate' => ['Attestation de fréquentation', 'Indiquez la période de fréquentation que le document doit couvrir.'],
            'success-certificate' => ['Attestation de réussite', 'Indiquez la formation et la session concernées.'],
            'transcript' => ['Relevé de notes', 'Précisez l’année et les périodes dont vous avez besoin.'],
            'schooling-certificate' => ['Certificat de scolarité', 'Précisez le motif et le destinataire du certificat.'],
            'document-duplicate' => ['Duplicata de document', 'Indiquez le type de document, sa date de délivrance et son numéro si vous le connaissez.'],
        ],
    ],
    'academic' => [
        'label' => 'Démarches académiques',
        'description' => 'Faites une demande liée à votre inscription, votre parcours ou vos résultats.',
        'category' => 'academic',
        'service' => 'Secrétariat académique',
        'procedures' => [
            'reenrollment' => ['Réinscription', 'Précisez l’année visée et la difficulté rencontrée dans votre réinscription.'],
            'promotion-change' => ['Changement de promotion', 'Indiquez la promotion demandée et expliquez votre situation.'],
            'program-change' => ['Changement de filière', 'Indiquez la filière souhaitée et les raisons du changement.'],
            'transfer' => ['Demande de transfert', 'Précisez l’établissement ou la formation concernés et la date souhaitée.'],
            'study-suspension' => ['Suspension des études', 'Indiquez la période de suspension souhaitée et les éléments utiles à l’examen de la demande.'],
            'study-resumption' => ['Reprise des études', 'Précisez la dernière année suivie et la période à laquelle vous souhaitez reprendre.'],
            'grade-correction' => ['Correction de notes', 'Indiquez le cours, l’évaluation et la note à vérifier.'],
            'academic-appeal' => ['Recours académique', 'Ouvrez le résultat officiel concerné pour déposer un recours selon les délais de publication.'],
            'enrollment-exception' => ['Demander une dérogation', 'Expliquez la situation exceptionnelle liée à votre inscription et joignez un justificatif si nécessaire. Le service examinera et orientera votre demande.'],
        ],
    ],
    'finance' => [
        'label' => 'Démarches financières',
        'description' => 'Demandez un échéancier, un justificatif ou la vérification d’un paiement.',
        'category' => 'finance',
        'service' => 'Service financier',
        'procedures' => [
            'fee-installments' => ['Échelonnement des frais', 'Indiquez les frais concernés et proposez des dates de règlement.'],
            'payment-verification' => ['Vérification d’un paiement non reconnu', 'Indiquez la date, le montant et la référence du paiement. Joignez le justificatif si vous l’avez.'],
            'payment-proof' => ['Justificatif de paiement', 'Précisez le paiement pour lequel vous avez besoin d’un justificatif.'],
            'finance-complaint' => ['Réclamation financière', 'Indiquez le montant ou la ligne de frais à vérifier et expliquez votre réclamation.'],
        ],
    ],
    'identity' => [
        'label' => 'Identité et dossier étudiant',
        'description' => 'Mettez votre dossier à jour et demandez les corrections nécessaires.',
        'category' => 'identity',
        'service' => 'Apparitorat',
        'procedures' => [
            'name-correction' => ['Correction de nom', 'Indiquez la correction demandée et joignez une pièce justificative si vous l’avez.'],
            'birth-date-correction' => ['Correction de date de naissance', 'Indiquez la date correcte et joignez une pièce justificative si vous l’avez.'],
            'contact-update' => ['Coordonnées', 'Mettez à jour votre numéro de téléphone, votre adresse ou votre adresse e-mail depuis votre profil.'],
            'photo-update' => ['Photo de profil', 'Ajoutez ou remplacez le portrait associé à votre dossier étudiant.'],
            'student-card' => ['Nouvelle carte d’étudiant', 'Précisez s’il s’agit d’une première carte ou d’un remplacement, ainsi que le motif de la demande.'],
            'file-regularization' => ['Régularisation des pièces du dossier', 'Précisez la pièce à compléter ou à remplacer et joignez le document si vous l’avez.'],
            'general-support' => ['Assistance administrative', 'Décrivez la situation pour que le service puisse orienter votre demande.'],
        ],
    ],
    'appointments' => [
        'label' => 'Rendez-vous administratifs',
        'description' => 'Choisissez un service et un créneau disponible.',
        'category' => 'appointment',
        'procedures' => [
            'registrar-appointment' => ['Rendez-vous avec l’apparitorat', 'Précisez le motif du rendez-vous.', 'Apparitorat'],
            'academic-secretariat-appointment' => ['Rendez-vous avec le secrétariat académique', 'Précisez la démarche académique à aborder.', 'Secrétariat académique'],
            'finance-appointment' => ['Rendez-vous avec le service financier', 'Précisez le paiement ou les frais concernés par le rendez-vous.', 'Service financier'],
            'other-appointment' => ['Rendez-vous avec un autre service', 'Indiquez le service demandé et le motif du rendez-vous.', 'Scolarité'],
        ],
    ],
];
