# Intégration Finance

Aucun second solde, paiement ou report de dette n’est stocké dans Enrollment. `StudentFinanceService` reste propriétaire des obligations, versements, confirmations, remboursements, bourses, exonérations et plans. Les reçus restent accessibles indépendamment de la dette via les règles essentielles existantes.

## Activation initiale automatique — Ordre 01

Le diagnostic ciblé a confirmé deux causes de l’attente : `config/student.php` désactivait l’automatisation par défaut et `EnrollmentFinancialConfirmation` exigeait une première tranche intégralement couverte. L’admission préparait pourtant déjà le rôle étudiant, le profil et l’inscription annuelle en attente. Aucun second système d’activation n’est ajouté.

La confirmation initiale de `pending_confirmation` est désormais automatique dès que les paiements **confirmés et imputés à la première tranche** atteignent **30 % de son montant net après aides approuvées**. Le barème doit être établi et cohérent, l’admission validée, le profil actif et l’année ouverte. Les versements en attente, les encaissements généraux non affectés, les versements d’une autre obligation et les aides non encore effectives ne contribuent pas au seuil. Les exonérations approuvées et effectives sont conservées : une tranche entièrement exonérée a un seuil nul, avec un barème valide toujours requis.

Le calcul est centralisé dans `EnrollmentFinancialConfirmation` et travaille uniquement en centimes entiers : `plafond(montant_net × pourcentage / 100)`. Par exemple, une première tranche nette de 100 USD exige 30 USD ; une tranche nette de 100,01 USD exige 30,01 USD. Une configuration de pourcentage invalide bloque l’activation avec une raison explicite.

| Paiement validé sur une première tranche nette de 100 USD | Situation |
| --- | --- |
| 20 USD ou 29 USD | Inscription en attente |
| 30 USD | Inscription confirmée, dette de tranche conservée à 70 USD |
| 50 USD | Inscription confirmée, dette de tranche conservée à 50 USD |
| 100 USD | Inscription confirmée, tranche couverte |

L’état financier `covered` conserve son sens de couverture intégrale : une inscription peut être active tout en ayant une tranche financièrement `due`. Ni le barème, ni les obligations, ni le solde ne sont réduits par la confirmation.

Trois paramètres métier explicites figurent dans `config/student.php` et `.env.example` :

- `STUDENT_ENROLLMENT_AUTO_CONFIRMATION` (défaut true).
- `STUDENT_ENROLLMENT_REQUIRES_FIRST_INSTALLMENT` (défaut true).
- `STUDENT_ENROLLMENT_ACTIVATION_PERCENTAGE` (défaut 30, entier de 1 à 100).

Si la première tranche n’est plus une condition de confirmation, la confirmation automatique par paiement est désactivée et la décision reste administrative. Les permissions d’accès aux supports/devoirs/examens restent calculées par `AcademicAccessService` et ses règles financières, exemptions, bourses, échéanciers et dérogations existantes.

## Déclenchement et simplification

Les validations financières, rapprochements et affectations appellent le service existant dans leurs transactions et verrous d’inscription. La confirmation conserve un seul audit `academic_enrollment_confirmed`, un seul changement d’état et une seule notification de confirmation. Les répétitions de paiement, d’affectation ou de traitement ne dupliquent pas ces effets. Le pourcentage et les montants utilisés sont conservés dans l’audit automatique.

Les retenues `under_review` et `correction_required` restent administratives. Leur retour autorisé vers `pending_confirmation` revérifie immédiatement le seuil, après l’enregistrement historisé de cette décision ; son rejeu reste idempotent. Les reprises après suspension ou congé ne sont jamais automatiques et conservent leurs conditions financières et administratives antérieures.

Les boutons de confirmation académique initiale sont masqués dans le mode automatique. La validation comptable des versements est conservée. L’accueil et les écrans financiers réutilisent les composants existants pour présenter admission, tranche, seuil, paiements validés, dette, activation et action requise. Les montants et raisons sont calculés côté serveur ; aucun accès financier supplémentaire n’est donné à un acteur non habilité.

La commande quotidienne existante `student:confirm-covered-enrollments` applique aussi le nouveau seuil aux dossiers déjà payés ou aux aides devenues effectives. Son nom est conservé pour compatibilité. Un simple rejeu d’un paiement déjà validé ne réécrit pas ses données. La commande n’a été exécutée que sur les bases isolées de tests pour cet ordre. Aucun dossier réel n’a été activé manuellement ou par seeder.

Un remboursement ou une contrepassation ne désactive pas une inscription déjà confirmée. Si la première tranche redevient davantage débitrice, le signalement administratif existant est conservé, y compris après une activation à 30 %. Le remboursement d’une autre obligation ne crée pas de faux signalement sur une première tranche inchangée.

L’application de nouveaux paramètres lors d’une mise en service autorisée nécessite le rechargement habituel du cache de configuration. Les éventuels paramètres explicitement définis dans l’environnement restent prioritaires. Aucun déploiement, cache de production ou donnée réelle n’est modifié par cet ordre.

Un transfert conserve les écritures sur la source. Aucun doublon de dette n’est créé par le transfert. Les nouvelles obligations sont établies par la comptabilité selon le dossier cible.

Les conditions institutionnelles effectivement configurées sont visibles sur la page administrative. Les nouveaux formulaires et décisions ne modifient ni les paramètres de paiement ni les écritures historiques. Les tests de réorientation au même niveau vérifient aussi le maintien des paiements et résultats sur la source, et l’absence de nouvelle dette automatique sur la cible.

## Vérifications ciblées de l’Ordre 01

Contrôles du 18 novembre 2026, sur données exclusivement fictives :

- 49 tests backend ciblés SQLite en mémoire, 1 139 assertions : frontières 20/29/29,99/30/50/100, montants en attente/non affectés/autre tranche, barème absent ou invalide, arrondi et configuration, exonérations et aides effectives, rapprochement prestataire partiel, reprise du batch existant, levée de retenue rejouée, remboursement et confidentialité. L’agent financier facultaire peut déclencher l’activation par validation financière sans disposer du droit de confirmation académique manuelle.
- 7 cas PostgreSQL ciblés, 229 assertions : seuil et levée de retenue ; 2 tests de concurrence financière, 15 assertions : confirmation du versement et confirmation automatique/manuelle au seuil de 30/100, dette de 70 conservée, audit et notification uniques. Cluster temporaire isolé, arrêté et supprimé après contrôle.
- 44 tests frontend de rendu ciblés : suivi financier, inscription, seuil configurable, dette conservée, action administrative et absence de confirmation manuelle redondante.
- TypeScript, ESLint sur les fichiers frontend modifiés, syntaxe des 12 fichiers PHP modifiés et `git diff --check` réussis. Revue ciblée sans P0/P1 confirmé.

Aucune recette Playwright multi-rôles, aucun seeder, aucune base réelle et aucun déploiement dans cet ordre. Le règlement institutionnel futur pourra modifier le paramètre central ; la règle appliquée ici est celle du présent ordre. L’Ordre 02 n’est pas commencé.

### Fichiers concernés

```text
.env.example
config/student.php
app/Modules/Student/Application/Services/AcademicEnrollmentService.php
app/Modules/Student/Application/Services/EnrollmentFinancialConfirmation.php
app/Modules/Student/Application/Services/PaymentRefundService.php
app/Modules/Student/Application/Services/StudentFinanceService.php
app/Modules/Student/Infrastructure/Http/Controllers/EnrollmentManagementController.php
app/Modules/Student/Infrastructure/Http/Controllers/FinanceController.php
app/Modules/Student/Infrastructure/Http/Controllers/StudentPortalController.php
routes/console.php
resources/js/components/student/FirstInstallmentDetails.tsx
resources/js/components/student/StudentFinance.tsx
resources/js/components/student/types.ts
resources/js/lib/studentEnrollment.ts
resources/js/pages/dashboard/finance/Confirmations.tsx
resources/js/pages/dashboard/finance/FinanceAccount.tsx
resources/js/pages/dashboard/student/Portal.tsx
resources/js/pages/dashboard/studentAcademic/EnrollmentManagement.tsx
resources/js/pages/dashboard/studentAcademic/Index.tsx
tests/Feature/EnrollmentFinancialConfirmationTest.php
tests/Feature/StudentAcademicJourneyTest.php
tests/Frontend/finance.test.mjs
tests/Frontend/student-finance.test.mjs
tests/Integration/PostgresConcurrencyTest.php
docs/enrollment/08-integration-financiere.md
```
