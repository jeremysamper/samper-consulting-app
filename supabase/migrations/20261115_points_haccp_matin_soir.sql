-- ════════════════════════════════════════════════════════════════════════════
-- Points : relevé HACCP, une fois le matin et une fois le soir (correction de
-- Jérémy sur F3 du lot P2, 15.11.2026). Un relevé rapporte au plus deux fois
-- par jour et par zone, toutes personnes confondues : le matin (avant 15 h,
-- heure de Zurich) et le soir (dès 15 h), au lieu de la tranche de deux heures.
-- Plafond par personne inchangé (8 par jour). Le moment est celui de
-- l'enregistrement en base, jamais une heure saisie.
--
-- points_trg_haccp_releves garde sa signature ; points_moment_zurich est neuve.
-- Rejouable. Inverse : supabase/migrations-inverse/20261115_points_haccp_matin_soir.sql
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';

-- Matin avant 15 h, soir dès 15 h, heure de Zurich.
create or replace function public.points_moment_zurich(p_ts timestamptz)
returns text
language sql
stable
set search_path = public, pg_temp
as $fn$
  select case when extract(hour from p_ts at time zone 'Europe/Zurich') < 15 then 'matin' else 'soir' end
$fn$;

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
    -- Un crédit par (zone, jour de Zurich, matin ou soir), toutes personnes.
    perform public.points_verser(new.etablissement_id, new.operateur, 'releve_haccp', 'haccp_releves', new.id,
      coalesce(nullif(btrim(new.zone_id), ''), 'sans-zone') || ':' || public.points_jour_zurich() || ':'
        || public.points_moment_zurich(now()));
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

revoke execute on function public.points_moment_zurich(timestamptz) from public, anon, authenticated;
