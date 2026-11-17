# USK — Présentation fonctionnelle

USK accompagne le parcours universitaire depuis la candidature jusqu’au suivi des enseignements, des paiements et des résultats. L’application centralise les dossiers pour les services administratifs et propose un espace personnel aux candidats, étudiants et professeurs.

La recette finale utilise une université fictive, deux facultés, des comptes dédiés et des paiements simulés. Les parcours retenus pour la présentation doivent disposer d’une exécution enregistrée dans les preuves de l’Ordre 06. La présence d’un module dans cette présentation décrit sa fonction dans le code. Sa validation de démonstration est établie par les résultats de recette.

## Utilisateurs

| Public | Usage principal |
| --- | --- |
| Administration institutionnelle | Configurer l’université, les cycles, les années et le calendrier, suivre les services habilités. |
| Doyen et vice-doyen | Exercer les responsabilités académiques déléguées dans les facultés affectées. |
| Appariteur | Examiner les dossiers, suivre les inscriptions et assurer les opérations de scolarité autorisées. |
| Agent financier | Consulter les obligations, contrôler les versements et justificatifs, suivre les soldes. |
| Professeur | Consulter ses enseignements et horaires, diffuser les supports, gérer les travaux selon son affectation. |
| Candidat | Préparer et déposer sa candidature, répondre aux corrections et suivre la décision. |
| Étudiant | Consulter sa situation, ses cours, ses horaires, ses ressources et ses résultats publiés. |

Les responsabilités de doyen, vice-doyen, appariteur et agent financier utilisent les rôles et permissions existants. La matrice détaille leurs habilitations et les limites de faculté. [Acteurs et permissions](02-acteurs-et-permissions.md)

## Parcours fonctionnels

| Module | Parcours pris en charge |
| --- | --- |
| Admissions | Choix de formation et de niveau, conditions d’admission, dépôt de pièces, examen, correction, admission ou rejet motivé. |
| Inscriptions et scolarité | Profil étudiant, inscription annuelle, promotion et groupe, confirmation, suivi du parcours et demandes administratives. |
| Finances | Barèmes et échéances, première tranche, versements, justificatifs, rapprochement, affectation, reçus et remboursements. |
| Structure académique | Université, facultés, départements, cycles, programmes, niveaux, promotions, cohortes et années. |
| Maquettes et enseignements | Préparation, validation et publication d’une version, ouverture annuelle des offres, affectation des enseignants et inscriptions pédagogiques explicites. |
| Horaires et calendrier | Séances, répétitions, salles, conflits, publication, reports, annulations et événements académiques. |
| Espaces professeur et étudiant | Enseignements accessibles, planning publié, ressources, annonces, présences, devoirs et évaluations selon les droits. |
| Résultats et documents | Correction, transmission, délibération, publication officielle et délivrance documentaire selon le règlement et les modèles configurés. |

Les entrées de ces modules et leurs contrôles sont définis dans les routes de l’application et de la structure académique. [Routes de l’application](../../routes/application.php) · [Structure académique](../../routes/academic-structure.php)

## Enchaînement à présenter

1. L’administration configure le contexte de l’année et les formations.
2. Un candidat constitue son dossier. Un agent habilité examine les pièces et prononce la décision.
3. L’admission crée le contexte étudiant et une inscription annuelle en attente de confirmation.
4. Le service financier contrôle les versements fictifs. La couverture de la première tranche permet la confirmation selon les paramètres appliqués.
5. Les responsables préparent la maquette, ouvrent les enseignements, affectent les professeurs, inscrivent le public et publient les séances.
6. Le professeur retrouve ses cours et l’étudiant retrouve les enseignements de sa propre inscription.
7. Les résultats et documents sont présentés pour les scénarios dont les règles configurées et les preuves de recette permettent l’exécution complète.

Le programme de formation, les offres annuelles et les inscriptions pédagogiques déterminent les cours accessibles. L’Agenda académique présente les périodes et événements de l’année. L’emploi du temps présente les séances publiées. Les changements d’année utilisent l’inscription annuelle sélectionnée. [Accès pédagogiques](../../app/Modules/Student/Application/Services/AcademicAccessService.php) · [Navigation étudiante](../../resources/js/components/student/navigation.ts)

La première obligation financière utilise les paiements confirmés et leurs affectations. Les montants en attente et les versements affectés à d’autres obligations restent identifiables. La confirmation automatique dépend du paramètre prévu dans l’application. [Confirmation financière](../../app/Modules/Student/Application/Services/EnrollmentFinancialConfirmation.php) · [Configuration étudiante](../../config/student.php)

## Apports pour l’université

- Un dossier réutilisé entre admission, inscription, finances et scolarité.
- Des responsabilités déléguées avec un périmètre de faculté contrôlé côté serveur.
- Des publications pédagogiques consultables par leurs publics autorisés.
- Un historique des décisions, des opérations financières et des versions académiques.
- Une situation personnelle consultable depuis un navigateur sur ordinateur et mobile.

## Conditions de présentation

Le dossier de recette doit fournir les comptes fictifs, les résultats visibles des parcours, les captures utiles et les contrôles d’accès exécutés. Les mots de passe restent dans l’environnement privé de recette.

Les règles de délibération, la composition du jury, les délégations administratives et les modèles de documents utilisés pour la présentation sont identifiés explicitement. Toute étape qui dépend d’un choix institutionnel en attente est portée dans la matrice de recette avant le verdict.

Dans les données fictives, les accès aux supports, dépôts de devoirs, évaluations, résultats et demandes documentaires utilisent des règles `open`. Ce paramétrage facilite l’exécution des parcours de recette. Les conditions de confirmation de la première tranche restent vérifiées dans le parcours financier prévu. Les règles de délibération et les documents de présentation utilisent des paramètres synthétiques identifiés comme tels.

Le verdict de démonstration et les conditions d’exploitation sont établis dans la clôture du dossier à partir des preuves collectées.
