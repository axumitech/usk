# Fiche de test USK — Rôles et permissions

Le build livré `08fa60f` a rejoué les quatorze comptes sur le port 8075. Chaque accès autorisé a abouti et chaque route interdite a renvoyé HTTP 403. Le doyen de Droit et le vice-doyen de Médecine ont aussi retrouvé chacun les maquettes de leur seule faculté. [Matrice du build livré](preuves/roles-2026-11-19T12-11-52-363Z/matrice.json) · [Maquettes et trois mandats](preuves/maquettes-facultaires-2026-11-19T12-11-19-258Z/resume.json)

| Champ | Valeur |
| --- | --- |
| Module | Identité, délégations universitaires, console de la plateforme |
| Version de référence | Départ `8cc1656`, séparation des habilitations intégrée dans `69b1225` sur `fix/usk-qa-e2e-final`. |
| Environnement | QA locale, installation USK unique |
| Comptes | Comptes fictifs du seeder FinalQa et utilisateurs éphémères des tests |
| Date de préparation | 19 novembre 2026 |

Espoir Mulela a validé **une USK par installation, avec administration technique séparée**. La console plateforme gère l’identité de l’établissement courant, les délégations à des comptes administratifs dédiés, la lecture du journal technique filtré et l’actualisation du cache de permissions. Elle affiche les pilotes configurés pour le courrier et la file de traitement. Le tableau de bord du rectorat expose uniquement des indicateurs agrégés. Les opérations d’intervention financière suivent les permissions et l’audit du module financier.

## Matrice des attributions initiales

Chaque cellule énumère la totalité des permissions Spatie attribuées par défaut au rôle. Les policies, l’état du dossier, la portée et les conditions du service continuent à contrôler chaque opération. Un rôle métier facultaire devient utilisable après son affectation explicite à une faculté. La liste de référence et les familles de routes autorisées sont centralisées dans [UniversityRoles.php](../../app/Support/UniversityRoles.php).

| Fonction | Rôle Spatie | Permissions accordées | Portée |
| --- | --- | --- | --- |
| Administrateur plateforme | `super-admin` | `view platform`, `configure platform institution`, `delegate institutional administration`, `maintain permission cache` | Installation. Les autres attributions historiques d’un compte plateforme sont neutralisées. |
| Administrateur institutionnel | `admin` | `view dashboard`, `manage academic access`, `manage academic finance`, `publish academic content`, `manage users`, `manage content`, `configure settings`, `faculties.create`, `faculties.update` | Institution. Les comptes historiques partageant ce rôle peuvent avoir reçu des délégations directes et des restrictions facultaires. |
| Recteur | `rector` | `view institutional indicators` | Vue institutionnelle et rapport annuel imprimable. Effectifs distincts, inscriptions par statut et faculté, finances par devise et états des jurys. |
| Secrétariat général académique | `academic-secretary` | `view dashboard`, `manage academic access`, `manage official documents`, `approve official documents`, `issue official documents`, `manage academic progression` | Institution. Scolarité, référentiels, documents et préparation des progressions. |
| Doyen | `dean` | `view dashboard`, `manage academic access`, `approve academic progression`, `approve official documents`, `deliberate academic results`, `publish official results` | Facultés affectées. La délibération reste conditionnée par le jury. |
| Vice-doyen | `vice-dean` | `view dashboard`, `publish academic content`, `manage academic results`, `manage academic progression` | Facultés affectées. Enseignement, programmation, évaluations et préparation des résultats. |
| Appariteur | `registrar` | `view dashboard`, `manage academic access`, `manage official documents`, `issue official documents` | Dossiers, cartes et documents dans les facultés affectées. |
| Admissions | `admissions-officer` | `view dashboard`, `manage academic access` | Candidatures et notifications d’admission dans les facultés affectées. |
| Comptabilité | `finance-officer` | `view dashboard`, `manage academic finance` | Finance des facultés affectées. La confirmation manuelle d’une inscription exige une permission de scolarité distincte. |
| Responsable de département | `department-head` | `view department programs` | Lecture des programmes des seuls départements inscrits dans `department_staff`. |
| Professeur | `professor` | `view dashboard`, `manage courses`, `grade assignments`, `manage students` | Enseignements affectés et étudiants inscrits selon l’offre et le rôle pédagogique. |
| Étudiant | `student` | `view dashboard`, `view courses`, `submit assignments`, `view grades` | Dossier personnel, inscription annuelle et droits de chaque service. |
| Chef de promotion | `promotion-representative` | `communicate with own promotion` | Compte aussi étudiant. Le mandat nominatif dans `promotion_representatives` et une inscription personnelle confirmée pour la même promotion active et l’année ouverte autorisent une diffusion aux membres confirmés de cette promotion. |
| Candidat | `candidate` | `apply to programs`, `view application status` | Ses candidatures et ses pièces. |
| Compte nouvellement créé | `user` | `view dashboard` | Parcours de candidature existant. L’admission et la confirmation déclenchent le parcours étudiant selon les règles métier. |

Les permissions `approve academic graduation` et `approve academic diplomas` existent pour les délégations explicites. Aucun des rôles initiaux ne les reçoit. Le seeder conserve la configuration d’un rôle institutionnel historique qui a déjà des membres. La matrice décrit une base QA neuve. [Seeder des permissions](../../database/seeders/RolePermissionSeeder.php)

## Vérifications et anomalies

| ID | Opération et attente | Contrôle automatisé |
| --- | --- | --- |
| ACL-01 | Console technique autorisée au compte plateforme, accès refusé aux finances, admissions, résultats, documents et progressions universitaires. | `AdministrativeRoleAccessTest::test_platform_is_separate_from_institutional_and_financial_workspaces` |
| ACL-02 | Le compte technique porteur d’un ancien rôle institutionnel et d’une permission financière directe garde seulement ses permissions plateforme. Un délégué sans faculté est exclu des destinataires administratifs. | `test_historical_mixed_platform_accounts_and_unassigned_delegates_are_excluded_from_institutional_access` |
| ACL-03 | La délégation à un compte dédié vérifié requiert le mot de passe courant et un motif. Un nouvel envoi de la même opération ne crée pas un second événement. Le dernier administrateur institutionnel reste actif. | `test_platform_delegation_is_verified_audited_and_idempotent` |
| ACL-04 | Chargement répété du seeder, puis comparaison des permissions de chacun des quinze rôles au référentiel. | `test_all_named_roles_receive_only_their_declared_permissions_after_reseeding` |
| ACL-05 | Comptable sans affectation refusé, comptable affecté admis en finance, niveaux et admissions interdits. Doyen limité à ses niveaux et conditions. | `test_faculty_officers_require_an_assignment_and_only_enter_delegated_areas` |
| ACL-06 | Écrans distincts pour le rectorat et le département. Un chef de promotion sans inscription admissible ne peut publier. | `test_rector_department_and_representative_receive_distinct_scoped_workspaces` |
| ACL-07 | Saisie et copie des conditions d’admission et mutations des détails de niveau soumises à la policy et aux facultés d’origine et de destination. | `AuthorizeLevelManagement`, `LevelAdmissionConditionsTest`, `LevelAdministrativeNavigationTest`, `AdminAppsTest` |
| ACL-08 | Paramètres du site modifiables par un administrateur institutionnel disposant de `configure settings`. | `SiteModuleTest` |
| ACL-09 | Un représentant inscrit sans mandat ne peut publier. Après délégation explicite, seul un étudiant confirmé de la même promotion reçoit le message. La clôture annuelle retire cette capacité. | `test_promotion_message_requires_current_mandate_and_only_reaches_confirmed_members` |
| ACL-10 | Le comptable enregistre un versement non affecté depuis sa propre rubrique. Le dossier étudiant complet et les écritures d’une autre faculté restent protégés. | `test_finance_officer_can_record_from_the_finance_screen_within_assigned_faculty` |

Le premier passage de la suite SQLite a retourné 616 tests réussis sur 621. Les cinq échecs concernaient un ancien test autorisant la lecture d’un niveau hors faculté, trois fixtures du site dépourvues de permission et les permissions initiales du rôle institutionnel précréé par migration. La requête de destinataires utilisant une conversion SQL incompatible avec MySQL a aussi été ajustée. Les résultats du dernier passage et les captures navigateur sont consignés dans le [rapport final](RAPPORT-FINAL.md).

Le passage ciblé suivant a réussi avec 47 tests et 748 assertions. La suite de navigation a réussi avec 13 tests, dont la séparation du menu plateforme. [Scénario navigateur rejouable](browser/roles.cjs)

**Chrome a validé les quatorze profils sur la révision compilée `7bbfba8`, port 8070.** Chaque session a chargé le bundle servi, obtenu HTTP 200 pour son écran autorisé et HTTP 403 pour le parcours interdit. Le navigateur a enregistré zéro erreur JavaScript sur les quatorze sessions. La plateforme a actualisé le cache avec un motif, le rectorat a lu les indicateurs et le responsable de Droit public a consulté ses programmes. Le chef de promotion a publié avec un retour HTTP 303 et un étudiant confirmé distinct a lu son message dans sa boîte. [Matrice de la recette](preuves/roles-2026-11-19T10-44-16-129Z/matrice.json) · [Console technique](preuves/roles-2026-11-19T10-44-16-129Z/plateforme.png) · [Message reçu](preuves/roles-2026-11-19T10-44-16-129Z/etudiant.png)

La validation ciblée MySQL a ensuite réussi avec 94 tests et 2 192 assertions. La sélection sur les groupes, les délégations et la progression a réussi avec 34 tests et 612 assertions. La suite SQLite complète de la version compilée `a36ed79` a réussi avec 629 tests et 163 526 assertions.

Le profil de présentation du port 8075 a rejoué les quatorze sessions sur la révision compilée `a46a95e`. Chacune retrouve son écran autorisé et le refus de l’écran hors périmètre. [Matrice de présentation](preuves/roles-2026-11-19T11-49-11-910Z/matrice.json) · [Révision et empreintes du build](preuves/roles-2026-11-19T11-49-11-910Z/version.json)

## Remise en service et limites

La migration conserve les assignations de l’ancien rôle `super admin` et les convertit en `super-admin`. Lorsque les deux noms sont présents, elle regroupe les assignations. Les permissions d’une identité technique sont limitées au registre plateforme, y compris en cas d’anciennes habilitations directes. Une personne assurant également la gestion universitaire doit utiliser un compte institutionnel dédié. Vérifier les affectations facultaires des anciens comptes `admin` avant remise en service. [Migration](../../database/migrations/2026_11_19_200000_separate_platform_administration.php)

La migration suivante installe les rôles et permissions par la commande habituelle `php artisan migrate`. Elle s’applique aussi aux installations ayant déjà exécuté la séparation initiale sans posséder de rôle historique. Sur un site habité, elle conserve les droits des rôles historiques existants, les attributions directes et les périmètres. Elle ajoute aux délégations nommées les habilitations de référence et limite le rôle technique à ses quatre opérations. Elle actualise le cache des permissions. Aucune identité n’est désignée automatiquement. [Migration du catalogue](../../database/migrations/2026_11_19_202000_install_institutional_role_catalog.php)

La sélection ciblée a réussi sur SQLite, MySQL et PostgreSQL isolés avec **8 tests et 146 assertions par moteur**. Elle couvre notamment l’installation sans seeder, la reprise sans rôle ancien, la restitution des anciens identifiants et titulaires après fusion, ainsi que le refus de revenir en arrière après une nouvelle attribution. [Cas de migration et de retour arrière](../../tests/Feature/InstitutionalRoleCatalogMigrationTest.php)

**Retour à la version historique.** Avant la première migration de séparation, placer l’installation en maintenance, suspendre les workers et les imports. Sauvegarder l’ensemble de la base avec la commande de sauvegarde native du moteur et conserver la révision applicative, la version du schéma et le point de restauration. Vérifier l’empreinte du fichier puis restaurer la copie dans une base isolée. Comparer les noms, les identifiants, les permissions et les titulaires des deux rôles techniques, les attributions directes et les périmètres avec la source. Conserver la preuve de cette comparaison dans le dossier de mise en service.

À partir de cette version, les migrations consignent dans une table interne les identifiants, droits et titulaires avant et après chaque changement. Pour un retour approuvé, suspendre les écritures et prendre une copie de l’état courant. Vérifier avec `php artisan migrate:status` que les trois migrations USK du 19 novembre 2026 sont les dernières appliquées, puis exécuter `php artisan migrate:rollback --step=3` avec cette version du code. Si des migrations ultérieures sont présentes, identifier d’abord leur impact et l’ordre de retour. Le journal rétablit les anciens identifiants, les permissions personnalisées et les titulaires exacts. Une nomination nouvelle, l’utilisation directe d’une permission nouvellement créée, un mandat départemental ou de promotion ajouté empêche la suppression automatique des données concernées.

Si le journal manque parce que la séparation initiale avait déjà été exécutée sur une révision antérieure, ou si le contrôle détecte une divergence, conserver la maintenance et faire valider par le propriétaire le traitement des changements survenus depuis le point de restauration. Restaurer ensemble la base pré-migration vérifiée et la révision applicative correspondante. Après les deux modes de retour, actualiser le cache avec `php artisan permission:cache-reset`, comparer les titulaires et permissions à l’inventaire, puis vérifier la connexion d’un ancien titulaire et le refus d’accès d’un titulaire nommé après la migration. En l’absence de copie pré-migration vérifiable pour un historique sans journal, maintenir la séparation actuelle et demander une reconstitution nominative documentée. [Journal et contrôles de retour arrière](../../database/migrations/support/InstitutionalAclJournal.php)

La confirmation du mot de passe protège actuellement les changements de délégation. Les intitulés, pouvoirs stratégiques supplémentaires et délégations de diplomation relèvent d’une décision de l’établissement.

**MFA des comptes privilégiés — prévu, non implanté.** Pour l’installation USK unique, le parcours proposé prévoit l’enrôlement d’une application TOTP, des codes de récupération à usage unique et l’inscription de chaque récupération dans le journal d’audit. Avant la mise en service des comptes privilégiés, la recette devra vérifier une connexion avec TOTP, le refus d’un code incorrect, la consommation d’un code de récupération, le refus de sa réutilisation et la présence de la récupération dans l’audit.

**Décision du module — VALIDÉ pour les habilitations et parcours exercés.** La recette de mise en service des comptes privilégiés reste conditionnée à l’implémentation et à la vérification du MFA proposé.

## Annuaire des enseignants et identité partagée

**Six contrôles navigateur validés sur quatre sessions indépendantes.** Chrome a chargé les ressources compilées de la révision `a46a95e9ff77187515779a10ae56048e18026589` sur le port 8075. Le pilote a vérifié la signature de la base du profil `usk_qa_e2e-livraison`, l’affectation du vice-doyen à Droit et les empreintes du manifeste et du JavaScript servi. [Résumé et empreintes](preuves/annuaire-enseignants-2026-11-19T11-48-29-385Z/resume.json)

| Session et action | Résultat observé |
| --- | --- |
| Vice-doyen de Droit, ouverture de l’annuaire et de la fiche de Droit public | L’annuaire montre les deux enseignants et les douze cours de Droit. La fiche présente les douze affectations de cet enseignant en Droit et permet leur gestion. La création d’identité, la modification de la fiche et le rattachement du compte sont masqués. [Annuaire facultaire](preuves/annuaire-enseignants-2026-11-19T11-48-29-385Z/ANN-01.png) · [Fiche de Droit public](preuves/annuaire-enseignants-2026-11-19T11-48-29-385Z/ANN-02.png) |
| Administrateur institutionnel, ouverture de l’annuaire et de l’éditeur de Sciences cliniques | L’annuaire montre les dix enseignants des cinq facultés. Le formulaire d’édition affiche la personne choisie et son adresse fictive. La session a été fermée avant enregistrement. [Annuaire institutionnel](preuves/annuaire-enseignants-2026-11-19T11-48-29-385Z/ANN-03.png) · [Formulaire](preuves/annuaire-enseignants-2026-11-19T11-48-29-385Z/ANN-04.png) |
| Professeur de Droit public puis professeur de Sciences cliniques, connexion personnelle | La page de profil affiche le titulaire attendu dans chacune des deux sessions. [Droit public](preuves/annuaire-enseignants-2026-11-19T11-48-29-385Z/ANN-05.png) · [Sciences cliniques](preuves/annuaire-enseignants-2026-11-19T11-48-29-385Z/ANN-06.png) |

Un test HTTP sur base éphémère complète cette cohorte avec un enseignant partagé entre deux facultés. Il vérifie le filtrage de ses affectations pour le vice-doyen, la gestion de son identité par l’administration, la prise en compte d’une affectation historique, la fin d’un mandat d’assistant et le changement de faculté du gestionnaire. Les onze tests ciblés ont passé 340 assertions sur SQLite. [Test du partage et de la mobilité](../../tests/Feature/ProfessorDirectoryScopeTest.php) · [Pilote navigateur](browser/annuaire-enseignants.cjs)
