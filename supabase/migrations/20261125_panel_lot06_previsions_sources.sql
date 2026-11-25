-- ═════════════════════════════════════════════════════════════════════════════
-- Lot 06 du panel (25.11.2026) : sources de la prévision des couverts.
--
-- reglages_modules reçoit le module 'previsions', bloc { "sources": { "pension":
-- bool } } : la direction de la maison allume la source « hôtes en pension »
-- (séjours de l'Hébergement) dans la prévision des couverts de Réservations.
-- La clé sources recevra plus tard les inscrits, le soleil et les événements.
--
-- Additive et idempotente. RLS inchangée (lecture user_can_access_etab,
-- écriture consultant, patron, resp_cuisine, policies du lot 2a). Le
-- déclencheur trg_reglages_modules_hotel_garde n'est pas touché : il ne vise
-- que etages, demandes et repas.
--
-- Les deux contraintes sont reposées depuis leur texte lu en production le
-- 25.11.2026 (identique au lot 5) : onze modules, trois fonctions en OU. Si
-- l'une d'elles a changé de nom ou de texte d'ici l'application, la migration
-- s'arrête sans rien reposer.
-- Rollback : 20261125_panel_lot06_previsions_sources.rollback.sql.
-- ═════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';

do $garde$
declare
  v_module text;
  v_config text;
begin
  select pg_get_constraintdef(oid) into v_module from pg_constraint
   where conrelid = 'public.reglages_modules'::regclass and conname = 'reglages_modules_module_check';
  select pg_get_constraintdef(oid) into v_config from pg_constraint
   where conrelid = 'public.reglages_modules'::regclass and conname = 'reglages_modules_config_check';
  if v_module is null or v_config is null then
    raise exception 'lot06 : contrainte de reglages_modules introuvable sous son nom attendu, rien n''est reposé';
  end if;
  -- Texte d'avant (première application) ou texte de ce lot (rejeu).
  if v_module not in (
       'CHECK ((module = ANY (ARRAY[''pertes''::text, ''groupes''::text, ''mep''::text, ''fiches_salle''::text, ''kds''::text, ''catalogue''::text, ''etages''::text, ''demandes''::text, ''repas''::text, ''journal''::text, ''statistiques''::text])))',
       'CHECK ((module = ANY (ARRAY[''pertes''::text, ''groupes''::text, ''mep''::text, ''fiches_salle''::text, ''kds''::text, ''catalogue''::text, ''etages''::text, ''demandes''::text, ''repas''::text, ''journal''::text, ''statistiques''::text, ''previsions''::text])))')
     or v_config not in (
       'CHECK ((reglages_modules_config_valide(module, config) OR reglages_modules_hotel_valide(module, config) OR reglages_modules_bureau_valide(module, config)))',
       'CHECK ((reglages_modules_config_valide(module, config) OR reglages_modules_hotel_valide(module, config) OR reglages_modules_bureau_valide(module, config) OR reglages_modules_previsions_valide(module, config)))') then
    raise exception 'lot06 : les contraintes de reglages_modules ont changé depuis leur relevé, rien n''est reposé (%, %)', v_module, v_config;
  end if;
end;
$garde$;

create or replace function public.reglages_modules_previsions_valide(p_module text, p_config jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $fn$
declare
  v_cle text;
begin
  if p_module is distinct from 'previsions' then return false; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then return false; end if;
  for v_cle in select key from jsonb_each(p_config) loop
    if v_cle <> 'sources' then return false; end if;
  end loop;
  if p_config ? 'sources' then
    if jsonb_typeof(p_config -> 'sources') <> 'object' then return false; end if;
    for v_cle in select key from jsonb_each(p_config -> 'sources') loop
      if v_cle <> 'pension' then return false; end if;
    end loop;
    if (p_config -> 'sources') ? 'pension'
       and jsonb_typeof(p_config -> 'sources' -> 'pension') <> 'boolean' then
      return false;
    end if;
  end if;
  return true;
end;
$fn$;

revoke all on function public.reglages_modules_previsions_valide(text, jsonb) from public, anon, authenticated;
grant execute on function public.reglages_modules_previsions_valide(text, jsonb) to authenticated, service_role;

comment on function public.reglages_modules_previsions_valide(text, jsonb) is
  'Forme du bloc de reglages_modules pour le module previsions (lot 06 du panel) : { sources: { pension: bool } }. Faux pour tout autre module.';

-- Une seule instruction : la table n'est jamais sans contrainte. Une ligne
-- existante reste valide (les modules et fonctions d'avant sont gardés).
alter table public.reglages_modules
  drop constraint if exists reglages_modules_module_check,
  add constraint reglages_modules_module_check
    check (module in ('pertes', 'groupes', 'mep', 'fiches_salle', 'kds', 'catalogue', 'etages', 'demandes', 'repas', 'journal', 'statistiques', 'previsions')),
  drop constraint if exists reglages_modules_config_check,
  add constraint reglages_modules_config_check
    check (public.reglages_modules_config_valide(module, config)
      or public.reglages_modules_hotel_valide(module, config)
      or public.reglages_modules_bureau_valide(module, config)
      or public.reglages_modules_previsions_valide(module, config));
