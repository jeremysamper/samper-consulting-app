-- ════════════════════════════════════════════════════════════════════════════
-- Points des employés : fermeture des fuites et catégories du catalogue (lot P2,
-- 15.11.2026). Suite de 20261114_points_boutique (P1), en prod, éteint partout.
--
--   F1  plafonds par personne et par établissement, tous gestes confondus :
--       40 points par jour et 400 par mois (Zurich), réglables ; un crédit qui
--       dépasserait l'un des deux n'est pas versé (pas de crédit partiel).
--   F2  le versement prend un verrou par (personne, établissement) avant de
--       compter les plafonds.
--   F3  relevé HACCP : un crédit par (zone, jour, tranche de deux heures),
--       toutes personnes confondues.
--   F4  photo de traçabilité : produit exigé, un crédit par (personne, produit,
--       jour).
--   F5  facture : numéro exigé, un crédit par (établissement, fournisseur,
--       numéro), achats et scans réunis.
--   F6  perte : produit et quantité positive exigés.
--   F7  inventaire : plus rien au comptage, tout au passage à « validé », une
--       fois par périmètre et par semaine.
--   F8  gérer les points demande le rôle consultant ou patron EN PLUS de la case.
--   F9  une mise à jour qui retire la condition d'un crédit l'annule, une fois.
--   F10 catalogue : coût de 100 à 10 000, catégorie cuisine, salle ou commun.
--
-- Colonnes ajoutées aux seules tables points_* (créées par P1, écrites par les
-- RPC et les déclencheurs de ce lot). Les fonctions existantes gardent leur
-- signature (create or replace) ; points_verser et points_regler_plafonds sont
-- neuves, sous un nom neuf : aucune surcharge ne coexiste. Rejouable.
-- Inverse : supabase/migrations-inverse/20261115_points_anti_fuite.sql
-- ════════════════════════════════════════════════════════════════════════════

-- Les déclencheurs se posent sur des tables vivantes de la brigade : si un
-- verrou n'est pas obtenu en 3 s, la migration s'annule entière et se rejoue.
set local lock_timeout = '3s';

-- ─── Colonnes, contraintes, index ────────────────────────────────────────────

alter table public.points_reglages add column if not exists plafond_jour_total integer not null default 40;
alter table public.points_reglages add column if not exists plafond_mois_total integer not null default 400;
alter table public.points_mouvements add column if not exists evenement text;
alter table public.points_cadeaux add column if not exists categorie text not null default 'commun';

do $contraintes$
begin
  if not exists (select 1 from pg_constraint where conname = 'points_reglages_plafond_jour_total_bornes') then
    alter table public.points_reglages add constraint points_reglages_plafond_jour_total_bornes
      check (plafond_jour_total between 0 and 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'points_reglages_plafond_mois_total_bornes') then
    alter table public.points_reglages add constraint points_reglages_plafond_mois_total_bornes
      check (plafond_mois_total between 0 and 2000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'points_cadeaux_categorie_check') then
    alter table public.points_cadeaux add constraint points_cadeaux_categorie_check
      check (categorie in ('cuisine', 'salle', 'commun'));
  end if;
  -- F10 : le coût de P1 (1 à 100 000) devient 100 à 10 000.
  alter table public.points_cadeaux drop constraint if exists points_cadeaux_cout_check;
  if not exists (select 1 from pg_constraint where conname = 'points_cadeaux_cout_bornes') then
    alter table public.points_cadeaux add constraint points_cadeaux_cout_bornes
      check (cout between 100 and 10000);
  end if;
end $contraintes$;

-- Dédoublonnage sur l'événement réel (F3 à F5, F7) : un seul crédit par
-- (établissement, action, événement), quelle que soit la ligne insérée.
create unique index if not exists uq_points_mouvements_evenement
  on public.points_mouvements (etablissement_id, action, evenement)
  where sens = 'credit' and evenement is not null;

-- Un nom par cadeau et par boutique (saisie du catalogue rejouable).
create unique index if not exists uq_points_cadeaux_nom
  on public.points_cadeaux (etablissement_id, nom);

-- ─── Barème par défaut (miroir JS : src/modules/points/bareme.js) ────────────

create or replace function public.points_bareme_defaut()
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select '{
    "releve_haccp":      {"points": 2,  "plafond": 8},
    "controle_haccp":    {"points": 3,  "plafond": 5},
    "photo_tracabilite": {"points": 3,  "plafond": 3},
    "facture_achat":     {"points": 5,  "plafond": 3},
    "perte_declaree":    {"points": 2,  "plafond": 2},
    "comptage_zone":     {"points": 10, "plafond": 5},
    "inventaire_valide": {"points": 20, "plafond": 1}
  }'::jsonb
$fn$;

-- ─── F8 : gérer = direction ET case « Modifier » ─────────────────────────────

create or replace function public.points_gere(p_etab text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select (select auth.uid()) is not null
     and public.user_can_access_etab(p_etab)
     and public.current_user_role() in ('consultant', 'patron')
     and coalesce(public.user_peut_gerer('points', array['consultant', 'patron']), false)
$fn$;

-- ─── Versement (F1, F2, dédoublonnage) ───────────────────────────────────────

-- Jour de Zurich (AAAA-MM-JJ), pour les clés d'événement.
create or replace function public.points_jour_zurich()
returns text
language sql
stable
set search_path = public, pg_temp
as $fn$
  select to_char(now() at time zone 'Europe/Zurich', 'YYYY-MM-DD')
$fn$;

create or replace function public.points_verser(p_etab text, p_candidat text, p_action text,
  p_table text, p_source_id text, p_evenement text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r public.points_reglages;
  v_user text;
  v_pts integer;
  v_plafond integer;
  v_n integer;
  v_jour integer;
  v_mois integer;
  v_debut timestamptz;
  v_debut_mois timestamptz;
begin
  select * into r from public.points_reglages where etablissement_id = p_etab and actif;
  if not found then
    return;
  end if;
  select g.points, g.plafond into v_pts, v_plafond from public.points_regle(r.bareme, p_action) g;
  if coalesce(v_pts, 0) <= 0 or coalesce(v_plafond, 0) <= 0 then
    return;
  end if;
  v_user := public.points_auteur(p_candidat, p_etab);
  if v_user is null or not public.points_participe(v_user, p_etab, r) then
    return;
  end if;
  -- F2 : un versement à la fois par personne et par établissement ; les
  -- plafonds se comptent sous ce verrou.
  perform pg_advisory_xact_lock(hashtext('points:' || v_user || ':' || p_etab));
  if p_evenement is not null and exists (
    select 1 from public.points_mouvements m
    where m.etablissement_id = p_etab and m.action = p_action
      and m.evenement = p_evenement and m.sens = 'credit'
  ) then
    return;
  end if;
  v_debut := date_trunc('day', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich';
  v_debut_mois := date_trunc('month', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich';
  -- Les crédits annulés restent comptés : créer puis supprimer ne rouvre rien.
  select count(*) filter (where m.action = p_action and m.created_at >= v_debut),
         coalesce(sum(m.points) filter (where m.created_at >= v_debut), 0),
         coalesce(sum(m.points), 0)
    into v_n, v_jour, v_mois
  from public.points_mouvements m
  where m.etablissement_id = p_etab
    and m.user_id = v_user
    and m.sens = 'credit'
    and m.created_at >= v_debut_mois;
  if v_n >= v_plafond then
    return;
  end if;
  -- F1 : pas de crédit partiel.
  if v_jour + v_pts > coalesce(r.plafond_jour_total, 40) or v_mois + v_pts > coalesce(r.plafond_mois_total, 400) then
    return;
  end if;
  insert into public.points_mouvements
    (etablissement_id, user_id, points, action, source_table, source_id, sens, libelle, created_by, evenement)
  values
    (p_etab, v_user, v_pts, p_action, p_table, p_source_id, 'credit',
     public.points_libelle_action(p_action), (select auth.uid())::text, p_evenement)
  on conflict do nothing;
end;
$fn$;

-- Signature de P1 gardée : sans événement, même règles de versement.
create or replace function public.points_crediter(p_etab text, p_candidat text, p_action text,
  p_table text, p_source_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.points_verser(p_etab, p_candidat, p_action, p_table, p_source_id, null);
end;
$fn$;

-- ─── Fonctions de déclencheur (même garde que P1 : rien ne casse l'écriture) ─

-- F3 : un relevé par zone et par tranche de deux heures rapporte, une fois.
create or replace function public.points_trg_haccp_releves()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    perform public.points_verser(new.etablissement_id, new.operateur, 'releve_haccp', 'haccp_releves', new.id,
      coalesce(nullif(btrim(new.zone_id), ''), 'sans-zone') || ':' || public.points_jour_zurich() || ':'
        || (floor(extract(hour from now() at time zone 'Europe/Zurich') / 2))::int);
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('haccp_releves', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_haccp_releves : %', sqlerrm;
  return null;
end;
$fn$;

-- F4 et F9 : photo ET produit exigés ; un crédit par (personne, produit, jour) ;
-- photo ou produit retiré ensuite : annulation.
create or replace function public.points_trg_haccp_tracabilite()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_auteur text;
  v_produit text;
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    v_produit := lower(btrim(coalesce(new.produit, '')));
    if v_produit = '' or (coalesce(btrim(new.photo_url), '') = '' and coalesce(btrim(new.storage_path), '') = '') then
      return null;
    end if;
    v_auteur := public.points_auteur(new.operateur, new.etablissement_id);
    if v_auteur is null then
      return null;
    end if;
    perform public.points_verser(new.etablissement_id, v_auteur, 'photo_tracabilite', 'haccp_tracabilite', new.id,
      v_auteur || ':' || v_produit || ':' || public.points_jour_zurich());
  elsif tg_op in ('UPDATE', 'DELETE') then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('haccp_tracabilite', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_haccp_tracabilite : %', sqlerrm;
  return null;
end;
$fn$;

-- Clé d'une facture (F5) : le numéro réduit à ses lettres et chiffres, null
-- sans numéro. Plus stricte que (fournisseur, numéro) : le fournisseur est
-- tantôt un identifiant (scans), tantôt un nom (achats), et la même facture
-- passerait deux fois ; un même numéro chez deux fournisseurs ne paie qu'une
-- fois. p_fournisseur reste dans la signature, inutilisé.
create or replace function public.points_cle_facture(p_fournisseur text, p_numero text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select case
    when regexp_replace(lower(coalesce(p_numero, '')), '[^a-z0-9]', '', 'g') = '' then null
    else 'f:' || regexp_replace(lower(p_numero), '[^a-z0-9]', '', 'g')
  end
$fn$;

-- F5 et F9 : facture scannée ou PDF avec numéro, une fois par facture réelle.
-- Un numéro saisi après coup (lecture vérifiée) verse le crédit à la mise à
-- jour ; numéro vidé ou source changée : annulation.
create or replace function public.points_trg_achats_documents()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_cle text;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    v_cle := case when new.source in ('scan', 'pdf')
                  then public.points_cle_facture(coalesce(nullif(btrim(new.fournisseur_id), ''), new.fournisseur_nom), new.numero) end;
    if tg_op = 'UPDATE' and v_cle is null then
      if exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
        perform public.points_annuler('achats_documents', old.id);
      end if;
      return null;
    end if;
    if v_cle is null
       or not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    perform public.points_verser(new.etablissement_id, new.created_by, 'facture_achat', 'achats_documents', new.id, v_cle);
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('achats_documents', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_achats_documents : %', sqlerrm;
  return null;
end;
$fn$;

create or replace function public.points_trg_scans_facture()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_cle text;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    v_cle := public.points_cle_facture(new.fournisseur_id, new.numero_facture);
    if tg_op = 'UPDATE' and v_cle is null then
      if exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
        perform public.points_annuler('scans_facture', old.id);
      end if;
      return null;
    end if;
    if v_cle is null
       or not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    perform public.points_verser(new.etablissement_id, new.created_by, 'facture_achat', 'scans_facture', new.id, v_cle);
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('scans_facture', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_scans_facture : %', sqlerrm;
  return null;
end;
$fn$;

-- F6 et F9 : produit et quantité positive exigés ; vidés ensuite : annulation.
create or replace function public.points_trg_pertes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    if coalesce(btrim(new.produit), '') = '' or coalesce(new.quantite, 0) <= 0 then
      return null;
    end if;
    -- Points fixes : jamais liés à la quantité ni à la valeur perdue.
    perform public.points_verser(new.etablissement_id, new.declare_par, 'perte_declaree', 'pertes', new.id, null);
  elsif tg_op in ('UPDATE', 'DELETE') then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('pertes', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_pertes : %', sqlerrm;
  return null;
end;
$fn$;

-- F7 : le comptage ne rapporte plus rien par lui-même (le déclencheur est
-- retiré plus bas) ; la fonction reste, inerte, pour l'inverse de P2.
create or replace function public.points_trg_saisies_inventaire()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  return null;
end;
$fn$;

-- F7 : au passage à « validé » d'un inventaire, une fois par périmètre et par
-- semaine : la validation au valideur, puis une zone comptée par personne et
-- par zone (cinq au plus par personne), sur les lignes réelles de
-- l'inventaire. Sa suppression annule tout ce qu'il a versé.
create or replace function public.points_trg_inventaires()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  z record;
begin
  if tg_op = 'UPDATE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    if new.statut is distinct from 'validé' then
      return null;
    end if;
    -- Même périmètre déjà payé dans les 7 jours : rien.
    if exists (
      select 1
      from public.inventaires i
      join public.points_mouvements m
        on m.etablissement_id = i.etablissement_id
       and m.sens = 'credit'
       and m.created_at >= now() - interval '7 days'
       and ((m.source_table = 'inventaires' and m.source_id = i.id)
            or (m.source_table = 'inventaire_saisies_offline' and left(m.source_id, length(i.id) + 1) = i.id || ':'))
      where i.etablissement_id = new.etablissement_id
        and i.id <> new.id
        and coalesce(i.nom, '') = coalesce(new.nom, '')
    ) then
      return null;
    end if;
    perform public.points_verser(new.etablissement_id, new.valide_par, 'inventaire_valide', 'inventaires', new.id,
      'inv:' || new.id);
    for z in
      select c.user_id, c.zone
      from (
        select s.user_id, btrim(coalesce(s.zone, '')) as zone, min(s.created_at) as premier,
               row_number() over (partition by s.user_id order by min(s.created_at)) as rang
        from public.inventaire_saisies_offline s
        where s.inventaire_id = new.id
          and exists (
            select 1
            from jsonb_array_elements(case when jsonb_typeof(new.lignes) = 'array' then new.lignes else '[]'::jsonb end) l
            where l ->> 'id' = s.ligne_id
              and (btrim(coalesce(s.zone, '')) = ''
                   or btrim(coalesce(l ->> 'zone', '')) = btrim(s.zone)
                   or (jsonb_typeof(l -> 'zones') = 'array'
                       and exists (select 1 from jsonb_array_elements_text(l -> 'zones') zz where btrim(zz) = btrim(s.zone))))
          )
        group by s.user_id, btrim(coalesce(s.zone, ''))
      ) c
      where c.rang <= 5
      order by c.premier
    loop
      perform public.points_verser(new.etablissement_id, z.user_id, 'comptage_zone', 'inventaire_saisies_offline',
        new.id || ':' || z.zone, 'inv:' || new.id || ':' || z.zone || ':' || z.user_id);
    end loop;
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('inventaires', old.id);
    insert into public.points_mouvements
      (etablissement_id, user_id, points, action, source_table, source_id, sens, libelle, created_by)
    select m.etablissement_id, m.user_id, -m.points, m.action, m.source_table, m.source_id, 'annulation',
           'Annulation : ' || coalesce(m.libelle, ''), (select auth.uid())::text
    from public.points_mouvements m
    where m.etablissement_id = old.etablissement_id
      and m.source_table = 'inventaire_saisies_offline'
      and left(m.source_id, length(old.id) + 1) = old.id || ':'
      and m.sens = 'credit'
    on conflict (source_table, source_id, user_id, sens) where source_table is not null do nothing;
  end if;
  return null;
exception when others then
  raise warning 'points_trg_inventaires : %', sqlerrm;
  return null;
end;
$fn$;

-- ─── Déclencheurs ────────────────────────────────────────────────────────────

-- F7 : plus de crédit au comptage, ni à la création d'un inventaire déjà
-- validé (ce n'est pas un passage à « validé »).
drop trigger if exists trg_points_saisies_inventaire on public.inventaire_saisies_offline;
drop trigger if exists trg_points_inventaires_ins on public.inventaires;

-- F9 : la condition du crédit retirée par une mise à jour.
drop trigger if exists trg_points_haccp_tracabilite_maj on public.haccp_tracabilite;
create trigger trg_points_haccp_tracabilite_maj
  after update of photo_url, storage_path, produit on public.haccp_tracabilite
  for each row when (
    (coalesce(btrim(old.photo_url), '') <> '' or coalesce(btrim(old.storage_path), '') <> '')
    and coalesce(btrim(old.produit), '') <> ''
    and not ((coalesce(btrim(new.photo_url), '') <> '' or coalesce(btrim(new.storage_path), '') <> '')
             and coalesce(btrim(new.produit), '') <> '')
  )
  execute function public.points_trg_haccp_tracabilite();

drop trigger if exists trg_points_pertes_maj on public.pertes;
create trigger trg_points_pertes_maj
  after update of produit, quantite on public.pertes
  for each row when (
    coalesce(btrim(old.produit), '') <> '' and coalesce(old.quantite, 0) > 0
    and not (coalesce(btrim(new.produit), '') <> '' and coalesce(new.quantite, 0) > 0)
  )
  execute function public.points_trg_pertes();

-- Facture : la clé change (numéro saisi, vidé, source changée).
drop trigger if exists trg_points_achats_documents_maj on public.achats_documents;
create trigger trg_points_achats_documents_maj
  after update of source, numero, fournisseur_id, fournisseur_nom on public.achats_documents
  for each row when (
    (case when old.source in ('scan', 'pdf') and coalesce(btrim(old.numero), '') <> '' then true else false end)
    is distinct from
    (case when new.source in ('scan', 'pdf') and coalesce(btrim(new.numero), '') <> '' then true else false end)
  )
  execute function public.points_trg_achats_documents();

drop trigger if exists trg_points_scans_facture_maj on public.scans_facture;
create trigger trg_points_scans_facture_maj
  after update of numero_facture on public.scans_facture
  for each row when (
    (coalesce(btrim(old.numero_facture), '') <> '') is distinct from (coalesce(btrim(new.numero_facture), '') <> '')
  )
  execute function public.points_trg_scans_facture();

-- ─── RPC ─────────────────────────────────────────────────────────────────────

-- État pour l'écran : plafonds totaux en plus.
create or replace function public.points_etat(p_etab text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid text := (select auth.uid())::text;
  r public.points_reglages;
  v_gere boolean;
  v_part boolean := false;
begin
  if v_uid is null or not public.user_can_access_etab(p_etab) then
    return jsonb_build_object('actif', false, 'participant', false, 'gere', false);
  end if;
  v_gere := public.points_gere(p_etab);
  select * into r from public.points_reglages where etablissement_id = p_etab;
  if found and r.actif then
    v_part := public.points_participe(v_uid, p_etab, r);
  end if;
  return jsonb_build_object(
    'actif', coalesce(r.actif, false),
    'participant', v_part,
    'gere', v_gere,
    'bareme', public.points_bareme_effectif(r.bareme),
    'plafond_jour_total', coalesce(r.plafond_jour_total, 40),
    'plafond_mois_total', coalesce(r.plafond_mois_total, 400),
    'roles_participants', case when v_gere then to_jsonb(coalesce(r.roles_participants, public.points_roles_defaut())) end,
    'exclus', case when v_gere then to_jsonb(coalesce(r.exclus, '{}'::text[])) end
  );
end;
$fn$;

-- Plafonds totaux (F1), sous un nom neuf : points_regler garde sa signature.
create or replace function public.points_regler_plafonds(p_etab text, p_jour integer, p_mois integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.points_gere(p_etab) then
    raise exception 'Accès réservé à qui gère les points' using errcode = '42501';
  end if;
  if p_jour is null or p_jour not between 0 and 200 or p_mois is null or p_mois not between 0 and 2000 then
    raise exception 'Plafonds : 0 à 200 points par jour, 0 à 2 000 par mois' using errcode = '22023';
  end if;
  insert into public.points_reglages as t (etablissement_id, plafond_jour_total, plafond_mois_total, updated_at, updated_by)
  values (p_etab, p_jour, p_mois, now(), (select auth.uid())::text)
  on conflict (etablissement_id) do update set
    plafond_jour_total = excluded.plafond_jour_total,
    plafond_mois_total = excluded.plafond_mois_total,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;
  return public.points_etat(p_etab);
end;
$fn$;

-- ─── RLS : la gestion demande aussi le rôle (F8) ─────────────────────────────

drop policy if exists points_reglages_select on public.points_reglages;
create policy points_reglages_select on public.points_reglages
  for select to authenticated
  using (
    public.user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron')
    and (select public.user_peut_gerer('points', array['consultant', 'patron']))
  );

drop policy if exists points_mouvements_select on public.points_mouvements;
create policy points_mouvements_select on public.points_mouvements
  for select to authenticated
  using (
    public.user_can_access_etab(etablissement_id)
    and (
      user_id = (select auth.uid())::text
      or ((select public.current_user_role()) in ('consultant', 'patron')
          and (select public.user_peut_gerer('points', array['consultant', 'patron'])))
    )
  );

drop policy if exists points_cadeaux_insert on public.points_cadeaux;
create policy points_cadeaux_insert on public.points_cadeaux
  for insert to authenticated
  with check (
    public.user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron')
    and (select public.user_peut_gerer('points', array['consultant', 'patron']))
  );

drop policy if exists points_cadeaux_update on public.points_cadeaux;
create policy points_cadeaux_update on public.points_cadeaux
  for update to authenticated
  using (
    public.user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron')
    and (select public.user_peut_gerer('points', array['consultant', 'patron']))
  )
  with check (
    public.user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron')
    and (select public.user_peut_gerer('points', array['consultant', 'patron']))
  );

drop policy if exists points_cadeaux_delete on public.points_cadeaux;
create policy points_cadeaux_delete on public.points_cadeaux
  for delete to authenticated
  using (
    public.user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron')
    and (select public.user_peut_gerer('points', array['consultant', 'patron']))
  );

drop policy if exists points_commandes_select on public.points_commandes;
create policy points_commandes_select on public.points_commandes
  for select to authenticated
  using (
    public.user_can_access_etab(etablissement_id)
    and (
      user_id = (select auth.uid())::text
      or ((select public.current_user_role()) in ('consultant', 'patron')
          and (select public.user_peut_gerer('points', array['consultant', 'patron'])))
    )
  );

-- ─── Droits des fonctions neuves ─────────────────────────────────────────────

revoke execute on function public.points_verser(text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.points_cle_facture(text, text) from public, anon, authenticated;
revoke execute on function public.points_jour_zurich() from public, anon, authenticated;
revoke execute on function public.points_regler_plafonds(text, integer, integer) from public, anon, authenticated;
grant execute on function public.points_regler_plafonds(text, integer, integer) to authenticated;

comment on column public.points_reglages.plafond_jour_total is 'Points au plus par personne et par jour de Zurich, tous gestes confondus (F1, P2).';
comment on column public.points_reglages.plafond_mois_total is 'Points au plus par personne et par mois civil de Zurich, tous gestes confondus (F1, P2).';
comment on column public.points_mouvements.evenement is 'Clé de l''événement réel crédité (zone et tranche, facture, inventaire) : un seul crédit par clé.';
comment on column public.points_cadeaux.categorie is 'cuisine, salle ou commun (commun paraît dans les deux rangées de la boutique).';
