# Fiche de test USK — environnement local

**Date** 19 novembre 2026, Africa/Kinshasa

**Version de référence** `8cc16567b2dfcd7e719b882cc5ac5fcb8c615488`

**Poste** Windows, PHP 8.4.5, Node 24.13.0, Chrome for Testing piloté par Playwright

**Périmètre validé par Espoir Mulela** Une USK par installation avec administration technique séparée.

## Sources et données

Le dossier usuel était sur `main` à `1abee59`, avec des fichiers de compilation locaux. Une copie indépendante a reçu `origin/develop` depuis GitHub. Son `develop` a avancé de six commits en fast-forward. La branche de travail est `fix/usk-qa-e2e-final`. Le compte GitHub interrogé par la CLI était `Mulela`. L’API n’a pas permis de vérifier son adresse privée avec les droits de la session.

Dans le dépôt principal, l’environnement effectif sélectionnait SQLite local, le chemin par défaut `database/database.sqlite`, le stockage local, la file database et SMTP sur `127.0.0.1:1025`. Il n’y avait pas de cache de configuration Laravel ni de surcharge de connexion dans l’environnement du processus. Les autres connexions déclarées sont MySQL, MariaDB, PostgreSQL et SQL Server. Les deux services préexistants sur 3306 et 5432 sont restés hors des scénarios.

L’API de sauvegarde SQLite a ouvert en lecture seule la base principale et les trois fichiers SQLite de `storage/app`. Chaque copie a retourné `ok` au `PRAGMA integrity_check`. L’inventaire privé avec les quatre empreintes se trouve dans `../sauvegardes/inventaire.json`, à côté de la copie de mission. La copie de la base principale mesure 3 993 600 octets. Son SHA-256 est `efdfd7cf79b52ac150b93336b19adca8a3e88d04a3705dcb4bbcc11a15e7ef3d`.

## Isolation et version servie

| Usage | Port ou support | Vérification |
| --- | --- | --- |
| Référence navigateur, paiements et admissions | 127.0.0.1:8064 | Profil SQLite `parcours`, routeur de recette, cookie dédié, worker du même profil |
| Configuration depuis une base vierge | 127.0.0.1:8065 | Profil `usk_qa_e2e-structure`, compte administratif d’amorçage |
| Courrier | SMTP 1025, interface 8025, en boucle locale | MailHog en mémoire, boîte vide au démarrage, domaine fictif `@usk.test` |
| Concurrence et intégration | PostgreSQL sur 55465, MySQL sur 33464 lors des premiers essais | Initialisation locale, contrôle du répertoire de données et de la base avant PHPUnit |
| Charge | SQLite indépendant sous `volume-reference` | Identité du profil et intégrité référentielle vérifiées |

Les profils isolent clé, base, sessions, cache, journaux, pièces privées et files. Le routeur vérifie le port et la boucle locale. En mode compilé, Laravel lit le manifeste du profil. La référence a servi `assets/app-DhFwbbyu.js` dont le SHA-256 est `76da3d8f1814fe69983f884dfe36defe72a63ea661da9087b48b1cb1a5c08359`. Le SHA-256 du manifeste est `fa9ca946b011e3538bfad17ec16790ecdd24484167ef3b25718cf8c0fb0f7758`. Le point de version a confirmé le même commit pour les sources et les assets, une copie propre et OPcache CLI inactif. Le checkout de référence ne contenait pas de `public/hot`.

## Préparer et relancer

Depuis une copie propre de la révision à essayer, avec les dépendances des fichiers de verrouillage installées, choisir un nouveau chemin local absolu. Dans PowerShell 7, exécuter les commandes suivantes. Le chemin parent du profil doit exister.

```powershell
$env:USK_QA_FINAL_ROOT = Join-Path (Split-Path (Get-Location)) 'usk_qa_e2e-demo'
php docs/qa-e2e-final/scripts/university.php simulate
if ($LASTEXITCODE) { throw 'Préparation incomplète' }
php docs/qa-e2e-final/scripts/university.php verify
if ($LASTEXITCODE) { throw 'Profil non vérifié' }
./docs/qa-e2e-final/scripts/compiler.ps1 -Projet . -Profil $env:USK_QA_FINAL_ROOT
./docs/qa-e2e-final/scripts/servir.ps1 -Profil $env:USK_QA_FINAL_ROOT -Port 8070
```

Dans un deuxième terminal, définir la même variable et invoquer `servir.ps1` avec `-Port 8070 -Processus worker`. MailHog doit écouter en boucle locale sur 1025 et 8025. Pour une configuration manuelle, utiliser `init` à la place de `simulate` dans un profil neuf. L’amorçage crée `admin@usk.test` et conserve son mot de passe dans le marqueur privé du profil. Pour repartir de zéro, choisir un nouveau dossier frère, par exemple `usk_qa_e2e-demo-2`.

Pour rouvrir la démonstration déjà préparée sur ce poste, après arrêt du serveur ou redémarrage de Windows, exécuter les commandes suivantes dans PowerShell. Rouvrir MailHog sur la boucle locale pour rejouer les e-mails. La même commande avec `-Processus worker` démarre le traitement de la file dans un deuxième terminal.

```powershell
$missionUsk = Join-Path $env:USERPROFILE '.codex/visualizations/2026/11/19/01a1f2fb-9422-7232-8692-d77c2c332973'
$profilUsk = Join-Path $missionUsk 'usk_qa_e2e-livraison'
$serveurUsk = Join-Path $missionUsk 'version-presentation/docs/qa-e2e-final/scripts/servir.ps1'
& $serveurUsk -Profil $profilUsk -Port 8075
```

Dans un terminal local où `$profilUsk` est défini, `(Get-Content -Raw (Join-Path $profilUsk 'final-qa.json') | ConvertFrom-Json).password` affiche le seul mot de passe fictif nécessaire à la connexion.

Le profil V2 des scripts navigateur possède son propre jeu de comptes. Sa préparation est décrite dans [le guide V2](../recette-manuelle-v2/README.md). Les preuves de la présente mission indiquent le profil et la révision utilisés.

Le build de la première présentation est identifié par `08fa60fbc55a5c67afe2b43a5df3357e21f855cd`. Dans Chrome, l’entrée `assets/app-9x_qvXot.js` a l’empreinte SHA-256 `9c43e7a7e46d0a4e50d748f7c5ac2ff3319a5fa3a237e4a29c1e072e90f8c157`. La copie servie est propre, OPcache CLI est désactivé et le mode compilé est actif. Lors du premier passage sur la révision précédente, l’attente du contrôleur du Service Worker avait expiré. Le rejeu a contrôlé le script HTTP 200, le contenu du cache puis la vraie navigation hors connexion. Le cache contenait uniquement `/pwa/offline.html`. Cette révision a reproduit ces contrôles sur le port 8075. [Rejeu précédent](preuves/pwa-2026-11-19T12-00-21-174Z/trace.json) · [Preuve du build livré](preuves/pwa-2026-11-19T12-11-05-139Z/trace.json)

La présentation des écrans corrigés utilise le commit `58d975f63d11422eb86ed0e93d3ab578772edf59` et l’entrée `assets/app-B0GO58tW.js`. Le manifeste a pour SHA-256 `3963d4de73da10f560851c8947531d9d348c7170220786c06a48ba8083bbd260`. Le serveur et les médias utilisent le profil de présentation existant.

## Révisions et profils de la mission

| Profil | Utilisation |
| --- | --- |
| `parcours-final`, port 8066 | Seconde installation V2, 43 contrôles de préparation réussis. Le navigateur a chargé le build `a36ed79`, manifeste `a22855a266b9c4a9a776ac482de789231f43b39011f679645adaa0f9f1756c72`, entrée `assets/app-BPCWFe7Y.js`, SHA-256 `5ae9004472637405bd636ac7137694a5770a3d189145cd6e9223995b56c4877f`. |
| `parcours-reprise`, port 8068 | Instantané cohérent par l’API SQLite avec stockage fictif correspondant. Le jury déjà publié et le support déjà créé y gardent leurs identifiants. Le code corrigé `7bbfba8` a été recompilé. Le correctif PHP conserve les mêmes empreintes JavaScript. |
| `usk_qa_e2e-rectorat`, port 8070 | Deuxième génération indépendante de la cohorte complète. Elle fournit les comptes universitaires affectés, les résultats et les opérations sur documents et cartes. |
| `usk_qa_e2e-progression-ui`, port 8071 | Une faculté et deux résultats de jury publiés, avant renouvellement. Le mode `simulate-progression` fournit les témoins d’un passage et d’un redoublement. |
| `usk_qa_e2e-structure`, port 8065 | Configuration manuelle démarrée avec un seul compte institutionnel. Les replays vérifient les lignes existantes avant de reprendre la saisie dans Chrome. |
| `usk_qa_e2e-jury`, port 8072 | Témoin de seconde session. Son horloge métier propre au profil permet de franchir l’échéance de dépôt. Le navigateur conserve sa date réelle. |
| `usk_qa_e2e-rattachement`, port 8073 | Deux programmes partagent une faculté et un niveau. L’opérateur vérifie les limites du rattachement et les médias téléversés par le site. |
| `usk_qa_e2e-livraison`, port 8075 | Cohorte initiale de 200 résultats historiques et 170 inscriptions courantes. Après la recette manuelle de DR0043, 171 étudiants sont inscrits en 2026–2027 et 105 inscriptions sont confirmées. |

Pour la démonstration livrée sur ce poste, ouvrir [la connexion locale](http://127.0.0.1:8075/app/login) et utiliser par exemple `rectorat@usk.test`. La racine du profil est `../usk_qa_e2e-livraison` depuis la copie de travail de la mission. Le fichier `final-qa.json` de ce dossier contient le mot de passe fictif commun aux comptes du profil. Consulter ce fichier localement. La commande `simulate` relit le contrôle de fin sur un profil déjà peuplé et préserve les parcours. Pour une réinstallation vierge, fournir un autre chemin absolu à `USK_QA_FINAL_ROOT`. Le répertoire `version-presentation`, voisin du profil, est le checkout utilisé par le serveur et son worker.

Le dépôt habituel dispose maintenant de la référence `develop` mise à jour en avance rapide et d’une branche locale de recette. Pour examiner une version dans un dossier séparé, utiliser `git worktree add --detach <nouveau-dossier> fix/usk-qa-e2e-final`. Les changements peuvent être relus avec `git diff develop...fix/usk-qa-e2e-final`.

Au relevé de clôture, les seuls ports de ces profils en écoute étaient 8075 pour USK et 1025/8025 pour MailHog, tous liés à `127.0.0.1`. Les serveurs intermédiaires sont arrêtés. Les profils et captures restent disponibles pour un rejeu.

La commande suivante lance un scénario dans Chromium visible. Utiliser le répertoire qui contient le module Node Playwright et l’exécutable du navigateur installés sur le poste. Le port doit correspondre au profil et au serveur démarré selon la procédure ci-dessus.

```powershell
./docs/qa-e2e-final/browser/rejouer.ps1 -Suite roles -Profil $env:USK_QA_FINAL_ROOT -Port 8070 -CodeServeur . -Playwright $env:USK_QA_PLAYWRIGHT -Navigateur $env:USK_QA_CHROME
```
