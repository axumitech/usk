# Fiche de test USK — Admissions

**Date** 19 novembre 2026, heure de Kinshasa

**Versions exécutées** `8cc16567b2dfcd7e719b882cc5ac5fcb8c615488`, `7bbfba884e5fc30d5785fd556595a3f195eea98b` et `2e9c69d01d847475ec4460512179ce3ebe60054c`

**Navigateur** Chromium visible, Playwright, ports locaux 8064, 8066 et 8068

**Comptes** Nouveau candidat fictif, candidat Droit, doyens de Médecine et de Droit

## Parcours observé

| Étape | Résultat à l'écran | Verdict |
| --- | --- | --- |
| Créer un compte depuis le formulaire et tenter d’ouvrir le dossier | Le portail demande la vérification de l’adresse. | ✅ |
| Confirmer l’adresse puis réinitialiser le mot de passe | Les deux courriels ont été ouverts dans MailHog. La vérification a donné accès au portail et la réinitialisation a permis une nouvelle connexion. | ✅ |
| Choisir l’année, le programme et le niveau de Médecine, puis sauvegarder | Le brouillon a conservé le même UUID après déconnexion et reprise. | ✅ |
| Continuer sans la pièce requise puis la déposer | L’erreur apparaît à l’étape des pièces. La pièce et les données persistent après une deuxième reconnexion. | ✅ |
| Soumettre les candidatures Médecine et Droit | Chaque candidat a vu sa candidature soumise. | ✅ |
| Ouvrir le dossier et sa pièce depuis la faculté voisine | Les deux accès ont été refusés. | ✅ |

La première version couvre la création du compte, la vérification de l’adresse, la réinitialisation, le brouillon et sa reprise. [Matrice et observations](preuves/portails-2026-11-19T09-25-04-065Z/resume.json) · [Dossier après reconnexion](preuves/portails-2026-11-19T09-25-04-065Z/S02-05.png)

### Décisions et courriels sur le build 7bbfba8

| Parcours | Résultat observé |
| --- | --- |
| ✅ Médecine — réception et examen | Le doyen a ouvert le dossier n° 12 et consulté sa pièce en état « en analyse ». La faculté de Droit a reçu un refus sur le dossier et son aperçu. |
| ✅ Médecine — correction et admission | Le formulaire a refusé un détail libre trop court, conservé les trois motifs et empêché l’admission tant que la pièce restait à corriger. Le candidat a déposé une version 2. Le doyen l’a acceptée puis a admis le candidat. L’inscription n° 13 attendait la confirmation financière. |
| ✅ Droit — refus | Le doyen a refusé la pièce pour non-conformité puis a motivé le rejet du dossier. Le candidat a lu le motif et son historique, sans ouvrir un espace étudiant. |
| ✅ Quatre notifications MailHog | Les candidats fictifs ont reçu la confirmation de dépôt, la demande de correction, l’admission et le refus. L’adresse, le sujet et le message sélectionné ont été rapprochés dans l’interface MailHog. |

[Matrice des deux décisions](preuves/portails-2026-11-19T10-24-30-780Z/resume.json) · [Pièce corrigée](preuves/portails-2026-11-19T10-24-30-780Z/S03-04.png) · [Admission](preuves/portails-2026-11-19T10-24-30-780Z/S03-05.png) · [Refus côté candidat](preuves/portails-2026-11-19T10-24-30-780Z/S03-08.png) · [Email de décision](preuves/portails-2026-11-19T10-24-30-780Z/S03-MAIL-04-mailhog.png)

## Anomalies et suites

| Identifiant | Gravité | Action, attendu et observé | Cause et suivi |
| --- | --- | --- | --- |
| QA-ADM-01 | Bloquante pour le scénario initial | Le pilote pouvait examiner le bouton dès l’ouverture du dossier, avant son affichage, puis confondre aperçu de pièce et changement d’état. | Fermée sur le rejeu 7bbfba8. Le statut en analyse est contrôlé après la mutation et le parcours se poursuit jusqu’à la décision. |
| QA-ADM-02 | Bloquante pour la preuve initiale du reçu de dépôt | Le message était identifié par l’API MailHog mais le premier essai n’établissait pas que le navigateur affichait le bon sujet. | Fermée sur le rejeu 7bbfba8. Les quatre emails métier ont été ouverts dans MailHog. |

Le premier contrôle du compte neuf sur le port 8068 avait expiré après 18 secondes d’attente. Rejoués sur `2e9c69d01d847475ec4460512179ce3ebe60054c` au port 8066, les trois contrôles de compte neuf ont abouti. L’inscription attend la vérification d’adresse, le lien de MailHog ouvre effectivement le portail, et la demande de réinitialisation aboutit à une nouvelle connexion avec le mot de passe changé. [Matrice du compte neuf](preuves/portails-2026-11-19T10-33-40-771Z/resume.json) · [Portail vérifié](preuves/portails-2026-11-19T10-33-40-771Z/EMAIL-02-portail-verifie.png) · [Email de réinitialisation](preuves/portails-2026-11-19T10-33-40-771Z/EMAIL-03-mailhog.png)

La candidate admise de Médecine a poursuivi le parcours dans le même dossier, sur `7bbfba884e5fc30d5785fd556595a3f195eea98b` au port 8068. La candidature `USK-000012` a produit l’inscription n° 13, en attente de confirmation. La saisie du versement n° 14 de 30,00 USD a laissé ce statut intact. Sa confirmation comptable a activé l’inscription, puis la candidate a retrouvé son matricule `RECMED0006`, la référence du versement et le solde de **70,00 USD** dans son espace étudiant. [Quatre contrôles du même dossier](preuves/admission-finance-2026-11-19T11-23-11-245Z/resume.json) · [Portail de la nouvelle étudiante](preuves/admission-finance-2026-11-19T11-23-11-245Z/AF-04.png)

**Décision du module** VALIDÉ pour les parcours candidat, admission, refus, notifications et activation financière de l’étudiante. [Finances](04-finances.md) · [Structure](01-structure.md)
