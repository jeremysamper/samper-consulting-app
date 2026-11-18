-- Temps gagné : une ligne par geste que l'app a fait à la place de quelqu'un
-- (une fiche importée au lieu d'être tapée, une semaine de planning copiée,
-- une passation préparée, etc.). Le tableau de bord du patron en tire le temps
-- gagné de la semaine, avec un barème prudent écrit dans le front
-- (src/services/tempsGagneBareme.js) : la table ne garde aucune durée, seulement
-- le geste et son nombre, pour que le barème reste lisible et corrigeable.
--
-- Accès :
--   insertion : tout membre actif de l'établissement, pour lui-même ;
--   lecture   : consultant et patron de l'établissement ;
--   ni modification ni suppression par l'API (un compteur ne se retouche pas).
--
-- Expand seulement : table neuve, aucune table lue par le front en ligne n'est
-- touchée. Rejouable. Rollback : 20261118_temps_gagne.rollback.sql.

set local lock_timeout = '5s';

create table if not exists public.temps_gagne (
  id uuid primary key default gen_random_uuid(),
  etablissement_id text not null references public.etablissements(id) on delete cascade,
  geste text not null check (geste ~ '^[a-z][a-z0-9_]{1,39}$'),
  quantite integer not null default 1 check (quantite between 1 and 500),
  fait_par text not null default (auth.uid())::text,
  created_at timestamptz not null default now()
);

comment on table public.temps_gagne is
  'Gestes faits par l''app à la place de l''équipe. Durée par geste : barème du front (tempsGagneBareme.js), jamais stockée.';

create index if not exists temps_gagne_etab_date_idx
  on public.temps_gagne (etablissement_id, created_at desc);

alter table public.temps_gagne enable row level security;

revoke all on table public.temps_gagne from public, anon, authenticated;
grant select, insert on table public.temps_gagne to authenticated;

drop policy if exists temps_gagne_select on public.temps_gagne;
drop policy if exists temps_gagne_insert on public.temps_gagne;

create policy temps_gagne_select on public.temps_gagne
  for select to authenticated
  using (
    public.user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron')
  );

create policy temps_gagne_insert on public.temps_gagne
  for insert to authenticated
  with check (
    public.user_can_access_etab(etablissement_id)
    and fait_par = (select auth.uid())::text
  );
