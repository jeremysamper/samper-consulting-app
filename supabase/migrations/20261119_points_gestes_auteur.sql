-- ════════════════════════════════════════════════════════════════════════════
-- Points : l'auteur des gestes G1 et G3 est la personne connectée (19.11.2026).
-- Suite de 20261119_points_nouveaux_gestes, en prod.
--
-- reservations.created_by et mep_items.fait_par s'écrivent par l'API : passés
-- comme candidats à points_verser, ils laissaient une personne faire créditer
-- un collègue. Le candidat devient NULL : points_auteur retient auth.uid()
-- (rattaché à l'établissement), et une écriture sans personne connectée ne
-- crédite personne. Pour un usage honnête rien ne change : le front ne pose pas
-- created_by et pose fait_par = la personne connectée.
-- Les six autres gestes lisent un auteur posé par la base (hotel_h6_coherence,
-- hotel_h8_coherence, spa_avant_ecriture, chambres_journal_statut) ou
-- auth.uid() (client_accueilli) : inchangés.
-- Rejouable. Inverse : supabase/migrations-inverse/20261119_points_gestes_auteur.sql
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';

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
      -- Candidat NULL : la personne connectée, jamais created_by (écrit par l'API).
      perform public.points_verser(new.etablissement_id, null, 'reservation_saisie',
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
    -- Candidat NULL : la personne connectée qui coche, jamais fait_par (écrit par l'API).
    perform public.points_verser(v_etab, null, 'mep_cochee', 'mep_items', new.id::text, new.id::text);
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

revoke execute on function public.points_trg_reservations() from public, anon, authenticated;
revoke execute on function public.points_trg_mep_items() from public, anon, authenticated;
