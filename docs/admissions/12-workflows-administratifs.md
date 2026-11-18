# Ordre 03 — Simplification des workflows administratifs

## Examen des justificatifs

Les agents peuvent sélectionner plusieurs motifs pour refuser une pièce ou demander une correction. Les motifs proposés sont Document illisible, Document incomplet, Document expiré, Document incorrect, Informations incohérentes, Document non conforme et Autre motif. Ce dernier demande une précision écrite. L’acceptation et le retour à l’état « À examiner » restent disponibles dans l’examen de la pièce.

Le serveur fournit les choix à l’interface et construit le commentaire communiqué au candidat. Les codes, le commentaire, l’auteur et la version de la pièce sont conservés dans l’événement de décision. Le format de requête historique avec commentaire libre reste accepté, et les anciens commentaires restent lisibles. La motivation de la décision officielle sur le dossier suit son propre formulaire.

## Sélections et données réutilisées

Les listes Admissions filtrent les programmes et niveaux selon la faculté choisie. Un changement de faculté efface uniquement les choix incompatibles. Le catalogue de documents officiels permet de choisir un programme par son nom dans la faculté sélectionnée. Il réutilise les contrôles existants de périmètre et de cohérence.

L’admission réutilisait déjà le compte, le niveau, l’année et le programme de la candidature pour préparer l’inscription. Les formulaires financiers reprennent le contexte du compte et peuvent préremplir les montants depuis ses obligations. Les documents reprennent les informations de l’inscription et des résultats. Les modifications se limitent aux ressaisies et aux sélections incohérentes constatées.

## Demande de dérogation liée à une inscription

Le portail étudiant propose le dépôt d’une demande d’examen dans les démarches académiques. L’étudiant décrit sa situation et peut joindre un justificatif. Les agents habilités dans la faculté traitent la demande dans la file existante. L’étudiant est notifié de la réponse et le journal conserve les réponses successives. La clôture signifie que la demande a été traitée. Le dossier conserve son statut académique et son état financier.

La mise en œuvre de l’octroi reste soumise à ces décisions institutionnelles :

- Définir les types de dérogations, leurs motifs et les justificatifs exigibles.
- Déterminer l’éligibilité des candidats avant admission et le dossier auquel rattacher leurs demandes.
- Désigner l’autorité de décision par type et faculté, et déterminer quand une seconde validation est requise.
- Définir séparément les effets académiques et financiers autorisés, leur durée et leur révocation. Toute exception au seuil d’activation de 30 % exige une règle distincte et explicite.

Une exonération relève du workflow financier et reste une mesure distincte d’un paiement. Le dépôt et le traitement d’une demande d’examen ne déclenchent aucun de ces workflows.

## Vérification locale

| Contrôle | Résultat |
| --- | --- |
| Laravel sur SQLite en mémoire | 84 tests, 2 595 assertions |
| Laravel sur PostgreSQL temporaire | 84 tests, 2 595 assertions |
| Concurrence PostgreSQL sur les décisions d’admission et l’activation | 2 tests, 22 assertions |
| Suite frontend | 152 tests réussis |
| TypeScript, ESLint et syntaxe PHP | Réussis |
| `git diff --check` | Réussi |

Les tests couvrent l’admission, la reprise de candidature et l’activation au seuil de 30 %. Le statut global est **PARTIELLEMENT VALIDÉ**. Les contrôles techniques du périmètre livré réussissent et l’octroi des dérogations attend les décisions institutionnelles ci-dessus. La recette visuelle complète relève de l’Ordre 07.

## Fichiers modifiés

```text
app/Modules/Documents/Infrastructure/Http/OfficialDocumentController.php
app/Modules/Enrollment/Application/UseCases/ReviewEnrollment.php
app/Modules/Enrollment/Domain/Services/DocumentReviewReasons.php
app/Modules/Enrollment/Infrastructure/Http/Controllers/EnrollmentManagementController.php
app/Modules/Enrollment/Infrastructure/Http/Controllers/EnrollmentNotificationController.php
app/Modules/Student/Application/Services/StudentNotifications.php
app/Modules/Student/Application/Services/StudentRequestService.php
app/Modules/Student/Application/Services/StudentScolarite.php
app/Modules/Student/Application/Services/StudentServiceCatalog.php
app/Notifications/StudentRequestAnswered.php
config/student_services.php
docs/admissions/12-workflows-administratifs.md
resources/css/admin-enrollments.css
resources/js/components/notifications/noticePresentation.ts
resources/js/components/student/StudentSchoolServices.tsx
resources/js/pages/dashboard/adminEnrollments/DocumentReview.tsx
resources/js/pages/dashboard/adminEnrollments/Index.tsx
resources/js/pages/dashboard/adminEnrollments/QueueList.tsx
resources/js/pages/dashboard/adminEnrollments/Show.tsx
resources/js/pages/dashboard/adminEnrollments/facultyFilters.ts
resources/js/pages/dashboard/adminEnrollments/types.ts
resources/js/pages/dashboard/officialDocuments/Administration.tsx
resources/js/pages/dashboard/studentAcademic/Request.tsx
resources/js/pages/dashboard/studentAcademic/StaffRequestDetails.tsx
tests/Feature/AdmissionsFacultyAccessTest.php
tests/Feature/EnrollmentReviewWorkflowTest.php
tests/Feature/OfficialDocumentWorkflowTest.php
tests/Feature/StudentNotificationsTest.php
tests/Feature/StudentRequestAdministrationTest.php
tests/Feature/StudentScolariteTest.php
tests/Frontend/admission-faculty-filters.test.mjs
tests/Frontend/document-review-feedback.test.mjs
tests/Frontend/official-document-program.test.mjs
```
