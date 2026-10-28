-- ════════════════════════════════════════════════════════════════════════════
-- Branche Hôtel, lot H5 : all inclusive, forfaits et activités
-- ───────────────────────────────────────────────────────────────────────────
-- Cinq tables neuves, expand only :
--   forfaits               les formules (all inclusive, spa, famille…), avec un
--                          prix par nuit facultatif.
--   forfait_droits         ce qu'une formule donne : un libellé, une catégorie
--                          (restauration, boissons, spa, activités, autre), une
--                          quantité par séjour ou par jour (null = sans limite).
--   activites              le programme : titre, lieu, début, fin, places,
--                          prix (0 = inclus), responsable, annulation.
--   activite_inscriptions  les séjours inscrits à une activité, avec le nombre
--                          de personnes et la présence ; la capacité est tenue
--                          par déclencheur.
--   consommations          ce qu'un séjour consomme sur ses droits (bar, spa,
--                          restaurant…), pointé au bracelet ou au nom.
-- sejours reçoit forfait_id et identifiant (numéro de bracelet ou de carte),
-- nullables ; un identifiant ne sert qu'à un séjour actif à la fois.
--
-- Section 0 : revue de sécurité du lot H4 : les lignes d'une note ne se
-- modifient plus qu'en direction (la réception ajoute, remise ou encaisse), et
-- un séjour qui porte une note, un registre, des inscriptions ou des
-- consommations ne se supprime pas hors direction (la cascade ne contourne
-- plus les policies de suppression).
--
-- Droits : forfaits et droits lus par l'équipe, écrits par consultant et
-- patron ; activités lues par l'équipe, écrites avec la case Modifier
-- d'Activités (consultant, patron, réception, hôte par défaut) ; inscriptions
-- et consommations saisies par toute l'équipe ; la présence et l'annulation
-- d'une inscription restent ouvertes, tout le reste (corriger, déplacer,
-- supprimer) demande cette case. anon exclu : aucune policy.
-- Idempotente. Inverse : migrations-inverse/20261028_hotel_h5.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Revue de sécurité du lot H4
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists sejour_lignes_update on public.sejour_lignes;
create policy sejour_lignes_update on public.sejour_lignes
  for update to authenticated
  using (user_can_access_etab(etablissement_id) and (select public.current_user_role()) in ('consultant', 'patron'))
  with check (user_can_access_etab(etablissement_id) and (select public.current_user_role()) in ('consultant', 'patron'));

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
     or exists (select 1 from public.consommations c where c.sejour_id = old.id) then
    raise exception 'SEJOUR_AVEC_HISTORIQUE: un séjour qui porte une note, un registre, des inscriptions ou des consommations ne se supprime pas ; annule-le'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke all on function public.sejours_avant_suppression() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.forfaits (
  id                  uuid        primary key default gen_random_uuid(),
  etablissement_id    text        not null references public.etablissements(id) on delete cascade,
  nom                 text        not null check (btrim(nom) <> ''),
  description         text,
  prix_par_nuit       numeric(10,2) not null default 0 check (prix_par_nuit >= 0),
  actif               boolean     not null default true,
  ordre               int         not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_forfaits_etab on public.forfaits(etablissement_id, ordre, nom);

create table if not exists public.forfait_droits (
  id                  uuid        primary key default gen_random_uuid(),
  etablissement_id    text        not null references public.etablissements(id) on delete cascade,
  forfait_id          uuid        not null references public.forfaits(id) on delete cascade,
  libelle             text        not null check (btrim(libelle) <> ''),
  categorie           text        not null default 'autre'
                      check (categorie in ('restauration', 'boissons', 'spa', 'activites', 'autre')),
  quantite_par_sejour int         check (quantite_par_sejour is null or quantite_par_sejour > 0),
  quantite_par_jour   int         check (quantite_par_jour is null or quantite_par_jour > 0),
  ordre               int         not null default 0,
  created_at          timestamptz not null default now()
);
create index if not exists idx_forfait_droits_forfait on public.forfait_droits(forfait_id, ordre);
create index if not exists idx_forfait_droits_etab on public.forfait_droits(etablissement_id);

create table if not exists public.activites (
  id                  uuid        primary key default gen_random_uuid(),
  etablissement_id    text        not null references public.etablissements(id) on delete cascade,
  titre               text        not null check (btrim(titre) <> ''),
  description         text,
  lieu                text,
  debut               timestamptz not null,
  fin                 timestamptz not null,
  places              int         check (places is null or places > 0),
  prix                numeric(10,2) not null default 0 check (prix >= 0),
  inclus_forfait      boolean     not null default true,
  responsable         text        references public.profiles(id) on delete set null,
  annulee             boolean     not null default false,
  created_by          text        references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint activites_duree check (fin > debut)
);
create index if not exists idx_activites_etab_debut on public.activites(etablissement_id, debut);
create index if not exists idx_activites_responsable on public.activites(responsable);
create index if not exists idx_activites_created_by on public.activites(created_by);

create table if not exists public.activite_inscriptions (
  id                  uuid        primary key default gen_random_uuid(),
  etablissement_id    text        not null references public.etablissements(id) on delete cascade,
  activite_id         uuid        not null references public.activites(id) on delete cascade,
  sejour_id           uuid        not null references public.sejours(id) on delete cascade,
  nb_personnes        int         not null default 1 check (nb_personnes between 1 and 50),
  statut              text        not null default 'inscrit' check (statut in ('inscrit', 'present', 'annule')),
  note                text,
  created_by          text        references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint uq_activite_inscriptions unique (activite_id, sejour_id)
);
create index if not exists idx_activite_inscriptions_sejour on public.activite_inscriptions(sejour_id);
create index if not exists idx_activite_inscriptions_etab on public.activite_inscriptions(etablissement_id);
create index if not exists idx_activite_inscriptions_created_by on public.activite_inscriptions(created_by);

create table if not exists public.consommations (
  id                  uuid        primary key default gen_random_uuid(),
  etablissement_id    text        not null references public.etablissements(id) on delete cascade,
  sejour_id           uuid        not null references public.sejours(id) on delete cascade,
  droit_id            uuid        references public.forfait_droits(id) on delete set null,
  libelle             text        not null check (btrim(libelle) <> ''),
  quantite            numeric(10,2) not null default 1 check (quantite > 0),
  jour                date        not null,
  lieu                text,
  at                  timestamptz not null default now(),
  par                 text        references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index if not exists idx_consommations_sejour_jour on public.consommations(sejour_id, jour);
create index if not exists idx_consommations_etab_jour on public.consommations(etablissement_id, jour);
create index if not exists idx_consommations_droit on public.consommations(droit_id);
create index if not exists idx_consommations_par on public.consommations(par);

alter table public.sejours add column if not exists forfait_id uuid references public.forfaits(id) on delete set null;
alter table public.sejours add column if not exists identifiant text;
create index if not exists idx_sejours_forfait on public.sejours(forfait_id);
-- Un bracelet ou une carte ne désigne qu'un séjour actif à la fois.
create unique index if not exists uq_sejours_identifiant_actif
  on public.sejours(etablissement_id, lower(btrim(identifiant)))
  where identifiant is not null and btrim(identifiant) <> '' and statut in ('prevu', 'en_maison');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Déclencheurs
-- ─────────────────────────────────────────────────────────────────────────────
create or replace trigger trg_forfaits_updated_at
  before update on public.forfaits
  for each row execute function public.set_updated_at();
create or replace trigger trg_activites_updated_at
  before update on public.activites
  for each row execute function public.set_updated_at();
create or replace trigger trg_activite_inscriptions_updated_at
  before update on public.activite_inscriptions
  for each row execute function public.set_updated_at();

-- Cohérence : tout ce qu'une ligne référence est de son établissement, qui ne
-- change pas ; l'auteur (created_by ou par) est posé par la base et immuable,
-- sauf effacement par la suppression de son profil. Les inscriptions tiennent
-- la capacité de l'activité (verrou d'avis par activité).
create or replace function public.hotel_h5_coherence()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  places_max int;
  activite_annulee boolean;
  sejour_statut text;
  sejour_forfait uuid;
  quota_sejour int;
  quota_jour int;
  deja int;
  deja_sejour numeric;
  deja_jour numeric;
  ancien_auteur text;
  nouvel_auteur text;
begin
  if tg_op = 'UPDATE' and new.etablissement_id <> old.etablissement_id then
    raise exception 'ETABLISSEMENT_FIXE: une ligne ne change pas d''établissement' using errcode = '23514';
  end if;

  if tg_table_name = 'forfait_droits' then
    if not exists (select 1 from public.forfaits f where f.id = new.forfait_id and f.etablissement_id = new.etablissement_id) then
      raise exception 'FORFAIT_INCONNU: le forfait n''appartient pas à cet établissement' using errcode = '23503';
    end if;
    return new;
  end if;

  if tg_table_name = 'activites' then
    -- Le responsable n'est revérifié que quand il change : une personne partie
    -- de l'établissement ne bloque pas l'annulation de son activité.
    if new.responsable is not null and (tg_op = 'INSERT' or new.responsable is distinct from old.responsable) and not exists (
      select 1 from public.profiles p where p.id = new.responsable and new.etablissement_id = any (p.etablissement_ids)
    ) then
      raise exception 'RESPONSABLE_INCONNU: la personne n''appartient pas à cet établissement' using errcode = '23503';
    end if;
  end if;

  if tg_table_name in ('activite_inscriptions', 'consommations') then
    select s.statut, s.forfait_id into sejour_statut, sejour_forfait from public.sejours s where s.id = new.sejour_id and s.etablissement_id = new.etablissement_id;
    if not found then
      raise exception 'SEJOUR_INCONNU: le séjour n''appartient pas à cet établissement' using errcode = '23503';
    end if;
  end if;

  if tg_table_name = 'activite_inscriptions' then
    select a.places, a.annulee into places_max, activite_annulee from public.activites a where a.id = new.activite_id and a.etablissement_id = new.etablissement_id;
    if not found then
      raise exception 'ACTIVITE_INCONNUE: l''activité n''appartient pas à cet établissement' using errcode = '23503';
    end if;
    -- Hors case Modifier d'Activités, une inscription ne change ni de séjour ni d'activité.
    if tg_op = 'UPDATE' and (new.sejour_id <> old.sejour_id or new.activite_id <> old.activite_id)
       and not (select public.user_peut_gerer('activites', array['consultant', 'patron', 'receptionniste', 'hote'])) then
      raise exception 'INSCRIPTION_RESERVEE: déplacer une inscription demande le droit Modifier d''Activités' using errcode = '42501';
    end if;
    -- Une inscription vivante demande une activité maintenue et un séjour actif.
    -- La capacité ne se revérifie qu'à l'arrivée, à la réactivation ou à la
    -- hausse : noter la présence reste possible si les places ont été réduites.
    if new.statut <> 'annule' and (tg_op = 'INSERT' or old.statut = 'annule' or new.activite_id <> old.activite_id or new.nb_personnes > old.nb_personnes) then
      if activite_annulee then
        raise exception 'ACTIVITE_ANNULEE: cette activité est annulée' using errcode = '23514';
      end if;
      if sejour_statut not in ('prevu', 'en_maison') then
        raise exception 'SEJOUR_INACTIF: ce séjour est annulé ou terminé' using errcode = '23514';
      end if;
      if places_max is not null then
        perform pg_advisory_xact_lock(hashtextextended(new.activite_id::text, 0));
        select coalesce(sum(i.nb_personnes), 0) into deja
        from public.activite_inscriptions i
        where i.activite_id = new.activite_id and i.statut <> 'annule' and i.id <> new.id;
        if deja + new.nb_personnes > places_max then
          raise exception 'ACTIVITE_COMPLETE: il reste % place(s) sur %', greatest(places_max - deja, 0), places_max using errcode = '23P01';
        end if;
      end if;
    end if;
  end if;

  if tg_table_name = 'consommations' then
    -- Le droit pointé est un droit du forfait du séjour, et ses quantités
    -- (par séjour, par jour) sont tenues ici, sous verrou d'avis par séjour.
    if new.droit_id is not null then
      select d.quantite_par_sejour, d.quantite_par_jour into quota_sejour, quota_jour
      from public.forfait_droits d
      where d.id = new.droit_id and d.etablissement_id = new.etablissement_id and d.forfait_id = sejour_forfait;
      if not found then
        raise exception 'DROIT_INCONNU: ce droit n''est pas dans le forfait du séjour' using errcode = '23503';
      end if;
      if tg_op = 'INSERT' or new.quantite > old.quantite or new.droit_id is distinct from old.droit_id or new.jour <> old.jour then
        perform pg_advisory_xact_lock(hashtextextended(new.sejour_id::text, 0));
        if quota_sejour is not null then
          select coalesce(sum(c.quantite), 0) into deja_sejour from public.consommations c
          where c.sejour_id = new.sejour_id and c.droit_id = new.droit_id and c.id <> new.id;
          if deja_sejour + new.quantite > quota_sejour then
            raise exception 'DROIT_EPUISE: % déjà pris sur % pour le séjour', deja_sejour, quota_sejour using errcode = '23P01';
          end if;
        end if;
        if quota_jour is not null then
          select coalesce(sum(c.quantite), 0) into deja_jour from public.consommations c
          where c.sejour_id = new.sejour_id and c.droit_id = new.droit_id and c.jour = new.jour and c.id <> new.id;
          if deja_jour + new.quantite > quota_jour then
            raise exception 'DROIT_EPUISE: % déjà pris sur % aujourd''hui', deja_jour, quota_jour using errcode = '23P01';
          end if;
        end if;
      end if;
    end if;
  end if;

  -- Auteur : created_by (activités, inscriptions) ou par (consommations).
  if tg_table_name = 'consommations' then
    nouvel_auteur := new.par;
    ancien_auteur := case when tg_op = 'UPDATE' then old.par end;
  else
    nouvel_auteur := new.created_by;
    ancien_auteur := case when tg_op = 'UPDATE' then old.created_by end;
  end if;
  if tg_table_name <> 'forfait_droits' then
    if tg_op = 'INSERT' then
      if (select auth.uid()) is not null then nouvel_auteur := (select auth.uid())::text; end if;
    elsif nouvel_auteur is distinct from ancien_auteur and (select auth.uid()) is not null
       and (nouvel_auteur is not null or exists (select 1 from public.profiles p where p.id = ancien_auteur)) then
      nouvel_auteur := ancien_auteur;
    end if;
    if tg_table_name = 'consommations' then new.par := nouvel_auteur; else new.created_by := nouvel_auteur; end if;
  end if;
  return new;
end;
$$;

revoke all on function public.hotel_h5_coherence() from public, anon, authenticated;

create or replace trigger trg_forfait_droits_coherence
  before insert or update on public.forfait_droits
  for each row execute function public.hotel_h5_coherence();
create or replace trigger trg_activites_coherence
  before insert or update on public.activites
  for each row execute function public.hotel_h5_coherence();
create or replace trigger trg_activite_inscriptions_coherence
  before insert or update on public.activite_inscriptions
  for each row execute function public.hotel_h5_coherence();
create or replace trigger trg_consommations_coherence
  before insert or update on public.consommations
  for each row execute function public.hotel_h5_coherence();

create or replace trigger trg_sejours_avant_suppression
  before delete on public.sejours
  for each row execute function public.sejours_avant_suppression();

-- Un séjour ne pointe que vers un forfait de son établissement : ajouté au
-- déclencheur des lots H0, H3 et H4, qui garde le reste de sa logique.
create or replace function public.sejours_sans_chevauchement()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  autre record;
begin
  if new.client_id is not null and not exists (
    select 1 from public.resa_clients r
    where r.id = new.client_id and r.etablissement_id = new.etablissement_id
  ) then
    raise exception 'CLIENT_INCONNU: la fiche client n''appartient pas à cet établissement'
      using errcode = '23503';
  end if;
  if new.hote_id is not null and not exists (
    select 1 from public.hotes h
    where h.id = new.hote_id and h.etablissement_id = new.etablissement_id
  ) then
    raise exception 'HOTE_INCONNU: la fiche hôte n''appartient pas à cet établissement'
      using errcode = '23503';
  end if;
  if new.tarif_id is not null and not exists (
    select 1 from public.tarifs t
    where t.id = new.tarif_id and t.etablissement_id = new.etablissement_id
  ) then
    raise exception 'TARIF_INCONNU: le tarif n''appartient pas à cet établissement'
      using errcode = '23503';
  end if;
  if new.forfait_id is not null and not exists (
    select 1 from public.forfaits f
    where f.id = new.forfait_id and f.etablissement_id = new.etablissement_id
  ) then
    raise exception 'FORFAIT_INCONNU: le forfait n''appartient pas à cet établissement'
      using errcode = '23503';
  end if;
  if new.chambre_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.chambres c
    where c.id = new.chambre_id and c.etablissement_id = new.etablissement_id
  ) then
    raise exception 'CHAMBRE_INCONNUE: la chambre n''appartient pas à cet établissement'
      using errcode = '23503';
  end if;
  if new.statut not in ('prevu', 'en_maison') then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.chambre_id::text, 0));
  select s.id, s.nom_hote, s.arrivee, s.depart
    into autre
  from public.sejours s
  where s.chambre_id = new.chambre_id
    and s.id <> new.id
    and s.statut in ('prevu', 'en_maison')
    and s.arrivee < new.depart
    and new.arrivee < s.depart
  order by s.arrivee
  limit 1;
  if found then
    raise exception 'SEJOUR_CHEVAUCHEMENT: la chambre est déjà prise du % au % (%)',
      to_char(autre.arrivee, 'DD.MM.YYYY'), to_char(autre.depart, 'DD.MM.YYYY'), autre.nom_hote
      using errcode = '23P01';
  end if;
  return new;
end;
$$;

revoke all on function public.sejours_sans_chevauchement() from public, anon, authenticated;

create or replace trigger trg_sejours_sans_chevauchement
  before insert or update of chambre_id, client_id, hote_id, tarif_id, forfait_id, etablissement_id, arrivee, depart, statut on public.sejours
  for each row execute function public.sejours_sans_chevauchement();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  direction text := '(select public.current_user_role()) in (''consultant'', ''patron'')';
  gerer text := '(select public.user_peut_gerer(''activites'', array[''consultant'', ''patron'', ''receptionniste'', ''hote'']))';
begin
  foreach t in array array['forfaits', 'forfait_droits', 'activites', 'activite_inscriptions', 'consommations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_can_access_etab(etablissement_id))', t || '_select', t);
  end loop;

  -- Forfaits et droits : la direction.
  foreach t in array array['forfaits', 'forfait_droits'] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_can_access_etab(etablissement_id) and %s)', t || '_insert', t, direction);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_can_access_etab(etablissement_id) and %s) with check (user_can_access_etab(etablissement_id) and %s)', t || '_update', t, direction, direction);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_can_access_etab(etablissement_id) and %s)', t || '_delete', t, direction);
  end loop;

  -- Activités : la case Modifier d'Activités.
  execute 'drop policy if exists activites_insert on public.activites';
  execute format('create policy activites_insert on public.activites for insert to authenticated with check (user_can_access_etab(etablissement_id) and %s)', gerer);
  execute 'drop policy if exists activites_update on public.activites';
  execute format('create policy activites_update on public.activites for update to authenticated using (user_can_access_etab(etablissement_id) and %s) with check (user_can_access_etab(etablissement_id) and %s)', gerer, gerer);
  execute 'drop policy if exists activites_delete on public.activites';
  execute format('create policy activites_delete on public.activites for delete to authenticated using (user_can_access_etab(etablissement_id) and %s)', gerer);

  -- Inscriptions et consommations : saisies par l'équipe, supprimées avec la
  -- case Modifier d'Activités. Une inscription se met à jour par l'équipe
  -- (présence, annulation ; le déclencheur interdit de la déplacer sans la
  -- case) ; une consommation ne se corrige qu'avec la case.
  foreach t in array array['activite_inscriptions', 'consommations'] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_can_access_etab(etablissement_id))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_can_access_etab(etablissement_id) and %s)', t || '_delete', t, gerer);
  end loop;
  execute 'drop policy if exists activite_inscriptions_update on public.activite_inscriptions';
  execute 'create policy activite_inscriptions_update on public.activite_inscriptions for update to authenticated using (user_can_access_etab(etablissement_id)) with check (user_can_access_etab(etablissement_id))';
  execute 'drop policy if exists consommations_update on public.consommations';
  execute format('create policy consommations_update on public.consommations for update to authenticated using (user_can_access_etab(etablissement_id) and %s) with check (user_can_access_etab(etablissement_id) and %s)', gerer, gerer);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Realtime
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['forfaits', 'forfait_droits', 'activites', 'activite_inscriptions', 'consommations'] loop
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
comment on table public.forfaits is 'Formules de séjour (lot H5) : all inclusive, spa, famille… ; prix par nuit facultatif.';
comment on table public.forfait_droits is 'Droits d''une formule (lot H5) : libellé, catégorie, quantité par séjour ou par jour (null = sans limite).';
comment on table public.activites is 'Programme d''activités (lot H5) : titre, lieu, début, fin, places, prix (0 = inclus), responsable.';
comment on table public.activite_inscriptions is 'Séjours inscrits à une activité (lot H5), nombre de personnes et présence ; capacité tenue par déclencheur.';
comment on table public.consommations is 'Consommations d''un séjour sur ses droits (lot H5), pointées au bracelet ou au nom.';
comment on column public.sejours.forfait_id is 'Formule du séjour (lot H5), facultative.';
comment on column public.sejours.identifiant is 'Numéro de bracelet ou de carte du séjour (lot H5), unique parmi les séjours actifs.';
