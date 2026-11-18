# Ordre 02 — Candidature et reprise des brouillons

Date : 18 novembre 2026. Périmètre : parcours candidat actif du module Enrollment, sur `fix/usk-recette-manuelle-v2`, après `00b827e`. Aucun push, merge ou déploiement.

## Diagnostic et corrections

Le bug de reprise est reproduit par un test exécutant la source réelle de `useEnrollmentForm` : une sauvegarde avec `program: ''` est retournée par Laravel comme `program: null`. Avant de quitter, le formulaire conserve sa chaîne vide ; après reprise, le snapshot réinjecte le null et `.trim()` échoue avant tout POST. Le même défaut concerne `name` et `email`. La normalisation à la réhydratation corrige ce contrat sans rendre obligatoires les champs d’un brouillon.

Autres écarts corrigés : validation complète de la formation imposée par l’action de sauvegarde partielle ; sélection du programme subordonnée au niveau ; choix non filtrés par année/campagne ; effacement explicite d’un choix qui conservait son ancien ID canonique ; déduplication des dossiers partiels qui ne distinguait pas les facultés sans niveau.

Les contrôles de propriété, d’expiration, de statut et d’unicité sont conservés. Les documents omis dans une mise à jour partielle restent attachés ; une suppression explicite reste possible. La soumission vérifie toujours les exigences actuelles, les fichiers réels, l’année, les relations et la campagne. L’absence de campagne conserve le comportement existant.

## Parcours et HTTP

1. Année académique → faculté → programme/filière → niveau. Intitulé libre uniquement pour une formation historique sans programme officiel.
2. Coordonnées personnelles existantes.
3. Pièces d’identité puis justificatifs académiques du parcours antérieur.
4. Récapitulatif, confirmation et soumission.

Les informations académiques antérieures continuent d’être justifiées par les pièces existantes. Aucun champ ou référentiel métier supplémentaire n’est inventé.

Contrat actif vérifié : `GET /app/dashboard/enrollments/create`, `GET /app/dashboard/enrollments/{uuid}/edit`, `POST /app/dashboard/enrollments/save-progress` pour créer **et** modifier, `POST /app/dashboard/enrollments/documents/upload`, `GET /app/dashboard/enrollment/requirements`, puis `POST /app/dashboard/enrollments/{uuid}/submit`. Aucun désaccord POST/PATCH ni 405 n’a été reproduit sur ce parcours. Les routes restent inchangées. Les anciens contrôleurs et Form Requests non raccordés ne sont pas modifiés.

La première sauvegarde conserve le même dossier et son URL de reprise. La sauvegarde pour plus tard affiche une confirmation et permet de revenir à Mes candidatures. Les erreurs de champs sont affichées sans effacer le formulaire.

## Schéma et retour arrière

La migration d’origine appelait `nullable()` après `constrained()` : `enrollments.level_id` restait effectivement NOT NULL. La nouvelle migration `2026_11_18_090000_allow_enrollment_drafts_without_a_level.php` rend uniquement cette colonne nullable, en conservant sa clé étrangère. Elle est nécessaire pour enregistrer dès l’année ou le programme, avant le niveau.

Elle a été exécutée exclusivement sur des bases de test isolées. Son application sur un environnement réel appartient à une livraison ultérieure approuvée. Aucun traitement de données existantes ni suppression n’est prévu. Le retour arrière refuse de rétablir NOT NULL tant que des dossiers sans niveau subsistent, y compris archivés ; ils doivent être complétés avant ce retour arrière. Ce refus protège les données.

## Vérifications

Les tests couvrent la sauvegarde partielle, les nulls serveur, la déconnexion/reconnexion puis reprise du même UUID, les pièces conservées, la poursuite et la soumission, le dossier déjà soumis, les autres propriétaires, les choix vidés, les campagnes fermées/futures/expirées, le fallback sans campagne, les doublons et les sauvegardes concurrentes. La migration aller/retour et le maintien de sa clé étrangère sont contrôlés sur SQLite et PostgreSQL. Les tests de l’activation à 30 % de l’Ordre 01 restent inclus.

La recette visuelle complète et la campagne Playwright restent réservées à l’Ordre 07.

| Contrôle exécuté | Résultat |
| --- | --- |
| Laravel ciblé, SQLite en mémoire | 50 tests, 1 235 assertions, succès |
| Mêmes tests, cluster PostgreSQL temporaire | 50 tests, 1 235 assertions, succès |
| Concurrence PostgreSQL : brouillons, soumissions/décisions, activation Ordre 01 | 3 tests, 29 assertions, succès |
| `npm run test:frontend` | 140 tests, succès, dont 24 ciblant le formulaire/cascade |
| `npm run types` et `npm run lint:check` | Succès |
| Syntaxe PHP sur les 10 fichiers concernés et `git diff --check` | Succès |
| `npm run build -- --outDir <dossier temporaire>` | Succès ; assets suivis non modifiés |

Le build signale un bundle principal de 504,77 kB, au-delà de son seuil d’avertissement de 500 kB ; cet avertissement ne bloque pas la compilation et son optimisation sort de cet ordre. Aucun échec connu ne subsiste dans les contrôles ciblés. Statut : **VALIDÉ localement**, sous réserve de la recette visuelle différée et de l’application ultérieure approuvée de la migration.

## Fichiers concernés

```text
app/Modules/Enrollment/Application/Services/AdmissionChoices.php
app/Modules/Enrollment/Application/UseCases/SaveProgressUseCase.php
app/Modules/Enrollment/Domain/Repositories/EnrollmentRepositoryInterface.php
app/Modules/Enrollment/Domain/Services/EnrollmentValidator.php
app/Modules/Enrollment/Infrastructure/Http/Controllers/EnrollmentController.php
app/Modules/Enrollment/Infrastructure/Persistence/EloquentEnrollmentRepository.php
database/migrations/2026_11_18_090000_allow_enrollment_drafts_without_a_level.php
resources/js/components/section/dashboard/enrollement/EnrollmentPageSection.tsx
resources/js/components/section/dashboard/enrollement/components/ProgressHeader.tsx
resources/js/components/section/dashboard/enrollement/components/Steps/Step1Faculty.tsx
resources/js/components/section/dashboard/enrollement/components/Steps/Step2Personal.tsx
resources/js/components/section/dashboard/enrollement/components/Steps/Step3Academic.tsx
resources/js/components/section/dashboard/enrollement/components/Steps/Step4Payment.tsx
resources/js/components/section/dashboard/enrollement/hooks/useEnrollmentForm.ts
resources/js/components/section/dashboard/enrollement/hooks/useRequirements.ts
resources/js/components/section/dashboard/enrollement/types.ts
resources/js/components/section/dashboard/enrollement/utils/admissionContexts.ts
resources/js/components/section/dashboard/enrollement/utils/validators.ts
tests/Feature/EnrollmentDraftResumeTest.php
tests/Frontend/enrollment-context.test.mjs
tests/Frontend/enrollment-form.test.mjs
tests/Frontend/enrollment.test.mjs
tests/Integration/PostgresConcurrencyTest.php
tests/Support/concurrency-worker.php
docs/admissions/02-parcours-candidat.md
docs/admissions/11-reprise-brouillons.md
```
