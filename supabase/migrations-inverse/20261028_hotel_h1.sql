-- ════════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261028_hotel_h1.sql (branche Hôtel, lot H1)
-- ───────────────────────────────────────────────────────────────────────────
-- Jamais appliquée par outil : à jouer à la main, par Jérémy, après lecture et
-- export JSON des quatre tables. Supprime minibar, objets trouvés, linge et
-- turndown, rend au déclencheur de garde et aux policies de chambres et
-- sejours leur version du lot H0 (consultant et patron par défaut, pas de
-- droit inspection). Les comptes aux rôles hôtel gardent leur rôle (texte
-- libre) mais n'ont plus de droit par défaut.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
begin
  foreach t in array array['chambres_minibar', 'objets_trouves', 'linge_mouvements', 'chambres_turndown'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

drop table if exists public.chambres_turndown;
drop table if exists public.linge_mouvements;
drop table if exists public.objets_trouves;
drop table if exists public.chambres_minibar;
drop function if exists public.hotel_h1_coherence();

-- Déclencheur de garde : version H0 (sans droit inspection, rôles consultant et patron).
create or replace function public.chambres_garde_colonnes()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.etablissement_id <> old.etablissement_id then
    raise exception 'CHAMBRE_ETABLISSEMENT_FIXE: une chambre ne change pas d''établissement' using errcode = '23514';
  end if;
  if (select auth.uid()) is null then return new; end if;
  if public.user_peut_gerer('hebergement', array['consultant', 'patron']) then return new; end if;
  if new.numero <> old.numero or new.etage is distinct from old.etage
     or new.categorie is distinct from old.categorie or new.capacite <> old.capacite
     or new.ordre <> old.ordre or new.actif <> old.actif then
    raise exception 'CHAMBRE_FICHE_RESERVEE: la fiche de la chambre (numéro, étage, catégorie, capacité, ordre, actif) se modifie avec le droit Hébergement' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.chambres_garde_colonnes() from public, anon, authenticated;

-- Policies : rôles par défaut du lot H0.
do $$
declare
  h text := '(select public.user_peut_gerer(''hebergement'', array[''consultant'', ''patron'']))';
  e text := '(select public.user_peut_gerer(''etages'', array[''consultant'', ''patron'']))';
begin
  drop policy if exists chambres_insert on public.chambres;
  execute 'create policy chambres_insert on public.chambres for insert to authenticated with check (user_can_access_etab(etablissement_id) and ' || h || ')';
  drop policy if exists chambres_update on public.chambres;
  execute 'create policy chambres_update on public.chambres for update to authenticated using (user_can_access_etab(etablissement_id) and (' || h || ' or ' || e || ')) with check (user_can_access_etab(etablissement_id) and (' || h || ' or ' || e || '))';
  drop policy if exists chambres_delete on public.chambres;
  execute 'create policy chambres_delete on public.chambres for delete to authenticated using (user_can_access_etab(etablissement_id) and ' || h || ')';
  drop policy if exists sejours_insert on public.sejours;
  execute 'create policy sejours_insert on public.sejours for insert to authenticated with check (user_can_access_etab(etablissement_id) and ' || h || ')';
  drop policy if exists sejours_update on public.sejours;
  execute 'create policy sejours_update on public.sejours for update to authenticated using (user_can_access_etab(etablissement_id) and ' || h || ') with check (user_can_access_etab(etablissement_id) and ' || h || ')';
  drop policy if exists sejours_delete on public.sejours;
  execute 'create policy sejours_delete on public.sejours for delete to authenticated using (user_can_access_etab(etablissement_id) and ' || h || ')';
end $$;
