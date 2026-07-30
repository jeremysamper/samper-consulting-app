-- ════════════════════════════════════════════════════════════════
-- Cache partagé des traductions FR → EN (mode « English »).
--
-- Sans lui, chaque appareil retraduisait les mêmes phrases pour son propre
-- compte : la tablette du passe, le téléphone du chef et celui de chaque
-- cuisinier payaient trois fois la même première passe.
--
-- Scopé par établissement, et pas global : la table contient des noms de
-- recettes, donc de la donnée client. Le scope reprend exactement le motif
-- déjà en place sur recettes et pertes (user_can_access_etab).
-- ════════════════════════════════════════════════════════════════

create table if not exists public.traductions (
  id               uuid primary key default gen_random_uuid(),
  etablissement_id text not null,
  langue           text not null default 'en',
  source           text not null,
  cible            text not null,
  -- Le texte source peut être long (une étape de recette). Un index btree sur
  -- le texte brut dépasserait la taille de ligne maximale : on indexe son md5.
  source_hash      text generated always as (md5(source)) stored,
  created_at       timestamptz not null default now()
);

create unique index if not exists traductions_unique_source
  on public.traductions (etablissement_id, langue, source_hash);

-- Sert la synchro incrémentale : « donne-moi ce qui est arrivé depuis ma
-- dernière visite » plutôt que de retélécharger tout le cache.
create index if not exists traductions_sync
  on public.traductions (etablissement_id, langue, created_at);

alter table public.traductions enable row level security;

drop policy if exists traductions_select on public.traductions;
create policy traductions_select on public.traductions
  for select using (user_can_access_etab(etablissement_id));

drop policy if exists traductions_insert on public.traductions;
create policy traductions_insert on public.traductions
  for insert with check (user_can_access_etab(etablissement_id));

drop policy if exists traductions_update on public.traductions;
create policy traductions_update on public.traductions
  for update using (user_can_access_etab(etablissement_id))
  with check (user_can_access_etab(etablissement_id));

drop policy if exists traductions_delete on public.traductions;
create policy traductions_delete on public.traductions
  for delete using (user_can_access_etab(etablissement_id));
