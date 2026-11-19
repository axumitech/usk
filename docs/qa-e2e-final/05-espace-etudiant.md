# Fiche de test USK — Espace étudiant

**Date** 19 novembre 2026, heure de Kinshasa

**Version exécutée** `8cc16567b2dfcd7e719b882cc5ac5fcb8c615488`

**Navigateur** Chromium visible, Playwright, port local 8064

**Compte** Étudiant fictif de Médecine

Le pilote étudiant visite l’accueil, le profil, le parcours, les enseignements, les services, les finances et la carte. Il vérifie pour chaque page l’identité du compte et, lorsque la réponse la fournit, l’inscription annuelle. L’action carte ouvre ensuite la gestion de la photo. Les consultations et les mutations sont comptées séparément dans les résultats du navigateur. [Pilote étudiant](browser/etudiant.cjs)

La reprise du dossier et la lecture de son statut lors des essais candidat sont documentées dans la fiche admissions. [Fiche admissions](03-admissions.md)

## Résultats

✅ Les 17 rubriques ont répondu en HTTP 200 sous le compte de Médecine attendu. L’inscription n° 6 a été conservée sur les 14 pages qui exposent son identifiant. Les vues des supports, annonces et notifications ont été contrôlées sur l’identité connectée et leur contenu affiché. Le parcours carte a ouvert la gestion de la photo depuis le lien étudiant. Aucune erreur JavaScript de page n’a été relevée pendant le parcours. [Matrice de consultation](preuves/etudiant-2026-11-19T09-54-54-538Z/resume.json) · [Carte et photo](preuves/etudiant-2026-11-19T09-54-54-538Z/carte-initiale.png)

✅ L’étudiant témoin financier a déposé un justificatif, l’a présenté à nouveau après refus et a vu évoluer ses droits après la confirmation du paiement. [Fiche finances](04-finances.md)

Les 17 destinations ont de nouveau abouti sur le profil neuf du port 8066, révision `a36ed79dd7f9c26c548c9fbf415775b123b267c6`. L’ouverture du lien d’une édition de jury publiée avait provoqué un HTTP 500. Après correction, le même étudiant a consulté le même résultat dans le navigateur sur `7bbfba884e5fc30d5785fd556595a3f195eea98b`. [Matrice du rejeu étudiant](preuves/etudiant-2026-11-19T10-16-26-129Z/resume.json) · [Résultat officiel accessible](preuves/resultats-2026-11-19T10-23-43-183Z/resume.json) · [Résultats et progression](08-resultats-progression.md)

Sur cette révision, le dossier n° 9 ouvre le cours n° 5 depuis sa carte, puis retrouve son inscription avec le lien de retour. L’étudiant a consulté deux supports, un devoir et ses consignes. Le candidat qui tente de télécharger un support privé reçoit un HTTP 403. À 390 pixels de large, le retour au clavier garde le même dossier, sans débordement horizontal. [Parcours ACAD-01 à ACAD-04](preuves/portails-2026-11-19T10-17-48-378Z/resume.json)

En Médecine, le dépôt et la reprise du justificatif financier ont été suivis jusqu’à leur décision. En Droit, le titulaire a modifié son profil en y déposant un portrait synthétique puis a pu relire sa validation. Depuis l’inscription n° 9, l’annonce de l’offre n° 13 s’ouvre avec son titre et son texte, aussi bien par la liste que par la notification individuelle. [Modification du profil étudiant](preuves/cartes-2026-11-19T10-33-39-313Z/CAR-01.png) · [Validation de la photo](preuves/cartes-2026-11-19T10-33-39-313Z/CAR-02.png) · [Liste, détail et notification de l’annonce](preuves/modules-2026-11-19T10-37-47-099Z/resume.json)

Sur `2e9c69d01d847475ec4460512179ce3ebe60054c`, l’étudiant a remis sa réponse et une pièce dans le devoir n° 18. La copie n° 21 indique version 1. L’appréciation restait privée avant publication. Après validation et diffusion, l’étudiant a lu sa note de **16/20** et le commentaire sur son propre dossier. [Dépôt de la copie](preuves/evaluation-2026-11-19T10-41-13-419Z/EVA-02.png) · [Avant diffusion](preuves/evaluation-2026-11-19T10-41-13-419Z/EVA-05.png) · [Note et appréciation publiées](preuves/evaluation-2026-11-19T10-41-13-419Z/EVA-07.png)

**Décision du module** VALIDÉ pour les 17 rubriques et les opérations étudiantes documentées. La couverture des demandes de service dépend du verdict de la fiche cartes et documents.
