-- ═══════════════════════════════════════════════════════════════
-- MIGRATION : LOGO ÉTABLISSEMENT + USER SETTINGS
-- ═══════════════════════════════════════════════════════════════
-- Migre 4 clés localStorage critiques vers Supabase :
--   1. sc_app_logo                  → etablissements.logo_url
--   2. sc_email_facture_enabled     → user_settings (key = 'email_facture_enabled')
--   3. sc_email_facture_template    → user_settings (key = 'email_facture_template')
--   4. sc_current_etab              → user_settings (key = 'current_etab_id')
--
-- Bénéfice : le logo apparaît sur les PDF de facture quel que soit le device,
-- et les préférences user (templates, etab courant) sont synchronisées.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Logo établissement ───
-- Stocké en data URL (base64) pour éviter le bucket Storage et garder simple.
-- Taille typique : 50-200 KB. Acceptable en colonne text.
ALTER TABLE public.etablissements
  ADD COLUMN IF NOT EXISTS logo_url text;

-- ─── 2. Table user_settings (clé/valeur par utilisateur) ───
-- Stockage générique pour préférences utilisateur synchronisées multi-device.
-- Une seule ligne par (user_id, key). Valeurs en JSONB pour flexibilité (string, bool, object…).
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- Index implicite sur la PK ; pas besoin d'index supplémentaire.

-- ─── RLS : chaque user lit/écrit uniquement ses propres settings ───
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_can_read_own_settings" ON public.user_settings;
CREATE POLICY "users_can_read_own_settings"
  ON public.user_settings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_can_write_own_settings" ON public.user_settings;
CREATE POLICY "users_can_write_own_settings"
  ON public.user_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Migration douce des données existantes (optionnel) ───
-- Si tu connais le user_id du consultant et que tu veux pré-remplir les settings :
--   INSERT INTO public.user_settings (user_id, key, value) VALUES
--     ('UUID_DU_CONSULTANT', 'email_facture_enabled', 'true'::jsonb),
--     ('UUID_DU_CONSULTANT', 'current_etab_id', '"etab-1"'::jsonb);
--   ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
--
-- Sinon : au premier chargement, l'app lit les valeurs localStorage existantes
-- et les pousse en DB automatiquement (one-shot migration côté client).
