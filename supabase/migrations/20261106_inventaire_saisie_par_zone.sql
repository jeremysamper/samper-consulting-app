-- ═══════════════════════════════════════════════════════════════════════════
-- Saisie de stock PAR ZONE : un produit rangé à la fois au froid positif et au
-- froid négatif se compte dans chacune de ses zones.
--
-- La ligne garde UNE quantité (`stockReel`), qui reste la seule lue par les
-- écarts, la valeur, la consommation et les exports. Pour une ligne à
-- plusieurs zones, le détail vit dans `parZone` :
--   { "Froid positif": { "q": 2, "le": "2026-11-06T15:00:00Z" },
--     "Froid négatif": { "q": 3, "le": "2026-11-06T15:04:00Z" } }
-- et `stockReel` = somme des `q`.
--
-- Même contrat que inventaire_saisir_stock (20260810), dont celle-ci est la
-- variante par zone : journal idempotent par client_uuid, fusion d'UNE ligne
-- sous FOR UPDATE, arbitrage « le comptage le plus récent gagne » (ici zone par
-- zone, sur parZone.<zone>.le). SECURITY INVOKER : la RLS d'inventaires reste
-- la règle.
--
-- Expand seulement : une colonne nullable dans le journal, une fonction
-- nouvelle. inventaire_saisir_stock n'est pas touchée, le front déployé
-- continue de l'appeler. Rejouable sans effet de bord.
-- Rollback : drop function public.inventaire_saisir_stock_zone(text, text, text, numeric, timestamptz, uuid);
--            alter table public.inventaire_saisies_offline drop column if exists zone;
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.inventaire_saisies_offline add column if not exists zone text;

create or replace function public.inventaire_saisir_stock_zone(
  p_inventaire_id text,
  p_ligne_id      text,
  p_zone          text,
  p_stock_reel    numeric,
  p_compte_le     timestamptz,
  p_client_uuid   uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id  text := auth.uid()::text;
  v_inv      inventaires;
  v_ligne    jsonb;
  v_par_zone jsonb;
  v_le_base  timestamptz;
  v_reel     numeric;
  v_lignes   jsonb;
  v_prix     numeric;
  v_theo     numeric;
  v_ecart    numeric;
  v_total    numeric;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;

  if p_client_uuid is null or p_compte_le is null then
    raise exception 'client_uuid et compte_le sont requis';
  end if;

  if coalesce(btrim(p_zone), '') = '' then
    raise exception 'Zone requise';
  end if;

  if p_stock_reel is null or p_stock_reel < 0 then
    raise exception 'Quantité invalide : %', p_stock_reel;
  end if;

  select * into v_inv from inventaires where id = p_inventaire_id for update;

  if v_inv.id is null then
    return jsonb_build_object('status', 'not_applied', 'raison', 'inventaire_absent');
  end if;

  insert into inventaire_saisies_offline
    (client_uuid, inventaire_id, ligne_id, stock_reel, compte_le, user_id, etablissement_id, zone)
  values
    (p_client_uuid, p_inventaire_id, p_ligne_id, p_stock_reel, p_compte_le,
     v_user_id, v_inv.etablissement_id, p_zone)
  on conflict (client_uuid) do nothing;

  if not found then
    return jsonb_build_object('status', 'duplicate');
  end if;

  select elem into v_ligne
    from jsonb_array_elements(coalesce(v_inv.lignes, '[]'::jsonb)) as elem
   where elem->>'id' = p_ligne_id
   limit 1;

  if v_ligne is null then
    return jsonb_build_object('status', 'not_applied', 'raison', 'ligne_absente');
  end if;

  v_par_zone := case when jsonb_typeof(v_ligne->'parZone') = 'object' then v_ligne->'parZone' else '{}'::jsonb end;

  v_le_base := nullif(v_par_zone->p_zone->>'le', '')::timestamptz;
  if v_le_base is not null and v_le_base > p_compte_le then
    return jsonb_build_object(
      'status', 'stale',
      'compteLeEnBase', v_le_base,
      'compteLeSoumis', p_compte_le
    );
  end if;

  v_par_zone := v_par_zone || jsonb_build_object(p_zone, jsonb_build_object(
    'q',  p_stock_reel,
    'le', to_char(p_compte_le at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ));

  select coalesce(sum(case when jsonb_typeof(v->'q') = 'number' then (v->>'q')::numeric else 0 end), 0)
    into v_reel
    from jsonb_each(v_par_zone) as e(k, v);

  v_prix  := case when jsonb_typeof(v_ligne->'prixUnit') = 'number' then (v_ligne->>'prixUnit')::numeric else 0 end;
  v_theo  := case when jsonb_typeof(v_ligne->'stockTheo') = 'number' then (v_ligne->>'stockTheo')::numeric else 0 end;
  v_ecart := v_reel - v_theo;

  select jsonb_agg(
           case when elem->>'id' = p_ligne_id
                then elem || jsonb_build_object(
                       'parZone',     v_par_zone,
                       'stockReel',   v_reel,
                       'ecart',       round(v_ecart, 2),
                       'valeur',      round(v_reel * v_prix, 2),
                       'ecartValeur', round(v_ecart * v_prix, 2),
                       'compteLe',    to_char(greatest(p_compte_le, coalesce(nullif(elem->>'compteLe', '')::timestamptz, p_compte_le)) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
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
$$;

revoke all on function public.inventaire_saisir_stock_zone(text, text, text, numeric, timestamptz, uuid) from public;
revoke execute on function public.inventaire_saisir_stock_zone(text, text, text, numeric, timestamptz, uuid) from anon;
grant execute on function public.inventaire_saisir_stock_zone(text, text, text, numeric, timestamptz, uuid) to authenticated;
