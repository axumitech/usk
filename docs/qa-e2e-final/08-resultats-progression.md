# Fiche de test USK — Résultats et progression

| Champ | Valeur |
| --- | --- |
| Module | Historique 2025–2026, résultats officiels et réinscriptions 2026–2027 |
| Révision de départ | `8cc1656`, branche `fix/usk-qa-e2e-final` |
| Comptes | Administration institutionnelle, enseignants et doyens fictifs, étudiants historiques |
| Date | 19 novembre 2026 |

La base de livraison contient 25 passages de L2 (2025–2026) à L3 (2026–2027) sur décision de jury publiée, à raison de cinq en Droit privé, Droit public, Épidémiologie, Sociologie et Études théologiques. Les 25 dossiers conservent l’inscription de L2 et ouvrent une inscription distincte en L3 dans le même programme, dont 15 confirmées et 10 en attente de confirmation. [Comptage par département et contrôles en lecture seule](preuves/progression-licence-l2-l3.json)

## Scénario reproductible

Chaque département reçoit vingt étudiants portant des noms et prénoms fictifs. Douze suivent le premier niveau et huit le deuxième. Les cours, enseignants, groupes, offres et inscriptions pédagogiques servent de base au calcul. Les notes ordinaires proviennent des évaluations corrigées, finalisées, validées et transmises. Une évaluation formative hors moyenne annuelle conserve un exercice manqué.

Le jury examine les dossiers de chaque niveau. L’administrateur institutionnel préside, le doyen compétent participe et publie. Les décisions sont la réussite, le redoublement et le renvoi au rattrapage. La préparation d’une session et la réussite effective d’un rattrapage restent deux opérations distinctes. L’étudiant peut former un recours dans le délai de sept jours du règlement fictif. Le scénario fait vérifier des dossiers et maintient leur décision après examen. [Services utilisés](../../database/seeders/FinalQa/UniversityPopulation.php) · [Recours et documents](../../database/seeders/FinalQa/UniversityRecords.php)

Les renouvellements utilisent la dernière décision officielle publiée, la maquette de destination et le service de progression. Une réussite conduit au niveau suivant lorsqu’il existe. Le redoublement conserve le niveau avec une nouvelle inscription annuelle. Le scénario conserve le dossier antérieur et la dette éventuelle. Les dernières années de Master qui se terminent par une réussite ne débouchent sur aucune réinscription automatique. Chaque département accueille également une nouvelle admission dans son premier niveau.

## Contrôles

| Critère | Preuve à consulter |
| --- | --- |
| 200 inscriptions antérieures, 20 par département, deux niveaux représentés, groupe et maquette présents | `php docs/qa-e2e-final/scripts/university.php verify` |
| Année passée fermée, nouvelle année ouverte, 200 résultats publiés et progressions effectives | La même commande vérifie et compte les décisions et les dossiers cibles |
| Absence de comptes externes et intégrité référentielle SQLite | Contrôle des adresses et `PRAGMA foreign_key_check` |
| Protection de la commande de préparation | [Tests de la garde QA](../../tests/Feature/FinalUniversityQaGuardTest.php) |

Le 19 novembre, le vérificateur en lecture seule a retrouvé vingt étudiants dans chacun des dix départements et 200 résultats publiés. L’année courante contenait 170 inscriptions, dont 120 passages au niveau supérieur, 40 redoublements et dix nouvelles admissions. Les dix mandats de promotion correspondaient à des inscriptions confirmées. Le contrôle a aussi compté dix cartes remises dans le logiciel, dix attestations émises, vingt demandes documentaires en attente, quarante absences justifiées et vingt recours instruits. SQLite a signalé zéro violation de clé étrangère. [Contrôle du profil de présentation](preuves/cohorte-presentation.json)

Sur le profil rectorat, la jointure en lecture seule des décisions, des inscriptions historiques et des niveaux cibles a compté **40 passages de L1 en L2** et **25 de L2 en L3**. Les trente résultats `resit_demo` n’avaient aucune progression, de même que les dix réussites au dernier niveau de Master. La simulation ne contient aucun dossier historique de L3 permettant de vérifier une poursuite après la licence, ni de résultat de seconde session clôturant un rattrapage.

Les candidatures, affectations, tarifs, aides, paiements, évaluations, signatures documentaires et progressions passent par leurs services métier. Les relevés d’appel historiques, justificatifs d’absence et examens de photo sont importés comme événements fictifs, avec auteur et références. La bibliothèque privée conserve les PDF générés. Les actions logicielles d’impression et de remise de carte sont simulées. Une photo de test ne contient aucune image d’une personne réelle. Les notifications applicatives sont enregistrées, tandis que la simulation neutralise le transport des emails.

### Anomalie de rattachement de la promotion

Lors d’une réinscription, le dossier cible perdait la cohorte d’entrée et sa promotion annuelle. L’affectation ultérieure à un groupe renseignait uniquement le groupe. Le titulaire d’un mandat sur cette promotion pouvait ainsi se retrouver sans espace de communication. Le service de progression conserve désormais la cohorte d’origine lorsqu’elle appartient au programme et recherche la promotion active correspondant au niveau et à l’année de destination. Le service d’affectation contrôle également le programme et la cohorte, puis inscrit la promotion du groupe dans les données annuelles et dans l’audit. Les dossiers déjà clôturés conservent leurs décisions. [Tests de réinscription](../../tests/Feature/AcademicLifecycleTest.php) · [Tests d’affectation](../../tests/Feature/AcademicEnrollmentManagementTest.php).

## Publication du résultat dans le navigateur

Le 19 novembre, sur le port 8066 et la révision `a36ed79`, l’étudiant de Droit a consulté ses résultats avant publication. Son espace indiquait qu’aucun résultat officiel n’était disponible. Le doyen a ensuite publié le jury déjà approuvé. La fiche du jury et le contrôle en base ont confirmé la publication. L’ouverture du détail officiel depuis le compte étudiant a rencontré une erreur HTTP 500 liée à l’appel de `prepend` sur une `LazyCollection`. [Relevé et révision servie](preuves/resultats-2026-11-19T10-11-39-112Z/resume.json) · [Avant publication](preuves/resultats-2026-11-19T10-11-39-112Z/RES-01.png) · [Après publication](preuves/resultats-2026-11-19T10-11-39-112Z/RES-02.png)

Le correctif `3c9aa55` conserve la sélection de l’édition dans un historique chargé progressivement. Deux tests HTTP ont réussi avec 337 assertions, pour le semestre S1 et une période personnalisée P1 avec rectification. Sur le build `7bbfba8`, le même étudiant a ensuite ouvert le résultat publié de la même inscription dans Chromium. Le scénario RES-03 a réussi. [Service de consultation](../../app/Modules/Results/Application/StudentResultPeriods.php) · [Relevé de la revalidation](preuves/resultats-2026-11-19T10-23-43-183Z/resume.json) · [Résultat officiel consulté](preuves/resultats-2026-11-19T10-23-43-183Z/RES-03.png)

## Réinscription dans le navigateur

Le mode `simulate-progression` prépare deux étudiants fictifs de L1 en Droit privé dans une nouvelle racine `usk_qa_e2e-progression-*`. Après publication du jury 2025–2026, le dossier `etudiant.dpr.02` est admis au niveau supérieur et le dossier `etudiant.dpr.03` redouble. Les deux étudiants attendent une décision de destination. Le serveur dédié utilise le port 8071. [Préparation des dossiers](scripts/university.php) · [Pilote navigateur](browser/progression.cjs) · [Contrôle en lecture seule](browser/progression-probe.php)

La préparation du profil `usk_qa_e2e-progression-ui` a abouti le 19 novembre. La lecture de SQLite a retrouvé deux dossiers historiques clôturés en DPR-L1, cohorte 1 et promotion 1. Le jury a enregistré `pass_demo` puis `repeat_demo`. Aucune décision de progression n’avait encore été créée.

Dans le dossier historique, l’administration ouvre **Parcours**, choisit le niveau de destination, l’année 2026–2027 et la maquette publiée, renseigne le motif puis publie la décision. L’étudiant ouvre **Mes inscriptions académiques** et demande sa réinscription. L’issue attendue est un dossier annuel en attente de confirmation, avec le même matricule et la même cohorte d’entrée, une promotion de la nouvelle année et une maquette compatible. Après rechargement, le dossier antérieur et le résultat officiel doivent conserver leur contenu.

Sur le build `7bbfba8`, les huit étapes navigateur ont réussi. L’administration a publié les deux destinations. Chaque étudiant s’est reconnecté avec son propre compte, a demandé sa réinscription, puis a retrouvé les deux années dans **Mes inscriptions académiques**. [Huit étapes et révision servie](preuves/progression-2026-11-19T10-37-19-042Z/resume.json)

| Dossier | Résultat et destination observés | Contrôle après réinscription |
| --- | --- | --- |
| DR0001, dossier historique 1 | L1 admis en L2, dossier annuel 3 | Cohorte 1 conservée, promotion 5, paiement antérieur de 80 USD conservé. [Écran étudiant](preuves/progression-2026-11-19T10-37-19-042Z/passage-04.png) |
| DR0002, dossier historique 2 | Redoublement de L1, dossier annuel 4 | Cohorte 1 conservée, promotion 4, paiement antérieur de 100 USD conservé. [Écran étudiant](preuves/progression-2026-11-19T10-37-19-042Z/redoublement-04.png) |

Chaque dossier annuel porte une première tranche de 100 USD au 30 septembre 2027 et reste en attente de confirmation. Les deux historiques, leurs matricules et les empreintes des résultats publiés sont identiques avant et après. Chaque dossier historique pointe vers une seule réinscription et le formulaire de demande disparaît après son utilisation. [Avant](preuves/progression-2026-11-19T10-37-19-042Z/avant.json) · [Après](preuves/progression-2026-11-19T10-37-19-042Z/apres.json)

## Sortie de licence et seconde session

Les cinq tests ciblés ont réussi avec 66 assertions sur une base isolée. Le dossier L3 possède trois années de crédits certifiés. Le passage annuel vers M1 est refusé. Le responsable habilité certifie d’abord la fin de licence. Une candidature en Master au statut soumis ne permet toujours pas le changement de cycle. Une fois l’admission du même étudiant validée et son dossier M1 lié à une maquette d’un cycle distinct, une seconde autorité approuve le changement de cycle en conservant la référence au résultat de L3. [Tests de parcours et d’admission](../../tests/Feature/AcademicLifecycleTest.php) · [Commande et résultat](preuves/progression-terminale.json)

Dans le test de rattrapage, la décision ordinaire interdisant la poursuite bloque la réinscription. Après introduction d’un résultat de seconde session déjà publié, la référence ordinaire reste refusée et la nouvelle référence permet de créer l’inscription au niveau supérieur. L’instantané de la première session demeure intact. Deux tests de calcul rejoués vérifient la conservation des acquis et des compensations. Un autre test transmet l’absence à une épreuve de rattrapage en présentiel sans lui attribuer zéro. [Calcul de la seconde session](../../tests/Unit/OfficialResultCalculatorTest.php) · [Épreuve de rattrapage](../../tests/Feature/AssessmentWorkflowTest.php)

Le profil `usk_qa_e2e-jury` contenait un étudiant dont le jury ordinaire avait prescrit le rattrapage. Les deux EC étaient à 11/20 et 8/20. La moyenne était de 9,50/20 et aucun crédit n’était acquis. Le règlement attribue les dix crédits à l’UE composée après acquisition de ses deux EC. L’horloge métier du serveur dédié indiquait le **23 juin 2026, à 09 h 00 puis 09 h 10, heure de Kinshasa**. L’exécution réelle a commencé le 19 novembre à 10 h 58 UTC, et son dernier relevé est horodaté à 11 h 05 UTC. [Préparation du résultat ordinaire](browser/jury-fixture.php) · [Horloge du profil isolé](browser/jury-router.php) · [Pilote de seconde session](browser/jury.cjs)

**Les neuf étapes de seconde session ont réussi dans Chromium sur le build `2e9c69d`.** Le professeur a créé et publié l’épreuve sur le seul EC à reprendre. L’étudiant a déposé sa copie. Après l’échéance, le professeur a finalisé sa correction à 15/20. L’administration a validé la correction et transmis la note une seule fois. Le doyen a approuvé le règlement de rattrapage lié au règlement ordinaire. Le président et la secrétaire étaient présents à l’ouverture du jury. La décision de réussite retient le 11/20 de la première session et le 15/20 de la seconde, soit **13/20 et dix crédits**. Le doyen a publié la session. L’étudiant a ouvert ce nouveau résultat dans son espace. Sa décision ordinaire, son contenu et sa référence sont demeurés intacts. [Neuf étapes et révision servie](preuves/jury-2026-11-19T10-58-09-849Z/resume.json) · [Note et référence des deux sessions](preuves/jury-2026-11-19T10-58-09-849Z/resultats.json) · [Copie déposée](preuves/jury-2026-11-19T10-58-09-849Z/JUR-03.png) · [Décision du jury](preuves/jury-2026-11-19T10-58-09-849Z/JUR-07.png) · [Résultat publié consulté](preuves/jury-2026-11-19T10-58-09-849Z/JUR-09.png)

**Décision du module** VALIDÉ pour les scénarios décrits. Les deux sessions de jury, la consultation, le passage L1–L2 et le redoublement sont passés par le navigateur. Le changement de cycle après L3 et l’autorisation de réinscription après rattrapage ont été exercés par tests métier. Le contrôle du bulletin PDF et de son empreinte a été effectué via la route étudiante sur le profil de charge. [Bulletin généré et vérifié](preuves/volume-metiers.md)

## Complément de recette des recours

Sur le profil rectorat, les vingt recours historiques sont passés par `ResultAppeals::submit` puis par `ResultAppeals::decide`. Le contrôle SQLite en lecture seule retrouve cent événements d’audit, soit vingt pour chacune des cinq étapes de dépôt, vérification, recevabilité, instruction et rejet motivé. Dans les vingt dossiers, l’auteur du dépôt correspond à l’étudiant titulaire et le compte qui rend la décision est distinct de l’instructeur. Cinq comptes ont rendu les décisions. [Simulation métier](../../database/seeders/FinalQa/UniversityRecords.php) · [Comptages et requêtes de vérification](preuves/recours-simulation.json)

Le témoin de jury sur le port 8072 a également exercé **un recours complet dans Chrome**, sur la révision compilée `2e9c69d`. À l’horloge universitaire du 23 juin 2026, le résultat de seconde session venait d’être publié et le délai expirait le 30 juin. L’étudiant en Droit privé a déposé la demande n° 1 pour vérifier la conservation de ses acquis. L’administrateur a vérifié sa recevabilité puis instruit le dossier. Le doyen de Droit a rejeté le recours avec une réponse motivée. L’étudiant a lu dans son espace la confirmation du 11/20 conservé, du 15/20 obtenu au rattrapage, de la moyenne de 13/20 et des dix crédits. Les cinq événements d’audit identifient les comptes intervenants. Les instantanés des deux sessions sont restés identiques avant et après instruction. [Sept contrôles navigateur et empreintes](preuves/recours-2026-11-19T12-04-21-305Z/resume.json) · [Dépôt](preuves/recours-2026-11-19T12-04-21-305Z/REC-02.png) · [Décision du doyen](preuves/recours-2026-11-19T12-04-21-305Z/REC-06.png) · [Réponse relue par l’étudiant](preuves/recours-2026-11-19T12-04-21-305Z/REC-07.png)
