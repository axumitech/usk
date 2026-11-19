# Fiche de test USK — Sécurité, intégrité et performance

**Date** 19 novembre 2026. **Environnement** Windows local, bases SQLite, MySQL et PostgreSQL dédiées. **Comptes** Étudiants fictifs, responsables de faculté, comptabilité, institution et plateforme. **Versions** Référence `8cc1656`, premières corrections SQL et délégations `e5b1647` à `69b1225`, build de vérification `a36ed79`.

## Contrôles techniques

La suite Laravel complète compte **641 tests et 163 900 assertions réussis** sur SQLite au commit `e425fe8`. La suite étendue du build `a46a95e` a passé **109 tests et 2 669 assertions** sur MySQL et **256 tests et 6 258 assertions** sur PostgreSQL. Les **11 tests de concurrence PostgreSQL** ont passé **81 assertions** supplémentaires. Le dernier changement applicatif est limité au formulaire React du site. Le code Laravel, les routes, les migrations et les dépendances PHP du build livré sont identiques à ceux de ces lots. [Synthèse des exécutions et révisions](preuves/technique.json)

| Contrôle | Observation |
| --- | --- |
| Intégrations MySQL | 94 tests, 2 192 assertions après correction de la conversion SQL du classeur financier, de l’ordre des composantes de l’échéancier dans le calcul de révision et de la préparation des tests. |
| Intégrations PostgreSQL | Sur la référence, 238 tests, 5 663 assertions. Les 11 scénarios supplémentaires de concurrence ont passé 81 assertions sur une instance dédiée. |
| Courrier et confidentialité | Les profils imposent la boucle locale et les identités fictives. Les preuves navigateur masquent les liens signés et les jetons de réinitialisation. Les profils et leurs secrets sont conservés hors du dépôt. |
| Dépendances | Composer ne signale aucun avis sur le verrouillage testé. Après mise à jour du verrouillage npm, l’audit signale zéro vulnérabilité sur les 523 dépendances comptabilisées. L’audit initial comptait sept alertes modérées. |
| Accès entre rôles et facultés | Les tests HTTP couvrent la console plateforme, les URL métier interdites, les délégations facultaires et la portée des dossiers. Les attributions effectives et les contrôles fonctionnels figurent dans la [matrice](02-roles-permissions.md). |
| Données annuelles | La cohorte de deux années passe les vérifications d’effectif, d’attribution et d’intégrité référentielle SQLite. [Résultat détaillé](preuves/cohorte-presentation.json) |

## Volume distinct de 5 000 étudiants

Le profil contient 5 000 étudiants et 2 506 paiements. Chaque ligne du tableau représente dix requêtes authentifiées au noyau HTTP Laravel sur SQLite. Ce sont des durées serveur mesurées dans cette session. Les temps de diagnostic incluent la charge concurrente du poste de recette.

| Opération | Médiane | 95e centile | Requêtes SQL |
| --- | ---: | ---: | ---: |
| Annuaire, recherche large | 407 ms | 613 ms | 42 |
| Annuaire, recherche précise | 539 ms | 821 ms | 42–43 |
| Annuaire, deuxième page | 618 ms | 2 588 ms | 42 |
| Finance, recherche dans les comptes | 553 ms | 616 ms | 35 |
| Étudiant, calcul et affichage des frais | 335 ms | 1 322 ms | 59 |

Une mesure complémentaire a comparé l’annuaire avec une, dix et quinze lignes visibles. Le nombre de requêtes est resté à 42 dans les trois cas. Le bulletin a été généré dix fois par la route étudiante, avec vérification de son empreinte PDF. La médiane était de 721 ms et le 95e centile de 1 015 ms. Un processus de file distinct a traité onze notifications applicatives, avec zéro échec et zéro travail restant. [Mesures PDF, file et requêtes SQL](preuves/volume-metiers.md)

## Rejeu

Les trois moteurs isolés ont chacun passé **8 tests et 146 assertions** sur la migration du catalogue, la restauration des anciennes attributions et la portée des maquettes et des groupes. La restauration compare les titulaires et les permissions avant et après intervention. Le retour arrière s’interrompt lorsqu’une nouvelle attribution entre en conflit avec l’état enregistré. [Habilitations et restauration](02-roles-permissions.md)

Sur le profil de charge, les comptes fictifs ont déposé **300 images PNG distinctes** par le service des justificatifs. La comptabilité en a rapproché 60 avec des paiements existants. Les 240 autres restent à examiner. Le second passage a retrouvé les 300 fichiers avec la même empreinte d’ensemble et les 2 506 paiements d’origine. Au rejeu, les deux premières pages ont exécuté 19 requêtes SQL chacune, la recherche précise 19 à 20. Les médianes étaient respectivement de 48, 40 et 53 ms. [Premier dépôt](preuves/volume-justificatifs.json) · [Rejeu et empreinte](preuves/volume-justificatifs-reprise.json)

Dans Chromium, le cookie de session était HttpOnly et SameSite=Lax. La déconnexion du compte témoin a été refusée avec HTTP 419 lorsqu’il manquait son jeton CSRF. La session appartenait toujours au même étudiant après rechargement. Les téléchargements de supports pédagogiques et de documents officiels ont également été essayés avec un autre compte. [Session et CSRF](preuves/session-2026-11-19T10-56-43-150Z/resume.json) · [Documents privés](09-cartes-documents.md)

Le collecteur local a reçu 18 messages fictifs lors du relevé. Les objets comprennent la vérification de compte, la réinitialisation du mot de passe, le dépôt de candidature, le début de l’examen, la correction et les deux décisions. La réception et l’ouverture de ces messages sont documentées dans la fiche Admissions. Pour les paiements, `FinancialOperationNotice` alimente la base des notifications. Il en va de même pour `OfficialResultNotice`, `AcademicAssessmentNotice` et `AcademicScheduleNotice`. Dans le profil V2 du port 8066, le relevé a retrouvé 13 notifications financières, deux de résultats, 20 d’évaluation et 16 de programmation, en cumulant les données de préparation et les parcours. Les deux profils V2 avaient zéro travail en attente et zéro travail échoué au relevé. [Comptage par canal et profil](preuves/canaux.json) · [Admissions et MailHog](03-admissions.md)

Le script [integrations.ps1](scripts/integrations.ps1) crée une instance locale temporaire dans un dossier neuf. Il vérifie la base, le port, l’adresse et le répertoire du serveur avant les tests, puis l’arrête. Choisir `mysql` ou `pgsql` pour `-Moteur`, un nouveau chemin pour `-RepertoireNeuf` et le checkout à tester pour `-Projet`. Les suites complémentaires se rejouent avec [volume.php](scripts/volume.php) et [volume-metiers.php](scripts/volume-metiers.php).

**Décision du module** PARTIEL. La concurrence est mesurée pour les opérations couvertes par PostgreSQL. Les mesures de volume sont séquentielles, sur un seul poste. L’authentification multifacteur des comptes privilégiés reste ouverte.

Pour le build `a46a95e`, la compilation a signalé une entrée JavaScript de 505,62 ko avant compression et de 161,60 ko après gzip. Les URL statiques de polices et d’images signalées à la compilation correspondent à des fichiers présents dans le répertoire public de l’application. Chromium a vérifié le SHA-256 de la ressource réellement chargée et la page hors connexion du Service Worker. [Trace PWA et empreintes](preuves/pwa-2026-11-19T12-00-21-174Z/trace.json)
