-- Inverse de 20261115_points_haccp_matin_soir : remet le relevé HACCP à un
-- crédit par tranche de deux heures (corps de 20261115_points_anti_fuite), puis
-- retire points_moment_zurich. Un seul passage.

set local lock_timeout = '3s';

create or replace function public.points_trg_haccp_releves()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    perform public.points_verser(new.etablissement_id, new.operateur, 'releve_haccp', 'haccp_releves', new.id,
      coalesce(nullif(btrim(new.zone_id), ''), 'sans-zone') || ':' || public.points_jour_zurich() || ':'
        || (floor(extract(hour from now() at time zone 'Europe/Zurich') / 2))::int);
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('haccp_releves', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_haccp_releves : %', sqlerrm;
  return null;
end;
$fn$;

drop function if exists public.points_moment_zurich(timestamptz);
