-- Inverse de 20261115_points_indicateurs (P3), à jouer seulement si la
-- production casse. Un seul passage, dans cet ordre :
--   1. jouer tel quel supabase/migrations/20261115_points_anti_fuite.sql (P2,
--      rejouable : points_verser et points_trg_inventaires reprennent leur
--      corps sans le contrôle des jours au planning, le barème par défaut perd
--      le pointage à l'heure) ;
--   2. jouer tel quel supabase/migrations/20261115_points_haccp_matin_soir.sql
--      (le relevé HACCP revient au matin et au soir, que P2 rejoué a remis en
--      tranches de deux heures) ;
--   3. jouer ce fichier.
-- Les crédits de pointage déjà versés restent au registre ; l'index sur shifts
-- reste (il ne gêne rien).

set local lock_timeout = '3s';

-- Garde d'abord : rien n'est retiré tant que P2 n'est pas rejoué.
do $garde$
begin
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('points_verser', 'points_trg_inventaires')
      and prosrc like '%points_programme%'
  ) then
    raise exception 'Jouer d''abord 20261115_points_anti_fuite.sql puis 20261115_points_haccp_matin_soir.sql, puis ce fichier';
  end if;
end $garde$;

drop trigger if exists trg_points_shifts_maj on public.shifts;
drop trigger if exists trg_points_shifts_sup on public.shifts;
drop function if exists public.points_trg_shifts();
drop function if exists public.points_indicateurs(text);
drop function if exists public.points_programme(text, text, date);
