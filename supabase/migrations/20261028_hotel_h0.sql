-- ════════════════════════════════════════════════════════════════════════════
-- Branche Hôtel, lot H0 « socle » : chambres, séjours et journal des étages
-- ───────────────────────────────────────────────────────────────────────────
-- Brief autonome du 28.10.2026. Quand un établissement est de type Hôtel ou
-- Hôtel-Restaurant, l'app propose deux modules « à activer » (Hébergement et
-- Étages) sur cette base, que les lots H1 à H10 réutilisent.
--
-- Trois tables neuves, rien d'autre (expand only : aucune table existante
-- modifiée, etablissements.type reste du texte libre) :
--   • chambres : une ligne par chambre, avec son statut de ménage et la
--     personne à qui elle est attribuée ;
--   • sejours : arrivée, départ (dates civiles), occupants, pension, statut ;
--     une chambre affectée ou pas encore ;
--   • chambres_statut_journal : qui a passé une chambre de quel statut à quel
--     autre, et quand (écrit par déclencheur, jamais par le front).
--
-- Chevauchement de séjours sur une chambre : refusé par un déclencheur plpgsql
-- (le dépôt n'utilise pas btree_gist). Seuls les séjours prévus ou en maison
-- comptent ; un séjour annulé ou en no-show libère la chambre. Le jour du
-- départ est le jour d'une arrivée possible (depart > arrivee, bornes ouvertes).
--
-- Droits (même helper d'appartenance que reservations et resa_clients) :
--   • lecture par l'équipe de l'établissement (user_can_access_etab) ;
--   • séjours et fiches de chambres : case « Modifier » d'Hébergement
--     (user_peut_gerer('hebergement'), consultant et patron par défaut) ;
--   • statut de ménage, motif hors service, attribution et notes d'une
--     chambre : case « Modifier » d'Étages (user_peut_gerer('etages'),
--     consultant et patron par défaut), les autres colonnes restant à
--     Hébergement (déclencheur chambres_garde_colonnes) ;
--   • journal : lecture seule ; aucune politique d'écriture (déclencheur
--     SECURITY DEFINER).
-- Un compte désactivé, sans profil ou sans périmètre ne lit rien : c'est le
-- helper qui le dit (version 20261027_securite_compte_inactif).
--
-- Horodatages en UTC (timestamptz), affichés Europe/Zurich par le front
-- (zurichTime.js) ; nuitées en date civile. Realtime sur les trois tables.
-- Idempotente : rejouable sans erreur. Inverse écrite à part, jamais appliquée
-- par outil : supabase/migrations-inverse/20261028_hotel_h0.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.chambres (
  id                 uuid        primary key default gen_random_uuid(),
  etablissement_id   text        not null references public.etablissements(id) on delete cascade,
  numero             text        not null,
  etage              text,
  categorie          text,
  capacite           integer     not null default 2 check (capacite >= 1),
  statut_menage      text        not null default 'a_faire'
                                 check (statut_menage in ('a_faire', 'en_cours', 'propre', 'inspectee', 'hors_service')),
  hors_service_motif text,
  attribuee_a        text        references public.profiles(id) on delete set null,
  notes              text,
  ordre              integer     not null default 0,
  actif              boolean     not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint chambres_numero_non_vide check (btrim(numero) <> ''),
  constraint uq_chambres_etab_numero unique (etablissement_id, numero)
);

create index if not exists idx_chambres_etab_ordre on public.chambres(etablissement_id, ordre, numero);
create index if not exists idx_chambres_attribuee_a on public.chambres(attribuee_a);

create table if not exists public.sejours (
  id                 uuid        primary key default gen_random_uuid(),
  etablissement_id   text        not null references public.etablissements(id) on delete cascade,
  chambre_id         uuid        references public.chambres(id) on delete set null,
  client_id          text        references public.resa_clients(id) on delete set null,
  nom_hote           text        not null,
  nb_adultes         integer     not null default 1 check (nb_adultes >= 0),
  nb_enfants         integer     not null default 0 check (nb_enfants >= 0),
  arrivee            date        not null,
  depart             date        not null,
  statut             text        not null default 'prevu'
                                 check (statut in ('prevu', 'en_maison', 'parti', 'annule', 'no_show')),
  pension            text        not null default 'aucune'
                                 check (pension in ('aucune', 'petit_dejeuner', 'demi', 'complete', 'all_inclusive')),
  origine            text,
  demandes_speciales text,
  notes              text,
  created_by         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint sejours_nom_hote_non_vide check (btrim(nom_hote) <> ''),
  constraint sejours_dates check (depart > arrivee)
);

create index if not exists idx_sejours_etab_arrivee on public.sejours(etablissement_id, arrivee);
create index if not exists idx_sejours_etab_depart  on public.sejours(etablissement_id, depart);
create index if not exists idx_sejours_chambre      on public.sejours(chambre_id);
create index if not exists idx_sejours_client       on public.sejours(client_id);

create table if not exists public.chambres_statut_journal (
  id                 uuid        primary key default gen_random_uuid(),
  etablissement_id   text        not null references public.etablissements(id) on delete cascade,
  chambre_id         uuid        not null references public.chambres(id) on delete cascade,
  ancien             text,
  nouveau            text        not null,
  par                text        references public.profiles(id) on delete set null,
  at                 timestamptz not null default now()
);

create index if not exists idx_chambres_journal_chambre on public.chambres_statut_journal(chambre_id, at desc);
create index if not exists idx_chambres_journal_etab    on public.chambres_statut_journal(etablissement_id);
create index if not exists idx_chambres_journal_par     on public.chambres_statut_journal(par);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Déclencheurs
-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at : fonction set_updated_at() déjà en base (migration 20260715_kds_orders).
create or replace trigger trg_chambres_updated_at
  before update on public.chambres
  for each row execute function public.set_updated_at();

create or replace trigger trg_sejours_updated_at
  before update on public.sejours
  for each row execute function public.set_updated_at();

-- Journal des statuts : à la création d'une chambre (ancien = null) et à chaque
-- changement de statut_menage. `par` = le profil connecté s'il existe (un
-- compte sans profil ou l'éditeur SQL laissent null). SECURITY DEFINER : le
-- journal n'a aucune politique d'écriture, seul ce déclencheur y écrit.
create or replace function public.chambres_journal_statut()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.statut_menage is not distinct from old.statut_menage then
      return new;
    end if;
  end if;
  insert into public.chambres_statut_journal (etablissement_id, chambre_id, ancien, nouveau, par)
  values (
    new.etablissement_id,
    new.id,
    case when tg_op = 'UPDATE' then old.statut_menage end,
    new.statut_menage,
    (select p.id from public.profiles p where p.id = auth.uid()::text)
  );
  return new;
end;
$$;

revoke all on function public.chambres_journal_statut() from public, anon, authenticated;

create or replace trigger trg_chambres_journal_statut
  after insert or update of statut_menage on public.chambres
  for each row execute function public.chambres_journal_statut();

-- Garde des colonnes : une chambre ne change jamais d'établissement (ses
-- séjours la suivraient dans un autre hôtel) ; sans la case « Modifier »
-- d'Hébergement, une mise à jour ne touche que le ménage (statut, motif hors
-- service, attribution, notes). Hors session (éditeur SQL, service role), seule
-- la première règle s'applique.
create or replace function public.chambres_garde_colonnes()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.etablissement_id <> old.etablissement_id then
    raise exception 'CHAMBRE_ETABLISSEMENT_FIXE: une chambre ne change pas d''établissement'
      using errcode = '23514';
  end if;
  if (select auth.uid()) is null then
    return new;
  end if;
  if public.user_peut_gerer('hebergement', array['consultant', 'patron']) then
    return new;
  end if;
  if new.numero <> old.numero
     or new.etage is distinct from old.etage
     or new.categorie is distinct from old.categorie
     or new.capacite <> old.capacite
     or new.ordre <> old.ordre
     or new.actif <> old.actif then
    raise exception 'CHAMBRE_FICHE_RESERVEE: la fiche de la chambre (numéro, étage, catégorie, capacité, ordre, actif) se modifie avec le droit Hébergement'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.chambres_garde_colonnes() from public, anon, authenticated;

create or replace trigger trg_chambres_garde_colonnes
  before update on public.chambres
  for each row execute function public.chambres_garde_colonnes();

-- Chevauchement : un séjour prévu ou en maison ne peut pas partager une chambre
-- avec un autre séjour prévu ou en maison sur des nuitées communes. La chambre
-- et la fiche client doivent être de l'établissement du séjour. SECURITY
-- INVOKER : les autres séjours se lisent avec les droits de l'appelant (même
-- établissement, par la RLS). Un verrou de transaction par chambre sérialise
-- deux saisies simultanées : la seconde attend la première et voit son séjour.
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
  before insert or update of chambre_id, client_id, etablissement_id, arrivee, depart, statut on public.sejours
  for each row execute function public.sejours_sans_chevauchement();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.chambres                enable row level security;
alter table public.sejours                 enable row level security;
alter table public.chambres_statut_journal enable row level security;

revoke all on table public.chambres                from anon;
revoke all on table public.sejours                 from anon;
revoke all on table public.chambres_statut_journal from anon;
-- Le journal ne s'écrit que par déclencheur : lecture seule pour l'équipe.
revoke all on table public.chambres_statut_journal from authenticated;
grant select on table public.chambres_statut_journal to authenticated;

-- ── chambres ────────────────────────────────────────────────────────────────
drop policy if exists chambres_select on public.chambres;
create policy chambres_select on public.chambres
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists chambres_insert on public.chambres;
create policy chambres_insert on public.chambres
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('hebergement', array['consultant', 'patron']))
  );

-- Mise à jour : Hébergement (toute la fiche) ou Étages (ménage seulement, le
-- déclencheur chambres_garde_colonnes borne les colonnes).
drop policy if exists chambres_update on public.chambres;
create policy chambres_update on public.chambres
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (
      (select public.user_peut_gerer('hebergement', array['consultant', 'patron']))
      or (select public.user_peut_gerer('etages', array['consultant', 'patron']))
    )
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (
      (select public.user_peut_gerer('hebergement', array['consultant', 'patron']))
      or (select public.user_peut_gerer('etages', array['consultant', 'patron']))
    )
  );

drop policy if exists chambres_delete on public.chambres;
create policy chambres_delete on public.chambres
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('hebergement', array['consultant', 'patron']))
  );

-- ── sejours ─────────────────────────────────────────────────────────────────
drop policy if exists sejours_select on public.sejours;
create policy sejours_select on public.sejours
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists sejours_insert on public.sejours;
create policy sejours_insert on public.sejours
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('hebergement', array['consultant', 'patron']))
  );

drop policy if exists sejours_update on public.sejours;
create policy sejours_update on public.sejours
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('hebergement', array['consultant', 'patron']))
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('hebergement', array['consultant', 'patron']))
  );

drop policy if exists sejours_delete on public.sejours;
create policy sejours_delete on public.sejours
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('hebergement', array['consultant', 'patron']))
  );

-- ── chambres_statut_journal : lecture seule ──────────────────────────────────
drop policy if exists chambres_statut_journal_select on public.chambres_statut_journal;
create policy chambres_statut_journal_select on public.chambres_statut_journal
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Realtime
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['chambres', 'sejours', 'chambres_statut_journal'] loop
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
comment on table public.chambres is
  'Chambres d''un établissement hôtelier (lot H0). Statut de ménage : a_faire, en_cours, propre, inspectee, hors_service. Fiche modifiée avec le droit Hébergement, ménage avec le droit Étages (déclencheur chambres_garde_colonnes).';
comment on column public.chambres.attribuee_a is
  'Personne chargée du ménage de la chambre (profiles.id), réglée depuis le module Étages.';
comment on table public.sejours is
  'Séjours (lot H0) : arrivée et départ en dates civiles, statut prevu, en_maison, parti, annule, no_show ; pension aucune, petit_dejeuner, demi, complete, all_inclusive. Chevauchement sur une chambre refusé par le déclencheur sejours_sans_chevauchement (statuts prevu et en_maison).';
comment on column public.sejours.client_id is
  'Fiche client du restaurant (resa_clients), facultative : la fiche hôte unique vient au lot H3.';
comment on table public.chambres_statut_journal is
  'Journal des statuts de ménage : ancien, nouveau, par qui (profiles.id) et quand. Écrit par le déclencheur chambres_journal_statut, lecture seule pour l''équipe.';
