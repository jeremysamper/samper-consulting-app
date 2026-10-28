-- ════════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261028_hotel_h3.sql (branche Hôtel, lot H3)
-- ───────────────────────────────────────────────────────────────────────────
-- Jamais appliquée par outil : à jouer à la main, par Jérémy, après export JSON
-- de hotes. Retire la colonne hote_id des séjours, la table hotes et rend au
-- déclencheur de chevauchement sa version du lot H0 (sans contrôle de hote_id).
-- ════════════════════════════════════════════════════════════════════════════

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hotes'
  ) then
    alter publication supabase_realtime drop table public.hotes;
  end if;
end $$;

drop trigger if exists trg_sejours_sans_chevauchement on public.sejours;
alter table public.sejours drop column if exists hote_id;
drop table if exists public.hotes;
drop function if exists public.hotes_avant_ecriture();

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
