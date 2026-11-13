-- ================================================================
-- Rollback du lot C2b (20261113_appels.sql) : retire la tâche pg_cron, la
-- publication Realtime, les six fonctions et la table appels.
--
-- Refuse tant que le journal contient une ligne : c'est une donnée des
-- équipes. En urgence, passer outre en connaissance de cause, dans la même
-- transaction : set local app.rollback_vider_appels = 'oui'; puis ce fichier
-- (le journal est alors perdu). Aucun front ne doit plus appeler les
-- fonctions appel_* (C4 retiré ou jamais fusionné) avant de jouer ce fichier.
--
-- Rejouable : chaque retrait est conditionnel ; le contrôle des lignes passe
-- par une requête dynamique pour tourner aussi quand la table n'existe plus.
-- ================================================================

do $retour$
declare
  n bigint;
begin
  if to_regclass('public.appels') is not null then
    execute 'select count(*) from public.appels' into n;
    if n > 0 and coalesce(current_setting('app.rollback_vider_appels', true), '') <> 'oui' then
      raise exception 'rollback refusé : % appel(s) au journal (app.rollback_vider_appels = oui pour passer outre)', n;
    end if;
  end if;

  if exists (select 1 from cron.job where jobname = 'appels-balayage') then
    perform cron.unschedule('appels-balayage');
  end if;

  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appels'
  ) then
    alter publication supabase_realtime drop table public.appels;
  end if;
end
$retour$;

drop function if exists public.appel_lancer(text, text);
drop function if exists public.appel_repondre(uuid, text);
drop function if exists public.appel_refuser(uuid);
drop function if exists public.appel_terminer(uuid, text, boolean);
drop function if exists public.appel_battement(uuid);
drop function if exists public.appels_balayer(text[]);
drop table if exists public.appels;
