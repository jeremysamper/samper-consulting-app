-- ============================================================================
-- Lot 19 du panel : la règle des pourboires gardée par la base.
--
-- Le lot 11 range la règle de partage des pourboires dans
-- caisse_reglages.config, clé « pourboires ». L'écran ne montre la section
-- qu'au consultant et au patron (gardesCaisse.js, ROLES_POURBOIRES), mais les
-- policies de caisse_reglages (20261110_caisse_v4.sql) laissent aussi le
-- responsable de cuisine écrire la table. Après cette migration, la base
-- refuse tout changement de config->'pourboires' (ajout, modification,
-- retrait, suppression de la ligne, déplacement de la ligne vers un autre
-- établissement) à qui n'est pas consultant ou patron actif de
-- l'établissement. Les autres clés gardent leurs droits ; les policies ne
-- changent pas.
--
-- Deux fonctions, sur le modèle de caisse_paiement_garde_v7 :
--   - caisse_reglages_garde_pourboires (déclencheur, SECURITY INVOKER) lit
--     current_user avec la règle exacte des gardes v7 : une fonction de la
--     base (propriétaire postgres) et l'éditeur SQL passent ; tout autre
--     appelant (authenticated, anon, service_role) est un compte de l'API.
--     Elle ne doit jamais devenir SECURITY DEFINER : current_user y vaudrait
--     toujours postgres et la garde ne refuserait plus rien.
--   - caisse_pourboires_direction (SECURITY DEFINER) lit le rôle par
--     caisse_role_actif (null si le compte est désactivé, sans rôle ou pas
--     rattaché à l'établissement), que les comptes de l'API n'ont pas le droit
--     d'appeler eux-mêmes.
-- Comparaison par valeur jsonb (is distinct from) : une réécriture identique
-- de la clé passe, quand l'écran renvoie toute la config pour une autre
-- section. Une clé à null JSON vaut une clé absente : aucune règle, dans les
-- deux cas, pour le lecteur du lot 11 (pourboires.js, lireReglePourboires).
-- L'écran enregistre par upsert (caisseService.saveReglages : insert ... on
-- conflict (etablissement_id) do update). Postgres passe alors le déclencheur
-- d'abord en INSERT sur la ligne proposée, puis en UPDATE si la ligne existe :
-- en INSERT, la règle proposée se compare donc à celle de la ligne déjà en
-- base.
-- Message refusé : repris par caisseService.js (MESSAGES_RPC) et rejoué par la
-- démo (src/demo/fauxSupabase.js, gardesCaisse.js : changementPourboiresRefuse).
-- La migration retire aussi à authenticated TRUNCATE, TRIGGER et REFERENCES
-- sur caisse_reglages (accordés par défaut, jamais servis par PostgREST) :
-- TRUNCATE ne passe ni par la RLS ni par un déclencheur de ligne.
-- Retour : 20261126_panel_lot19_caisse_garde_pourboires.rollback.sql.
-- ============================================================================

set lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 1. Le droit de régler les pourboires d'un établissement : consultant ou
--    patron actif, rattaché à l'établissement. Jamais null.
-- ----------------------------------------------------------------------------
create or replace function public.caisse_pourboires_direction(p_etablissement_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return coalesce(public.caisse_role_actif(p_etablissement_id) in ('consultant', 'patron'), false);
end;
$$;

alter function public.caisse_pourboires_direction(text) owner to postgres;
revoke all on function public.caisse_pourboires_direction(text) from public, anon, authenticated;
-- Appelée par le déclencheur, qui tourne sous le compte de l'appelant.
grant execute on function public.caisse_pourboires_direction(text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. La garde : avant chaque insertion, mise à jour ou suppression d'une ligne
--    de caisse_reglages.
-- ----------------------------------------------------------------------------
create or replace function public.caisse_reglages_garde_pourboires()
returns trigger
language plpgsql
security invoker -- lit current_user : jamais SECURITY DEFINER
set search_path = public, pg_temp
as $$
declare
  -- Règle exacte des gardes v7 : tout ce qui n'est pas le propriétaire des
  -- fonctions de la base est traité comme un compte de l'API (authenticated,
  -- anon, service_role compris).
  v_api   boolean := current_user not in ('postgres', 'supabase_admin');
  v_avant jsonb;
  v_apres jsonb;
begin
  if not v_api then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if nullif(old.config -> 'pourboires', 'null'::jsonb) is not null
       and public.caisse_pourboires_direction(old.etablissement_id) is not true then
      raise exception 'caisse: seuls le consultant et le patron changent la regle des pourboires'
        using errcode = '42501';
    end if;
    return old;
  end if;

  v_apres := nullif(new.config -> 'pourboires', 'null'::jsonb);

  if tg_op = 'INSERT' then
    -- Insertion simple ou premier passage d'un upsert : la règle déjà en base
    -- pour cet établissement, s'il en a une (lue sous la RLS de l'appelant ;
    -- une ligne qu'il ne voit pas compte comme absente, ce qui refuse plus).
    select nullif(r.config -> 'pourboires', 'null'::jsonb)
      into v_avant
      from public.caisse_reglages r
     where r.etablissement_id = new.etablissement_id;
  elsif new.etablissement_id is distinct from old.etablissement_id then
    -- Déplacer la ligne retire la règle de l'ancien établissement et la pose
    -- sur le nouveau.
    if nullif(old.config -> 'pourboires', 'null'::jsonb) is not null
       and public.caisse_pourboires_direction(old.etablissement_id) is not true then
      raise exception 'caisse: seuls le consultant et le patron changent la regle des pourboires'
        using errcode = '42501';
    end if;
    v_avant := null;
  else
    v_avant := nullif(old.config -> 'pourboires', 'null'::jsonb);
  end if;

  if v_apres is distinct from v_avant
     and public.caisse_pourboires_direction(new.etablissement_id) is not true then
    raise exception 'caisse: seuls le consultant et le patron changent la regle des pourboires'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

alter function public.caisse_reglages_garde_pourboires() owner to postgres;
-- Un déclencheur se lance sans droit d'exécution : personne ne l'appelle.
revoke all on function public.caisse_reglages_garde_pourboires() from public, anon, authenticated, service_role;

drop trigger if exists trg_caisse_reglages_garde_pourboires on public.caisse_reglages;
create trigger trg_caisse_reglages_garde_pourboires
  before insert or update or delete on public.caisse_reglages
  for each row execute function public.caisse_reglages_garde_pourboires();

-- ----------------------------------------------------------------------------
-- 3. TRUNCATE (qui viderait la règle de toutes les maisons sans passer par la
--    garde), TRIGGER et REFERENCES : aucun écran ne s'en sert.
-- ----------------------------------------------------------------------------
revoke truncate, trigger, references on public.caisse_reglages from authenticated;

comment on function public.caisse_reglages_garde_pourboires() is
  'Lot 19 du panel : refuse un changement de config->''pourboires'' de caisse_reglages à qui n''est pas consultant ou patron actif de l''établissement. SECURITY INVOKER (lit current_user).';
comment on function public.caisse_pourboires_direction(text) is
  'Lot 19 du panel : vrai si l''appelant est consultant ou patron actif de l''établissement (caisse_role_actif). Jamais null.';

reset lock_timeout;
