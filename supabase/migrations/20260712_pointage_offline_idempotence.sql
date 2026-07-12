-- ═══════════════════════════════════════════════════════════════════════════
-- Pointage hors-ligne (PWA) : idempotence et rejeu.
--
-- Les établissements clients (Évolène, Crans-Montana) subissent des coupures
-- réseau fréquentes. Règle métier dure : un punch ne doit JAMAIS être bloqué.
-- Hors-ligne, le punch est horodaté au moment du geste (UTC), mis en file sur
-- l'appareil (IndexedDB) puis rejoué au retour du réseau via pointer_offline.
--
--   * pointages_offline : journal des punches rejoués. client_uuid (généré sur
--     l'appareil au moment du geste) est PRIMARY KEY : c'est la contrainte
--     UNIQUE d'idempotence, un rejeu répété ne crée jamais de doublon.
--   * pointer_offline : journalise l'événement puis l'applique au shift avec
--     les MÊMES gardes que pointer_arrivee / pointer_depart (appartenance via
--     le token, anti-double sur colonne NULL). L'application est best-effort :
--     si la garde échoue (déjà pointé online, shift supprimé, mauvaise
--     séquence), l'événement reste journalisé (applied = false) et le shift
--     n'est pas modifié. Pas de résolution de conflit : la correction passe
--     par l'édition manuelle manager existante.
--   * Heures : event_at stocké en UTC (timestamptz) ; l'application au shift
--     convertit en Europe/Zurich au format HH24:MI, comme les RPC online.
--
-- Écritures : exclusivement via la RPC (SECURITY DEFINER). Aucune politique
-- INSERT/UPDATE/DELETE côté client, volontairement.
--
-- Idempotente : create table/index if not exists, create or replace function,
-- drop policy if exists avant create policy. Rejouable sans effet de bord.
-- Rollback fourni en fin de fichier (bloc commenté).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.pointages_offline (
  client_uuid      uuid primary key,
  shift_id         text,
  user_id          text not null,
  etablissement_id text,
  type_pointage    text not null check (type_pointage in ('arrivee', 'depart')),
  event_at         timestamptz not null,
  applied          boolean not null default false,
  created_at       timestamptz not null default now()
);

-- Consultation par utilisateur (colonne de la politique SELECT).
create index if not exists idx_pointages_offline_user
  on public.pointages_offline (user_id, created_at desc);

alter table public.pointages_offline enable row level security;

-- Lecture : chacun voit ses propres punches rejoués. Forme (select auth.uid())
-- pour l'évaluation InitPlan (une fois par requête, pas par ligne).
drop policy if exists pointages_offline_select_own on public.pointages_offline;
create policy pointages_offline_select_own
  on public.pointages_offline
  for select
  using (user_id = (select auth.uid())::text);

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC de rejeu. SECURITY DEFINER comme pointer_arrivee / pointer_depart :
-- contourne la RLS de shifts mais re-vérifie l'appartenance (user_id du token).
-- Retour jsonb : { status: 'applied' | 'duplicate' | 'not_applied', shift }.
-- Le client retire l'élément de sa file sur ces trois statuts (l'événement est
-- journalisé quoi qu'il arrive) et ne le conserve que sur erreur réseau.
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_user_id text := auth.uid()::text;
  v_shift   shifts;
  v_applied shifts;
  v_zurich  time;
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

  -- 1. Journal d'abord : la PK client_uuid porte l'idempotence. Un rejeu déjà
  --    passé ressort en 'duplicate' (succès idempotent, pas une erreur).
  insert into pointages_offline
    (client_uuid, shift_id, user_id, etablissement_id, type_pointage, event_at)
  values
    (p_client_uuid, p_shift_id, v_user_id,
     coalesce(v_shift.etablissement_id, p_etablissement_id), p_type, p_event_at)
  on conflict (client_uuid) do nothing;

  if not found then
    return jsonb_build_object('status', 'duplicate', 'shift', to_jsonb(v_shift));
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

  return jsonb_build_object('status', 'not_applied', 'shift', to_jsonb(v_shift));
end;
$function$;

-- Nouvelle fonction : on restreint aux utilisateurs authentifiés (auth.uid()
-- est de toute façon requis dans le corps). Le revoke anon est explicite car
-- les default privileges du schéma posent un grant DIRECT à anon à la création,
-- que "revoke from public" ne retire pas (advisor 0028).
revoke all on function public.pointer_offline(text, text, timestamptz, uuid, text) from public;
revoke execute on function public.pointer_offline(text, text, timestamptz, uuid, text) from anon;
grant execute on function public.pointer_offline(text, text, timestamptz, uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (à exécuter tel quel pour revenir à l'état précédent) :
--
-- drop function if exists public.pointer_offline(text, text, timestamptz, uuid, text);
-- drop table if exists public.pointages_offline;
-- ─────────────────────────────────────────────────────────────────────────────
