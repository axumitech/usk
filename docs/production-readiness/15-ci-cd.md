# CI/CD

Les workflows de validation couvrent Composer, npm, TypeScript, ESLint, tests frontend, build Vite, PHP et audits. Le job PostgreSQL construit les assets et inclut les parcours Results, Documents et Progression ainsi que les contrôles de phase 14. La syntaxe YAML a été vérifiée localement. L’exécution des jobs sur GitHub et les règles de protection des branches et de l’environnement restent à vérifier.

Le workflow Nitrohost est manuel sur `main`. Il exige une référence de changement et les confirmations de restauration et de compatibilité de rollback. Le job de déploiement utilise l’environnement `production`. Configurer les réviseurs requis sur GitHub. Le point d’entrée cPanel présent dans le dépôt échoue volontairement avant toute opération de déploiement. Vérifier les webhooks et tâches externes déjà configurés.

## Hotfix CI : fixture PostgreSQL et dépendances de compilation

La fixture de `UniversityFinanceTest` utilise `TF-AUTRE` (8 caractères), compatible avec `faculties.code varchar(10)`. Le schéma et les modules métier ne changent pas.

`vite`, `laravel-vite-plugin`, `@vitejs/plugin-react` et `@tailwindcss/vite` appartiennent aux `devDependencies`. Leurs versions verrouillées sont conservées : respectivement 6.4.5, 1.3.0, 4.7.0 et 4.3.4. Les peerDependencies des trois plugins acceptent Vite 6 ; aucune rétrogradation de Laravel Vite Plugin, aucun `--legacy-peer-deps` ni `audit fix --force`.

L’import de `laravel-vite-plugin/inertia-helpers` dans le point d’entrée React est intégré au bundle client à la compilation. Le SSR est désactivé par défaut dans `config/inertia.php` ; le workflow existant ne construit ni ne démarre de serveur Node SSR. Les quatre outils ne sont donc pas des dépendances d’exécution de cette release Laravel et de ses assets compilés.

Le workflow de déploiement conserve `npm ci` puis `npm run build`, sans `NODE_ENV=production` ni `--omit=dev` sur l’installation de compilation. Les dépendances de développement sont disponibles pendant le build ; `node_modules` est ensuite exclu de la release. Le contrôle `npm audit --omit=dev --audit-level=high` reste inchangé dans `.github/workflows/tests.yml`.

### Risque picomatch restant

Au 17 novembre 2026, l’[avis officiel GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) signale un ReDoS pour les versions jusqu’à 4.0.7 et aucun correctif publié. Le graphe de compilation conserve `picomatch@4.0.7` via Vite, tinyglobby et le peer optionnel de fdir, ainsi que `picomatch@2.3.2` via `laravel-vite-plugin → vite-plugin-full-reload`. Ces chemins doivent rester classés développement dans le lockfile, y compris leurs dépendances transitives et optionnelles.

Le déplacement ne corrige pas la bibliothèque vulnérable. Un audit incluant les outils de développement peut encore signaler cette vulnérabilité. Le risque résiduel concerne les processus Node de compilation traitant des motifs extglob malveillants ; les motifs du dépôt doivent être revus et aucune entrée utilisateur non fiable ne doit alimenter ces outils. L’audit de production continue de contrôler toutes les dépendances réellement classées production, sans exception globale. Réexaminer l’avis et mettre à jour les outils lorsqu’un correctif compatible officiel sera disponible.

L’audit complet exécuté pendant ce hotfix retourne 13 entrées, dont les méta-vulnérabilités des paquets parents : 6 modérées et 7 élevées, sur les chaînes de développement picomatch et minimatch. Il reste non vert ; aucune de ces entrées ne figure dans le graphe de production contrôlé. Les mises à niveau annexes des outils ne font pas partie de ce correctif ciblé.

### Vérifications locales du hotfix

| Contrôle | Résultat |
| --- | --- |
| `npm ci` | Réussi, installation propre avec dépendances de développement |
| `npm audit --omit=dev --audit-level=high` | Réussi, **0 vulnérabilité** |
| `npm run types` | Réussi |
| `npm run lint:check` | Réussi |
| `npm run test:frontend` | **118 tests réussis** sous Node22.23.5 |
| `npm run build` | Réussi ; les avertissements préexistants de polices statiques et de taille de chunk restent visibles |
| `npm ci --dry-run --strict-peer-deps` | Réussi sous le Node22 courant, sans conflit de peers |
| Filtre PostgreSQL exact de `.github/workflows/tests.yml` | **216 tests réussis**, 4 955 assertions |
| PostgreSQL concurrence | **9 tests réussis**, 62 assertions |
| `git diff --check` | Réussi |

Les versions déjà verrouillées ne changent pas. Les métadonnées optionnelles WASM d’`@emnapi/core`, `@emnapi/runtime` et `@emnapi/wasi-threads` sont conservées avec leurs versions et intégrités existantes ; leur placement est resynchronisé pour permettre l’installation propre. L’arbre `npm ls --omit=dev --all` ne contient aucun des quatre outils déplacés ni picomatch, et ne signale aucune dépendance invalide.

Les tests PostgreSQL locaux utilisent PHP8.4.5 et PostgreSQL18 dans un cluster jetable ; GitHub Actions configure PostgreSQL16. Les assets produits par la vérification locale du build ne font pas partie du hotfix. Les jobs GitHub Actions distants ne sont pas déclarés réussis avant leur exécution après publication autorisée.

### Intégration préparée

Branche locale `fix/usk-ci-security-fixture`, créée depuis `develop` synchronisée avec `origin/develop`. Après autorisation de publication : PR ciblée vers `develop`, exécution effective des jobs GitHub Actions, puis PR de promotion de `develop` vers `main` après validation. Aucune fusion, publication ou exécution du workflow de déploiement n’est effectuée dans ce hotfix.
