# Fiche de test USK — Structure académique

| Champ | Valeur |
| --- | --- |
| Module | Établissement, facultés, départements, cycles, niveaux, programmes et organisation annuelle |
| Révision des premiers essais | `8cc16567b2dfcd7e719b882cc5ac5fcb8c615488` |
| Révision du dernier passage | `7bbfba884e5fc30d5785fd556595a3f195eea98b`, port 8065 |
| Environnement | Chrome for Testing piloté par Playwright, profil local `usk_qa_e2e-structure` |
| Compte | Administration institutionnelle fictive |
| Date | 19 novembre 2026 |

## Vérifications dans le navigateur

| Opération | Observation |
| --- | --- |
| Créer l’établissement, cinq facultés, les rattacher et créer dix départements | ✅ Le navigateur a exécuté les 21 opérations. Le contrôle de la base a compté cinq facultés et dix départements. [Trace](preuves/structure-2026-11-19T09-17-59-538Z/structure.json) |
| Créer les deux années, leurs quatre semestres et quatre cycles | ✅ Les dix créations apparaissent dans la trace. [Trace](preuves/structure-2026-11-19T09-26-13-435Z/structure.json) |
| Paramétrer les dix cursus | ✅ Les saisies successives ont produit dix programmes, vingt-huit niveaux, dix promotions annuelles et dix versions de maquette. Le dernier passage a enregistré vingt-sept opérations et s’est terminé sur la maquette de Sciences des religions. [Dernier passage](preuves/structure-2026-11-19T11-05-15-038Z/structure.json) |
| Créer un groupe pratique de Droit public puis répéter la demande | ✅ Le groupe de capacité 24 a conservé le même identifiant. Le sélecteur a présenté deux groupes compatibles avec le niveau et la faculté. [Matrice et identifiants](preuves/groupes-2026-11-19T10-55-49-655Z/matrice.json) · [Capture](preuves/groupes-2026-11-19T10-55-49-655Z/groupes-promotion.png) |
| Compléter, valider et publier la maquette de Droit public | ✅ Le navigateur a enregistré un cours, une UE composée et un EC pour chacun des trois niveaux L1, L2 et L3. Chaque EC porte 3 crédits, un coefficient de 1, 15 heures de CMI et 8 de TD. Les trois niveaux validés, la maquette est passée à la révision 4 validée puis à la révision 5 publiée. [Actions](preuves/maquette-2026-11-19T11-12-37-678Z/actions.json) · [Quatre contrôles](preuves/maquette-2026-11-19T11-12-37-678Z/resume.json) · [Version publiée](preuves/maquette-2026-11-19T11-12-37-678Z/MAQ-publiee.png) |

Les six passages ayant enregistré des actions totalisent 86 opérations consignées. Trois saisies apparaissent dans l’état persistant relu après expiration du délai de réponse du pilote, le programme de Sciences cliniques, la promotion de Sciences biomédicales et le niveau M1 de Santé communautaire. Le pilote a repris au premier élément manquant de chaque cursus. [Droit et Sciences cliniques](preuves/structure-2026-11-19T09-35-12-927Z/structure.json) · [Sciences biomédicales](preuves/structure-2026-11-19T09-47-15-740Z/structure.json) · [Épidémiologie et reprise vers le Master](preuves/structure-2026-11-19T10-57-21-512Z/structure.json) · [Derniers cursus](preuves/structure-2026-11-19T11-05-15-038Z/structure.json)

### Inventaire des deux profils

| Objets relus le 19 novembre | Profil saisi dans le navigateur | Profil de présentation généré |
| --- | ---: | ---: |
| Établissements / facultés / départements | 1 / 5 / 10 | 1 / 5 / 10 |
| Années / semestres / cycles | 2 / 4 / 4 | 2 / 4 / 4 |
| Programmes / niveaux | 10 / 28 | 10 / 28 |
| Promotions / groupes | 10 / 2 | 56 / 56 |
| Versions de maquettes | 10 dont 1 publiée et 9 brouillons | 20 |
| UE / EC / cours | 3 / 3 / 3 | 56 / 112 / 56 |

La colonne du navigateur provient d’un comptage SQLite en lecture seule sur `usk_qa_e2e-structure`, après publication de la maquette QA-DPU. La simulation du profil `usk_qa_e2e-presentation` couvre chaque niveau sur les deux années. Elle comprend également dix enseignants, 112 offres, 112 affectations d’enseignement et 112 séances. [Inventaire de la simulation](preuves/inventaire-universite.json)

### Contrôles applicatifs complémentaires

Les 22 tests d’accès et de migration ont réussi avec 701 assertions. Le test du pack annuel vérifie les maquettes visibles par les deux facultés témoins, côté doyen et vice-doyen, ainsi que la vue institutionnelle. Un test distinct, réussi avec 11 assertions, vérifie le rattachement d’un groupe déjà utilisé par une offre à maquette versionnée. Le programme de l’offre doit correspondre à celui de la promotion. [Périmètre des maquettes](../../tests/Feature/AnnualFacultyPackScopeTest.php) · [Rattachement d’un groupe](../../tests/Feature/GroupPromotionCurriculumTest.php)

## Catalogue fictif

| Faculté | Départements de la simulation | Cycles associés |
| --- | --- | --- |
| Droit | Droit public, Droit privé | Licence dans les deux départements |
| Médecine humaine | Sciences cliniques, Sciences biomédicales | Formation médicale témoin en trois étapes |
| Santé publique | Épidémiologie, Santé communautaire | Licence, Master |
| Sciences sociales, politiques et administratives | Sociologie, Administration publique | Licence, Master |
| Théologie | Études théologiques, Sciences des religions | Licence, Doctorat |

Chaque programme appartient à un département et à un cycle. Les niveaux sont rattachés au programme dans un ordre explicite. Chaque promotion représente un niveau de ce programme pour une année. Le groupe représente une section de cette promotion. Les maquettes annuelles portent chacune les UE, EC, crédits et volumes horaires fictifs. Le cursus médical utilise ses propres étapes. Les intitulés, durées, crédits et règles de cette simulation n’ont aucune valeur officielle pour l’USK. [Catalogue partagé par le pilote et la simulation](../../database/seeders/FinalQa/UniversityCatalog.php)

## Reprise locale

La commande `init` prépare le profil vierge du navigateur. Elle crée les tables de l’application et le seul compte nominatif `admin@usk.test`. La commande `simulate` utilise un profil neuf distinct, ou une amorce sans données métier. Les deux commandes exigent un chemin de profil local explicite. Le lanceur conserve chaque profil antérieur. Le mot de passe de test généré est stocké dans `final-qa.json` à l’intérieur du profil privé.

```powershell
$env:USK_QA_FINAL_ROOT = Join-Path $env:TEMP ('usk_qa_e2e-interface-' + [guid]::NewGuid().ToString('N'))
php docs/qa-e2e-final/scripts/university.php init
$env:USK_QA_FINAL_ROOT = Join-Path $env:TEMP ('usk_qa_e2e-cohorte-' + [guid]::NewGuid().ToString('N'))
php docs/qa-e2e-final/scripts/university.php simulate
php docs/qa-e2e-final/scripts/university.php verify
```

`verify` passe la connexion SQLite en lecture seule et retourne les effectifs par département, les résultats publiés, les progressions et le contrôle des clés étrangères. Le profil de présentation contient cinq facultés et vingt étudiants historiques dans chacun des dix départements. Conserver le chemin affiché par `$env:USK_QA_FINAL_ROOT` pour rejouer sur la même cohorte. [Effectifs vérifiés](preuves/cohorte-presentation.json)

**Décision du module** — VALIDÉ pour les dix cursus saisis, le groupe pratique et la publication de la maquette détaillée de Droit public. Les neuf autres maquettes créées par le navigateur sont au stade brouillon.

## Rattachement d’un groupe à une promotion

Le 19 novembre 2026, un administrateur a testé trois rattachements dans Chromium sur le profil isolé du port 8073. Le serveur et les assets servaient la révision `570e71b818203ab51078e7fe47ca845be9996305`. Les deux programmes partageaient la même faculté, la même année universitaire et le même niveau. [Journal des trois opérations](preuves/rattachement-2026-11-19T11-33-59-719Z/resume.json)

| Cas | Résultat observé |
| --- | --- |
| Groupe 4 vide, offre 7 liée à la maquette du programme 1, promotion demandée dans le programme 2 | Le formulaire affiche « Une offre de ce groupe relève déjà de la maquette d’un autre programme. » Le groupe reste sans promotion et le compteur d’audit reste à zéro. [Refus à l’écran](preuves/rattachement-2026-11-19T11-33-59-719Z/RAT-01.png) |
| Même groupe, promotion 1 du programme porté par la maquette | La promotion est enregistrée et une entrée d’audit est créée. [Rattachement accepté](preuves/rattachement-2026-11-19T11-33-59-719Z/RAT-02.png) |
| Groupe historique 5, offre sans référence de maquette | Le rattachement à la promotion 4 est enregistré et une entrée d’audit est créée. [Compatibilité historique](preuves/rattachement-2026-11-19T11-33-59-719Z/RAT-03.png) |

Le test HTTP de régression couvre ces trois cas avec onze assertions. [Test de rattachement](../../tests/Feature/GroupPromotionCurriculumTest.php)
