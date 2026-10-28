-- ════════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261028_hotel_h2.sql (branche Hôtel, lot H2)
-- ───────────────────────────────────────────────────────────────────────────
-- Jamais appliquée par outil : à jouer à la main, par Jérémy, après export JSON
-- de demandes et demandes_journal. Supprime les deux tables et leurs fonctions.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
begin
  foreach t in array array['demandes', 'demandes_journal'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

drop table if exists public.demandes_journal;
drop table if exists public.demandes;
drop function if exists public.demandes_journal_ecrire();
drop function if exists public.demandes_avant_ecriture();
