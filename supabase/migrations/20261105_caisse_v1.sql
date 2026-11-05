-- ════════════════════════════════════════════════════════════════════════════
-- Module Caisse v1 - prise de commande en salle, bons a suivre, ventes directes.
--
-- Trois tables :
--   • caisse_tickets   : un ticket par table ouverte, ou sans table (vente
--                        directe au comptoir). Statuts : ouvert, encaisse, annule.
--   • caisse_lignes    : les articles du ticket. Le prix est COPIE au moment de
--                        la vente (prix_unitaire), jamais relu depuis plats :
--                        un changement de carte ne reecrit pas un ticket.
--   • caisse_paiements : l'encaissement (especes, carte, autre).
--
-- Bons vers le KDS : la caisse n'ecrit JAMAIS kds_orders / kds_order_items
-- depuis le client (leur seule surface d'ecriture client reste les RPC kds_*).
-- Elle passe par la RPC caisse_envoyer_bon (SECURITY DEFINER, plus bas), qui
-- cree un kds_order par envoi avec un ls_check_uuid prefixe « caisse: » :
-- aucune collision possible avec l'ingestion Lightspeed (pos-orders-poll),
-- dont les cles sont les uuid des checks Lightspeed.
--
-- Idempotence du double tap : la RPC verrouille le ticket (FOR UPDATE), ne
-- prend que les lignes en_attente de la suite demandee et les marque envoye
-- dans la meme transaction. Un second tap trouve zero ligne et ne cree aucun
-- bon. Chaque ligne envoyee porte en plus une cle unique cote KDS
-- (ls_line_key = 'caisse:' || ligne.id) : une ligne ne part qu'une fois.
--
-- Droits (miroir du front, permKey caisse) :
--   • lecture et ecriture : tout membre de l'etablissement
--     (user_can_access_etab, comme plats / recettes : la visibilite fine par
--     role vit dans la table permissions, cote front).
--   • annulation d'un ticket encaisse : consultant et patron seulement
--     (declencheur caisse_ticket_garde).
--   • un ticket encaisse ou annule est fige, lignes et paiements compris.
--
-- Heures : tout en UTC (timestamptz, now()) ; l'affichage Europe/Zurich est
-- l'affaire du front (zurichTime.js).
--
-- Migration additive (expand) : aucune table ni policy existante touchee.
-- Idempotente, rejouable sans erreur et sans effet au rejeu (aucun backfill).
-- RLS via les helpers versionnes user_can_access_etab(text) et
-- current_user_role() (cast auth.uid()::text encapsule). Rollback en fin.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. caisse_tickets
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.caisse_tickets (
  id               uuid        primary key default gen_random_uuid(),
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  -- null = vente directe (comptoir). set null : supprimer un meuble du plan
  -- ne supprime pas la piece de vente.
  table_id         text        references public.salle_tables(id) on delete set null,
  statut           text        not null default 'ouvert' check (statut in ('ouvert','encaisse','annule')),
  ouvert_par       text        references public.profiles(id),
  note             text,
  created_at       timestamptz not null default now(),
  closed_at        timestamptz,
  updated_at       timestamptz not null default now()
);

create index if not exists idx_caisse_tickets_etab    on public.caisse_tickets(etablissement_id);
create index if not exists idx_caisse_tickets_ouverts on public.caisse_tickets(etablissement_id) where statut = 'ouvert';
create index if not exists idx_caisse_tickets_table   on public.caisse_tickets(table_id);
create index if not exists idx_caisse_tickets_par     on public.caisse_tickets(ouvert_par);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. caisse_lignes
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.caisse_lignes (
  id            uuid        primary key default gen_random_uuid(),
  ticket_id     uuid        not null references public.caisse_tickets(id) on delete cascade,
  -- plat du catalogue, ou null pour un libelle libre. set null : supprimer un
  -- plat ne touche pas les tickets passes (le libelle et le prix sont copies).
  plat_id       text        references public.plats(id) on delete set null,
  libelle       text        not null,
  quantite      numeric     not null default 1 check (quantite > 0),
  prix_unitaire numeric     not null default 0 check (prix_unitaire >= 0),
  suite         int         not null default 1 check (suite between 1 and 9),
  note          text,       -- cuisson, sans gluten...
  statut        text        not null default 'en_attente' check (statut in ('en_attente','envoye','servi')),
  envoye_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_caisse_lignes_ticket on public.caisse_lignes(ticket_id);
create index if not exists idx_caisse_lignes_plat   on public.caisse_lignes(plat_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. caisse_paiements
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.caisse_paiements (
  id           uuid        primary key default gen_random_uuid(),
  ticket_id    uuid        not null references public.caisse_tickets(id) on delete cascade,
  moyen        text        not null check (moyen in ('especes','carte','autre')),
  montant      numeric     not null check (montant >= 0),
  encaisse_par text        references public.profiles(id),
  created_at   timestamptz not null default now()
);

create index if not exists idx_caisse_paiements_ticket on public.caisse_paiements(ticket_id);
create index if not exists idx_caisse_paiements_par    on public.caisse_paiements(encaisse_par);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. updated_at (set_updated_at() existe, versionne par 20260715_kds_orders)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace trigger trg_caisse_tickets_updated_at
  before update on public.caisse_tickets
  for each row execute function public.set_updated_at();

create or replace trigger trg_caisse_lignes_updated_at
  before update on public.caisse_lignes
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Gardes (declencheurs)
-- ─────────────────────────────────────────────────────────────────────────────
-- Ticket : nait ouvert, table du meme etablissement ; une fois encaisse il est
-- fige (seule l'annulation par consultant ou patron passe) ; un ticket annule
-- ne bouge plus. La mise a null de table_id (suppression du meuble, cascade)
-- reste permise sur un ticket fige.
create or replace function public.caisse_ticket_garde()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.statut = 'ouvert'
       or current_user_role() = any(array['consultant','patron']) then
      return old;
    end if;
    raise exception 'caisse: seul un ticket ouvert se supprime (direction pour le reste)';
  end if;

  if tg_op = 'INSERT' then
    if new.statut <> 'ouvert' then
      raise exception 'caisse: un ticket nait ouvert';
    end if;
    new.ouvert_par := coalesce(new.ouvert_par, auth.uid()::text);
  end if;

  -- La table designee appartient a l'etablissement du ticket. La verification
  -- passe par la RLS de salle_tables (fonction SECURITY INVOKER) : une table
  -- d'un autre etablissement est invisible, donc refusee.
  if new.table_id is not null
     and (tg_op = 'INSERT' or new.table_id is distinct from old.table_id) then
    if not exists (
      select 1 from public.salle_tables st
      where st.id = new.table_id and st.etablissement_id = new.etablissement_id
    ) then
      raise exception 'caisse: table inconnue pour cet etablissement';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.statut <> 'ouvert' then
    -- Ticket fige : rien ne bouge, hors l'annulation (direction) et la mise a
    -- null de table_id par la cascade du plan de salle.
    if new.etablissement_id <> old.etablissement_id
       or not (new.table_id is not distinct from old.table_id or new.table_id is null)
       or new.ouvert_par is distinct from old.ouvert_par
       or new.note is distinct from old.note
       or new.created_at <> old.created_at then
      raise exception 'caisse: ticket % fige', old.statut;
    end if;
    if new.statut is distinct from old.statut then
      if old.statut = 'encaisse' and new.statut = 'annule'
         and current_user_role() = any(array['consultant','patron']) then
        null; -- annulation par la direction
      else
        raise exception 'caisse: annulation d''un ticket encaisse reservee a la direction';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_caisse_ticket_garde on public.caisse_tickets;
create trigger trg_caisse_ticket_garde
  before insert or update or delete on public.caisse_tickets
  for each row execute function public.caisse_ticket_garde();

-- Lignes : ecrites tant que le ticket est ouvert. Une ligne envoyee garde son
-- contenu (le bon est deja en cuisine) : seuls son statut (envoye, servi) et
-- son ticket (fusion vers un autre ticket ouvert) changent encore ; elle ne
-- revient jamais en_attente et ne se supprime plus, direction exceptee.
create or replace function public.caisse_ligne_garde()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_statut     text;
  v_statut_new text;
begin
  -- Statut du ticket porteur. Pendant la cascade de suppression du ticket, la
  -- ligne parente n'existe plus : null = cascade, on laisse passer.
  select statut into v_statut from public.caisse_tickets where id = coalesce(old.ticket_id, new.ticket_id);

  if tg_op = 'DELETE' then
    if v_statut is null then return old; end if; -- cascade du ticket
    if v_statut <> 'ouvert' then
      raise exception 'caisse: ticket fige, lignes comprises';
    end if;
    if old.statut <> 'en_attente'
       and not (current_user_role() = any(array['consultant','patron'])) then
      raise exception 'caisse: ligne deja envoyee (retrait par la direction seulement)';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if v_statut is distinct from 'ouvert' then
      raise exception 'caisse: le ticket n''est pas ouvert';
    end if;
    if new.statut <> 'en_attente' then
      raise exception 'caisse: une ligne nait en attente';
    end if;
    return new;
  end if;

  -- UPDATE : le ticket d'origine et, en cas de fusion, le ticket cible
  -- doivent etre ouverts.
  if v_statut is distinct from 'ouvert' then
    raise exception 'caisse: ticket fige, lignes comprises';
  end if;
  if new.ticket_id is distinct from old.ticket_id then
    select statut into v_statut_new from public.caisse_tickets where id = new.ticket_id;
    if v_statut_new is distinct from 'ouvert' then
      raise exception 'caisse: fusion vers un ticket non ouvert';
    end if;
  end if;

  if old.statut <> 'en_attente' then
    -- Ligne envoyee ou servie : contenu fige, statut jamais rendu a en_attente.
    if new.plat_id is distinct from old.plat_id
       or new.libelle <> old.libelle
       or new.quantite <> old.quantite
       or new.prix_unitaire <> old.prix_unitaire
       or new.suite <> old.suite
       or new.note is distinct from old.note
       or new.statut not in ('envoye','servi') then
      if not (current_user_role() = any(array['consultant','patron'])) then
        raise exception 'caisse: ligne deja envoyee (correction par la direction seulement)';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_caisse_ligne_garde on public.caisse_lignes;
create trigger trg_caisse_ligne_garde
  before insert or update or delete on public.caisse_lignes
  for each row execute function public.caisse_ligne_garde();

-- Paiements : inseres sur un ticket ouvert (le front enregistre le paiement
-- puis passe le ticket encaisse), jamais modifies ; retires par la direction,
-- ou tant que le ticket est encore ouvert (tap corrige avant encaissement).
create or replace function public.caisse_paiement_garde()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_statut text;
begin
  if tg_op = 'UPDATE' then
    raise exception 'caisse: un paiement ne se modifie pas (le retirer et le ressaisir)';
  end if;

  select statut into v_statut from public.caisse_tickets where id = coalesce(old.ticket_id, new.ticket_id);

  if tg_op = 'INSERT' then
    if v_statut is distinct from 'ouvert' then
      raise exception 'caisse: le ticket n''est pas ouvert';
    end if;
    new.encaisse_par := coalesce(new.encaisse_par, auth.uid()::text);
    return new;
  end if;

  -- DELETE
  if v_statut is null then return old; end if; -- cascade du ticket
  if v_statut = 'ouvert'
     or current_user_role() = any(array['consultant','patron']) then
    return old;
  end if;
  raise exception 'caisse: paiement d''un ticket fige (direction seulement)';
end;
$$;

drop trigger if exists trg_caisse_paiement_garde on public.caisse_paiements;
create trigger trg_caisse_paiement_garde
  before insert or update or delete on public.caisse_paiements
  for each row execute function public.caisse_paiement_garde();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.caisse_tickets   enable row level security;
alter table public.caisse_lignes    enable row level security;
alter table public.caisse_paiements enable row level security;

drop policy if exists caisse_tickets_select on public.caisse_tickets;
create policy caisse_tickets_select on public.caisse_tickets
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists caisse_tickets_insert on public.caisse_tickets;
create policy caisse_tickets_insert on public.caisse_tickets
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (ouvert_par is null or ouvert_par = auth.uid()::text)
  );

drop policy if exists caisse_tickets_update on public.caisse_tickets;
create policy caisse_tickets_update on public.caisse_tickets
  for update to authenticated
  using (user_can_access_etab(etablissement_id))
  with check (user_can_access_etab(etablissement_id));

drop policy if exists caisse_tickets_delete on public.caisse_tickets;
create policy caisse_tickets_delete on public.caisse_tickets
  for delete to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists caisse_lignes_all on public.caisse_lignes;
create policy caisse_lignes_all on public.caisse_lignes
  for all to authenticated
  using (
    exists (
      select 1 from public.caisse_tickets t
      where t.id = ticket_id and user_can_access_etab(t.etablissement_id)
    )
  )
  with check (
    exists (
      select 1 from public.caisse_tickets t
      where t.id = ticket_id and user_can_access_etab(t.etablissement_id)
    )
  );

drop policy if exists caisse_paiements_all on public.caisse_paiements;
create policy caisse_paiements_all on public.caisse_paiements
  for all to authenticated
  using (
    exists (
      select 1 from public.caisse_tickets t
      where t.id = ticket_id and user_can_access_etab(t.etablissement_id)
    )
  )
  with check (
    exists (
      select 1 from public.caisse_tickets t
      where t.id = ticket_id and user_can_access_etab(t.etablissement_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RPC caisse_envoyer_bon - le seul pont caisse vers KDS
-- ─────────────────────────────────────────────────────────────────────────────
-- Cree UN kds_order par envoi, portant les lignes en_attente de la suite
-- demandee, puis marque ces lignes envoye. Le FOR UPDATE sur le ticket
-- serialise les doubles taps : le second appel trouve zero ligne et ne cree
-- rien. ls_check_uuid prefixe « caisse: » (pas de collision Lightspeed),
-- ls_line_key = 'caisse:' || ligne.id (une ligne ne part qu'une fois, meme
-- en cas de concurrence hors verrou).
-- SECURITY DEFINER : seule entree qui verifie elle-meme l'appartenance a
-- l'etablissement ; le nom de table est lu dans le meme etablissement
-- uniquement (pas de fuite d'un plan tiers via table_id).
create or replace function public.caisse_envoyer_bon(p_ticket_id uuid, p_suite int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket    public.caisse_tickets%rowtype;
  v_table_nom text;
  v_order_id  uuid;
  v_n         int;
  v_now       timestamptz := now();
begin
  if p_suite is null or p_suite < 1 or p_suite > 9 then
    raise exception 'caisse_envoyer_bon: suite invalide';
  end if;

  select * into v_ticket from public.caisse_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'caisse_envoyer_bon: ticket introuvable';
  end if;
  if not user_can_access_etab(v_ticket.etablissement_id) then
    raise exception 'caisse_envoyer_bon: acces refuse';
  end if;
  if v_ticket.statut <> 'ouvert' then
    raise exception 'caisse_envoyer_bon: ticket non ouvert';
  end if;

  if not exists (
    select 1 from public.caisse_lignes
    where ticket_id = p_ticket_id and suite = p_suite and statut = 'en_attente'
  ) then
    return jsonb_build_object('bon_id', null, 'lignes', 0);
  end if;

  select st.nom into v_table_nom
  from public.salle_tables st
  where st.id = v_ticket.table_id
    and st.etablissement_id = v_ticket.etablissement_id;

  insert into public.kds_orders (etablissement_id, ls_check_uuid, table_no, opened_at, status)
  values (
    v_ticket.etablissement_id,
    'caisse:' || p_ticket_id || ':' || p_suite || ':' || md5(v_now::text || p_ticket_id::text),
    coalesce(v_table_nom, 'Direct'),
    v_now,
    'open'
  )
  returning id into v_order_id;

  insert into public.kds_order_items (kds_order_id, ls_line_key, nom, qty, modifiers, fired_at)
  select
    v_order_id,
    'caisse:' || l.id,
    l.libelle,
    l.quantite,
    case when nullif(trim(l.note), '') is not null
      then jsonb_build_array(jsonb_build_object('name', l.note, 'quantity', 1))
      else '[]'::jsonb
    end,
    v_now
  from public.caisse_lignes l
  where l.ticket_id = p_ticket_id and l.suite = p_suite and l.statut = 'en_attente'
  on conflict (ls_line_key) do nothing;

  update public.caisse_lignes
     set statut = 'envoye', envoye_at = v_now
   where ticket_id = p_ticket_id and suite = p_suite and statut = 'en_attente';
  get diagnostics v_n = row_count;

  return jsonb_build_object('bon_id', v_order_id, 'lignes', v_n);
end;
$$;

revoke execute on function public.caisse_envoyer_bon(uuid, int) from public, anon;
grant  execute on function public.caisse_envoyer_bon(uuid, int) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Realtime (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'caisse_tickets'
  ) then
    alter publication supabase_realtime add table public.caisse_tickets;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'caisse_lignes'
  ) then
    alter publication supabase_realtime add table public.caisse_lignes;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (a executer manuellement si besoin) :
--
--   do $$
--   begin
--     if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='caisse_lignes')  then alter publication supabase_realtime drop table public.caisse_lignes;  end if;
--     if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='caisse_tickets') then alter publication supabase_realtime drop table public.caisse_tickets; end if;
--   end $$;
--   drop function if exists public.caisse_envoyer_bon(uuid, int);
--   drop table if exists public.caisse_paiements;
--   drop table if exists public.caisse_lignes;
--   drop table if exists public.caisse_tickets;
--   drop function if exists public.caisse_paiement_garde();
--   drop function if exists public.caisse_ligne_garde();
--   drop function if exists public.caisse_ticket_garde();
--   (les bons deja envoyes au KDS restent : ce sont des kds_orders ordinaires)
-- ════════════════════════════════════════════════════════════════════════════
