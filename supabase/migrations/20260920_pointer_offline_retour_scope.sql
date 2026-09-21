-- ============================================================================
-- pointer_offline : ne plus renvoyer ni recopier le shift d'un autre
--
-- APPLIQUÉ EN PROD via MCP le 21.09.2026 (après le verrou profiles, avant le
-- resserrage 0029). Miroir repo == prod.
--
-- Constat lors de la relecture des fonctions SECURITY DEFINER (advisor 0029,
-- 20.09.2026), prolongement du mineur M3 de l'audit brief 3.
--
-- La fonction lit le shift demandé SANS filtre d'appartenance (elle contourne
-- la RLS), puis :
--   · renvoie la ligne complète dans `shift` sur les statuts 'duplicate' et
--     'not_applied', y compris quand le shift appartient à quelqu'un d'autre ;
--   · recopie son etablissement_id dans le journal de l'appelant, relisible
--     ensuite par la policy pointages_offline_select_own.
-- Preuve (harness begin/rollback, 20.09.2026) : un cuisinier d'etab-1, pour qui
-- la RLS masque le shift (0 ligne), recevait la ligne complète d'un shift
-- d'un autre établissement (employé, date, horaires, pointages) et voyait son
-- etablissement_id recopié dans son propre journal.
-- Portée réelle : il faut connaître l'identifiant. Ils sont dérivés d'un
-- horodatage en millisecondes (s<ms>, souvent suivi d'un index, parfois d'un
-- aléa court) : pas secrets comme un UUID, et les shifts créés en lot se
-- déduisent l'un de l'autre, mais pas énumérables à l'aveugle d'un
-- établissement à l'autre. Le cas crédible est l'ancien collègue ou l'employé
-- passé d'un établissement à l'autre. Chaque appel qui fuit laisse une ligne
-- au journal : pointages_offline est vide, la fuite n'a jamais servi. Aucune
-- écriture croisée n'a jamais été possible : les UPDATE portent la garde
-- user_id = auth.uid().
--
-- Correctif, sans toucher au contrat :
--   · `shift` n'est renvoyé que si le shift appartient à l'appelant, sinon null ;
--   · l'etablissement_id du journal vient du shift seulement s'il est à
--     l'appelant ; la valeur fournie par le client n'est retenue que si
--     l'appelant a accès à cet établissement.
-- Inchangé : signature, statuts, idempotence par client_uuid, journalisation
-- systématique (un punch n'est JAMAIS bloqué), gardes d'application au shift,
-- conversion Europe/Zurich, ACL (create or replace conserve les grants).
-- Seule différence de contenu du journal : si le shift est absent ou n'est pas
-- à l'appelant ET que l'établissement annoncé est hors de son périmètre,
-- etablissement_id est journalisé à NULL (auparavant : la valeur du client).
-- Un shift absent et un shift étranger donnent la même réponse : pas d'oracle
-- d'existence.
--
-- Compatibilité front : punchSync.js ne lit que `error`, jamais le contenu
-- renvoyé. pointages_offline compte 0 ligne en prod au 20.09.2026.
--
-- Répétition begin/rollback du 21.09.2026 : séquence propriétaire (arrivée,
-- rejeu, double arrivée, départ, type invalide) identique entre l'ancien et le
-- nouveau corps ; sept cas hostiles (shift étranger avec ou sans établissement
-- annoncé, rejeu, shift absent, id null, compte sans profil) : aucun blocage,
-- `shift` null partout, shift étranger intact.
--
-- ROLLBACK : réappliquer le bloc `create or replace function` de
-- 20260712_pointage_offline_idempotence.sql.
-- ============================================================================

create or replace function public.pointer_offline(
  p_shift_id         text,
  p_type             text,
  p_event_at         timestamptz,
  p_client_uuid      uuid,
  p_etablissement_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id     text := auth.uid()::text;
  v_shift       shifts;
  v_applied     shifts;
  v_zurich      time;
  v_owned       boolean;
  v_etab_client text;
  v_shift_json  jsonb;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;

  if p_client_uuid is null or p_event_at is null then
    raise exception 'client_uuid et event_at sont requis';
  end if;

  if p_type not in ('arrivee', 'depart') then
    raise exception 'Type de pointage invalide : %', p_type;
  end if;

  select * into v_shift from shifts where id = p_shift_id;

  -- Rien de ce shift ne sort de la fonction s'il n'est pas à l'appelant.
  v_owned := coalesce(v_shift.user_id = v_user_id, false);
  v_shift_json := case when v_owned then to_jsonb(v_shift) else null end;

  -- L'établissement annoncé par l'appareil n'est retenu que s'il est dans le
  -- périmètre de l'appelant.
  v_etab_client := case
    when p_etablissement_id is not null and user_can_access_etab(p_etablissement_id)
      then p_etablissement_id
    else null
  end;

  -- 1. Journal d'abord : la PK client_uuid porte l'idempotence. Un rejeu déjà
  --    passé ressort en 'duplicate' (succès idempotent, pas une erreur).
  insert into pointages_offline
    (client_uuid, shift_id, user_id, etablissement_id, type_pointage, event_at)
  values
    (p_client_uuid, p_shift_id, v_user_id,
     case when v_owned then coalesce(v_shift.etablissement_id, v_etab_client)
          else v_etab_client end,
     p_type, p_event_at)
  on conflict (client_uuid) do nothing;

  if not found then
    return jsonb_build_object('status', 'duplicate', 'shift', v_shift_json);
  end if;

  -- 2. Application au shift : heure du geste convertie en heure Zurich, mêmes
  --    gardes que les RPC online. Best-effort : aucune exception à ce stade.
  v_zurich := to_char(p_event_at at time zone 'Europe/Zurich', 'HH24:MI')::time;

  if p_type = 'arrivee' then
    update shifts
       set pointage_debut = v_zurich
     where id = p_shift_id
       and user_id = v_user_id
       and pointage_debut is null
    returning * into v_applied;
  else
    update shifts
       set pointage_fin = v_zurich
     where id = p_shift_id
       and user_id = v_user_id
       and pointage_debut is not null
       and pointage_fin is null
    returning * into v_applied;
  end if;

  if found then
    update pointages_offline set applied = true where client_uuid = p_client_uuid;
    return jsonb_build_object('status', 'applied', 'shift', to_jsonb(v_applied));
  end if;

  return jsonb_build_object('status', 'not_applied', 'shift', v_shift_json);
end;
$function$;

-- create or replace conserve l'ACL ; rappel explicite pour un rejeu sur une
-- base où la fonction n'existerait pas encore (default privileges du schéma).
revoke all on function public.pointer_offline(text, text, timestamptz, uuid, text) from public;
revoke execute on function public.pointer_offline(text, text, timestamptz, uuid, text) from anon;
grant execute on function public.pointer_offline(text, text, timestamptz, uuid, text) to authenticated;
