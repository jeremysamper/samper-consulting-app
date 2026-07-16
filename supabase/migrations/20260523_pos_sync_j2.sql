-- ================================================================
-- MIGRATION J2 - POS SYNC INFRASTRUCTURE
-- Projet  : Samper Consulting
-- Date    : 2026-05-23
-- Changements :
--   • ADD COLUMN timezone ON etablissements (défaut Europe/Zurich)
--   • ADD COLUMN ls_business_id + ls_business_location_id ON pos_connections
--   • CREATE TABLE pos_sync_logs
-- ================================================================

-- 1. Timezone par établissement (utilisé pour convertir UTC → date locale)
ALTER TABLE public.etablissements
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/Zurich';

-- 2. IDs Lightspeed sur pos_connections
--    ls_business_id          : ID du business Lightspeed (niveau compte)
--    ls_business_location_id : ID de la location spécifique (niveau restaurant)
--    NULL tant que l'utilisateur n'a pas sélectionné (ou que la sélection auto n'a pas eu lieu)
ALTER TABLE public.pos_connections
  ADD COLUMN IF NOT EXISTS ls_business_id text,
  ADD COLUMN IF NOT EXISTS ls_business_location_id text;

-- 3. pos_sync_logs - journal de chaque run de synchronisation
--    IDs en text - cohérent avec le reste du projet (pos_connections.id est text)
CREATE TABLE IF NOT EXISTS public.pos_sync_logs (
  id             text        PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  connection_id  text        REFERENCES public.pos_connections(id) ON DELETE CASCADE,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  status         text        NOT NULL DEFAULT 'running'
                             CHECK (status IN ('running','success','error')),
  date_synced    date,                        -- date locale agrégée (NULL si backfill multi-jours)
  items_count    integer,                     -- nombre de pos_items upsertés
  sales_count    integer,                     -- nombre de pos_sales upsertés
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_sync_logs_connection
  ON public.pos_sync_logs (connection_id, started_at DESC);

-- RLS
ALTER TABLE public.pos_sync_logs ENABLE ROW LEVEL SECURITY;

-- Lecture : consultant + patron + resp_cuisine de l'établissement concerné
CREATE POLICY "pos_sync_logs_select" ON public.pos_sync_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pos_connections pc
      WHERE pc.id = connection_id
        AND user_can_access_etab(pc.etablissement_id)
        AND current_user_role() IN ('consultant','patron','resp_cuisine')
    )
  );

-- Pas d'INSERT/UPDATE/DELETE côté client - uniquement via edge functions (service_role)

-- 4. Étendre la contrainte status de pos_connections pour 'needs_location'
--    (état intermédiaire quand plusieurs locations LS sont détectées)
DO $$
DECLARE v_name text;
BEGIN
  SELECT conname INTO v_name
  FROM pg_constraint
  WHERE conrelid = 'public.pos_connections'::regclass
    AND contype = 'c'
    AND conname ILIKE '%status%'
  LIMIT 1;
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.pos_connections DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

ALTER TABLE public.pos_connections
  ADD CONSTRAINT pos_connections_status_check
  CHECK (status IN ('connected','disconnected','error','needs_location'));

-- ================================================================
-- FIN MIGRATION 20260523_pos_sync_j2.sql
-- ================================================================
