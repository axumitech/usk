# Mesures sur 5 000 étudiants — annuaire, bulletin PDF et file

19 novembre 2026, 11 h 05 à Kinshasa. Application à la révision `a36ed79`, sans changement local de code métier au moment de la mesure. Le profil SQLite exclusivement synthétique contenait 5 000 étudiants et 2 506 paiements. Chaque série comprend un échauffement et dix répétitions mesurées. Avec dix valeurs, le 95e centile empirique au rang supérieur correspond au maximum. [Mesures JSON](volume-metiers.json)

| Opération | Résultat contrôlé à chaque passage | Médiane | 95e centile | Requêtes SQL |
| --- | --- | ---: | ---: | ---: |
| Annuaire, recherche exacte | 1 ligne rendue | 123,35 ms | 146,96 ms | 42 |
| Annuaire, recherche par préfixe | 10 lignes rendues | 78,55 ms | 125,36 ms | 42 |
| Annuaire, recherche large | 15 lignes sur la première page | 74,42 ms | 87,27 ms | 42 |
| Bulletin de résultats | Réponse PDF nouvellement créée et archive SHA‑256 vérifiée | 720,98 ms | 1 015,29 ms | 24 |
| Ajout d’une notification à la file | Travail placé en base | 9,81 ms | 25,53 ms | — |
| Traitement d’une notification en attente | Réservation, livraison applicative et acquittement | 35,29 ms | 58,66 ms | 6 |

L’annuaire a exécuté le même nombre de requêtes en affichant une, dix ou quinze lignes. Une forme de requête sur les facultés est répétée six fois dans les trois cas. Sa fréquence fixe relève d’un coût partagé entre les affichages. Ce test ne montre aucune croissance de type N+1 pour les lignes de cette page. Les recherches portent sur des termes différents et les latences fluctuent avec la charge du poste.

Le bulletin provient de la route étudiante qui génère et archive un résultat publié. Chaque itération crée un nouveau PDF dans un stockage de mesure isolé. Une transaction annulée après la lecture empêche le passage suivant de réutiliser une archive. Les dix réponses mesurées contiennent entre 26 590 et 26 804 octets, toutes conformes à l’empreinte enregistrée par le service.

Un deuxième processus PHP a consommé exclusivement la file de mesure au moyen du worker Laravel. Les onze travaux, échauffement compris, ont produit onze notifications applicatives. La file s’est vidée sans échec. Les 1 457,62 ms du processus complet comprennent le démarrage de PHP et de Laravel. Les médianes et centiles de traitement du tableau mesurent chaque travail dans le worker démarré.

Ces durées portent sur le noyau HTTP, SQLite local et un worker séquentiel. Elles ne permettent pas d’estimer la latence réseau, le temps de rendu dans Chrome ou la capacité d’une grappe de workers en production.

## Rejouer

Préparer le profil isolé de 5 000 étudiants avec `volume.php`. Conserver sa variable `USK_RECETTE_V2_ROOT` et lancer le complément depuis la révision de l’application à mesurer. Le lanceur exige le nom de répertoire `usk_qa_e2e-volume`, son marqueur de charge, l’identité SQLite attendue et le domaine fictif des comptes.

```powershell
php docs/qa-e2e-final/scripts/volume-metiers.php
```

Les notifications de mesure restent consultables dans ce seul profil. Les archives PDF temporaires libérées après le test ne contiennent aucune donnée de l’installation usuelle. [Script de mesure](../scripts/volume-metiers.php)

