# Université Simon Kimbangu

[Guide d’utilisation et comptes de démonstration](docs/Guide-utilisation-USK.docx)

## Charger la démonstration

Dans une copie dédiée avec les dépendances installées et une clé Laravel configurée, créez un fichier SQLite vide nommé `usk-demo.sqlite`, hors de `public/`. Dans le `.env` de cette copie, réglez `APP_ENV=local` (ou `staging` sur une préproduction dédiée), `DB_CONNECTION=sqlite` et `DB_DATABASE` sur le chemin absolu du fichier. Laissez `DB_URL` vide. Utilisez le stockage propre à cette installation pour les justificatifs et les documents. Pour une démo sans serveur de courrier ni worker, choisissez `MAIL_MAILER=log` et `QUEUE_CONNECTION=sync`.

```bash
php artisan config:clear
php artisan migrate --seed
```

Sur cette base, le seeder charge les deux années universitaires. Pour le relancer sur une base déjà migrée, utilisez `php artisan db:seed --class=UniversityDemoSeeder`. Un second passage conserve les dossiers et les pièces. La commande `migrate:fresh` efface la base sélectionnée ; l’installation courante utilise simplement `migrate`.

Ouvrez `/app/login`. Les comptes fictifs utilisent tous `password`. Par exemple, `candidat.dpu@usk.test` a déjà soumis un dossier en Droit public et `rectorat@usk.test` accède aux indicateurs institutionnels. Les règles, durées et décisions du jeu de données sont fictives.
