-- ════════════════════════════════════════════════════════════════════════════
-- Caisse : commande de boissons par QR, validée au bar (lot L3, 22.11.2026).
--
-- Un QR fixe par établissement mène à la page publique /commande/<adresse>.
-- Le client y choisit dans la carte ouverte au QR (catégories de caisse
-- choisies par la direction, produits hors rupture du jour), donne sa table
-- ou « au bar » et son prénom, puis envoie. La commande arrive en caisse
-- « à valider » : le bar l'accepte (ce qui permet de demander une pièce
-- d'identité pour l'alcool) ou la refuse avec un motif. Le client paie à
-- table ou au comptoir : aucun paiement en ligne.
--
-- Où vit l'état « à valider ». La commande attend dans sa propre table,
-- caisse_commandes_qr, et ne devient un ticket qu'à l'acceptation. Aucune
-- ligne de caisse_tickets ne naît donc dans un état nouveau : rapports,
-- clôture, chaîne d'intégrité, Statistiques et plan de salle lisent
-- exactement ce qu'ils lisaient. Une commande refusée ne compte nulle part,
-- par construction (elle n'a jamais eu de ticket). Une commande qui attend
-- plus de 3 heures expire : refusée d'office (« Commande expirée »).
--
--   caisse_commande_qr_parametres  une ligne par établissement : actif,
--                                  adresse (slug), catégories ouvertes,
--                                  plages horaires (heure de Zurich).
--                                  Lecture : l'équipe. Écriture : consultant
--                                  et patron (la direction).
--   caisse_commandes_qr            les commandes reçues. Lecture : l'équipe
--                                  de l'établissement, comme les tickets.
--                                  Aucune écriture par l'API : tout passe par
--                                  les RPC ci-dessous. Publiée en temps réel.
--   caisse_commandes_qr_sources    l'appareil et l'empreinte de la source
--                                  réseau de chaque commande, pour les
--                                  plafonds. Aucun droit pour l'API : ni
--                                  l'équipe ni le temps réel ne les voient
--                                  (une adresse IP est une donnée personnelle).
--
--   commande_qr_carte(slug)        ANONYME. La carte ouverte, et rien d'autre :
--                                  nom de la maison, ouvert ou non, plages,
--                                  catégories ouvertes, produits (nom, prix,
--                                  photo publique du projet). Une adresse
--                                  inconnue et une adresse éteinte rendent la
--                                  même réponse.
--   commande_qr_envoyer(...)       ANONYME. Revérifie tout côté serveur :
--                                  actif, heure, table (un seul nom exact),
--                                  produits ouverts, prix de la base (jamais
--                                  ceux du client), rupture du jour, bornes de
--                                  taille (20 lignes, 10 par produit, 30
--                                  articles), plafonds d'envoi (appareil,
--                                  table, source réseau, établissement).
--                                  Rend { ok, total, articles } ou { erreur },
--                                  jamais une donnée de la maison.
--   commande_qr_accepter(id)       qui a la caisse : ouvre (ou reprend) le
--                                  ticket de la table par caisse_ouvrir_ticket,
--                                  ou un ticket sans table pour le bar, y pose
--                                  les lignes au prix de la base et envoie un
--                                  bon au KDS pour ces seules lignes (celles
--                                  que le serveur garde en attente ne partent
--                                  pas).
--   commande_qr_refuser(id, motif) qui a la caisse, motif de 3 à 200 signes.
--
-- Le plafond « par appareil » repose sur un identifiant tiré au hasard par le
-- téléphone : c'est une mémoire, pas une preuve (n'importe qui peut en
-- inventer un). Les vraies bornes sont celles de la source réseau (empreinte
-- de cf-connecting-ip, posé par la passerelle, quand il l'est), de la table
-- et de l'établissement (au plus 30 commandes en attente, 20 par minute) : un
-- envoi en rafale ne noie jamais le bandeau de la caisse, et l'expiration à
-- 3 heures le vide d'elle-même.
--
-- Expand seul : trois tables et six fonctions neuves, aucune table existante
-- modifiée (seule la publication temps réel reçoit la table neuve). Le front
-- en ligne n'en lit rien. Idempotente. Inverse :
-- 20261122_caisse_commande_qr.rollback.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Réglages par établissement
-- ─────────────────────────────────────────────────────────────────────────────

-- Plages horaires : tableau d'au plus 4 objets { "de": "HH:MM", "a": "HH:MM" },
-- valables tous les jours. « a » est exclu ; une plage qui passe minuit
-- (de > a) est permise. Un tableau vide veut dire « à toute heure ».
create or replace function public.caisse_qr_plages_valides(p_plages jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_typeof(p_plages) = 'array'
     and jsonb_array_length(p_plages) <= 4
     and not exists (
       select 1 from jsonb_array_elements(p_plages) e(v)
        where jsonb_typeof(e.v) <> 'object'
           or coalesce(e.v->>'de', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           or coalesce(e.v->>'a', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           or e.v->>'de' = e.v->>'a'
     );
$$;

create table if not exists public.caisse_commande_qr_parametres (
  etablissement_id text        primary key references public.etablissements(id) on delete cascade,
  actif            boolean     not null default false,
  slug             text,
  categories       uuid[]      not null default '{}',
  plages           jsonb       not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

do $$
begin
  -- Même forme que l'adresse de réservation en ligne ; « demo... » est
  -- réservé à la démo publique (/commande/demo, sans base).
  if not exists (select 1 from pg_constraint where conname = 'caisse_qr_slug_forme') then
    alter table public.caisse_commande_qr_parametres
      add constraint caisse_qr_slug_forme
      check (slug is null or (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$' and slug !~ '^demo'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'caisse_qr_plages_forme') then
    alter table public.caisse_commande_qr_parametres
      add constraint caisse_qr_plages_forme check (public.caisse_qr_plages_valides(plages));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'caisse_qr_categories_bornees') then
    alter table public.caisse_commande_qr_parametres
      add constraint caisse_qr_categories_bornees check (cardinality(categories) <= 60);
  end if;
  -- Une adresse est requise pour ouvrir la commande.
  if not exists (select 1 from pg_constraint where conname = 'caisse_qr_actif_adresse') then
    alter table public.caisse_commande_qr_parametres
      add constraint caisse_qr_actif_adresse check (not actif or slug is not null);
  end if;
end $$;

create unique index if not exists uq_caisse_qr_slug
  on public.caisse_commande_qr_parametres(slug) where slug is not null;

drop trigger if exists trg_caisse_qr_parametres_updated_at on public.caisse_commande_qr_parametres;
create trigger trg_caisse_qr_parametres_updated_at
  before update on public.caisse_commande_qr_parametres
  for each row execute function public.set_updated_at();

alter table public.caisse_commande_qr_parametres enable row level security;

drop policy if exists caisse_qr_parametres_select on public.caisse_commande_qr_parametres;
create policy caisse_qr_parametres_select on public.caisse_commande_qr_parametres
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists caisse_qr_parametres_insert on public.caisse_commande_qr_parametres;
create policy caisse_qr_parametres_insert on public.caisse_commande_qr_parametres
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id)
              and (select current_user_role()) = any(array['consultant', 'patron']));

drop policy if exists caisse_qr_parametres_update on public.caisse_commande_qr_parametres;
create policy caisse_qr_parametres_update on public.caisse_commande_qr_parametres
  for update to authenticated
  using (user_can_access_etab(etablissement_id)
         and (select current_user_role()) = any(array['consultant', 'patron']))
  with check (user_can_access_etab(etablissement_id)
              and (select current_user_role()) = any(array['consultant', 'patron']));

revoke all on table public.caisse_commande_qr_parametres from anon, authenticated;
grant select, insert, update on table public.caisse_commande_qr_parametres to authenticated;

comment on table public.caisse_commande_qr_parametres is
  'Commande par QR (lot L3) : actif, adresse /commande/<slug>, catégories de caisse ouvertes, plages horaires de Zurich. Écriture : consultant et patron.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Commandes reçues
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.caisse_commandes_qr (
  id                uuid        primary key default gen_random_uuid(),
  etablissement_id  text        not null references public.etablissements(id) on delete cascade,
  table_id          text        references public.salle_tables(id) on delete set null,
  -- Nom de la table au moment de la commande (reste lisible si la table part).
  table_nom         text,
  au_bar            boolean     not null default false,
  prenom            text        not null,
  -- [{ plat_id, libelle, quantite, prix_unitaire }] : prix de la base.
  lignes            jsonb       not null,
  total             numeric(10,2) not null,
  statut            text        not null default 'a_valider',
  motif_refus       text,
  traitee_par       text        references public.profiles(id) on delete set null,
  traitee_at        timestamptz,
  ticket_id         uuid        references public.caisse_tickets(id) on delete set null,
  created_at        timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'caisse_commandes_qr_statut') then
    alter table public.caisse_commandes_qr
      add constraint caisse_commandes_qr_statut check (statut in ('a_valider', 'acceptee', 'refusee'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'caisse_commandes_qr_forme') then
    alter table public.caisse_commandes_qr
      add constraint caisse_commandes_qr_forme check (
        char_length(prenom) between 1 and 40
        and jsonb_typeof(lignes) = 'array'
        and jsonb_array_length(lignes) between 1 and 20
        and total >= 0
        and (au_bar or table_nom is not null)
        and (table_nom is null or char_length(table_nom) <= 60)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'caisse_commandes_qr_refus_motive') then
    alter table public.caisse_commandes_qr
      add constraint caisse_commandes_qr_refus_motive check (
        statut <> 'refusee'
        or (motif_refus is not null and char_length(btrim(motif_refus)) between 3 and 200)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'caisse_commandes_qr_traitee') then
    alter table public.caisse_commandes_qr
      add constraint caisse_commandes_qr_traitee check (statut = 'a_valider' or traitee_at is not null);
  end if;
end $$;

-- Le bandeau de la caisse : les commandes en attente d'un établissement.
create index if not exists idx_caisse_commandes_qr_attente
  on public.caisse_commandes_qr(etablissement_id, created_at) where statut = 'a_valider';
-- Plafonds d'envoi et purge.
create index if not exists idx_caisse_commandes_qr_etab_date
  on public.caisse_commandes_qr(etablissement_id, created_at);
-- Clés étrangères (et plafond par table).
create index if not exists idx_caisse_commandes_qr_table on public.caisse_commandes_qr(table_id, created_at) where table_id is not null;
create index if not exists idx_caisse_commandes_qr_ticket on public.caisse_commandes_qr(ticket_id) where ticket_id is not null;
create index if not exists idx_caisse_commandes_qr_traitee_par on public.caisse_commandes_qr(traitee_par) where traitee_par is not null;

alter table public.caisse_commandes_qr enable row level security;

drop policy if exists caisse_commandes_qr_select on public.caisse_commandes_qr;
create policy caisse_commandes_qr_select on public.caisse_commandes_qr
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

revoke all on table public.caisse_commandes_qr from anon, authenticated;
grant select on table public.caisse_commandes_qr to authenticated;

comment on table public.caisse_commandes_qr is
  'Commandes reçues par QR (lot L3). « a_valider » tant que le bar n''a pas tranché (3 heures au plus) ; le ticket naît à l''acceptation (ticket_id). Écriture par les RPC commande_qr_* seulement.';

-- Appareil et source réseau : hors de toute lecture par l'API.
create table if not exists public.caisse_commandes_qr_sources (
  commande_id       uuid        primary key references public.caisse_commandes_qr(id) on delete cascade,
  etablissement_id  text        not null references public.etablissements(id) on delete cascade,
  appareil          text        not null,
  -- md5 de cf-connecting-ip et de l'établissement, quand la passerelle le pose.
  source_empreinte  text,
  created_at        timestamptz not null default now()
);
create index if not exists idx_caisse_qr_sources_appareil
  on public.caisse_commandes_qr_sources(appareil, created_at);
create index if not exists idx_caisse_qr_sources_source
  on public.caisse_commandes_qr_sources(source_empreinte, created_at) where source_empreinte is not null;
create index if not exists idx_caisse_qr_sources_etab
  on public.caisse_commandes_qr_sources(etablissement_id);

alter table public.caisse_commandes_qr_sources enable row level security;
revoke all on table public.caisse_commandes_qr_sources from anon, authenticated;

comment on table public.caisse_commandes_qr_sources is
  'Commande par QR (lot L3) : appareil et empreinte de la source réseau, pour les plafonds d''envoi. Aucun droit pour l''API.';

-- Temps réel : toutes les caisses ouvertes voient arriver la commande.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'caisse_commandes_qr'
     ) then
    alter publication supabase_realtime add table public.caisse_commandes_qr;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Règles partagées (internes, aucun droit d'exécution pour l'API)
-- ─────────────────────────────────────────────────────────────────────────────

-- Ouvert à cet instant, d'après les plages (heure de Zurich). Miroir de
-- ouvertMaintenant() dans src/commande/regles.js.
create or replace function public.caisse_qr_ouvert(p_plages jsonb, p_instant timestamptz)
returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_min int;
  v_de  int;
  v_a   int;
  v_p   jsonb;
begin
  if p_plages is null or jsonb_typeof(p_plages) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(p_plages) = 0 then
    return true;
  end if;
  v_min := extract(hour from (p_instant at time zone 'Europe/Zurich'))::int * 60
         + extract(minute from (p_instant at time zone 'Europe/Zurich'))::int;
  for v_p in select value from jsonb_array_elements(p_plages) loop
    v_de := split_part(v_p->>'de', ':', 1)::int * 60 + split_part(v_p->>'de', ':', 2)::int;
    v_a  := split_part(v_p->>'a', ':', 1)::int * 60 + split_part(v_p->>'a', ':', 2)::int;
    if v_de < v_a and v_min >= v_de and v_min < v_a then return true; end if;
    if v_de > v_a and (v_min >= v_de or v_min < v_a) then return true; end if;
  end loop;
  return false;
end;
$$;

-- Les produits des catégories ouvertes au QR d'un établissement, au prix de
-- la base, avec leur état de rupture du jour. Mêmes règles que la grille de
-- la caisse (src/modules/caisse/reglages.js, categories.js, rupture.js) :
--   • plats actifs portés par une carte en vente (ni archivée ni masquée,
--     et parmi caisse_reglages.config.cartes_ids quand la maison en a
--     choisi) ; sans aucune liaison de carte, repli sur tous les plats actifs ;
--   • catégorie de caisse : celle du bouton, sinon celle qui porte le nom de
--     plats.categorie (« Plats » par défaut) ; elle doit être active et
--     ouverte au QR ;
--   • prix de vente au-dessus de zéro ;
--   • en_rupture : rupture_le vaut aujourd'hui à Zurich (la carte les retire,
--     l'envoi les refuse).
-- La photo n'est rendue que si elle vit dans un dossier public du stockage
-- du projet.
create or replace function public.caisse_qr_articles(p_etab text, p_categories uuid[])
returns table (plat_id text, nom text, prix numeric, categorie_id uuid, photo_url text, en_rupture boolean)
language sql
stable
set search_path = public, pg_temp
as $$
  with reglage as (
    select coalesce(
             (select array_agg(x) from jsonb_array_elements_text(
                case when jsonb_typeof(r.config->'cartes_ids') = 'array' then r.config->'cartes_ids' else '[]'::jsonb end) x),
             '{}'::text[]) as ids
      from (select 1) un
      left join public.caisse_reglages r on r.etablissement_id = p_etab
  ),
  en_vente as (
    select c.id
      from public.cartes c, reglage g
     where c.etablissement_id = p_etab
       and not coalesce(c.archive, false)
       and not coalesce(c.masquee, false)
       and (cardinality(g.ids) = 0 or c.id = any(g.ids))
  ),
  actifs as (
    select p.* from public.plats p
     where p.etablissement_id = p_etab and coalesce(p.actif, true)
  ),
  sur_carte as (
    select a.* from actifs a
     where exists (select 1 from public.carte_plats cp join en_vente v on v.id = cp.carte_id where cp.plat_id = a.id)
  ),
  articles as (
    select * from sur_carte
    union all
    select a.* from actifs a, reglage g
     where cardinality(g.ids) = 0 and not exists (select 1 from sur_carte)
  ),
  ranges as (
    select a.id, a.nom, a.prix_vente, a.photo_url as photo_plat, b.photo_url as photo_bouton, b.rupture_le,
           coalesce(
             (select c.id from public.caisse_categories c
               where c.id = b.categorie_id and c.etablissement_id = p_etab),
             (select c.id from public.caisse_categories c
               where c.etablissement_id = p_etab
                 and lower(btrim(c.nom)) = lower(coalesce(nullif(btrim(a.categorie), ''), 'Plats'))
               order by c.ordre, c.nom limit 1)
           ) as categorie_id
      from articles a
      left join public.caisse_boutons b on b.plat_id = a.id and b.etablissement_id = p_etab
  )
  select r.id, r.nom, round(r.prix_vente, 2), r.categorie_id,
         case
           when coalesce(r.photo_bouton, r.photo_plat) like 'https://ppmtoiqgajwcdkbnrcll.supabase.co/storage/v1/object/public/%'
             then coalesce(r.photo_bouton, r.photo_plat)
         end,
         coalesce(r.rupture_le = (now() at time zone 'Europe/Zurich')::date, false)
    from ranges r
    join public.caisse_categories c on c.id = r.categorie_id and c.etablissement_id = p_etab and coalesce(c.actif, true)
   where r.categorie_id = any(p_categories)
     and r.prix_vente > 0;
$$;

revoke all on function public.caisse_qr_plages_valides(jsonb) from public, anon, authenticated;
-- La contrainte caisse_qr_plages_forme l'appelle sous l'identité de qui écrit.
grant execute on function public.caisse_qr_plages_valides(jsonb) to authenticated;
revoke all on function public.caisse_qr_ouvert(jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.caisse_qr_articles(text, uuid[]) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Page publique : la carte ouverte
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.commande_qr_carte(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_p      public.caisse_commande_qr_parametres%rowtype;
  v_nom    text;
  v_ouvert boolean;
begin
  if p_slug is null or lower(p_slug) !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$' then
    return jsonb_build_object('erreur', 'introuvable');
  end if;
  select * into v_p from public.caisse_commande_qr_parametres
   where slug = lower(p_slug) and actif;
  if not found then
    return jsonb_build_object('erreur', 'introuvable');
  end if;
  select e.nom into v_nom from public.etablissements e
   where e.id = v_p.etablissement_id and coalesce(e.actif, true);
  if not found then
    return jsonb_build_object('erreur', 'introuvable');
  end if;

  v_ouvert := public.caisse_qr_ouvert(v_p.plages, now());
  if not v_ouvert then
    return jsonb_build_object('etablissement', v_nom, 'ouvert', false, 'plages', v_p.plages,
                              'categories', '[]'::jsonb, 'produits', '[]'::jsonb);
  end if;

  return (
    with a as (
      select * from public.caisse_qr_articles(v_p.etablissement_id, v_p.categories) x where not x.en_rupture
    )
    select jsonb_build_object(
      'etablissement', v_nom,
      'ouvert', true,
      'plages', v_p.plages,
      'categories', coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'nom', c.nom) order by c.ordre, c.nom)
          from public.caisse_categories c
         where c.etablissement_id = v_p.etablissement_id
           and exists (select 1 from a where a.categorie_id = c.id)
      ), '[]'::jsonb),
      'produits', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', a.plat_id, 'nom', a.nom, 'prix', a.prix,
                 'categorie_id', a.categorie_id, 'photo', a.photo_url)
               order by a.categorie_id, b.ordre nulls last, a.nom)
          from a
          left join public.caisse_boutons b on b.plat_id = a.plat_id and b.etablissement_id = v_p.etablissement_id
      ), '[]'::jsonb)
    )
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Page publique : l'envoi
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.commande_qr_envoyer(
  p_slug      text,
  p_table     text,
  p_au_bar    boolean,
  p_prenom    text,
  p_lignes    jsonb,
  p_appareil  text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_p         public.caisse_commande_qr_parametres%rowtype;
  v_prenom    text;
  v_table     text;
  v_table_id  text;
  v_table_nom text;
  v_au_bar    boolean := coalesce(p_au_bar, false);
  v_appareil  text;
  v_ip        text;
  v_source    text;
  v_n         int;
  v_lignes    jsonb;
  v_total     numeric;
  v_absents   jsonb;
  v_panier    jsonb;
  v_ouverts   jsonb;
  v_rupture   jsonb;
  v_articles  int;
  v_id        uuid;
begin
  -- Forme de l'adresse, puis la maison (inconnue ou éteinte : même réponse).
  if p_slug is null or lower(p_slug) !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$' then
    return jsonb_build_object('erreur', 'introuvable');
  end if;
  select * into v_p from public.caisse_commande_qr_parametres
   where slug = lower(p_slug) and actif;
  if not found then
    return jsonb_build_object('erreur', 'introuvable');
  end if;
  perform 1 from public.etablissements e where e.id = v_p.etablissement_id and coalesce(e.actif, true);
  if not found then
    return jsonb_build_object('erreur', 'introuvable');
  end if;

  if not public.caisse_qr_ouvert(v_p.plages, now()) then
    return jsonb_build_object('erreur', 'ferme');
  end if;

  -- Appareil : un identifiant tiré au hasard par la page (forme d'un uuid).
  v_appareil := lower(btrim(coalesce(p_appareil, '')));
  if v_appareil !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('erreur', 'appareil');
  end if;

  -- Prénom : sans caractère de contrôle, espaces resserrés, 1 à 40 signes.
  v_prenom := btrim(regexp_replace(regexp_replace(coalesce(p_prenom, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g'));
  if char_length(v_prenom) < 1 or char_length(v_prenom) > 40 then
    return jsonb_build_object('erreur', 'prenom');
  end if;

  -- Table : le nom exact d'une seule table active du plan de la maison, ou
  -- « au bar ». Deux tables du même nom (deux salles) : la commande ne sait
  -- pas laquelle, elle est refusée.
  if not v_au_bar then
    v_table := btrim(regexp_replace(coalesce(p_table, ''), '[[:cntrl:]]', '', 'g'));
    if char_length(v_table) < 1 or char_length(v_table) > 20 then
      return jsonb_build_object('erreur', 'table');
    end if;
    select count(*), min(st.id), min(st.nom) into v_n, v_table_id, v_table_nom
      from public.salle_tables st
      left join public.salles s on s.id = st.salle_id and s.etablissement_id = st.etablissement_id
     where st.etablissement_id = v_p.etablissement_id
       and coalesce(st.actif, true)
       and (st.salle_id is null or coalesce(s.actif, true))
       and lower(btrim(st.nom)) = lower(v_table);
    if v_n <> 1 then
      return jsonb_build_object('erreur', 'table');
    end if;
  end if;

  -- Panier : 1 à 20 lignes, chaque quantité entière de 1 à 10, au plus 30
  -- articles ; un même produit répété est réuni avant les bornes.
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array'
     or jsonb_array_length(p_lignes) < 1 or jsonb_array_length(p_lignes) > 20 then
    return jsonb_build_object('erreur', 'panier');
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lignes) e(v)
     where jsonb_typeof(e.v) <> 'object'
        or jsonb_typeof(e.v->'plat_id') is distinct from 'string'
        or char_length(e.v->>'plat_id') not between 1 and 80
        or jsonb_typeof(e.v->'quantite') is distinct from 'number'
        or (e.v->>'quantite') !~ '^[0-9]{1,2}$'
  ) then
    return jsonb_build_object('erreur', 'panier');
  end if;

  select jsonb_agg(jsonb_build_object('plat_id', k.plat_id, 'quantite', k.quantite))
    into v_panier
    from (select e.v->>'plat_id' as plat_id, sum((e.v->>'quantite')::int) as quantite
            from jsonb_array_elements(p_lignes) e(v)
           group by e.v->>'plat_id') k;

  if exists (select 1 from jsonb_to_recordset(v_panier) k(plat_id text, quantite int)
              where k.quantite < 1 or k.quantite > 10)
     or (select sum(k.quantite) from jsonb_to_recordset(v_panier) k(plat_id text, quantite int)) > 30 then
    return jsonb_build_object('erreur', 'panier');
  end if;

  -- Un envoi à la fois par établissement, une fois la forme vérifiée : les
  -- plafonds se comptent juste, et une rafale de requêtes mal formées ne
  -- fait attendre personne.
  perform pg_advisory_xact_lock(hashtextextended('commande_qr:' || v_p.etablissement_id, 0));

  -- Expiration : une commande qui attend depuis plus de 3 heures est refusée
  -- d'office ; elle ne compte plus dans les plafonds ni dans le bandeau.
  update public.caisse_commandes_qr
     set statut = 'refusee', motif_refus = 'Commande expirée', traitee_at = now()
   where etablissement_id = v_p.etablissement_id and statut = 'a_valider'
     and created_at < now() - interval '3 hours';

  -- Plafonds. Appareil : 2 envois par minute, 3 commandes en attente.
  select count(*) into v_n from public.caisse_commandes_qr_sources
   where appareil = v_appareil and created_at > now() - interval '1 minute';
  if v_n >= 2 then
    return jsonb_build_object('erreur', 'trop_vite');
  end if;
  select count(*) into v_n
    from public.caisse_commandes_qr_sources s
    join public.caisse_commandes_qr c on c.id = s.commande_id
   where s.appareil = v_appareil and c.statut = 'a_valider';
  if v_n >= 3 then
    return jsonb_build_object('erreur', 'en_attente');
  end if;

  -- Table : 3 commandes en attente au plus.
  if v_table_id is not null then
    select count(*) into v_n from public.caisse_commandes_qr
     where table_id = v_table_id and statut = 'a_valider';
    if v_n >= 3 then
      return jsonb_build_object('erreur', 'en_attente');
    end if;
  end if;

  -- Source réseau : l'adresse que la passerelle pose dans cf-connecting-ip
  -- (x-forwarded-for, que le client peut écrire, n'est pas lu). Un bar
  -- partage souvent un même accès Wi-Fi : plafonds larges, 10 envois par
  -- minute et 5 commandes en attente.
  begin
    v_ip := nullif(btrim(coalesce(current_setting('request.headers', true)::json->>'cf-connecting-ip', '')), '');
  exception when others then
    v_ip := null;
  end;
  if v_ip is not null then
    v_source := md5(v_ip || ':' || v_p.etablissement_id);
    select count(*) into v_n from public.caisse_commandes_qr_sources
     where source_empreinte = v_source and created_at > now() - interval '1 minute';
    if v_n >= 10 then
      return jsonb_build_object('erreur', 'trop_vite');
    end if;
    select count(*) into v_n
      from public.caisse_commandes_qr_sources s
      join public.caisse_commandes_qr c on c.id = s.commande_id
     where s.source_empreinte = v_source and c.statut = 'a_valider';
    if v_n >= 5 then
      return jsonb_build_object('erreur', 'en_attente');
    end if;
  end if;

  -- Établissement : au plus 30 commandes en attente et 20 par minute.
  select count(*) into v_n from public.caisse_commandes_qr
   where etablissement_id = v_p.etablissement_id and statut = 'a_valider';
  if v_n >= 30 then
    return jsonb_build_object('erreur', 'occupe');
  end if;
  select count(*) into v_n from public.caisse_commandes_qr
   where etablissement_id = v_p.etablissement_id and created_at > now() - interval '1 minute';
  if v_n >= 20 then
    return jsonb_build_object('erreur', 'occupe');
  end if;

  -- Produits : d'abord ouverts au QR (un produit hors carte ne dit rien de
  -- sa rupture), ensuite hors rupture du jour, au prix de la base.
  select coalesce(jsonb_agg(jsonb_build_object('plat_id', a.plat_id, 'nom', a.nom, 'prix', a.prix, 'rupture', a.en_rupture)), '[]'::jsonb)
    into v_ouverts
    from public.caisse_qr_articles(v_p.etablissement_id, v_p.categories) a;

  select coalesce(jsonb_agg(k.plat_id), '[]'::jsonb) into v_absents
    from jsonb_to_recordset(v_panier) k(plat_id text, quantite int)
   where not exists (select 1 from jsonb_to_recordset(v_ouverts) o(plat_id text, nom text, prix numeric, rupture boolean)
                      where o.plat_id = k.plat_id);
  if jsonb_array_length(v_absents) > 0 then
    return jsonb_build_object('erreur', 'produit', 'produits', v_absents);
  end if;

  select coalesce(jsonb_agg(k.plat_id), '[]'::jsonb) into v_rupture
    from jsonb_to_recordset(v_panier) k(plat_id text, quantite int)
    join jsonb_to_recordset(v_ouverts) o(plat_id text, nom text, prix numeric, rupture boolean) on o.plat_id = k.plat_id
   where o.rupture;
  if jsonb_array_length(v_rupture) > 0 then
    return jsonb_build_object('erreur', 'rupture', 'produits', v_rupture);
  end if;

  select jsonb_agg(jsonb_build_object('plat_id', o.plat_id, 'libelle', o.nom, 'quantite', k.quantite, 'prix_unitaire', o.prix)
                   order by o.nom),
         round(sum(k.quantite * o.prix), 2),
         sum(k.quantite)
    into v_lignes, v_total, v_articles
    from jsonb_to_recordset(v_panier) k(plat_id text, quantite int)
    join jsonb_to_recordset(v_ouverts) o(plat_id text, nom text, prix numeric, rupture boolean) on o.plat_id = k.plat_id;

  insert into public.caisse_commandes_qr
    (etablissement_id, table_id, table_nom, au_bar, prenom, lignes, total)
  values
    (v_p.etablissement_id, v_table_id, v_table_nom, v_au_bar, v_prenom, v_lignes, v_total)
  returning id into v_id;

  insert into public.caisse_commandes_qr_sources (commande_id, etablissement_id, appareil, source_empreinte)
  values (v_id, v_p.etablissement_id, v_appareil, v_source);

  -- Purge : rien ne reste plus de 30 jours (les sources suivent en cascade).
  delete from public.caisse_commandes_qr
   where etablissement_id = v_p.etablissement_id and created_at < now() - interval '30 days';

  return jsonb_build_object('ok', true, 'total', v_total, 'articles', v_articles);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. En caisse : accepter, refuser
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.commande_qr_accepter(p_commande_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       text := auth.uid()::text;
  v_c         public.caisse_commandes_qr%rowtype;
  v_ouverture jsonb;
  v_ticket    uuid;
  v_ids       uuid[];
  v_now       timestamptz := clock_timestamp();
  v_table_nom text;
  v_order_id  uuid;
begin
  if v_uid is null then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  select * into v_c from public.caisse_commandes_qr where id = p_commande_id for update;
  if not found then
    raise exception 'commande_qr: commande introuvable';
  end if;
  if public.caisse_peut_utiliser(v_c.etablissement_id) is not true then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if v_c.statut <> 'a_valider' then
    return jsonb_build_object('deja', v_c.statut, 'ticket_id', v_c.ticket_id);
  end if;
  -- Plus de 3 heures d'attente : la commande expire au lieu d'ouvrir un
  -- ticket pour une boisson commandée bien plus tôt.
  if v_c.created_at < now() - interval '3 hours' then
    update public.caisse_commandes_qr
       set statut = 'refusee', motif_refus = 'Commande expirée', traitee_par = v_uid, traitee_at = now()
     where id = v_c.id;
    return jsonb_build_object('deja', 'refusee', 'expiree', true);
  end if;
  -- La table a quitté le plan : le client est assis, la commande ne devient
  -- pas une vente au bar ; l'équipe la refuse.
  if not v_c.au_bar and v_c.table_id is null then
    raise exception 'commande_qr: table disparue, commande a refuser';
  end if;

  -- Le ticket : celui de la table (repris s'il est ouvert, sinon ouvert au
  -- nom d'un client de passage, par le chemin habituel), ou un ticket sans
  -- table pour une commande au bar.
  if not v_c.au_bar then
    v_ouverture := public.caisse_ouvrir_ticket(v_c.etablissement_id, v_c.table_id, 'passage', null, null, 1);
    v_ticket := (v_ouverture->>'ticket_id')::uuid;
  else
    insert into public.caisse_tickets (etablissement_id, table_id, ouvert_par, note)
    values (v_c.etablissement_id, null, v_uid, left('Commande QR de ' || v_c.prenom, 120))
    returning id into v_ticket;
  end if;
  if v_ticket is null then
    raise exception 'commande_qr: ticket introuvable';
  end if;

  -- Les lignes, au prix de vente de la base à cet instant (même règle que
  -- la garde caisse_ligne_garde_v7 pour une ligne posée depuis l'écran).
  with posees as (
    insert into public.caisse_lignes (ticket_id, plat_id, libelle, quantite, prix_unitaire, suite)
    select v_ticket, p.id, p.nom, x.quantite, coalesce(p.prix_vente, 0), 1
      from jsonb_to_recordset(v_c.lignes) as x(plat_id text, quantite int)
      join public.plats p on p.id = x.plat_id and p.etablissement_id = v_c.etablissement_id
     where x.quantite between 1 and 10
    returning id
  )
  select array_agg(id) into v_ids from posees;
  -- Un produit supprimé entre-temps : rien n'est posé à moitié.
  if v_ids is null or cardinality(v_ids) <> jsonb_array_length(v_c.lignes) then
    raise exception 'commande_qr: un produit a disparu, commande a refuser';
  end if;

  -- Le bon de ces seules lignes (les lignes en attente du serveur sur ce
  -- ticket ne partent pas). Même forme que caisse_bon_interne, étape 1.
  select st.nom into v_table_nom
    from public.caisse_tickets t
    join public.salle_tables st on st.id = t.table_id and st.etablissement_id = t.etablissement_id
   where t.id = v_ticket;

  insert into public.kds_orders (etablissement_id, ls_check_uuid, table_no, opened_at, status)
  values (
    v_c.etablissement_id,
    'caisse:' || v_ticket || ':1:' || md5(v_now::text || v_ticket::text),
    coalesce(v_table_nom, 'Bar, ' || v_c.prenom),
    v_now,
    'open'
  )
  returning id into v_order_id;

  insert into public.kds_order_items (kds_order_id, ls_line_key, nom, qty, modifiers, fired_at, a_suivre)
  select v_order_id, 'caisse:' || l.id, l.libelle, l.quantite,
         public.caisse_modifiers_kds(l.options, l.note), v_now, false
    from public.caisse_lignes l
   where l.id = any(v_ids);

  update public.caisse_lignes
     set statut = 'envoye', envoye_at = v_now
   where id = any(v_ids) and statut = 'en_attente';

  update public.caisse_commandes_qr
     set statut = 'acceptee', ticket_id = v_ticket, traitee_par = v_uid, traitee_at = now()
   where id = v_c.id;

  return jsonb_build_object('ticket_id', v_ticket, 'lignes', cardinality(v_ids), 'bon_id', v_order_id);
end;
$$;

create or replace function public.commande_qr_refuser(p_commande_id uuid, p_motif text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   text := auth.uid()::text;
  v_c     public.caisse_commandes_qr%rowtype;
  v_motif text := btrim(regexp_replace(coalesce(p_motif, ''), '[[:cntrl:]]', ' ', 'g'));
begin
  if v_uid is null then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  select * into v_c from public.caisse_commandes_qr where id = p_commande_id for update;
  if not found then
    raise exception 'commande_qr: commande introuvable';
  end if;
  if public.caisse_peut_utiliser(v_c.etablissement_id) is not true then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if v_c.statut <> 'a_valider' then
    return jsonb_build_object('deja', v_c.statut);
  end if;
  if char_length(v_motif) < 3 or char_length(v_motif) > 200 then
    raise exception 'commande_qr: motif de 3 a 200 signes';
  end if;
  update public.caisse_commandes_qr
     set statut = 'refusee', motif_refus = v_motif, traitee_par = v_uid, traitee_at = now()
   where id = v_c.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Droits d'exécution
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.commande_qr_carte(text) from public, anon, authenticated;
revoke all on function public.commande_qr_envoyer(text, text, boolean, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.commande_qr_accepter(uuid) from public, anon, authenticated;
revoke all on function public.commande_qr_refuser(uuid, text) from public, anon, authenticated;

grant execute on function public.commande_qr_carte(text) to anon, authenticated;
grant execute on function public.commande_qr_envoyer(text, text, boolean, text, jsonb, text) to anon, authenticated;
grant execute on function public.commande_qr_accepter(uuid) to authenticated;
grant execute on function public.commande_qr_refuser(uuid, text) to authenticated;
