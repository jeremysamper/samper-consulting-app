-- ════════════════════════════════════════════════════════════════════════════
-- Module Spa - réservations, fiches clients, suivi des séances, bons cadeaux
-- et e-mails (anniversaires, actualités)
-- ───────────────────────────────────────────────────────────────────────────
-- Premier établissement concerné : Mizukii. Le module est « à activer » : il
-- n'apparaît que pour un établissement dont modules_actifs contient 'spa'
-- (moduleConfig.optInModuleKeys), jamais par défaut dans les restaurants.
--
-- Tables :
--   • spa_soins        catalogue des soins (nom, durée, prix)
--   • spa_clients      fiches clients : coordonnées, date de naissance,
--                      notes de santé et préférences, consentement e-mail
--   • spa_reservations rendez-vous (client, soin, praticien, cabine, statut)
--   • spa_seances      compte rendu rédigé à la fin de chaque séance
--   • spa_bons         bons cadeaux émis (anniversaire ou geste commercial)
--   • spa_parametres   réglages des e-mails, un par établissement
--   • spa_campagnes    actualités envoyées (historique)
--   • spa_envois       journal de chaque e-mail parti (ou en échec)
--
-- E-MAILS ET CONSENTEMENT (nLPD, LCD art. 3 al. 1 let. o)
-- Anniversaire et actualités sont de la publicité : ils ne partent qu'aux
-- clients dont `consentement_marketing` est vrai. Chaque e-mail porte un lien
-- de désinscription (jeton `desinscription_token`, non devinable) qui remet le
-- consentement à faux sans connexion. Les e-mails partent de l'Edge Function
-- spa-mailer (clé du fournisseur côté serveur uniquement) ; le front n'écrit
-- jamais dans spa_bons, spa_campagnes ni spa_envois.
--
-- Données de santé (contre-indications, allergies) : données sensibles au sens
-- de la nLPD. Lecture réservée aux membres de l'établissement (RLS), et la
-- suppression d'une fiche emporte tout ce qui la concerne (droit à
-- l'effacement) : réservations, séances, bons, journal d'envoi.
--
-- Migration additive (expand) : tables isolées, aucune colonne ni politique
-- existante touchée. Idempotente. Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.spa_soins (
  id               text        primary key default (gen_random_uuid())::text,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  nom              text        not null check (btrim(nom) <> ''),
  categorie        text,
  duree_min        integer     not null default 60 check (duree_min between 5 and 600),
  prix             numeric     check (prix is null or prix >= 0),
  description      text,
  actif            boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_spa_soins_etab on public.spa_soins(etablissement_id);

create table if not exists public.spa_clients (
  id                     text        primary key default (gen_random_uuid())::text,
  etablissement_id       text        not null references public.etablissements(id) on delete cascade,
  prenom                 text,
  nom                    text,
  email                  text,
  telephone              text,
  date_naissance         date        check (date_naissance is null or date_naissance >= date '1900-01-01'),
  adresse                text,
  notes_sante            text,        -- contre-indications, allergies, grossesse…
  preferences            text,        -- pression, huiles, musique, praticien préféré…
  notes                  text,
  consentement_marketing boolean     not null default false,
  consentement_at        timestamptz,
  desinscrit_at          timestamptz,
  desinscription_token   uuid        not null default gen_random_uuid(),
  archive                boolean     not null default false,
  created_by             text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint spa_clients_identite check (btrim(coalesce(prenom, '') || coalesce(nom, '')) <> ''),
  constraint spa_clients_email_forme check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
create index if not exists idx_spa_clients_etab on public.spa_clients(etablissement_id);
create unique index if not exists uq_spa_clients_token on public.spa_clients(desinscription_token);

create table if not exists public.spa_reservations (
  id               text        primary key default (gen_random_uuid())::text,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  client_id        text        not null references public.spa_clients(id) on delete cascade,
  soin_id          text        references public.spa_soins(id) on delete set null,
  soin_libelle     text,        -- copie du nom : survit à la suppression du soin
  date_rdv         date        not null,
  heure_debut      time        not null,
  duree_min        integer     not null default 60 check (duree_min between 5 and 600),
  praticien        text,
  cabine           text,
  statut           text        not null default 'prevue'
                               check (statut in ('prevue','confirmee','terminee','annulee','absent')),
  notes            text,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_spa_reservations_etab_date on public.spa_reservations(etablissement_id, date_rdv);
create index if not exists idx_spa_reservations_client on public.spa_reservations(client_id);

create table if not exists public.spa_seances (
  id                 text        primary key default (gen_random_uuid())::text,
  etablissement_id   text        not null references public.etablissements(id) on delete cascade,
  client_id          text        not null references public.spa_clients(id) on delete cascade,
  reservation_id     text        references public.spa_reservations(id) on delete set null,
  date_seance        date        not null,
  soin               text,
  praticien          text,
  observations       text,        -- état constaté, zones travaillées
  produits           text,        -- huiles, soins, produits utilisés
  ressenti           text,        -- retour du client
  recommandations    text,        -- conseils donnés, soin suivant conseillé
  prochaine_seance   date,
  created_by         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_spa_seances_client on public.spa_seances(client_id, date_seance desc);
-- Un compte rendu par rendez-vous : le second enregistrement le met à jour.
create unique index if not exists uq_spa_seances_reservation
  on public.spa_seances(reservation_id) where reservation_id is not null;

create table if not exists public.spa_bons (
  id               text        primary key default (gen_random_uuid())::text,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  client_id        text        not null references public.spa_clients(id) on delete cascade,
  code             text        not null,
  motif            text        not null default 'cadeau' check (motif in ('anniversaire','cadeau')),
  valeur           text        not null,
  message          text,
  valable_jusqu    date,
  envoye_at        timestamptz,
  utilise_at       timestamptz,
  utilise_par      text,
  created_by       text,
  created_at       timestamptz not null default now()
);
create unique index if not exists uq_spa_bons_code on public.spa_bons(code);
create index if not exists idx_spa_bons_client on public.spa_bons(client_id);

create table if not exists public.spa_parametres (
  etablissement_id     text        primary key references public.etablissements(id) on delete cascade,
  anniversaire_actif   boolean     not null default false,
  bon_valeur           text        not null default '20 % sur le soin de votre choix',
  bon_validite_jours   integer     not null default 60 check (bon_validite_jours between 1 and 730),
  anniversaire_sujet   text,
  anniversaire_message text,
  nom_expediteur       text,
  email_reponse        text        check (email_reponse is null or email_reponse ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  signature            text,
  updated_by           text,
  updated_at           timestamptz not null default now()
);

create table if not exists public.spa_campagnes (
  id                text        primary key default (gen_random_uuid())::text,
  etablissement_id  text        not null references public.etablissements(id) on delete cascade,
  sujet             text        not null,
  message           text        not null,
  nb_destinataires  integer     not null default 0,
  nb_envoyes        integer     not null default 0,
  nb_echecs         integer     not null default 0,
  envoye_par        text,
  created_at        timestamptz not null default now()
);
create index if not exists idx_spa_campagnes_etab on public.spa_campagnes(etablissement_id, created_at desc);

create table if not exists public.spa_envois (
  id               text        primary key default (gen_random_uuid())::text,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  client_id        text        references public.spa_clients(id) on delete cascade,
  type             text        not null check (type in ('anniversaire','news','bon','test')),
  campagne_id      text        references public.spa_campagnes(id) on delete set null,
  bon_id           text        references public.spa_bons(id) on delete set null,
  email            text,
  annee            integer,
  statut           text        not null default 'en_cours' check (statut in ('en_cours','envoye','echec')),
  erreur           text,
  provider_id      text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_spa_envois_etab on public.spa_envois(etablissement_id, created_at desc);
-- Un seul e-mail d'anniversaire par client et par an : l'envoi « réserve » sa
-- ligne avant de partir, un second passage du cron bute sur cet index. Un
-- échec libère la place (statut 'echec' exclu) pour le passage de rattrapage.
create unique index if not exists uq_spa_envois_anniversaire
  on public.spa_envois(client_id, annee)
  where type = 'anniversaire' and statut <> 'echec';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Triggers
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.spa_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_spa_soins_maj on public.spa_soins;
create trigger trg_spa_soins_maj before update on public.spa_soins
  for each row execute function public.spa_touch_updated_at();

drop trigger if exists trg_spa_parametres_maj on public.spa_parametres;
create trigger trg_spa_parametres_maj before update on public.spa_parametres
  for each row execute function public.spa_touch_updated_at();

-- Colonnes système et auteur posés par la base, pas par le client.
create or replace function public.spa_avant_ecriture()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.created_by := (select auth.uid())::text;
    end if;
    new.created_at := now();
  else
    if new.etablissement_id is distinct from old.etablissement_id then
      raise exception 'Une fiche ne change pas d''établissement.' using errcode = '42501';
    end if;
    new.id         := old.id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_spa_reservations_ecriture on public.spa_reservations;
create trigger trg_spa_reservations_ecriture before insert or update on public.spa_reservations
  for each row execute function public.spa_avant_ecriture();

drop trigger if exists trg_spa_seances_ecriture on public.spa_seances;
create trigger trg_spa_seances_ecriture before insert or update on public.spa_seances
  for each row execute function public.spa_avant_ecriture();

-- Fiche client : en plus, le consentement est horodaté par la base et le jeton
-- de désinscription n'est jamais modifiable (un jeton choisi par le client
-- permettrait de désinscrire la fiche d'un autre).
create or replace function public.spa_clients_avant_ecriture()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.created_by := (select auth.uid())::text;
    end if;
    new.created_at := now();
    new.desinscription_token := gen_random_uuid();
    new.desinscrit_at := null;
    new.consentement_at := case when new.consentement_marketing then now() else null end;
  else
    if new.etablissement_id is distinct from old.etablissement_id then
      raise exception 'Une fiche ne change pas d''établissement.' using errcode = '42501';
    end if;
    new.id                   := old.id;
    new.created_by           := old.created_by;
    new.created_at           := old.created_at;
    new.desinscription_token := old.desinscription_token;
    if new.consentement_marketing and not old.consentement_marketing then
      new.consentement_at := now();
      new.desinscrit_at   := null;
    elsif not new.consentement_marketing and old.consentement_marketing then
      new.desinscrit_at   := now();
    else
      new.consentement_at := old.consentement_at;
      new.desinscrit_at   := old.desinscrit_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_spa_clients_ecriture on public.spa_clients;
create trigger trg_spa_clients_ecriture before insert or update on public.spa_clients
  for each row execute function public.spa_clients_avant_ecriture();

-- Bon cadeau : l'équipe ne peut que le marquer utilisé (ou annuler ce
-- marquage). Code, valeur, client et validité restent ceux de l'émission.
create or replace function public.spa_bons_avant_maj()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is not null then
    new.id               := old.id;
    new.etablissement_id := old.etablissement_id;
    new.client_id        := old.client_id;
    new.code             := old.code;
    new.motif            := old.motif;
    new.valeur           := old.valeur;
    new.message          := old.message;
    new.valable_jusqu    := old.valable_jusqu;
    new.envoye_at        := old.envoye_at;
    new.created_by       := old.created_by;
    new.created_at       := old.created_at;
    if new.utilise_at is not null and old.utilise_at is null then
      new.utilise_at  := now();
      new.utilise_par := (select auth.uid())::text;
    elsif new.utilise_at is null then
      new.utilise_par := null;
    else
      new.utilise_at  := old.utilise_at;
      new.utilise_par := old.utilise_par;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_spa_bons_avant_maj on public.spa_bons;
create trigger trg_spa_bons_avant_maj before update on public.spa_bons
  for each row execute function public.spa_bons_avant_maj();

revoke all on function public.spa_touch_updated_at()       from public, anon, authenticated;
revoke all on function public.spa_avant_ecriture()         from public, anon, authenticated;
revoke all on function public.spa_clients_avant_ecriture() from public, anon, authenticated;
revoke all on function public.spa_bons_avant_maj()         from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.spa_soins        enable row level security;
alter table public.spa_clients      enable row level security;
alter table public.spa_reservations enable row level security;
alter table public.spa_seances      enable row level security;
alter table public.spa_bons         enable row level security;
alter table public.spa_parametres   enable row level security;
alter table public.spa_campagnes    enable row level security;
alter table public.spa_envois       enable row level security;

revoke all on public.spa_soins        from anon;
revoke all on public.spa_clients      from anon;
revoke all on public.spa_reservations from anon;
revoke all on public.spa_seances      from anon;
revoke all on public.spa_bons         from anon;
revoke all on public.spa_parametres   from anon;
revoke all on public.spa_campagnes    from anon;
revoke all on public.spa_envois       from anon;

-- ── Soins : lus par l'équipe, catalogue tenu par la direction et la réception ──
drop policy if exists spa_soins_select on public.spa_soins;
create policy spa_soins_select on public.spa_soins
  for select to authenticated using (user_can_access_etab(etablissement_id));

drop policy if exists spa_soins_write on public.spa_soins;
create policy spa_soins_write on public.spa_soins
  for all to authenticated
  using (user_can_access_etab(etablissement_id)
         and (select current_user_role()) = any(array['consultant','patron','hote']))
  with check (user_can_access_etab(etablissement_id)
              and (select current_user_role()) = any(array['consultant','patron','hote']));

-- ── Clients : toute l'équipe crée et met à jour les fiches ; seule la
--    direction supprime (droit à l'effacement) ──
drop policy if exists spa_clients_select on public.spa_clients;
create policy spa_clients_select on public.spa_clients
  for select to authenticated using (user_can_access_etab(etablissement_id));

drop policy if exists spa_clients_insert on public.spa_clients;
create policy spa_clients_insert on public.spa_clients
  for insert to authenticated with check (user_can_access_etab(etablissement_id));

drop policy if exists spa_clients_update on public.spa_clients;
create policy spa_clients_update on public.spa_clients
  for update to authenticated
  using (user_can_access_etab(etablissement_id))
  with check (user_can_access_etab(etablissement_id));

drop policy if exists spa_clients_delete on public.spa_clients;
create policy spa_clients_delete on public.spa_clients
  for delete to authenticated
  using (user_can_access_etab(etablissement_id)
         and (select current_user_role()) = any(array['consultant','patron']));

-- ── Réservations et séances : même règle ──
drop policy if exists spa_reservations_select on public.spa_reservations;
create policy spa_reservations_select on public.spa_reservations
  for select to authenticated using (user_can_access_etab(etablissement_id));

drop policy if exists spa_reservations_insert on public.spa_reservations;
create policy spa_reservations_insert on public.spa_reservations
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id)
              and exists (select 1 from public.spa_clients c
                          where c.id = client_id and c.etablissement_id = spa_reservations.etablissement_id));

drop policy if exists spa_reservations_update on public.spa_reservations;
create policy spa_reservations_update on public.spa_reservations
  for update to authenticated
  using (user_can_access_etab(etablissement_id))
  with check (user_can_access_etab(etablissement_id)
              and exists (select 1 from public.spa_clients c
                          where c.id = client_id and c.etablissement_id = spa_reservations.etablissement_id));

drop policy if exists spa_reservations_delete on public.spa_reservations;
create policy spa_reservations_delete on public.spa_reservations
  for delete to authenticated
  using (user_can_access_etab(etablissement_id)
         and (select current_user_role()) = any(array['consultant','patron']));

drop policy if exists spa_seances_select on public.spa_seances;
create policy spa_seances_select on public.spa_seances
  for select to authenticated using (user_can_access_etab(etablissement_id));

drop policy if exists spa_seances_insert on public.spa_seances;
create policy spa_seances_insert on public.spa_seances
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id)
              and exists (select 1 from public.spa_clients c
                          where c.id = client_id and c.etablissement_id = spa_seances.etablissement_id));

drop policy if exists spa_seances_update on public.spa_seances;
create policy spa_seances_update on public.spa_seances
  for update to authenticated
  using (user_can_access_etab(etablissement_id))
  with check (user_can_access_etab(etablissement_id)
              and exists (select 1 from public.spa_clients c
                          where c.id = client_id and c.etablissement_id = spa_seances.etablissement_id));

drop policy if exists spa_seances_delete on public.spa_seances;
create policy spa_seances_delete on public.spa_seances
  for delete to authenticated
  using (user_can_access_etab(etablissement_id)
         and (select current_user_role()) = any(array['consultant','patron']));

-- ── Bons : émis par l'Edge Function uniquement (aucune politique INSERT) ;
--    l'équipe les lit et les marque utilisés (trigger) ──
drop policy if exists spa_bons_select on public.spa_bons;
create policy spa_bons_select on public.spa_bons
  for select to authenticated using (user_can_access_etab(etablissement_id));

drop policy if exists spa_bons_update on public.spa_bons;
create policy spa_bons_update on public.spa_bons
  for update to authenticated
  using (user_can_access_etab(etablissement_id))
  with check (user_can_access_etab(etablissement_id));

-- ── Paramètres e-mail : lus par l'équipe, réglés par la direction ──
drop policy if exists spa_parametres_select on public.spa_parametres;
create policy spa_parametres_select on public.spa_parametres
  for select to authenticated using (user_can_access_etab(etablissement_id));

drop policy if exists spa_parametres_insert on public.spa_parametres;
create policy spa_parametres_insert on public.spa_parametres
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id)
              and (select current_user_role()) = any(array['consultant','patron']));

drop policy if exists spa_parametres_update on public.spa_parametres;
create policy spa_parametres_update on public.spa_parametres
  for update to authenticated
  using (user_can_access_etab(etablissement_id)
         and (select current_user_role()) = any(array['consultant','patron']))
  with check (user_can_access_etab(etablissement_id)
              and (select current_user_role()) = any(array['consultant','patron']));

-- ── Historique des e-mails : direction seulement, écrit par l'Edge Function ──
drop policy if exists spa_campagnes_select on public.spa_campagnes;
create policy spa_campagnes_select on public.spa_campagnes
  for select to authenticated
  using (user_can_access_etab(etablissement_id)
         and (select current_user_role()) = any(array['consultant','patron']));

drop policy if exists spa_envois_select on public.spa_envois;
create policy spa_envois_select on public.spa_envois
  for select to authenticated
  using (user_can_access_etab(etablissement_id)
         and (select current_user_role()) = any(array['consultant','patron']));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Realtime : l'agenda de la réception suit celui de la cabine
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['spa_reservations','spa_clients','spa_seances','spa_bons','spa_soins'] loop
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
comment on table public.spa_clients is
  'Fiches clients du spa. consentement_marketing conditionne anniversaire et actualités ; desinscription_token (immuable) sert au lien de désinscription.';
comment on column public.spa_clients.notes_sante is
  'Donnée sensible (nLPD) : contre-indications, allergies, grossesse. À saisir avec l''accord du client.';
comment on table public.spa_seances is
  'Compte rendu de fin de séance, un par rendez-vous (index unique partiel sur reservation_id).';
comment on table public.spa_bons is
  'Bons cadeaux émis par l''Edge Function spa-mailer. L''équipe ne peut que les marquer utilisés.';
comment on table public.spa_envois is
  'Journal des e-mails du spa. Index unique partiel : un e-mail d''anniversaire par client et par an.';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter manuellement si besoin) :
--
--   do $$
--   declare t text;
--   begin
--     foreach t in array array['spa_reservations','spa_clients','spa_seances','spa_bons','spa_soins'] loop
--       if exists (select 1 from pg_publication_tables
--                  where pubname = 'supabase_realtime' and tablename = t) then
--         execute format('alter publication supabase_realtime drop table public.%I', t);
--       end if;
--     end loop;
--   end $$;
--   drop table if exists public.spa_envois, public.spa_campagnes, public.spa_parametres,
--     public.spa_bons, public.spa_seances, public.spa_reservations,
--     public.spa_clients, public.spa_soins;
--   drop function if exists public.spa_bons_avant_maj();
--   drop function if exists public.spa_clients_avant_ecriture();
--   drop function if exists public.spa_avant_ecriture();
--   drop function if exists public.spa_touch_updated_at();
-- ════════════════════════════════════════════════════════════════════════════
