-- ════════════════════════════════════════════════════════════════════════════
-- Branche Hôtel, lot H4 : tarifs, note de séjour, occupants et registre
-- ───────────────────────────────────────────────────────────────────────────
-- Quatre tables neuves, expand only :
--   hotel_reglages    une ligne par établissement : commune, taxe de séjour
--                     communale (adulte, enfant, âges), taxe d'hébergement
--                     cantonale, TVA, numéro HESTA, mention de pied de note.
--   tarifs            prix par nuit par catégorie de chambre et pension,
--                     personnes incluses, supplément par personne, enfant,
--                     fenêtre de validité.
--   sejour_occupants  les personnes qui dorment : registre des nuitées (LHR,
--                     RS 935.1) et fiche de police (nom, naissance,
--                     nationalité, domicile, pièce d'identité), exonération
--                     de taxe. Nourrit la statistique HESTA (nuitées et
--                     arrivées par pays de domicile).
--   sejour_lignes     la note de séjour (folio) : nuitées, pension, taxes,
--                     extras, remises, encaissements ; montant calculé en base.
-- sejours reçoit tarif_id et prix_nuit (prix convenu), nullables.
--
-- Droits : réglages et tarifs lus par l'équipe de l'établissement, écrits par
-- consultant et patron ; occupants (pièces d'identité) et note de séjour lus et
-- écrits avec la case Modifier d'Hébergement (consultant, patron, réception
-- par défaut), supprimés par consultant et patron seulement (une correction
-- de note passe par une ligne de contre-passation). Les occupants et la note
-- suivent le séjour s'il est supprimé (cascade, choix assumé).
-- Idempotente. Inverse : migrations-inverse/20261028_hotel_h4.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.hotel_reglages (
  etablissement_id    text        primary key references public.etablissements(id) on delete cascade,
  commune             text,
  taxe_sejour_adulte  numeric(8,2) not null default 0 check (taxe_sejour_adulte >= 0),
  taxe_sejour_enfant  numeric(8,2) not null default 0 check (taxe_sejour_enfant >= 0),
  age_enfant_exonere  int         not null default 6  check (age_enfant_exonere between 0 and 18),
  age_enfant_reduit   int         not null default 16 check (age_enfant_reduit between 0 and 18),
  taxe_hebergement    numeric(8,2) not null default 0 check (taxe_hebergement >= 0),
  tva_taux            numeric(5,2) not null default 3.8 check (tva_taux >= 0 and tva_taux < 100),
  numero_hesta        text,
  mention_note        text,
  updated_at          timestamptz not null default now(),
  constraint hotel_reglages_ages check (age_enfant_exonere <= age_enfant_reduit)
);

create table if not exists public.tarifs (
  id                  uuid        primary key default gen_random_uuid(),
  etablissement_id    text        not null references public.etablissements(id) on delete cascade,
  nom                 text        not null check (btrim(nom) <> ''),
  categorie           text,
  pension             text        not null default 'petit_dejeuner'
                      check (pension in ('aucune', 'petit_dejeuner', 'demi', 'complete', 'all_inclusive')),
  prix_nuit           numeric(10,2) not null check (prix_nuit >= 0),
  personnes_incluses  int         not null default 2 check (personnes_incluses between 1 and 20),
  prix_personne_sup   numeric(10,2) not null default 0 check (prix_personne_sup >= 0),
  prix_enfant         numeric(10,2) not null default 0 check (prix_enfant >= 0),
  valable_du          date,
  valable_au          date,
  actif               boolean     not null default true,
  ordre               int         not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint tarifs_validite check (valable_du is null or valable_au is null or valable_au >= valable_du)
);
create index if not exists idx_tarifs_etab on public.tarifs(etablissement_id, ordre, nom);

create table if not exists public.sejour_occupants (
  id                  uuid        primary key default gen_random_uuid(),
  etablissement_id    text        not null references public.etablissements(id) on delete cascade,
  sejour_id           uuid        not null references public.sejours(id) on delete cascade,
  hote_id             uuid        references public.hotes(id) on delete set null,
  prenom              text,
  nom                 text,
  date_naissance      date        check (date_naissance is null or date_naissance >= date '1900-01-01'),
  nationalite         text,
  domicile_adresse    text,
  domicile_localite   text,
  domicile_pays       text,
  piece_type          text        check (piece_type is null or piece_type in ('passeport', 'carte_identite', 'permis', 'autre')),
  piece_numero        text,
  arrivee             date        not null,
  depart              date        not null,
  exonere_taxe        boolean     not null default false,
  exonere_motif       text,
  created_by          text        references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint sejour_occupants_identite check (btrim(coalesce(prenom, '') || coalesce(nom, '')) <> ''),
  constraint sejour_occupants_dates check (depart > arrivee)
);
create index if not exists idx_sejour_occupants_etab_arrivee on public.sejour_occupants(etablissement_id, arrivee);
create index if not exists idx_sejour_occupants_sejour on public.sejour_occupants(sejour_id);
create index if not exists idx_sejour_occupants_hote on public.sejour_occupants(hote_id);
create index if not exists idx_sejour_occupants_created_by on public.sejour_occupants(created_by);

create table if not exists public.sejour_lignes (
  id                  uuid        primary key default gen_random_uuid(),
  etablissement_id    text        not null references public.etablissements(id) on delete cascade,
  sejour_id           uuid        not null references public.sejours(id) on delete cascade,
  jour                date        not null,
  type                text        not null
                      check (type in ('nuitee', 'pension', 'taxe_sejour', 'taxe_hebergement', 'extra', 'remise', 'paiement')),
  libelle             text        not null check (btrim(libelle) <> ''),
  quantite            numeric(10,2) not null default 1 check (quantite > 0),
  prix_unitaire       numeric(10,2) not null default 0,
  montant             numeric(12,2) generated always as (round(quantite * prix_unitaire, 2)) stored,
  tva_taux            numeric(5,2) check (tva_taux is null or (tva_taux >= 0 and tva_taux < 100)),
  note                text,
  created_by          text        references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  -- Remises et encaissements diminuent la note : prix négatif ou nul ; le reste l'augmente.
  constraint sejour_lignes_signe check (
    case when type in ('remise', 'paiement') then prix_unitaire <= 0 else prix_unitaire >= 0 end
  )
);
create index if not exists idx_sejour_lignes_sejour on public.sejour_lignes(sejour_id);
create index if not exists idx_sejour_lignes_etab_jour on public.sejour_lignes(etablissement_id, jour);
create index if not exists idx_sejour_lignes_created_by on public.sejour_lignes(created_by);

alter table public.sejours add column if not exists tarif_id uuid references public.tarifs(id) on delete set null;
alter table public.sejours add column if not exists prix_nuit numeric(10,2) check (prix_nuit is null or prix_nuit >= 0);
create index if not exists idx_sejours_tarif on public.sejours(tarif_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Déclencheurs
-- ─────────────────────────────────────────────────────────────────────────────
create or replace trigger trg_hotel_reglages_updated_at
  before update on public.hotel_reglages
  for each row execute function public.set_updated_at();
create or replace trigger trg_tarifs_updated_at
  before update on public.tarifs
  for each row execute function public.set_updated_at();
create or replace trigger trg_sejour_occupants_updated_at
  before update on public.sejour_occupants
  for each row execute function public.set_updated_at();

-- Cohérence des occupants et des lignes : séjour (et fiche hôte) du même
-- établissement, établissement fixe, auteur posé par la base et immuable sauf
-- suppression de son profil ; les dates d'un occupant héritent du séjour.
create or replace function public.hotel_h4_coherence()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  s record;
begin
  if tg_op = 'UPDATE' and new.etablissement_id <> old.etablissement_id then
    raise exception 'ETABLISSEMENT_FIXE: une ligne ne change pas d''établissement' using errcode = '23514';
  end if;
  select sj.etablissement_id, sj.arrivee, sj.depart into s from public.sejours sj where sj.id = new.sejour_id;
  if not found or s.etablissement_id <> new.etablissement_id then
    raise exception 'SEJOUR_INCONNU: le séjour n''appartient pas à cet établissement' using errcode = '23503';
  end if;
  if tg_table_name = 'sejour_occupants' then
    if new.hote_id is not null and not exists (
      select 1 from public.hotes h where h.id = new.hote_id and h.etablissement_id = new.etablissement_id
    ) then
      raise exception 'HOTE_INCONNU: la fiche hôte n''appartient pas à cet établissement' using errcode = '23503';
    end if;
    new.arrivee := coalesce(new.arrivee, s.arrivee);
    new.depart := coalesce(new.depart, s.depart);
    if new.arrivee < s.arrivee or new.depart > s.depart then
      raise exception 'OCCUPANT_HORS_SEJOUR: les dates de l''occupant sortent du séjour' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.created_by := (select auth.uid())::text;
    end if;
  elsif new.created_by is distinct from old.created_by and (select auth.uid()) is not null
     and (new.created_by is not null or exists (select 1 from public.profiles p where p.id = old.created_by)) then
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

revoke all on function public.hotel_h4_coherence() from public, anon, authenticated;

create or replace trigger trg_sejour_occupants_coherence
  before insert or update on public.sejour_occupants
  for each row execute function public.hotel_h4_coherence();
create or replace trigger trg_sejour_lignes_coherence
  before insert or update on public.sejour_lignes
  for each row execute function public.hotel_h4_coherence();

-- Un séjour ne pointe que vers un tarif de son établissement : ajouté au
-- déclencheur des lots H0 et H3, qui garde le reste de sa logique.
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
  before insert or update of chambre_id, client_id, hote_id, tarif_id, etablissement_id, arrivee, depart, statut on public.sejours
  for each row execute function public.sejours_sans_chevauchement();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['hotel_reglages', 'tarifs', 'sejour_occupants', 'sejour_lignes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;

  -- Réglages et tarifs : lus par l'équipe.
  foreach t in array array['hotel_reglages', 'tarifs'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_can_access_etab(etablissement_id))', t || '_select', t);
  end loop;

  -- Occupants et note : lus avec la case Modifier d'Hébergement (pièces
  -- d'identité et encaissements ne se lisent pas par l'API sans ce droit).
  foreach t in array array['sejour_occupants', 'sejour_lignes'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_can_access_etab(etablissement_id) and (select public.user_peut_gerer(''hebergement'', array[''consultant'', ''patron'', ''receptionniste''])))', t || '_select', t);
  end loop;

  -- Réglages et tarifs : la direction.
  foreach t in array array['hotel_reglages', 'tarifs'] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_can_access_etab(etablissement_id) and (select public.current_user_role()) in (''consultant'', ''patron''))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_can_access_etab(etablissement_id) and (select public.current_user_role()) in (''consultant'', ''patron'')) with check (user_can_access_etab(etablissement_id) and (select public.current_user_role()) in (''consultant'', ''patron''))', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_can_access_etab(etablissement_id) and (select public.current_user_role()) in (''consultant'', ''patron''))', t || '_delete', t);
  end loop;

  -- Occupants et note de séjour : la case Modifier d'Hébergement.
  foreach t in array array['sejour_occupants', 'sejour_lignes'] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_can_access_etab(etablissement_id) and (select public.user_peut_gerer(''hebergement'', array[''consultant'', ''patron'', ''receptionniste''])))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_can_access_etab(etablissement_id) and (select public.user_peut_gerer(''hebergement'', array[''consultant'', ''patron'', ''receptionniste'']))) with check (user_can_access_etab(etablissement_id) and (select public.user_peut_gerer(''hebergement'', array[''consultant'', ''patron'', ''receptionniste''])))', t || '_update', t);
    -- Supprimer une ligne de note ou une fiche du registre : la direction.
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_can_access_etab(etablissement_id) and (select public.current_user_role()) in (''consultant'', ''patron''))', t || '_delete', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Realtime
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['hotel_reglages', 'tarifs', 'sejour_occupants', 'sejour_lignes'] loop
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
comment on table public.hotel_reglages is
  'Réglages de l''hôtel (lot H4) : commune, taxe de séjour communale (adulte, enfant, âges d''exonération et de tarif réduit), taxe d''hébergement cantonale par nuitée, TVA hébergement, numéro HESTA, mention de pied de la note de séjour.';
comment on table public.tarifs is
  'Tarifs par nuit (lot H4) : catégorie de chambre (null = toutes), pension, personnes incluses, supplément par personne, prix enfant, fenêtre de validité.';
comment on table public.sejour_occupants is
  'Personnes hébergées par séjour (lot H4) : registre des nuitées et fiche de police (LHR Valais, RS 935.1), domicile pour la statistique HESTA, exonération de taxe de séjour.';
comment on table public.sejour_lignes is
  'Note de séjour (lot H4) : nuitées, pension, taxes, extras, remises et encaissements ; montant calculé en base (quantité fois prix).';
comment on column public.sejours.tarif_id is 'Tarif appliqué au séjour (lot H4), facultatif.';
comment on column public.sejours.prix_nuit is 'Prix par nuit convenu (lot H4), prime sur le tarif quand il est renseigné.';
