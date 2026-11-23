-- -----------------------------------------------------------------------------
-- Lot 6b « Hôtel, Spa, aide » : réglages de trois modules de l'hôtel (22.11.2026)
--
-- Ajout seul (expand), à jouer APRÈS 20261122_lot2a_reglages_modules.sql, qui
-- crée la table reglages_modules. Aucune table neuve, aucune policy changée :
-- la table reçoit trois modules de plus, et leurs blocs sont vérifiés en base.
--
--   etages     temps de ménage (départ, recouche) par défaut et par catégorie
--              de chambre, linge d'un départ par catégorie ;
--   demandes   les demandes courantes de la maison (libellé, pôle, priorité,
--              délai) proposées en tête du formulaire ;
--   repas      horaires des repas, heures et frais du room service, carte du
--              room service (libellé, prix).
--
-- Lecture par toute l'équipe de l'établissement (policies de reglages_modules,
-- inchangées). Écriture : la direction de l'hôtel (consultant et patron), par
-- un déclencheur qui refuse les autres rôles pour ces trois modules ; l'écran
-- des réglages ne propose ces sections qu'à elle.
--
-- Le front déployé ne lit aucun de ces modules : rien ne change pour lui. Une
-- ligne absente vaut les valeurs par défaut du front (src/utils/reglagesModules.js).
--
-- La fonction de vérification du lot 2a n'est pas recopiée : elle rend faux
-- pour un module qu'elle ne connaît pas, et la contrainte accepte un bloc que
-- l'une ou l'autre des deux fonctions accepte.
--
-- Clés inconnues : comme au lot 2a, une clé inconnue au premier niveau d'un
-- bloc est acceptée pour la suite. Les sous-blocs fermés, eux, la refusent :
-- temps_defaut (depart, recouche), linge (types de linge), horaires (trois
-- repas), room_service (heures, frais) et chaque plage (debut, fin). Un lot qui
-- y ajoute une clé rejoue reglages_modules_hotel_valide (create or replace).
--
-- Transaction : apply_migration joue le fichier dans une transaction, où
-- « set local » vaut pour tout le fichier. Joué hors transaction, le délai de
-- 3 s ne s'applique pas ; les contraintes, elles, se reposent dans une seule
-- instruction (pas de fenêtre sans contrainte). Le fichier ne contient ni
-- begin ni commit : l'essai à blanc le joue par execute, dans un bloc DO.
--
-- Idempotente. Aucun remplissage de données. Retour arrière :
-- 20261122_lot6b_reglages_hotel.rollback.sql.
-- -----------------------------------------------------------------------------

-- La contrainte se repose sous un verrou exclusif bref sur reglages_modules :
-- ne pas attendre plus de 3 s derrière une transaction longue.
set local lock_timeout = '3s';

create or replace function public.reglages_modules_hotel_valide(p_module text, p_config jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $fn$
declare
  v_bloc  jsonb;
  v_val   jsonb;
  v_cle   text;
  v_sous  jsonb;
  v_t     text;
  v_vus   text[] := '{}';
  v_n     numeric;
begin
  if p_config is null or jsonb_typeof(p_config) <> 'object' then return false; end if;

  if p_module = 'etages' then
    v_bloc := p_config -> 'temps_defaut';
    if v_bloc is not null and jsonb_typeof(v_bloc) <> 'null' then
      if jsonb_typeof(v_bloc) <> 'object' then return false; end if;
      for v_cle in select key from jsonb_each(v_bloc) loop
        if v_cle not in ('depart', 'recouche') then return false; end if;
      end loop;
      if not public.reglages_entier_valide(v_bloc -> 'depart', 5, 240) then return false; end if;
      if not public.reglages_entier_valide(v_bloc -> 'recouche', 5, 240) then return false; end if;
    end if;
    v_bloc := p_config -> 'types';
    if v_bloc is not null and jsonb_typeof(v_bloc) <> 'null' then
      if jsonb_typeof(v_bloc) <> 'array' or jsonb_array_length(v_bloc) > 20 then return false; end if;
      for v_val in select value from jsonb_array_elements(v_bloc) loop
        if jsonb_typeof(v_val) <> 'object' then return false; end if;
        if jsonb_typeof(v_val -> 'categorie') is distinct from 'string' then return false; end if;
        v_t := v_val ->> 'categorie';
        if v_t <> btrim(v_t) or v_t = '' or char_length(v_t) > 60 then return false; end if;
        if lower(v_t) = any (v_vus) then return false; end if;
        v_vus := v_vus || lower(v_t);
        if not public.reglages_entier_valide(v_val -> 'depart', 5, 240) then return false; end if;
        if not public.reglages_entier_valide(v_val -> 'recouche', 5, 240) then return false; end if;
        v_sous := v_val -> 'linge';
        if v_sous is not null and jsonb_typeof(v_sous) <> 'null' then
          if jsonb_typeof(v_sous) <> 'object' then return false; end if;
          for v_cle in select key from jsonb_each(v_sous) loop
            if v_cle not in ('draps', 'serviettes', 'peignoirs', 'tapis', 'autre') then return false; end if;
            if not public.reglages_entier_valide(v_sous -> v_cle, 0, 50) then return false; end if;
          end loop;
        end if;
      end loop;
    end if;
    return true;

  elsif p_module = 'demandes' then
    v_bloc := p_config -> 'categories';
    if v_bloc is not null and jsonb_typeof(v_bloc) <> 'null' then
      if jsonb_typeof(v_bloc) <> 'array' or jsonb_array_length(v_bloc) > 40 then return false; end if;
      for v_val in select value from jsonb_array_elements(v_bloc) loop
        if jsonb_typeof(v_val) <> 'object' then return false; end if;
        if jsonb_typeof(v_val -> 'libelle') is distinct from 'string' then return false; end if;
        v_t := v_val ->> 'libelle';
        if v_t <> btrim(v_t) or v_t = '' or char_length(v_t) > 60 then return false; end if;
        if lower(v_t) = any (v_vus) then return false; end if;
        v_vus := v_vus || lower(v_t);
        if coalesce(v_val ->> 'pole', '') not in ('reception', 'etages', 'technique', 'cuisine', 'restaurant', 'spa', 'direction') then
          return false;
        end if;
        if v_val ? 'priorite' and jsonb_typeof(v_val -> 'priorite') <> 'null'
           and coalesce(v_val ->> 'priorite', '') not in ('basse', 'normale', 'haute', 'urgente') then
          return false;
        end if;
        if not public.reglages_entier_valide(v_val -> 'delai_minutes', 5, 10080) then return false; end if;
      end loop;
    end if;
    return true;

  elsif p_module = 'repas' then
    v_bloc := p_config -> 'horaires';
    if v_bloc is not null and jsonb_typeof(v_bloc) <> 'null' then
      if jsonb_typeof(v_bloc) <> 'object' then return false; end if;
      for v_cle, v_val in select key, value from jsonb_each(v_bloc) loop
        if v_cle not in ('petit_dejeuner', 'dejeuner', 'diner') then return false; end if;
        if jsonb_typeof(v_val) = 'null' then continue; end if;
        if not public.reglages_plage_valide(v_val) then return false; end if;
      end loop;
    end if;
    v_bloc := p_config -> 'room_service';
    if v_bloc is not null and jsonb_typeof(v_bloc) <> 'null' then
      if jsonb_typeof(v_bloc) <> 'object' then return false; end if;
      for v_cle in select key from jsonb_each(v_bloc) loop
        if v_cle not in ('heures', 'frais') then return false; end if;
      end loop;
      if jsonb_typeof(v_bloc -> 'heures') is not null and jsonb_typeof(v_bloc -> 'heures') <> 'null'
         and not public.reglages_plage_valide(v_bloc -> 'heures') then
        return false;
      end if;
      if jsonb_typeof(v_bloc -> 'frais') is not null and jsonb_typeof(v_bloc -> 'frais') <> 'null' then
        if jsonb_typeof(v_bloc -> 'frais') <> 'number' then return false; end if;
        v_n := (v_bloc ->> 'frais')::numeric;
        if v_n < 0 or v_n > 100 then return false; end if;
      end if;
    end if;
    v_bloc := p_config -> 'carte';
    if v_bloc is not null and jsonb_typeof(v_bloc) <> 'null' then
      if jsonb_typeof(v_bloc) <> 'array' or jsonb_array_length(v_bloc) > 80 then return false; end if;
      for v_val in select value from jsonb_array_elements(v_bloc) loop
        if jsonb_typeof(v_val) <> 'object' then return false; end if;
        if jsonb_typeof(v_val -> 'libelle') is distinct from 'string' then return false; end if;
        v_t := v_val ->> 'libelle';
        if v_t <> btrim(v_t) or v_t = '' or char_length(v_t) > 80 then return false; end if;
        if lower(v_t) = any (v_vus) then return false; end if;
        v_vus := v_vus || lower(v_t);
        if jsonb_typeof(v_val -> 'prix') is distinct from 'number' then return false; end if;
        v_n := (v_val ->> 'prix')::numeric;
        if v_n < 0 or v_n > 1000 then return false; end if;
      end loop;
    end if;
    return true;

  end if;

  return false;
end;
$fn$;

-- Une plage horaire { "debut": "HH:MM", "fin": "HH:MM" }, le début avant la fin.
create or replace function public.reglages_plage_valide(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $fn$
declare
  v_cle text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  for v_cle in select key from jsonb_each(p) loop
    if v_cle not in ('debut', 'fin') then return false; end if;
  end loop;
  if jsonb_typeof(p -> 'debut') is distinct from 'string' or jsonb_typeof(p -> 'fin') is distinct from 'string' then
    return false;
  end if;
  if (p ->> 'debut') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (p ->> 'fin') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    return false;
  end if;
  return (p ->> 'debut') < (p ->> 'fin');
end;
$fn$;

revoke all on function public.reglages_modules_hotel_valide(text, jsonb) from public, anon, authenticated;
revoke all on function public.reglages_plage_valide(jsonb) from public, anon, authenticated;
grant execute on function public.reglages_modules_hotel_valide(text, jsonb) to authenticated, service_role;
grant execute on function public.reglages_plage_valide(jsonb) to authenticated, service_role;

-- Les deux contraintes se reposent à l'identique de celles du lot 2a, élargies
-- aux trois modules de l'hôtel. Une ligne existante (modules du lot 2) reste
-- valide : la vérification du lot 2a garde le même résultat pour elle.
-- Retrait et pose dans une seule instruction : la table n'est jamais sans
-- contrainte, même si le fichier est joué hors transaction.
alter table public.reglages_modules
  drop constraint if exists reglages_modules_module_check,
  add constraint reglages_modules_module_check
    check (module in ('pertes', 'groupes', 'mep', 'fiches_salle', 'kds', 'catalogue', 'etages', 'demandes', 'repas')),
  drop constraint if exists reglages_modules_config_check,
  add constraint reglages_modules_config_check
    check (public.reglages_modules_config_valide(module, config) or public.reglages_modules_hotel_valide(module, config));

comment on function public.reglages_modules_hotel_valide(text, jsonb) is
  'Forme des blocs de reglages_modules pour les modules etages, demandes et repas (lot 6b). Faux pour tout autre module.';

-- Parité avec l'écran : les réglages de l'hôtel s'écrivent par la direction
-- de l'hôtel (consultant et patron), comme hotel_reglages, tarifs et forfaits.
-- Les policies de reglages_modules laissent aussi écrire le responsable
-- cuisine ; ce déclencheur le refuse pour ces trois modules seulement, sans
-- toucher aux policies du lot 2a. Hors session (éditeur SQL, service), il ne
-- bloque rien : auth.uid() est nul, current_user_role() rend une chaîne vide.
create or replace function public.reglages_modules_hotel_garde()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $fn$
declare
  v_hotel boolean;
begin
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;
  -- Chaque opération ne lit que la ligne qu'elle a : new à l'insertion, old à
  -- la suppression, les deux à la modification (un changement de module compte).
  v_hotel := case tg_op
    when 'INSERT' then new.module in ('etages', 'demandes', 'repas')
    when 'DELETE' then old.module in ('etages', 'demandes', 'repas')
    else old.module in ('etages', 'demandes', 'repas')
         or new.module in ('etages', 'demandes', 'repas')
  end;
  if v_hotel and coalesce((select public.current_user_role()), '') not in ('consultant', 'patron') then
    raise exception 'Ce réglage est réservé à la direction de l''hôtel.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$fn$;

revoke all on function public.reglages_modules_hotel_garde() from public, anon, authenticated;

create or replace trigger trg_reglages_modules_hotel_garde
  before insert or update or delete on public.reglages_modules
  for each row execute function public.reglages_modules_hotel_garde();
