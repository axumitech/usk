# USK — Acteurs et permissions

Cette matrice décrit les contrôles présents dans le code au commit local `79d2d86` de l’Ordre 05. La validation multi-rôles de l’Ordre 06 doit associer à chaque parcours une trace navigateur ou serveur précisant le résultat obtenu.

## Rôles disponibles

Les rôles déclarés sont `admin`, `super admin`, `professor`, `student`, `candidate` et `user`. La création d’un compte depuis le formulaire d’inscription attribue `user`. Les espaces de candidature acceptent les comptes prévus par les routes existantes. [Déclaration des rôles](../../database/seeders/RolePermissionSeeder.php) · [Inscription d’un utilisateur](../../app/Modules/Identity/Application/UseCases/RegisterUser.php) · [Routes](../../routes/application.php)

L’activation d’un candidat admis ajoute le rôle `student` au compte associé. Le compte peut donc conserver un rôle de candidature et accéder ensuite à son espace étudiant selon son inscription annuelle. [StudentAdmissionService](../../app/Modules/Student/Application/Services/StudentAdmissionService.php)

Doyen, vice-doyen, appariteur et agent financier représentent des responsabilités confiées à des comptes administratifs. Les permissions directes et les facultés affectées déterminent leur délégation réelle.

`super admin` est accepté lors d’un contrôle du rôle `admin`. Les autorisations métier continuent d’examiner les permissions et le périmètre. Le fournisseur applicatif n’ajoute aucun `Gate::before` qui accorderait systématiquement les autorisations. [Modèle User](../../app/Models/User.php) · [Policies déclarées](../../app/Providers/AppServiceProvider.php)

## Constitution des comptes de recette

Le seeder existant attribue au rôle `admin` les permissions de scolarité, de finance, de publication et de configuration. Un compte qui reçoit ce rôle hérite de ces permissions. Pour représenter les délégations minimales dans la base isolée, la préparation de recette doit définir les permissions du rôle partagé et les permissions directes des comptes de manière explicite. [RolePermissionSeeder](../../database/seeders/RolePermissionSeeder.php)

Pour un compte administratif, le lien `academic_staff_faculties` détermine ses facultés. Une affectation présente limite les requêtes et les actions métier aux facultés liées. Une liste vide correspond au périmètre institutionnel dans les services de portée utilisés ici. La préparation des comptes administratifs facultaires doit donc enregistrer leur faculté avant le premier accès. Les professeurs sont contrôlés par leurs affectations d’enseignement et les étudiants par leur profil et leur inscription. [Relation User](../../app/Models/User.php) · [AcademicStaffScope](../../app/Modules/Student/Application/Services/AcademicStaffScope.php) · [TeachingScope](../../app/Modules/Teaching/Application/Services/TeachingScope.php)

## Matrice des responsabilités administratives

La préparation de la base isolée définit un rôle partagé `admin` dépourvu de permissions héritées, puis des permissions directes par délégation. Le relevé des comptes fictifs confirme les attributions ci-dessous. Tous les comptes administratifs de ce tableau possèdent aussi `view dashboard`. Les refus d’accès exécutés complètent ce relevé.

| Acteur | Rôle applicatif | Permissions métier nécessaires | Portée et limites |
| --- | --- | --- | --- |
| Administrateur institutionnel `institutional` | `admin` | Toutes les permissions déclarées, attribuées directement dans la recette. | Contexte institutionnel, avec accès aux deux facultés de recette. |
| Doyens `dean_med`, `dean_law` | `admin` | `manage academic access`, `publish academic content`, les trois permissions de résultats et `approve official documents`. | Chaque compte est affecté à sa faculté. |
| Vice-doyens `vice_med`, `vice_law` | `admin` | `manage academic access`, `publish academic content`, les trois permissions de résultats et `approve official documents`. | Chaque compte est affecté à sa faculté. La préparation et les validations utilisent deux comptes distincts. |
| Appariteurs `registrar_med`, `registrar_law` | `admin` | `manage academic access`, `manage official documents`, `issue official documents`. | Chaque compte est affecté à sa faculté. Une confirmation d’inscription reste soumise aux conditions financières. |
| Agents financiers `finance_med`, `finance_law` | `admin` | `manage academic finance`, `manage academic access`. | Chaque compte est affecté à sa faculté. Les deux permissions permettent la confirmation manuelle depuis Finances lorsque les conditions sont satisfaites. |

`view dashboard` figure parmi les permissions d’entrée disponibles. Les décisions métier reposent sur les contrôles des routes, policies et services cités, qui sont à vérifier même lorsque le menu masque une rubrique. [DashboardEntryController](../../app/Modules/Student/Infrastructure/Http/Controllers/DashboardEntryController.php) · [Contrôles des admissions](../../app/Policies/EnrollmentPolicy.php) · [Dossier annuel](../../app/Policies/AcademicEnrollmentPolicy.php) · [FinanceController](../../app/Modules/Student/Infrastructure/Http/Controllers/FinanceController.php)

## Permissions distinctes pour les validations officielles

| Domaine | Permissions existantes | Contrôle complémentaire |
| --- | --- | --- |
| Résultats | `manage academic results`, `deliberate academic results`, `publish official results` | Faculté du référentiel, composition et présence au jury, présidence pour les actions qui la requièrent. |
| Documents | `manage official documents`, `approve official documents`, `issue official documents`, `approve academic diplomas` | Type et modèle actifs, périmètre, état de la demande et conditions de délivrance. |
| Progression | `manage academic progression`, `approve academic progression`, `approve academic graduation` | Dossier annuel concerné, conditions de progression ou de fin de cursus et séparation des validations prévue par le service. |
| Comptes | `manage users` avec `manage academic access` pour la gestion d’un compte étudiant | Policy du profil et périmètre de faculté. Le rattachement d’un compte professeur exige un agent institutionnel habilité. |

Les permissions de gestion académique usuelles ne donnent pas automatiquement les habilitations de jury, de publication officielle ou d’émission documentaire. [ResultsAccess](../../app/Modules/Results/Application/ResultsAccess.php) · [DocumentAccess](../../app/Modules/Documents/Application/DocumentAccess.php) · [AcademicLifecycle](../../app/Modules/Progression/Application/AcademicLifecycle.php) · [StudentProfilePolicy](../../app/Policies/StudentProfilePolicy.php)

## Professeurs, candidats et étudiants

| Acteur | Rôle et prérequis | Droits contrôlés |
| --- | --- | --- |
| Professeur | `professor`, fiche enseignant active liée au compte et portrait pour l’espace enseignant. Permissions prévues par le rôle, notamment `manage courses`, `manage students` et `grade assignments`. | Cours affectés, horaires publiés et publics associés. La gestion des supports et des évaluations exige une affectation responsable ou `instructor` autorisée. La consultation des étudiants requiert `manage students`. |
| Assistant | Compte professeur avec une affectation d’assistant sur l’offre. | Consultation prévue par son affectation. Les actions de gestion vérifient séparément sa responsabilité pédagogique. |
| Candidat | `user` ou `candidate` selon le compte et les routes de candidature, avec authentification et vérification d’email requises pour le tableau de bord. | Ses candidatures, ses pièces et le suivi des décisions. Les policies contrôlent la propriété du dossier ou une habilitation administrative. |
| Étudiant | `student`, profil lié au compte et contexte d’inscription annuelle propriétaire. | Services essentiels, puis enseignements, séances et ressources selon l’état annuel, les inscriptions pédagogiques, la publication et les règles d’accès applicables. |

Les permissions nominales du rôle étudiant sont complétées par les décisions d’`AcademicAccessService`. Les ressources et corrections d’évaluations tiennent compte de l’inscription effective, du destinataire et de la publication. [LearningAccess](../../app/Modules/Teaching/Application/Services/LearningAccess.php) · [AssessmentAccess](../../app/Modules/Assessment/Application/AssessmentAccess.php) · [AcademicAccessService](../../app/Modules/Student/Application/Services/AcademicAccessService.php) · [RequireProfessorPhoto](../../app/Modules/Teaching/Infrastructure/Http/Middleware/RequireProfessorPhoto.php)

Le jeu de recette configure les règles d’accès aux supports, devoirs, évaluations, résultats et documents en mode `open` pour l’année fictive. Ce choix est une donnée de démonstration. Les contrôles de propriété, de public, de faculté et de publication restent exécutés par les services.

## Opérations institutionnelles

La configuration de l’université, des cycles et des rattachements de contexte exige un compte habilité sans affectation facultaire. La modification du calendrier partagé, des périodes semestrielles et des salles comporte également un contrôle institutionnel. Les responsables facultaires conservent les consultations et les opérations sur leurs enseignements que leurs permissions autorisent. [StructureService](../../app/Modules/AcademicStructure/Application/Services/StructureService.php) · [AcademicCalendarController](../../app/Modules/AcademicYear/Infrastructure/Http/Controllers/AcademicCalendarController.php) · [ScheduleController](../../app/Modules/Teaching/Infrastructure/Http/Controllers/ScheduleController.php) · [ScheduleResourceController](../../app/Modules/Teaching/Infrastructure/Http/Controllers/ScheduleResourceController.php)

## Accès administratifs exécutés en navigateur

La recette Chromium desktop a connecté les neuf comptes administratifs et contrôlé 44 accès directs aux dossiers, enseignements, finances et planning. Vingt accès étaient autorisés, vingt-quatre ont été refusés avec HTTP 403 ou 404 conformément au périmètre et aux permissions. Les neuf parcours ont réussi, avec zéro exception JavaScript et zéro réponse HTTP 500 relevée par le harnais. [Traces détaillées](<C:/Users/hp/.codex/visualizations/2026/11/17/01a1e9d3-ed1f-70a2-a5f7-d214eebabe3e/roles-scopes.json>) · [Résultats du harnais](<C:/Users/hp/.codex/visualizations/2026/11/17/01a1e9d3-ed1f-70a2-a5f7-d214eebabe3e/usk06-work/results/roles-scopes.json>)

| Compte | Faculté | Accès autorisés | Refus observés |
| --- | --- | --- | --- |
| `institutional` | Institution | Dossiers, offres et finances des deux facultés, six routes. | Aucun refus attendu pour ces lectures. |
| `dean_med` | Médecine | Dossier et offre Médecine. | Dossier Droit, offre Droit, rubrique Finances. |
| `vice_med` | Médecine | Dossier et offre Médecine. | Dossier Droit, offre Droit, rubrique Finances. |
| `registrar_med` | Médecine | Dossier Médecine. | Dossier Droit, rubrique Finances, planning administratif. |
| `finance_med` | Médecine | Dossier et compte financier Médecine. | Dossier Droit, compte financier Droit, planning administratif. |
| `dean_law` | Droit | Dossier et offre Droit. | Dossier Médecine, offre Médecine, rubrique Finances. |
| `vice_law` | Droit | Dossier et offre Droit. | Dossier Médecine, offre Médecine, rubrique Finances. |
| `registrar_law` | Droit | Dossier Droit. | Dossier Médecine, rubrique Finances, planning administratif. |
| `finance_law` | Droit | Dossier et compte financier Droit. | Dossier Médecine, compte financier Médecine, planning administratif. |

Les tableaux de bord affichent le périmètre institutionnel ou la faculté affectée au compte. Les opérations d’admission, de paiement et de publication disposent de leurs scénarios dans la matrice générale de recette.

## Recette mobile exécutée

Chromium a réalisé dix connexions par formulaire puis consulté 31 écrans à 390 × 844 pixels. Les dix parcours ont réussi. Les relevés contiennent zéro exception JavaScript, zéro erreur console et zéro requête échouée. La largeur du document n’excède celle du viewport sur aucun des 31 écrans mesurés. [Observations et captures](<C:/Users/hp/.codex/visualizations/2026/11/17/01a1e9d3-ed1f-70a2-a5f7-d214eebabe3e/mobile-roles.json>) · [Résultats du harnais mobile](<C:/Users/hp/.codex/visualizations/2026/11/17/01a1e9d3-ed1f-70a2-a5f7-d214eebabe3e/usk06-work/results/mobile-roles.json>)

| Comptes | Écrans consultés | Nombre |
| --- | --- | --- |
| Administrateur institutionnel | Accueil, planning, admissions, finances. | 4 |
| Doyen Médecine | Accueil, planning, admissions. | 3 |
| Vice-doyen Médecine | Accueil, planning, admissions. | 3 |
| Appariteur Médecine | Accueil, admissions. | 2 |
| Agent financier Médecine | Accueil, admissions, finances. | 3 |
| Professeurs Médecine et Droit | Accueil, cours, planning de chaque professeur. | 6 |
| Étudiants Médecine et Droit | Accueil, cours, planning, finances de chaque étudiant. | 8 |
| Candidat admis | Accueil étudiant après admission et liste de ses candidatures. | 2 |

Les vérifications mobiles contrôlent la présence du cours et de l’offre affectés au compte, l’absence de l’offre de l’autre faculté, le contexte d’inscription étudiant et la présence des séances publiées dans les plannings. Les captures représentatives de l’administration, des admissions, des finances, des cours, des plannings et des candidatures ont été relues visuellement.

## Preuves complémentaires de clôture

Les contrôles administratifs et mobiles ci-dessus enregistrent les comptes utilisés, les permissions disponibles, les facultés, les résultats obtenus et les captures. Les opérations de décision et de publication sont consignées avec leurs propres résultats dans la matrice générale.

Les scénarios dédiés aux travaux et résultats portent aussi sur la confidentialité des copies, corrections et notes. Leurs résultats sont détaillés dans la matrice générale.

Les secrets de connexion sont conservés dans l’environnement privé de recette. Les comptes et les pièces de ces scénarios sont fictifs.
