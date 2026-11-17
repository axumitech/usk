# Tests techniques et limites

Contrôles exécutés le 17 novembre 2026 sur la branche `feature/usk-security-access-fixes`. Aucune modification du code métier n’a été nécessaire pour les scénarios déjà validés de cette recette.

| Contrôle | Résultat observé |
| --- | --- |
| PHPUnit complet, SQLite en mémoire | **539 réussis**, 161 482 assertions |
| PostgreSQL, sélection élargie Ordres03–05 | **265 réussis, 1 erreur sur 266** ; 8 106 assertions avant arrêt de la suite |
| PostgreSQL, concurrence | **9 réussis**, 62 assertions |
| Tests frontend Node | **118 réussis**, zéro échec |
| TypeScript `tsc --noEmit` | Réussi |
| ESLint `eslint . --max-warnings=0` | Réussi |
| Vite, sortie extérieure au dépôt | Réussi ; avertissements sur chemins de polices statiques et chunk supérieur à 500 kB |
| Syntaxe PHP des fichiers Ordres04/05 | **39 fichiers contrôlés**, zéro erreur |

L’erreur PostgreSQL est précisément localisée dans [UniversityFinanceTest.php](../../tests/Feature/UniversityFinanceTest.php) à la création de la faculté de test `TARIF-AUTRE` : le code compte 11 caractères alors que la colonne en autorise 10. SQLite ne fait pas respecter cette longueur. La suite a donc une erreur de fixture avant l’action métier concernée ; ce scénario PostgreSQL ne peut pas être déclaré validé. Priorité **P2 pour la recette**, sans panne produit reproduite. Aucun élargissement de colonne ni correctif facultatif n’a été entrepris.

Les échecs intermédiaires Chromium ont concerné l’environnement sandbox ou les scripts : libellés contenant des aides/options, attente entre étapes, reprise d’une copie déjà déposée, URL de calendrier et reconnexion après simulation d’échéance. Ils ont été repris sur le même jeu sans effacer les données. Les résultats finaux par module, les cas bloqués éventuels et les preuves figurent dans la matrice. Une attente de sélecteur n’a pas été présentée comme un défaut produit.

Le refus de clôturer un devoir avant l’échéance est le comportement métier attendu. Une horloge `clock.json`, vérifiée contre `APP_ENV=testing` et le chemin exact de `demo.sqlite`, permet d’exécuter la clôture après échéance. Elle n’est jamais chargée par le serveur applicatif normal. Les sessions de test sont renouvelées lors de ce changement temporel.

## Périmètre des conclusions

- Les refus de routes et les mutations critiques sont testés côté navigateur et contrôlés par des sondes en lecture seule sur la base fictive.
- Les écrans mobiles essentiels ont été parcourus à 390 × 844 ; cela ne constitue pas une certification d’accessibilité ou un test exhaustif de tous les appareils.
- Aucun paiement, email ou contact extérieur réel n’a été effectué.
- Les règles `AccessRule` pédagogiques de cette instance sont ouvertes. Les refus financiers de confirmation sont testés séparément ; aucune politique institutionnelle réelle de blocage des supports n’est affirmée.
- Le PDF est une attestation SPECIMEN d’une page, également rendue et relue visuellement. Les diplômes réels et leur valeur administrative sont hors validation.
- Aucun test de charge, de bascule, de sauvegarde/restauration ou d’exploitation en production n’est réalisé dans cet ordre.

Contrôles de clôture : ESLint complet rejoué après ajout des outils de recette, réussi ; syntaxe de 15 scripts Node, 3 scripts PHP et du lanceur PowerShell, réussie ; liens Markdown locaux vérifiés sans cible manquante ; 118 empreintes de preuve vérifiées sans divergence ; aucun motif de secret détecté dans les 46 fichiers texte du dossier. Les fichiers temporaires `.env.testing` et `debug.log` créés pour cette recette ont été retirés après vérification de leur contenu. La base fictive conserve 26 comptes, 13 profils/inscriptions, 5 offres, 3 séances, 2 évaluations, 2 résultats officiels de test et un document SPECIMEN ; le contrôle de santé final répond HTTP200.

`git diff --check` est réussi ; le contrôle est également appliqué au contenu indexé avant le commit. Le résumé de PR reste local ; aucun push, merge ou déploiement n’est effectué.
