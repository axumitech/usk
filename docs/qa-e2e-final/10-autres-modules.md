# Autres modules et interactions

| Champ | Valeur |
| --- | --- |
| Installation | USK de recette locale, interface française, fuseau Africa/Kinshasa |
| Profil | Recette V2, comptes fictifs du professeur et de l’étudiant de Droit, administration institutionnelle et visiteur anonyme |
| Date | 19 novembre 2026 |
| Environnement et version | Le pilote compare la révision du serveur et du build, puis vérifie le SHA-256 du manifeste local et du bundle servi. Chaque passage inscrit ces valeurs dans son `resume.json`. |

## Rubriques de navigation

| Groupe de la barre latérale administrative | Opérations principales et rubrique de recette |
| --- | --- |
| Tableau de bord | Entrer avec le compte réel de chaque rôle fictif, identifier la commande disponible et contrôler les liens autorisés. [Rôles et permissions](02-roles-permissions.md) |
| Structure institutionnelle | Institution, facultés, départements, cycles, programmes et niveaux. [Structure](01-structure.md) |
| Préparation académique | Années, promotions, groupes, campagnes et préparation du cursus. [Structure](01-structure.md) |
| Admissions et scolarité | Candidature, examen des pièces, décision et inscription annuelle. [Admissions](03-admissions.md) · [Étudiant](05-espace-etudiant.md) |
| Finances | Barème, obligations, preuve, validation, compte de l’étudiant et contrôle facultaire. [Finances](04-finances.md) |
| Enseignement | Cours, offres, enseignants, supports et séances. Le rapport d’assiduité et son export annuel figurent dans MOD-04. [Espace professeur](06-espace-professeur.md) · [Pédagogie et évaluations](07-pedagogie-evaluations.md) |
| Évaluations et résultats | Travaux, corrections, publication, décisions et réinscription. [Évaluations](07-pedagogie-evaluations.md) · [Résultats et progression](08-resultats-progression.md) |
| Documents et services | Documents officiels, cartes, impression, remise, demandes étudiantes et agenda. [Étudiant](05-espace-etudiant.md) · [Cartes et documents](09-cartes-documents.md) |
| Communication | Le professeur publie une annonce de cours. L’étudiant la retrouve dans sa liste et dans sa boîte de notifications. L’administration publie également une actualité consultable sur le site public. MOD-01 à MOD-03 et MOD-06 à MOD-07. |
| Administration système | Paramètres du site, référencement, pages légales et règles d’accès universitaire. MOD-05 exerce la sauvegarde de paramètres. Le contrôle des accès et le traitement du cache technique figurent dans la [matrice des rôles](02-roles-permissions.md). |

Cette correspondance reprend les dix groupes définis par [la navigation administrative](../../resources/js/components/layouts/Dashboard/adminNavigation.ts). Les tableaux de bord professeur, étudiant et plateforme affichent leurs propres rubriques selon les affectations du compte.

## Rejeu Chrome sur le profil V2

| ID | Action effectuée par le pilote | Résultat attendu |
| --- | --- | --- |
| MOD-01 | Ouvrir « Envoyer une annonce », choisir l’offre de Fondements de Droit L1 et publier un message unique. | Redirection HTTP 303, identifiant de l’annonce et confirmation du nombre de destinataires notifiés. |
| MOD-02 | Ouvrir l’onglet Annonces dans l’inscription 2026–2027 du destinataire, puis sélectionner le titre. | Titre présent dans la liste, année correcte, titre et texte lisibles sur la fiche. |
| MOD-03 | Ouvrir « Lire l’annonce » depuis la notification individuelle de ce même étudiant. | Renvoi vers le contenu de l’annonce, titre et texte identiques. |
| MOD-04 | Filtrer les présences sur 2026–2027 et cliquer sur « Exporter la sélection CSV ». | Téléchargement de `presences.csv`, huit colonnes, même nombre de séances que le rapport filtré. Le journal indique séparément le nombre de saisies. |
| MOD-05 | Changer la ville de recette dans les paramètres de référencement, recharger, puis remettre la valeur initiale. | Nouvelle valeur relue depuis le serveur, puis valeur d’origine relue après restauration. |
| MOD-06 | Créer et publier une actualité institutionnelle dans Communication. | Actualité retrouvée dans l’administration avec son titre et le statut publié. |
| MOD-07 | Ouvrir le journal public dans une fenêtre sans session et sélectionner cette actualité. | Titre et corps de l’article consultables sur une URL publique de détail. |

Le [pilote des modules](browser/modules.cjs) enregistre une capture et le résultat individuel de chaque contrôle. L’annonce de cours et l’article institutionnel restent dans le profil de recette pour permettre la contre-vérification. La ville initiale est restaurée à la fin de MOD-05. La séance de test peut être rejouée avec le [lanceur PowerShell](browser/rejouer.ps1), profil V2 et `-Suite modules`.

Le premier passage sur la version compilée `a36ed79`, port 8066, a créé l’article institutionnel n° 1 et relu son statut publié. Les contrôles d’annonce, de rapport et de paramètres se sont arrêtés au ciblage de champs, et le dernier contrôle a trouvé deux titres au lieu d’un pendant la navigation. [Journal du premier passage](preuves/modules-2026-11-19T10-20-54-764Z/resume.json)

**Le rejeu sur `2e9c69d`, port 8066, a validé les sept contrôles.** L’annonce n° 17, créée dans l’offre n° 13 de Fondements de Droit L1, figure dans la liste et dans la boîte de l’étudiant dont l’inscription annuelle porte le n° 9. Le titre et le texte complet correspondent dans les deux parcours. [Journal des sept contrôles](preuves/modules-2026-11-19T10-37-47-099Z/resume.json) · [Liste étudiante](preuves/modules-2026-11-19T10-37-47-099Z/MOD-02-liste.png) · [Détail](preuves/modules-2026-11-19T10-37-47-099Z/MOD-02.png) · [Notification](preuves/modules-2026-11-19T10-37-47-099Z/MOD-03-notification.png)

Le rapport annuel et le CSV ont affiché zéro séance et zéro appel saisi dans le profil V2 pour 2026–2027. Le fichier téléchargé contient les huit colonnes attendues. Pour la ville, le rechargement a confirmé la modification puis la restauration. L’actualité n° 2, enregistrée au statut publié, a affiché son titre et son texte dans une fenêtre sans session sur `/blog/2`. [Export de présences](preuves/modules-2026-11-19T10-37-47-099Z/MOD-04-presences.csv) · [Modification de ville](preuves/modules-2026-11-19T10-37-47-099Z/MOD-05-ville-modifiee.png) · [Actualité publique](preuves/modules-2026-11-19T10-37-47-099Z/MOD-07.png)

## Observations antérieures

Le passage du portail étudiant sur `8cc1656` a ouvert les rubriques Annonces et Notifications dans l’inscription 6 de Médecine. Il atteste leur affichage sur cette version. Le scénario ci-dessus relie séparément une nouvelle publication à sa réception par un étudiant de Droit. [Journal de consultation](preuves/etudiant-2026-11-19T09-54-54-538Z/resume.json)

La campagne antérieure mentionne déjà une annonce de cours publiée par le professeur de Droit et la consultation de supports et annonces par des étudiants. Son profil et sa révision appartiennent à cette ancienne campagne. [Matrice de la recette antérieure](../recette-finale/04-matrice-recette.md)

Les tests applicatifs couvrent également la visibilité par inscription, les destinataires, la gestion du site et le référencement public. [Publication enseignante](../../tests/Feature/TeacherAnnouncementPublishingTest.php) · [Annonces étudiantes](../../tests/Feature/StudentAnnouncementsTest.php) · [Notifications](../../tests/Feature/StudentNotificationsTest.php) · [Paramètres du site](../../tests/Feature/SiteModuleTest.php) · [Référencement public](../../tests/Feature/SeoPublicTest.php)

**Décision du module — VALIDÉ pour les sept scénarios du profil V2.** Le contrôle du CSV porte sur le cas d’une sélection vide. La publication de textes juridiques institutionnels et la déclaration d’un domaine de production exigent des informations et une approbation de l’établissement.
