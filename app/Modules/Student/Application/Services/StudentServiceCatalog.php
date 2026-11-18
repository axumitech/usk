<?php

namespace App\Modules\Student\Application\Services;

use App\Models\Student\AcademicEnrollment;
use App\Modules\Documents\Application\DocumentQueries;
use Illuminate\Support\Collection;

final class StudentServiceCatalog
{
    public const ENROLLMENT_EXCEPTION = 'enrollment-exception';

    public const EXCEPTION_NOTICE = 'Cette démarche permet de demander un examen et une orientation. Son dépôt et la réponse ne valent pas accord de dérogation et ne modifient ni votre inscription, ni vos frais, ni vos accès. Le statut « Traitée » concerne uniquement le suivi de la demande.';

    private const OFFICIAL_DOCUMENTS = [
        'enrollment-certificate' => 'enrollment',
        'schooling-certificate' => 'schooling',
        'success-certificate' => 'success',
        'student-card' => 'card',
    ];

    public function __construct(private DocumentQueries $documents) {}

    public static function find(?string $procedure): ?array
    {
        if ($procedure === null) {
            return null;
        }
        foreach (config('student_services') as $group => $category) {
            if (isset($category['procedures'][$procedure])) {
                return self::procedure($group, $category, $procedure);
            }
        }

        return null;
    }

    public function categories(AcademicEnrollment $entry, array $permissions): array
    {
        $canRequestDocuments = $permissions['documents_request']['allowed'];
        $officialKinds = $canRequestDocuments ? $this->documents->requestableTypes($entry)->pluck('kind') : collect();
        $hasCopies = $canRequestDocuments && $this->documents->duplicateCandidates($entry) !== [];
        $hasLegacyCard = $officialKinds->contains('card') && $entry->cardIssuance()->exists();
        $categories = [];

        foreach (config('student_services') as $group => $category) {
            $categories[] = [
                'id' => $group, 'label' => $category['label'], 'description' => $category['description'],
                'procedures' => array_map(fn ($id) => $this->action(self::procedure($group, $category, $id), $entry, $permissions, $officialKinds, $hasCopies, $hasLegacyCard),
                    array_keys($category['procedures'])),
            ];
        }

        return $categories;
    }

    private static function procedure(string $group, array $category, string $id): array
    {
        [$label, $description] = $category['procedures'][$id];

        return [
            'id' => $id, 'label' => $label, 'description' => $description, 'group' => $group,
            'category' => $category['category'], 'service' => $category['procedures'][$id][2] ?? $category['service'],
            'attachment' => $group !== 'appointments',
            'notice' => $id === self::ENROLLMENT_EXCEPTION ? self::EXCEPTION_NOTICE : null,
        ];
    }

    public function forStudent(AcademicEnrollment $entry, array $permissions, array $procedure): array
    {
        $id = $procedure['id'];
        $canRequestDocuments = $permissions['documents_request']['allowed'];
        $officialKinds = $canRequestDocuments && isset(self::OFFICIAL_DOCUMENTS[$id]) ? $this->documents->requestableTypes($entry)->pluck('kind') : collect();
        $hasCopies = $canRequestDocuments && $id === 'document-duplicate' && $this->documents->duplicateCandidates($entry) !== [];
        $hasLegacyCard = $id === 'student-card' && $officialKinds->contains('card') && $entry->cardIssuance()->exists();

        return $this->action($procedure, $entry, $permissions, $officialKinds, $hasCopies, $hasLegacyCard);
    }

    private function action(array $procedure, AcademicEnrollment $entry, array $permissions, Collection $officialKinds, bool $hasCopies, bool $hasLegacyCard): array
    {
        $id = $procedure['id'];
        $official = self::OFFICIAL_DOCUMENTS[$id] ?? null;
        $officialFlow = $official !== null && $officialKinds->contains($official);
        $canReadResults = $permissions['results_view']['allowed'];
        $mode = match (true) {
            in_array($id, ['contact-update', 'photo-update', 'academic-appeal'], true),
            $officialFlow && ($id !== 'student-card' || ! $hasLegacyCard),
            $id === 'document-duplicate' && $hasCopies => 'link',
            default => 'request',
        };
        $academic = ['academic' => $entry->id];
        $links = match ($id) {
            'enrollment-certificate', 'schooling-certificate', 'success-certificate' => $officialFlow
                ? [$this->portal('documents', $entry, ['request' => $official]).'#student-document-services', 'Ouvrir la demande officielle'] : [],
            'document-duplicate' => $hasCopies ? [$this->portal('documents', $entry, ['request' => 'duplicate']).'#student-document-services', 'Choisir le document'] : [],
            'transcript' => $canReadResults ? [$this->portal('results', $entry), 'Consulter mes résultats et relevés'] : [],
            'academic-appeal' => $canReadResults ? [$this->portal('results', $entry), 'Ouvrir mes résultats'] : [],
            'reenrollment' => [route('dashboard.student.enrollments', $academic, false), 'Consulter mes inscriptions'],
            'payment-proof' => [$this->portal('transactions', $entry, ['view' => 'receipts']), 'Voir mes reçus de paiement'],
            'contact-update' => [$this->portal('profile', $entry, ['view' => 'personal']), 'Modifier mes coordonnées'],
            'photo-update' => [$this->portal('profile', $entry, ['view' => 'photo']), 'Mettre à jour ma photo'],
            'student-card' => [$this->portal('card', $entry), 'Ouvrir ma carte étudiante'],
            'file-regularization' => [$this->portal('documents', $entry), 'Consulter mes documents'],
            default => [],
        };
        $unavailable = match (true) {
            ($procedure['category'] === 'document' || $id === 'student-card') && ! $permissions['documents_request']['allowed'] => $permissions['documents_request']['reason'] ?? 'La demande de documents est indisponible pour cette inscription.',
            $id === 'academic-appeal' && ! $canReadResults => $permissions['results_view']['reason'] ?? 'Les résultats officiels sont indisponibles pour cette inscription.',
            default => null,
        };

        return $procedure + [
            'mode' => $mode,
            'href' => $unavailable ? null : ($links[0] ?? null),
            'link_label' => $unavailable ? null : ($links[1] ?? null),
            'unavailable_reason' => $unavailable,
        ];
    }

    private function portal(string $section, AcademicEnrollment $entry, array $query = []): string
    {
        return route('dashboard.student.index', ['section' => $section, 'academic' => $entry->id] + $query, false);
    }
}
