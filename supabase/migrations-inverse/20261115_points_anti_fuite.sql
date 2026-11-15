-- Inverse de 20261115_points_anti_fuite (P2), à jouer seulement si la
-- production casse. Un seul passage, dans cet ordre :
--   1. jouer tel quel supabase/migrations/20261114_points_boutique.sql (P1 est
--      rejouable : il remet ses fonctions, ses déclencheurs et ses policies ;
--      les déclencheurs de mise à jour de P2 deviennent inertes, les fonctions
--      de P1 n'ayant pas de branche UPDATE) ;
--   2. jouer ce fichier.
-- Les cadeaux et les réglages saisis restent ; la colonne categorie, les
-- plafonds totaux et la clé d'événement disparaissent.

set local lock_timeout = '3s';

drop trigger if exists trg_points_haccp_tracabilite_maj on public.haccp_tracabilite;
drop trigger if exists trg_points_pertes_maj on public.pertes;
drop trigger if exists trg_points_achats_documents_maj on public.achats_documents;
drop trigger if exists trg_points_scans_facture_maj on public.scans_facture;

drop function if exists public.points_regler_plafonds(text, integer, integer);

-- P1 rejoué d'abord : points_crediter n'appelle plus points_verser.
do $orphelines$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'points_crediter' and pronamespace = 'public'::regnamespace
      and prosrc like '%points_verser%'
  ) then
    raise exception 'Jouer d''abord 20261114_points_boutique.sql (étape 1), puis ce fichier';
  end if;
  drop function if exists public.points_verser(text, text, text, text, text, text);
  drop function if exists public.points_cle_facture(text, text);
  drop function if exists public.points_jour_zurich();
end $orphelines$;

drop index if exists public.uq_points_mouvements_evenement;
drop index if exists public.uq_points_cadeaux_nom;
alter table public.points_mouvements drop column if exists evenement;
alter table public.points_cadeaux drop constraint if exists points_cadeaux_categorie_check;
alter table public.points_cadeaux drop column if exists categorie;
alter table public.points_cadeaux drop constraint if exists points_cadeaux_cout_bornes;
do $cout$
begin
  if not exists (select 1 from pg_constraint where conname = 'points_cadeaux_cout_check') then
    alter table public.points_cadeaux add constraint points_cadeaux_cout_check check (cout > 0 and cout <= 100000);
  end if;
end $cout$;
alter table public.points_reglages drop constraint if exists points_reglages_plafond_jour_total_bornes;
alter table public.points_reglages drop constraint if exists points_reglages_plafond_mois_total_bornes;
alter table public.points_reglages drop column if exists plafond_jour_total;
alter table public.points_reglages drop column if exists plafond_mois_total;
