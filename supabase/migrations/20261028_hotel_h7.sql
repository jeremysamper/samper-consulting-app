-- ════════════════════════════════════════════════════════════════════════════
-- Branche Hôtel, lot H7 : restauration liée au séjour
-- ───────────────────────────────────────────────────────────────────────────
-- Deux tables neuves, expand only :
--   room_service_commandes  une commande d'un séjour : articles (libellé,
--                           quantité, prix), total calculé en base, statut
--                           reçue, en cuisine, livrée, annulée, heure
--                           souhaitée, note, livrée par et quand, portée ou
--                           non sur la note de séjour.
--   sejour_liens            ce qu'un séjour a réservé au restaurant : une
--                           réservation de table (reservations) ou un groupe
--                           (groupe_evenements), relié sans rien déplacer.
-- Les couverts des repas (petit-déjeuner, déjeuner, dîner) se calculent à
-- l'écran d'après la pension des séjours : aucune table.
--
-- Section 0 : le garde-fou de suppression des séjours (lot H5) couvre aussi
-- les commandes et les liens.
--
-- Droits : toute l'équipe lit et prend une commande, fait avancer son statut ;
-- modifier les articles ou supprimer demande la case Modifier de Repas hôtel
-- (consultant, patron, responsable de cuisine, réception, serveur) ; relier
-- une réservation ou un groupe à un séjour demande la case Modifier
-- d'Hébergement. anon exclu : aucune policy.
-- Idempotente. Inverse : migrations-inverse/20261028_hotel_h7.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.room_service_commandes (
  id                  uuid        primary key default gen_random_uuid(),
  etablissement_id    text        not null references public.etablissements(id) on delete cascade,
  sejour_id           uuid        not null references public.sejours(id) on delete cascade,
  chambre_id          uuid        references public.chambres(id) on delete set null,
  articles            jsonb       not null default '[]'::jsonb check (jsonb_typeof(articles) = 'array'),
  total               numeric(10,2) not null default 0 check (total >= 0),
  statut              text        not null default 'recue' check (statut in ('recue', 'en_cuisine', 'livree', 'annulee')),
  souhaite_a          timestamptz,
  note                text,
  portee_sur_note     boolean     not null default false,
  created_by          text        references public.profiles(id) on delete set null,
  livree_par          text        references public.profiles(id) on delete set null,
  livree_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_room_service_etab_created on public.room_service_commandes(etablissement_id, created_at desc);
create index if not exists idx_room_service_sejour on public.room_service_commandes(sejour_id);
create index if not exists idx_room_service_chambre on public.room_service_commandes(chambre_id);
create index if not exists idx_room_service_created_by on public.room_service_commandes(created_by);
create index if not exists idx_room_service_livree_par on public.room_service_commandes(livree_par);

create table if not exists public.sejour_liens (
  id                  uuid        primary key default gen_random_uuid(),
  etablissement_id    text        not null references public.etablissements(id) on delete cascade,
  sejour_id           uuid        not null references public.sejours(id) on delete cascade,
  type                text        not null check (type in ('reservation', 'groupe')),
  cible_id            text        not null,
  created_by          text        references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  constraint uq_sejour_liens unique (sejour_id, type, cible_id)
);
create index if not exists idx_sejour_liens_etab on public.sejour_liens(etablissement_id);
create index if not exists idx_sejour_liens_cible on public.sejour_liens(type, cible_id);
create index if not exists idx_sejour_liens_created_by on public.sejour_liens(created_by);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Déclencheurs
-- ─────────────────────────────────────────────────────────────────────────────
create or replace trigger trg_room_service_updated_at
  before update on public.room_service_commandes
  for each row execute function public.set_updated_at();

-- Cohérence : établissement fixe ; séjour, chambre et cible du même
-- établissement ; articles bien formés et total calculé en base ; livrée par
-- et quand posés au passage à livrée ; hors case Modifier de Repas hôtel, une
-- commande ne change que de statut et de note ; auteur immuable.
create or replace function public.hotel_h7_coherence()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  a jsonb;
  somme numeric := 0;
  q numeric;
  p numeric;
begin
  if tg_op = 'UPDATE' and new.etablissement_id <> old.etablissement_id then
    raise exception 'ETABLISSEMENT_FIXE: une ligne ne change pas d''établissement' using errcode = '23514';
  end if;
  if not exists (select 1 from public.sejours s where s.id = new.sejour_id and s.etablissement_id = new.etablissement_id) then
    raise exception 'SEJOUR_INCONNU: le séjour n''appartient pas à cet établissement' using errcode = '23503';
  end if;

  if tg_table_name = 'sejour_liens' then
    if new.type = 'reservation' and not exists (select 1 from public.reservations r where r.id = new.cible_id and r.etablissement_id = new.etablissement_id) then
      raise exception 'RESERVATION_INCONNUE: la réservation n''appartient pas à cet établissement' using errcode = '23503';
    end if;
    if new.type = 'groupe' and not exists (select 1 from public.groupe_evenements g where g.id = new.cible_id and g.etablissement_id = new.etablissement_id) then
      raise exception 'GROUPE_INCONNU: le groupe n''appartient pas à cet établissement' using errcode = '23503';
    end if;
    if tg_op = 'INSERT' and (select auth.uid()) is not null then
      new.created_by := (select auth.uid())::text;
    end if;
    return new;
  end if;

  -- room_service_commandes
  if new.chambre_id is not null and not exists (select 1 from public.chambres c where c.id = new.chambre_id and c.etablissement_id = new.etablissement_id) then
    raise exception 'CHAMBRE_INCONNUE: la chambre n''appartient pas à cet établissement' using errcode = '23503';
  end if;
  for a in select * from jsonb_array_elements(new.articles) loop
    if jsonb_typeof(a) <> 'object' or btrim(coalesce(a->>'libelle', '')) = '' then
      raise exception 'ARTICLE_INVALIDE: chaque article porte un libellé' using errcode = '23514';
    end if;
    if coalesce(a->>'quantite', '1') !~ '^[0-9]+(\.[0-9]+)?$' or coalesce(a->>'prix', '0') !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'ARTICLE_INVALIDE: quantité et prix sont des nombres positifs' using errcode = '23514';
    end if;
    q := coalesce((a->>'quantite')::numeric, 1);
    p := coalesce((a->>'prix')::numeric, 0);
    if q <= 0 or p < 0 then
      raise exception 'ARTICLE_INVALIDE: quantité positive et prix non négatif' using errcode = '23514';
    end if;
    somme := somme + q * p;
  end loop;
  new.total := round(somme, 2);
  if new.portee_sur_note and new.statut <> 'livree' then
    raise exception 'COMMANDE_NON_LIVREE: une commande se porte sur la note une fois livrée' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then new.created_by := (select auth.uid())::text; end if;
    new.portee_sur_note := false;
    if new.statut = 'livree' then
      new.livree_at := now();
      if (select auth.uid()) is not null then new.livree_par := (select auth.uid())::text; end if;
    else
      new.livree_at := null; new.livree_par := null;
    end if;
    return new;
  end if;
  -- UPDATE : la date de création ne bouge pas ; une commande portée sur la
  -- note garde ses articles ; porter sur la note demande la case Modifier
  -- d'Hébergement (celle qui écrit la ligne de note) ; hors case Modifier de
  -- Repas hôtel, seuls statut, note et portée changent.
  new.created_at := old.created_at;
  if old.portee_sur_note and new.articles is distinct from old.articles then
    raise exception 'COMMANDE_PORTEE: une commande portée sur la note ne change plus d''articles' using errcode = '23514';
  end if;
  if new.portee_sur_note is distinct from old.portee_sur_note and (select auth.uid()) is not null
     and not (select public.user_peut_gerer('hebergement', array['consultant', 'patron', 'receptionniste'])) then
    raise exception 'NOTE_RESERVEE: porter une commande sur la note demande le droit Modifier d''Hébergement' using errcode = '42501';
  end if;
  if (new.articles is distinct from old.articles or new.sejour_id <> old.sejour_id or new.chambre_id is distinct from old.chambre_id or new.souhaite_a is distinct from old.souhaite_a)
     and (select auth.uid()) is not null
     and not (select public.user_peut_gerer('repas', array['consultant', 'patron', 'resp_cuisine', 'receptionniste', 'serveur'])) then
    raise exception 'COMMANDE_RESERVEE: modifier les articles demande le droit Modifier de Repas hôtel' using errcode = '42501';
  end if;
  if new.created_by is distinct from old.created_by and (select auth.uid()) is not null
     and (new.created_by is not null or exists (select 1 from public.profiles pr where pr.id = old.created_by)) then
    new.created_by := old.created_by;
  end if;
  if new.statut = 'livree' and old.statut <> 'livree' then
    new.livree_at := now();
    new.livree_par := case when (select auth.uid()) is not null then (select auth.uid())::text else new.livree_par end;
  elsif new.statut = 'livree' then
    new.livree_at := old.livree_at;
    if new.livree_par is distinct from old.livree_par and (select auth.uid()) is not null
       and (new.livree_par is not null or exists (select 1 from public.profiles pr where pr.id = old.livree_par)) then
      new.livree_par := old.livree_par;
    end if;
  else
    new.livree_at := null; new.livree_par := null;
    new.portee_sur_note := false;
  end if;
  if old.portee_sur_note and not new.portee_sur_note and new.statut = 'livree' then
    new.portee_sur_note := true;  -- une commande portée sur la note le reste
  end if;
  return new;
end;
$$;

revoke all on function public.hotel_h7_coherence() from public, anon, authenticated;

create or replace trigger trg_room_service_coherence
  before insert or update on public.room_service_commandes
  for each row execute function public.hotel_h7_coherence();
create or replace trigger trg_sejour_liens_coherence
  before insert or update on public.sejour_liens
  for each row execute function public.hotel_h7_coherence();

-- Section 0 : garde-fou de suppression des séjours (lot H5), étendu.
create or replace function public.sejours_avant_suppression()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null or (select public.current_user_role()) in ('consultant', 'patron') then
    return old;
  end if;
  if exists (select 1 from public.sejour_lignes l where l.sejour_id = old.id)
     or exists (select 1 from public.sejour_occupants o where o.sejour_id = old.id)
     or exists (select 1 from public.activite_inscriptions i where i.sejour_id = old.id)
     or exists (select 1 from public.consommations c where c.sejour_id = old.id)
     or exists (select 1 from public.room_service_commandes r where r.sejour_id = old.id)
     or exists (select 1 from public.sejour_liens sl where sl.sejour_id = old.id) then
    raise exception 'SEJOUR_AVEC_HISTORIQUE: un séjour qui porte une note, un registre, des inscriptions, des consommations, des commandes ou des liens ne se supprime pas ; annule-le'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke all on function public.sejours_avant_suppression() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  gerer_repas text := '(select public.user_peut_gerer(''repas'', array[''consultant'', ''patron'', ''resp_cuisine'', ''receptionniste'', ''serveur'']))';
  gerer_heb text := '(select public.user_peut_gerer(''hebergement'', array[''consultant'', ''patron'', ''receptionniste'']))';
begin
  execute 'alter table public.room_service_commandes enable row level security';
  execute 'revoke all on table public.room_service_commandes from public, anon, authenticated';
  execute 'grant select, insert, update, delete on table public.room_service_commandes to authenticated';
  execute 'drop policy if exists room_service_commandes_select on public.room_service_commandes';
  execute 'create policy room_service_commandes_select on public.room_service_commandes for select to authenticated using (user_can_access_etab(etablissement_id))';
  execute 'drop policy if exists room_service_commandes_insert on public.room_service_commandes';
  execute 'create policy room_service_commandes_insert on public.room_service_commandes for insert to authenticated with check (user_can_access_etab(etablissement_id))';
  execute 'drop policy if exists room_service_commandes_update on public.room_service_commandes';
  execute 'create policy room_service_commandes_update on public.room_service_commandes for update to authenticated using (user_can_access_etab(etablissement_id)) with check (user_can_access_etab(etablissement_id))';
  execute 'drop policy if exists room_service_commandes_delete on public.room_service_commandes';
  execute format('create policy room_service_commandes_delete on public.room_service_commandes for delete to authenticated using (user_can_access_etab(etablissement_id) and %s)', gerer_repas);

  execute 'alter table public.sejour_liens enable row level security';
  execute 'revoke all on table public.sejour_liens from public, anon, authenticated';
  execute 'grant select, insert, delete on table public.sejour_liens to authenticated';
  execute 'drop policy if exists sejour_liens_select on public.sejour_liens';
  execute 'create policy sejour_liens_select on public.sejour_liens for select to authenticated using (user_can_access_etab(etablissement_id))';
  execute 'drop policy if exists sejour_liens_insert on public.sejour_liens';
  execute format('create policy sejour_liens_insert on public.sejour_liens for insert to authenticated with check (user_can_access_etab(etablissement_id) and %s)', gerer_heb);
  execute 'drop policy if exists sejour_liens_delete on public.sejour_liens';
  execute format('create policy sejour_liens_delete on public.sejour_liens for delete to authenticated using (user_can_access_etab(etablissement_id) and %s)', gerer_heb);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Realtime
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['room_service_commandes', 'sejour_liens'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Commentaires
-- ─────────────────────────────────────────────────────────────────────────────
comment on table public.room_service_commandes is 'Commandes de room service d''un séjour (lot H7) : articles, total calculé en base, statut, livrée par et quand, portée sur la note.';
comment on table public.sejour_liens is 'Réservations de table et groupes reliés à un séjour (lot H7), sans rien déplacer.';
