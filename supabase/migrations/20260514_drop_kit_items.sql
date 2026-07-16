-- ═══════════════════════════════════════════════════════════════
-- Migration : suppression de la table kit_items (module Kit cuisinier)
-- Sprint 3 - 2026-05-14
-- ═══════════════════════════════════════════════════════════════
--
-- AVANT EXECUTION : faire un dump de la table en local (cf. backups/README.md)
-- pour conserver l'historique des fiches saisies par les utilisateurs.
--
-- Cette migration est destructive et irréversible.
-- À exécuter dans Supabase Dashboard > SQL Editor une fois la PR mergée.

-- 1) Sécurité : on vérifie que la table existe avant de drop
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'kit_items'
  ) THEN
    -- 2) Drop des subscriptions realtime (s'il y en a)
    BEGIN
      PERFORM pg_notify('supabase_realtime', 'remove:kit_items');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- 3) Drop de la table (CASCADE pour balayer les FK éventuelles)
    DROP TABLE public.kit_items CASCADE;
    RAISE NOTICE 'Table kit_items supprimée.';
  ELSE
    RAISE NOTICE 'Table kit_items absente - rien à faire.';
  END IF;
END $$;
