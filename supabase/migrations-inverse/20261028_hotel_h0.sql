-- ════════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261028_hotel_h0.sql (branche Hôtel, lot H0)
-- ───────────────────────────────────────────────────────────────────────────
-- Ce dossier (supabase/migrations-inverse/) n'est appliqué par aucun outil :
-- une inverse se joue à la main, par Jérémy, après lecture. Elle supprime les
-- trois tables du lot H0 et leurs déclencheurs, donc TOUTES les chambres, tous
-- les séjours et tout le journal des étages saisis depuis. Hors service
-- uniquement, après export JSON des trois tables (App-Web/_sauvegardes-supabase/).
-- Ne touche à rien d'autre : set_updated_at, user_peut_gerer et
-- user_can_access_etab sont partagés avec le reste de l'app et restent.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
begin
  foreach t in array array['chambres', 'sejours', 'chambres_statut_journal'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

drop table if exists public.chambres_statut_journal;
drop table if exists public.sejours;
drop table if exists public.chambres;

drop function if exists public.sejours_sans_chevauchement();
drop function if exists public.chambres_garde_colonnes();
drop function if exists public.chambres_journal_statut();
