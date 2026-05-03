-- ═══════════════════════════════════════════════════════════════
-- COMPTEUR DE FACTURES — Stockage centralisé en DB
-- ═══════════════════════════════════════════════════════════════
-- Remplace le compteur localStorage qui causait des conflits multi-device.
-- Une seule ligne par (établissement, date) : on incrémente atomiquement
-- via INSERT ... ON CONFLICT DO UPDATE RETURNING.
--
-- Format final : FAC-YYYYMMDD-NN  (ex: FAC-20260427-03)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.factures_compteurs (
  etablissement_id text NOT NULL,
  date date NOT NULL,
  last_seq integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (etablissement_id, date)
);

-- Index implicite sur la PK ; pas besoin d'index supplémentaire.

-- ─── RLS ───
-- Seuls les consultants peuvent lire/écrire les compteurs (les autres rôles
-- ne créent pas de factures). On garde le check générique sur le rôle.
ALTER TABLE public.factures_compteurs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consultants_can_read_compteurs" ON public.factures_compteurs;
CREATE POLICY "consultants_can_read_compteurs"
  ON public.factures_compteurs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'consultant'
    )
  );

DROP POLICY IF EXISTS "consultants_can_write_compteurs" ON public.factures_compteurs;
CREATE POLICY "consultants_can_write_compteurs"
  ON public.factures_compteurs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'consultant'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'consultant'
    )
  );

-- ─── Migration optionnelle : pré-remplir avec les compteurs localStorage existants ───
-- Si tu connais le dernier numéro utilisé (ex: FAC-20260427-05), tu peux exécuter :
--   INSERT INTO public.factures_compteurs (etablissement_id, date, last_seq)
--   VALUES ('etab-1', '2026-04-27', 5)
--   ON CONFLICT (etablissement_id, date) DO UPDATE SET last_seq = GREATEST(factures_compteurs.last_seq, EXCLUDED.last_seq);
-- Sinon le compteur repart de 0 le jour J et c'est OK (c'est rarement un problème).
