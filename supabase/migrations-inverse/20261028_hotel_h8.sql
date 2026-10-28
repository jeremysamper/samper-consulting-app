-- ════════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261028_hotel_h8.sql (branche Hôtel, lot H8)
-- ───────────────────────────────────────────────────────────────────────────
-- Jamais appliquée par outil : à jouer à la main, par Jérémy, après export JSON
-- des trois tables et retrait du front du lot H8 (module Technique). Retire
-- les tables et les deux fonctions ; aucune colonne d'une table existante
-- n'est touchée.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
begin
  foreach t in array array['equipements', 'maintenance_plans', 'ordres_travail'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

drop table if exists public.ordres_travail;
drop table if exists public.maintenance_plans;
drop table if exists public.equipements;
drop function if exists public.ordres_travail_apres_fin();
drop function if exists public.hotel_h8_coherence();
