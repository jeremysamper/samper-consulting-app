-- ═══════════════════════════════════════════════════════════════════════════
-- Modifications de produits d'inventaire HORS-LIGNE : ajout, nom, catégorie,
-- unité, prix, zones, annulation d'une saisie, suppression.
--
-- Même principe que la saisie des quantités (20260810, 20261106) : on compte
-- et on range en chambre froide, sans réseau. L'appareil met chaque
-- modification en file (IndexedDB) et la rejoue au retour du réseau. Rejouer
-- l'inventaire entier écraserait ce qui a bougé entre-temps : la RPC fusionne
-- UNE ligne dans l'état courant, sous FOR UPDATE.
--
--   * inventaire_modifs_offline : journal, client_uuid PRIMARY KEY (idempotence).
--   * inventaire_modifier_ligne : 'ajout' (la ligne n'est ajoutée qu'une fois),
--     'maj' (seules les clés produit, categorie, unite, prixUnit, zone, zones ;
--     une valeur null retire la clé ; les zones suivent la règle de zones.js :
--     la quantité comptée suit le produit), 'annuler_saisie' (refusée en
--     'stale' si le produit a été recompté après le geste), 'suppression'.
--     Écarts, valeur de la ligne et valeur totale recalculés.
--
-- SECURITY INVOKER : la RLS d'inventaires (user_can_access_etab) reste la règle.
-- Un inventaire validé n'est plus modifié (comme à l'écran).
-- Expand seulement, rejouable.
-- Rollback : drop function public.inventaire_modifier_ligne(text, text, text, jsonb, timestamptz, uuid);
--            drop table public.inventaire_modifs_offline;
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.inventaire_modifs_offline (
  client_uuid      uuid primary key,
  inventaire_id    text not null,
  ligne_id         text not null,
  operation        text not null,
  valeurs          jsonb not null default '{}'::jsonb,
  fait_le          timestamptz not null,
  user_id          text not null,
  etablissement_id text,
  applique         boolean not null default false,
  created_at       timestamptz not null default now()
);

create index if not exists idx_inventaire_modifs_offline_user
  on public.inventaire_modifs_offline (user_id, created_at desc);

alter table public.inventaire_modifs_offline enable row level security;

drop policy if exists inventaire_modifs_offline_select_own on public.inventaire_modifs_offline;
create policy inventaire_modifs_offline_select_own
  on public.inventaire_modifs_offline
  for select
  using (user_id = (select auth.uid())::text);

drop policy if exists inventaire_modifs_offline_insert_own on public.inventaire_modifs_offline;
create policy inventaire_modifs_offline_insert_own
  on public.inventaire_modifs_offline
  for insert
  with check (user_id = (select auth.uid())::text);

drop policy if exists inventaire_modifs_offline_update_own on public.inventaire_modifs_offline;
create policy inventaire_modifs_offline_update_own
  on public.inventaire_modifs_offline
  for update
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

revoke all on table public.inventaire_modifs_offline from anon;

create or replace function public.inventaire_modifier_ligne(
  p_inventaire_id text,
  p_ligne_id      text,
  p_operation     text,
  p_valeurs       jsonb,
  p_fait_le       timestamptz,
  p_client_uuid   uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id  text := auth.uid()::text;
  v_val      jsonb := coalesce(p_valeurs, '{}'::jsonb);
  v_inv      inventaires;
  v_ligne    jsonb;
  v_cle      text;
  v_avant    text;
  v_zones    jsonb;
  v_n        int;
  v_par      jsonb;
  v_garde    jsonb;
  v_zone     text;
  v_le       timestamptz;
  v_prix     numeric;
  v_theo     numeric;
  v_reel     numeric;
  v_lignes   jsonb;
  v_total    numeric;
  v_fait_txt text;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  if p_client_uuid is null or p_fait_le is null or coalesce(p_ligne_id, '') = '' then
    raise exception 'client_uuid, fait_le et ligne_id sont requis';
  end if;
  if p_operation is null or p_operation not in ('ajout', 'maj', 'annuler_saisie', 'suppression') then
    raise exception 'Opération inconnue : %', p_operation;
  end if;

  v_fait_txt := to_char(p_fait_le at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

  select * into v_inv from inventaires where id = p_inventaire_id for update;
  if v_inv.id is null then
    return jsonb_build_object('status', 'not_applied', 'raison', 'inventaire_absent');
  end if;
  if v_inv.statut = 'validé' then
    return jsonb_build_object('status', 'not_applied', 'raison', 'inventaire_valide');
  end if;

  insert into inventaire_modifs_offline
    (client_uuid, inventaire_id, ligne_id, operation, valeurs, fait_le, user_id, etablissement_id)
  values
    (p_client_uuid, p_inventaire_id, p_ligne_id, p_operation, v_val, p_fait_le, v_user_id, v_inv.etablissement_id)
  on conflict (client_uuid) do nothing;
  if not found then
    return jsonb_build_object('status', 'duplicate');
  end if;

  select elem into v_ligne
    from jsonb_array_elements(coalesce(v_inv.lignes, '[]'::jsonb)) as elem
   where elem->>'id' = p_ligne_id
   limit 1;

  if p_operation = 'ajout' then
    if v_ligne is not null then
      update inventaire_modifs_offline set applique = true where client_uuid = p_client_uuid;
      return jsonb_build_object('status', 'applied', 'raison', 'deja_presente');
    end if;
    v_ligne := v_val || jsonb_build_object('id', p_ligne_id);
  elsif v_ligne is null then
    return jsonb_build_object('status', 'not_applied', 'raison', 'ligne_absente');
  elsif p_operation = 'maj' then
    v_avant := case
      when jsonb_typeof(v_ligne->'zones') = 'array' and jsonb_array_length(v_ligne->'zones') > 0 then v_ligne->'zones'->>0
      else nullif(btrim(coalesce(v_ligne->>'zone', '')), '') end;
    for v_cle in select k from jsonb_object_keys(v_val) as t(k) loop
      if v_cle not in ('produit', 'categorie', 'unite', 'prixUnit', 'zone', 'zones') then
        continue;
      end if;
      if jsonb_typeof(v_val->v_cle) = 'null' then
        v_ligne := v_ligne - v_cle;
      else
        v_ligne := v_ligne || jsonb_build_object(v_cle, v_val->v_cle);
      end if;
    end loop;

    -- Zones : règle de zones.js (avecZones). La quantité comptée suit le produit.
    if v_val ? 'zones' or v_val ? 'zone' then
      v_zones := case
        when jsonb_typeof(v_ligne->'zones') = 'array' and jsonb_array_length(v_ligne->'zones') > 0 then v_ligne->'zones'
        when nullif(btrim(coalesce(v_ligne->>'zone', '')), '') is not null then jsonb_build_array(v_ligne->>'zone')
        else '[]'::jsonb end;
      v_n := jsonb_array_length(v_zones);
      v_par := case when jsonb_typeof(v_ligne->'parZone') = 'object' then v_ligne->'parZone' end;
      if v_n <= 1 then
        v_ligne := v_ligne - 'zones';
        if v_n = 1 then
          v_ligne := v_ligne || jsonb_build_object('zone', v_zones->>0);
        else
          v_ligne := v_ligne - 'zone';
        end if;
        if v_par is not null then
          if v_n = 1 and v_par ? (v_zones->>0) then
            v_ligne := v_ligne || jsonb_build_object('stockReel', v_par->(v_zones->>0)->'q');
          end if;
          v_ligne := v_ligne - 'parZone';
        end if;
      else
        v_ligne := v_ligne || jsonb_build_object('zone', v_zones->>0, 'zones', v_zones);
        if v_par is not null then
          select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_garde
            from jsonb_each(v_par) as e(k, v) where v_zones ? k;
          if v_garde = '{}'::jsonb then
            v_ligne := (v_ligne - 'parZone') || jsonb_build_object('stockReel', null);
          else
            v_ligne := v_ligne || jsonb_build_object('parZone', v_garde, 'stockReel',
              (select round(sum(case when jsonb_typeof(v->'q') = 'number' then (v->>'q')::numeric else 0 end), 4) from jsonb_each(v_garde) as e(k, v)));
          end if;
        elsif jsonb_typeof(v_ligne->'stockReel') = 'number' then
          v_ligne := v_ligne || jsonb_build_object('parZone', jsonb_build_object(
            case when v_avant is not null and v_zones ? v_avant then v_avant else v_zones->>0 end,
            jsonb_build_object('q', v_ligne->'stockReel', 'le', coalesce(nullif(v_ligne->>'compteLe', ''), v_fait_txt))));
        end if;
      end if;
    end if;
  elsif p_operation = 'annuler_saisie' then
    v_zone := nullif(btrim(coalesce(v_val->>'zone', '')), '');
    if v_zone is not null and jsonb_typeof(v_ligne->'parZone') = 'object' and (v_ligne->'parZone') ? v_zone then
      v_le := nullif(v_ligne->'parZone'->v_zone->>'le', '')::timestamptz;
      if v_le is not null and v_le > p_fait_le then
        return jsonb_build_object('status', 'stale');
      end if;
      v_par := (v_ligne->'parZone') - v_zone;
      v_ligne := v_ligne || jsonb_build_object(
        'parZone', v_par,
        'stockReel', (select round(sum(case when jsonb_typeof(v->'q') = 'number' then (v->>'q')::numeric end), 4) from jsonb_each(v_par) as e(k, v)),
        'compteLe', v_fait_txt);
    else
      v_le := nullif(v_ligne->>'compteLe', '')::timestamptz;
      if v_le is not null and v_le > p_fait_le then
        return jsonb_build_object('status', 'stale');
      end if;
      v_ligne := (v_ligne - 'parZone') || jsonb_build_object('stockReel', null, 'compteLe', v_fait_txt);
    end if;
  end if;

  if p_operation = 'suppression' then
    select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb) into v_lignes
      from jsonb_array_elements(coalesce(v_inv.lignes, '[]'::jsonb)) with ordinality as t(elem, ord)
     where elem->>'id' <> p_ligne_id;
  else
    -- Écart et valeur de la ligne, comme recalcInventaire (inventaireLignes.js).
    v_prix := case when jsonb_typeof(v_ligne->'prixUnit') = 'number' then (v_ligne->>'prixUnit')::numeric else 0 end;
    v_theo := case when jsonb_typeof(v_ligne->'stockTheo') = 'number' then (v_ligne->>'stockTheo')::numeric else 0 end;
    if jsonb_typeof(v_ligne->'stockReel') = 'number' then
      v_reel := (v_ligne->>'stockReel')::numeric;
      v_ligne := v_ligne || jsonb_build_object(
        'ecart', round(v_reel - v_theo, 2),
        'valeur', round(v_reel * v_prix, 2),
        'ecartValeur', round((v_reel - v_theo) * v_prix, 2));
    else
      v_ligne := v_ligne || jsonb_build_object('stockReel', null, 'ecart', null, 'valeur', 0, 'ecartValeur', 0);
    end if;

    if p_operation = 'ajout' then
      v_lignes := coalesce(v_inv.lignes, '[]'::jsonb) || jsonb_build_array(v_ligne);
    else
      select jsonb_agg(case when elem->>'id' = p_ligne_id then v_ligne else elem end order by ord) into v_lignes
        from jsonb_array_elements(coalesce(v_inv.lignes, '[]'::jsonb)) with ordinality as t(elem, ord);
    end if;
  end if;

  select coalesce(round(sum(case when jsonb_typeof(elem->'valeur') = 'number' then (elem->>'valeur')::numeric else 0 end), 2), 0)
    into v_total
    from jsonb_array_elements(v_lignes) as elem;

  update inventaires
     set lignes = v_lignes,
         valeur_totale = v_total
   where id = p_inventaire_id;

  update inventaire_modifs_offline set applique = true where client_uuid = p_client_uuid;

  return jsonb_build_object('status', 'applied');
end;
$$;

revoke all on function public.inventaire_modifier_ligne(text, text, text, jsonb, timestamptz, uuid) from public;
revoke execute on function public.inventaire_modifier_ligne(text, text, text, jsonb, timestamptz, uuid) from anon;
grant execute on function public.inventaire_modifier_ligne(text, text, text, jsonb, timestamptz, uuid) to authenticated;
