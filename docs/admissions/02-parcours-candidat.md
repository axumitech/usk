# Parcours candidat

Le site public affiche les formations publiées. L’espace candidat utilise le compte et la vérification d’adresse d’Identity. La sélection commence par l’année académique, puis la faculté, le programme et le niveau. Une matrice de contextes admissibles filtre ces choix avec les relations et campagnes existantes. Les formations historiques sans programme officiel restent utilisables selon leurs conditions générales ; leur intitulé est renseigné une seule fois avec la formation. Une campagne configurée applique ses dates et son ouverture ; l’absence de campagne conserve la règle historique d’admission. Le serveur revérifie la disponibilité et la cohérence du contexte à la soumission.

Le formulaire conserve quatre étapes : formation ; coordonnées personnelles ; pièces d’identité et justificatifs académiques du parcours antérieur ; récapitulatif et confirmation. La sauvegarde pour plus tard accepte un dossier incomplet, y compris avant le choix du niveau. La reprise conserve l’UUID, l’année, les champs, les pièces et l’étape sauvegardée. Un changement de contexte conserve les informations et fichiers, et signale les choix devenus invalides. Un contexte fermé est expliqué sans substituer silencieusement une autre année. Les exigences documentaires sont rechargées à la reprise.

Les brouillons expirent après 30 jours sans sauvegarde. Une nouvelle sauvegarde sans UUID reprend le brouillon vivant du même contexte. Un brouillon expiré reste conservé. La soumission valide la confirmation du candidat et l’existence effective des pièces exigées, conserve la référence et le matricule, date le dossier et envoie le reçu après validation de la transaction.

Le suivi se fait dans Mes inscriptions avec une session vérifiée et une recherche limitée au propriétaire. Le candidat voit son programme, ses dates, ses pièces, les verdicts communicables et la décision. Il peut remplacer une pièce à corriger pendant l’analyse ou retirer une candidature sans décision. Un dossier refusé conserve le motif. Un dossier admis affiche le lien vers l’espace étudiant.

Les champs existants sont le nom et l’adresse email déclarés, le contexte académique, la confirmation et les pièces. La phase s’appuie sur les justificatifs pour le parcours antérieur. Des champs structurés supplémentaires nécessitent des règles institutionnelles et une définition de leur usage et de leur conservation.

Le correctif de reprise et ses vérifications ciblées sont détaillés dans [l’Ordre 02](11-reprise-brouillons.md).
