-- ════════════════════════════════════════════════════════════════════════════
-- Caisse v4 - categories de caisse, rangement des produits, reglages par maison.
--
--   caisse_categories : les categories de la grille, propres a la maison
--     (nom, ordre, couleur et picto en CLES comme caisse_boutons, actif).
--     Aucune ligne semee : tant que la maison n'a rien regle, le front montre
--     les categories par defaut du code (src/modules/caisse/categories.js).
--   caisse_boutons    : + categorie_id (rattachement du produit) et ordre
--     (rang du produit dans sa categorie). plats.categorie n'est JAMAIS ecrit
--     par la caisse : c'est la donnee de Cartes & Recettes.
--   caisse_reglages   : une ligne par etablissement, config jsonb (modes,
--     cuissons, sans_rapides, moyens_paiement, grille). Le front fusionne
--     config sur les defauts du code : une cle absente = defaut.
--   caisse_paiements  : + libelle (nom du moyen de paiement tel que la maison
--     l'a regle, par exemple « TWINT »). La colonne moyen garde ses trois
--     familles (especes, carte, autre) et sa contrainte : rien ne change pour
--     le front deja en ligne, qui n'envoie pas libelle.
--
-- Droits : lecture pour tout membre de l'etablissement ; ecriture des
-- categories et des reglages pour consultant, patron, resp_cuisine (meme garde
-- current_user_role() que caisse_boutons, v3). La categorie d'un bouton
-- appartient a l'etablissement du bouton (declencheur caisse_bouton_garde
-- etendu, lecture sous la RLS de caisse_categories : une categorie d'un autre
-- etablissement est invisible, donc refusee). Une categorie ne change pas
-- d'etablissement.
--
-- Migration additive (expand), idempotente, sans aucune donnee ecrite : sans
-- effet au rejeu, y compris apres des reglages saisis.
-- Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. caisse_categories
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.caisse_categories (
  id               uuid        primary key default gen_random_uuid(),
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  nom              text        not null check (btrim(nom) <> '' and char_length(nom) <= 40),
  ordre            int         not null default 0,
  couleur          text        check (couleur is null or couleur in
                               ('rouge','orange','jaune','vert','turquoise','bleu','violet','rose')),
  picto            text        check (picto is null or picto in
                               ('croissant','ble','feuille','cloche','gateau','verre','cadeau','eclair')),
  actif            boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Porte aussi l'index de la cle etrangere etablissement_id (colonne de tete).
  constraint caisse_categories_etab_nom_key unique (etablissement_id, nom)
);

create or replace trigger trg_caisse_categories_updated_at
  before update on public.caisse_categories
  for each row execute function public.set_updated_at();

-- Une categorie reste dans son etablissement : sans cette garde, un compte
-- rattache a deux maisons pourrait la deplacer et laisser des boutons pointer
-- vers une categorie d'une autre maison.
create or replace function public.caisse_categorie_garde()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.etablissement_id is distinct from old.etablissement_id then
    raise exception 'caisse: une categorie ne change pas d''etablissement';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_caisse_categorie_garde on public.caisse_categories;
create trigger trg_caisse_categorie_garde
  before update on public.caisse_categories
  for each row execute function public.caisse_categorie_garde();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. caisse_boutons : rattachement et rang du produit
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.caisse_boutons
  add column if not exists categorie_id uuid references public.caisse_categories(id) on delete set null;
alter table public.caisse_boutons
  add column if not exists ordre int;

create index if not exists idx_caisse_boutons_categorie on public.caisse_boutons(categorie_id);

-- Garde v3 etendue : le plat ET la categorie appartiennent a l'etablissement
-- de la ligne. (La mise a null de categorie_id par la cascade passe : seule
-- une categorie non nulle est verifiee.)
create or replace function public.caisse_bouton_garde()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' or new.plat_id is distinct from old.plat_id
     or new.etablissement_id is distinct from old.etablissement_id then
    if not exists (
      select 1 from public.plats p
      where p.id = new.plat_id and p.etablissement_id = new.etablissement_id
    ) then
      raise exception 'caisse: plat inconnu pour cet etablissement';
    end if;
  end if;
  if new.categorie_id is not null
     and (tg_op = 'INSERT' or new.categorie_id is distinct from old.categorie_id
          or new.etablissement_id is distinct from old.etablissement_id) then
    if not exists (
      select 1 from public.caisse_categories c
      where c.id = new.categorie_id and c.etablissement_id = new.etablissement_id
    ) then
      raise exception 'caisse: categorie inconnue pour cet etablissement';
    end if;
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. caisse_reglages
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.caisse_reglages (
  etablissement_id text        primary key references public.etablissements(id) on delete cascade,
  config           jsonb       not null default '{}'::jsonb
                               check (jsonb_typeof(config) = 'object' and octet_length(config::text) <= 20000),
  updated_at       timestamptz not null default now()
);

create or replace trigger trg_caisse_reglages_updated_at
  before update on public.caisse_reglages
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. caisse_paiements : nom du moyen regle par la maison
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.caisse_paiements
  add column if not exists libelle text check (libelle is null or char_length(libelle) <= 40);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.caisse_categories enable row level security;
alter table public.caisse_reglages   enable row level security;

revoke all on public.caisse_categories from anon;
revoke all on public.caisse_reglages   from anon;

drop policy if exists caisse_categories_select on public.caisse_categories;
create policy caisse_categories_select on public.caisse_categories
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists caisse_categories_insert on public.caisse_categories;
create policy caisse_categories_insert on public.caisse_categories
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  );

drop policy if exists caisse_categories_update on public.caisse_categories;
create policy caisse_categories_update on public.caisse_categories
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  );

drop policy if exists caisse_categories_delete on public.caisse_categories;
create policy caisse_categories_delete on public.caisse_categories
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  );

drop policy if exists caisse_reglages_select on public.caisse_reglages;
create policy caisse_reglages_select on public.caisse_reglages
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists caisse_reglages_insert on public.caisse_reglages;
create policy caisse_reglages_insert on public.caisse_reglages
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  );

drop policy if exists caisse_reglages_update on public.caisse_reglages;
create policy caisse_reglages_update on public.caisse_reglages
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  );

drop policy if exists caisse_reglages_delete on public.caisse_reglages;
create policy caisse_reglages_delete on public.caisse_reglages
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Realtime (idempotent) : la grille se recharge quand la direction regle
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['caisse_categories', 'caisse_reglages', 'caisse_boutons'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

comment on table public.caisse_categories is 'Caisse v4 : categories de la grille, propres a la maison. Ecriture consultant, patron, resp_cuisine.';
comment on table public.caisse_reglages   is 'Caisse v4 : reglages par etablissement (config jsonb fusionnee sur les defauts du front).';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (a executer manuellement si besoin, front v4 retire d'abord) :
--
--   do $$
--   declare t text;
--   begin
--     foreach t in array array['caisse_categories', 'caisse_reglages', 'caisse_boutons'] loop
--       if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
--         execute format('alter publication supabase_realtime drop table public.%I', t);
--       end if;
--     end loop;
--   end $$;
--   alter table public.caisse_paiements drop column if exists libelle;
--   drop index if exists public.idx_caisse_boutons_categorie;
--   alter table public.caisse_boutons drop column if exists categorie_id;
--   alter table public.caisse_boutons drop column if exists ordre;
--   -- puis rejouer la fonction caisse_bouton_garde de 20261106_caisse_v3_boutons.sql
--   drop table if exists public.caisse_reglages;
--   drop table if exists public.caisse_categories;
--   drop function if exists public.caisse_categorie_garde();
-- ════════════════════════════════════════════════════════════════════════════
