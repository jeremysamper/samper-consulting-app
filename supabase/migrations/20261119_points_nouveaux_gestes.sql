-- ════════════════════════════════════════════════════════════════════════════
-- Points : huit nouveaux gestes (19.11.2026). Suite de P1 à P3, en prod.
-- Jusqu'ici, la salle, le spa et l'hôtel ne gagnaient presque rien (pointage
-- seul). Chaque rôle participant a désormais au moins un geste de son métier.
--
--   G1 reservation_saisie  (1 pt, 4/jour) réservation saisie par l'équipe
--      (origine equipe ou passage, hors groupe), nom et couverts, pour
--      aujourd'hui ou plus tard ; annulée ou supprimée ensuite : annulation.
--   G2 client_accueilli    (1 pt, 8/jour) réservation passée à « arrivé » (ou
--      « parti ») le jour de son service, par la personne connectée, une fois
--      par réservation ; remise en attente ensuite : annulation.
--   G3 mep_cochee          (1 pt, 6/jour) ligne de mise en place cochée, liste
--      du jour, de demain ou sans date ; décochée : annulation. La suppression
--      d'une liste n'annule rien (rangement).
--   G4 passation_ecrite    (3 pts, 1/jour) première passation du jour d'un pôle
--      pour un service, d'au moins 40 caractères ; supprimée le jour même :
--      annulation.
--   G5 tache_faite         (2 pts, 4/jour) tâche récurrente cochée pour le
--      jour ; décochée le jour même : annulation (la suppression d'une tâche
--      et de son historique n'annule rien).
--   G6 chambre_prete       (1 pt, 10/jour) chambre passée à « propre », une
--      fois par chambre et par jour (journal écrit par la base, auteur fiable).
--   G7 ordre_termine       (3 pts, 4/jour) ordre de travail terminé avec son
--      compte rendu, ouvert par une autre personne ou par un plan ; rouvert :
--      annulation.
--   G8 seance_spa          (2 pts, 5/jour) compte rendu de séance du jour avec
--      les observations, un par client et par jour ; supprimé le jour même :
--      annulation.
--
-- Toutes les règles de versement restent celles de points_verser : système
-- allumé, participant, au planning ce jour, plafonds par geste, 40 par jour et
-- 400 par mois, un crédit par événement réel, verrou par personne.
-- Déclencheurs AFTER qui avalent leurs erreurs : rien ne bloque l'écriture.
-- Fonctions existantes gardées à leur signature (create or replace).
-- Rejouable. Inverse : supabase/migrations-inverse/20261119_points_nouveaux_gestes.sql
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';

-- ─── Barème et libellés (miroir JS : src/modules/points/bareme.js) ───────────

create or replace function public.points_bareme_defaut()
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select '{
    "releve_haccp":       {"points": 2,  "plafond": 8},
    "controle_haccp":     {"points": 3,  "plafond": 5},
    "photo_tracabilite":  {"points": 3,  "plafond": 3},
    "facture_achat":      {"points": 5,  "plafond": 3},
    "perte_declaree":     {"points": 2,  "plafond": 2},
    "comptage_zone":      {"points": 10, "plafond": 5},
    "inventaire_valide":  {"points": 20, "plafond": 1},
    "pointage_ponctuel":  {"points": 2,  "plafond": 2},
    "reservation_saisie": {"points": 1,  "plafond": 4},
    "client_accueilli":   {"points": 1,  "plafond": 8},
    "mep_cochee":         {"points": 1,  "plafond": 6},
    "passation_ecrite":   {"points": 3,  "plafond": 1},
    "tache_faite":        {"points": 2,  "plafond": 4},
    "chambre_prete":      {"points": 1,  "plafond": 10},
    "ordre_termine":      {"points": 3,  "plafond": 4},
    "seance_spa":         {"points": 2,  "plafond": 5}
  }'::jsonb
$fn$;

create or replace function public.points_libelle_action(p_action text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select case p_action
    when 'releve_haccp'       then 'Relevé HACCP'
    when 'controle_haccp'     then 'Contrôle HACCP'
    when 'photo_tracabilite'  then 'Photo de traçabilité'
    when 'facture_achat'      then 'Facture d''achat'
    when 'perte_declaree'     then 'Perte déclarée'
    when 'comptage_zone'      then 'Zone d''inventaire comptée'
    when 'inventaire_valide'  then 'Inventaire validé'
    when 'pointage_ponctuel'  then 'Pointage à l''heure'
    when 'reservation_saisie' then 'Réservation saisie'
    when 'client_accueilli'   then 'Client accueilli'
    when 'mep_cochee'         then 'Mise en place cochée'
    when 'passation_ecrite'   then 'Passation écrite'
    when 'tache_faite'        then 'Tâche du jour faite'
    when 'chambre_prete'      then 'Chambre prête'
    when 'ordre_termine'      then 'Ordre de travail terminé'
    when 'seance_spa'         then 'Compte rendu de séance'
    else p_action
  end
$fn$;

-- ─── G1 et G2 : réservations ─────────────────────────────────────────────────
-- Deux crédits possibles sur une même ligne : la saisie (source_id = id) et
-- l'accueil (source_id = id || ':arrivee'), pour que l'index unique
-- (source_table, source_id, user_id, sens) ne confonde pas les deux.

create or replace function public.points_trg_reservations()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_jour date := (now() at time zone 'Europe/Zurich')::date;
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    if coalesce(new.origine, 'equipe') in ('equipe', 'passage')
       and new.groupe_evenement_id is null
       and coalesce(btrim(new.nom), '') <> ''
       and coalesce(new.nb_couverts, 0) > 0
       and new.date_service >= v_jour
       and coalesce(new.statut, '') not in ('annule', 'demande') then
      perform public.points_verser(new.etablissement_id, new.created_by, 'reservation_saisie',
        'reservations', new.id::text, new.id::text);
    end if;
  elsif tg_op = 'UPDATE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id) then
      return null;
    end if;
    if new.statut in ('arrive', 'parti') and coalesce(old.statut, '') not in ('arrive', 'parti') then
      -- Le jour du service seulement : pas de rattrapage après coup.
      if new.date_service = v_jour then
        perform public.points_verser(new.etablissement_id, null, 'client_accueilli',
          'reservations', new.id::text || ':arrivee', new.id::text);
      end if;
    elsif old.statut in ('arrive', 'parti') and coalesce(new.statut, '') not in ('arrive', 'parti') then
      perform public.points_annuler('reservations', new.id::text || ':arrivee');
    end if;
    if new.statut = 'annule' then
      perform public.points_annuler('reservations', new.id::text);
    end if;
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('reservations', old.id::text);
    perform public.points_annuler('reservations', old.id::text || ':arrivee');
  end if;
  return null;
exception when others then
  raise warning 'points_trg_reservations : %', sqlerrm;
  return null;
end;
$fn$;

-- ─── G3 : mise en place ──────────────────────────────────────────────────────

create or replace function public.points_trg_mep_items()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_jour date := (now() at time zone 'Europe/Zurich')::date;
  v_etab text;
  v_date date;
begin
  select l.etablissement_id, l.date_service into v_etab, v_date
  from public.mep_listes l where l.id = new.liste_id;
  if v_etab is null then
    return null;
  end if;
  if new.fait then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = v_etab and r.actif) then
      return null;
    end if;
    if coalesce(btrim(new.label), '') = '' and new.recette_id is null then
      return null;
    end if;
    if coalesce(v_date, v_jour) not between v_jour and v_jour + 1 then
      return null;
    end if;
    perform public.points_verser(v_etab, new.fait_par, 'mep_cochee', 'mep_items', new.id::text, new.id::text);
  else
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = v_etab) then
      return null;
    end if;
    perform public.points_annuler('mep_items', new.id::text);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_mep_items : %', sqlerrm;
  return null;
end;
$fn$;

-- ─── G4 : passations ─────────────────────────────────────────────────────────
-- created_by est posé par la base (hotel_h6_coherence) : auteur fiable.

create or replace function public.points_trg_passations()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_jour date := (now() at time zone 'Europe/Zurich')::date;
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    if new.jour = v_jour and char_length(btrim(coalesce(new.contenu, ''))) >= 40 then
      perform public.points_verser(new.etablissement_id, new.created_by, 'passation_ecrite', 'passations',
        new.id::text, new.pole || ':' || new.jour::text || ':' || new.service);
    end if;
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    if old.jour = v_jour then
      perform public.points_annuler('passations', old.id::text);
    end if;
  end if;
  return null;
exception when others then
  raise warning 'points_trg_passations : %', sqlerrm;
  return null;
end;
$fn$;

-- ─── G5 : tâches récurrentes ─────────────────────────────────────────────────
-- fait_par est posé par la base (hotel_h6_coherence) ; une tâche décochée puis
-- recochée garde la même clé (tâche, jour) : rien de plus.

create or replace function public.points_trg_taches_faites()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_jour date := (now() at time zone 'Europe/Zurich')::date;
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    if new.jour = v_jour then
      perform public.points_verser(new.etablissement_id, new.fait_par, 'tache_faite', 'taches_faites',
        new.id::text, new.tache_id::text || ':' || new.jour::text);
    end if;
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    if old.jour = v_jour then
      perform public.points_annuler('taches_faites', old.id::text);
    end if;
  end if;
  return null;
exception when others then
  raise warning 'points_trg_taches_faites : %', sqlerrm;
  return null;
end;
$fn$;

-- ─── G6 : chambres ───────────────────────────────────────────────────────────
-- Le journal n'est écrit que par chambres_journal_statut (par = auth.uid()).

create or replace function public.points_trg_chambres_journal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
    return null;
  end if;
  if new.nouveau = 'propre' and coalesce(new.ancien, '') not in ('propre', 'inspectee') then
    perform public.points_verser(new.etablissement_id, new.par, 'chambre_prete', 'chambres_statut_journal',
      new.id::text, new.chambre_id::text || ':' || public.points_jour_zurich());
  end if;
  return null;
exception when others then
  raise warning 'points_trg_chambres_journal : %', sqlerrm;
  return null;
end;
$fn$;

-- ─── G7 : ordres de travail ──────────────────────────────────────────────────
-- termine_par est posé par la base (garde de hotel_h8). Un ordre ouvert par la
-- personne qui le termine ne rapporte rien (même logique que le verrou du
-- gestionnaire du planning).

create or replace function public.points_trg_ordres_travail()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_auteur text;
begin
  if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id) then
    return null;
  end if;
  if new.statut = 'termine' and old.statut is distinct from 'termine' then
    if coalesce(btrim(new.compte_rendu), '') = '' then
      return null;
    end if;
    v_auteur := public.points_auteur(new.termine_par, new.etablissement_id);
    if v_auteur is null or v_auteur = new.created_by then
      return null;
    end if;
    perform public.points_verser(new.etablissement_id, v_auteur, 'ordre_termine', 'ordres_travail',
      new.id::text, new.id::text);
  elsif old.statut = 'termine' and new.statut is distinct from 'termine' then
    perform public.points_annuler('ordres_travail', new.id::text);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_ordres_travail : %', sqlerrm;
  return null;
end;
$fn$;

-- ─── G8 : comptes rendus de séance du spa ────────────────────────────────────

create or replace function public.points_trg_spa_seances()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_jour date := (now() at time zone 'Europe/Zurich')::date;
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    if new.date_seance = v_jour and coalesce(btrim(new.observations), '') <> '' then
      perform public.points_verser(new.etablissement_id, new.created_by, 'seance_spa', 'spa_seances',
        new.id::text, new.client_id::text || ':' || new.date_seance::text);
    end if;
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    if old.date_seance = v_jour then
      perform public.points_annuler('spa_seances', old.id::text);
    end if;
  end if;
  return null;
exception when others then
  raise warning 'points_trg_spa_seances : %', sqlerrm;
  return null;
end;
$fn$;

-- ─── Déclencheurs ────────────────────────────────────────────────────────────

drop trigger if exists trg_points_reservations_ins on public.reservations;
create trigger trg_points_reservations_ins
  after insert on public.reservations
  for each row execute function public.points_trg_reservations();

drop trigger if exists trg_points_reservations_maj on public.reservations;
create trigger trg_points_reservations_maj
  after update of statut on public.reservations
  for each row when (
    old.statut is distinct from new.statut
    and (new.statut in ('arrive', 'parti', 'annule') or old.statut in ('arrive', 'parti'))
  )
  execute function public.points_trg_reservations();

drop trigger if exists trg_points_reservations_sup on public.reservations;
create trigger trg_points_reservations_sup
  after delete on public.reservations
  for each row execute function public.points_trg_reservations();

drop trigger if exists trg_points_mep_items_maj on public.mep_items;
create trigger trg_points_mep_items_maj
  after update of fait on public.mep_items
  for each row when (old.fait is distinct from new.fait)
  execute function public.points_trg_mep_items();

drop trigger if exists trg_points_passations_ins on public.passations;
create trigger trg_points_passations_ins
  after insert on public.passations
  for each row execute function public.points_trg_passations();

drop trigger if exists trg_points_passations_sup on public.passations;
create trigger trg_points_passations_sup
  after delete on public.passations
  for each row execute function public.points_trg_passations();

drop trigger if exists trg_points_taches_faites_ins on public.taches_faites;
create trigger trg_points_taches_faites_ins
  after insert on public.taches_faites
  for each row execute function public.points_trg_taches_faites();

drop trigger if exists trg_points_taches_faites_sup on public.taches_faites;
create trigger trg_points_taches_faites_sup
  after delete on public.taches_faites
  for each row execute function public.points_trg_taches_faites();

drop trigger if exists trg_points_chambres_journal_ins on public.chambres_statut_journal;
create trigger trg_points_chambres_journal_ins
  after insert on public.chambres_statut_journal
  for each row execute function public.points_trg_chambres_journal();

drop trigger if exists trg_points_ordres_travail_maj on public.ordres_travail;
create trigger trg_points_ordres_travail_maj
  after update of statut on public.ordres_travail
  for each row when (
    old.statut is distinct from new.statut and (new.statut = 'termine' or old.statut = 'termine')
  )
  execute function public.points_trg_ordres_travail();

drop trigger if exists trg_points_spa_seances_ins on public.spa_seances;
create trigger trg_points_spa_seances_ins
  after insert on public.spa_seances
  for each row execute function public.points_trg_spa_seances();

drop trigger if exists trg_points_spa_seances_sup on public.spa_seances;
create trigger trg_points_spa_seances_sup
  after delete on public.spa_seances
  for each row execute function public.points_trg_spa_seances();

-- ─── Droits : appelées par les déclencheurs seulement ────────────────────────

revoke execute on function public.points_trg_reservations() from public, anon, authenticated;
revoke execute on function public.points_trg_mep_items() from public, anon, authenticated;
revoke execute on function public.points_trg_passations() from public, anon, authenticated;
revoke execute on function public.points_trg_taches_faites() from public, anon, authenticated;
revoke execute on function public.points_trg_chambres_journal() from public, anon, authenticated;
revoke execute on function public.points_trg_ordres_travail() from public, anon, authenticated;
revoke execute on function public.points_trg_spa_seances() from public, anon, authenticated;
