# Stabilisation finale USK

Branche de revue `fix/usk-stabilisation-finale`, créée depuis `develop` à `cb1060b`. À ce point, `main` et `develop` ont le même arbre. La recette et les mesures utilisent des profils locaux séparés. La base SQLite locale, le profil V2 et le profil de clôture de l’Ordre 07 ont été sauvegardés avec vérification d’intégrité SQLite et comparaison des empreintes de 224 fichiers.

## Registre des anomalies

| Priorité | Constat et preuve | Intervention ou limite |
|---|---|---|
| P1 | Connexion, inscription invalide et renvoi de vérification pouvaient retourner à la page publique. Avec un second onglet ouvert sur l’accueil et une requête sans référent, la dernière page GET de session prenait le dessus. La politique privée `no-referrer` est attendue. | `AuthController` et `EmailVerificationController` renvoient aux routes nommées. Erreurs de champ en français, message d’authentification générique et contrôles de session conservés. |
| P1 | Le dépôt financier était déjà enregistré lorsque `AcademicAdministrationController::payment` appelait `back()`. Le test de référence vérifie la ligne créée et observe une réponse 302 malgré l’origine publique. | Le retour du versement, de sa confirmation ou annulation, de l’affectation et du remboursement cible le dossier autorisé. Les erreurs de validation reviennent au même écran. La confirmation affichée vient du serveur. |
| P1 | Une référence libre différente suffisait à créer une autre écriture. La copie de clôture contient une paire de versements confirmés similaires sous deux références, avec pièce insuffisante pour affirmer un doublon réel. | Clé unique de tentative dans la transaction et réemploi de la même référence. À la confirmation d’un versement similaire pour la même inscription ou le même étudiant et la même année, l’agent compare les reçus et atteste qu’ils sont distincts. Le contrôle et la justification sont journalisés. Le même fichier de justificatif actif est rejeté même avec un autre nom ou une autre référence. |
| P1 | Un justificatif accepté apparaissait refusé après annulation de son paiement. Après remboursement, certains écrans le présentaient comme confirmé. | La décision sur la pièce et l’état du versement sont affichés séparément. Le paiement annulé reste visible dans l’historique et sort de l’encaissé. |
| P1 | Dans Chrome, le guide de bienvenue annonçait une inscription validée alors que le dossier fictif restait en attente à 29 USD. | Le guide présente le suivi du dossier et de l’ouverture des droits. Rejeu du même écran sur un compte encore en attente. |
| P2 | Le motif libre de dix caractères permettait une erreur tardive et parfois une clé de traduction brute. Les contrôles du formulaire académique ne pointaient pas vers leur message. | Motifs adaptés à l’acceptation et au refus, « Autre » avec commentaire et contrôle serveur en français. Erreurs associées aux champs, valeurs conservées. |
| P2 | Le dépôt d’un recours lançait un retour implicite et le message de succès était ignoré à l’écran. | Retour vers le résultat et l’inscription correspondants. Erreur française et annonce accessible avec référence du recours. |
| P2 | Le formulaire de mutualisation des supports exige un identifiant d’offre à recopier dans une URL. La liste affiche déjà des offres filtrées, sans recherche dédiée aux offres modifiables. | Point d’ergonomie identifié. La lecture du support privé, le détail de l’évaluation, le contexte et le retour clavier mobile sont validés. La sélection administrative a besoin d’un test spécifique avant changement. |
| P2 conditionnelle | Plusieurs mutations secondaires dans Learning, évaluations, documents et notifications ont encore un retour implicite. Certaines validations sans message explicite peuvent afficher une clé de traduction. | Risques relevés au code. Ils demandent des scénarios de reproduction séparés. La recette actuelle a rejoué les parcours prioritaires et les permissions représentatives. |

Le matricule sert à rechercher l’étudiant. L’identité d’un encaissement physique avec une pièce différente ou des caractéristiques changées relève de la vérification de l’agent habilité. La case de contrôle documente cette décision et conserve le double contrôle s’il est configuré. Deux encaissements légitimes du même montant restent possibles. Les paiements historiquement présents et leurs motifs sont conservés.

## Données et migration

`2026_11_18_100000_add_operation_id_to_student_payments.php` ajoute une clé de tentative unique nullable. Les paiements historiques continuent d’utiliser leur référence existante. Le retour arrière enlève la clé technique et son index. Les paiements, les obligations, les justificatifs et les événements d’audit sont conservés. Une reprise de tentative après un retour arrière doit tenir compte de la perte des clés de tentative.

Diagnostiquer un cas ambigu à partir de l’année, de l’inscription, des reçus associés, des décisions sur les justificatifs et des écritures confirmées. Si une correction historique est nécessaire, utiliser la contrepassation ou le remboursement audité déjà disponibles, après décision comptable.

## Mesures sur population synthétique

Le profil contient exactement 5 000 étudiants, 5 005 inscriptions académiques et 2 506 écritures de paiement. Chaque parcours utilise 20 requêtes HTTP authentifiées, séquentielles, après un échauffement. Le serveur de recette PHP et SQLite fonctionne localement sous Windows. Les 120 réponses sont HTTP 200.

| Parcours | Médiane | 95e percentile |
|---|---:|---:|
| Annuaire large | 652 ms | 1 833 ms |
| Recherche par matricule | 629 ms | 1 002 ms |
| Liste finances | 730 ms | 1 218 ms |
| Compte financier | 588 ms | 766 ms |
| File de confirmations | 432 ms | 1 080 ms |
| Portail étudiant | 418 ms | 1 053 ms |

L’essai porte sur le volume de données. Le débit et la latence d’un service de production sous charge simultanée nécessitent une campagne séparée sur l’infrastructure cible.

## Recette manuelle finale

1. Préparer un nouveau profil fictif avec `USK_RECETTE_V2_ROOT` pointant vers un dossier neuf. Dans le worktree, installer les dépendances, exécuter `npm run build`, puis démarrer le profil avec `php docs/recette-manuelle-v2/scripts/recette.php install`. Les commandes, le périmètre et les comptes fictifs sont décrits dans [le guide de recette](README.md).
2. Démarrer MailHog sur `127.0.0.1:1025` et son interface sur `127.0.0.1:8025`. Démarrer Laravel avec `php -S 127.0.0.1:8016 -t public docs/recette-manuelle-v2/scripts/router.php` et le worker avec `php docs/recette-manuelle-v2/scripts/recette.php queue:work`. Si la recette utilise Vite, exécuter `npm run dev -- --host 127.0.0.1`.
3. Ouvrir la connexion et l’accueil dans deux onglets de la même session. Saisir un mot de passe incorrect. Vérifier le message sous le champ et l’URL de connexion. Créer un compte `@usk.test`, consulter le courriel MailHog, utiliser le lien signé et vérifier la déconnexion.
4. Soumettre une candidature fictive après reprise du brouillon. Depuis un rôle de la faculté, demander une correction, remplacer la pièce et vérifier que la version précédente reste visible. Vérifier aussi le refus d’accès depuis une autre faculté.
5. Sur un dossier fictif en attente avec première tranche nette à 100 USD, saisir un versement invalide puis un versement de 29 USD. Essayer un double clic ou rejouer la tentative. Comparer le nombre de lignes du registre, le motif, le solde et le dossier courant.
6. Confirmer 29 USD et vérifier que l’inscription reste en attente. Déposer un justificatif de 1 USD et vérifier que son dépôt seul laisse l’encaissé à 29 USD. Refuser une pièce avec un motif prédéfini, puis déposer la pièce corrigée et l’accepter. Vérifier les 30 USD validés et l’ouverture des droits pédagogiques.
7. Annuler le paiement de ce justificatif dans la copie. Vérifier que la pièce reste acceptée, que l’annulation et son motif restent visibles et que le montant annulé sort de l’encaissé. Vérifier le recalcul des droits financiers selon les règles du dossier.
8. Essayer une autre référence pour un versement similaire. Vérifier le contrôle de comparaison des reçus. Confirmer uniquement si la pièce prouve un encaissement réellement distinct. Si le double contrôle est activé, utiliser un deuxième agent habilité.
9. Sur ordinateur puis en fenêtre mobile, revenir du détail d’un cours, d’un support et d’une évaluation. Vérifier l’inscription affichée, l’état des liens privés et le retour au dossier.

Les connexions au profil fictif et les tests HTTP reproduisent les scénarios localement. Les captures et journaux de recette sont conservés à côté du worktree dans `preuves`. Les profils SQLite, les pièces et les clés locales restent hors Git.


## Résultats de clôture

- Laravel sur SQLite en mémoire. 608 tests, 163 018 assertions.
- PostgreSQL isolé. 60 tests d’intégration et 11 tests de concurrence, dont le double enregistrement de la même tentative et la confirmation concurrente de deux références similaires.
- Frontend. 182 tests, TypeScript, ESLint et build Vite réussis.
- Chrome visible sur des comptes fictifs. 28 contrôles hors finance et 13 contrôles finance validés. Le relevé page par page porte sur 138 fichiers React et indique les marqueurs observés dans le code. Les captures navigateur couvrent les parcours indiqués dans les matrices.
- Migration sur base peuplée. Les 13 versements historiques, les deux justificatifs et les autres lignes contrôlées sont identiques après l’ajout du champ et de l’index. Aucun justificatif de recette initial n’a servi de donnée d’écriture.

À 29 USD sur 100 USD nets, l’inscription est en attente. La validation du dernier dollar ouvre les droits pédagogiques et ramène le solde à 70 USD. Après contrepassation, l’encaissé redescend à 29 USD. La preuve reste acceptée et le paiement apparaît annulé. La décision d’inscription acquise est conservée, conformément à la règle existante.

Une coupure de réponse après traitement serveur a été simulée dans Chrome. Le formulaire conserve les informations, affiche son alerte et permet le rejeu sur la même destination avec une seule écriture. Auparavant, l’alerte générale pouvait s’afficher derrière la modale. L’affectation a aussi été confirmée avec un retour au dossier et le message de réussite du serveur.

Les validations locales couvrent les parcours prioritaires. La recette institutionnelle des reçus physiques, les écrans secondaires signalés au registre et la charge concurrente sur l’infrastructure cible restent à vérifier.
