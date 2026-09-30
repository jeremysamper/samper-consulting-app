-- ═══════════════════════════════════════════════════════════════════════════
-- Pointage hors planning : pointer son arrivée sans horaire prévu.
--
-- Un extra appelé au dernier moment, un service prolongé, un retour le soir :
-- l'équipier pointe depuis le tableau de bord même sans horaire au planning.
-- L'arrivée crée l'horaire du jour à son nom (debut = heure d'arrivée, note
-- « Pointage hors planning »), déjà pointé. Le départ passe ensuite par
-- pointer_depart / pointer_offline, inchangés : cet horaire est un shift
-- ordinaire.
--
--   * p_shift_id est généré sur l'appareil (uuid) : la clé primaire porte
--     l'idempotence. Un rejeu (file hors-ligne, double tap) renvoie l'horaire
--     déjà créé au lieu d'en faire un second.
--   * p_event_at : heure du geste (UTC). Hors-ligne, l'arrivée est rejouée au
--     retour du réseau avec l'heure réelle du geste, comme pointer_offline.
--     Bornée : pas dans le futur (5 min de marge d'horloge), pas plus de 48 h.
--   * fin = debut à la création (colonne NOT NULL) : l'heure prévue n'existe
--     pas ; les heures travaillées se lisent sur pointage_debut / pointage_fin.
--   * Garde : membre de l'établissement (user_can_access_etab), et pas déjà en
--     poste ce jour-là (un pointage ouvert se termine d'abord).
--
-- Additive : une fonction nouvelle, rien de modifié. SECURITY DEFINER comme
-- pointer_arrivee : contourne la RLS de shifts mais l'horaire créé est
-- toujours au nom de l'appelant (auth.uid()).
-- Idempotente : create or replace. Rollback en fin de fichier.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.pointer_hors_planning(
  p_shift_id         text,
  p_etablissement_id text,
  p_event_at         timestamptz default now()
)
returns shifts
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id text := auth.uid()::text;
  v_at      timestamptz := coalesce(p_event_at, now());
  v_jour    date;
  v_heure   time;
  v_row     shifts;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  if p_shift_id is null or length(p_shift_id) < 8 or p_etablissement_id is null then
    raise exception 'Horaire ou établissement manquant';
  end if;
  if not user_can_access_etab(p_etablissement_id) then
    raise exception 'Établissement non autorisé';
  end if;
  if v_at > now() + interval '5 minutes' or v_at < now() - interval '48 hours' then
    raise exception 'Heure de pointage invalide';
  end if;

  -- Rejeu : l'horaire existe déjà (même identifiant) → on le renvoie tel quel.
  select * into v_row from shifts where id = p_shift_id;
  if found then
    if v_row.user_id <> v_user_id then
      raise exception 'Horaire non autorisé';
    end if;
    return v_row;
  end if;

  v_jour  := (v_at at time zone 'Europe/Zurich')::date;
  v_heure := to_char(v_at at time zone 'Europe/Zurich', 'HH24:MI')::time;

  if exists (
    select 1 from shifts
     where user_id = v_user_id and date = v_jour
       and pointage_debut is not null and pointage_fin is null
  ) then
    raise exception 'Vous êtes déjà en poste : pointez d''abord votre départ';
  end if;

  insert into shifts (id, etablissement_id, user_id, date, debut, fin, pointage_debut, note)
  values (p_shift_id, p_etablissement_id, v_user_id, v_jour, v_heure, v_heure, v_heure, 'Pointage hors planning')
  on conflict (id) do nothing
  returning * into v_row;

  if not found then
    -- Course entre deux appels simultanés : l'autre a créé l'horaire.
    select * into v_row from shifts where id = p_shift_id and user_id = v_user_id;
    if not found then
      raise exception 'Horaire non autorisé';
    end if;
  end if;

  return v_row;
end;
$function$;

-- Même traitement des droits que pointer_offline : authentifiés seulement
-- (grant direct à anon posé par les default privileges retiré explicitement).
revoke all on function public.pointer_hors_planning(text, text, timestamptz) from public;
revoke execute on function public.pointer_hors_planning(text, text, timestamptz) from anon;
grant execute on function public.pointer_hors_planning(text, text, timestamptz) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK :
--
-- drop function if exists public.pointer_hors_planning(text, text, timestamptz);
-- ─────────────────────────────────────────────────────────────────────────────
