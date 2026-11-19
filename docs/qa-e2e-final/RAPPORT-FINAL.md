# Recette de l’Université Simon Kimbangu

**Installation locale du 19 novembre 2026.** Espoir Mulela a retenu une USK par installation et une administration technique distincte. Le catalogue, les mandats, les étudiants, les signataires, les tarifs et les règles de délibération de la démonstration sont fictifs.

**Décision de recette — prête pour la présentation locale au recteur.** Les 30 parcours de Chromium regroupent **320 contrôles nommés réussis, 0 en échec et 0 bloqué** au dernier rejeu de chacun. Ce total comprend les 48 consultations du menu administratif et les opérations de configuration. Les premiers échecs et les reprises restent consultables. Aucune anomalie P0 ou P1 identifiée pendant cette recette ne reste ouverte. La promotion de la branche vers `develop` attend la validation d’Espoir Mulela. [Bilan par parcours et par contrôle](preuves/bilan-navigateur.json)

| Vérification automatisée | Résultat |
| --- | --- |
| Laravel sur SQLite | 641 tests réussis, 163 900 assertions |
| MySQL local | 109 tests réussis, 2 669 assertions |
| PostgreSQL local | 256 tests réussis, 6 258 assertions, puis 11 tests de concurrence et 81 assertions supplémentaires |
| Interface compilée | 188 tests frontend réussis, TypeScript et ESLint réussis, build Vite chargé et vérifié dans Chromium |
| Dépendances | Aucun avis signalé par Composer et aucune vulnérabilité recensée par npm après mise à jour du verrouillage |

Les suites SQL se recoupent. La fiche technique indique la révision de chaque lot et le contrôle final des assets. [Preuves techniques](preuves/technique.json)

## Périmètre et données disponibles

La démonstration est servie par un checkout propre du commit **`08fa60fbc55a5c67afe2b43a5df3357e21f855cd`**, en boucle locale sur le port 8075. Le navigateur a chargé `assets/app-9x_qvXot.js`. Le manifeste porte l’empreinte SHA-256 `dc077e944c9b76b4590ae9823b60ee093e492fba5c8abfcc94de2292d2549b7e`. Le navigateur et la sonde locale ont vérifié le code servi, son empreinte et le comportement hors connexion. [Ouvrir USK](http://127.0.0.1:8075/app/login) · [Version et vérification dans Chromium](preuves/pwa-2026-11-19T12-11-05-139Z/trace.json)

La branche locale `fix/usk-qa-e2e-final` part de `develop` à `8cc1656`. Le périmètre couvre le site public, le portail candidat, la scolarité, les finances, la pédagogie et les résultats sur la stack Laravel, Inertia, React et Vite existante. Les scénarios distinguent les opérations réalisées dans Chromium visible des créations en masse par les services de l’application. [Environnement, versions, sauvegarde et lancement](00-environnement.md)

La base de démonstration contient cinq facultés, dix départements et deux années. En 2025–2026, vingt étudiants par département ont reçu un résultat officiel. L’année 2026–2027 comprend 120 passages, 40 redoublements et dix nouveaux inscrits. Dix représentants disposent d’un mandat actif. Dix cartes ont été remises dans le logiciel, dix attestations émises, vingt demandes laissées en attente et vingt recours instruits. Le vérificateur n’a trouvé aucune référence orpheline. Le scénario de charge utilise une autre base de 5 000 étudiants. [Structure](01-structure.md) · [Effectifs et progressions](08-resultats-progression.md) · [Volume et intégrité](12-securite-performance.md)

Le domaine de tous les comptes fictifs est `@usk.test`. Sur la cohorte rectorat, les identifiants comprennent `plateforme`, `admin`, `rectorat`, `academique`, `dean.dr`, `vice-dean.dr`, `registrar.dr`, `admissions-officer.dr`, `finance-officer.dr`, `department-head.dpu`, `etudiant.dpu.01` et `candidat`. Le seeder génère le mot de passe du profil et le conserve dans son `final-qa.json` privé. Les comptes V2 utilisés pour les dossiers de contrôle ont leur propre annuaire. [Matrice complète](02-roles-permissions.md) · [Comptes V2](../recette-manuelle-v2/README.md)

Le comptage sur la première génération donne 28 niveaux, 56 groupes, 20 maquettes et 112 éléments constitutifs. Dix professeurs couvrent 112 affectations. La base compte aussi 400 présences, 980 remises, 1 000 enregistrements d’évaluation, 360 paiements, 20 justificatifs, 20 aides ou ajustements et 8 936 événements d’audit. [Inventaire des deux années](preuves/inventaire-universite.json)

Pour une démonstration courte, utiliser `rectorat@usk.test` pour les indicateurs, `vice-dean.dr@usk.test` pour les deux enseignants de Droit, `professeur.dpu@usk.test` pour les cours et `etudiant.dpu.06@usk.test` pour le dossier individuel. `etudiant.dpu.01@usk.test` est aussi chef de promotion. [Comptes, destinations et refus vérifiés](preuves/roles-2026-11-19T11-49-11-910Z/matrice.json)

## Corrections et non-régressions

Le parcours candidat a produit les emails de vérification, de réinitialisation, de dépôt, de correction, d’admission et de refus dans MailHog. Sur le profil de contrôle, 17 vues étudiantes ont été ouvertes et le dossier du cours est resté accessible au clavier à 390 px. Les 14 rôles ont chacun obtenu un accès autorisé et un refus HTTP 403 sur la route interdite correspondante. L’interface de l’administrateur comporte dix groupes et 48 destinations vérifiées. Le passage et le redoublement ont compté huit opérations navigateur, jusqu’à la nouvelle échéance et la vérification de l’historique. [Admissions](03-admissions.md) · [Accès](02-roles-permissions.md) · [Étudiant](05-espace-etudiant.md) · [Navigation](10-autres-modules.md) · [Progression](08-resultats-progression.md)

| Incident | Changement | Preuve |
| --- | --- | --- |
| Une même identité pouvait cumuler les pouvoirs techniques et métier | Séparation des rôles de plateforme et d’établissement, contrôle des délégations, du département, de la faculté et de la promotion. | [Habilitations, migrations et limites](02-roles-permissions.md) |
| MySQL interprétait différemment la conversion de colonnes et l’ordre des composantes d’un tarif | Conversion portable dans le classeur de finance, révision stable des tranches et intégration dans une vraie instance locale. | [Intégration SQL](12-securite-performance.md) |
| Un renouvellement perdait son rattachement de cohorte et de promotion | Conservation de la cohorte, rattachement à la promotion de destination et validation de l’affectation au groupe. | [Résultats et progression](08-resultats-progression.md) |
| Le professeur voyait un message d’incertitude après une publication déjà enregistrée | La fiche renvoyée par le serveur doit confirmer l’offre, la ressource, sa révision et son état. Le support et l’évaluation ont été republiés dans le navigateur. | [Espace professeur](06-espace-professeur.md) |
| Après publication avec succès par le doyen, la consultation étudiante d’un résultat précis renvoyait HTTP 500 | Correction de la sélection paresseuse de l’édition. Le rejeu a ouvert le même résultat sur la même inscription. Deux tests couvrent aussi une édition rectifiée et un semestre publié. | [Capture après correction](preuves/resultats-2026-11-19T10-23-43-183Z/RES-03.png) |
| La configuration d’une promotion ne permettait pas de créer son groupe dans le formulaire | Ajout de la création de groupe et contrôle du niveau et de la faculté côté serveur. | [Structure](01-structure.md) |
| L’icône du champ faculté recouvrait le libellé dans le formulaire de niveau | Ajustement ciblé du retrait du sélecteur, vérification géométrique dans la recette UX. | [Recette UX](11-ux-ui.md) |
| Un responsable facultaire recevait les maquettes d’autres facultés dans les données de la page | Le serveur restreint la liste annuelle et ses sélecteurs. Le doyen voit Droit, le vice-doyen de Médecine voit Médecine et l’institution retrouve les cinq facultés. | [Rejeu avec trois comptes](preuves/maquettes-facultaires-2026-11-19T11-47-56-268Z/resume.json) |
| Une ancienne offre de cours risquait d’être rattachée à un autre programme du même niveau | Le service vérifie le programme de la maquette avant toute modification. Le refus préserve l’ancienne offre et son audit. Deux opérations légitimes ont ensuite abouti. | [Trois contrôles du rattachement](preuves/rattachement-2026-11-19T11-33-59-719Z/resume.json) |
| Le décanat pouvait parcourir l’annuaire des autres facultés et modifier une identité commune | Annuaire, cours, affectations et photos suivent les mandats. L’administration institutionnelle gère l’identité partagée. Deux professeurs ont retrouvé leur propre profil. | [Six contrôles dans Chromium](preuves/annuaire-enseignants-2026-11-19T11-48-29-385Z/resume.json) |
| La deuxième absence de la liste étudiante recevait les données destinées à l’agent et un lien de téléchargement administratif | Correction du rappel utilisé lors de la pagination. L’étudiant a relu la décision et sa pièce privée de 3 589 octets. Le second étudiant a reçu HTTP 404. | [Justification, décision et téléchargement](preuves/absence-piece-2026-11-19T11-54-06-550Z/resume.json) |
| Le logo et le favicon téléversés étaient inaccessibles en recette et disparaissaient après une modification du slogan | Le profil compilé relie son stockage public. Le formulaire préserve les références de médias omises. Le navigateur a retrouvé les deux PNG avant et après la modification. | [Dimensions et empreintes](preuves/medias-publics-2026-11-19T11-46-07-756Z/diagnostic-medias.json) |
| Le formulaire envoyait un nom de site vide au serveur avant d’indiquer l’erreur | Le libellé indique que le nom est obligatoire. La validation du navigateur remet le focus sur le champ et bloque la 256e frappe. Le dossier reste intact et aucune requête d’écriture ne part. | [Vérification du champ et des deux images](preuves/medias-publics-2026-11-19T12-10-29-818Z/resume.json) |
| Une installation par migrations seules pouvait manquer de rôles. La reprise des attributions historiques exigeait une sauvegarde vérifiable | Ajout du catalogue et d’un journal permettant de restaurer les attributions antérieures ou de signaler une divergence. | [Matrice, retour arrière et résultats sur trois moteurs](02-roles-permissions.md) |

### Critères de sortie

| Critères | Vérification et limite de la conclusion |
| --- | --- |
| 1–2. Candidat et admissions | Compte vérifié, brouillon repris, pièce remplacée, admission et refus motivé, boîte MailHog consultée. Le dossier admis est devenu l’inscription n° 13 puis le compte étudiant actif. [Admissions](03-admissions.md) |
| 3. Paiements et justificatifs | 29 % maintient l’attente. La confirmation de 30 % active l’inscription. Le contrôle couvre aussi le justificatif accepté et refusé, l’annulation, le doublon, le solde nul, le reçu et le remboursement. [Finances](04-finances.md) |
| 4–5. Étudiant et professeur | Dix-sept rubriques étudiantes, syllabus, chapitre, offre, dépôt d’une copie, présence, justification, note, validation et publication. [Étudiant](05-espace-etudiant.md) · [Professeur](06-espace-professeur.md) · [Évaluations](07-pedagogie-evaluations.md) |
| 6–7. Résultats et progression | Rattrapage de 9,50 à 13/20 et dix crédits. Un recours déposé dans le délai est instruit, décidé puis relu par l’étudiant. Les deux éditions gardent leur empreinte. Passage L1–L2 et redoublement dans Chromium, 25 passages L2–L3 vérifiés dans la base livrée, sortie de licence et entrée en Master exercées par tests métier. [Résultats](08-resultats-progression.md) · [Sept étapes du recours](preuves/recours-2026-11-19T12-04-21-305Z/resume.json) |
| 8. Cartes et documents | Demande, photo, validation, signatures, génération de PDF, remise, contrôle de doublon et association/dissociation d’un identifiant NFC fictif. Impression et lecture radio physiques à vérifier sur matériel. [Cartes et documents](09-cartes-documents.md) |
| 9. Habilitations | Quatorze rôles, refus backend, séparation institution/plateforme, vérification des périmètres personnels, facultaires, départementaux et de promotion. [Matrice](02-roles-permissions.md) |
| 10–12. Feedback, redirections et formulaires | Accusé de la publication professeur corrigé, retour au paiement et à l’onglet de niveau, dépôt incomplet, contrastes, clavier et images contrôlés. La revue statique de 306 fichiers React recense 134 balises de formulaire dans 92 fichiers. Les manipulations en navigateur sont détaillées séparément. [UX/UI](11-ux-ui.md) · [Inventaire des formulaires](preuves/formulaires-react.json) |
| 13–14. Données et compilation | Deux générations indépendantes de référence puis préparation du profil de livraison. Intégrité référentielle contrôlée. Compilation, manifeste, empreinte du bundle servi et mode hors connexion vérifiés. [Environnement](00-environnement.md) · [Cohorte livrée](preuves/cohorte-livraison.json) |
| 15. Tests automatisés | Résultats et révisions du code et des suites recensés dans la fiche technique. [Sécurité et performance](12-securite-performance.md) · [Résultats des commandes](preuves/technique.json) |
| 16–17. Modules critiques et anomalies | Les fiches rapprochent chaque incident de son dernier rejeu. Le bilan recense les contrôles nommés et leurs preuves. [Bilan navigateur](preuves/bilan-navigateur.json) · [Autres modules](10-autres-modules.md) |

## Parcours que le propriétaire peut rejouer

1. Préparer une racine locale neuve avec `university.php simulate`, vérifier les effectifs, compiler et ouvrir le serveur en boucle locale. Pour reprendre la configuration de zéro dans l’interface, choisir une autre racine avec `university.php init`. [Commandes de lancement](00-environnement.md)
2. Avec le profil V2 et MailHog, lancer la suite `portails`. Créer le candidat et vérifier l’adresse, reprendre son brouillon, corriger une pièce puis consulter la décision. Ouvrir aussi la décision de refus du second dossier. [Admissions](03-admissions.md)
3. Sur un profil V2 vierge, exécuter `finances`. Contrôler le solde après 29, le justificatif rejeté puis remplacé, l’activation au seuil de 30 et la stabilité du dossier après répétition de l’opération. [Finances](04-finances.md)
4. Connecter le professeur puis l’étudiant. Suivre un cours jusqu’au support privé et à l’évaluation. Vérifier le contexte annuel en revenant au cours. [Étudiant](05-espace-etudiant.md) · [Professeur](06-espace-professeur.md) · [Évaluations](07-pedagogie-evaluations.md)
5. Publier le jury avec `resultats` sur un V2 neuf. Sur un jury déjà publié, employer `-ConsultationResultat` pour consulter directement le résultat de l’étudiant. Le mode `simulate-progression` d’une racine dédiée fournit un passage et un redoublement à traiter. [Résultats et décisions](08-resultats-progression.md)
6. Sur un exemplaire neuf de la cohorte rectorat, exécuter `cartes`, `documents` et `roles`. Utiliser les mandats facultaires fournis pour les signatures et l’émission. [Cartes et documents](09-cartes-documents.md) · [Autres modules](10-autres-modules.md)

## Revue et intégration

**Proposition de PR locale** `fix/usk-qa-e2e-final` vers `develop` — *Séparer les délégations universitaires, fiabiliser les parcours annuels et livrer leur recette*. Pour la revue, commencer par le catalogue/migrations des droits, puis les contrôles de faculté, les finances et l’historique de progression. Les changements des trois tests de révocation au commit `e425fe8` exercent la perte effective d’un droit à la fois direct et hérité du rôle professeur. L’historique exact s’obtient avec `git log --reverse --oneline develop..fix/usk-qa-e2e-final`.

| Étape | Commits locaux à examiner |
| --- | --- |
| Dépendances, SQL, séparation de la plateforme | `5d6748c`, `e5b1647`, `69b1225` |
| Publication professeur, finance et groupes, conservation de la cohorte | `7c2b11f`, `51691d9`, `8c4aeaf` |
| Simulation des deux années et premier jeu de parcours compilés | `7a5f464`, `a36ed79` |
| Charge, génération de bulletin, file et renouvellement témoin | `63133cf`, `ccba32c`, `dccd942` |
| Résultat publié, reprise navigateur, sélecteur de faculté, sortie de licence | `3c9aa55`, `7bbfba8`, `2e9c69d`, `be2eb22` |
| Évaluations, rattrapage, session et parcours transversaux | `4aa9a55`, `b478ec7` |
| Maquettes facultaires, rattachement historique, installation et retour arrière des habilitations | `0cb063a`, `613e4b5`, `570e71b` |
| Annuaire des enseignants, médias publics, confidentialité des pièces d’absence | `b6c1ffe`, `555dd5a`, `a46a95e` |
| Tests de révocation, pilotes de rejeu et validation du nom du site | `e425fe8`, `1221f8d`, `08fa60f` |

**Réserves à présenter au propriétaire.** Le MFA privilégié possède un parcours proposé à valider avant mise en service réelle. L’imprimante de badges et le lecteur NFC restent à essayer sur place. Les barèmes, niveaux médicaux, circuits de signature et règles de jury sont ceux de la simulation. La charge de 5 000 étudiants a été mesurée sur un poste local, avec un 95e centile de 2,59 s pour la deuxième page de l’annuaire lors du premier essai. Le futur dimensionnement demande des mesures sur le matériel cible. [Habilitations](02-roles-permissions.md) · [Cartes](09-cartes-documents.md) · [Mesures](12-securite-performance.md)

Le différentiel proposé se lit avec `git diff develop...fix/usk-qa-e2e-final`. L’intégration requiert la revue du propriétaire, la vérification des comptes historiques et de leurs mandats et l’acceptation des réserves documentées. Toute opération de release ou de migration vers un environnement réel relève d’une décision ultérieure. [Matrice de délégation et reprise des rôles](02-roles-permissions.md)
