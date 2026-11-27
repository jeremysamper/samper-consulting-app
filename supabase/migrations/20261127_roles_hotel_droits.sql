-- Revue des rôles hôtel (27.11.2026), décisions de Jérémy :
--   1. La réception gère par défaut les réservations de table (previsions) et
--      les groupes : receptionniste ajouté aux rôles par défaut du droit
--      « Modifier » de ces deux modules.
--   2. La gouvernante gère par défaut le planning (celui des femmes et valets
--      de chambre ; le droit couvre tout le planning de la maison, comme pour
--      le responsable de cuisine) : gouvernante ajoutée aux rôles par défaut
--      du droit « Modifier » du planning.
--   3. Le technicien remet une chambre en service après une réparation :
--      RPC chambre_remettre_en_service, ouverte à qui gère Technique, Étages ou
--      Hébergement, qui ne fait que passer une chambre hors service à « à faire ».
--
-- Les rôles par défaut vivent dans l'appel user_peut_gerer(module, rôles) de
-- chaque policy et de chaque fonction : on les étend sur place (ALTER POLICY,
-- sans retirer la policy). Une case « Modifier » réglée dans Rôles & accès
-- (permissions, permissions_utilisateurs) garde la main, comme avant.
-- Aucun autre rôle ne change. Miroir côté front : manageableModules de
-- src/modules/moduleConfig.js.
-- Idempotente : relancée, elle ne trouve plus les anciens appels et ne change
-- rien ; la RPC est recréée à l'identique.
-- Retour arrière : 20261127_roles_hotel_droits.rollback.sql.

begin;

-- ALTER POLICY verrouille la table le temps de la transaction : si une requête
-- longue la tient déjà, on abandonne plutôt que de faire attendre la salle.
set local lock_timeout = '3s';

-- ── 1 et 2. Policies ────────────────────────────────────────────────────────
do $migration$
declare
  -- module, rôles par défaut d'aujourd'hui, rôle ajouté, nombre de policies attendu
  v_lots constant jsonb := '[
    {"module": "previsions", "roles": ["consultant", "patron", "resp_cuisine", "hote"], "ajout": "receptionniste", "attendu": 20},
    {"module": "groupes", "roles": ["consultant", "patron", "resp_cuisine", "hote", "cuisinier"], "ajout": "receptionniste", "attendu": 1},
    {"module": "planning", "roles": ["consultant", "patron", "resp_cuisine"], "ajout": "gouvernante", "attendu": 20}
  ]';
  v_lot jsonb;
  v_ancien text;
  v_nouveau text;
  v_roles text;
  v_pol record;
  v_sql text;
  v_n int;
  v_deja int;
begin
  for v_lot in select * from jsonb_array_elements(v_lots) loop
    -- Forme que Postgres rend pour l'appel dans pg_policies.
    select string_agg(format('%L::text', r), ', ') into v_roles
      from jsonb_array_elements_text(v_lot->'roles') r;
    v_ancien := format('user_peut_gerer(%L::text, ARRAY[%s])', v_lot->>'module', v_roles);
    v_nouveau := format('user_peut_gerer(%L::text, ARRAY[%s, %L::text])', v_lot->>'module', v_roles, v_lot->>'ajout');

    select count(*) into v_deja from pg_policies
     where schemaname = 'public'
       and position(v_nouveau in coalesce(qual, '') || coalesce(with_check, '')) > 0;

    v_n := 0;
    for v_pol in
      select tablename, policyname, qual, with_check from pg_policies
       where schemaname = 'public'
         and position(v_ancien in coalesce(qual, '') || coalesce(with_check, '')) > 0
    loop
      v_sql := format('alter policy %I on public.%I', v_pol.policyname, v_pol.tablename);
      if v_pol.qual is not null then
        v_sql := v_sql || format(' using (%s)', replace(v_pol.qual, v_ancien, v_nouveau));
      end if;
      if v_pol.with_check is not null then
        v_sql := v_sql || format(' with check (%s)', replace(v_pol.with_check, v_ancien, v_nouveau));
      end if;
      execute v_sql;
      v_n := v_n + 1;
    end loop;

    -- Première passe : toutes les policies attendues. Relance : aucune à
    -- changer, toutes déjà étendues. Tout autre compte arrête la migration.
    if not ((v_n = (v_lot->>'attendu')::int and v_deja = 0)
            or (v_n = 0 and v_deja = (v_lot->>'attendu')::int)) then
      raise exception 'roles_hotel_droits: % policies changées et % déjà étendues pour %, % attendues',
        v_n, v_deja, v_lot->>'module', v_lot->>'attendu';
    end if;
  end loop;
end
$migration$;

-- ── 1 et 2. Fonctions ───────────────────────────────────────────────────────
-- Même extension dans les fonctions qui relisent ces droits. CREATE OR REPLACE
-- garde le propriétaire, les droits d'exécution et SECURITY DEFINER.
do $migration$
declare
  v_lots constant jsonb := '[
    {"fonction": "groupe_evenements_avant_maj", "ancien": "user_peut_gerer(''groupes'', array[''consultant'',''patron'',''resp_cuisine'',''hote'',''cuisinier''])", "nouveau": "user_peut_gerer(''groupes'', array[''consultant'',''patron'',''resp_cuisine'',''hote'',''cuisinier'',''receptionniste''])"},
    {"fonction": "echange_decider", "ancien": "user_peut_gerer(''planning'', array[''consultant'', ''patron'', ''resp_cuisine''])", "nouveau": "user_peut_gerer(''planning'', array[''consultant'', ''patron'', ''resp_cuisine'', ''gouvernante''])"},
    {"fonction": "peut_pointer_pour", "ancien": "user_peut_gerer(''planning'', array[''consultant'', ''patron'', ''resp_cuisine''])", "nouveau": "user_peut_gerer(''planning'', array[''consultant'', ''patron'', ''resp_cuisine'', ''gouvernante''])"},
    {"fonction": "planning_modeles_remplacer", "ancien": "user_peut_gerer(''planning'', array[''consultant'', ''patron'', ''resp_cuisine''])", "nouveau": "user_peut_gerer(''planning'', array[''consultant'', ''patron'', ''resp_cuisine'', ''gouvernante''])"}
  ]';
  v_lot jsonb;
  v_oid oid;
  v_def text;
  v_occ int;
begin
  for v_lot in select * from jsonb_array_elements(v_lots) loop
    select p.oid into strict v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_lot->>'fonction';
    v_def := pg_get_functiondef(v_oid);
    if position(v_lot->>'nouveau' in v_def) > 0 then
      continue; -- déjà étendue
    end if;
    v_occ := (length(v_def) - length(replace(v_def, v_lot->>'ancien', ''))) / length(v_lot->>'ancien');
    if v_occ <> 1 then
      raise exception 'roles_hotel_droits: % appel(s) attendu(s) 1 dans %', v_occ, v_lot->>'fonction';
    end if;
    execute replace(v_def, v_lot->>'ancien', v_lot->>'nouveau');
  end loop;
end
$migration$;

-- ── 3. Remise en service d'une chambre ──────────────────────────────────────
-- La policy chambres_update demande Étages ou Hébergement ; la technique n'a
-- ni l'un ni l'autre et ne doit pas tenir les étages (statuts, attributions).
-- Cette fonction ne fait qu'une chose : une chambre hors service passe à
-- « à faire » (les étages la nettoient), motif effacé. Le journal des statuts
-- et l'heure du statut suivent par les déclencheurs de chambres.
create or replace function public.chambre_remettre_en_service(p_chambre_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := (select auth.uid())::text;
  v_etab text;
  v_statut text;
begin
  if v_uid is null then
    raise exception 'REMISE_RESERVEE: connexion requise' using errcode = '42501';
  end if;
  if p_chambre_id is null then
    raise exception 'CHAMBRE_INCONNUE: chambre requise' using errcode = '22023';
  end if;
  select c.etablissement_id, c.statut_menage into v_etab, v_statut
    from public.chambres c where c.id = p_chambre_id for update;
  if not found or not coalesce(public.user_can_access_etab(v_etab), false) then
    raise exception 'CHAMBRE_INCONNUE: chambre introuvable' using errcode = 'P0002';
  end if;
  if not (coalesce(public.user_peut_gerer('technique', array['consultant', 'patron', 'technicien', 'gouvernante']), false)
          or coalesce(public.user_peut_gerer('etages', array['consultant', 'patron', 'gouvernante', 'femme_de_chambre', 'receptionniste']), false)
          or coalesce(public.user_peut_gerer('hebergement', array['consultant', 'patron', 'receptionniste']), false)) then
    raise exception 'REMISE_RESERVEE: remettre une chambre en service demande le droit Modifier de Technique, d''Étages ou d''Hébergement'
      using errcode = '42501';
  end if;
  if v_statut is distinct from 'hors_service' then
    return 'deja_en_service';
  end if;
  update public.chambres
     set statut_menage = 'a_faire', hors_service_motif = null
   where id = p_chambre_id;
  return 'remise';
end;
$$;

revoke all on function public.chambre_remettre_en_service(uuid) from public, anon, authenticated, service_role;
grant execute on function public.chambre_remettre_en_service(uuid) to authenticated;

commit;
