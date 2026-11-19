# Fiche de test USK — Finances

**Date** 19 novembre 2026, heure de Kinshasa

**Version exécutée** `8cc16567b2dfcd7e719b882cc5ac5fcb8c615488`

**Navigateur** Chromium visible, Playwright, port local 8064

**Comptes** Agent financier de Médecine et étudiant fictif `etudiant.med3@usk.test`

## Dossier témoin

Avant le scénario, la lecture protégée du dossier annuel n° 8 a trouvé un versement confirmé de 20,00 USD et une inscription en attente de confirmation. La première tranche de ce témoin est fixée à 100,00 USD nets. La saisie de 9,00 USD par l’agent puis l’acceptation d’une preuve de 1,00 USD doivent faire passer le total de 20 % à 29 %, puis à 30 %. Le pilote compare les lignes comptables, l’état de la preuve, le statut de l’inscription et les droits affichés à l’étudiant.

Le double clic, la perte de réponse, la restitution de la preuve après refus, l’annulation et le rejet d’une pièce identique sont couverts par les assertions du pilote. Chaque ligne du fichier `matrice.json` est enregistrée après l’action et son contrôle. [Pilote financier](browser/finances.cjs)

## Résultats navigateur

| Contrôle | Résultat |
| --- | --- |
| F01 et F02 — Rejouer après perte de réponse, double clic, montant nul | ✅ Deux tentatives ont conservé la même opération et créé une seule écriture. La redirection conserve le dossier n° 8. Le montant nul affiche une erreur. |
| F03 — Confirmer 29 % | ✅ Le total confirmé atteint 29,00 USD et l’inscription reste en attente. |
| F04 à F06 — Déposer, refuser et redéposer le justificatif de 1 USD | ✅ Le registre reste à 29,00 USD pendant le contrôle de la pièce. |
| F07 — Accepter le justificatif corrigé | ✅ À 30,00 USD, l’inscription devient confirmée et les enseignements sont accessibles. |
| F08 — Annuler le paiement rattaché | ✅ Le total retombe à 29,00 USD. La pièce conserve sa décision « acceptée », le paiement indique « annulé » et la confirmation administrative est conservée. |
| F09 — Renvoyer la même pièce avec une nouvelle référence | ✅ Le système refuse le fichier identique et conserve les compteurs de justificatifs et de versements. |

Les neuf contrôles ont abouti sur le même dossier. [Matrice financière et états de la base](preuves/finances-2026-11-19T09-46-54-497Z/matrice.json) · [Étudiant à 29 %](preuves/finances-2026-11-19T09-46-54-497Z/F03-etudiant.png) · [Étudiant à 30 %](preuves/finances-2026-11-19T09-46-54-497Z/F07-etudiant.png)

Le profil neuf du port 8066 a ensuite reproduit les neuf contrôles sur la révision compilée `a36ed79dd7f9c26c548c9fbf415775b123b267c6`. À 29 USD, le dossier n° 8 attend encore sa confirmation. À 30 USD, il est confirmé et les droits pédagogiques s’ouvrent. L’annulation comptable et la réutilisation de pièce conservent les états attendus. [Matrice du rejeu](preuves/finances-2026-11-19T10-13-38-708Z/matrice.json) · [Version et empreintes du bundle](preuves/finances-2026-11-19T10-13-38-708Z/version.json)

Sur `7bbfba884e5fc30d5785fd556595a3f195eea98b`, port 8068, l’agent a saisi puis confirmé un versement général de **71,00 USD** pour le dossier n° 8. Avant affectation, les 71,00 USD figuraient à la fois en disponible et en restant dû. Après affectation aux obligations, l’application affichait 100,00 USD payés sur 100,00 USD exigibles, aucun disponible et un solde de **0,00 USD**. [Versement général et affectation](preuves/solde-2026-11-19T10-49-59-518Z/resume.json) · [Compte soldé](preuves/solde-2026-11-19T10-49-59-518Z/SOL-03.png)

Sur le même dossier et la même révision, l’agent a ouvert le reçu du versement n° 13 et produit le PDF par la commande d’impression. Le reçu comporte une page A4 de 118 963 octets. Sa copie reste dans le profil privé de simulation et porte l’empreinte `63ec4c7b65579847fdfbdf0942f3c489ad4387d714da12d30b6364ded932534b`. L’agent n° 6 a demandé un remboursement de **1,00 USD**. Le compte institutionnel n° 1 l’a autorisé, sans mouvement du solde avant exécution. Après la simulation du décaissement, le restant dû passe à **1,00 USD**, le versement brut conserve ses 71,00 USD et l’inscription reste confirmée. [Reçu et remboursement, SOL-04 à SOL-07](preuves/solde-2026-11-19T11-18-26-969Z/resume.json) · [Autorisation distincte](preuves/solde-2026-11-19T11-18-26-969Z/SOL-06.png) · [État après exécution](preuves/solde-2026-11-19T11-18-26-969Z/SOL-07.png)

Le rendu du reçu présente la référence `QA-SOLDE-GENERAL`, le statut « Payé » et le montant **71,00 USD**. La capture partagée s’arrête avant l’identité du titulaire et la zone de vérification. [En-tête du reçu PDF](preuves/solde-2026-11-19T11-18-26-969Z/recu-montant.png)

Un second témoin couvre la continuité depuis la décision d’admission. Pour l’inscription n° 13 de la nouvelle étudiante, la tranche nette est de 100,00 USD et le seuil du barème de 30 %. Le versement n° 14 de 30,00 USD a laissé le dossier en attente à la saisie, puis l’a confirmé à la validation comptable. La scolarité et l’étudiante ont relu le même solde de 70,00 USD. [Dossier admis, paiement et relecture étudiante](preuves/admission-finance-2026-11-19T11-23-11-245Z/resume.json) · [Validation de la comptabilité](preuves/admission-finance-2026-11-19T11-23-11-245Z/AF-03.png)

**Décision du module** VALIDÉ pour le seuil d’activation, les justificatifs, les doublons, l’affectation, le paiement intégral, le reçu et le remboursement simulé.
