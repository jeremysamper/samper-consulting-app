-- ============================================================================
-- Caisse v7 - encaissement conforme au cadre suisse : TVA par ligne, numero
-- de ticket continu, rien d'effacable, chaine d'integrite, cloture du jour.
--
--   caisse_lignes    : + taux_tva et a_emporter (figes a l'encaissement),
--     remise_montant, remise_motif, remise_par, remise_at, offert,
--     prix_origine. prix_unitaire reste TOUJOURS le prix net reellement
--     demande : une remise le baisse, un offert le met a 0, prix_origine garde
--     le prix d'avant. Toute somme de quantite x prix_unitaire, y compris
--     celle des ecrans deja en ligne, donne donc le bon total.
--   caisse_tickets   : + numero et annee (continus par etablissement et par
--     annee, poses a l'encaissement sous verrou), service (midi, soir),
--     jour_exploitation, a_emporter, total_ttc, empreinte,
--     empreinte_precedente, annule_motif, annule_par, annule_at, annule_jour.
--   caisse_paiements : + pourboire, rendu, arrondi. montant reste la part du
--     ticket reglee par ce moyen (la somme des montants fait le total) ;
--     l'arrondi aux 5 centimes des especes est a part, signe ; ce que la
--     maison garde en especes est montant + arrondi.
--   caisse_categories : + taux_tva (8.1 par defaut), emporter_reduit.
--   caisse_boutons   : + taux_tva (surcharge du produit, null = la categorie).
--   caisse_compteurs : les compteurs (numero de ticket par annee, numero de
--     cloture, rang de la chaine). La ligne du rang sert de verrou de
--     l'etablissement : deux encaissements ne se croisent jamais.
--   caisse_clotures  : la cloture du jour (le Z), figee. Une correction est
--     une cloture complementaire (complement_de), jamais une modification.
--   caisse_chaine    : un maillon par ticket encaisse, par annulation et par
--     cloture. Chaque empreinte porte sur le contenu de la piece et sur
--     l'empreinte du maillon precedent de l'etablissement.
--
--   Le scellement (numero, taux des lignes, total, empreinte) vit dans un
--   declencheur du passage a encaisse : il vaut pour la RPC caisse_encaisser
--   comme pour l'ancien chemin du front deja en ligne (insertion du paiement
--   puis passage du statut), qui reste accepte.
--
--   RPC : caisse_encaisser, caisse_remise, caisse_annuler_ticket,
--   caisse_cloturer_jour, caisse_journee, caisse_verifier_chaine.
--
-- Mode test (v6) : un ticket de test ne recoit jamais de numero (contrainte),
-- n'entre ni dans la chaine, ni dans une cloture, ni dans un total.
--
-- Trois gardes d'avant sont laissees telles quelles (caisse_ticket_garde,
-- caisse_paiement_garde, les gardes v5 et v6). Seule caisse_ligne_garde (v2)
-- est reprise, a l'identique plus deux passages reserves aux fonctions de la
-- base : la remise sur une ligne deja envoyee, et la pose du taux sur les
-- lignes d'un ticket encaisse avant ce fichier.
--
-- Migration additive (expand). Rejouable ; la reprise des tickets encaisses
-- avant ce fichier ne touche que ceux qui n'ont pas encore de numero : sans
-- effet au rejeu, y compris apres de nouveaux tickets. Rollback en fin.
-- Heures stockees en UTC, lues en Europe/Zurich.
-- ============================================================================

set local lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 1. Colonnes
-- ----------------------------------------------------------------------------
alter table public.caisse_lignes
  add column if not exists taux_tva       numeric,
  add column if not exists a_emporter     boolean not null default false,
  add column if not exists remise_montant numeric not null default 0,
  add column if not exists remise_motif   text,
  add column if not exists remise_par     text references public.profiles(id),
  add column if not exists remise_at      timestamptz,
  add column if not exists offert         boolean not null default false,
  add column if not exists prix_origine   numeric;

alter table public.caisse_tickets
  add column if not exists numero               int,
  add column if not exists annee                int,
  add column if not exists service              text,
  add column if not exists jour_exploitation    date,
  add column if not exists a_emporter           boolean not null default false,
  add column if not exists total_ttc            numeric,
  add column if not exists empreinte            text,
  add column if not exists empreinte_precedente text,
  add column if not exists annule_motif         text,
  add column if not exists annule_par           text references public.profiles(id),
  add column if not exists annule_at            timestamptz,
  add column if not exists annule_jour          date;

alter table public.caisse_paiements
  add column if not exists pourboire numeric not null default 0,
  add column if not exists rendu     numeric not null default 0,
  add column if not exists arrondi   numeric not null default 0;

alter table public.caisse_boutons
  add column if not exists taux_tva numeric;

-- Categories : le taux sur place, et le droit au taux reduit a l'emporter.
-- emporter_reduit nait a faux pour TOUTES les categories, existantes
-- comprises : taux normal tant que la maison n'a rien dit. Aucun remplissage :
-- c'est un geste des Reglages de la caisse, categorie par categorie (au pire
-- la maison declare trop de TVA, jamais trop peu).
alter table public.caisse_categories
  add column if not exists taux_tva        numeric not null default 8.1,
  add column if not exists emporter_reduit boolean not null default false;

-- Contraintes (une par nom, posee une fois).
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('caisse_lignes',     'caisse_lignes_taux_tva_legal',      'check (taux_tva is null or taux_tva in (0, 2.6, 3.8, 8.1))'),
      ('caisse_lignes',     'caisse_lignes_remise_positive',     'check (remise_montant >= 0)'),
      ('caisse_lignes',     'caisse_lignes_prix_origine_positif','check (prix_origine is null or prix_origine >= 0)'),
      ('caisse_lignes',     'caisse_lignes_offert_a_zero',       'check (not offert or (prix_unitaire = 0 and prix_origine is not null))'),
      ('caisse_lignes',     'caisse_lignes_remise_motivee',      'check (prix_origine is null or (remise_motif is not null and char_length(remise_motif) between 3 and 200))'),
      ('caisse_tickets',    'caisse_tickets_service_connu',      'check (service is null or service in (''midi'', ''soir''))'),
      ('caisse_tickets',    'caisse_tickets_numero_annee',       'check ((numero is null) = (annee is null) and (numero is null or numero >= 1))'),
      ('caisse_tickets',    'caisse_tickets_test_sans_numero',   'check (not test or (numero is null and empreinte is null))'),
      ('caisse_tickets',    'caisse_tickets_numero_scelle',      'check (numero is null or (empreinte is not null and empreinte_precedente is not null and total_ttc is not null and jour_exploitation is not null and closed_at is not null))'),
      ('caisse_tickets',    'caisse_tickets_annulation_motivee', 'check (annule_at is null or (statut = ''annule'' and annule_par is not null and annule_jour is not null and char_length(btrim(annule_motif)) between 3 and 300))'),
      ('caisse_paiements',  'caisse_paiements_pourboire_positif','check (pourboire >= 0)'),
      ('caisse_paiements',  'caisse_paiements_rendu_positif',    'check (rendu >= 0)'),
      ('caisse_paiements',  'caisse_paiements_arrondi_borne',    'check (arrondi between -0.02 and 0.02)'),
      ('caisse_paiements',  'caisse_paiements_especes_seules',   'check (moyen = ''especes'' or (rendu = 0 and arrondi = 0))'),
      ('caisse_categories', 'caisse_categories_taux_tva_legal',  'check (taux_tva in (0, 2.6, 3.8, 8.1))'),
      ('caisse_boutons',    'caisse_boutons_taux_tva_legal',     'check (taux_tva is null or taux_tva in (0, 2.6, 3.8, 8.1))')
    ) as v(tbl, nom, def)
  loop
    if not exists (select 1 from pg_constraint where conname = c.nom) then
      execute format('alter table public.%I add constraint %I %s', c.tbl, c.nom, c.def);
    end if;
  end loop;
end $$;

create unique index if not exists caisse_tickets_numero_key
  on public.caisse_tickets(etablissement_id, annee, numero) where numero is not null;
create index if not exists idx_caisse_tickets_jour
  on public.caisse_tickets(etablissement_id, jour_exploitation) where numero is not null;
create index if not exists idx_caisse_tickets_annule_jour
  on public.caisse_tickets(etablissement_id, annule_jour) where annule_jour is not null;
create index if not exists idx_caisse_tickets_annule_par
  on public.caisse_tickets(annule_par) where annule_par is not null;
create index if not exists idx_caisse_lignes_remise_par
  on public.caisse_lignes(remise_par) where remise_par is not null;

comment on column public.caisse_lignes.taux_tva       is 'Caisse v7 : taux de TVA de la ligne, fige a l''encaissement (null tant que le ticket est ouvert). Ecrit par la base seulement.';
comment on column public.caisse_lignes.a_emporter     is 'Caisse v7 : mode de consommation de la ligne, copie du ticket a l''encaissement.';
comment on column public.caisse_lignes.prix_origine   is 'Caisse v7 : prix unitaire d''avant la remise ou l''offert (null sans remise). prix_unitaire reste le prix net.';
comment on column public.caisse_lignes.remise_montant is 'Caisse v7 : montant remis sur la ligne (quantite x prix_origine moins quantite x prix_unitaire). 0 pour un offert, dont la valeur est quantite x prix_origine.';
comment on column public.caisse_tickets.numero            is 'Caisse v7 : numero continu par etablissement et par annee, pose a l''encaissement sous verrou. Jamais reutilise, jamais pour un ticket de test.';
comment on column public.caisse_tickets.jour_exploitation is 'Caisse v7 : jour d''exploitation (il finit a l''heure reglee, 04:00 a Zurich par defaut). Fige a l''encaissement ; un ticket encaisse apres la cloture d''un jour appartient au jour suivant.';
comment on column public.caisse_tickets.service           is 'Caisse v7 : midi ou soir, fige a l''ouverture (service de la reservation, sinon l''heure de Zurich ; le brunch compte comme midi).';
comment on column public.caisse_tickets.empreinte         is 'Caisse v7 : sha256 du contenu du ticket et de l''empreinte precedente de l''etablissement (caisse_chaine).';
comment on column public.caisse_tickets.annule_jour       is 'Caisse v7 : jour d''exploitation qui porte l''ecriture inverse de l''annulation.';
comment on column public.caisse_paiements.arrondi         is 'Caisse v7 : ecart d''arrondi aux 5 centimes, especes seulement, signe. La maison garde montant + arrondi.';
comment on column public.caisse_paiements.pourboire       is 'Caisse v7 : pourboire saisi a part. Ni dans le total du ticket, ni dans la base de TVA.';

-- ----------------------------------------------------------------------------
-- 2. Tables
-- ----------------------------------------------------------------------------
create table if not exists public.caisse_compteurs (
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  cle              text        not null check (cle ~ '^(chaine|cloture|ticket:[0-9]{4})$'),
  valeur           bigint      not null default 0 check (valeur >= 0),
  updated_at       timestamptz not null default now(),
  primary key (etablissement_id, cle)
);

create table if not exists public.caisse_clotures (
  id                   uuid        primary key default gen_random_uuid(),
  etablissement_id     text        not null references public.etablissements(id),
  jour_exploitation    date        not null,
  numero               int         not null check (numero >= 1),
  totaux               jsonb       not null check (jsonb_typeof(totaux) = 'object'),
  fond_caisse          numeric     not null default 0 check (fond_caisse >= 0),
  especes_comptees     numeric     not null check (especes_comptees >= 0),
  ecart                numeric     not null,
  motif                text        check (motif is null or char_length(motif) between 3 and 300),
  cloture_par          text        references public.profiles(id),
  cloture_par_nom      text,
  cloture_at           timestamptz not null default now(),
  empreinte            text        not null,
  empreinte_precedente text        not null,
  complement_de        uuid        references public.caisse_clotures(id),
  -- Porte aussi l'index de la cle etrangere etablissement_id (colonne de tete).
  constraint caisse_clotures_numero_key unique (etablissement_id, numero),
  constraint caisse_clotures_complement_motive check (complement_de is null or motif is not null)
);

create unique index if not exists caisse_clotures_jour_key
  on public.caisse_clotures(etablissement_id, jour_exploitation) where complement_de is null;
create index if not exists idx_caisse_clotures_par        on public.caisse_clotures(cloture_par);
create index if not exists idx_caisse_clotures_complement on public.caisse_clotures(complement_de) where complement_de is not null;

create table if not exists public.caisse_chaine (
  etablissement_id     text        not null references public.etablissements(id),
  rang                 bigint      not null check (rang >= 1),
  genre                text        not null check (genre in ('ticket', 'annulation', 'cloture')),
  ticket_id            uuid        references public.caisse_tickets(id),
  cloture_id           uuid        references public.caisse_clotures(id),
  empreinte            text        not null,
  empreinte_precedente text        not null,
  created_at           timestamptz not null default clock_timestamp(),
  primary key (etablissement_id, rang),
  constraint caisse_chaine_reference check (
    (genre = 'cloture' and cloture_id is not null and ticket_id is null)
    or (genre in ('ticket', 'annulation') and ticket_id is not null and cloture_id is null))
);

create index if not exists idx_caisse_chaine_ticket  on public.caisse_chaine(ticket_id) where ticket_id is not null;
create index if not exists idx_caisse_chaine_cloture on public.caisse_chaine(cloture_id) where cloture_id is not null;

alter table public.caisse_compteurs enable row level security;
alter table public.caisse_clotures  enable row level security;
alter table public.caisse_chaine    enable row level security;

-- Aucune ecriture par l'API sur ces trois tables ; seules les clotures se
-- lisent, par consultant, patron et resp_cuisine.
revoke all on public.caisse_compteurs from anon, authenticated;
revoke all on public.caisse_chaine    from anon, authenticated;
revoke all on public.caisse_clotures  from anon, authenticated;
grant select on public.caisse_clotures to authenticated;

drop policy if exists caisse_clotures_select on public.caisse_clotures;
create policy caisse_clotures_select on public.caisse_clotures
  for select to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant', 'patron', 'resp_cuisine'])
  );

comment on table public.caisse_compteurs is 'Caisse v7 : compteurs par etablissement (numero de ticket par annee, numero de cloture, rang de la chaine). Ecrits par la base seulement.';
comment on table public.caisse_clotures  is 'Caisse v7 : cloture de caisse du jour, figee. Lecture consultant, patron, resp_cuisine ; ecriture par caisse_cloturer_jour seulement.';
comment on table public.caisse_chaine    is 'Caisse v7 : chaine d''integrite, un maillon par ticket encaisse, annulation et cloture. Ni modification ni suppression.';

-- Une cloture et un maillon ne se modifient ni ne se suppriment, par personne.
create or replace function public.caisse_piece_figee()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'caisse: % ne se modifie ni ne se supprime', tg_argv[0]
    using errcode = '42501';
end;
$$;

revoke all on function public.caisse_piece_figee() from public, anon, authenticated;

drop trigger if exists trg_caisse_cloture_figee on public.caisse_clotures;
create trigger trg_caisse_cloture_figee
  before update or delete on public.caisse_clotures
  for each row execute function public.caisse_piece_figee('une cloture de caisse');

drop trigger if exists trg_caisse_chaine_figee on public.caisse_chaine;
create trigger trg_caisse_chaine_figee
  before update or delete on public.caisse_chaine
  for each row execute function public.caisse_piece_figee('un maillon de la chaine');

-- Un vidage en bloc (truncate) ne passe pas par les declencheurs de ligne :
-- il est refuse a part, sur les pieces et sur les tables qu'elles scellent.
drop trigger if exists trg_caisse_clotures_vidage on public.caisse_clotures;
create trigger trg_caisse_clotures_vidage
  before truncate on public.caisse_clotures
  for each statement execute function public.caisse_piece_figee('la table des clotures');
drop trigger if exists trg_caisse_chaine_vidage on public.caisse_chaine;
create trigger trg_caisse_chaine_vidage
  before truncate on public.caisse_chaine
  for each statement execute function public.caisse_piece_figee('la chaine d''integrite');
drop trigger if exists trg_caisse_compteurs_vidage on public.caisse_compteurs;
create trigger trg_caisse_compteurs_vidage
  before truncate on public.caisse_compteurs
  for each statement execute function public.caisse_piece_figee('la table des compteurs');
drop trigger if exists trg_caisse_tickets_vidage on public.caisse_tickets;
create trigger trg_caisse_tickets_vidage
  before truncate on public.caisse_tickets
  for each statement execute function public.caisse_piece_figee('la table des tickets');
drop trigger if exists trg_caisse_lignes_vidage on public.caisse_lignes;
create trigger trg_caisse_lignes_vidage
  before truncate on public.caisse_lignes
  for each statement execute function public.caisse_piece_figee('la table des lignes');
drop trigger if exists trg_caisse_paiements_vidage on public.caisse_paiements;
create trigger trg_caisse_paiements_vidage
  before truncate on public.caisse_paiements
  for each statement execute function public.caisse_piece_figee('la table des paiements');

-- Un compteur ne recule pas et ne se supprime pas (un numero rendu par une
-- transaction annulee ne passe pas par ici : la ligne revient d'elle-meme).
create or replace function public.caisse_compteur_garde()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' or new.valeur < old.valeur
     or new.etablissement_id is distinct from old.etablissement_id or new.cle is distinct from old.cle then
    raise exception 'caisse: un compteur ne recule pas et ne se supprime pas'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.caisse_compteur_garde() from public, anon, authenticated;

drop trigger if exists trg_caisse_compteur_garde on public.caisse_compteurs;
create trigger trg_caisse_compteur_garde
  before update or delete on public.caisse_compteurs
  for each row execute function public.caisse_compteur_garde();

-- Les reglages qui decident de la TVA et des dates laissent une trace au
-- Journal d'activite (declencheur generique de 20261015_journal_activite) :
-- taux et taux reduit d'une categorie, surcharge d'un produit, reglages de la
-- caisse (arrondi, fin de journee, bascule, coordonnees). Les tickets deja
-- scelles gardent leur taux ; c'est le changement lui-meme qui est trace.
drop trigger if exists trg_caisse_categories_journal_tva on public.caisse_categories;
create trigger trg_caisse_categories_journal_tva
  after update of taux_tva, emporter_reduit on public.caisse_categories
  for each row execute function public.journal_activite_log();
drop trigger if exists trg_caisse_boutons_journal_tva on public.caisse_boutons;
create trigger trg_caisse_boutons_journal_tva
  after update of taux_tva on public.caisse_boutons
  for each row execute function public.journal_activite_log();
drop trigger if exists trg_caisse_reglages_journal on public.caisse_reglages;
create trigger trg_caisse_reglages_journal
  after insert or update or delete on public.caisse_reglages
  for each row execute function public.journal_activite_log();

-- ----------------------------------------------------------------------------
-- 3. Fonctions internes (aucune n'est appelable par l'API)
-- ----------------------------------------------------------------------------
-- 3.1 Le role de l'appelant sur un etablissement : null si le compte est
-- desactive, sans role, ou pas rattache a l'etablissement. En plpgsql, rendu
-- dans une variable par les RPC avant toute ecriture.
create or replace function public.caisse_role_actif(p_etablissement_id text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   text := auth.uid()::text;
  v_role  text;
  v_actif boolean;
  v_etabs text[];
begin
  if v_uid is null or p_etablissement_id is null then
    return null;
  end if;
  select p.role, p.actif, p.etablissement_ids
    into v_role, v_actif, v_etabs
    from public.profiles p
   where p.id = v_uid;
  if not found or v_actif is false or coalesce(v_role, '') = '' then
    return null;
  end if;
  if not coalesce(p_etablissement_id = any(v_etabs), false) then
    return null;
  end if;
  return v_role;
end;
$$;

revoke all on function public.caisse_role_actif(text) from public, anon, authenticated;

-- 3.2 Une heure des reglages de la caisse (caisse_reglages.config), bornee ;
-- absente, mal ecrite ou hors bornes : le defaut.
create or replace function public.caisse_reglage_heure(
  p_etablissement_id text, p_cle text, p_defaut time, p_min time, p_max time)
returns time
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_texte text;
  v_heure time;
begin
  select r.config ->> p_cle into v_texte
    from public.caisse_reglages r
   where r.etablissement_id = p_etablissement_id;
  if v_texte is null or v_texte !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    return p_defaut;
  end if;
  v_heure := v_texte::time;
  if v_heure < p_min or v_heure > p_max then
    return p_defaut;
  end if;
  return v_heure;
end;
$$;

revoke all on function public.caisse_reglage_heure(text, text, time, time, time) from public, anon, authenticated;

-- 3.3 Le jour d'exploitation d'un instant : la journee finit a l'heure reglee
-- (fin_journee, 04:00 par defaut, heure de Zurich), pour qu'un service du soir
-- qui passe minuit reste sur son jour.
create or replace function public.caisse_jour_exploitation(p_etablissement_id text, p_instant timestamptz)
returns date
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return ((p_instant at time zone 'Europe/Zurich')
          - public.caisse_reglage_heure(p_etablissement_id, 'fin_journee', '04:00', '00:00', '11:59')::interval)::date;
end;
$$;

revoke all on function public.caisse_jour_exploitation(text, timestamptz) from public, anon, authenticated;

-- 3.4 Le premier jour encore ouvert a partir d'un instant : un jour deja
-- cloture n'accepte plus rien, la piece passe au jour suivant. A appeler sous
-- le verrou de l'etablissement (caisse_compteur_suivant(etab, 'chaine')).
create or replace function public.caisse_jour_ouvert(p_etablissement_id text, p_instant timestamptz)
returns date
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_jour date := public.caisse_jour_exploitation(p_etablissement_id, p_instant);
begin
  while exists (
    select 1 from public.caisse_clotures c
     where c.etablissement_id = p_etablissement_id
       and c.jour_exploitation = v_jour
       and c.complement_de is null
  ) loop
    v_jour := v_jour + 1;
  end loop;
  return v_jour;
end;
$$;

revoke all on function public.caisse_jour_ouvert(text, timestamptz) from public, anon, authenticated;

-- 3.5 Le service d'un instant : soir avant la fin de journee (le service de
-- la veille deborde minuit), midi jusqu'a la bascule (15:00 par defaut, la
-- regle de statutsReservation.js), soir ensuite.
create or replace function public.caisse_service_a(p_etablissement_id text, p_instant timestamptz)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_heure time := (p_instant at time zone 'Europe/Zurich')::time;
begin
  if v_heure < public.caisse_reglage_heure(p_etablissement_id, 'fin_journee', '04:00', '00:00', '11:59') then
    return 'soir';
  end if;
  if v_heure < public.caisse_reglage_heure(p_etablissement_id, 'bascule_service', '15:00', '10:00', '19:00') then
    return 'midi';
  end if;
  return 'soir';
end;
$$;

revoke all on function public.caisse_service_a(text, timestamptz) from public, anon, authenticated;

-- 3.6 Compteur : rend la valeur suivante et tient la ligne verrouillee
-- jusqu'a la fin de la transaction. Une transaction annulee rend son numero :
-- pas de trou.
create or replace function public.caisse_compteur_suivant(p_etablissement_id text, p_cle text)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_valeur bigint;
begin
  insert into public.caisse_compteurs as c (etablissement_id, cle, valeur)
  values (p_etablissement_id, p_cle, 1)
  on conflict (etablissement_id, cle)
  do update set valeur = c.valeur + 1, updated_at = now()
  returning c.valeur into v_valeur;
  return v_valeur;
end;
$$;

revoke all on function public.caisse_compteur_suivant(text, text) from public, anon, authenticated;

-- 3.7 Le taux d'une ligne, dans l'ordre :
--   1. la surcharge du produit (caisse_boutons.taux_tva), toujours ;
--   2. a emporter, 2.6 si la categorie de caisse du produit l'autorise ;
--   3. le taux de la categorie de caisse ;
--   4. 8.1.
-- La categorie d'un produit se trouve comme sur la grille : celle que la
-- maison lui a donnee (caisse_boutons.categorie_id), sinon la categorie de
-- caisse qui porte le nom de plats.categorie. Un article libre, ou un produit
-- sans categorie de caisse en base, reste au taux normal, a emporter compris.
create or replace function public.caisse_taux_ligne(p_etablissement_id text, p_plat_id text, p_a_emporter boolean)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_surcharge numeric;
  v_categorie uuid;
  v_taux      numeric;
  v_reduit    boolean;
begin
  if p_plat_id is not null then
    select b.taux_tva, b.categorie_id into v_surcharge, v_categorie
      from public.caisse_boutons b
     where b.plat_id = p_plat_id and b.etablissement_id = p_etablissement_id;
    if v_surcharge is not null then
      return v_surcharge;
    end if;
    if v_categorie is not null then
      select c.taux_tva, c.emporter_reduit into v_taux, v_reduit
        from public.caisse_categories c
       where c.id = v_categorie and c.etablissement_id = p_etablissement_id;
    end if;
    if v_taux is null then
      select c.taux_tva, c.emporter_reduit into v_taux, v_reduit
        from public.plats p
        join public.caisse_categories c
          on c.etablissement_id = p.etablissement_id
         and lower(btrim(c.nom)) = lower(coalesce(nullif(btrim(p.categorie), ''), 'Plats'))
       where p.id = p_plat_id and p.etablissement_id = p_etablissement_id
       order by c.nom
       limit 1;
    end if;
  end if;
  if coalesce(p_a_emporter, false) and coalesce(v_reduit, false) then
    return 2.6;
  end if;
  return coalesce(v_taux, 8.1);
end;
$$;

revoke all on function public.caisse_taux_ligne(text, text, boolean) from public, anon, authenticated;

-- 3.8 Le detail de TVA d'un ticket : par taux, le total TVA comprise et la
-- TVA, arrondie au centime sur le total du taux. Prix TVA comprise :
-- TVA = TTC x taux / (100 + taux).
create or replace function public.caisse_detail_tva(p_ticket_id uuid)
returns table (taux numeric, ttc numeric, tva numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select x.taux, x.ttc, round(x.ttc * x.taux / (100 + x.taux), 2) as tva
    from (
      select coalesce(l.taux_tva, 8.1) as taux,
             sum(round(l.quantite * l.prix_unitaire, 2)) as ttc
        from public.caisse_lignes l
       where l.ticket_id = p_ticket_id
       group by 1
    ) x
   order by x.taux desc;
$$;

revoke all on function public.caisse_detail_tva(uuid) from public, anon, authenticated;

-- 3.9 Empreinte d'un maillon : sha256 de l'empreinte precedente et du contenu.
create or replace function public.caisse_empreinte(p_precedente text, p_contenu text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select encode(sha256(convert_to(p_precedente || '|' || p_contenu, 'UTF8')), 'hex');
$$;

revoke all on function public.caisse_empreinte(text, text) from public, anon, authenticated;

-- 3.10 Le contenu d'une piece, tel qu'il entre dans l'empreinte. Texte stable :
-- nombres sans zeros de fin, heures en UTC, lignes et paiements dans l'ordre
-- de leur creation. Le ticket est passe en ligne entiere : le declencheur de
-- scellement y met les valeurs qu'il est en train de poser.
create or replace function public.caisse_contenu_ticket(p_ticket public.caisse_tickets)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'genre', 'ticket',
    'id', (p_ticket).id,
    'etablissement', (p_ticket).etablissement_id,
    'annee', (p_ticket).annee,
    'numero', (p_ticket).numero,
    'jour', to_char((p_ticket).jour_exploitation, 'YYYY-MM-DD'),
    'service', (p_ticket).service,
    'a_emporter', (p_ticket).a_emporter,
    'encaisse_at', to_char((p_ticket).closed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    'total', trim_scale((p_ticket).total_ttc)::text,
    'lignes', coalesce((
      select jsonb_agg(jsonb_build_array(
               l.id, l.libelle, trim_scale(l.quantite)::text, trim_scale(l.prix_unitaire)::text,
               coalesce(trim_scale(l.prix_origine)::text, ''), trim_scale(l.remise_montant)::text,
               coalesce(l.remise_motif, ''), coalesce(l.remise_par, ''), l.offert,
               coalesce(trim_scale(l.taux_tva)::text, ''), l.a_emporter)
             order by l.created_at, l.id)
        from public.caisse_lignes l
       where l.ticket_id = (p_ticket).id), '[]'::jsonb),
    'paiements', coalesce((
      select jsonb_agg(jsonb_build_array(
               p.id, p.moyen, coalesce(p.libelle, ''), trim_scale(p.montant)::text,
               trim_scale(p.pourboire)::text, trim_scale(p.rendu)::text, trim_scale(p.arrondi)::text,
               coalesce(p.encaisse_par, ''))
             order by p.created_at, p.id)
        from public.caisse_paiements p
       where p.ticket_id = (p_ticket).id), '[]'::jsonb)
  )::text;
$$;

revoke all on function public.caisse_contenu_ticket(public.caisse_tickets) from public, anon, authenticated;

create or replace function public.caisse_contenu_annulation(p_ticket public.caisse_tickets)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'genre', 'annulation',
    'ticket', (p_ticket).id,
    'etablissement', (p_ticket).etablissement_id,
    'annee', (p_ticket).annee,
    'numero', (p_ticket).numero,
    'annule_at', to_char((p_ticket).annule_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    'annule_par', (p_ticket).annule_par,
    'annule_jour', to_char((p_ticket).annule_jour, 'YYYY-MM-DD'),
    'motif', (p_ticket).annule_motif
  )::text;
$$;

revoke all on function public.caisse_contenu_annulation(public.caisse_tickets) from public, anon, authenticated;

create or replace function public.caisse_contenu_cloture(p_cloture public.caisse_clotures)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'genre', 'cloture',
    'id', (p_cloture).id,
    'etablissement', (p_cloture).etablissement_id,
    'numero', (p_cloture).numero,
    'jour', to_char((p_cloture).jour_exploitation, 'YYYY-MM-DD'),
    'totaux', (p_cloture).totaux,
    'fond_caisse', trim_scale((p_cloture).fond_caisse)::text,
    'especes_comptees', trim_scale((p_cloture).especes_comptees)::text,
    'ecart', trim_scale((p_cloture).ecart)::text,
    'motif', coalesce((p_cloture).motif, ''),
    'cloture_par', coalesce((p_cloture).cloture_par, ''),
    'cloture_at', to_char((p_cloture).cloture_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    'complement_de', coalesce((p_cloture).complement_de::text, '')
  )::text;
$$;

revoke all on function public.caisse_contenu_cloture(public.caisse_clotures) from public, anon, authenticated;

-- 3.11 L'empreinte du maillon precedent. Le rang vient de
-- caisse_compteur_suivant(etab, 'chaine'), pris AVANT : c'est lui qui tient
-- le verrou de l'etablissement. Un maillon precedent introuvable arrete tout :
-- on ne continue pas une chaine rompue.
create or replace function public.caisse_chaine_precedente(p_etablissement_id text, p_rang bigint)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_precedente text;
begin
  if p_rang <= 1 then
    return repeat('0', 64);
  end if;
  select c.empreinte into v_precedente
    from public.caisse_chaine c
   where c.etablissement_id = p_etablissement_id and c.rang = p_rang - 1;
  if v_precedente is null then
    raise exception 'caisse: chaine d''integrite rompue (maillon % introuvable)', p_rang - 1;
  end if;
  return v_precedente;
end;
$$;

revoke all on function public.caisse_chaine_precedente(text, bigint) from public, anon, authenticated;

-- 3.12 Le sceau d'un ticket : sous le verrou de l'etablissement, fige le taux
-- de chaque ligne, le total, le jour, le numero et l'empreinte, et ajoute le
-- maillon. Rend la ligne du ticket completee ; l'appelant la pose.
--   p_reprise faux : encaissement (declencheur). Heure = l'horloge reelle
--     apres le verrou (p_instant n'est pas lu), jour = le premier jour encore
--     ouvert, taux selon la categorie, paiements egaux au total.
--   p_reprise vrai : ticket encaisse avant ce fichier. Jour deduit de l'heure
--     d'encaissement, 8.1 sur place pour chaque ligne, montants laisses tels
--     quels (aucune egalite exigee).
create or replace function public.caisse_sceau(
  p_ticket public.caisse_tickets, p_instant timestamptz, p_reprise boolean)
returns public.caisse_tickets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v         public.caisse_tickets := p_ticket;
  v_rang    bigint;
  v_instant timestamptz;
  v_lignes  int;
  v_total  numeric;
  v_paye   numeric;
begin
  if v.test then
    raise exception 'caisse: un ticket de test ne se scelle pas';
  end if;
  if v.numero is not null then
    raise exception 'caisse: ticket deja scelle';
  end if;

  -- Le verrou de l'etablissement, d'abord : tout ce qui suit (jour, numero,
  -- maillon) se lit et s'ecrit a l'abri d'un autre encaissement, d'une
  -- annulation ou d'une cloture.
  v_rang := public.caisse_compteur_suivant(v.etablissement_id, 'chaine');

  -- L'heure d'un encaissement se lit APRES le verrou, a l'horloge reelle :
  -- l'ordre des heures suit celui des numeros, et un ticket du jour suivant
  -- ne porte jamais une heure d'avant la cloture qui l'y a envoye.
  v_instant := case when p_reprise then p_instant else clock_timestamp() end;
  v.closed_at := v_instant;
  v.service := coalesce(v.service, public.caisse_service_a(v.etablissement_id, v.created_at));
  if p_reprise then
    v.jour_exploitation := public.caisse_jour_exploitation(v.etablissement_id, v_instant);
    update public.caisse_lignes l
       set taux_tva = 8.1, a_emporter = false
     where l.ticket_id = v.id;
  else
    v.jour_exploitation := public.caisse_jour_ouvert(v.etablissement_id, v_instant);
    update public.caisse_lignes l
       set taux_tva = public.caisse_taux_ligne(v.etablissement_id, l.plat_id, v.a_emporter),
           a_emporter = v.a_emporter
     where l.ticket_id = v.id;
  end if;
  get diagnostics v_lignes = row_count;
  if v_lignes = 0 and not p_reprise then
    raise exception 'caisse: un ticket vide ne s''encaisse pas';
  end if;

  select coalesce(sum(round(l.quantite * l.prix_unitaire, 2)), 0) into v_total
    from public.caisse_lignes l where l.ticket_id = v.id;
  if not p_reprise then
    select coalesce(sum(p.montant), 0) into v_paye
      from public.caisse_paiements p where p.ticket_id = v.id;
    if abs(v_paye - v_total) >= 0.005 then
      raise exception 'caisse: les paiements ne font pas le total (% pour %)', v_paye, v_total;
    end if;
  end if;
  v.total_ttc := v_total;

  v.annee := extract(year from v.jour_exploitation)::int;
  v.numero := public.caisse_compteur_suivant(v.etablissement_id, 'ticket:' || v.annee)::int;

  v.empreinte_precedente := public.caisse_chaine_precedente(v.etablissement_id, v_rang);
  v.empreinte := public.caisse_empreinte(v.empreinte_precedente, public.caisse_contenu_ticket(v));

  insert into public.caisse_chaine
    (etablissement_id, rang, genre, ticket_id, empreinte, empreinte_precedente)
  values
    (v.etablissement_id, v_rang, 'ticket', v.id, v.empreinte, v.empreinte_precedente);

  return v;
end;
$$;

revoke all on function public.caisse_sceau(public.caisse_tickets, timestamptz, boolean) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Gardes
-- ----------------------------------------------------------------------------
-- 4.1 Ticket, colonnes de la v7 (declencheur a part, gardes v1b a v6
-- intactes). Fonction SECURITY INVOKER : current_user y dit qui ecrit, un
-- compte de l'API (authenticated, anon) ou une fonction de la base.
--   - un compte de l'API ne pose ni ne change jamais numero, annee, service,
--     jour, total, empreintes ni les champs d'annulation ; il peut marquer un
--     ticket ouvert a emporter ;
--   - un ticket qui porte un numero ne se supprime plus et ne se modifie
--     plus, par personne ; seul reste son passage a annule, par
--     caisse_annuler_ticket, avec motif, auteur et heure ;
--   - un ticket annule ne bouge plus.
create or replace function public.caisse_ticket_garde_v7()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  -- Tout ce qui n'est pas le proprietaire des fonctions de la base est traite
  -- comme un compte de l'API (authenticated, anon, service_role compris).
  v_api boolean := current_user not in ('postgres', 'supabase_admin');
begin
  if tg_op = 'DELETE' then
    -- Un ticket numerote, ou un abandon date (il entre dans les « abandons »
    -- d'une cloture), ne se supprime plus. Un ticket de test n'a ni l'un ni
    -- l'autre : sa purge (v6) passe.
    if old.numero is not null or (old.jour_exploitation is not null and not old.test) then
      raise exception 'caisse: un ticket encaisse ou abandonne ne se supprime pas'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if v_api and (new.numero is not null or new.annee is not null or new.service is not null
       or new.jour_exploitation is not null or new.total_ttc is not null
       or new.empreinte is not null or new.empreinte_precedente is not null
       or new.annule_motif is not null or new.annule_par is not null
       or new.annule_at is not null or new.annule_jour is not null) then
      raise exception 'caisse: le numero et le scellement d''un ticket ne s''ecrivent pas depuis l''ecran'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if v_api and (new.numero is distinct from old.numero
     or new.annee is distinct from old.annee
     or new.service is distinct from old.service
     or new.jour_exploitation is distinct from old.jour_exploitation
     or new.total_ttc is distinct from old.total_ttc
     or new.empreinte is distinct from old.empreinte
     or new.empreinte_precedente is distinct from old.empreinte_precedente
     or new.annule_motif is distinct from old.annule_motif
     or new.annule_par is distinct from old.annule_par
     or new.annule_at is distinct from old.annule_at
     or new.annule_jour is distinct from old.annule_jour) then
    raise exception 'caisse: le numero et le scellement d''un ticket ne s''ecrivent pas depuis l''ecran'
      using errcode = '42501';
  end if;

  if old.numero is not null then
    if new.numero is distinct from old.numero
       or new.annee is distinct from old.annee
       or new.service is distinct from old.service
       or new.jour_exploitation is distinct from old.jour_exploitation
       or new.total_ttc is distinct from old.total_ttc
       or new.empreinte is distinct from old.empreinte
       or new.empreinte_precedente is distinct from old.empreinte_precedente
       or new.closed_at is distinct from old.closed_at
       or new.a_emporter is distinct from old.a_emporter
       or new.etablissement_id is distinct from old.etablissement_id
       or new.created_at is distinct from old.created_at then
      raise exception 'caisse: un ticket encaisse ne se modifie plus'
        using errcode = '42501';
    end if;

    if old.statut = 'annule' then
      if new.statut is distinct from old.statut
         or new.annule_motif is distinct from old.annule_motif
         or new.annule_par is distinct from old.annule_par
         or new.annule_at is distinct from old.annule_at
         or new.annule_jour is distinct from old.annule_jour then
        raise exception 'caisse: un ticket annule ne se modifie plus'
          using errcode = '42501';
      end if;
    elsif new.statut = 'annule' then
      -- encaisse vers annule : par caisse_annuler_ticket seulement.
      if v_api then
        raise exception 'caisse: un ticket encaisse s''annule avec un motif, depuis l''historique'
          using errcode = '42501';
      end if;
      if new.annule_at is null or new.annule_par is null or new.annule_jour is null
         or nullif(btrim(coalesce(new.annule_motif, '')), '') is null then
        raise exception 'caisse: annulation sans motif, auteur ou heure';
      end if;
    elsif new.annule_motif is distinct from old.annule_motif
       or new.annule_par is distinct from old.annule_par
       or new.annule_at is distinct from old.annule_at
       or new.annule_jour is distinct from old.annule_jour then
      raise exception 'caisse: un ticket encaisse ne se modifie plus'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.caisse_ticket_garde_v7() from public, anon, authenticated;

drop trigger if exists trg_caisse_ticket_garde_v7 on public.caisse_tickets;
create trigger trg_caisse_ticket_garde_v7
  before insert or update or delete on public.caisse_tickets
  for each row execute function public.caisse_ticket_garde_v7();

-- 4.2 Le scellement. Passe apres toutes les gardes (ordre des noms :
-- trg_caisse_ticket_garde, _garde_client, _garde_test, _garde_v7, puis
-- _sceller). SECURITY DEFINER : il ecrit les compteurs, la chaine et le taux
-- des lignes, que l'appelant ne peut pas ecrire.
--   - a l'ouverture : le service du ticket (celui de la reservation, sinon
--     l'heure) ;
--   - au passage ouvert vers encaisse d'un vrai ticket : le sceau, a l'heure
--     de la base (celle envoyee par l'ecran est remplacee) ;
--   - a l'abandon d'un ticket ouvert (ouvert vers annule) : l'heure de la
--     base et le jour, sans numero ;
--   - un ticket de test n'est jamais scelle.
create or replace function public.caisse_ticket_sceller()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_service text;
begin
  if tg_op = 'INSERT' then
    if new.service is null then
      if new.reservation_id is not null then
        select case r.service when 'soir' then 'soir' when 'midi' then 'midi' when 'brunch' then 'midi' end
          into v_service
          from public.reservations r
         where r.id = new.reservation_id and r.etablissement_id = new.etablissement_id;
      end if;
      new.service := coalesce(v_service, public.caisse_service_a(new.etablissement_id, now()));
    end if;
    return new;
  end if;

  if old.statut = 'ouvert' and not new.test then
    if new.statut = 'encaisse' then
      new := public.caisse_sceau(new, now(), false);
    elsif new.statut = 'annule' then
      -- Sans verrou : le jour d'un abandon n'est qu'une information de la
      -- cloture (aucun numero, aucun montant de vente).
      new.closed_at := now();
      new.jour_exploitation := public.caisse_jour_ouvert(new.etablissement_id, now());
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.caisse_ticket_sceller() from public, anon, authenticated;

drop trigger if exists trg_caisse_ticket_sceller on public.caisse_tickets;
create trigger trg_caisse_ticket_sceller
  before insert or update on public.caisse_tickets
  for each row execute function public.caisse_ticket_sceller();

-- 4.3 Lignes, garde v2 reprise a l'identique, deux passages ajoutes, tous deux
-- reserves aux fonctions de la base (current_user = leur proprietaire) :
--   - sur un ticket encaisse avant ce fichier et pas encore numerote, la
--     reprise pose taux_tva et a_emporter, et rien d'autre ;
--   - sur une ligne deja envoyee, caisse_remise change le prix (une remise
--     ou un offert au moment de payer porte sur des plats deja servis).
create or replace function public.caisse_ligne_garde()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_statut     text;
  v_numero     int;
  v_statut_new text;
begin
  select statut, numero into v_statut, v_numero from public.caisse_tickets
   where id = coalesce(old.ticket_id, new.ticket_id) for update;

  if v_statut is null then
    if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
    raise exception 'caisse: ticket introuvable';
  end if;

  if tg_op = 'DELETE' then
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
    if v_statut <> 'ouvert' then
      raise exception 'caisse: le ticket n''est pas ouvert';
    end if;
    if new.statut <> 'en_attente' then
      raise exception 'caisse: une ligne nait en attente';
    end if;
    return new;
  end if;

  if v_statut <> 'ouvert' then
    -- v7, reprise : le taux d'une ligne d'un ticket encaisse pas encore numerote.
    if v_statut = 'encaisse' and v_numero is null
       and current_user in ('postgres', 'supabase_admin')
       and (to_jsonb(new) - 'taux_tva' - 'a_emporter' - 'updated_at')
           = (to_jsonb(old) - 'taux_tva' - 'a_emporter' - 'updated_at') then
      return new;
    end if;
    raise exception 'caisse: ticket fige, lignes comprises';
  end if;
  if new.ticket_id is distinct from old.ticket_id then
    select statut into v_statut_new from public.caisse_tickets
     where id = new.ticket_id for update;
    if v_statut_new is distinct from 'ouvert' then
      raise exception 'caisse: fusion vers un ticket non ouvert';
    end if;
  end if;

  if old.statut <> 'en_attente' then
    if new.plat_id is distinct from old.plat_id
       or new.libelle <> old.libelle
       or new.quantite <> old.quantite
       or new.prix_unitaire <> old.prix_unitaire
       or new.suite <> old.suite
       or new.note is distinct from old.note
       or new.options is distinct from old.options
       or new.statut not in ('envoye','servi') then
      -- v7 : une fonction de la base (caisse_remise) passe aussi.
      if not (current_user_role() = any(array['consultant','patron'])
              or current_user in ('postgres', 'supabase_admin')) then
        raise exception 'caisse: ligne deja envoyee (correction par la direction seulement)';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- 4.4 Lignes, colonnes de la v7 (declencheur a part). SECURITY INVOKER.
--   - un compte de l'API n'ecrit ni le taux, ni le mode de consommation, ni
--     une remise, ni un offert ; il ne change jamais le prix d'une ligne ni
--     son plat : un prix se baisse par caisse_remise, avec un motif ;
--   - a l'ajout d'une ligne de plat par l'API, le prix est celui de la carte
--     au moment du tap (lu dans plats, pas dans l'appel) ; un article libre
--     garde le prix saisi ;
--   - quand la quantite d'une ligne remisee change, le montant remis suit.
create or replace function public.caisse_ligne_garde_v7()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_api  boolean := current_user not in ('postgres', 'supabase_admin');
  v_prix numeric;
begin
  if v_api then
    if tg_op = 'INSERT' then
      if new.taux_tva is not null or new.a_emporter or new.remise_montant <> 0
         or new.remise_motif is not null or new.remise_par is not null or new.remise_at is not null
         or new.offert or new.prix_origine is not null then
        raise exception 'caisse: la TVA, les remises et les offerts ne s''ecrivent pas depuis l''ecran'
          using errcode = '42501';
      end if;
      if new.plat_id is not null then
        select p.prix_vente into v_prix
          from public.plats p
          join public.caisse_tickets t on t.etablissement_id = p.etablissement_id
         where p.id = new.plat_id and t.id = new.ticket_id;
        if not found then
          raise exception 'caisse: plat inconnu pour cet etablissement'
            using errcode = '42501';
        end if;
        new.prix_unitaire := coalesce(v_prix, 0);
      end if;
    else
      if new.taux_tva is distinct from old.taux_tva
         or new.a_emporter is distinct from old.a_emporter
         or new.remise_motif is distinct from old.remise_motif
         or new.remise_par is distinct from old.remise_par
         or new.remise_at is distinct from old.remise_at
         or new.offert is distinct from old.offert
         or new.prix_origine is distinct from old.prix_origine
         or new.remise_montant is distinct from old.remise_montant then
        raise exception 'caisse: la TVA, les remises et les offerts ne s''ecrivent pas depuis l''ecran'
          using errcode = '42501';
      end if;
      if new.prix_unitaire is distinct from old.prix_unitaire
         or new.plat_id is distinct from old.plat_id then
        raise exception 'caisse: le prix d''une ligne se baisse par une remise, avec un motif'
          using errcode = '42501';
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' and new.prix_origine is not null and not new.offert
     and new.quantite is distinct from old.quantite then
    new.remise_montant := greatest(
      round(new.quantite * new.prix_origine, 2) - round(new.quantite * new.prix_unitaire, 2), 0);
  end if;

  return new;
end;
$$;

revoke all on function public.caisse_ligne_garde_v7() from public, anon, authenticated;

drop trigger if exists trg_caisse_ligne_garde_v7 on public.caisse_lignes;
create trigger trg_caisse_ligne_garde_v7
  before insert or update on public.caisse_lignes
  for each row execute function public.caisse_ligne_garde_v7();

-- 4.5 Paiements, complement de la garde v1d (laissee telle quelle) :
--   - un compte de l'API ne saisit ni pourboire, ni rendu, ni arrondi (ils
--     passent par caisse_encaisser), et le paiement qu'il insere porte son
--     propre identifiant ;
--   - le paiement d'un ticket numerote ne se retire plus, par personne.
-- Deux fonctions : la premiere lit current_user (SECURITY INVOKER), la seconde
-- lit le ticket sans dependre de la RLS de l'appelant (SECURITY DEFINER).
create or replace function public.caisse_paiement_garde_v7()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('postgres', 'supabase_admin') then
    if new.pourboire <> 0 or new.rendu <> 0 or new.arrondi <> 0 then
      raise exception 'caisse: pourboire, rendu et arrondi passent par l''encaissement'
        using errcode = '42501';
    end if;
    -- Celui qui encaisse est celui qui appelle : l'ecran ne choisit pas un autre nom.
    new.encaisse_par := auth.uid()::text;
  end if;
  return new;
end;
$$;

revoke all on function public.caisse_paiement_garde_v7() from public, anon, authenticated;

drop trigger if exists trg_caisse_paiement_garde_v7 on public.caisse_paiements;
create trigger trg_caisse_paiement_garde_v7
  before insert on public.caisse_paiements
  for each row execute function public.caisse_paiement_garde_v7();

create or replace function public.caisse_paiement_scelle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_numero int;
begin
  select t.numero into v_numero from public.caisse_tickets t where t.id = old.ticket_id;
  if v_numero is not null then
    raise exception 'caisse: le paiement d''un ticket encaisse ne se retire pas'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke all on function public.caisse_paiement_scelle() from public, anon, authenticated;

drop trigger if exists trg_caisse_paiement_scelle on public.caisse_paiements;
create trigger trg_caisse_paiement_scelle
  before delete on public.caisse_paiements
  for each row execute function public.caisse_paiement_scelle();

-- ----------------------------------------------------------------------------
-- 5. RPC caisse_remise : remise ou offert, avec motif
-- ----------------------------------------------------------------------------
-- Consultant, patron, resp_cuisine (le serveur demande). Ticket ouvert.
--   p_ligne_id null : tout le ticket (les lignes offertes restent offertes).
--   p_genre : 'pourcent' (p_valeur entre 0 et 100 exclus), 'montant'
--     (p_valeur en francs ; sur le ticket il se repartit au prorata des
--     lignes, la derniere prend le reste), 'offert', 'retirer'.
-- Une remise remplace la precedente (elle repart du prix d'origine), elle ne
-- s'empile pas. Chaque geste laisse une ligne au Journal d'activite.
create or replace function public.caisse_remise(
  p_ticket_id uuid,
  p_ligne_id  uuid    default null,
  p_genre     text    default 'pourcent',
  p_valeur    numeric default null,
  p_motif     text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     text := auth.uid()::text;
  v_ticket  public.caisse_tickets%rowtype;
  v_role    text;
  v_peut    boolean;
  v_motif   text := nullif(btrim(coalesce(p_motif, '')), '');
  v_base    numeric;
  v_reste   numeric;
  v_n       int := 0;
  v_i       int := 0;
  v_avant   numeric;
  v_apres   numeric;
  v_brut    numeric;
  v_net     numeric;
  v_origine numeric;
  v_nom     text;
  l         record;
begin
  if p_genre is null or p_genre not in ('pourcent', 'montant', 'offert', 'retirer') then
    raise exception 'caisse: genre de remise inconnu';
  end if;

  select * into v_ticket from public.caisse_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'caisse: ticket introuvable';
  end if;
  v_role := public.caisse_role_actif(v_ticket.etablissement_id);
  v_peut := public.caisse_peut_utiliser(v_ticket.etablissement_id);
  if v_role is null or not (v_role = any(array['consultant', 'patron', 'resp_cuisine']))
     or not coalesce(v_peut, false) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if v_ticket.statut <> 'ouvert' then
    raise exception 'caisse: ticket % fige', v_ticket.statut;
  end if;
  if p_genre <> 'retirer' and (v_motif is null or char_length(v_motif) < 3 or char_length(v_motif) > 200) then
    raise exception 'caisse: un motif est obligatoire (3 a 200 caracteres)';
  end if;
  if p_genre = 'pourcent' and (p_valeur is null or p_valeur <= 0 or p_valeur >= 100) then
    raise exception 'caisse: pourcentage de remise invalide';
  end if;
  if p_genre = 'montant' and (p_valeur is null or p_valeur <= 0) then
    raise exception 'caisse: montant de remise invalide';
  end if;
  if p_ligne_id is not null and not exists (
       select 1 from public.caisse_lignes x where x.id = p_ligne_id and x.ticket_id = p_ticket_id) then
    raise exception 'caisse: ligne introuvable sur ce ticket';
  end if;

  select coalesce(sum(round(x.quantite * x.prix_unitaire, 2)), 0) into v_avant
    from public.caisse_lignes x where x.ticket_id = p_ticket_id;

  -- La base d'une remise : le prix d'origine des lignes visees (hors offerts
  -- quand la remise porte sur le ticket, hors lignes a 0).
  select coalesce(sum(round(x.quantite * coalesce(x.prix_origine, x.prix_unitaire), 2)), 0), count(*)
    into v_base, v_n
    from public.caisse_lignes x
   where x.ticket_id = p_ticket_id
     and (p_ligne_id is null or x.id = p_ligne_id)
     and (p_genre in ('offert', 'retirer') or p_ligne_id is not null or not x.offert)
     and (p_genre = 'retirer' or coalesce(x.prix_origine, x.prix_unitaire) > 0);
  if v_n = 0 then
    raise exception 'caisse: aucune ligne a remiser';
  end if;
  if p_genre = 'montant' and round(p_valeur, 2) >= v_base then
    raise exception 'caisse: la remise depasse le montant (utiliser offert)';
  end if;
  v_reste := round(coalesce(p_valeur, 0), 2);

  for l in
    select x.* from public.caisse_lignes x
     where x.ticket_id = p_ticket_id
       and (p_ligne_id is null or x.id = p_ligne_id)
       and (p_genre in ('offert', 'retirer') or p_ligne_id is not null or not x.offert)
       and (p_genre = 'retirer' or coalesce(x.prix_origine, x.prix_unitaire) > 0)
     order by x.created_at, x.id
  loop
    v_i := v_i + 1;
    v_origine := coalesce(l.prix_origine, l.prix_unitaire);
    v_brut := round(l.quantite * v_origine, 2);

    if p_genre = 'retirer' then
      if l.prix_origine is not null then
        update public.caisse_lignes
           set prix_unitaire = l.prix_origine, prix_origine = null, remise_montant = 0,
               remise_motif = null, remise_par = null, remise_at = null, offert = false
         where id = l.id;
      end if;
    elsif p_genre = 'offert' then
      update public.caisse_lignes
         set prix_unitaire = 0, prix_origine = v_origine, remise_montant = 0,
             remise_motif = v_motif, remise_par = v_uid, remise_at = now(), offert = true
       where id = l.id;
    else
      if p_genre = 'pourcent' then
        v_net := round(v_brut * (100 - p_valeur) / 100, 2);
      elsif v_i = v_n then
        v_net := v_brut - v_reste;
      else
        v_net := v_brut - round(round(p_valeur, 2) * v_brut / v_base, 2);
        v_reste := v_reste - (v_brut - v_net);
      end if;
      if v_net <= 0 then
        raise exception 'caisse: la remise depasse le montant (utiliser offert)';
      end if;
      update public.caisse_lignes
         set prix_unitaire = round(v_net / l.quantite, 6), prix_origine = v_origine,
             remise_montant = v_brut - round(l.quantite * round(v_net / l.quantite, 6), 2),
             remise_motif = v_motif, remise_par = v_uid, remise_at = now(), offert = false
       where id = l.id;
    end if;
  end loop;

  select coalesce(sum(round(x.quantite * x.prix_unitaire, 2)), 0) into v_apres
    from public.caisse_lignes x where x.ticket_id = p_ticket_id;

  -- Un ticket de test n'ecrit rien au Journal d'activite de la maison.
  if not v_ticket.test then
    select nullif(btrim(concat_ws(' ', p.prenom, p.nom)), '') into v_nom
      from public.profiles p where p.id = v_uid;

    insert into public.journal_activite
      (etablissement_id, acteur_id, acteur_nom, acteur_role, module, operation,
       ligne_id, libelle, colonnes_modifiees, avant, apres)
    values
      (v_ticket.etablissement_id, v_uid, v_nom, v_role, 'caisse', 'UPDATE',
       p_ticket_id::text,
       case p_genre when 'offert' then 'Offert' when 'retirer' then 'Remise retirée' else 'Remise' end
         || case when p_ligne_id is null then ' sur un ticket' else ' sur une ligne' end,
       array['prix_unitaire'],
       jsonb_build_object('total', v_avant),
       jsonb_build_object('total', v_apres, 'genre', p_genre, 'valeur', p_valeur, 'motif', v_motif, 'lignes', v_n));
  end if;

  return jsonb_build_object('lignes', v_n, 'total_avant', v_avant, 'total', v_apres);
end;
$$;

revoke execute on function public.caisse_remise(uuid, uuid, text, numeric, text) from public, anon, authenticated;
grant  execute on function public.caisse_remise(uuid, uuid, text, numeric, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. RPC caisse_encaisser
-- ----------------------------------------------------------------------------
-- Tout membre qui a la caisse (caisse_peut_utiliser, v5 : compte actif,
-- rattache, droit caisse). Une transaction : paiements, passage a encaisse,
-- sceau (numero sous verrou, taux, total, empreinte) par le declencheur.
--   p_paiements : [{ moyen, libelle, montant, recu, pourboire }]
--     moyen    : especes, carte, autre ;
--     montant  : la part du ticket reglee par ce moyen. La somme fait le
--                total, au centime ;
--     recu     : especes donnees par le client (facultatif) ; le rendu est
--                calcule ici ;
--     pourboire : a part, jamais dans le total.
--   Arrondi aux 5 centimes : sur la part reglee en especes seulement, si le
--   reglage arrondi_especes n'est pas coupe ; l'ecart est porte par le
--   dernier paiement en especes.
--   p_a_emporter : null = ce que porte deja le ticket.
-- Refuse un ticket vide, deja encaisse ou annule. Ticket de test : aucun
-- numero, aucun maillon ; un seul paiement simule, marque TEST, sans
-- pourboire ni rendu.
create or replace function public.caisse_encaisser(
  p_ticket_id  uuid,
  p_paiements  jsonb,
  p_a_emporter boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       text := auth.uid()::text;
  v_ticket    public.caisse_tickets%rowtype;
  v_peut      boolean;
  v_total     numeric;
  v_somme     numeric := 0;
  v_especes   numeric := 0;
  v_n         int;
  v_i         int := 0;
  v_dernier   int := 0;
  v_arrondir  boolean := true;
  v_arrondi   numeric := 0;
  v_ecart     numeric;
  v_rendu     numeric;
  v_rendu_tot numeric := 0;
  v_pourb_tot numeric := 0;
  v_moyen     text;
  v_libelle   text;
  v_montant   numeric;
  v_pourboire numeric;
  v_recu      numeric;
  e           jsonb;
begin
  select * into v_ticket from public.caisse_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'caisse: ticket introuvable';
  end if;
  v_peut := public.caisse_peut_utiliser(v_ticket.etablissement_id);
  if not coalesce(v_peut, false) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if v_ticket.statut = 'encaisse' then
    raise exception 'caisse: ticket deja encaisse';
  end if;
  if v_ticket.statut <> 'ouvert' then
    raise exception 'caisse: ticket % fige', v_ticket.statut;
  end if;
  if not exists (select 1 from public.caisse_lignes l where l.ticket_id = p_ticket_id) then
    raise exception 'caisse: un ticket vide ne s''encaisse pas';
  end if;
  if p_paiements is null or jsonb_typeof(p_paiements) <> 'array'
     or jsonb_array_length(p_paiements) < 1 or jsonb_array_length(p_paiements) > 8 then
    raise exception 'caisse: paiements invalides';
  end if;
  v_n := jsonb_array_length(p_paiements);

  select coalesce(sum(round(l.quantite * l.prix_unitaire, 2)), 0) into v_total
    from public.caisse_lignes l where l.ticket_id = p_ticket_id;

  -- Un paiement reste d'un essai interrompu de l'ancien chemin : on repart
  -- de zero (un ticket ouvert n'a pas de paiement valable).
  delete from public.caisse_paiements where ticket_id = p_ticket_id;

  if v_ticket.test then
    v_moyen := coalesce(p_paiements -> 0 ->> 'moyen', 'autre');
    if v_moyen not in ('especes', 'carte', 'autre') then
      raise exception 'caisse: moyen de paiement inconnu';
    end if;
    insert into public.caisse_paiements (ticket_id, moyen, libelle, montant, encaisse_par)
    values (p_ticket_id, v_moyen, 'TEST', v_total, v_uid);
    update public.caisse_tickets
       set statut = 'encaisse', closed_at = now(), a_emporter = coalesce(p_a_emporter, a_emporter)
     where id = p_ticket_id;
    return jsonb_build_object('ticket_id', p_ticket_id, 'test', true, 'numero', null, 'total', v_total,
                              'rendu', 0, 'arrondi', 0, 'pourboire', 0);
  end if;

  -- Premiere passe : controles, somme, part en especes.
  for e in select * from jsonb_array_elements(p_paiements) loop
    v_i := v_i + 1;
    v_moyen := e ->> 'moyen';
    if v_moyen is null or v_moyen not in ('especes', 'carte', 'autre') then
      raise exception 'caisse: moyen de paiement inconnu';
    end if;
    if char_length(coalesce(e ->> 'libelle', '')) > 40 then
      raise exception 'caisse: nom du moyen de paiement trop long';
    end if;
    v_montant := round(coalesce((e ->> 'montant')::numeric, 0), 2);
    v_pourboire := round(coalesce((e ->> 'pourboire')::numeric, 0), 2);
    if v_montant < 0 or v_pourboire < 0 or coalesce((e ->> 'recu')::numeric, 0) < 0
       or v_montant > 1000000 or v_pourboire > 100000 or coalesce((e ->> 'recu')::numeric, 0) > 1000000 then
      raise exception 'caisse: montant de paiement invalide';
    end if;
    v_somme := v_somme + v_montant;
    if v_moyen = 'especes' then
      v_especes := v_especes + v_montant;
      v_dernier := v_i;
    end if;
  end loop;
  if abs(v_somme - v_total) >= 0.005 then
    raise exception 'caisse: les paiements ne font pas le total (% pour %)', v_somme, v_total;
  end if;

  select coalesce(r.config -> 'arrondi_especes', 'true'::jsonb) <> 'false'::jsonb into v_arrondir
    from public.caisse_reglages r where r.etablissement_id = v_ticket.etablissement_id;
  if coalesce(v_arrondir, true) and v_dernier > 0 then
    v_arrondi := round(round(v_especes * 20) / 20 - v_especes, 2);
  end if;

  -- Seconde passe : ecriture. L'ecart d'arrondi va sur le dernier paiement en
  -- especes ; le rendu est ce que le client a donne moins ce qu'il doit
  -- (montant + ecart) et son pourboire.
  v_i := 0;
  for e in select * from jsonb_array_elements(p_paiements) loop
    v_i := v_i + 1;
    v_moyen := e ->> 'moyen';
    v_libelle := nullif(btrim(coalesce(e ->> 'libelle', '')), '');
    v_montant := round(coalesce((e ->> 'montant')::numeric, 0), 2);
    v_pourboire := round(coalesce((e ->> 'pourboire')::numeric, 0), 2);
    v_recu := round((e ->> 'recu')::numeric, 2);
    v_ecart := case when v_i = v_dernier then v_arrondi else 0 end;
    v_rendu := 0;
    if v_moyen = 'especes' and v_recu is not null then
      v_rendu := v_recu - (v_montant + v_ecart) - v_pourboire;
      if v_rendu < 0 then
        raise exception 'caisse: especes recues insuffisantes';
      end if;
    end if;
    insert into public.caisse_paiements
      (ticket_id, moyen, libelle, montant, pourboire, rendu, arrondi, encaisse_par)
    values
      (p_ticket_id, v_moyen, v_libelle, v_montant, v_pourboire, v_rendu, v_ecart, v_uid);
    v_rendu_tot := v_rendu_tot + v_rendu;
    v_pourb_tot := v_pourb_tot + v_pourboire;
  end loop;

  -- Le passage a encaisse : les gardes verifient, le declencheur scelle.
  update public.caisse_tickets
     set statut = 'encaisse', closed_at = now(), a_emporter = coalesce(p_a_emporter, a_emporter)
   where id = p_ticket_id
  returning * into v_ticket;

  return jsonb_build_object(
    'ticket_id', v_ticket.id,
    'test', false,
    'numero', v_ticket.numero,
    'annee', v_ticket.annee,
    'jour_exploitation', v_ticket.jour_exploitation,
    'total', v_ticket.total_ttc,
    'rendu', v_rendu_tot,
    'arrondi', v_arrondi,
    'pourboire', v_pourb_tot);
end;
$$;

revoke execute on function public.caisse_encaisser(uuid, jsonb, boolean) from public, anon, authenticated;
grant  execute on function public.caisse_encaisser(uuid, jsonb, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. RPC caisse_annuler_ticket : l'annulation tracee d'un ticket encaisse
-- ----------------------------------------------------------------------------
-- Consultant et patron. Motif obligatoire. Rien ne s'efface : le ticket garde
-- son numero, ses lignes et ses paiements ; il passe a annule, avec auteur,
-- heure et jour d'exploitation de l'annulation. La cloture de ce jour-la
-- porte l'ecriture inverse (ventes, TVA et moyens de paiement en moins). Un
-- maillon 'annulation' entre dans la chaine.
create or replace function public.caisse_annuler_ticket(p_ticket_id uuid, p_motif text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    text := auth.uid()::text;
  v_ticket public.caisse_tickets%rowtype;
  v_role   text;
  v_motif  text := nullif(btrim(coalesce(p_motif, '')), '');
  v_rang   bigint;
  v_instant timestamptz;
  v_prec   text;
  v_emp    text;
  v_nom    text;
begin
  select * into v_ticket from public.caisse_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'caisse: ticket introuvable';
  end if;
  v_role := public.caisse_role_actif(v_ticket.etablissement_id);
  if v_role is null or not (v_role = any(array['consultant', 'patron'])) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if v_ticket.test then
    raise exception 'caisse: un ticket de test ne s''annule pas ici';
  end if;
  if v_ticket.statut = 'annule' then
    raise exception 'caisse: ticket deja annule';
  end if;
  if v_ticket.statut <> 'encaisse' or v_ticket.numero is null then
    raise exception 'caisse: seul un ticket encaisse s''annule ici';
  end if;
  if v_motif is null or char_length(v_motif) < 3 or char_length(v_motif) > 300 then
    raise exception 'caisse: un motif est obligatoire (3 a 300 caracteres)';
  end if;

  v_rang := public.caisse_compteur_suivant(v_ticket.etablissement_id, 'chaine');
  v_instant := clock_timestamp(); -- apres le verrou, comme le sceau

  update public.caisse_tickets
     set statut = 'annule',
         annule_motif = v_motif,
         annule_par = v_uid,
         annule_at = v_instant,
         annule_jour = public.caisse_jour_ouvert(v_ticket.etablissement_id, v_instant)
   where id = p_ticket_id
  returning * into v_ticket;

  v_prec := public.caisse_chaine_precedente(v_ticket.etablissement_id, v_rang);
  v_emp := public.caisse_empreinte(v_prec, public.caisse_contenu_annulation(v_ticket));
  insert into public.caisse_chaine
    (etablissement_id, rang, genre, ticket_id, empreinte, empreinte_precedente)
  values
    (v_ticket.etablissement_id, v_rang, 'annulation', v_ticket.id, v_emp, v_prec);

  select nullif(btrim(concat_ws(' ', p.prenom, p.nom)), '') into v_nom
    from public.profiles p where p.id = v_uid;

  insert into public.journal_activite
    (etablissement_id, acteur_id, acteur_nom, acteur_role, module, operation,
     ligne_id, libelle, colonnes_modifiees, avant, apres)
  values
    (v_ticket.etablissement_id, v_uid, v_nom, v_role, 'caisse', 'UPDATE',
     v_ticket.id::text,
     'Ticket ' || v_ticket.annee || '-' || lpad(v_ticket.numero::text, 6, '0') || ' annulé',
     array['statut'],
     jsonb_build_object('statut', 'encaisse', 'total', v_ticket.total_ttc),
     jsonb_build_object('statut', 'annule', 'motif', v_motif));

  return jsonb_build_object(
    'ticket_id', v_ticket.id,
    'numero', v_ticket.numero,
    'annee', v_ticket.annee,
    'annule_jour', v_ticket.annule_jour);
end;
$$;

revoke execute on function public.caisse_annuler_ticket(uuid, text) from public, anon, authenticated;
grant  execute on function public.caisse_annuler_ticket(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Cloture du jour
-- ----------------------------------------------------------------------------
-- 8.1 Les totaux d'un jour d'exploitation (interne). Toute lecture de ventes
-- exclut test = true, et ne prend que les tickets numerotes.
--   ventes      : les tickets encaisses ce jour-la (annules depuis compris :
--                 la vente a eu lieu, son annulation est une ecriture a part) ;
--   annulations : les tickets annules ce jour-la, quel que soit leur jour de
--                 vente ;
--   net         : ventes moins annulations.
-- La TVA d'un taux est la somme des TVA de chaque ticket (chacune arrondie au
-- centime sur le total du taux du ticket), pas un recalcul sur le total du
-- jour. Especes attendues : ventes en especes (montant + arrondi) moins les
-- especes des tickets annules ce jour-la, pourboires non compris.
create or replace function public.caisse_totaux_jour(p_etablissement_id text, p_jour date)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ventes as (
    select t.* from public.caisse_tickets t
     where t.etablissement_id = p_etablissement_id and t.jour_exploitation = p_jour
       and t.numero is not null and t.test = false
  ), annules as (
    select t.* from public.caisse_tickets t
     where t.etablissement_id = p_etablissement_id and t.annule_jour = p_jour
       and t.numero is not null and t.test = false and t.statut = 'annule'
  ), tva_v as (
    select d.taux, sum(d.ttc) as ttc, sum(d.tva) as tva
      from ventes v cross join lateral public.caisse_detail_tva(v.id) d group by d.taux
  ), tva_a as (
    select d.taux, sum(d.ttc) as ttc, sum(d.tva) as tva
      from annules a cross join lateral public.caisse_detail_tva(a.id) d group by d.taux
  ), taux as (
    select taux from tva_v union select taux from tva_a
  ), tva_n as (
    select x.taux,
           coalesce(v.ttc, 0) - coalesce(a.ttc, 0) as ttc,
           coalesce(v.tva, 0) - coalesce(a.tva, 0) as tva
      from taux x
      left join tva_v v on v.taux = x.taux
      left join tva_a a on a.taux = x.taux
  ), moyens_v as (
    select p.moyen, coalesce(p.libelle, '') as libelle, count(*) as nombre,
           sum(p.montant + p.arrondi) as montant, sum(p.pourboire) as pourboire
      from ventes v join public.caisse_paiements p on p.ticket_id = v.id
     group by 1, 2
  ), moyens_a as (
    select p.moyen, coalesce(p.libelle, '') as libelle, count(*) as nombre,
           sum(p.montant + p.arrondi) as montant
      from annules a join public.caisse_paiements p on p.ticket_id = a.id
     group by 1, 2
  ), services as (
    select v.service, count(*) as tickets, coalesce(sum(v.couverts), 0) as couverts, sum(v.total_ttc) as ttc
      from ventes v group by v.service
  ), lignes as (
    select l.* from ventes v join public.caisse_lignes l on l.ticket_id = v.id
  )
  select jsonb_build_object(
    'jour', to_char(p_jour, 'YYYY-MM-DD'),
    'ventes', jsonb_build_object(
      'tickets', (select count(*) from ventes),
      'premier_numero', (select min(numero) from ventes),
      'dernier_numero', (select max(numero) from ventes),
      'couverts', (select coalesce(sum(couverts), 0) from ventes),
      'ttc', (select coalesce(sum(ttc), 0) from tva_v),
      'tva', (select coalesce(sum(tva), 0) from tva_v),
      'ht', (select coalesce(sum(ttc - tva), 0) from tva_v),
      'par_taux', coalesce((select jsonb_agg(jsonb_build_object('taux', taux, 'ttc', ttc, 'tva', tva, 'ht', ttc - tva) order by taux desc) from tva_v), '[]'::jsonb)),
    'annulations', jsonb_build_object(
      'tickets', (select count(*) from annules),
      'numeros', coalesce((select jsonb_agg(annee || '-' || lpad(numero::text, 6, '0') order by annee, numero) from annules), '[]'::jsonb),
      'ttc', (select coalesce(sum(ttc), 0) from tva_a),
      'tva', (select coalesce(sum(tva), 0) from tva_a),
      'ht', (select coalesce(sum(ttc - tva), 0) from tva_a),
      'par_taux', coalesce((select jsonb_agg(jsonb_build_object('taux', taux, 'ttc', ttc, 'tva', tva, 'ht', ttc - tva) order by taux desc) from tva_a), '[]'::jsonb),
      'moyens', coalesce((select jsonb_agg(jsonb_build_object('moyen', moyen, 'libelle', libelle, 'nombre', nombre, 'montant', montant) order by moyen, libelle) from moyens_a), '[]'::jsonb)),
    'net', jsonb_build_object(
      'ttc', (select coalesce(sum(ttc), 0) from tva_n),
      'tva', (select coalesce(sum(tva), 0) from tva_n),
      'ht', (select coalesce(sum(ttc - tva), 0) from tva_n),
      'par_taux', coalesce((select jsonb_agg(jsonb_build_object('taux', taux, 'ttc', ttc, 'tva', tva, 'ht', ttc - tva) order by taux desc) from tva_n), '[]'::jsonb)),
    'moyens', coalesce((select jsonb_agg(jsonb_build_object('moyen', moyen, 'libelle', libelle, 'nombre', nombre, 'montant', montant) order by moyen, libelle) from moyens_v), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('service', service, 'tickets', tickets, 'couverts', couverts, 'ttc', ttc) order by service) from services), '[]'::jsonb),
    'remises', jsonb_build_object(
      'lignes', (select count(*) from lignes where prix_origine is not null and not offert),
      'montant', (select coalesce(sum(remise_montant), 0) from lignes where prix_origine is not null and not offert)),
    'offerts', jsonb_build_object(
      'lignes', (select count(*) from lignes where offert),
      'valeur', (select coalesce(sum(round(quantite * prix_origine, 2)), 0) from lignes where offert)),
    'pourboires', jsonb_build_object(
      'total', (select coalesce(sum(pourboire), 0) from moyens_v),
      'par_moyen', coalesce((select jsonb_agg(jsonb_build_object('moyen', moyen, 'libelle', libelle, 'montant', pourboire) order by moyen, libelle) from moyens_v where pourboire <> 0), '[]'::jsonb)),
    'arrondis', (select coalesce(sum(p.arrondi), 0) from ventes v join public.caisse_paiements p on p.ticket_id = v.id),
    'especes', jsonb_build_object(
      'ventes', (select coalesce(sum(montant), 0) from moyens_v where moyen = 'especes'),
      'annulees', (select coalesce(sum(montant), 0) from moyens_a where moyen = 'especes'),
      'attendues', (select coalesce(sum(montant), 0) from moyens_v where moyen = 'especes')
                 - (select coalesce(sum(montant), 0) from moyens_a where moyen = 'especes')),
    'abandons', (
      select jsonb_build_object(
               'tickets', count(*),
               'montant', coalesce(sum((
                 select coalesce(sum(round(l.quantite * l.prix_unitaire, 2)), 0)
                   from public.caisse_lignes l
                  where l.ticket_id = t.id and l.statut <> 'en_attente')), 0))
        from public.caisse_tickets t
       where t.etablissement_id = p_etablissement_id and t.jour_exploitation = p_jour
         and t.numero is null and t.test = false and t.statut = 'annule'),
    'ouverts', (
      select jsonb_build_object(
               'tickets', count(*),
               'montant', coalesce(sum((
                 select coalesce(sum(round(l.quantite * l.prix_unitaire, 2)), 0)
                   from public.caisse_lignes l where l.ticket_id = t.id)), 0))
        from public.caisse_tickets t
       where t.etablissement_id = p_etablissement_id and t.test = false and t.statut = 'ouvert')
  );
$$;

revoke all on function public.caisse_totaux_jour(text, date) from public, anon, authenticated;

-- 8.2 RPC caisse_cloturer_jour. Consultant, patron, resp_cuisine.
-- Fige les totaux du jour, le comptage des especes et l'ecart de caisse :
--   ecart = especes comptees - fond de caisse - especes attendues.
-- Une cloture par jour ; une seconde demande pour le meme jour est une
-- cloture complementaire (motif obligatoire, complement_de) : la premiere
-- n'est jamais modifiee. Apres la cloture d'un jour, tout ticket encaisse et
-- toute annulation passent au jour suivant (caisse_jour_ouvert) : une cloture
-- complementaire refige donc les MEMES ventes, seuls le comptage des especes
-- et l'ecart y changent. Tout total de ventes sur plusieurs jours (rapports,
-- export, lot v8) n'additionne que les clotures ou complement_de est null.
create or replace function public.caisse_cloturer_jour(
  p_etablissement_id text,
  p_jour             date,
  p_especes_comptees numeric,
  p_fond_caisse      numeric default 0,
  p_motif            text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      text := auth.uid()::text;
  v_role     text;
  v_motif    text := nullif(btrim(coalesce(p_motif, '')), '');
  v_rang     bigint;
  v_premiere uuid;
  v          public.caisse_clotures%rowtype;
begin
  v_role := public.caisse_role_actif(p_etablissement_id);
  if v_role is null or not (v_role = any(array['consultant', 'patron', 'resp_cuisine'])) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if p_jour is null then
    raise exception 'caisse: jour a cloturer manquant';
  end if;
  if p_especes_comptees is null or p_especes_comptees < 0 or coalesce(p_fond_caisse, 0) < 0 then
    raise exception 'caisse: comptage des especes invalide';
  end if;
  if v_motif is not null and (char_length(v_motif) < 3 or char_length(v_motif) > 300) then
    raise exception 'caisse: motif invalide (3 a 300 caracteres)';
  end if;

  -- Le verrou de l'etablissement : plus aucun encaissement ni annulation ne
  -- passe tant que la cloture n'est pas ecrite.
  v_rang := public.caisse_compteur_suivant(p_etablissement_id, 'chaine');

  if p_jour > public.caisse_jour_exploitation(p_etablissement_id, clock_timestamp()) then
    raise exception 'caisse: ce jour n''a pas encore commence';
  end if;

  select c.id into v_premiere
    from public.caisse_clotures c
   where c.etablissement_id = p_etablissement_id
     and c.jour_exploitation = p_jour
     and c.complement_de is null;
  if v_premiere is not null and v_motif is null then
    raise exception 'caisse: ce jour est deja cloture (une cloture complementaire demande un motif)';
  end if;

  v.id := gen_random_uuid();
  v.etablissement_id := p_etablissement_id;
  v.jour_exploitation := p_jour;
  v.totaux := public.caisse_totaux_jour(p_etablissement_id, p_jour);
  v.fond_caisse := round(coalesce(p_fond_caisse, 0), 2);
  v.especes_comptees := round(p_especes_comptees, 2);
  v.ecart := v.especes_comptees - v.fond_caisse - (v.totaux #>> '{especes,attendues}')::numeric;
  v.motif := v_motif;
  v.cloture_par := v_uid;
  select nullif(btrim(concat_ws(' ', p.prenom, p.nom)), '') into v.cloture_par_nom
    from public.profiles p where p.id = v_uid;
  v.cloture_at := clock_timestamp(); -- apres le verrou
  v.complement_de := v_premiere;
  v.numero := public.caisse_compteur_suivant(p_etablissement_id, 'cloture')::int;
  v.empreinte_precedente := public.caisse_chaine_precedente(p_etablissement_id, v_rang);
  v.empreinte := public.caisse_empreinte(v.empreinte_precedente, public.caisse_contenu_cloture(v));

  insert into public.caisse_clotures values (v.*);
  insert into public.caisse_chaine
    (etablissement_id, rang, genre, cloture_id, empreinte, empreinte_precedente)
  values
    (p_etablissement_id, v_rang, 'cloture', v.id, v.empreinte, v.empreinte_precedente);

  insert into public.journal_activite
    (etablissement_id, acteur_id, acteur_nom, acteur_role, module, operation,
     ligne_id, libelle, colonnes_modifiees, avant, apres)
  values
    (p_etablissement_id, v_uid, v.cloture_par_nom, v_role, 'caisse', 'INSERT',
     v.id::text,
     case when v_premiere is null then 'Clôture de caisse du ' else 'Clôture complémentaire du ' end
       || to_char(p_jour, 'DD.MM.YYYY'),
     array['cloture'], '{}'::jsonb,
     jsonb_build_object('numero', v.numero, 'ecart', v.ecart));

  return to_jsonb(v);
end;
$$;

revoke execute on function public.caisse_cloturer_jour(text, date, numeric, numeric, text) from public, anon, authenticated;
grant  execute on function public.caisse_cloturer_jour(text, date, numeric, numeric, text) to authenticated;

-- 8.3 RPC caisse_journee : ou en est la caisse. Consultant, patron,
-- resp_cuisine. Rend le jour d'exploitation en cours, s'il est deja cloture,
-- les jours passes qui portent des ventes ou des annulations sans cloture, et
-- les tickets encore ouverts. Aucun montant d'especes : le comptage se fait
-- sans connaitre l'attendu.
create or replace function public.caisse_journee(p_etablissement_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_jour date;
begin
  v_role := public.caisse_role_actif(p_etablissement_id);
  if v_role is null or not (v_role = any(array['consultant', 'patron', 'resp_cuisine'])) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  v_jour := public.caisse_jour_exploitation(p_etablissement_id, now());

  return jsonb_build_object(
    'jour', v_jour,
    'cloture', exists (
      select 1 from public.caisse_clotures c
       where c.etablissement_id = p_etablissement_id and c.jour_exploitation = v_jour and c.complement_de is null),
    'tickets_du_jour', (
      select count(*) from public.caisse_tickets t
       where t.etablissement_id = p_etablissement_id and t.jour_exploitation = v_jour
         and t.numero is not null and t.test = false),
    'a_cloturer', coalesce((
      select jsonb_agg(jsonb_build_object('jour', j.jour, 'tickets', j.tickets) order by j.jour)
        from (
          select x.jour, count(*) filter (where x.vente) as tickets
            from (
              select t.jour_exploitation as jour, true as vente
                from public.caisse_tickets t
               where t.etablissement_id = p_etablissement_id and t.numero is not null and t.test = false
              union all
              select t.annule_jour, false
                from public.caisse_tickets t
               where t.etablissement_id = p_etablissement_id and t.numero is not null and t.test = false
                 and t.annule_jour is not null
            ) x
           where x.jour < v_jour
             and not exists (
               select 1 from public.caisse_clotures c
                where c.etablissement_id = p_etablissement_id and c.jour_exploitation = x.jour
                  and c.complement_de is null)
           group by x.jour
        ) j), '[]'::jsonb),
    'ouverts', (
      select count(*) from public.caisse_tickets t
       where t.etablissement_id = p_etablissement_id and t.test = false and t.statut = 'ouvert'));
end;
$$;

revoke execute on function public.caisse_journee(text) from public, anon, authenticated;
grant  execute on function public.caisse_journee(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 9. RPC caisse_verifier_chaine : rejoue la chaine et dit ou elle casse
-- ----------------------------------------------------------------------------
-- Consultant, patron, resp_cuisine. Lecture seule. Pour chaque maillon, dans
-- l'ordre des rangs : le rang suit le precedent, l'empreinte precedente est
-- celle du maillon d'avant, et l'empreinte recalculee sur le contenu actuel
-- de la piece (ticket avec ses lignes et ses paiements, annulation, cloture)
-- est celle du maillon. Puis des controles d'ensemble : chaque piece a son
-- maillon, les numeros se suivent sans trou, les compteurs disent la meme
-- chose que les pieces. Rend au plus vingt defauts, le premier en tete.
-- Par tranches : p_depuis (rang du premier maillon lu) et p_limite. Tant que
-- la chaine n'est pas lue jusqu'au bout, rang_suivant dit ou reprendre ; les
-- controles d'ensemble se font sur la derniere tranche.
create or replace function public.caisse_verifier_chaine(
  p_etablissement_id text, p_depuis bigint default 1, p_limite int default 20000)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role     text;
  v_prec     text := repeat('0', 64);
  v_attendu  bigint := 0;
  v_defauts  jsonb := '[]'::jsonb;
  v_raison   text;
  v_piece    text;
  v_contenu  text;
  v_numero   text;
  v_t        public.caisse_tickets%rowtype;
  v_c        public.caisse_clotures%rowtype;
  v_n        bigint;
  v_z_n      bigint;
  v_z_min    bigint;
  v_z_max    bigint;
  v_depuis   bigint := greatest(coalesce(p_depuis, 1), 1);
  v_reste    boolean;
  r          record;
begin
  v_role := public.caisse_role_actif(p_etablissement_id);
  if v_role is null or not (v_role = any(array['consultant', 'patron', 'resp_cuisine'])) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;

  -- Reprise d'une tranche : on repart de l'empreinte du maillon d'avant.
  v_attendu := v_depuis - 1;
  if v_depuis > 1 then
    select c.empreinte into v_prec from public.caisse_chaine c
     where c.etablissement_id = p_etablissement_id and c.rang = v_depuis - 1;
    if v_prec is null then
      v_prec := repeat('0', 64);
      v_defauts := v_defauts || jsonb_build_object('rang', v_depuis - 1, 'genre', 'chaine',
        'raison', 'maillon ' || (v_depuis - 1) || ' introuvable');
    end if;
  end if;

  for r in
    select c.* from public.caisse_chaine c
     where c.etablissement_id = p_etablissement_id and c.rang >= v_depuis
     order by c.rang
     limit greatest(coalesce(p_limite, 20000), 1)
  loop
    v_attendu := v_attendu + 1;
    v_raison := null;
    v_piece := null;
    v_contenu := null;
    v_numero := null;

    -- 1. La place du maillon dans la chaine.
    if r.rang <> v_attendu then
      v_raison := 'maillon manquant avant le rang ' || r.rang;
      v_attendu := r.rang;
    elsif r.empreinte_precedente <> v_prec then
      v_raison := 'empreinte precedente differente de celle du maillon d''avant';
    end if;

    -- 2. La piece que le maillon scelle.
    if r.genre = 'cloture' then
      select * into v_c from public.caisse_clotures where id = r.cloture_id;
      if not found then
        v_piece := 'cloture introuvable';
      else
        v_numero := 'Z' || v_c.numero;
        v_contenu := public.caisse_contenu_cloture(v_c);
        if v_c.empreinte is distinct from r.empreinte or v_c.empreinte_precedente is distinct from r.empreinte_precedente then
          v_piece := 'empreinte de la cloture differente de son maillon';
        end if;
      end if;
    else
      select * into v_t from public.caisse_tickets where id = r.ticket_id;
      if not found then
        v_piece := 'ticket introuvable';
      else
        v_numero := v_t.annee || '-' || lpad(v_t.numero::text, 6, '0');
        if r.genre = 'ticket' then
          v_contenu := public.caisse_contenu_ticket(v_t);
          if v_t.empreinte is distinct from r.empreinte or v_t.empreinte_precedente is distinct from r.empreinte_precedente then
            v_piece := 'empreinte du ticket differente de son maillon';
          end if;
        else
          v_contenu := public.caisse_contenu_annulation(v_t);
          if v_t.statut <> 'annule' then
            v_piece := 'annulation effacee du ticket';
          end if;
        end if;
      end if;
    end if;
    v_raison := coalesce(v_raison, v_piece);

    -- 3. Le contenu actuel de la piece redonne-t-il l'empreinte du maillon ?
    if v_raison is null
       and public.caisse_empreinte(r.empreinte_precedente, v_contenu) is distinct from r.empreinte then
      v_raison := 'contenu modifie depuis le scellement';
    end if;

    if v_raison is not null and jsonb_array_length(v_defauts) < 20 then
      v_defauts := v_defauts || jsonb_build_object(
        'rang', r.rang, 'genre', r.genre, 'piece', v_numero,
        'ticket_id', r.ticket_id, 'cloture_id', r.cloture_id, 'raison', v_raison);
    end if;
    v_prec := r.empreinte;
  end loop;

  -- La chaine continue au-dela de cette tranche : on s'arrete la, l'appelant
  -- reprend a rang_suivant.
  v_reste := exists (
    select 1 from public.caisse_chaine c
     where c.etablissement_id = p_etablissement_id and c.rang > v_attendu);
  if v_reste then
    return jsonb_build_object(
      'ok', jsonb_array_length(v_defauts) = 0,
      'complet', false,
      'rang_suivant', v_attendu + 1,
      'derniere_empreinte', v_prec,
      'defauts', v_defauts,
      'verifie_at', now());
  end if;

  -- Controles d'ensemble.
  select coalesce(max(c.valeur), 0) into v_n from public.caisse_compteurs c
   where c.etablissement_id = p_etablissement_id and c.cle = 'chaine';
  if v_n <> v_attendu and jsonb_array_length(v_defauts) < 20 then
    v_defauts := v_defauts || jsonb_build_object('genre', 'chaine',
      'raison', 'le compteur de la chaine dit ' || v_n || ', le dernier maillon est au rang ' || v_attendu);
  end if;

  for r in
    select t.id, t.annee, t.numero
      from public.caisse_tickets t
     where t.etablissement_id = p_etablissement_id and t.numero is not null
       and not exists (select 1 from public.caisse_chaine c where c.ticket_id = t.id and c.genre = 'ticket')
     order by t.annee, t.numero limit 5
  loop
    if jsonb_array_length(v_defauts) < 20 then
      v_defauts := v_defauts || jsonb_build_object('genre', 'ticket', 'ticket_id', r.id,
        'piece', r.annee || '-' || lpad(r.numero::text, 6, '0'), 'raison', 'ticket numerote sans maillon');
    end if;
  end loop;

  for r in
    select t.id, t.annee, t.numero
      from public.caisse_tickets t
     where t.etablissement_id = p_etablissement_id and t.numero is not null and t.statut = 'annule'
       and not exists (select 1 from public.caisse_chaine c where c.ticket_id = t.id and c.genre = 'annulation')
     order by t.annee, t.numero limit 5
  loop
    if jsonb_array_length(v_defauts) < 20 then
      v_defauts := v_defauts || jsonb_build_object('genre', 'annulation', 'ticket_id', r.id,
        'piece', r.annee || '-' || lpad(r.numero::text, 6, '0'), 'raison', 'annulation sans maillon');
    end if;
  end loop;

  for r in
    select c.id, c.numero
      from public.caisse_clotures c
     where c.etablissement_id = p_etablissement_id
       and not exists (select 1 from public.caisse_chaine x where x.cloture_id = c.id)
     order by c.numero limit 5
  loop
    if jsonb_array_length(v_defauts) < 20 then
      v_defauts := v_defauts || jsonb_build_object('genre', 'cloture', 'cloture_id', r.id,
        'piece', 'Z' || r.numero, 'raison', 'cloture sans maillon');
    end if;
  end loop;

  -- Numeros de ticket : de 1 au dernier, sans trou, et le compteur de l'annee
  -- au meme point.
  for r in
    select t.annee, count(*) as nombre, min(t.numero) as premier, max(t.numero) as dernier,
           (select c.valeur from public.caisse_compteurs c
             where c.etablissement_id = p_etablissement_id and c.cle = 'ticket:' || t.annee) as compteur
      from public.caisse_tickets t
     where t.etablissement_id = p_etablissement_id and t.numero is not null
     group by t.annee
     order by t.annee
  loop
    if (r.premier <> 1 or r.dernier <> r.nombre or r.compteur is distinct from r.dernier)
       and jsonb_array_length(v_defauts) < 20 then
      v_defauts := v_defauts || jsonb_build_object('genre', 'numerotation', 'annee', r.annee,
        'raison', 'numeros de ' || r.premier || ' a ' || r.dernier || ' pour ' || r.nombre
                  || ' tickets, compteur a ' || coalesce(r.compteur::text, 'rien'));
    end if;
  end loop;

  select count(*), min(c.numero), max(c.numero) into v_z_n, v_z_min, v_z_max
    from public.caisse_clotures c where c.etablissement_id = p_etablissement_id;
  select c.valeur into v_n from public.caisse_compteurs c
   where c.etablissement_id = p_etablissement_id and c.cle = 'cloture';
  if v_z_n > 0 and (v_z_min <> 1 or v_z_max <> v_z_n or v_n is distinct from v_z_max)
     and jsonb_array_length(v_defauts) < 20 then
    v_defauts := v_defauts || jsonb_build_object('genre', 'numerotation',
      'raison', 'clotures de ' || v_z_min || ' a ' || v_z_max || ' pour ' || v_z_n
                || ' clotures, compteur a ' || coalesce(v_n::text, 'rien'));
  end if;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_defauts) = 0,
    'complet', true,
    'rang_suivant', null,
    'maillons', (select count(*) from public.caisse_chaine c where c.etablissement_id = p_etablissement_id),
    'tickets', (select count(*) from public.caisse_tickets t where t.etablissement_id = p_etablissement_id and t.numero is not null),
    'annulations', (select count(*) from public.caisse_chaine c where c.etablissement_id = p_etablissement_id and c.genre = 'annulation'),
    'clotures', v_z_n,
    'derniere_empreinte', v_prec,
    'defauts', v_defauts,
    'verifie_at', now());
end;
$$;

revoke execute on function public.caisse_verifier_chaine(text, bigint, int) from public, anon, authenticated;
grant  execute on function public.caisse_verifier_chaine(text, bigint, int) to authenticated;

-- ----------------------------------------------------------------------------
-- 10. Reprise des tickets encaisses avant ce fichier
-- ----------------------------------------------------------------------------
-- Chaque vrai ticket encaisse qui n'a pas encore de numero en recoit un, dans
-- l'ordre de son encaissement, avec 8.1 sur place pour chaque ligne, son
-- service et son jour deduits de l'heure, et son maillon. Aucun montant n'est
-- change : ni prix, ni quantite, ni paiement. Sans effet au rejeu : apres la
-- premiere application, tout ticket encaisse porte deja un numero (le
-- declencheur de scellement), la boucle ne trouve rien. Les tickets annules
-- sans numero (abandons d'avant) et les tickets de test ne sont pas repris.
do $$
declare
  t public.caisse_tickets%rowtype;
  v public.caisse_tickets%rowtype;
begin
  for t in
    select x.* from public.caisse_tickets x
     where x.statut = 'encaisse' and x.numero is null and x.test = false
     order by x.etablissement_id, coalesce(x.closed_at, x.updated_at), x.created_at, x.id
     for update
  loop
    v := public.caisse_sceau(t, coalesce(t.closed_at, t.updated_at), true);
    update public.caisse_tickets
       set closed_at = v.closed_at, service = v.service, jour_exploitation = v.jour_exploitation,
           total_ttc = v.total_ttc, annee = v.annee, numero = v.numero,
           empreinte = v.empreinte, empreinte_precedente = v.empreinte_precedente
     where id = t.id;
  end loop;
end $$;

-- ============================================================================
-- ROLLBACK (a executer manuellement si besoin, front v7 retire d'abord).
-- Attention : il efface la numerotation, la chaine et les clotures. Des que de
-- vraies ventes ont ete encaissees sous la v7, ces pieces sont a conserver dix
-- ans : exporter caisse_tickets, caisse_lignes, caisse_paiements,
-- caisse_clotures et caisse_chaine AVANT, ou ne pas revenir en arriere.
--
--   drop function if exists public.caisse_verifier_chaine(text, bigint, int);
--   drop function if exists public.caisse_journee(text);
--   drop function if exists public.caisse_cloturer_jour(text, date, numeric, numeric, text);
--   drop function if exists public.caisse_totaux_jour(text, date);
--   drop function if exists public.caisse_annuler_ticket(uuid, text);
--   drop function if exists public.caisse_encaisser(uuid, jsonb, boolean);
--   drop function if exists public.caisse_remise(uuid, uuid, text, numeric, text);
--   drop trigger if exists trg_caisse_paiement_scelle on public.caisse_paiements;
--   drop trigger if exists trg_caisse_paiement_garde_v7 on public.caisse_paiements;
--   drop trigger if exists trg_caisse_ligne_garde_v7 on public.caisse_lignes;
--   drop trigger if exists trg_caisse_ticket_sceller on public.caisse_tickets;
--   drop trigger if exists trg_caisse_ticket_garde_v7 on public.caisse_tickets;
--   drop function if exists public.caisse_paiement_scelle();
--   drop function if exists public.caisse_paiement_garde_v7();
--   drop function if exists public.caisse_ligne_garde_v7();
--   drop function if exists public.caisse_ticket_sceller();
--   drop function if exists public.caisse_ticket_garde_v7();
--   -- puis rejouer la fonction caisse_ligne_garde de 20261106_caisse_v2_options.sql
--   drop trigger if exists trg_caisse_reglages_journal on public.caisse_reglages;
--   drop trigger if exists trg_caisse_boutons_journal_tva on public.caisse_boutons;
--   drop trigger if exists trg_caisse_categories_journal_tva on public.caisse_categories;
--   drop trigger if exists trg_caisse_paiements_vidage on public.caisse_paiements;
--   drop trigger if exists trg_caisse_lignes_vidage on public.caisse_lignes;
--   drop trigger if exists trg_caisse_tickets_vidage on public.caisse_tickets;
--   -- la fonction qui prend une ligne de caisse_clotures tombe AVANT la table
--   drop function if exists public.caisse_contenu_cloture(public.caisse_clotures);
--   drop table if exists public.caisse_chaine;
--   drop table if exists public.caisse_clotures;
--   drop table if exists public.caisse_compteurs;
--   drop function if exists public.caisse_compteur_garde();
--   drop function if exists public.caisse_piece_figee();
--   drop function if exists public.caisse_sceau(public.caisse_tickets, timestamptz, boolean);
--   drop function if exists public.caisse_chaine_precedente(text, bigint);
--   drop function if exists public.caisse_contenu_annulation(public.caisse_tickets);
--   drop function if exists public.caisse_contenu_ticket(public.caisse_tickets);
--   drop function if exists public.caisse_empreinte(text, text);
--   drop function if exists public.caisse_detail_tva(uuid);
--   drop function if exists public.caisse_taux_ligne(text, text, boolean);
--   drop function if exists public.caisse_compteur_suivant(text, text);
--   drop function if exists public.caisse_service_a(text, timestamptz);
--   drop function if exists public.caisse_jour_ouvert(text, timestamptz);
--   drop function if exists public.caisse_jour_exploitation(text, timestamptz);
--   drop function if exists public.caisse_reglage_heure(text, text, time, time, time);
--   drop function if exists public.caisse_role_actif(text);
--   alter table public.caisse_boutons    drop column if exists taux_tva;
--   alter table public.caisse_categories drop column if exists taux_tva, drop column if exists emporter_reduit;
--   alter table public.caisse_paiements  drop column if exists pourboire, drop column if exists rendu, drop column if exists arrondi;
--   alter table public.caisse_tickets    drop column if exists numero, drop column if exists annee,
--     drop column if exists service, drop column if exists jour_exploitation, drop column if exists a_emporter,
--     drop column if exists total_ttc, drop column if exists empreinte, drop column if exists empreinte_precedente,
--     drop column if exists annule_motif, drop column if exists annule_par, drop column if exists annule_at,
--     drop column if exists annule_jour;
--   alter table public.caisse_lignes     drop column if exists taux_tva, drop column if exists a_emporter,
--     drop column if exists remise_montant, drop column if exists remise_motif, drop column if exists remise_par,
--     drop column if exists remise_at, drop column if exists offert, drop column if exists prix_origine;
-- ============================================================================
