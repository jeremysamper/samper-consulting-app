-- Rollback de 20261118_achats_hausses_prix.
-- À jouer seulement après le retrait du front qui lit la colonne et la table
-- (contract) : le front d'alors y lit le seuil et les hausses vues.

set local lock_timeout = '5s';

do $pub$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'achats_hausses_vues'
  ) then
    alter publication supabase_realtime drop table public.achats_hausses_vues;
  end if;
end $pub$;

drop table if exists public.achats_hausses_vues;

alter table public.compta_reglages
  drop constraint if exists compta_reglages_seuil_hausse_chk;
alter table public.compta_reglages
  drop column if exists seuil_hausse_prix_pct;
