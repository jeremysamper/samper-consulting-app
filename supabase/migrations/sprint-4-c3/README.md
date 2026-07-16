# Sprint 4 · Chantier 3 - Matching rétroactif produits ↔ recettes

Procédure d'exécution **manuelle**, en SQL pur, via le **SQL Editor de Supabase**.
Aucun script Node, aucune `service_role_key` : tout est tracé et réversible.

Le matching assigne un `produitId` aux ingrédients des recettes existantes et marque
les cas incertains avec `needsReview` + `matchSuggestions` (résolus ensuite dans l'app
via l'écran « Correspondances à valider »).

## Pré-requis

- Accès au projet Supabase (Dashboard → SQL Editor).
- Les 4 fichiers `.sql` de ce dossier.

## Procédure

1. **Sauvegarde** - Ouvrir Supabase Dashboard → SQL Editor → *New query*.
   Coller le contenu de `01-backup-recettes.sql` → **Run**.
   Vérifier le `NOTICE` : le nombre de recettes sauvegardées doit être correct,
   et la dernière requête doit afficher deux nombres identiques.

2. **Export JSON** - *New query* → coller `02-export-recettes.sql` → **Run**.
   Copier le contenu de la colonne `recettes_json`, et le coller côté dépôt local
   dans `backups/recettes-before-matching-AAAA-MM-JJ.json` (date du jour).

3. **Matching** - *New query* → coller `03-match-products.sql` → **Run**.
   Le traitement peut prendre de quelques secondes à quelques minutes selon le
   volume. Le résultat (`rapport`) et les `NOTICE` indiquent le nombre
   d'ingrédients matchés / à valider / sans match.

4. **Rapport** - *New query* → coller `04-matching-report.sql` → **Run**.
   Copier les deux résultats (synthèse + top 20) dans le dépôt local sous
   `MIGRATION-PRODUCT-MATCHING-REPORT.md`.

5. **Vérification** - Ouvrir l'application, module Recettes / Outils consultant :
   les ingrédients matchés affichent l'icône de lien catalogue, les cas incertains
   apparaissent dans l'écran « Correspondances à valider ».

## En cas de problème - restauration

Le matching est entièrement réversible tant que la table de sauvegarde existe :

```sql
TRUNCATE recettes;
INSERT INTO recettes SELECT * FROM recettes_backup_sprint4;
-- (recettes_backup_sprint4 contient une colonne _backup_at en plus ;
--  si l'INSERT échoue pour cette raison, lister explicitement les colonnes
--  de la table recettes.)
```

## Nettoyage (une fois le résultat validé)

```sql
DROP TABLE IF EXISTS recettes_backup_sprint4;
DROP FUNCTION IF EXISTS match_recipe_ingredients();
DROP TABLE IF EXISTS recipe_synonyms;
```

## Notes

- Le script `03` est **idempotent** : un ingrédient déjà lié (`produitId` non vide)
  est ignoré. On peut le relancer sans risque de double traitement.
- Chaque recette est traitée dans un sous-bloc isolé : une erreur sur une recette
  est journalisée (`NOTICE`) et n'interrompt pas le traitement global.
- Le matching est scopé par `etablissement_id` : un ingrédient n'est rapproché que
  des produits du catalogue de son propre établissement.
