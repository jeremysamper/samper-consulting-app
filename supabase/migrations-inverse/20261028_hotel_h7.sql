-- ════════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261028_hotel_h7.sql (branche Hôtel, lot H7)
-- ───────────────────────────────────────────────────────────────────────────
-- Jamais appliquée par outil : à jouer à la main, par Jérémy, après export JSON
-- des deux tables et retrait du front du lot H7 (module Repas hôtel, section
-- Restaurant de la fiche séjour). Retire les tables et la fonction, et rend au
-- garde-fou de suppression des séjours sa version du lot H5.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
begin
  foreach t in array array['room_service_commandes', 'sejour_liens'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

create or replace function public.sejours_avant_suppression()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null or (select public.current_user_role()) in ('consultant', 'patron') then
    return old;
  end if;
  if exists (select 1 from public.sejour_lignes l where l.sejour_id = old.id)
     or exists (select 1 from public.sejour_occupants o where o.sejour_id = old.id)
     or exists (select 1 from public.activite_inscriptions i where i.sejour_id = old.id)
     or exists (select 1 from public.consommations c where c.sejour_id = old.id) then
    raise exception 'SEJOUR_AVEC_HISTORIQUE: un séjour qui porte une note, un registre, des inscriptions ou des consommations ne se supprime pas ; annule-le'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

drop table if exists public.sejour_liens;
drop table if exists public.room_service_commandes;
drop function if exists public.hotel_h7_coherence();
