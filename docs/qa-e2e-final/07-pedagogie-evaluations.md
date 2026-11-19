# Fiche de test USK — Pédagogie et évaluations

**Date** 19 novembre 2026, heure de Kinshasa

**Version exécutée** `8cc16567b2dfcd7e719b882cc5ac5fcb8c615488`

**Navigateur** Chromium visible, Playwright, port local 8064

**Comptes** Administration institutionnelle et professeur de Droit

| Fonction | Portée de la vérification | Verdict |
| --- | --- | --- |
| Enseignements, supports, rapports et absences | L’administrateur a ouvert les pages de ces rubriques et reçu des réponses HTTP 200. | ✅ consultation |
| Évaluations, transmission des notes et résultats | Les trois routes d’administration ont répondu en HTTP 200. | ✅ consultation |
| Support créé puis publié par son professeur | Le support n° 16 est publié malgré une alerte erronée. Le parcours professeur documente la correction. | ⚠️ |
| Séance, présence et justification, devoir remis, note et correction | Ces opérations exigent la preuve de leurs mutations respectives sur le profil courant. | ⏭️ |

[Navigation administrative par destination](preuves/navigation-2026-11-19T09-12-27-378Z/navigation.json) · [Fiche professeur](06-espace-professeur.md)

Sur la révision compilée `a36ed79dd7f9c26c548c9fbf415775b123b267c6`, un étudiant du dossier n° 9 a ouvert le cours n° 5, deux supports et les consignes d’un travail. Le candidat fictif a reçu un HTTP 403 au téléchargement du support protégé. La matrice fait le lien avec les captures de la bibliothèque, du travail et du retour mobile. [Parcours pédagogique étudiant](preuves/portails-2026-11-19T10-17-48-378Z/resume.json)

Sur `7bbfba884e5fc30d5785fd556595a3f195eea98b`, le professeur a publié le support n° 16 et l’évaluation n° 12 de l’offre n° 13. Les deux opérations reviennent sur la bonne fiche, présentent leur message de succès et conservent l’état publié au rechargement. [Contrôle des deux publications](preuves/enseignement-2026-11-19T10-31-42-312Z/trace.json)

Le 19 novembre, sur `2e9c69d01d847475ec4460512179ce3ebe60054c`, port 8066, le devoir n° 18 de l’offre n° 13 est resté ouvert jusqu’à 11 h 49 à Kinshasa. L’étudiant n° 9 a déposé la copie n° 21, version 1, avec un fichier. Le professeur a consigné sa présence à la séance publiée n° 17. Après l’échéance et la clôture du devoir, il a finalisé la correction à **16/20**. Le vice-doyen a validé et diffusé l’appréciation. Une transmission est enregistrée, et le même étudiant a lu sa note et son commentaire seulement après la publication. Les sept contrôles ont abouti. [Journal du parcours complet](preuves/evaluation-2026-11-19T10-41-13-419Z/resume.json) · [Présence](preuves/evaluation-2026-11-19T10-41-13-419Z/EVA-03.png) · [Finalisation de la correction](preuves/evaluation-2026-11-19T10-41-13-419Z/EVA-04.png) · [Note côté étudiant](preuves/evaluation-2026-11-19T10-41-13-419Z/EVA-07.png)

L’offre n° 13 comporte également un chapitre créé, réordonné et associé au syllabus n° 19. L’étudiant trouve le syllabus, les objectifs et le nom du chapitre au même endroit dans son cours. [Syllabus publié](preuves/plan-cours-2026-11-19T11-20-45-363Z/PLAN-02.png) · [Ressources de l’étudiant](preuves/plan-cours-2026-11-19T11-20-45-363Z/PLAN-03.png)

**Décision du module** VALIDÉ pour le syllabus, le chapitre, le devoir, la présence et la correction jusqu’à la consultation étudiante. La justification d’une absence exige son propre essai.

## Complément de recette des justifications d’absence

Sur le profil rectorat, l’étudiant fictif de Droit public a ouvert l’absence n° 6 du 12 mai 2026 et déposé son motif. Un agent administratif distinct a accepté la demande n° 41 avec une décision motivée. L’étudiant a retrouvé la décision dans son espace personnel, en révision 2. L’audit rattache le dépôt au titulaire du dossier et la décision à l’agent. [Dépôt étudiant](preuves/absence-2026-11-19T11-35-35-959Z/ABS-02.png) · [Examen administratif](preuves/absence-2026-11-19T11-35-35-959Z/ABS-03.png) · [Décision relue par l’étudiant](preuves/absence-2026-11-19T11-47-00-526Z/ABS-04.png) · [Résultat et audit](preuves/absence-2026-11-19T11-47-00-526Z/resume.json)

Ce parcours a révélé que la deuxième absence pouvait présenter un lien administratif vers la pièce privée. Après correction sur la révision `a46a95e`, la recette Chrome a validé six contrôles sur le dossier distinct de l’inscription n° 11. L’étudiant a déposé un PNG fictif, l’agent a motivé l’acceptation de la demande n° 42 et l’étudiant a relu la décision. Le lien de la deuxième ligne a livré le fichier de 3 589 octets, identique au dépôt et à l’archive privée. Un autre étudiant a reçu HTTP 404 au même lien. Le test de régression vérifie aussi les deux lignes dans la réponse applicative. [Six contrôles et empreinte du fichier](preuves/absence-piece-2026-11-19T11-54-06-550Z/resume.json) · [Téléchargement étudiant](preuves/absence-piece-2026-11-19T11-54-06-550Z/ABS-05.png) · [Protection du tiers](preuves/absence-piece-2026-11-19T11-54-06-550Z/ABS-06.png) · [Test de régression](../../tests/Feature/StudentAttendanceDashboardTest.php)

**Décision complémentaire — VALIDÉ** pour le dépôt de la justification, la décision motivée, sa réception étudiante et le téléchargement privé.
