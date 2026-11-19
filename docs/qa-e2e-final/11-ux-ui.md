# Fiche de test USK — Expérience utilisateur

**Date** 19 novembre 2026, heure de Kinshasa

**Versions exécutées** Révisions et preuves indiquées pour chaque rejeu. Première exécution sur `8cc16567b2dfcd7e719b882cc5ac5fcb8c615488`.

**Navigateur** Chromium visible, Playwright

**Comptes** Candidat, étudiant et administrateur institutionnel, selon le parcours

| Interaction | Résultat observé | Verdict |
| --- | --- | --- |
| Saisir des identifiants erronés avec un autre onglet ouvert | La réponse HTTP 302 conserve la page de connexion et associe l’erreur « Identifiants invalides » au champ. | ✅ |
| Se déconnecter puis demander une page privée | Un message de déconnexion apparaît et l’application redemande les identifiants. | ✅ |
| Enregistrer un brouillon de candidature et y revenir | Le message de sauvegarde est visible, les pièces et le contexte académique sont restaurés. | ✅ |
| Continuer avec une pièce exigée manquante | Le formulaire indique l’erreur et garde l’étape courante. | ✅ |
| Rejouer une saisie financière après perte de réponse | Deux tentatives ont conservé le dossier du même étudiant et une seule écriture. Le montant invalide affiche une erreur dans la modale. | ✅ |
| Ouvrir la carte depuis l’espace étudiant | Le lien « Gérer ma photo de profil » mène à la gestion de la photo. | ✅ |
| Publier le support du professeur avec deux onglets ouverts | Une publication réussie a laissé une modale d’échec ouverte. QA-ENS-01 est documentée dans la fiche professeur. | ❌ sur cette révision |
| Parcourir les 48 destinations du menu administratif | Le parcours enregistre les réponses HTTP et les en-têtes de page. Les mutations et la qualité visuelle de chaque page demandent des contrôles propres. | ⚠️ |

[Observations candidat](preuves/portails-2026-11-19T09-25-04-065Z/resume.json) · [Capture des identifiants refusés](preuves/portails-2026-11-19T09-25-04-065Z/AUTH-01.png) · [Menu et destinations](preuves/navigation-2026-11-19T09-12-27-378Z/navigation.json)

[Erreur d’un montant nul](preuves/finances-2026-11-19T09-46-54-497Z/F02-montant-invalide.png) · [Modale de publication à corriger](preuves/enseignement-2026-11-19T09-37-28-664Z/diagnostic.png)

### Formulaires historiques et accessibilité

Sur `a36ed79dd7f9c26c548c9fbf415775b123b267c6`, la description de la faculté n° 2 a conservé ses 1 000 caractères après sauvegarde et rechargement. Le formulaire a empêché la frappe d’un caractère supplémentaire puis a permis de restaurer la description initiale. La base de cet essai était SQLite. [Description relue](preuves/ux-2026-11-19T10-19-30-274Z/UX-01a.png)

Les touches Fin et Flèche gauche déplacent le focus entre les onglets. Dix-huit tabulations successives gardent le focus dans la modale de niveau. Échap ferme le formulaire et rend le focus au bouton qui l’a ouvert. À 390 × 844, la modale de faculté tient entre x = 14 et x = 376, le bouton d’enregistrement reste cliquable et la largeur du document est de 390 pixels. Le contraste texte/fond du champ Nom mesure 5,958:1 en clair et 11,065:1 en sombre. [Matrice et mesures](preuves/ux-2026-11-19T10-19-30-274Z/resume.json) · [Thème clair](preuves/ux-2026-11-19T10-19-30-274Z/UX-04-light.png) · [Thème sombre](preuves/ux-2026-11-19T10-19-30-274Z/UX-04-dark.png)

**QA-UX-01 — Mineure.** Dans le formulaire Modifier le niveau, l’icône du sélecteur de faculté recouvre la première lettre du nom. Le style commun des champs ramenait la marge intérieure à 14 pixels, où se trouve l’icône. La règle CSS locale réserve à présent 41 pixels au pictogramme. Le pilote vérifie géométriquement l’écart entre le texte et l’icône. Le premier contrôle de redirection avait quant à lui échoué avant la mutation, le pilote avait lu les données de la liste au lieu de l’identité de la fiche. Sur `2e9c69d01d847475ec4460512179ce3ebe60054c` (8066), le texte commence 10 pixels après l’icône. Après sauvegarde du niveau n° 3 et rechargement, l’onglet Enseignants est resté actif sur `/app/dashboard/admin/levels/details/3?tab=prof`. Le rejeu a validé huit contrôles, y compris les deux thèmes, le clavier et les 1 000 caractères. [Contrôles et mesures du rejeu](preuves/ux-2026-11-19T10-35-37-490Z/resume.json) · [Espacement du sélecteur](preuves/ux-2026-11-19T10-35-37-490Z/UX-03a.png) · [Onglet et niveau conservés](preuves/ux-2026-11-19T10-35-37-490Z/UX-02a.png) [Capture du sélecteur](preuves/ux-2026-11-19T10-19-30-274Z/UX-02-blocage.png) · [Pilote de contrôle](browser/ux.cjs)

Le parcours étudiant sur `a36ed79dd7f9c26c548c9fbf415775b123b267c6` a vérifié le retour au dossier au clavier sur 390 pixels de large. La vue du cours tient dans le viewport et le retour maintient l’inscription n° 9. [Contrôle ACAD-04](preuves/portails-2026-11-19T10-17-48-378Z/resume.json) · [Capture mobile avec focus](preuves/portails-2026-11-19T10-17-48-378Z/ACAD-04-mobile-focus.png)

La PWA a chargé le fichier Vite dont l’empreinte correspond à la révision compilée. Le navigateur a installé le service worker du portail, conservé uniquement la page de secours dans son cache, puis présenté cette page lors d’une navigation hors connexion. [Trace PWA et empreintes](preuves/pwa-2026-11-19T10-19-21-584Z/trace.json) · [Page de secours hors connexion](preuves/pwa-2026-11-19T10-19-21-584Z/02-secours-hors-ligne.png)

Sur `7bbfba884e5fc30d5785fd556595a3f195eea98b`, le professeur a vu les confirmations de publication du support et de l’évaluation dans la fiche correspondante. Le doyen a pu choisir plusieurs motifs documentaires, corriger le détail d’un motif libre trop court et poursuivre la demande de correction. [Feedback pédagogique](preuves/enseignement-2026-11-19T10-31-42-312Z/trace.json) · [Motifs du contrôle des pièces](preuves/portails-2026-11-19T10-24-30-780Z/S03-03.png)

L’étudiant de Droit a retrouvé le titre de l’annonce dans la liste de 2026–2027, ouvert son corps complet et suivi la notification vers la même ressource n° 17 et l’inscription n° 9. Le professeur avait publié cette annonce depuis son offre n° 13, sur `2e9c69d01d847475ec4460512179ce3ebe60054c`. [Annonce dans la liste](preuves/modules-2026-11-19T10-37-47-099Z/MOD-02-liste.png) · [Texte du détail](preuves/modules-2026-11-19T10-37-47-099Z/MOD-02.png) · [Notification individuelle](preuves/modules-2026-11-19T10-37-47-099Z/MOD-03-notification.png)

## Logo et favicon du site

Le 19 novembre 2026 sur le port 8073, l’administrateur institutionnel a téléversé le logo et le favicon depuis les paramètres du site, rechargé la page, puis modifié uniquement le slogan. Le navigateur a comparé chaque image à son PNG source et interrogé son URL publique sans envoyer de cookie. [Pilote rejouable](browser/medias-publics.cjs)

| Anomalie | Première exécution sur `570e71b818203ab51078e7fe47ca845be9996305` |
| --- | --- |
| QA-IMG-01 · Accès aux images téléversées | Deux chemins ont été enregistrés. Les deux GET publics ont renvoyé HTTP 403 et du HTML. Le navigateur a affiché deux images cassées, de dimensions intrinsèques nulles. [Mesures HTTP et dimensions](preuves/medias-publics-2026-11-19T11-37-02-233Z/diagnostic-medias.json) · [Écran après téléversement](preuves/medias-publics-2026-11-19T11-37-02-233Z/IMG-02-blocage.png) |
| QA-IMG-02 · Conservation lors d’une édition de texte | Le nouveau slogan a été enregistré. Après rechargement, les références du logo et du favicon étaient toutes deux nulles. [Journal du formulaire](preuves/medias-publics-2026-11-19T11-37-02-233Z/resume.json) · [Écran après édition](preuves/medias-publics-2026-11-19T11-37-02-233Z/IMG-03-blocage.png) |

Les deux anomalies sont corrigées sur `a46a95e9ff77187515779a10ae56048e18026589`, révision identique côté serveur et assets. Le routeur de recette dessert les images du stockage public du profil. La sauvegarde du site conserve la référence de chaque média lorsque son champ de téléversement reste vide. Le rejeu sur le même profil a validé les quatre contrôles. [Journal du rejeu](preuves/medias-publics-2026-11-19T11-46-07-756Z/resume.json)

| Image | GET sans cookie après édition | Contrôle du fichier affiché |
| --- | --- | --- |
| Logo | HTTP 200 · `image/png` · 39 839 octets | 192 × 192 pixels, décodé et visible. Chemin inchangé et SHA-256 identique au PNG source. |
| Favicon | HTTP 200 · `image/png` · 36 047 octets | 180 × 180 pixels, décodé et visible. Chemin inchangé et SHA-256 identique au PNG source. |

Les captures montrent les deux emblèmes dans la rubrique Médias avant et après la modification du slogan. [Empreintes et réponses HTTP](preuves/medias-publics-2026-11-19T11-46-07-756Z/diagnostic-medias.json) · [Après téléversement](preuves/medias-publics-2026-11-19T11-46-07-756Z/IMG-02.png) · [Après modification du slogan](preuves/medias-publics-2026-11-19T11-46-07-756Z/IMG-04.png)

### Nom obligatoire dans les paramètres

**QA-UX-02 · Mineure.** Le serveur exige un nom de site de 1 à 255 caractères. Sur `a46a95e9ff77187515779a10ae56048e18026589`, Chromium a relevé le libellé « Nom du site », un champ facultatif et aucune longueur maximale. La tentative à vide a envoyé une requête POST, rejetée par Laravel. Le serveur a conservé la même fiche et ses données. [Mesures du champ et de la requête](preuves/medias-publics-2026-11-19T12-07-02-486Z/validation-nom.json) · [Saisie vide et erreur](preuves/medias-publics-2026-11-19T12-07-02-486Z/IMG-05-champ-vide.png)

**Corrigé et vérifié.** Sur `08fa60fbc55a5c67afe2b43a5df3357e21f855cd`, le champ porte le libellé « Nom du site (obligatoire) » pendant l’édition. La 256e frappe laisse 255 caractères. À vide, Chromium déclenche la validation native et place le focus sur le champ. Aucune requête d’écriture n’est partie et la fiche relue après restauration est identique. La bulle native de cette installation de Chromium est en anglais. Les cinq contrôles du formulaire et des deux images ont réussi sur le même build. [Mesures après correction](preuves/medias-publics-2026-11-19T12-10-29-818Z/validation-nom.json) · [Saisie vide après correction](preuves/medias-publics-2026-11-19T12-10-29-818Z/IMG-05-champ-vide.png) · [Journal des cinq contrôles](preuves/medias-publics-2026-11-19T12-10-29-818Z/resume.json)

## Inventaire des formulaires React

Sur la révision `08fa60fbc55a5c67afe2b43a5df3357e21f855cd`, l’analyse syntaxique TypeScript a parcouru les **306 fichiers JavaScript et TypeScript** sous `resources/js`, hors déclarations de types. Au moins un des douze éléments observés apparaît dans 138 fichiers répartis entre 35 modules ou groupes de composants partagés. Le JSON contient les totaux par module et une ligne par fichier avec signal. Les chemins sont relatifs à `resources/js`. La commande `node docs/qa-e2e-final/scripts/inventaire-formulaires.cjs 08fa60f` relit directement les objets Git de cette révision et régénère la preuve. Le JSON consigne la version TypeScript, l’arbre Git `e7b24d353e334407f210357469d8fd3e4123ab07` et l’empreinte SHA-256 des sources. [Inventaire par fichier et module](preuves/formulaires-react.json) · [Programme de reproduction](scripts/inventaire-formulaires.cjs)

| Élément reconnu dans le code | Occurrences | Fichiers concernés |
| --- | ---: | ---: |
| Balises JSX HTML `<form>` | 134 | 92 |
| Appels au hook Inertia `useForm` | 101 | 73 |
| Soumissions par les méthodes de l’objet ou des fonctions issus de ce hook | 112 | 71 |
| Mutations directes du routeur Inertia | 8 | 6 |
| Liens Inertia portant une méthode de mutation littérale | 4 | 3 |
| Mutations Axios et Fetch reconnues avec une méthode explicite | 7 | 4 |
| Usages de composants dont le nom se termine par `Form`, ou d’`AdminModal` relié par `formId` | 84 | 58 |
| Balises natives `input`, `select`, `textarea` | 544 | 106 |

Les 193 attributs `required` comprennent les expressions conditionnelles. Les 52 boutons de soumission explicites, 102 alertes et 165 attributs indiquant une opération en cours sont des occurrences de code. Un constructeur comme `AcademicForm` produit des champs différents selon le dossier. Un bouton de modale peut soumettre un formulaire situé dans un autre composant. Les appels indirects, les méthodes déterminées à l’exécution et les contrôles construits par des bibliothèques demandent une lecture du contexte. Ces comptages ne donnent pas un nombre de procédures métier ni un taux de conformité.

**Contrôles partagés relus.** `AdminModal` place le focus à l’ouverture, le restitue à la fermeture, récapitule les erreurs et bloque la double soumission pendant l’enregistrement. `AcademicForm` applique les règles de chaque champ et distingue les erreurs de serveur, de session et d’absence de réponse. La recette clavier du niveau, le versement avec perte de réponse et la publication du support exercent ces mécanismes au travers d’écrans réels. [Modale partagée](../../resources/js/components/admin/AdminModal.tsx) · [Formulaire partagé](../../resources/js/pages/dashboard/studentAcademic/AcademicForm.tsx) · [Clavier](preuves/ux-2026-11-19T10-35-37-490Z/resume.json) · [Versement](04-finances.md) · [Publication du support](06-espace-professeur.md)

**Saisies effectivement réalisées dans Chromium.** Les fiches documentent les candidatures et leurs pièces, la décision d’admission, les justificatifs et versements, la présence, le dépôt et la correction des travaux, la justification des absences, les cartes, les demandes de documents et les paramètres du site. L’ouverture de 48 destinations apporte une preuve de navigation distincte. La manipulation des variantes conditionnelles et la vérification d’accessibilité de chaque formulaire des 35 groupes demeurent partielles. [Admissions](03-admissions.md) · [Finances](04-finances.md) · [Espace étudiant](05-espace-etudiant.md) · [Pédagogie](07-pedagogie-evaluations.md) · [Cartes et documents](09-cartes-documents.md) · [Parcours des 48 destinations](preuves/navigation-2026-11-19T10-24-18-430Z/navigation.json)

**Décision du module** VALIDÉ pour les parcours de formulaire, de clavier et d’annonce décrits, ainsi que l’affichage et la conservation du logo et du favicon. La couverture visuelle et l’accessibilité des autres pages restent partielles.
