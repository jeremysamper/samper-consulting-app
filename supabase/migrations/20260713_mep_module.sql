-- ════════════════════════════════════════════════════════════════════════════
-- Module Mise en place - listes de production qui separent la grosse production
-- (preparations congelables, produites en avance et en volume) des preparations
-- urgentes (non congelables, produites au plus pres du service).
--
-- Regle metier : congelable = true  -> grosse production (batch jours calmes)
--                congelable = false -> urgent J-1/J-0 (en tete de liste)
--                congelable = null  -> recette non qualifiee, traitee comme
--                                      NON congelable (choix prudent), signalee
--                                      « a qualifier » cote UI.
--
-- Roles (matrice) :
--   • lecture  : consultant, patron, resp_cuisine, cuisinier
--   • ecriture : consultant, resp_cuisine, cuisinier   (patron = lecture seule)
--   • serveur, hote : aucun acces
--
-- Migration idempotente. RLS via helpers existants user_can_access_etab(text)
-- et current_user_role(). profiles.id est TEXT : le cast auth.uid()::text est
-- deja encapsule dans user_can_access_etab / current_user_role.
-- Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Flag congelation sur les recettes (nullable = « a qualifier »)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.recettes add column if not exists congelable boolean;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. mep_listes - une liste de mise en place par date de service
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.mep_listes (
  id               uuid        primary key default gen_random_uuid(),
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  nom              text        not null,
  date_service     date,
  created_by       text,       -- profiles.id (TEXT)
  created_at       timestamptz not null default now()
);
create index if not exists idx_mep_listes_etab on public.mep_listes(etablissement_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. mep_items - une ligne = une preparation (recette de base OU ajout manuel)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.mep_items (
  id          uuid        primary key default gen_random_uuid(),
  liste_id    uuid        not null references public.mep_listes(id) on delete cascade,
  recette_id  text        references public.recettes(id) on delete set null,  -- null = ajout manuel
  label       text,       -- libelle libre pour les items manuels
  quantite    numeric,
  unite       text,
  congelable  boolean,    -- copie de la recette a l'ajout, modifiable sur l'item
  fait        boolean     not null default false,
  fait_par    text,       -- profiles.id (TEXT)
  fait_at     timestamptz,-- UTC
  ordre       int         default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_mep_items_liste   on public.mep_items(liste_id);
create index if not exists idx_mep_items_recette on public.mep_items(recette_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.mep_listes enable row level security;
alter table public.mep_items  enable row level security;

-- ── mep_listes ──
drop policy if exists mep_listes_select on public.mep_listes;
create policy mep_listes_select on public.mep_listes
  for select to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and current_user_role() = any(array['consultant','patron','resp_cuisine','cuisinier'])
  );

drop policy if exists mep_listes_insert on public.mep_listes;
create policy mep_listes_insert on public.mep_listes
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and current_user_role() = any(array['consultant','resp_cuisine','cuisinier'])
  );

drop policy if exists mep_listes_update on public.mep_listes;
create policy mep_listes_update on public.mep_listes
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and current_user_role() = any(array['consultant','resp_cuisine','cuisinier'])
  )
  with check (
    user_can_access_etab(etablissement_id)
    and current_user_role() = any(array['consultant','resp_cuisine','cuisinier'])
  );

drop policy if exists mep_listes_delete on public.mep_listes;
create policy mep_listes_delete on public.mep_listes
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and current_user_role() = any(array['consultant','resp_cuisine','cuisinier'])
  );

-- ── mep_items (herite l'acces et le scoping via la liste parente) ──
drop policy if exists mep_items_select on public.mep_items;
create policy mep_items_select on public.mep_items
  for select to authenticated
  using (
    exists (
      select 1 from public.mep_listes l
      where l.id = liste_id
        and user_can_access_etab(l.etablissement_id)
        and current_user_role() = any(array['consultant','patron','resp_cuisine','cuisinier'])
    )
  );

drop policy if exists mep_items_insert on public.mep_items;
create policy mep_items_insert on public.mep_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.mep_listes l
      where l.id = liste_id
        and user_can_access_etab(l.etablissement_id)
        and current_user_role() = any(array['consultant','resp_cuisine','cuisinier'])
    )
  );

drop policy if exists mep_items_update on public.mep_items;
create policy mep_items_update on public.mep_items
  for update to authenticated
  using (
    exists (
      select 1 from public.mep_listes l
      where l.id = liste_id
        and user_can_access_etab(l.etablissement_id)
        and current_user_role() = any(array['consultant','resp_cuisine','cuisinier'])
    )
  )
  with check (
    exists (
      select 1 from public.mep_listes l
      where l.id = liste_id
        and user_can_access_etab(l.etablissement_id)
        and current_user_role() = any(array['consultant','resp_cuisine','cuisinier'])
    )
  );

drop policy if exists mep_items_delete on public.mep_items;
create policy mep_items_delete on public.mep_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.mep_listes l
      where l.id = liste_id
        and user_can_access_etab(l.etablissement_id)
        and current_user_role() = any(array['consultant','resp_cuisine','cuisinier'])
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Realtime - ajout a la publication (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mep_listes'
  ) then
    alter publication supabase_realtime add table public.mep_listes;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mep_items'
  ) then
    alter publication supabase_realtime add table public.mep_items;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (a executer manuellement si besoin) :
--
--   do $$
--   begin
--     if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='mep_items')   then alter publication supabase_realtime drop table public.mep_items;   end if;
--     if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='mep_listes')  then alter publication supabase_realtime drop table public.mep_listes;  end if;
--   end $$;
--   drop table if exists public.mep_items;
--   drop table if exists public.mep_listes;
--   alter table public.recettes drop column if exists congelable;
-- ════════════════════════════════════════════════════════════════════════════
