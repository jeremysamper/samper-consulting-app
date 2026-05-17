-- ════════════════════════════════════════════════════════════════
-- Sprint 4 · Chantier 3 · ÉTAPE 2 — Export JSON de la table recettes
-- ────────────────────────────────────────────────────────────────
-- À exécuter APRÈS l'étape 1.
-- Copier le contenu de la colonne « recettes_json » du résultat, puis
-- le coller dans le dépôt local sous :
--     backups/recettes-before-matching-AAAA-MM-JJ.json
-- (remplacer AAAA-MM-JJ par la date du jour).
-- Ce fichier est un second filet de sécurité, en plus de la table
-- recettes_backup_sprint4 créée à l'étape 1.
-- ════════════════════════════════════════════════════════════════

SELECT jsonb_pretty(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]'::jsonb)) AS recettes_json
FROM recettes r;
