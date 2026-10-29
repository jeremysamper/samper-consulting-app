-- ════════════════════════════════════════════════════════════════════════════
-- 20261030_demarrage : mise en route d'un établissement (lot LD).
--
-- demarrage_etapes : une ligne par étape faite (établissement, recettes,
-- catalogue, planning, exemple) et la ligne « termine » qui fait disparaître
-- la carte « Mise en route » du tableau de bord. Les établissements en service
-- reçoivent leur ligne « termine » ici, avant le front : aucun ne voit la carte.
--
-- donnees_exemple : le registre des lignes d'exemple chargées par la page de
-- mise en route (recettes, carte, produits). L'effacement ne supprime que les
-- ids inscrits ici, jamais par un filtre de nom. Aucune colonne n'est ajoutée
-- aux tables métier.
--
-- Accès : consultant et patron de l'établissement (profil actif), lecture et
-- écriture ; les autres rôles et anon n'ont rien.
--
-- Rejouable. Rollback : 20261030_demarrage.rollback.sql, à côté.
-- ════════════════════════════════════════════════════════════════════════════

-- La clé étrangère pose un verrou bref sur etablissements.
set local lock_timeout = '5s';

create table if not exists public.demarrage_etapes (
  etablissement_id text not null references public.etablissements(id) on delete cascade,
  etape text not null check (etape in ('etablissement', 'recettes', 'catalogue', 'planning', 'exemple', 'termine')),
  fait_le timestamptz not null default now(),
  fait_par text default (auth.uid())::text,
  primary key (etablissement_id, etape)
);

create table if not exists public.donnees_exemple (
  etablissement_id text not null references public.etablissements(id) on delete cascade,
  table_cible text not null check (table_cible in ('recettes', 'cartes', 'produits')),
  ligne_id text not null,
  created_at timestamptz not null default now(),
  primary key (table_cible, ligne_id),
  -- Seuls les ids d'exemple de l'établissement s'inscrivent : « Effacer
  -- l'exemple » ne peut viser ni une vraie fiche ni un autre établissement.
  constraint donnees_exemple_ligne_ck check (starts_with(ligne_id, 'exemple-' || etablissement_id || '-'))
);

create index if not exists donnees_exemple_etablissement_id_idx on public.donnees_exemple (etablissement_id);

alter table public.demarrage_etapes enable row level security;
alter table public.donnees_exemple enable row level security;

revoke all on table public.demarrage_etapes from public, anon, authenticated;
revoke all on table public.donnees_exemple from public, anon, authenticated;
grant select, insert, update, delete on table public.demarrage_etapes to authenticated;
grant select, insert, update, delete on table public.donnees_exemple to authenticated;

drop policy if exists demarrage_etapes_select on public.demarrage_etapes;
drop policy if exists demarrage_etapes_insert on public.demarrage_etapes;
drop policy if exists demarrage_etapes_update on public.demarrage_etapes;
drop policy if exists demarrage_etapes_delete on public.demarrage_etapes;

create policy demarrage_etapes_select on public.demarrage_etapes for select to authenticated
  using (public.user_can_access_etab(etablissement_id) and (select public.current_user_role()) in ('consultant', 'patron'));
-- fait_par : la personne connectée à l'insertion. L'upsert des étapes fusionne
-- sur conflit et garde la première personne : pas de garde à l'update.
create policy demarrage_etapes_insert on public.demarrage_etapes for insert to authenticated
  with check (public.user_can_access_etab(etablissement_id) and (select public.current_user_role()) in ('consultant', 'patron')
    and (fait_par is null or fait_par = (select auth.uid())::text));
create policy demarrage_etapes_update on public.demarrage_etapes for update to authenticated
  using (public.user_can_access_etab(etablissement_id) and (select public.current_user_role()) in ('consultant', 'patron'))
  with check (public.user_can_access_etab(etablissement_id) and (select public.current_user_role()) in ('consultant', 'patron'));
create policy demarrage_etapes_delete on public.demarrage_etapes for delete to authenticated
  using (public.user_can_access_etab(etablissement_id) and (select public.current_user_role()) in ('consultant', 'patron'));

drop policy if exists donnees_exemple_select on public.donnees_exemple;
drop policy if exists donnees_exemple_insert on public.donnees_exemple;
drop policy if exists donnees_exemple_update on public.donnees_exemple;
drop policy if exists donnees_exemple_delete on public.donnees_exemple;

create policy donnees_exemple_select on public.donnees_exemple for select to authenticated
  using (public.user_can_access_etab(etablissement_id) and (select public.current_user_role()) in ('consultant', 'patron'));
create policy donnees_exemple_insert on public.donnees_exemple for insert to authenticated
  with check (public.user_can_access_etab(etablissement_id) and (select public.current_user_role()) in ('consultant', 'patron'));
create policy donnees_exemple_update on public.donnees_exemple for update to authenticated
  using (public.user_can_access_etab(etablissement_id) and (select public.current_user_role()) in ('consultant', 'patron'))
  with check (public.user_can_access_etab(etablissement_id) and (select public.current_user_role()) in ('consultant', 'patron'));
create policy donnees_exemple_delete on public.donnees_exemple for delete to authenticated
  using (public.user_can_access_etab(etablissement_id) and (select public.current_user_role()) in ('consultant', 'patron'));

-- Établissements en service : mise en route déjà faite. Seulement à la
-- première application (table vide) : rejouée plus tard, la migration ne
-- termine pas la mise en route d'un établissement créé entre-temps.
insert into public.demarrage_etapes (etablissement_id, etape, fait_par)
select e.id, 'termine', null
  from public.etablissements e
 where not exists (select 1 from public.demarrage_etapes)
on conflict do nothing;
