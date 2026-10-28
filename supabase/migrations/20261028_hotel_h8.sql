-- ════════════════════════════════════════════════════════════════════════════
-- Branche Hôtel, lot H8 : technique
-- ───────────────────────────────────────────────────────────────────────────
-- Trois tables neuves, expand only :
--   equipements        le parc technique : nom, catégorie, lieu ou chambre,
--                      numéro de série, fournisseur, actif, notes.
--   maintenance_plans  le préventif : une tâche qui revient tous les n jours
--                      sur un équipement, une chambre ou un lieu ; dernière
--                      fois, prochaine fois (calculée en base).
--   ordres_travail     les ordres de travail : titre, détail, catégorie,
--                      priorité, statut ouvert, planifié, en cours, terminé,
--                      annulé ; chambre, équipement, lieu ; demande (lot H2)
--                      ou plan préventif d'origine ; prévu le, assigné à ;
--                      temps, pièces, coût, photo ; terminé par et quand.
-- Une chambre hors service reste ce qu'elle est depuis le lot H0
-- (chambres.statut_menage = hors_service, motif) : un ordre de travail peut
-- la viser, l'écran propose de la remettre à faire quand il se termine.
--
-- Droits : toute l'équipe lit et ouvre un ordre de travail ; la personne
-- assignée fait avancer le sien (statut, temps, pièces, coût) ; équipements,
-- plans, réassignation et suppression demandent la case Modifier de Technique
-- (consultant, patron, technicien, gouvernante par défaut). anon exclu :
-- aucune policy.
--
-- Section 0 : revue de sécurité du lot H7 : une commande de room service
-- portée sur la note est verrouillée (son statut ne change plus, elle ne se
-- supprime plus) hors case Modifier d'Hébergement, qui tient la note.
-- Idempotente. Inverse : migrations-inverse/20261028_hotel_h8.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Revue de sécurité du lot H7
-- ─────────────────────────────────────────────────────────────────────────────
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
  if new.portee_sur_note and new.statut <> 'livree' and (tg_op = 'INSERT' or not old.portee_sur_note) then
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
  -- note est verrouillée (articles, statut, marqueur) hors case Modifier
  -- d'Hébergement ; porter sur la note demande cette même case ; hors case
  -- Modifier de Repas hôtel, seuls statut, note et portée changent.
  new.created_at := old.created_at;
  if old.portee_sur_note and (new.articles is distinct from old.articles or new.statut <> old.statut or not new.portee_sur_note)
     and ((select auth.uid()) is null or not (select public.user_peut_gerer('hebergement', array['consultant', 'patron', 'receptionniste']))) then
    raise exception 'COMMANDE_PORTEE: une commande portée sur la note ne change plus ; la note se corrige avec le droit Modifier d''Hébergement' using errcode = '23514';
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
  return new;
end;
$$;

revoke all on function public.hotel_h7_coherence() from public, anon, authenticated;

drop policy if exists room_service_commandes_delete on public.room_service_commandes;
create policy room_service_commandes_delete on public.room_service_commandes
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and not portee_sur_note
    and (select public.user_peut_gerer('repas', array['consultant', 'patron', 'resp_cuisine', 'receptionniste', 'serveur']))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.equipements (
  id                  uuid        primary key default gen_random_uuid(),
  etablissement_id    text        not null references public.etablissements(id) on delete cascade,
  nom                 text        not null check (btrim(nom) <> ''),
  categorie           text        not null default 'autre'
                      check (categorie in ('chauffage', 'plomberie', 'electricite', 'ascenseur', 'cuisine', 'spa', 'securite', 'batiment', 'autre')),
  lieu                text,
  chambre_id          uuid        references public.chambres(id) on delete set null,
  numero_serie        text,
  fournisseur         text,
  actif               boolean     not null default true,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_equipements_etab on public.equipements(etablissement_id, categorie, nom);
create index if not exists idx_equipements_chambre on public.equipements(chambre_id);

create table if not exists public.maintenance_plans (
  id                  uuid        primary key default gen_random_uuid(),
  etablissement_id    text        not null references public.etablissements(id) on delete cascade,
  titre               text        not null check (btrim(titre) <> ''),
  detail              text,
  categorie           text        not null default 'autre'
                      check (categorie in ('chauffage', 'plomberie', 'electricite', 'ascenseur', 'cuisine', 'spa', 'securite', 'batiment', 'autre')),
  equipement_id       uuid        references public.equipements(id) on delete set null,
  chambre_id          uuid        references public.chambres(id) on delete set null,
  lieu                text,
  periodicite_jours   int         not null check (periodicite_jours between 1 and 3660),
  derniere_fois       date,
  prochaine_fois      date        not null default ((now() at time zone 'Europe/Zurich')::date),
  actif               boolean     not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_maintenance_plans_etab_prochaine on public.maintenance_plans(etablissement_id, prochaine_fois);
create index if not exists idx_maintenance_plans_equipement on public.maintenance_plans(equipement_id);
create index if not exists idx_maintenance_plans_chambre on public.maintenance_plans(chambre_id);

create table if not exists public.ordres_travail (
  id                  uuid        primary key default gen_random_uuid(),
  etablissement_id    text        not null references public.etablissements(id) on delete cascade,
  titre               text        not null check (btrim(titre) <> ''),
  detail              text,
  categorie           text        not null default 'autre'
                      check (categorie in ('chauffage', 'plomberie', 'electricite', 'ascenseur', 'cuisine', 'spa', 'securite', 'batiment', 'autre')),
  priorite            text        not null default 'normale' check (priorite in ('basse', 'normale', 'haute', 'urgente')),
  statut              text        not null default 'ouvert' check (statut in ('ouvert', 'planifie', 'en_cours', 'termine', 'annule')),
  chambre_id          uuid        references public.chambres(id) on delete set null,
  equipement_id       uuid        references public.equipements(id) on delete set null,
  lieu                text,
  demande_id          uuid        references public.demandes(id) on delete set null,
  plan_id             uuid        references public.maintenance_plans(id) on delete set null,
  prevu_le            date,
  assigne_a           text        references public.profiles(id) on delete set null,
  temps_minutes       int         check (temps_minutes is null or temps_minutes >= 0),
  cout                numeric(10,2) check (cout is null or cout >= 0),
  pieces              text,
  photo_url           text        check (photo_url is null or photo_url ~* '^https://'),
  compte_rendu        text,
  termine_par         text        references public.profiles(id) on delete set null,
  termine_at          timestamptz,
  created_by          text        references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_ordres_travail_etab_statut on public.ordres_travail(etablissement_id, statut, priorite);
create index if not exists idx_ordres_travail_chambre on public.ordres_travail(chambre_id);
create index if not exists idx_ordres_travail_equipement on public.ordres_travail(equipement_id);
create index if not exists idx_ordres_travail_demande on public.ordres_travail(demande_id);
create index if not exists idx_ordres_travail_plan on public.ordres_travail(plan_id);
create index if not exists idx_ordres_travail_assigne on public.ordres_travail(assigne_a);
create index if not exists idx_ordres_travail_termine_par on public.ordres_travail(termine_par);
create index if not exists idx_ordres_travail_created_by on public.ordres_travail(created_by);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Déclencheurs
-- ─────────────────────────────────────────────────────────────────────────────
create or replace trigger trg_equipements_updated_at
  before update on public.equipements
  for each row execute function public.set_updated_at();
create or replace trigger trg_maintenance_plans_updated_at
  before update on public.maintenance_plans
  for each row execute function public.set_updated_at();
create or replace trigger trg_ordres_travail_updated_at
  before update on public.ordres_travail
  for each row execute function public.set_updated_at();

-- Cohérence : établissement fixe ; chambre, équipement, demande, plan et
-- personne assignée de l'établissement ; prochaine fois d'un plan calculée en
-- base (dernière fois plus la périodicité) ; auteur posé par la base et
-- immuable ; terminé par et quand posés au passage à terminé ; hors case
-- Modifier de Technique, seule la personne assignée (ou l'auteur d'un ordre
-- encore ouvert) fait avancer un ordre, sans le réassigner.
create or replace function public.hotel_h8_coherence()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  gere boolean;
  moi text;
begin
  if tg_op = 'UPDATE' and new.etablissement_id <> old.etablissement_id then
    raise exception 'ETABLISSEMENT_FIXE: une ligne ne change pas d''établissement' using errcode = '23514';
  end if;
  if new.chambre_id is not null and (tg_op = 'INSERT' or new.chambre_id is distinct from old.chambre_id) and not exists (
    select 1 from public.chambres c where c.id = new.chambre_id and c.etablissement_id = new.etablissement_id
  ) then
    raise exception 'CHAMBRE_INCONNUE: la chambre n''appartient pas à cet établissement' using errcode = '23503';
  end if;

  if tg_table_name = 'equipements' then
    return new;
  end if;

  if new.equipement_id is not null and (tg_op = 'INSERT' or new.equipement_id is distinct from old.equipement_id) and not exists (
    select 1 from public.equipements e where e.id = new.equipement_id and e.etablissement_id = new.etablissement_id
  ) then
    raise exception 'EQUIPEMENT_INCONNU: l''équipement n''appartient pas à cet établissement' using errcode = '23503';
  end if;

  if tg_table_name = 'maintenance_plans' then
    -- Un plan neuf sans historique est à faire tout de suite (prochaine fois
    -- fournie ou défaut du jour, Zurich) ; sinon la prochaine fois découle de
    -- la dernière fois et de la périodicité.
    if new.derniere_fois > (now() at time zone 'Europe/Zurich')::date then
      raise exception 'DATE_FUTURE: la dernière fois ne peut pas être dans le futur' using errcode = '23514';
    end if;
    if tg_op = 'INSERT' and new.derniere_fois is null then
      null;
    elsif tg_op = 'INSERT' or new.derniere_fois is distinct from old.derniere_fois or new.periodicite_jours <> old.periodicite_jours then
      new.prochaine_fois := coalesce(new.derniere_fois, (now() at time zone 'Europe/Zurich')::date) + new.periodicite_jours;
    end if;
    return new;
  end if;

  -- ordres_travail
  moi := (select auth.uid())::text;
  if new.demande_id is not null and (tg_op = 'INSERT' or new.demande_id is distinct from old.demande_id) and not exists (
    select 1 from public.demandes d where d.id = new.demande_id and d.etablissement_id = new.etablissement_id
  ) then
    raise exception 'DEMANDE_INCONNUE: la demande n''appartient pas à cet établissement' using errcode = '23503';
  end if;
  if new.plan_id is not null and (tg_op = 'INSERT' or new.plan_id is distinct from old.plan_id) and not exists (
    select 1 from public.maintenance_plans p where p.id = new.plan_id and p.etablissement_id = new.etablissement_id
  ) then
    raise exception 'PLAN_INCONNU: le plan n''appartient pas à cet établissement' using errcode = '23503';
  end if;
  if new.assigne_a is not null and (tg_op = 'INSERT' or new.assigne_a is distinct from old.assigne_a) and not exists (
    select 1 from public.profiles p where p.id = new.assigne_a and new.etablissement_id = any (p.etablissement_ids)
  ) then
    raise exception 'ASSIGNE_INCONNU: la personne n''appartient pas à cet établissement' using errcode = '23503';
  end if;

  if tg_op = 'INSERT' then
    if moi is not null then
      new.created_by := moi;
      -- Hors case Modifier : pas d'ordre préventif (il daterait le plan en
      -- se terminant), pas d'assignation à une autre personne.
      if not (select public.user_peut_gerer('technique', array['consultant', 'patron', 'technicien', 'gouvernante'])) then
        if new.plan_id is not null then
          raise exception 'ORDRE_RESERVE: un ordre préventif demande le droit Modifier de Technique' using errcode = '42501';
        end if;
        if new.assigne_a is not null and new.assigne_a <> moi then
          raise exception 'ORDRE_RESERVE: assigner un ordre à une autre personne demande le droit Modifier de Technique' using errcode = '42501';
        end if;
      end if;
    end if;
    if new.statut = 'termine' then
      new.termine_at := now();
      if moi is not null then new.termine_par := moi; end if;
    else
      new.termine_at := null; new.termine_par := null;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.created_by is distinct from old.created_by and moi is not null
     and (new.created_by is not null or exists (select 1 from public.profiles p where p.id = old.created_by)) then
    new.created_by := old.created_by;
  end if;
  if moi is not null then
    gere := (select public.user_peut_gerer('technique', array['consultant', 'patron', 'technicien', 'gouvernante']));
    if not gere then
      -- Se prendre un ordre libre est permis ; réassigner un ordre pris ne l'est pas.
      if new.assigne_a is distinct from old.assigne_a and not (old.assigne_a is null and new.assigne_a = moi) then
        raise exception 'ORDRE_RESERVE: réassigner un ordre demande le droit Modifier de Technique' using errcode = '42501';
      end if;
      if old.assigne_a is distinct from moi and old.created_by is distinct from moi and new.assigne_a is distinct from moi then
        raise exception 'ORDRE_RESERVE: seule la personne assignée ou l''auteur fait avancer cet ordre' using errcode = '42501';
      end if;
      if new.titre <> old.titre or new.detail is distinct from old.detail or new.categorie <> old.categorie or new.priorite <> old.priorite
         or new.chambre_id is distinct from old.chambre_id or new.equipement_id is distinct from old.equipement_id or new.lieu is distinct from old.lieu
         or new.demande_id is distinct from old.demande_id or new.plan_id is distinct from old.plan_id then
        if old.created_by is distinct from moi or old.statut not in ('ouvert', 'planifie') then
          raise exception 'ORDRE_RESERVE: le contenu d''un ordre se corrige par son auteur tant qu''il n''est pas commencé, sinon avec le droit Modifier de Technique' using errcode = '42501';
        end if;
      end if;
    end if;
  end if;
  if new.statut = 'termine' and old.statut <> 'termine' then
    new.termine_at := now();
    new.termine_par := coalesce(moi, new.termine_par);
  elsif new.statut = 'termine' then
    new.termine_at := old.termine_at;
    if new.termine_par is distinct from old.termine_par and moi is not null
       and (new.termine_par is not null or exists (select 1 from public.profiles p where p.id = old.termine_par)) then
      new.termine_par := old.termine_par;
    end if;
  else
    new.termine_at := null; new.termine_par := null;
  end if;
  return new;
end;
$$;

revoke all on function public.hotel_h8_coherence() from public, anon, authenticated;

create or replace trigger trg_equipements_coherence
  before insert or update on public.equipements
  for each row execute function public.hotel_h8_coherence();
create or replace trigger trg_maintenance_plans_coherence
  before insert or update on public.maintenance_plans
  for each row execute function public.hotel_h8_coherence();
create or replace trigger trg_ordres_travail_coherence
  before insert or update on public.ordres_travail
  for each row execute function public.hotel_h8_coherence();

-- Un ordre préventif terminé date le plan : dernière fois = jour de fin, la
-- prochaine fois suit (déclencheur du plan). Fonction de déclencheur en
-- security definer, limitée à cette seule écriture, sans entrée utilisateur.
create or replace function public.ordres_travail_apres_fin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.plan_id is not null and new.statut = 'termine' and (tg_op = 'INSERT' or old.statut is distinct from 'termine') then
    update public.maintenance_plans
       set derniere_fois = (new.termine_at at time zone 'Europe/Zurich')::date
     where id = new.plan_id and etablissement_id = new.etablissement_id
       and (derniere_fois is null or derniere_fois < (new.termine_at at time zone 'Europe/Zurich')::date);
  end if;
  return new;
end;
$$;

revoke all on function public.ordres_travail_apres_fin() from public, anon, authenticated;

create or replace trigger trg_ordres_travail_apres_fin
  after insert or update of statut on public.ordres_travail
  for each row execute function public.ordres_travail_apres_fin();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  gerer text := '(select public.user_peut_gerer(''technique'', array[''consultant'', ''patron'', ''technicien'', ''gouvernante'']))';
begin
  foreach t in array array['equipements', 'maintenance_plans', 'ordres_travail'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_can_access_etab(etablissement_id))', t || '_select', t);
  end loop;

  -- Équipements et plans : la case Modifier de Technique.
  foreach t in array array['equipements', 'maintenance_plans'] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_can_access_etab(etablissement_id) and %s)', t || '_insert', t, gerer);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_can_access_etab(etablissement_id) and %s) with check (user_can_access_etab(etablissement_id) and %s)', t || '_update', t, gerer, gerer);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_can_access_etab(etablissement_id) and %s)', t || '_delete', t, gerer);
  end loop;

  -- Ordres de travail : ouverts par l'équipe, avancés par la personne assignée
  -- ou l'auteur (le déclencheur borne ce qui change), supprimés avec la case.
  execute 'drop policy if exists ordres_travail_insert on public.ordres_travail';
  execute 'create policy ordres_travail_insert on public.ordres_travail for insert to authenticated with check (user_can_access_etab(etablissement_id))';
  execute 'drop policy if exists ordres_travail_update on public.ordres_travail';
  execute 'create policy ordres_travail_update on public.ordres_travail for update to authenticated using (user_can_access_etab(etablissement_id)) with check (user_can_access_etab(etablissement_id))';
  execute 'drop policy if exists ordres_travail_delete on public.ordres_travail';
  execute format('create policy ordres_travail_delete on public.ordres_travail for delete to authenticated using (user_can_access_etab(etablissement_id) and %s)', gerer);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Realtime
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['equipements', 'maintenance_plans', 'ordres_travail'] loop
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
comment on table public.equipements is 'Parc technique (lot H8) : nom, catégorie, lieu ou chambre, numéro de série, fournisseur.';
comment on table public.maintenance_plans is 'Préventif (lot H8) : tâche tous les n jours sur un équipement, une chambre ou un lieu ; prochaine fois calculée en base.';
comment on table public.ordres_travail is 'Ordres de travail (lot H8) : titre, catégorie, priorité, statut, chambre ou équipement, demande ou plan d''origine, assigné à, temps, pièces, coût, photo, terminé par et quand.';
