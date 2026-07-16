-- ================================================================
-- MIGRATION - Système d'alertes configurables
-- Projet : Samper Consulting
-- Date   : 2026-05-24
--
-- TABLES :
--   alert_rules      - règles définies par consultant/patron
--   alert_instances  - alertes déclenchées (actives ou résolues)
--   alert_reads      - suivi des lectures par utilisateur
--
-- PATTERNS : text IDs (cohérent avec toutes les tables existantes)
--            RLS via user_can_access_etab() + current_user_role()
-- ================================================================

-- ─── 1. TABLE DES RÈGLES D'ALERTE ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.alert_rules (
  id               text        PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  etablissement_id text        NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  created_by       text        NOT NULL,   -- auth.users.id (stocké en text)

  -- Identification
  name             text        NOT NULL,
  description      text,

  -- Type + paramètres
  rule_type        text        NOT NULL,
  -- 'pointage_manquant' | 'haccp_manquant' | 'reservation_non_confirmee'
  -- | 'stock_critique' | 'ventes_inactives' | 'pertes_elevees' | 'personnalisee'
  rule_config      jsonb       NOT NULL DEFAULT '{}',

  -- Sévérité
  severity         text        NOT NULL DEFAULT 'warning',
  -- 'info' | 'warning' | 'critical'

  -- Planification
  schedule_type    text        NOT NULL DEFAULT 'hourly',
  -- 'hourly' | 'daily'
  schedule_time    time,       -- pour 'daily' : heure d'évaluation (ex: '20:00')
  schedule_days    int[],      -- pour 'daily' : jours (1=lun…7=dim), null = tous

  -- État
  is_active        boolean     NOT NULL DEFAULT true,
  last_evaluated_at timestamptz,
  last_triggered_at timestamptz,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. TABLE DES INSTANCES D'ALERTES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.alert_instances (
  id               text        PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  rule_id          text        NOT NULL REFERENCES public.alert_rules(id) ON DELETE CASCADE,
  etablissement_id text        NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,

  -- Contenu
  title            text        NOT NULL,
  message          text        NOT NULL,
  link_module      text,       -- 'planning' | 'haccp' | 'previsions' | 'inventaire' | 'pos' | 'pertes'

  -- Sévérité (dénormalisée depuis la règle pour queries rapides)
  severity         text        NOT NULL DEFAULT 'warning',

  -- État
  status           text        NOT NULL DEFAULT 'active',
  -- 'active' | 'resolved' | 'dismissed'
  resolved_at      timestamptz,
  dismissed_at     timestamptz,
  dismissed_by     text,       -- auth.users.id

  -- Qui voit cette alerte
  target_roles     text[]      NOT NULL DEFAULT '{"consultant","patron"}',

  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ─── 3. TABLE DE LECTURE ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.alert_reads (
  id          text        PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  instance_id text        NOT NULL REFERENCES public.alert_instances(id) ON DELETE CASCADE,
  user_id     text        NOT NULL,  -- auth.users.id
  read_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(instance_id, user_id)
);

-- ─── 4. INDEX ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_alert_rules_etab_active
  ON public.alert_rules(etablissement_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_alert_instances_etab_status
  ON public.alert_instances(etablissement_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_instances_rule
  ON public.alert_instances(rule_id, status);

CREATE INDEX IF NOT EXISTS idx_alert_reads_user
  ON public.alert_reads(user_id, instance_id);

-- ─── 5. RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.alert_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_reads     ENABLE ROW LEVEL SECURITY;

-- alert_rules : lecture pour membres de l'établissement
CREATE POLICY alert_rules_select ON public.alert_rules FOR SELECT
  USING (user_can_access_etab(etablissement_id));

-- alert_rules : écriture pour consultant + patron
CREATE POLICY alert_rules_write ON public.alert_rules FOR ALL
  USING (
    user_can_access_etab(etablissement_id)
    AND current_user_role() = ANY(ARRAY['consultant', 'patron'])
  )
  WITH CHECK (
    user_can_access_etab(etablissement_id)
    AND current_user_role() = ANY(ARRAY['consultant', 'patron'])
  );

-- alert_instances : lecture selon target_roles
CREATE POLICY alert_instances_select ON public.alert_instances FOR SELECT
  USING (
    user_can_access_etab(etablissement_id)
    AND current_user_role() = ANY(target_roles)
  );

-- alert_instances : dismiss par les destinataires
CREATE POLICY alert_instances_dismiss ON public.alert_instances FOR UPDATE
  USING (
    user_can_access_etab(etablissement_id)
    AND current_user_role() = ANY(target_roles)
  );

-- alert_reads : chacun gère ses lectures
CREATE POLICY alert_reads_own ON public.alert_reads FOR ALL
  USING ((auth.uid())::text = user_id);
