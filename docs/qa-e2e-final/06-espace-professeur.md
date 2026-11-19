# Fiche de test USK — Espace professeur

**Date** 19 novembre 2026, heure de Kinshasa

**Version exécutée** `8cc16567b2dfcd7e719b882cc5ac5fcb8c615488`

**Navigateur** Chromium visible, Playwright, port local 8064

**Compte** `professeur.droit@usk.test`

| Action | Observation | Verdict |
| --- | --- | --- |
| Se connecter et ouvrir une offre administrable | Le compte enseignant a ouvert sa bibliothèque et l’offre n° 13. | ✅ |
| Créer un support pédagogique | Le formulaire a enregistré le support n° 16. HTTP 303 vers la fiche du support. Le message « Support enregistré. » était visible. | ✅ |
| Publier le support avec un deuxième onglet du tableau de bord ouvert | La publication a persisté dans SQLite, avec `is_published=1` et révision 2. La modale a toutefois invité le professeur à vérifier le dossier avant de réessayer. | ❌ |
| Créer et publier une évaluation, corriger une copie | Le premier scénario s’est arrêté sur le retour de publication. | ⏭️ |

**QA-ENS-01 — Important.** La modale attendait une confirmation éphémère dans la réponse. Quand celle-ci manquait, elle affichait une erreur même si la réponse de la fiche contenait l’état publié. Le correctif vérifie le composant, l’offre, l’identifiant, la révision suivante et l’état du support renvoyé par Laravel. Pour une autre ressource ou une révision obsolète, le message d’incertitude est conservé. Les deux tests unitaires de ce contrôle passent.

[Trace HTTP du premier essai](preuves/enseignement-2026-11-19T09-37-28-664Z/trace.json) · [Modale après la publication](preuves/enseignement-2026-11-19T09-37-28-664Z/diagnostic.png)

**Contrôle sur la révision compilée `a36ed79dd7f9c26c548c9fbf415775b123b267c6`**. Sur le profil neuf du port 8066, l’enregistrement et la demande de publication du support n° 16 ont reçu la redirection attendue. Au terme des 50 secondes du pilote, la modale indiquait encore « Enregistrement… ». La trace s’arrête au POST 303, avant réception du GET de confirmation. Cet essai ne permet pas de conclure sur le retour visuel corrigé. [Trace du rejeu](preuves/enseignement-2026-11-19T10-05-52-571Z/trace.json) · [Formulaire en cours de sauvegarde](preuves/enseignement-2026-11-19T10-05-52-571Z/diagnostic.png)

**Rejeu abouti sur `7bbfba884e5fc30d5785fd556595a3f195eea98b`, port 8068.** Le professeur de Droit a retiré puis republié le même support n° 16. Le POST a répondu 303, le retour à la fiche de l’offre n° 13 a présenté « Support publié. » et le rechargement a confirmé la révision 4 publiée. Le professeur a également créé puis publié l’évaluation n° 12, ressource n° 17, révision 2. La fiche a conservé l’évaluation pendant l’opération et l’a affichée publiée après rechargement. Les deux réponses de ce rejeu contenaient le message éphémère de succès. La branche qui confirme la publication par son état lorsque ce message manque est couverte par les tests unitaires. [Trace et retours Inertia](preuves/enseignement-2026-11-19T10-31-42-312Z/trace.json) · [Support publié](preuves/enseignement-2026-11-19T10-31-42-312Z/01-support-publie.png) · [Évaluation publiée](preuves/enseignement-2026-11-19T10-31-42-312Z/02-evaluation-publiee.png)

Le professeur a également publié une annonce sur son offre n° 13. Le même titre et le texte saisi sont arrivés dans le dossier n° 9 et sa notification individuelle, sur `2e9c69d01d847475ec4460512179ce3ebe60054c`. [Publication de l’annonce](preuves/modules-2026-11-19T10-37-47-099Z/MOD-01.png) · [Lecture dans le dossier étudiant](preuves/modules-2026-11-19T10-37-47-099Z/MOD-02.png)

Sur `2e9c69d01d847475ec4460512179ce3ebe60054c`, le professeur a publié le devoir n° 18 de l’offre n° 13 et enregistré la présence de l’étudiant n° 9 à la séance n° 17. Il a consulté la copie et sa pièce, saisi **16/20** et une appréciation, puis finalisé la correction. Après validation par le vice-doyen, le même étudiant a pu consulter cette note. [Feuille de présence](preuves/evaluation-2026-11-19T10-41-13-419Z/EVA-03.png) · [Correction du professeur](preuves/evaluation-2026-11-19T10-41-13-419Z/EVA-04.png) · [Sept contrôles croisés](preuves/evaluation-2026-11-19T10-41-13-419Z/resume.json)

Le professeur a créé le chapitre « Méthodes de lecture du droit », enregistré sa position 3 et publié dans ce chapitre le syllabus n° 19 avec ses objectifs. L’étudiant n° 9 les retrouve dans les ressources de son cours. Sur le compte du professeur de Médecine, le lien de l’offre de Droit répond 404 et celui de la ressource seule répond 403. Les quatre contrôles ont abouti sur `2e9c69d01d847475ec4460512179ce3ebe60054c`, port 8066. [Journal du plan de cours](preuves/plan-cours-2026-11-19T11-20-45-363Z/resume.json) · [Chapitre et ordre](preuves/plan-cours-2026-11-19T11-20-45-363Z/PLAN-01.png) · [Syllabus chez l’étudiant](preuves/plan-cours-2026-11-19T11-20-45-363Z/PLAN-03.png) · [Accès interfacultaire refusé](preuves/plan-cours-2026-11-19T11-20-45-363Z/PLAN-04.png)

**Décision du module** VALIDÉ pour les actions du professeur sur l’offre de Droit, de la publication des contenus jusqu’à la correction individuelle.
