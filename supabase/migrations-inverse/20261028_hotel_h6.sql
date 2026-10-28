-- ════════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261028_hotel_h6.sql (branche Hôtel, lot H6)
-- ───────────────────────────────────────────────────────────────────────────
-- Jamais appliquée par outil : à jouer à la main, par Jérémy, après export JSON
-- des cinq tables et retrait du front du lot H6 (module Passations). Retire les
-- tables et la fonction de cohérence ; aucune colonne d'une table existante
-- n'est touchée.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
begin
  foreach t in array array['passations', 'passation_lectures', 'canaux_messages', 'taches_recurrentes', 'taches_faites'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

drop table if exists public.taches_faites;
drop table if exists public.taches_recurrentes;
drop table if exists public.canaux_messages;
drop table if exists public.passation_lectures;
drop table if exists public.passations;
drop function if exists public.hotel_h6_coherence();
