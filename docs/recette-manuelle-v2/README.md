# Recette locale USK — Ordre 06

Les comptes, tarifs, règles de résultat et décisions de ce guide sont fictifs. Utiliser ces identifiants uniquement sur le serveur de recette lié à la boucle locale.

## Préparer et vérifier les données

Depuis la racine du dépôt, avec les dépendances Composer et npm installées, PHP avec PDO SQLite et Node.js disponibles.

```powershell
php docs/recette-manuelle-v2/scripts/recette.php install
php docs/recette-manuelle-v2/scripts/verify.php
php docs/recette-manuelle-v2/scripts/recette.php db:seed --class=LocalUniversityRecetteSeeder
php docs/recette-manuelle-v2/scripts/verify.php
```

`install` initialise le profil privé, exécute les migrations Laravel existantes puis lance `LocalUniversityRecetteSeeder`. Le répertoire par défaut est `storage/app/recette-manuelle-v2/`, ignoré par Git. Il contient le fichier `usk-recette-v2.sqlite`, le profil privé et le stockage des pièces de recette. Le lanceur charge ses propres paramètres. La base et le fichier `.env` habituels restent en dehors de ce parcours.

Le seeder exige `local` ou `testing` et une base qui porte l’identité du profil de recette. Il refuse une base déjà peuplée sans marqueur de recette et une base qui contient un compte hors `@usk.test`. Une fois le jeu installé, la deuxième exécution le laisse disponible avec les changements issus des essais manuels. Pour repartir du jeu initial, définir `USK_RECETTE_V2_ROOT` vers un **nouveau** répertoire et conserver la valeur dans les terminaux Laravel et du worker. L’installation vérifie l’identité si le répertoire existe déjà.

## Démarrer Laravel, Vite et MailHog

Dans un premier terminal à la racine du dépôt, démarrer Laravel avec le routeur de recette.

```powershell
php -S 127.0.0.1:8016 -t public docs/recette-manuelle-v2/scripts/router.php
```

Dans un deuxième terminal, démarrer Vite. Arrêter au préalable un éventuel Vite déjà lancé pour ce même répertoire de travail, car Laravel Vite Plugin partage le fichier `public/hot` du dépôt.

```powershell
$env:APP_URL = 'http://127.0.0.1:8016'
$env:VITE_DEV_HOST = '127.0.0.1'
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

L’application répond sur [le serveur Laravel de recette](http://127.0.0.1:8016). Si MailHog tourne déjà, vérifier [sa boîte de réception](http://127.0.0.1:8025). Pour le relancer, exécuter la commande suivante depuis le répertoire du binaire MailHog.

```powershell
.\MailHog_windows_amd64.exe -smtp-bind-addr 127.0.0.1:1025 -api-bind-addr 127.0.0.1:8025 -ui-bind-addr 127.0.0.1:8025
```

La recette utilise le SMTP `127.0.0.1:1025`, l’expéditeur `noreply@usk.test` et la boîte administrative `admissions@usk.test`. Le routeur et le worker rejettent les envois dès qu’un destinataire, y compris en copie, est extérieur à `@usk.test`. Le seeder neutralise les transports de courrier pendant la création des fixtures. Les notifications applicatives continuent à être traitées par leurs canaux existants.

Pour traiter les tâches asynchrones pendant les essais, démarrer le worker dans un troisième terminal Laravel. Pour vider ponctuellement sa file sur la base de recette, ajouter `--stop-when-empty`.

```powershell
php docs/recette-manuelle-v2/scripts/recette.php queue:work
```

### Emails à vérifier pendant l’Ordre 07

Créer un nouveau compte fictif, par exemple `nouveau.candidat@usk.test`, pour recevoir l’email de vérification. Les comptes préinstallés ont déjà une adresse vérifiée. Utiliser les véritables formulaires pour vérifier dans MailHog le dépôt de candidature, la décision d’admission ou de refus, les demandes de correction et le remplacement de pièce côté admissions. Le code prévoit également un email de réinitialisation de mot de passe et d’invitation professeur.

Contrôler séparément le passage au statut admis, l’activation financière et l’ouverture des droits dans USK. La notification `StudentAdmissionActivated` ainsi que les notifications financières, pédagogiques et de résultats sont enregistrées dans l’application. MailHog reflète uniquement les événements dotés d’un canal email. Utiliser le worker pour les événements applicatifs mis en file.

## Recette d’une révision compilée

Utiliser ces commandes depuis le worktree de la branche à vérifier. Le port doit être libre. Le profil doit être neuf ou provenir d’une copie SQLite contrôlée. Le serveur garde son stockage et son cookie de session propres. Il charge son bundle compilé même si un autre Vite tourne sur le PC.

```powershell
$env:USK_RECETTE_V2_ROOT = 'C:\chemin\vers\profil-fictif'
$env:USK_RECETTE_V2_PORT = '8042'
$revision = git rev-parse --verify HEAD
if (git status --porcelain --untracked-files=no) { throw 'La révision de recette a des modifications locales.' }

# Sur un profil neuf uniquement
php docs/recette-manuelle-v2/scripts/recette.php install
if ($LASTEXITCODE -ne 0) { throw 'Installation du profil impossible.' }

$build = Join-Path $env:USK_RECETTE_V2_ROOT 'public\build'
if (Test-Path (Join-Path $build 'manifest.json')) { throw 'Utiliser un profil neuf pour une nouvelle compilation.' }
npm run build -- --outDir $build
if ($LASTEXITCODE -ne 0) { throw 'Compilation Vite impossible.' }
if ((git rev-parse --verify HEAD) -ne $revision -or (git status --porcelain --untracked-files=no)) {
    throw 'Les sources ont changé pendant la compilation.'
}
$manifest = Join-Path $build 'manifest.json'
$entry = (Get-Content -Raw -LiteralPath $manifest | ConvertFrom-Json).'resources/js/app.tsx'.file
$stamp = @{
    revision = $revision
    manifest_sha256 = (Get-FileHash -LiteralPath $manifest).Hash.ToLowerInvariant()
    entry_sha256 = (Get-FileHash -LiteralPath (Join-Path $build $entry)).Hash.ToLowerInvariant()
}
[IO.File]::WriteAllText((Join-Path $build 'usk-recipe-build.json'), ($stamp | ConvertTo-Json))
$env:USK_RECETTE_V2_BUILD_ONLY = 'true'
php -S 127.0.0.1:8042 -t public docs/recette-manuelle-v2/scripts/router.php
```

Ouvrir [la version de recette](http://127.0.0.1:8042/__usk_recipe/version) avant de se connecter. `revision` et `assets.revision` doivent être identiques, `tracked_changes` doit être faux et l’asset d’entrée indiqué doit apparaître dans l’onglet Réseau du navigateur. Une révision d’assets vide signifie que le bundle n’a pas pu être rattaché à une version Git. En mode Vite, contrôler également le port HMR et son répertoire de lancement. Le point de diagnostic appartient au routeur local de recette.

Démarrer le worker depuis le même worktree, avec le même `USK_RECETTE_V2_ROOT`, le même `USK_RECETTE_V2_PORT` et `USK_RECETTE_V2_BUILD_ONLY=true`. Les liens signés des courriels utiliseront alors exactement le port testé.


## Comptes fictifs

Mot de passe local commun `password`.

| Email | Espace ou rôle de recette |
| --- | --- |
| `admin@usk.test` | Administration générale |
| `superadmin@usk.test` | Super-administration |
| `doyen.med@usk.test` / `doyen.droit@usk.test` | Admission, validation de la progression et publication des résultats de la faculté |
| `vicedoyen.med@usk.test` / `vicedoyen.droit@usk.test` | Pédagogie, préparation de la progression, résultats et délibération de la faculté |
| `appariteur.med@usk.test` / `appariteur.droit@usk.test` | Dossiers et scolarité de la faculté |
| `finance.med@usk.test` / `finance.droit@usk.test` | Finance de la faculté |
| `professeur.med@usk.test` / `professeur.droit@usk.test` | Enseignant affecté, portrait actif, cours, séances, support et devoir |
| `candidat.med@usk.test` / `candidat.droit@usk.test` | Candidat avec espace prêt pour créer, sauvegarder puis soumettre un dossier |
| `etudiant.med@usk.test` | Témoin L1 → L2 avec cours actuels et historique |
| `etudiant.med2@usk.test` / `etudiant.med3@usk.test` | Historique L1 et activation actuelle en attente |
| `etudiant.droit@usk.test` | L1 confirmée à 30 %, avec inscriptions pédagogiques |
| `etudiant.droit2@usk.test` | L1 avec versement sur une autre obligation |
| `etudiant.droit3@usk.test` | L1 confirmée avec première tranche payée, sans inscription pédagogique |
| `etudiant.droit4@usk.test` | Aide approuvée, inscription en attente |

Les délégations de Médecine et de Droit utilisent les permissions Spatie et la faculté affectée. Par exemple, l’agent financier traite les versements de sa faculté et l’administration générale effectue les validations institutionnelles.

## Années et parcours

- **2025–2026, fermée.** L1 de Médecine et de Droit, maquettes et offres publiées, séances passées, travaux évalués et dossiers annuels terminés. Le jury de Médecine a publié une réussite, un redoublement et une décision de rattrapage. Le jury de Droit a approuvé ses résultats, encore privés. Le Droit dispose aussi d’une évaluation en brouillon.
- **2026–2027, ouverte.** Les deux programmes du cycle Licence proposent des niveaux L1 et L2, des promotions, des groupes et des offres distinctes par année. Les campagnes actives permettent de reprendre les essais de candidature. Les enseignants disposent de séances et de ressources, avec un public inscrit en Médecine L2 et en Droit L1.
- **Témoin `etudiant.med@usk.test`.** Consulter L1 dans l’année précédente, la réussite publiée et le paiement de 100 USD, puis passer à L2 dans l’année actuelle. La décision et sa nouvelle inscription conservent le lien historique. Les offres, la maquette et les nouvelles obligations de L2 appartiennent à la seconde année.
- **Autres historiques.** `etudiant.med2@usk.test` a un résultat publié de redoublement et `etudiant.med3@usk.test` un rattrapage. `etudiant.droit@usk.test` et `etudiant.droit2@usk.test` ont des dossiers annuels terminés avec résultats encore privés.

## Cas financiers 2026–2027

Première tranche de référence fictive de 100 USD. Les statuts ci-dessous correspondent à l’année ouverte.

| Cas | Étudiant | Opération validée | Inscription |
| --- | --- | --- | --- |
| A | `etudiant.med2@usk.test` | Aucun paiement. Demande de dérogation ouverte. | En attente |
| B | `etudiant.med3@usk.test` | 20 USD affectés à la première tranche. | En attente |
| C | `etudiant.droit@usk.test` | 30 USD affectés à la première tranche, solde 70 USD. | Confirmée |
| D | `etudiant.droit2@usk.test` | Versement affecté à une obligation distincte. | En attente |
| E | `etudiant.droit3@usk.test` | 100 USD affectés à la première tranche. | Confirmée, inscription pédagogique à traiter |
| Aide | `etudiant.droit4@usk.test` | Réduction approuvée de 20 USD. | En attente de paiement |

Le jeu couvre deux facultés et deux années, avec un petit catalogue fictif. Les pièces, montants et décisions reproduisent des états de démonstration. Les contrôles du script décrivent l’état initial, avant modification par la recette manuelle.
