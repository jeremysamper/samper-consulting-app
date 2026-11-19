-- Inverse de 20261119_points_nouveaux_gestes : retire les huit gestes neufs
-- (déclencheurs et fonctions), puis remet le barème et les libellés de
-- 20261115_points_indicateurs. Les mouvements déjà versés restent au registre
-- avec leur libellé ; les soldes ne bougent pas. Un seul passage.

set local lock_timeout = '3s';

drop trigger if exists trg_points_reservations_ins on public.reservations;
drop trigger if exists trg_points_reservations_maj on public.reservations;
drop trigger if exists trg_points_reservations_sup on public.reservations;
drop trigger if exists trg_points_mep_items_maj on public.mep_items;
drop trigger if exists trg_points_passations_ins on public.passations;
drop trigger if exists trg_points_passations_sup on public.passations;
drop trigger if exists trg_points_taches_faites_ins on public.taches_faites;
drop trigger if exists trg_points_taches_faites_sup on public.taches_faites;
drop trigger if exists trg_points_chambres_journal_ins on public.chambres_statut_journal;
drop trigger if exists trg_points_ordres_travail_maj on public.ordres_travail;
drop trigger if exists trg_points_spa_seances_ins on public.spa_seances;
drop trigger if exists trg_points_spa_seances_sup on public.spa_seances;

drop function if exists public.points_trg_reservations();
drop function if exists public.points_trg_mep_items();
drop function if exists public.points_trg_passations();
drop function if exists public.points_trg_taches_faites();
drop function if exists public.points_trg_chambres_journal();
drop function if exists public.points_trg_ordres_travail();
drop function if exists public.points_trg_spa_seances();

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
    "inventaire_valide": {"points": 20, "plafond": 1},
    "pointage_ponctuel": {"points": 2,  "plafond": 2}
  }'::jsonb
$fn$;

create or replace function public.points_libelle_action(p_action text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select case p_action
    when 'releve_haccp'      then 'Relevé HACCP'
    when 'controle_haccp'    then 'Contrôle HACCP'
    when 'photo_tracabilite' then 'Photo de traçabilité'
    when 'facture_achat'     then 'Facture d''achat'
    when 'perte_declaree'    then 'Perte déclarée'
    when 'comptage_zone'     then 'Zone d''inventaire comptée'
    when 'inventaire_valide' then 'Inventaire validé'
    when 'pointage_ponctuel' then 'Pointage à l''heure'
    else p_action
  end
$fn$;
