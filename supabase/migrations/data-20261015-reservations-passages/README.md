# 15.10.2026 : canal « passage » pour 3 réservations existantes, etab-2

Mise à jour **de données**, pas de schéma. Sous-dossier de `migrations/` pour
que la CLI Supabase ne le rejoue pas.

**Déjà appliqué en production le 15.10.2026** (3 lignes, recomptées après
écriture). Ces fichiers sont la trace et le retour arrière, pas une tâche en
attente.

## Contexte

La migration `20261015_reservations_origine_passage` ajoute la valeur
`passage` à `reservations.origine`. Avant elle, le bouton « Client de
passage » du plan de salle (mode service) créait ses réservations en
`equipe`, avec un nom de la forme « Passage, table N » (séparateur point
médian au lieu de la virgule avant le balayage du 11.10.2026).

Trois réservations portaient ce nom, toutes sur `etab-2`, chacune avec une
table liée : ce sont de vrais clients de passage enregistrés par le bouton,
pas une saisie détournée. Jérémy a validé leur reclassement le 15.10.2026.

| id | date | table (nom « Passage », point médian, table N) | statut |
|---|---|---|---|
| 320614aa-1da7-4333-aa18-e7d51181f14f | 03.10.2026 soir | table 20 | parti |
| a3490962-a90b-456f-8891-b1133b54bb8d | 03.10.2026 soir | table 11 | parti |
| 378ccf4f-0106-481a-9c0e-a4db1005e5ab | 09.10.2026 soir | table 11 | arrive |

## Fichiers

- `01-reclassement.sql` : l'UPDATE, scopé par établissement, id, origine
  `equipe` et nom ; annule tout si le nombre de lignes touchées n'est pas 3.
- `02-verification.sql` : recomptage.
- `99-rollback.sql` : retour en `equipe`.

Sauvegarde des 3 lignes complètes avant l'opération, hors dépôt :
`App-Web/_sauvegardes-supabase/reservations-passages-avant-20261015.json`.

## Résultat

Avant : etab-2 = 116 `equipe`, 16 `en_ligne` (132). Après : 113 `equipe`,
3 `passage`, 16 `en_ligne` (132). Aucune autre réservation n'a changé de
canal (`total_passage` = 3 sur toute la base).
