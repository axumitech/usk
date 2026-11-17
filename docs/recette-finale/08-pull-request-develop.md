# PR préparée localement — USK, Ordres03 à06

Branche source : `feature/usk-security-access-fixes` · Cible : `develop`.

Titre proposé : **Finaliser les workflows universitaires et la recette multi-rôles USK**.

Les workflows d’admission, confirmation financière, maquettes, enseignements et accès par faculté sont vérifiés ensemble sur une université exclusivement fictive. La recette couvre de vrais formulaires Chromium, les liens directs interdits et les écrans mobiles essentiels. Les résultats détaillés et limites se trouvent dans `docs/recette-finale/`.

Les commits Ordres03/04 sont conservés. L’Ordre05 a son commit local distinct. L’Ordre06 ajoute le dossier, les preuves et les outils de recette isolée ; seuls les P0/P1 reproduits auraient autorisé un changement métier. Les ajustements des scripts de navigateur ne sont pas présentés comme des corrections produit.

Validation technique : PHPUnit SQLite539/539 ; PostgreSQL265/266 avec une erreur de fixture documentée (`TARIF-AUTRE`, code trop long) ; concurrence PostgreSQL9/9 ; frontend118/118 ; TypeScript, ESLint, build Vite et syntaxe PHP39fichiers réussis. Les comptes, barèmes et documents sont fictifs ; le PDF est marqué SPECIMEN.

Le verdict de démonstration et les nombres finaux de parcours figurent dans `07-verdict.md`. L’exploitation réelle reste soumise aux règles institutionnelles et aux vérifications d’infrastructure, sauvegarde, restauration et exploitation.

Cette PR n’est pas publiée. Aucun push, merge ou déploiement. Avant une publication autorisée, vérifier le compte GitHub réellement connecté, son accès au dépôt et la branche cible ; le compte souhaité par EMDF ne peut pas être présumé connecté.
