# Conditions de présentation

La recette est locale : Laravel 12, PHP 8.4.5, SQLite isolée, React/Inertia/Vite et Chromium Playwright. Les tests PostgreSQL utilisent un autre cluster temporaire, sans lien avec cette base. Les emails utilisent le transport `array`, les traitements sont synchrones et aucun service bancaire n’est appelé.

L’instance exécutée pour cette recette écoute sur `http://127.0.0.1:51415`. Son répertoire privé est `C:/Users/hp/.codex/visualizations/2026/11/17/01a1e9d3-ed1f-70a2-a5f7-d214eebabe3e/usk06-work`. Son fichier `.runtime.json` conserve le secret de connexion généré localement et le PID ; il est extérieur au dépôt et ne doit pas être partagé ni ajouté à Git. Les preuves publiables ne contiennent que des données fictives.

## Comptes

Tous les comptes ont le domaine `@usk-recette.example.test`. Aucun mot de passe n’est reproduit dans ce dossier.

| Responsabilité | Identifiant fictif avant le domaine | Rôle technique |
| --- | --- | --- |
| Administrateur institutionnel | `institutional` | `admin`, permissions institutionnelles explicites |
| Doyens | `dean.med`, `dean.law` | `admin`, permissions et faculté limitées |
| Vice-doyens | `vice.med`, `vice.law` | `admin`, permissions et faculté limitées |
| Appariteurs | `registrar.med`, `registrar.law` | `admin`, permissions et faculté limitées |
| Agents financiers | `finance.med`, `finance.law` | `admin`, permissions et faculté limitées |
| Professeurs | `teacher.med`, `teacher.law` | `professor`, affectations distinctes |
| Étudiants principaux | `student.med`, `student.law` | `student` |
| Autres situations | `student.med.2` à `.6`, `student.law.2` à `.6` | `student` |
| Candidat principal devenu étudiant | `nouveau.candidat` | Évolution réelle `user` → candidat → étudiant |
| Candidats correction et rejet | `candidate.correction`, `candidate.rejected` | `candidate`, sans inscription annuelle |

Les douze étudiants initiaux couvrent, dans chaque faculté : confirmé L1 groupe A, confirmé L2 groupe N2, en attente L1, en attente L2 sans barème, suspendu/congé L1 et inscription terminée de l’année précédente. Le candidat principal devient le treizième étudiant, après le parcours d’admission réellement exécuté. Deux professeurs et neuf comptes administratifs complètent le jeu.

## Préparer une nouvelle instance

Depuis le dépôt, exécuter `docs/recette-finale/scripts/preparer-demo.ps1` avec un `-DemoRoot` neuf, extérieur au dépôt. Les paramètres `-Php`, `-Node` et `-Repo` permettent d’indiquer les exécutables installés. Le script crée exclusivement une base SQLite dédiée, utilise les services/factories existants, génère un secret et un build séparé, puis démarre le serveur sur loopback dans une fenêtre masquée. Il n’efface ni ne réutilise un répertoire existant.

Le lanceur et les scripts de recette sont des outils locaux de test. Les scripts Chromium nécessitent Playwright et un Chromium compatibles ; les chemins de l’environnement ayant exécuté la recette sont conservés comme valeurs de secours et peuvent être fournis par `USK_RECIPE_PLAYWRIGHT` et `USK_RECIPE_CHROMIUM`. Le lanceur portable est vérifié syntaxiquement ; la recette décrite dans la matrice a été exécutée sur l’instance et le jeu isolés indiqués ci-dessus.

Ne pas exposer ce serveur `testing` sur le réseau. Les paramètres de test (coût bcrypt réduit, transport mail en mémoire, règles pédagogiques ouvertes et horloge simulée) sont réservés à cette démonstration. Ne pas employer les comptes ou données officiels sur cette instance.

## Règles à faire valider par l’université

Le règlement académique réel, la composition et les délégations des jurys, les signataires autorisés, les modèles légaux et les règles financières officielles ne sont pas fournis par cette recette. Les tarifs de 50/70 USD et le règlement de délibération synthétique servent uniquement aux tests. Le GO démonstration n’autorise pas la délivrance de documents réels.

La configuration de production, les sauvegardes, leur restauration, la supervision et les procédures d’exploitation n’ont pas été recettées ici. Elles empêchent de prononcer un GO production.
