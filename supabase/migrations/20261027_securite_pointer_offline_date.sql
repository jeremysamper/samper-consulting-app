-- ============================================================================
-- Sécurité L0 : un pointage hors ligne ne s'applique qu'autour du jour du shift
--
-- Constat du 27.10.2026 (relevé L0, point 10) : pointer_offline appliquait
-- p_event_at sans borne. Un employé pouvait poser sur son shift du jour une
-- heure d'arrivée prise n'importe quel autre jour, ou dans le futur.
-- pointer_hors_planning borne déjà son heure (48 h en arrière, 5 min en avant).
--
-- Changement : l'application au shift (étape 2) exige que l'heure du geste
-- tombe, à l'heure de Zurich, entre la veille et le lendemain du jour du
-- shift (service de nuit, arrivée juste avant minuit), et pas plus de
-- 15 minutes dans le futur (horloge de l'appareil en avance). Hors de cette
-- fenêtre : statut 'not_applied', comme un shift déjà pointé. Le journal
-- pointages_offline garde toujours la trace (étape 1 inchangée) : un punch
-- n'est jamais perdu. Aucun écran ne lit ce journal aujourd'hui : il est
-- visible en base seulement, par
--   select * from public.pointages_offline where applied = false order by event_at desc;
-- et l'alerte « pointage manquant » le signale si la règle est configurée.
--
-- Effet sur le rejeu normal : aucun. punchSync.js horodate le geste à
-- l'instant du toucher, donc le jour même du shift, quel que soit le délai de
-- synchronisation. Contrat inchangé (mêmes paramètres, même jsonb ; le client
-- ne lit que error).
--
-- Idempotent, rejouable.
--
-- ROLLBACK : rejouer le bloc create or replace function public.pointer_offline
-- de 20261005_planning_groupes_postes.sql (l. 225 à 319), identique à ce
-- fichier sans v_dans_fenetre. Ne pas rejouer
-- 20260920_pointer_offline_retour_scope.sql : il précède peut_pointer_pour et
-- fermerait le pointage des managers et des comptes de poste.
-- ============================================================================

create or replace function public.pointer_offline(
  p_shift_id text,
  p_type text,
  p_event_at timestamp with time zone,
  p_client_uuid uuid,
  p_etablissement_id text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id        text := auth.uid()::text;
  v_shift          shifts;
  v_applied        shifts;
  v_zurich         time;
  v_owned          boolean;
  v_etab_client    text;
  v_shift_json     jsonb;
  v_dans_fenetre   boolean;
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

  -- Rien de ce shift ne sort de la fonction si l'appelant ne peut pas le
  -- pointer (propriétaire, manager du planning, compte de pointage partagé).
  v_owned := coalesce(
    v_shift.user_id = v_user_id or peut_pointer_pour(v_shift.user_id, v_shift.etablissement_id),
    false);
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
  --    user_id = l'appelant (le compte qui a pointé).
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
  --    Le geste doit tomber entre la veille et le lendemain du jour du shift,
  --    et pas dans le futur (15 minutes de tolérance d'horloge).
  v_zurich := to_char(p_event_at at time zone 'Europe/Zurich', 'HH24:MI')::time;
  v_dans_fenetre := v_owned
    and p_event_at <= now() + interval '15 minutes'
    and (p_event_at at time zone 'Europe/Zurich')::date
        between v_shift.date::date - 1 and v_shift.date::date + 1;

  if v_dans_fenetre then
    if p_type = 'arrivee' then
      update shifts
         set pointage_debut = v_zurich
       where id = p_shift_id
         and pointage_debut is null
      returning * into v_applied;
    else
      update shifts
         set pointage_fin = v_zurich
       where id = p_shift_id
         and pointage_debut is not null
         and pointage_fin is null
      returning * into v_applied;
    end if;

    if found then
      update pointages_offline set applied = true where client_uuid = p_client_uuid;
      return jsonb_build_object('status', 'applied', 'shift', to_jsonb(v_applied));
    end if;
  end if;

  return jsonb_build_object('status', 'not_applied', 'shift', v_shift_json);
end;
$function$;

comment on function public.pointer_offline(text, text, timestamp with time zone, uuid, text) is
  'RPC de rejeu des pointages hors-ligne. SECURITY DEFINER voulu : pointages_offline n''a aucune policy d''écriture, le journal ne s''alimente que par cette fonction. Application au shift seulement si le geste tombe entre la veille et le lendemain du jour du shift (heure de Zurich), pas plus de 15 minutes dans le futur. Advisor 0029 attendu.';
