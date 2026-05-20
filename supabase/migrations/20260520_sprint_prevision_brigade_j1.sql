-- ================================================================
-- MIGRATION J1 — SPRINT PRÉVISION + BRIGADE
-- Projet  : Samper Consulting
-- Date    : 2026-05-20
-- Tables  : reservations, reservation_tags, previsions_jour,
--           brigade_services, brigade_taches, brigade_commandes,
--           ventes_historique  (7 tables)
-- Triggers: 3  |  RPC: 2  |  Realtime: 4 tables
--
-- ADAPTATIONS vs spec :
--  • IDs en text (pas uuid) — cohérent avec toutes les tables existantes
--  • FK vers etablissements/recettes/profiles en text (idem)
--  • RLS via user_can_access_etab() + current_user_role() (helpers existants)
--  • Pas de table etablissement_users — on utilise profiles.etablissement_ids
--  • Rôles : 'chef' → 'resp_cuisine' | 'responsable' → 'patron' | 'hote' préparé
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- 1. TABLES
-- ────────────────────────────────────────────────────────────────

-- 1.1  reservations
CREATE TABLE public.reservations (
  id               text        PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  etablissement_id text        NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  date_service     date        NOT NULL,
  service          text        NOT NULL CHECK (service IN ('midi','soir','brunch')),
  heure_arrivee    time        NOT NULL,
  nb_couverts      integer     NOT NULL CHECK (nb_couverts > 0),
  nom              text        NOT NULL,
  telephone        text,
  est_groupe       boolean     NOT NULL DEFAULT false,
  notes_libres     text,
  statut           text        NOT NULL DEFAULT 'confirme'
                               CHECK (statut IN ('confirme','arrive','parti','no_show','annule')),
  created_by       text        REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reservations_etab_date ON public.reservations(etablissement_id, date_service);

-- 1.2  reservation_tags
CREATE TABLE public.reservation_tags (
  id             text        PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  reservation_id text        NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  type_tag       text        NOT NULL CHECK (type_tag IN ('allergene','regime','occasion','autre')),
  valeur         text        NOT NULL,
  libre          boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reservation_tags_reservation ON public.reservation_tags(reservation_id);

-- 1.3  previsions_jour  (cache agrégat — mis à jour par triggers)
CREATE TABLE public.previsions_jour (
  id               text        PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  etablissement_id text        NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  date_service     date        NOT NULL,
  couverts_midi    integer     NOT NULL DEFAULT 0,
  couverts_soir    integer     NOT NULL DEFAULT 0,
  couverts_brunch  integer     NOT NULL DEFAULT 0,
  nb_groupes       integer     NOT NULL DEFAULT 0,
  tags_critiques   text[]      NOT NULL DEFAULT '{}',
  last_updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (etablissement_id, date_service)
);

-- 1.4  brigade_services
CREATE TABLE public.brigade_services (
  id                text        PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  etablissement_id  text        NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  date              date        NOT NULL,
  couverts_prevus   integer     NOT NULL DEFAULT 0,
  couverts_realises integer,
  statut            text        NOT NULL DEFAULT 'planifie'
                                CHECK (statut IN ('planifie','en_cours','termine')),
  debrief_notes     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (etablissement_id, date)
);

-- 1.5  brigade_taches
CREATE TABLE public.brigade_taches (
  id                  text        PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  service_id          text        NOT NULL REFERENCES public.brigade_services(id) ON DELETE CASCADE,
  recette_id          text        REFERENCES public.recettes(id),
  titre               text        NOT NULL,
  description         text,
  poste               text        NOT NULL CHECK (poste IN ('chaud','froid','patisserie','garde_manger')),
  assignee_id         text        REFERENCES public.profiles(id),
  ordre               integer     NOT NULL DEFAULT 0,
  temps_estime_min    integer,
  deadline            timestamptz,
  statut              text        NOT NULL DEFAULT 'todo'
                                  CHECK (statut IN ('todo','en_cours','termine')),
  termine_at          timestamptz,
  photo_reference_url text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 1.6  brigade_commandes
CREATE TABLE public.brigade_commandes (
  id                text        PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  service_id        text        NOT NULL REFERENCES public.brigade_services(id) ON DELETE CASCADE,
  table_numero      integer,
  couvert_numero    integer,
  recette_id        text        NOT NULL REFERENCES public.recettes(id),
  allergenes_actifs text[]      NOT NULL DEFAULT '{}',
  statut            text        NOT NULL DEFAULT 'recue'
                                CHECK (statut IN ('recue','en_cuisson','dressee','sortie')),
  temps_recue_at    timestamptz NOT NULL DEFAULT now(),
  temps_sortie_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 1.7  ventes_historique  (architecture POS-ready)
CREATE TABLE public.ventes_historique (
  id               text        PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  etablissement_id text        NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  date_service     date        NOT NULL,
  service          text        CHECK (service IN ('midi','soir','brunch')),
  recette_id       text        NOT NULL REFERENCES public.recettes(id),
  nb_vendus        integer     NOT NULL CHECK (nb_vendus >= 0),
  source           text        NOT NULL DEFAULT 'manuel'
                               CHECK (source IN ('manuel','lightspeed','autre_pos')),
  synced_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ventes_historique_lookup ON public.ventes_historique(etablissement_id, date_service, recette_id);


-- ────────────────────────────────────────────────────────────────
-- 2. RLS
-- ────────────────────────────────────────────────────────────────

ALTER TABLE public.reservations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_tags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.previsions_jour     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brigade_services    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brigade_taches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brigade_commandes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventes_historique   ENABLE ROW LEVEL SECURITY;

-- ── reservations ──
CREATE POLICY reservations_select ON public.reservations
  FOR SELECT USING (user_can_access_etab(etablissement_id));

CREATE POLICY reservations_insert ON public.reservations
  FOR INSERT WITH CHECK (
    user_can_access_etab(etablissement_id)
    AND current_user_role() = ANY(ARRAY['consultant','patron','resp_cuisine','hote'])
  );

CREATE POLICY reservations_update ON public.reservations
  FOR UPDATE
  USING (user_can_access_etab(etablissement_id)
         AND current_user_role() = ANY(ARRAY['consultant','patron','resp_cuisine','hote']))
  WITH CHECK (user_can_access_etab(etablissement_id)
              AND current_user_role() = ANY(ARRAY['consultant','patron','resp_cuisine','hote']));

CREATE POLICY reservations_delete ON public.reservations
  FOR DELETE USING (
    user_can_access_etab(etablissement_id)
    AND current_user_role() = ANY(ARRAY['consultant','patron','hote'])
  );

-- ── reservation_tags  (hérite l'accès via la réservation parente) ──
CREATE POLICY reservation_tags_select ON public.reservation_tags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id AND user_can_access_etab(r.etablissement_id)
    )
  );

CREATE POLICY reservation_tags_insert ON public.reservation_tags
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id
        AND user_can_access_etab(r.etablissement_id)
        AND current_user_role() = ANY(ARRAY['consultant','patron','resp_cuisine','hote'])
    )
  );

CREATE POLICY reservation_tags_delete ON public.reservation_tags
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id
        AND user_can_access_etab(r.etablissement_id)
        AND current_user_role() = ANY(ARRAY['consultant','patron','hote'])
    )
  );

-- ── previsions_jour ──
CREATE POLICY previsions_select ON public.previsions_jour
  FOR SELECT USING (user_can_access_etab(etablissement_id));

CREATE POLICY previsions_insert ON public.previsions_jour
  FOR INSERT WITH CHECK (
    user_can_access_etab(etablissement_id)
    AND current_user_role() = ANY(ARRAY['consultant','patron','resp_cuisine'])
  );

CREATE POLICY previsions_update ON public.previsions_jour
  FOR UPDATE
  USING (user_can_access_etab(etablissement_id)
         AND current_user_role() = ANY(ARRAY['consultant','patron','resp_cuisine']))
  WITH CHECK (user_can_access_etab(etablissement_id)
              AND current_user_role() = ANY(ARRAY['consultant','patron','resp_cuisine']));

CREATE POLICY previsions_delete ON public.previsions_jour
  FOR DELETE USING (
    user_can_access_etab(etablissement_id) AND current_user_role() = 'consultant'
  );

-- ── brigade_services ──
CREATE POLICY brigade_services_select ON public.brigade_services
  FOR SELECT USING (user_can_access_etab(etablissement_id));

CREATE POLICY brigade_services_insert ON public.brigade_services
  FOR INSERT WITH CHECK (
    user_can_access_etab(etablissement_id)
    AND current_user_role() = ANY(ARRAY['consultant','patron','resp_cuisine'])
  );

CREATE POLICY brigade_services_update ON public.brigade_services
  FOR UPDATE
  USING (user_can_access_etab(etablissement_id)
         AND current_user_role() = ANY(ARRAY['consultant','patron','resp_cuisine']))
  WITH CHECK (user_can_access_etab(etablissement_id)
              AND current_user_role() = ANY(ARRAY['consultant','patron','resp_cuisine']));

CREATE POLICY brigade_services_delete ON public.brigade_services
  FOR DELETE USING (
    user_can_access_etab(etablissement_id) AND current_user_role() = 'consultant'
  );

-- ── brigade_taches  (accès via brigade_services) ──
CREATE POLICY brigade_taches_select ON public.brigade_taches
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.brigade_services bs
            WHERE bs.id = service_id AND user_can_access_etab(bs.etablissement_id))
  );

CREATE POLICY brigade_taches_insert ON public.brigade_taches
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.brigade_services bs
            WHERE bs.id = service_id
              AND user_can_access_etab(bs.etablissement_id)
              AND current_user_role() = ANY(ARRAY['consultant','patron','resp_cuisine']))
  );

CREATE POLICY brigade_taches_update ON public.brigade_taches
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.brigade_services bs
                 WHERE bs.id = service_id
                   AND user_can_access_etab(bs.etablissement_id)
                   AND current_user_role() = ANY(ARRAY['consultant','patron','resp_cuisine'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.brigade_services bs
                      WHERE bs.id = service_id
                        AND user_can_access_etab(bs.etablissement_id)
                        AND current_user_role() = ANY(ARRAY['consultant','patron','resp_cuisine'])));

CREATE POLICY brigade_taches_delete ON public.brigade_taches
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.brigade_services bs
            WHERE bs.id = service_id
              AND user_can_access_etab(bs.etablissement_id)
              AND current_user_role() = 'consultant')
  );

-- ── brigade_commandes  (accès via brigade_services) ──
CREATE POLICY brigade_commandes_select ON public.brigade_commandes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.brigade_services bs
            WHERE bs.id = service_id AND user_can_access_etab(bs.etablissement_id))
  );

CREATE POLICY brigade_commandes_insert ON public.brigade_commandes
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.brigade_services bs
            WHERE bs.id = service_id
              AND user_can_access_etab(bs.etablissement_id)
              AND current_user_role() = ANY(ARRAY['consultant','patron','resp_cuisine']))
  );

CREATE POLICY brigade_commandes_update ON public.brigade_commandes
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.brigade_services bs
                 WHERE bs.id = service_id
                   AND user_can_access_etab(bs.etablissement_id)
                   AND current_user_role() = ANY(ARRAY['consultant','patron','resp_cuisine'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.brigade_services bs
                      WHERE bs.id = service_id
                        AND user_can_access_etab(bs.etablissement_id)
                        AND current_user_role() = ANY(ARRAY['consultant','patron','resp_cuisine'])));

CREATE POLICY brigade_commandes_delete ON public.brigade_commandes
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.brigade_services bs
            WHERE bs.id = service_id
              AND user_can_access_etab(bs.etablissement_id)
              AND current_user_role() = 'consultant')
  );

-- ── ventes_historique ──
CREATE POLICY ventes_select ON public.ventes_historique
  FOR SELECT USING (user_can_access_etab(etablissement_id));

CREATE POLICY ventes_insert ON public.ventes_historique
  FOR INSERT WITH CHECK (
    user_can_access_etab(etablissement_id)
    AND current_user_role() = ANY(ARRAY['consultant','resp_cuisine'])
  );

CREATE POLICY ventes_update ON public.ventes_historique
  FOR UPDATE
  USING (user_can_access_etab(etablissement_id)
         AND current_user_role() = ANY(ARRAY['consultant','resp_cuisine']))
  WITH CHECK (user_can_access_etab(etablissement_id)
              AND current_user_role() = ANY(ARRAY['consultant','resp_cuisine']));

CREATE POLICY ventes_delete ON public.ventes_historique
  FOR DELETE USING (
    user_can_access_etab(etablissement_id) AND current_user_role() = 'consultant'
  );


-- ────────────────────────────────────────────────────────────────
-- 3. TRIGGERS
-- ────────────────────────────────────────────────────────────────

-- Trigger 1 : recalcul previsions_jour après INSERT/UPDATE/DELETE sur reservations
CREATE OR REPLACE FUNCTION public.fn_update_previsions_from_reservations()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_etab_id text;
  v_date    date;
  v_midi    integer;
  v_soir    integer;
  v_brunch  integer;
  v_groupes integer;
BEGIN
  -- Déterminer la clé (établissement + date) selon le type d'opération
  IF TG_OP = 'DELETE' THEN
    v_etab_id := OLD.etablissement_id;
    v_date    := OLD.date_service;
  ELSE
    v_etab_id := NEW.etablissement_id;
    v_date    := NEW.date_service;
  END IF;

  -- Agréger les couverts du jour (hors annulés et no-show)
  SELECT
    COALESCE(SUM(nb_couverts) FILTER (WHERE service = 'midi'),   0),
    COALESCE(SUM(nb_couverts) FILTER (WHERE service = 'soir'),   0),
    COALESCE(SUM(nb_couverts) FILTER (WHERE service = 'brunch'), 0),
    COALESCE(COUNT(*)         FILTER (WHERE est_groupe = true),  0)
  INTO v_midi, v_soir, v_brunch, v_groupes
  FROM public.reservations
  WHERE etablissement_id = v_etab_id
    AND date_service      = v_date
    AND statut NOT IN ('annule','no_show');

  -- UPSERT previsions_jour
  INSERT INTO public.previsions_jour
    (etablissement_id, date_service,
     couverts_midi, couverts_soir, couverts_brunch, nb_groupes, last_updated_at)
  VALUES
    (v_etab_id, v_date,
     v_midi, v_soir, v_brunch, v_groupes, now())
  ON CONFLICT (etablissement_id, date_service) DO UPDATE SET
    couverts_midi   = EXCLUDED.couverts_midi,
    couverts_soir   = EXCLUDED.couverts_soir,
    couverts_brunch = EXCLUDED.couverts_brunch,
    nb_groupes      = EXCLUDED.nb_groupes,
    last_updated_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_reservations_update_previsions
  AFTER INSERT OR UPDATE OR DELETE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_previsions_from_reservations();

-- ──────────────────────────────────────────────────────────────

-- Trigger 2 : recalcul tags_critiques après modif de reservation_tags
CREATE OR REPLACE FUNCTION public.fn_update_tags_critiques()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_etab_id text;
  v_date    date;
  v_tags    text[];
  v_res_id  text;
BEGIN
  -- Identifier la réservation parente
  IF TG_OP = 'DELETE' THEN
    v_res_id := OLD.reservation_id;
  ELSE
    v_res_id := NEW.reservation_id;
  END IF;

  -- Récupérer établissement + date depuis la réservation parente
  SELECT etablissement_id, date_service
    INTO v_etab_id, v_date
    FROM public.reservations
   WHERE id = v_res_id;

  IF v_etab_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Agréger les tags allergènes du jour (hors réservations annulées)
  SELECT ARRAY_AGG(DISTINCT rt.valeur ORDER BY rt.valeur)
    INTO v_tags
    FROM public.reservation_tags rt
    JOIN public.reservations r ON r.id = rt.reservation_id
   WHERE r.etablissement_id = v_etab_id
     AND r.date_service      = v_date
     AND r.statut NOT IN ('annule','no_show')
     AND rt.type_tag         = 'allergene';

  -- UPSERT sur previsions_jour (crée la ligne si elle n'existe pas)
  INSERT INTO public.previsions_jour
    (etablissement_id, date_service, tags_critiques, last_updated_at)
  VALUES
    (v_etab_id, v_date, COALESCE(v_tags, '{}'), now())
  ON CONFLICT (etablissement_id, date_service) DO UPDATE SET
    tags_critiques  = COALESCE(v_tags, '{}'),
    last_updated_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_reservation_tags_update_previsions
  AFTER INSERT OR DELETE ON public.reservation_tags
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_tags_critiques();

-- ──────────────────────────────────────────────────────────────

-- Trigger 3 : auto-remplissage couverts_prevus à la création d'un brigade_service
CREATE OR REPLACE FUNCTION public.fn_autofill_brigade_couverts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total integer;
BEGIN
  SELECT COALESCE(couverts_midi + couverts_soir + couverts_brunch, 0)
    INTO v_total
    FROM public.previsions_jour
   WHERE etablissement_id = NEW.etablissement_id
     AND date_service      = NEW.date;

  -- N'écrase pas si couverts_prevus déjà renseigné manuellement
  IF v_total IS NOT NULL AND v_total > 0 AND NEW.couverts_prevus = 0 THEN
    NEW.couverts_prevus := v_total;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_brigade_service_autofill_couverts
  BEFORE INSERT ON public.brigade_services
  FOR EACH ROW EXECUTE FUNCTION public.fn_autofill_brigade_couverts();


-- ────────────────────────────────────────────────────────────────
-- 4. FONCTIONS RPC
-- ────────────────────────────────────────────────────────────────

-- RPC 1 : vue semaine prévisions
CREATE OR REPLACE FUNCTION public.get_semaine_previsions(
  p_etablissement_id text,
  p_date_debut       date
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT user_can_access_etab(p_etablissement_id) THEN
    RAISE EXCEPTION 'Accès non autorisé à cet établissement';
  END IF;

  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'date_service',    d.dt::text,
        'jour_semaine',    to_char(d.dt, 'TMday'),
        'couverts_midi',   COALESCE(pj.couverts_midi,   0),
        'couverts_soir',   COALESCE(pj.couverts_soir,   0),
        'couverts_brunch', COALESCE(pj.couverts_brunch, 0),
        'nb_groupes',      COALESCE(pj.nb_groupes,      0),
        'tags_critiques',  COALESCE(pj.tags_critiques,  '{}'),
        'total_couverts',  COALESCE(pj.couverts_midi,0)
                         + COALESCE(pj.couverts_soir,0)
                         + COALESCE(pj.couverts_brunch,0)
      ) ORDER BY d.dt
    )
    FROM (
      SELECT generate_series(
        p_date_debut,
        p_date_debut + interval '6 days',
        interval '1 day'
      )::date AS dt
    ) d
    LEFT JOIN public.previsions_jour pj
           ON pj.etablissement_id = p_etablissement_id
          AND pj.date_service      = d.dt
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────

-- RPC 2 : dashboard chef en service
CREATE OR REPLACE FUNCTION public.get_brigade_dashboard(
  p_service_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_service     record;
  v_taches      jsonb;
  v_commandes   jsonb;
  v_total       integer := 0;
  v_terminees   integer := 0;
  v_cmd_recues  integer := 0;
  v_cmd_sorties integer := 0;
  v_retards     integer := 0;
BEGIN
  SELECT * INTO v_service
    FROM public.brigade_services
   WHERE id = p_service_id;

  IF NOT FOUND OR NOT user_can_access_etab(v_service.etablissement_id) THEN
    RAISE EXCEPTION 'Service introuvable ou accès non autorisé';
  END IF;

  -- Tâches groupées par poste
  SELECT jsonb_build_object(
    'chaud',        COALESCE(jsonb_agg(t.row) FILTER (WHERE t.poste = 'chaud'),        '[]'::jsonb),
    'froid',        COALESCE(jsonb_agg(t.row) FILTER (WHERE t.poste = 'froid'),        '[]'::jsonb),
    'patisserie',   COALESCE(jsonb_agg(t.row) FILTER (WHERE t.poste = 'patisserie'),   '[]'::jsonb),
    'garde_manger', COALESCE(jsonb_agg(t.row) FILTER (WHERE t.poste = 'garde_manger'), '[]'::jsonb)
  ) INTO v_taches
  FROM (
    SELECT to_jsonb(bt.*) AS row, bt.poste
      FROM public.brigade_taches bt
     WHERE bt.service_id = p_service_id
     ORDER BY bt.ordre
  ) t;

  -- Commandes non encore sorties
  SELECT COALESCE(jsonb_agg(to_jsonb(bc.*) ORDER BY bc.temps_recue_at), '[]'::jsonb)
    INTO v_commandes
    FROM public.brigade_commandes bc
   WHERE bc.service_id = p_service_id
     AND bc.statut != 'sortie';

  -- Stats
  SELECT COUNT(*) INTO v_total    FROM public.brigade_taches    WHERE service_id = p_service_id;
  SELECT COUNT(*) INTO v_terminees FROM public.brigade_taches   WHERE service_id = p_service_id AND statut = 'termine';
  SELECT COUNT(*) INTO v_cmd_recues FROM public.brigade_commandes WHERE service_id = p_service_id AND statut = 'recue';
  SELECT COUNT(*) INTO v_cmd_sorties FROM public.brigade_commandes WHERE service_id = p_service_id AND statut = 'sortie';
  SELECT COUNT(*) INTO v_retards FROM public.brigade_taches
    WHERE service_id = p_service_id AND deadline < now() AND statut != 'termine';

  RETURN jsonb_build_object(
    'service', to_jsonb(v_service),
    'taches_par_poste', COALESCE(v_taches,
      '{"chaud":[],"froid":[],"patisserie":[],"garde_manger":[]}'::jsonb),
    'commandes_en_cours', COALESCE(v_commandes, '[]'::jsonb),
    'stats', jsonb_build_object(
      'taches_total',      COALESCE(v_total,       0),
      'taches_terminees',  COALESCE(v_terminees,   0),
      'pct_avancement',    CASE WHEN COALESCE(v_total,0) > 0
                                THEN ROUND((COALESCE(v_terminees,0)::numeric / v_total) * 100)
                                ELSE 0 END,
      'commandes_recues',  COALESCE(v_cmd_recues,  0),
      'commandes_sorties', COALESCE(v_cmd_sorties, 0),
      'retards',           COALESCE(v_retards,     0)
    )
  );
END;
$$;


-- ────────────────────────────────────────────────────────────────
-- 5. REALTIME
-- ────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.previsions_jour;
ALTER PUBLICATION supabase_realtime ADD TABLE public.brigade_taches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.brigade_commandes;
