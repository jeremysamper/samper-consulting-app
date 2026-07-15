-- ════════════════════════════════════════════════════════════════════════════
-- Module KDS (Kitchen Display System) — ingestion des commandes Lightspeed.
--
-- Source : polling de l'endpoint Order API « Get All Open Checks »
--          GET /o/op/1/order/table/getCheck?businessLocationId=X  (scope orders-api)
--          declenche par l'ecran KDS toutes les ~15 s (aucun cron).
--
-- Modele :
--   kds_orders       = un check (table) ouvert cote Lightspeed.
--   kds_order_items  = une ligne de vente (salesEntries) du check.
--
-- Cle de diff (kds_order_items.ls_line_key) : IDENTITE stable de la ligne
--   = check_uuid || ':' || line_uuid.  Le timeOfTransactionUtc est stocke comme
--   donnee (fired_at), JAMAIS dans la cle : un timestamp mutable dans la cle
--   casserait le bump (une edition ressemblerait a une nouvelle ligne).
--   [A CONFIRMER PAR SONDE : si le uuid de ligne n'est pas stable entre deux
--    getCheck, basculer la cle sur line_number + timeOfTransactionUtc.]
--
-- Detection de changement : content_hash (cote edge function). Si le hash change
--   et que la ligne etait deja bumpee -> repasse en 'pending' (re-fire cuisine).
--
-- Annulation : active=false (la ligne reste, barree a l'ecran).
--   [A CONFIRMER PAR SONDE : annulation = active:false ou ligne disparue.]
--
-- Plats « a suivre » : getCheck n'expose PAS le cours -> l'etat « a suivre »
--   (plat tenu, relance a la prochaine suite) est LOCAL au KDS (colonne a_suivre),
--   jamais renseigne depuis Lightspeed.
--
-- Roles :
--   • lecture (SELECT)   : consultant, resp_cuisine, cuisinier
--   • bump / suite / fin (RPC) : kds_bump_item + kds_set_suite + kds_complete_order (consultant, resp_cuisine, cuisinier)
--   • ingestion          : service_role (edge function), bypass RLS
--   • patron, serveur, hote : aucun acces
--
-- Migration idempotente. RLS via helpers existants user_can_access_etab(text)
-- et current_user_role() (le cast auth.uid()::text y est deja encapsule).
-- Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. kds_orders — un check (table) ouvert
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.kds_orders (
  id               uuid        primary key default gen_random_uuid(),
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  ls_check_uuid    text        not null unique,   -- check.uuid (getCheck) ; cible onConflict
  table_no         text,       -- tableNumber
  couverts         int,        -- clientCount
  opened_at        timestamptz,-- openDate (UTC)
  status           text        not null default 'open' check (status in ('open','closed')), -- pilote par LS (absence de getCheck = closed)
  completed_at     timestamptz,-- termine MANUELLEMENT au passe ; independant du statut LS (le poll ne l'ecrase pas)
  completed_by     text        references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_kds_orders_etab on public.kds_orders(etablissement_id);
create index if not exists idx_kds_orders_open on public.kds_orders(etablissement_id) where status = 'open';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. kds_order_items — une ligne de vente du check (salesEntries)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.kds_order_items (
  id            uuid        primary key default gen_random_uuid(),
  kds_order_id  uuid        not null references public.kds_orders(id) on delete cascade,
  ls_line_key   text        not null unique,   -- check_uuid:line_uuid ; cible onConflict
  nom           text,       -- itemName
  sku           text,       -- itemSku
  qty           numeric,    -- quantity (numeric : items peses possibles)
  modifiers     jsonb       not null default '[]'::jsonb, -- modifiers[] {name, quantity}
  cours         text,       -- course : non peuple par getCheck aujourd'hui (colonne reservee)
  fired_at      timestamptz,-- timeOfTransactionUtc (UTC)
  active        boolean     not null default true, -- false = ligne annulee (barree a l'ecran)
  a_suivre      boolean     not null default false,-- true = plat tenu (« a suivre »), relance manuelle ; LOCAL (getCheck ne donne pas le cours)
  content_hash  text,       -- hash de {nom,sku,qty,modifiers,active} (detection de changement)
  bump_status   text        not null default 'pending' check (bump_status in ('pending','bumped')),
  bumped_at     timestamptz,
  bumped_by     text        references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_kds_order_items_order on public.kds_order_items(kds_order_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. updated_at triggers (reutilise set_updated_at() existant)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
-- create or replace efface le proconfig : re-epingler le search_path
-- (durcissement 20260712_i2, sinon l'advisor 0011 revient a chaque rejeu).
alter function public.set_updated_at() set search_path = public, pg_temp;

create or replace trigger trg_kds_orders_updated_at
  before update on public.kds_orders
  for each row execute function public.set_updated_at();

create or replace trigger trg_kds_order_items_updated_at
  before update on public.kds_order_items
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.kds_orders      enable row level security;
alter table public.kds_order_items enable row level security;

-- ── kds_orders : lecture seule cote client (ingestion = service_role) ──
drop policy if exists kds_orders_select on public.kds_orders;
create policy kds_orders_select on public.kds_orders
  for select to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and current_user_role() = any(array['consultant','resp_cuisine','cuisinier'])
  );

-- ── kds_order_items : lecture seule cote client, scope via la commande parente ──
drop policy if exists kds_order_items_select on public.kds_order_items;
create policy kds_order_items_select on public.kds_order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.kds_orders o
      where o.id = kds_order_id
        and user_can_access_etab(o.etablissement_id)
        and current_user_role() = any(array['consultant','resp_cuisine','cuisinier'])
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC de bump et de suite — seule surface d'ecriture client
--    (chaque RPC ne touche que ses propres colonnes)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.kds_bump_item(p_item_id uuid, p_bumped boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_etab text;
begin
  -- Resout l'etablissement de la ligne et verifie l'acces + le role de l'appelant.
  select o.etablissement_id into v_etab
  from public.kds_order_items i
  join public.kds_orders o on o.id = i.kds_order_id
  where i.id = p_item_id;

  if v_etab is null then
    raise exception 'kds_bump_item: ligne introuvable';
  end if;

  if not user_can_access_etab(v_etab)
     or not (current_user_role() = any(array['consultant','resp_cuisine','cuisinier'])) then
    raise exception 'kds_bump_item: acces refuse';
  end if;

  update public.kds_order_items
     set bump_status = case when p_bumped then 'bumped' else 'pending' end,
         bumped_at   = case when p_bumped then now() else null end,
         bumped_by   = case when p_bumped then auth.uid()::text else null end
   where id = p_item_id;
end;
$$;

revoke execute on function public.kds_bump_item(uuid, boolean) from public, anon;
grant  execute on function public.kds_bump_item(uuid, boolean) to authenticated;

-- Tenir un plat « a suivre » ou le relancer (a_suivre true/false). Meme garde.
create or replace function public.kds_set_suite(p_item_id uuid, p_a_suivre boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_etab text;
begin
  select o.etablissement_id into v_etab
  from public.kds_order_items i
  join public.kds_orders o on o.id = i.kds_order_id
  where i.id = p_item_id;

  if v_etab is null then
    raise exception 'kds_set_suite: ligne introuvable';
  end if;

  if not user_can_access_etab(v_etab)
     or not (current_user_role() = any(array['consultant','resp_cuisine','cuisinier'])) then
    raise exception 'kds_set_suite: acces refuse';
  end if;

  update public.kds_order_items set a_suivre = p_a_suivre where id = p_item_id;
end;
$$;

revoke execute on function public.kds_set_suite(uuid, boolean) from public, anon;
grant  execute on function public.kds_set_suite(uuid, boolean) to authenticated;

-- Terminer une commande au passe (ou la rouvrir). Independant du statut LS :
-- le poll continue d'ecrire status='open' mais ne touche jamais completed_at,
-- donc une commande terminee reste hors du passe meme si le check est encore ouvert.
create or replace function public.kds_complete_order(p_order_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_etab text;
begin
  select etablissement_id into v_etab from public.kds_orders where id = p_order_id;

  if v_etab is null then
    raise exception 'kds_complete_order: commande introuvable';
  end if;

  if not user_can_access_etab(v_etab)
     or not (current_user_role() = any(array['consultant','resp_cuisine','cuisinier'])) then
    raise exception 'kds_complete_order: acces refuse';
  end if;

  update public.kds_orders
     set completed_at = case when p_done then now() else null end,
         completed_by = case when p_done then auth.uid()::text else null end
   where id = p_order_id;
end;
$$;

revoke execute on function public.kds_complete_order(uuid, boolean) from public, anon;
grant  execute on function public.kds_complete_order(uuid, boolean) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Realtime — ajout a la publication (idempotent) + replica identity full
--    (full : le client recoit l'ancien bump_status sur les UPDATE realtime)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.kds_order_items replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kds_orders'
  ) then
    alter publication supabase_realtime add table public.kds_orders;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kds_order_items'
  ) then
    alter publication supabase_realtime add table public.kds_order_items;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (a executer manuellement si besoin) :
--
--   do $$
--   begin
--     if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='kds_order_items') then alter publication supabase_realtime drop table public.kds_order_items; end if;
--     if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='kds_orders')      then alter publication supabase_realtime drop table public.kds_orders;      end if;
--   end $$;
--   drop function if exists public.kds_complete_order(uuid, boolean);
--   drop function if exists public.kds_set_suite(uuid, boolean);
--   drop function if exists public.kds_bump_item(uuid, boolean);
--   drop table if exists public.kds_order_items;
--   drop table if exists public.kds_orders;
-- ════════════════════════════════════════════════════════════════════════════
