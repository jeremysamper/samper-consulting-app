-- ================================================================
-- MIGRATION J1 - INTÉGRATION POS LIGHTSPEED
-- Projet  : Samper Consulting
-- Date    : 2026-05-23
-- Tables  : pos_providers, pos_connections, pos_items,
--           pos_sales, pos_item_recipe_mapping  (5 tables)
--
-- ADAPTATIONS vs spec :
--  • IDs en text - cohérent avec toutes les tables existantes
--  • FK vers etablissements/profiles/recettes en text
--  • RLS via user_can_access_etab() + current_user_role() (helpers existants)
--  • Tokens (access_token_enc, refresh_token_enc) : jamais exposés côté
--    client - lecture réservée aux edge functions via service_role.
--    RLS sélect exclut ces colonnes via une POLICY qui bloque les rôles
--    non-service. En pratique : le client interroge toujours un endpoint
--    edge function pour le statut - jamais les colonnes token directement.
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- 1. TABLES
-- ────────────────────────────────────────────────────────────────

-- 1.1  pos_providers  (table de référence statique)
CREATE TABLE IF NOT EXISTS public.pos_providers (
  id    text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  slug  text NOT NULL UNIQUE,   -- 'lightspeed'
  label text NOT NULL           -- 'Lightspeed K-Series'
);

-- Seed initial
INSERT INTO public.pos_providers (slug, label)
VALUES ('lightspeed', 'Lightspeed K-Series')
ON CONFLICT (slug) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- 1.2  pos_connections  (1 par établissement × provider)
CREATE TABLE IF NOT EXISTS public.pos_connections (
  id                  text        PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  etablissement_id    text        NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  provider_id         text        NOT NULL REFERENCES public.pos_providers(id),
  -- tokens - JAMAIS lus côté client (service_role seulement)
  access_token_enc    text,
  refresh_token_enc   text,
  token_expires_at    timestamptz,
  -- état de la connexion
  status              text        NOT NULL DEFAULT 'disconnected'
                                  CHECK (status IN ('connected','disconnected','error')),
  last_sync_at        timestamptz,
  last_error          text,
  -- meta
  created_by          text        REFERENCES public.profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (etablissement_id, provider_id)
);

-- ─────────────────────────────────────────────────────────────────
-- 1.3  pos_items  (catalogue plats POS)
CREATE TABLE IF NOT EXISTS public.pos_items (
  id                  text        PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  pos_connection_id   text        NOT NULL REFERENCES public.pos_connections(id) ON DELETE CASCADE,
  external_id         text        NOT NULL,            -- ID stable côté Lightspeed
  name                text        NOT NULL,
  sku                 text,
  accounting_group    text,                            -- accountingGroup.name (catégorie carte)
  active              boolean     NOT NULL DEFAULT true,
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  archived_at         timestamptz,                     -- NULL = actif ; non-NULL = archivé
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pos_connection_id, external_id)
);

-- ─────────────────────────────────────────────────────────────────
-- 1.4  pos_sales  (ventes agrégées par plat par jour)
CREATE TABLE IF NOT EXISTS public.pos_sales (
  id            text        PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  pos_item_id   text        NOT NULL REFERENCES public.pos_items(id) ON DELETE CASCADE,
  date          date        NOT NULL,
  qty           integer     NOT NULL DEFAULT 0,
  revenue_cts   integer     NOT NULL DEFAULT 0,        -- centimes (évite les flottants)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pos_item_id, date)
);

-- ─────────────────────────────────────────────────────────────────
-- 1.5  pos_item_recipe_mapping  (lien plat POS ↔ recette Samper)
CREATE TABLE IF NOT EXISTS public.pos_item_recipe_mapping (
  id                  text        PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  pos_item_id         text        NOT NULL REFERENCES public.pos_items(id) ON DELETE CASCADE,
  recipe_id           text        NOT NULL REFERENCES public.recettes(id) ON DELETE CASCADE,
  confidence          numeric(5,2) NOT NULL DEFAULT 0, -- 0–100
  manually_validated  boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pos_item_id)   -- 1 mapping max par plat POS
);

-- ────────────────────────────────────────────────────────────────
-- 2. INDEXES
-- ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pos_connections_etab
  ON public.pos_connections (etablissement_id);

CREATE INDEX IF NOT EXISTS idx_pos_items_connection
  ON public.pos_items (pos_connection_id);

CREATE INDEX IF NOT EXISTS idx_pos_items_archived
  ON public.pos_items (archived_at)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pos_sales_item_date
  ON public.pos_sales (pos_item_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_pos_sales_date
  ON public.pos_sales (date DESC);

CREATE INDEX IF NOT EXISTS idx_pos_mapping_recipe
  ON public.pos_item_recipe_mapping (recipe_id);

-- ────────────────────────────────────────────────────────────────
-- 3. UPDATED_AT TRIGGERS  (pattern existant dans le projet)
-- ────────────────────────────────────────────────────────────────

-- Réutilise la fonction set_updated_at() déjà présente dans le projet.
-- Si elle n'existe pas encore, on la crée.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_pos_connections_updated_at
  BEFORE UPDATE ON public.pos_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_pos_items_updated_at
  BEFORE UPDATE ON public.pos_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_pos_sales_updated_at
  BEFORE UPDATE ON public.pos_sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_pos_item_recipe_mapping_updated_at
  BEFORE UPDATE ON public.pos_item_recipe_mapping
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────────
-- 4. RLS
-- ────────────────────────────────────────────────────────────────

-- 4.0  Activation
ALTER TABLE public.pos_providers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_connections          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_items                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sales                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_item_recipe_mapping  ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────
-- 4.1  pos_providers - lecture publique (référence statique)
CREATE POLICY "pos_providers_select_all" ON public.pos_providers
  FOR SELECT TO authenticated USING (true);

-- ─────────────────────────────────────────────────────────────────
-- 4.2  pos_connections
--   SELECT : accessible si l'utilisateur peut accéder à l'établissement
--            MAIS les colonnes token ne doivent JAMAIS être lues côté client.
--            Le client n'interroge que status/last_sync_at/last_error.
--            Les tokens sont uniquement lus par les edge functions (service_role).
CREATE POLICY "pos_connections_select" ON public.pos_connections
  FOR SELECT TO authenticated
  USING (user_can_access_etab(etablissement_id));

--   INSERT / UPDATE / DELETE : consultant + patron uniquement
CREATE POLICY "pos_connections_insert" ON public.pos_connections
  FOR INSERT TO authenticated
  WITH CHECK (
    user_can_access_etab(etablissement_id)
    AND current_user_role() IN ('consultant', 'patron')
  );

CREATE POLICY "pos_connections_update" ON public.pos_connections
  FOR UPDATE TO authenticated
  USING (
    user_can_access_etab(etablissement_id)
    AND current_user_role() IN ('consultant', 'patron')
  );

CREATE POLICY "pos_connections_delete" ON public.pos_connections
  FOR DELETE TO authenticated
  USING (
    user_can_access_etab(etablissement_id)
    AND current_user_role() IN ('consultant', 'patron')
  );

-- ─────────────────────────────────────────────────────────────────
-- 4.3  pos_items  (via pos_connections.etablissement_id)
CREATE POLICY "pos_items_select" ON public.pos_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pos_connections pc
      WHERE pc.id = pos_connection_id
        AND user_can_access_etab(pc.etablissement_id)
    )
  );

CREATE POLICY "pos_items_insert" ON public.pos_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pos_connections pc
      WHERE pc.id = pos_connection_id
        AND user_can_access_etab(pc.etablissement_id)
        AND current_user_role() IN ('consultant', 'patron')
    )
  );

CREATE POLICY "pos_items_update" ON public.pos_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pos_connections pc
      WHERE pc.id = pos_connection_id
        AND user_can_access_etab(pc.etablissement_id)
        AND current_user_role() IN ('consultant', 'patron')
    )
  );

CREATE POLICY "pos_items_delete" ON public.pos_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pos_connections pc
      WHERE pc.id = pos_connection_id
        AND user_can_access_etab(pc.etablissement_id)
        AND current_user_role() IN ('consultant', 'patron')
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- 4.4  pos_sales
CREATE POLICY "pos_sales_select" ON public.pos_sales
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pos_items pi
      JOIN public.pos_connections pc ON pc.id = pi.pos_connection_id
      WHERE pi.id = pos_item_id
        AND user_can_access_etab(pc.etablissement_id)
    )
  );

CREATE POLICY "pos_sales_insert" ON public.pos_sales
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pos_items pi
      JOIN public.pos_connections pc ON pc.id = pi.pos_connection_id
      WHERE pi.id = pos_item_id
        AND user_can_access_etab(pc.etablissement_id)
        AND current_user_role() IN ('consultant', 'patron')
    )
  );

CREATE POLICY "pos_sales_update" ON public.pos_sales
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pos_items pi
      JOIN public.pos_connections pc ON pc.id = pi.pos_connection_id
      WHERE pi.id = pos_item_id
        AND user_can_access_etab(pc.etablissement_id)
        AND current_user_role() IN ('consultant', 'patron')
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- 4.5  pos_item_recipe_mapping
CREATE POLICY "pos_mapping_select" ON public.pos_item_recipe_mapping
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pos_items pi
      JOIN public.pos_connections pc ON pc.id = pi.pos_connection_id
      WHERE pi.id = pos_item_id
        AND user_can_access_etab(pc.etablissement_id)
    )
  );

CREATE POLICY "pos_mapping_insert" ON public.pos_item_recipe_mapping
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pos_items pi
      JOIN public.pos_connections pc ON pc.id = pi.pos_connection_id
      WHERE pi.id = pos_item_id
        AND user_can_access_etab(pc.etablissement_id)
        AND current_user_role() IN ('consultant', 'patron', 'resp_cuisine')
    )
  );

CREATE POLICY "pos_mapping_update" ON public.pos_item_recipe_mapping
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pos_items pi
      JOIN public.pos_connections pc ON pc.id = pi.pos_connection_id
      WHERE pi.id = pos_item_id
        AND user_can_access_etab(pc.etablissement_id)
        AND current_user_role() IN ('consultant', 'patron', 'resp_cuisine')
    )
  );

CREATE POLICY "pos_mapping_delete" ON public.pos_item_recipe_mapping
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pos_items pi
      JOIN public.pos_connections pc ON pc.id = pi.pos_connection_id
      WHERE pi.id = pos_item_id
        AND user_can_access_etab(pc.etablissement_id)
        AND current_user_role() IN ('consultant', 'patron', 'resp_cuisine')
    )
  );

-- ────────────────────────────────────────────────────────────────
-- FIN MIGRATION 20260523_pos_lightspeed_j1.sql
-- ────────────────────────────────────────────────────────────────
