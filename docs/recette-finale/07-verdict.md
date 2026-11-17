# Verdict final — USK Ordre06

**GO DÉMONSTRATION**, pour les parcours fictifs explicitement validés dans la matrice. **GO PRODUCTION non prononcé.** Aucun P0/P1 produit n’est resté ouvert dans le périmètre exécuté ; aucune correction métier Ordre06 n’a été nécessaire.

## Résultats

- **89 scénarios Chromium validés**, répartis dans 12 modules de recette. Zéro scénario final échoué ou bloqué et zéro exception JavaScript/HTTP500 dans les exécutions finales. Les reprises de scripts ne gonflent pas ce décompte.
- Neuf comptes administratifs : **44 accès directs**, dont 20 autorisés et 24 refus conformes. Les fonctions facultaires utilisent le rôle `admin` avec des permissions et un rattachement de faculté explicites.
- Dix parcours mobiles essentiels : **31 écrans à 390 × 844**, sans débordement horizontal du document mesuré. Deux consultations mobiles de corrections complètent les parcours enseignants/étudiants.
- Deux facultés, deux programmes rattachés à Licence, deux niveaux par programme, plusieurs promotions/groupes, deux années et douze étudiants initiaux aux situations variées. Un candidat devient ensuite le treizième étudiant.
- **539 tests SQLite**, **9 tests de concurrence PostgreSQL** et **118 tests frontend** réussis. TypeScript, ESLint, Vite et syntaxe PHP applicative réussis. Les scripts de recette sont également vérifiés syntaxiquement.
- PostgreSQL élargi : **265 réussis et une erreur de fixture sur 266**, précisément documentée dans les limites. La suite PostgreSQL n’est donc pas présentée comme entièrement verte.
- **118 fichiers de preuve** PNG/PDF archivés, avec empreintes SHA-256, résultats structurés et liens depuis la matrice.

## Fonctionnalités présentables

Admission et correction/rejet motivé ; contrôle des campagnes ; frais, justificatifs, rapprochement et affectation ; confirmation et notification unique ; remboursement fictif historisé ; validation/publication de maquette et maintien des anciennes versions ; offre annuelle, professeur et séance ; refus des conflits ; espaces professeur/étudiant, supports privés/publiés, annonces, remises et corrections ; inscription tardive, changement de groupe et historique annuel ; jury et publication de résultats synthétiques en Médecine ; attestation d’inscription SPECIMEN, téléchargement propriétaire et vérification publique.

Les consultations par rôle, faculté et promotion sont détaillées dans les [permissions](02-acteurs-et-permissions.md) et la [matrice](04-matrice-recette.md). Les autorisations sont contrôlées par les routes et les actions, au-delà de la visibilité des menus.

## Limites explicites

Le règlement de jury reprend un test existant de `AcademicTeachingTest` : S1, une évaluation pondérée à 100 %, cinq crédits, quorum de deux personnes, aucune décision annuelle de progression. Ce règlement synthétique et les signataires fictifs ne constituent aucune décision institutionnelle réelle. La délibération complète et l’émission documentaire sont validées en Médecine ; leur reproduction complète en Droit n’est pas annoncée comme exécutée.

Le remboursement final laisse 10 USD de première tranche à réexaminer, sans effacement de l’inscription confirmée. Le changement de groupe conserve les copies et ferme les accès devenus incompatibles. Le candidat principal ne doit donc pas servir à présenter un solde final nul ou les cours du groupe A ; les deux étudiants principaux restent disponibles pour ces consultations.

Les diplômes réels, les règles institutionnelles définitives, les sauvegardes/restaurations, l’infrastructure de production, la charge et l’exploitation ne sont pas validés. Les avertissements Vite et l’erreur de fixture PostgreSQL sont conservés dans le dossier, sans chantier facultatif.

## Clôture Git

Branche conservée : `feature/usk-security-access-fixes`.

| Ordre | Commit local |
| --- | --- |
| 03 · Sécurité et facultés | `d678ef8` |
| 04 · Admission et inscription | `9c31409` |
| 05 · Maquettes et enseignements | `79d2d86` |
| 06 · Recette et dossier de démonstration | Commit distinct de clôture sur cette branche, identifié dans le rapport final et `git log` |

Le dossier et les scripts sont les seuls ajouts Ordre06. Les bases, secrets générés, sessions, caches et journaux restent hors Git. Le [résumé de PR vers develop](08-pull-request-develop.md) est préparé localement. Aucun push, merge ou déploiement n’est autorisé ni effectué.

Les contrôles finaux de syntaxe des outils, de liens, des 118 empreintes, des motifs de secrets et d’ESLint sont réussis. L’instance fictive répond HTTP200 au contrôle de santé final. Les résultats techniques et limites sont détaillés dans [Tests et limites](06-tests-et-limites.md).

**Le développement de la version de démonstration est clôturé pour le périmètre validé. La présentation peut utiliser ce dossier et cette instance fictive.**
