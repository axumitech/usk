# Université Simon Kimbangu

[Guide d’utilisation et comptes de démonstration](docs/Guide-utilisation-USK.docx)

## Charger la démonstration

Dans le `.env`, configurez la connexion de l’installation. Pour PostgreSQL, utilisez `DB_CONNECTION=pgsql` et les valeurs fournies par l’hébergeur pour `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME` et `DB_PASSWORD`. Pour le registre des documents, réglez `APP_URL=https://usk.axumindustries.com` sur cet hébergement. Le nom de la base est libre. Avec SQLite, indiquez le chemin du fichier dans `DB_DATABASE`. Après une modification du `.env` en hébergement, lancez `php artisan config:clear`.

Pour recréer toutes les tables et charger les deux années universitaires et les comptes fictifs, lancez cette commande depuis le dossier contenant `artisan`. **Elle efface toutes les tables de la base configurée.**

```bash
php artisan migrate:fresh --seed
```

En production, Laravel demande confirmation. Pour un terminal non interactif, ajoutez `--force` après avoir vérifié la base cible. Si les tables sont déjà créées et vides, `php artisan db:seed` suffit. Relancer cette commande sur une démonstration déjà initialisée conserve les dossiers et les comptes.

Ouvrez `/app/login`. Les comptes fictifs utilisent tous `password`. Par exemple, `candidat.dpu@usk.test` a déjà soumis un dossier en Droit public et `rectorat@usk.test` accède aux indicateurs institutionnels. Les règles, durées et décisions du jeu de données sont fictives.
