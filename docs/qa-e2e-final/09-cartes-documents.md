# Fiche de test USK — Cartes et documents

**Date** 19 novembre 2026, heure de Kinshasa

**Première version exécutée** `8cc16567b2dfcd7e719b882cc5ac5fcb8c615488`

**Navigateur** Chromium visible, Playwright, profils et ports indiqués pour chaque rejeu

**Comptes** Administration institutionnelle, appariteurs, doyens et étudiants de Médecine et de Droit selon le scénario

L’administrateur a ouvert les pages des documents officiels, des modèles de cartes, des demandes, de l’impression, de la remise et du NFC. Les six pages ont répondu en HTTP 200. [Relevé de navigation](preuves/navigation-2026-11-19T09-12-27-378Z/navigation.json)

Le scénario documentaire suit un spécimen synthétique depuis la création de son type jusqu’au téléchargement du PDF. Il fait intervenir deux comptes distincts pour l’émission et l’approbation, puis contrôle la vérification publique et la confidentialité de l’archive. Les étapes dépendent des droits de l’appariteur et du doyen. [Pilote documentaire](browser/documents.cjs)

Sur la révision `a36ed79dd7f9c26c548c9fbf415775b123b267c6` du port 8066, la page de gestion documentaire a refusé l’appariteur du profil V2 en HTTP 403. Ce compte de recette dispose de la gestion des accès académiques. La simulation de 200 étudiants comporte un appariteur de Médecine habilité à gérer et émettre les documents et un doyen distinct habilité à les approuver. [Relevé du refus](preuves/documents-2026-11-19T10-15-43-702Z/resume.json) · [Capture du contrôle d’accès](preuves/documents-2026-11-19T10-15-43-702Z/document-echec.png)

Sur `7bbfba884e5fc30d5785fd556595a3f195eea98b`, port 8070, l’étudiant de Droit inscrit en L2 a déposé un portrait fictif puis retrouvé son statut en attente. L’appariteur de Droit a examiné et approuvé la photo. L’étudiant a ensuite retrouvé le dossier n° 202 prêt pour la carte, première tranche réglée. Le lien « Aperçu et impression » a ouvert le registre officiel, filtré sur cette inscription et la famille Carte. Le modèle actif de Droit utilise ce circuit avec approbation par le doyen. [Dépôt du portrait](preuves/cartes-2026-11-19T10-33-39-313Z/CAR-01.png) · [Photo approuvée et éligibilité](preuves/cartes-2026-11-19T10-33-39-313Z/CAR-02.png) · [Dossier dans le registre](preuves/cartes-2026-11-19T10-33-39-313Z/blocage.png)

Le modèle documentaire de Médecine a également été créé par l’appariteur puis approuvé et activé avec le compte distinct du doyen sur `7bbfba884e5fc30d5785fd556595a3f195eea98b`, port 8070. Le premier lancement s’est arrêté à l’attente de la réponse suivante. [Modèle approuvé](preuves/documents-2026-11-19T10-39-57-793Z/document-catalogue-specimen.png) · [Trace documentaire](preuves/documents-2026-11-19T10-39-57-793Z/resume.json)

La demande de Médecine n° 61 a donné l’attestation n° 21. L’appariteur n° 17 a émis le document signé après approbation du doyen n° 15. L’archive de 25 060 octets porte l’empreinte SHA-256 `54b7bdb80c2f9890ce988afe3bdce72b0640f80d0aae98b25a4f86e8cf136cdf`. Son rendu tient sur une page et présente l’identité fictive, l’année, le signataire, la référence et le code QR. [Attestation rendue à l’écran](preuves/attestation-rendue.png)

La reprise a téléchargé le PDF officiel dans le navigateur puis affiché sa vérification publique sans connexion. La page indique que le document est valide et garde confidentiels le nom et le matricule. [PDF officiel du spécimen](preuves/documents-2026-11-19T10-54-35-270Z/usk-06-attestation-specimen.pdf) · [Vérification publique](preuves/documents-2026-11-19T10-54-35-270Z/verification-publique.png) · [Contrôles DOC-01 à DOC-03](preuves/documents-2026-11-19T10-54-35-270Z/resume.json)

Le dernier rejeu documentaire sur 8070 a validé les cinq contrôles. Le titulaire de Médecine a téléchargé depuis sa bibliothèque un fichier identique octet pour octet à l’archive émise. Le compte étudiant de Droit a reçu un HTTP 404 en tentant de lire ce même PDF depuis son propre dossier. [Matrice DOC-01 à DOC-05](preuves/documents-2026-11-19T11-11-19-652Z/resume.json) · [Bibliothèque du titulaire](preuves/documents-2026-11-19T11-11-19-652Z/bibliotheque-etudiant.png) · [Accès de l’autre étudiant refusé](preuves/documents-2026-11-19T11-11-19-652Z/autre-etudiant-refuse.png)

### Carte de Droit délivrée

Le registre a produit un aperçu provisoire de deux pages avant l’approbation, puis le PDF officiel `CAR-2026-00000022`. L’archive de 28 394 octets comporte deux faces de **85,60 × 53,98 mm** (242,646 × 153,014 points). Le contrôle visuel à 180 ppp montre le portrait synthétique, le matricule `DR0001`, Droit public L2 et l’année au recto. Le verso porte la mention SPÉCIMEN, le signataire, le code QR et la validité du 19 novembre 2026 au 19 novembre 2027. Les textes, le portrait et le QR se lisent sans recouvrement. L’appariteur a consigné l’impression logicielle puis la remise. [Aperçu provisoire](preuves/cartes-2026-11-19T11-15-11-906Z/carte-apercu-provisoire.pdf) · [Carte officielle PDF](preuves/cartes-2026-11-19T11-15-11-906Z/carte-specimen.pdf) · [Recto](preuves/cartes-2026-11-19T11-15-11-906Z/carte-face-1.png) · [Verso](preuves/cartes-2026-11-19T11-15-11-906Z/carte-face-2.png) · [Remise](preuves/cartes-2026-11-19T11-15-11-906Z/CAR-05.png)

La demande n° 62 a été approuvée par le doyen. La carte n° 22 porte l’empreinte SHA-256 `6016d2f7e7a06deed4d1a31eec7ac1f8496e98121ce165815b32d610ede1d59f`. Le registre date l’impression à 12 h 17 min 37 s et la remise à 12 h 18 min 06 s à Kinshasa. Une seconde demande initiale a été refusée avec l’instruction de demander un remplacement. Le contrôle final a retrouvé une seule demande et une seule carte active sur cette inscription. [Chronologie et états](preuves/cartes-2026-11-19T11-15-11-906Z/resume.json) · [Réponse à la seconde émission](preuves/cartes-2026-11-19T11-15-11-906Z/CAR-06.png)

Le registre NFC a accepté l’identifiant synthétique d’un badge pour l’inscription n° 202, puis refusé l’association de ce même identifiant à une autre inscription. Après dissociation, les deux dossiers sont revenus à zéro association. Ces trois opérations logicielles ont été réalisées sur le port 8070, révision `7bbfba884e5fc30d5785fd556595a3f195eea98b`. [Trois contrôles NFC](preuves/nfc-2026-11-19T11-24-56-022Z/resume.json) · [Refus du badge déjà associé](preuves/nfc-2026-11-19T11-24-56-022Z/NFC-02.png)

**Décision du module** VALIDÉ pour la carte et les documents dans leur périmètre logiciel. L’impression sur badge physique, la gravure et la lecture radio NFC restent à vérifier sur le matériel. [Pilote du circuit officiel](browser/cartes.cjs)
