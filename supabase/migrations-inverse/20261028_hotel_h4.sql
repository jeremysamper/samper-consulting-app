-- ════════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261028_hotel_h4.sql (branche Hôtel, lot H4)
-- ───────────────────────────────────────────────────────────────────────────
-- Jamais appliquée par outil : à jouer à la main, par Jérémy, après export JSON
-- de hotel_reglages, tarifs, sejour_occupants et sejour_lignes. Retire les
-- colonnes tarif_id et prix_nuit des séjours, les quatre tables, et rend au
-- déclencheur de chevauchement sa version du lot H3 (sans contrôle du tarif).
-- Le drop column sur sejours pose un verrou : hors service seulement. Si un
-- lot ultérieur a encore modifié sejours_sans_chevauchement, reprendre sa
-- version la plus récente sans le contrôle du tarif plutôt que celle-ci.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
begin
  foreach t in array array['hotel_reglages', 'tarifs', 'sejour_occupants', 'sejour_lignes'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

drop trigger if exists trg_sejours_sans_chevauchement on public.sejours;

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

create or replace trigger trg_sejours_sans_chevauchement
  before insert or update of chambre_id, client_id, hote_id, etablissement_id, arrivee, depart, statut on public.sejours
  for each row execute function public.sejours_sans_chevauchement();

alter table public.sejours drop column if exists tarif_id;
alter table public.sejours drop column if exists prix_nuit;

drop table if exists public.sejour_lignes;
drop table if exists public.sejour_occupants;
drop table if exists public.tarifs;
drop table if exists public.hotel_reglages;
drop function if exists public.hotel_h4_coherence();
