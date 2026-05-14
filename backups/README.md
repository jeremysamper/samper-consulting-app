# Backups

Ce dossier sert à stocker les exports JSON des tables Supabase **avant** une
migration destructive.

## Procédure d'export manuelle (depuis Supabase Dashboard)

Avant d'exécuter une migration `DROP TABLE`, exporter la table concernée :

1. Ouvrir https://supabase.com/dashboard/project/_/editor
2. Sélectionner la table à sauvegarder
3. Cliquer **Export** > **JSON**
4. Renommer le fichier `<table>-export-YYYY-MM-DD.json`
5. Placer dans `backups/` et committer **sans pousser sur main** (le dossier
   est en local pour archive seulement, voir `.gitignore` si on veut le
   sortir du suivi git)

## Migrations actuellement en attente d'exécution

- `supabase/migrations/20260514_drop_kit_items.sql` — Drop de la table
  `kit_items` (module Kit cuisinier supprimé Sprint 3).
  **Avant exécution** : `kit_items-export-2026-05-14.json` doit être placé ici.
