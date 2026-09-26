-- ═══════════════════════════════════════════════════════════════════════════
-- Saisie de stock : écriture LIGNE À LIGNE, idempotente, rejouable hors-ligne.
--
-- On compte l'inventaire là où sont les marchandises : chambre froide, cave,
-- réserve au sous-sol. C'est exactement là qu'il n'y a pas de réseau. Les
-- quantités sont donc mises en file sur l'appareil (IndexedDB) puis rejouées
-- au retour du réseau.
--
-- Pourquoi une RPC et pas le simple upsert existant : `inventaires.lignes` est
-- un JSONB, et le front écrit la LIGNE ENTIÈRE de l'inventaire à chaque
-- modification. Rejouer un tel enregistrement après deux heures de comptage
-- hors-ligne écraserait tout ce qui a bougé entre-temps : le produit ajouté au
-- pass, les quantités comptées par le collègue parti à la cave. La RPC fusionne
-- une SEULE ligne dans l'état courant, côté serveur, sous transaction.
--
--   * inventaire_saisies_offline : journal des saisies. client_uuid (généré sur
--     l'appareil au moment du comptage) est PRIMARY KEY : c'est la contrainte
--     d'idempotence, un rejeu répété n'applique jamais deux fois.
--   * inventaire_saisir_stock : fusionne la quantité dans la ligne visée,
--     recalcule écart / valeur / écart valeur de cette ligne et la valeur
--     totale de l'inventaire.
--   * Conflit : c'est le comptage le plus RÉCENT qui gagne, jamais le dernier
--     synchronisé. Chaque ligne porte `compteLe` (heure du geste, UTC) ; une
--     saisie qui arrive avec un `compteLe` plus ancien que celui déjà en base
--     est journalisée et ignorée (statut 'stale'). Sans cette règle, une
--     tablette restée hors-ligne tout le service écraserait au réveil un
--     comptage fait après elle.
--
-- SECURITY INVOKER (et non DEFINER) : les politiques RLS d'`inventaires` sont
-- déjà exactement la règle voulue (user_can_access_etab). Passer en DEFINER
-- créerait un contournement de RLS à auditer sans rien apporter.
--
-- Idempotente : create ... if not exists, create or replace, drop policy if
-- exists avant create policy. Rejouable sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.inventaire_saisies_offline (
  client_uuid      uuid primary key,
  inventaire_id    text not null,
  ligne_id         text not null,
  stock_reel       numeric not null,
  compte_le        timestamptz not null,
  user_id          text not null,
  etablissement_id text,
  applique         boolean not null default false,
  created_at       timestamptz not null default now()
);

-- Consultation par utilisateur (colonne des politiques).
create index if not exists idx_inventaire_saisies_offline_user
  on public.inventaire_saisies_offline (user_id, created_at desc);

alter table public.inventaire_saisies_offline enable row level security;

-- Forme (select auth.uid()) pour l'évaluation InitPlan : une fois par requête,
-- pas une fois par ligne.
drop policy if exists inventaire_saisies_offline_select_own on public.inventaire_saisies_offline;
create policy inventaire_saisies_offline_select_own
  on public.inventaire_saisies_offline
  for select
  using (user_id = (select auth.uid())::text);

-- INSERT nécessaire : la fonction s'exécute avec les droits de l'appelant.
-- Le WITH CHECK interdit d'écrire le journal sous l'identité d'un autre.
drop policy if exists inventaire_saisies_offline_insert_own on public.inventaire_saisies_offline;
create policy inventaire_saisies_offline_insert_own
  on public.inventaire_saisies_offline
  for insert
  with check (user_id = (select auth.uid())::text);

-- Marquage `applique` par la fonction, sur ses propres lignes uniquement.
drop policy if exists inventaire_saisies_offline_update_own on public.inventaire_saisies_offline;
create policy inventaire_saisies_offline_update_own
  on public.inventaire_saisies_offline
  for update
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC de saisie. Utilisée AUSSI en ligne : le chemin de saisie est le même
-- en ligne et hors-ligne, la fusion par ligne protège donc également deux
-- personnes qui comptent le même inventaire chacune de leur côté.
--
-- Retour jsonb { status, ... } :
--   'applied'     : quantité écrite
--   'duplicate'   : déjà rejouée (succès idempotent)
--   'stale'       : un comptage plus récent existe, saisie ignorée
--   'not_applied' : inventaire ou ligne absente (supprimée entre-temps)
-- Le client retire l'élément de sa file sur ces quatre statuts : l'événement
-- est journalisé quoi qu'il arrive. Il ne le conserve que sur erreur réseau.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.inventaire_saisir_stock(
  p_inventaire_id text,
  p_ligne_id      text,
  p_stock_reel    numeric,
  p_compte_le     timestamptz,
  p_client_uuid   uuid
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id     text := auth.uid()::text;
  v_inv         inventaires;
  v_ligne       jsonb;
  v_compte_base timestamptz;
  v_lignes      jsonb;
  v_prix        numeric;
  v_theo        numeric;
  v_ecart       numeric;
  v_total       numeric;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;

  if p_client_uuid is null or p_compte_le is null then
    raise exception 'client_uuid et compte_le sont requis';
  end if;

  if p_stock_reel is null or p_stock_reel < 0 then
    raise exception 'Quantité invalide : %', p_stock_reel;
  end if;

  -- Lecture sous RLS : un inventaire hors des établissements de l'utilisateur
  -- est simplement invisible, la saisie ressort 'not_applied'.
  -- FOR UPDATE : verrou de la ligne jusqu'à la fin de la transaction. Sans lui,
  -- deux personnes qui comptent le même inventaire au même instant lisaient
  -- le même état, et la seconde fusion écrasait la première (revue du
  -- 26.09.2026). Les politiques select et update d'inventaires sont
  -- identiques : qui peut lire peut verrouiller.
  select * into v_inv from inventaires where id = p_inventaire_id for update;

  if v_inv.id is null then
    return jsonb_build_object('status', 'not_applied', 'raison', 'inventaire_absent');
  end if;

  -- 1. Journal d'abord : la PK client_uuid porte l'idempotence.
  insert into inventaire_saisies_offline
    (client_uuid, inventaire_id, ligne_id, stock_reel, compte_le, user_id, etablissement_id)
  values
    (p_client_uuid, p_inventaire_id, p_ligne_id, p_stock_reel, p_compte_le,
     v_user_id, v_inv.etablissement_id)
  on conflict (client_uuid) do nothing;

  if not found then
    return jsonb_build_object('status', 'duplicate');
  end if;

  -- 2. Ligne visée
  select elem into v_ligne
    from jsonb_array_elements(coalesce(v_inv.lignes, '[]'::jsonb)) as elem
   where elem->>'id' = p_ligne_id
   limit 1;

  if v_ligne is null then
    return jsonb_build_object('status', 'not_applied', 'raison', 'ligne_absente');
  end if;

  -- 3. Le comptage le plus récent gagne, quel que soit l'ordre d'arrivée.
  v_compte_base := nullif(v_ligne->>'compteLe', '')::timestamptz;
  if v_compte_base is not null and v_compte_base > p_compte_le then
    return jsonb_build_object(
      'status', 'stale',
      'compteLeEnBase', v_compte_base,
      'compteLeSoumis', p_compte_le
    );
  end if;

  -- Conversion gardée : une valeur non numérique dans une ligne ne doit pas
  -- faire échouer la saisie (erreur permanente = file bloquée sur l'appareil).
  v_prix  := case when jsonb_typeof(v_ligne->'prixUnit') = 'number' then (v_ligne->>'prixUnit')::numeric else 0 end;
  v_theo  := case when jsonb_typeof(v_ligne->'stockTheo') = 'number' then (v_ligne->>'stockTheo')::numeric else 0 end;
  v_ecart := p_stock_reel - v_theo;

  -- 4. Fusion : seule la ligne visée change, l'ordre du tableau est conservé.
  select jsonb_agg(
           case when elem->>'id' = p_ligne_id
                then elem || jsonb_build_object(
                       'stockReel',   p_stock_reel,
                       'ecart',       round(v_ecart, 2),
                       'valeur',      round(p_stock_reel * v_prix, 2),
                       'ecartValeur', round(v_ecart * v_prix, 2),
                       'compteLe',    to_char(p_compte_le at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                     )
                else elem
           end
           order by ord
         )
    into v_lignes
    from jsonb_array_elements(coalesce(v_inv.lignes, '[]'::jsonb)) with ordinality as t(elem, ord);

  select coalesce(round(sum(case when jsonb_typeof(elem->'valeur') = 'number' then (elem->>'valeur')::numeric else 0 end), 2), 0)
    into v_total
    from jsonb_array_elements(v_lignes) as elem;

  -- updated_at est posé par trg_inventaires_updated.
  update inventaires
     set lignes = v_lignes,
         valeur_totale = v_total
   where id = p_inventaire_id
  returning * into v_inv;

  update inventaire_saisies_offline
     set applique = true
   where client_uuid = p_client_uuid;

  return jsonb_build_object('status', 'applied', 'inventaire', to_jsonb(v_inv));
end;
$function$;

-- Nouvelle fonction : réservée aux utilisateurs authentifiés (auth.uid() est de
-- toute façon requis dans le corps). Le revoke anon est explicite car les
-- default privileges du schéma posent un grant DIRECT à anon à la création, que
-- « revoke from public » ne retire pas (advisor 0028).
revoke all on function public.inventaire_saisir_stock(text, text, numeric, timestamptz, uuid) from public;
revoke execute on function public.inventaire_saisir_stock(text, text, numeric, timestamptz, uuid) from anon;
grant execute on function public.inventaire_saisir_stock(text, text, numeric, timestamptz, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (à exécuter tel quel pour revenir à l'état précédent) :
--
-- drop function if exists public.inventaire_saisir_stock(text, text, numeric, timestamptz, uuid);
-- drop table if exists public.inventaire_saisies_offline;
--
-- Le front retombe alors sur l'écriture historique de l'inventaire entier
-- (repli PGRST202 dans inventaireSync.js) : la saisie continue de fonctionner.
-- ─────────────────────────────────────────────────────────────────────────────
