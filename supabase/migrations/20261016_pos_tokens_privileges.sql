-- ============================================================================
-- 20261016_pos_tokens_privileges.sql  (J0 : sécurité des jetons Lightspeed)
--
-- Avant la première connexion Lightspeed :
--   1. Aucun rôle client (authenticated, anon) ne peut lire ni modifier les
--      jetons OAuth de pos_connections. Les Edge Functions (service_role,
--      bypass RLS et propriétaire des droits complets) ne sont pas touchées.
--   2. Les ventes par plat (pos_items, pos_sales, pos_item_recipe_mapping) ne
--      sont lisibles que par consultant, patron, resp_cuisine, cuisinier.
--
-- Relevé prod (16.10.2026, projet ppmtoiqgajwcdkbnrcll) :
--   - authenticated : DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE,
--     UPDATE au niveau table sur pos_connections ; anon : aucun droit.
--   - 14 colonnes : id, etablissement_id, provider_id, access_token_enc,
--     refresh_token_enc, token_expires_at, status, last_sync_at, last_error,
--     created_by, created_at, updated_at, ls_business_id,
--     ls_business_location_id.
--   - Tables POS vides (0 ligne), absentes de la publication supabase_realtime,
--     aucune vue ni fonction SQL ne les lit.
--   - Front : lectures par colonnes explicites seulement (id, etablissement_id,
--     status, token_expires_at, embed etablissements(nom)), aucune écriture.
--
-- Idempotent : revoke / grant / alter policy / comment peuvent être rejoués
-- sans effet de bord.
-- ============================================================================

-- ── 0. Garde : la liste de colonnes n'a pas bougé depuis le relevé ──────────
-- Le GRANT par colonne ci-dessous est écrit à la main : une colonne ajoutée
-- entre le relevé et l'application resterait invisible côté client sans que
-- personne ne s'en aperçoive. On s'arrête plutôt que de deviner.
do $$
declare
  v_attendu text[] := array[
    'access_token_enc','created_at','created_by','etablissement_id','id',
    'last_error','last_sync_at','ls_business_id','ls_business_location_id',
    'provider_id','refresh_token_enc','status','token_expires_at','updated_at'
  ];
  v_reel text[];
begin
  select array_agg(column_name::text order by column_name::text)
    into v_reel
    from information_schema.columns
   where table_schema = 'public' and table_name = 'pos_connections';
  if v_reel is distinct from v_attendu then
    raise exception 'pos_connections : colonnes inattendues %, revoir le GRANT par colonne', v_reel;
  end if;
end $$;

-- ── 1. pos_connections : plus aucun droit client sur les jetons ─────────────
-- REVOKE au niveau table retire aussi les droits par colonne du même type.
-- « all » couvre en plus TRUNCATE (qui ignore la RLS), REFERENCES et TRIGGER,
-- détenus aujourd'hui par authenticated et inutiles côté client.
revoke all privileges on table public.pos_connections from authenticated, anon;

-- Lecture par colonne : tout sauf access_token_enc et refresh_token_enc.
-- Aucun droit d'écriture côté client : seules les Edge Functions écrivent
-- (service_role). Les policies INSERT / UPDATE / DELETE existantes deviennent
-- inopérantes pour authenticated ; elles sont laissées en place (hors J0).
grant select (
  id,
  etablissement_id,
  provider_id,
  token_expires_at,
  status,
  last_sync_at,
  last_error,
  created_by,
  created_at,
  updated_at,
  ls_business_id,
  ls_business_location_id
) on table public.pos_connections to authenticated;

-- ── 2. Lecture des ventes réservée aux rôles cuisine et direction ───────────
-- Condition actuelle recopiée telle que pg_policies.qual la restitue le
-- 16.10.2026, plus le filtre de rôle. pos_connections_select est inchangée :
-- le bandeau caisse (usePosConnectionHealth) reste visible de tous les rôles.
-- ALTER POLICY plutôt que DROP + CREATE : les trois policies existent (vérifié
-- dans pg_policies), leur commande (SELECT), leur rôle (authenticated) et leur
-- type (permissive) ne changent pas, et aucune n'est absente, même un instant.

alter policy "pos_items_select" on public.pos_items
  using (
    (EXISTS ( SELECT 1
       FROM pos_connections pc
      WHERE ((pc.id = pos_items.pos_connection_id) AND user_can_access_etab(pc.etablissement_id))))
    and current_user_role() = any (array['consultant','patron','resp_cuisine','cuisinier'])
  );

alter policy "pos_sales_select" on public.pos_sales
  using (
    (EXISTS ( SELECT 1
       FROM (pos_items pi
         JOIN pos_connections pc ON ((pc.id = pi.pos_connection_id)))
      WHERE ((pi.id = pos_sales.pos_item_id) AND user_can_access_etab(pc.etablissement_id))))
    and current_user_role() = any (array['consultant','patron','resp_cuisine','cuisinier'])
  );

alter policy "pos_mapping_select" on public.pos_item_recipe_mapping
  using (
    (EXISTS ( SELECT 1
       FROM (pos_items pi
         JOIN pos_connections pc ON ((pc.id = pi.pos_connection_id)))
      WHERE ((pi.id = pos_item_recipe_mapping.pos_item_id) AND user_can_access_etab(pc.etablissement_id))))
    and current_user_role() = any (array['consultant','patron','resp_cuisine','cuisinier'])
  );

-- ── 3. Commentaires sur les colonnes de jetons ──────────────────────────────
comment on column public.pos_connections.access_token_enc is
  'Jeton d''accès OAuth Lightspeed. Lecture et écriture service_role seulement (Edge Functions). Droits client (authenticated, anon) retirés le 16.10.2026 (migration 20261016_pos_tokens_privileges).';
comment on column public.pos_connections.refresh_token_enc is
  'Jeton de rafraîchissement OAuth Lightspeed. Lecture et écriture service_role seulement (Edge Functions). Droits client (authenticated, anon) retirés le 16.10.2026 (migration 20261016_pos_tokens_privileges).';

-- ── 4. Contrôles d'application (lèvent une exception seulement en cas d'échec)
-- L'essai à blanc du 16.10.2026 a joué ce fichier deux fois dans une
-- transaction terminée par un bloc qui lève une exception à chaque sortie,
-- succès compris (serveur : 0 ligne de pos_sales, cuisinier : 1, sur des
-- données fictives annulées avec la transaction).
do $$
declare
  v_manque text;
begin
  if has_column_privilege('authenticated', 'public.pos_connections', 'access_token_enc', 'SELECT')
  or has_column_privilege('authenticated', 'public.pos_connections', 'refresh_token_enc', 'SELECT')
  or has_column_privilege('authenticated', 'public.pos_connections', 'access_token_enc', 'UPDATE')
  or has_column_privilege('authenticated', 'public.pos_connections', 'refresh_token_enc', 'UPDATE') then
    raise exception 'J0 : authenticated garde un droit sur une colonne de jeton';
  end if;
  if has_any_column_privilege('anon', 'public.pos_connections', 'SELECT')
  or has_any_column_privilege('anon', 'public.pos_connections', 'UPDATE')
  or has_table_privilege('authenticated', 'public.pos_connections', 'TRUNCATE') then
    raise exception 'J0 : anon garde un droit, ou authenticated garde TRUNCATE, sur pos_connections';
  end if;
  if not has_column_privilege('authenticated', 'public.pos_connections', 'status', 'SELECT') then
    raise exception 'J0 : authenticated a perdu la lecture de status';
  end if;
  if has_table_privilege('authenticated', 'public.pos_connections', 'UPDATE')
  or has_table_privilege('authenticated', 'public.pos_connections', 'INSERT')
  or has_table_privilege('authenticated', 'public.pos_connections', 'DELETE')
  or has_any_column_privilege('authenticated', 'public.pos_connections', 'UPDATE')
  or has_any_column_privilege('authenticated', 'public.pos_connections', 'INSERT') then
    raise exception 'J0 : authenticated garde un droit d''écriture sur pos_connections';
  end if;
  if not (has_column_privilege('service_role', 'public.pos_connections', 'refresh_token_enc', 'SELECT')
      and has_table_privilege('service_role', 'public.pos_connections', 'UPDATE')) then
    raise exception 'J0 : service_role a perdu ses droits (Edge Functions cassées)';
  end if;
  select string_agg(e.p, ', ')
    into v_manque
    from (values ('pos_items','pos_items_select'),
                 ('pos_sales','pos_sales_select'),
                 ('pos_item_recipe_mapping','pos_mapping_select')) as e(t, p)
    left join pg_policies p
      on p.schemaname = 'public' and p.tablename = e.t and p.policyname = e.p
     and p.cmd = 'SELECT'
     and p.qual like '%current_user_role()%'
     and p.qual like '%''cuisinier''%'
     and p.qual not like '%serveur%'
   where p.policyname is null;
  if v_manque is not null then
    raise exception 'J0 : filtre de rôle absent ou policy manquante : %', v_manque;
  end if;
end $$;

-- ============================================================================
-- ROLLBACK (à exécuter à la main, hors service, si besoin)
-- ----------------------------------------------------------------------------
-- -- 1. Droits d'origine d'authenticated sur pos_connections (anon n'en avait aucun)
-- -- (PG 17 : l'ACL d'origine était arwdDxtm, « m » = MAINTAIN)
-- grant select, insert, update, delete, truncate, references, trigger, maintain
--   on table public.pos_connections to authenticated;
--
-- -- 2. Policies de lecture d'origine (pg_policies.qual relevé le 16.10.2026)
-- alter policy "pos_items_select" on public.pos_items
--   using ((EXISTS ( SELECT 1
--      FROM pos_connections pc
--     WHERE ((pc.id = pos_items.pos_connection_id) AND user_can_access_etab(pc.etablissement_id)))));
--
-- alter policy "pos_sales_select" on public.pos_sales
--   using ((EXISTS ( SELECT 1
--      FROM (pos_items pi
--        JOIN pos_connections pc ON ((pc.id = pi.pos_connection_id)))
--     WHERE ((pi.id = pos_sales.pos_item_id) AND user_can_access_etab(pc.etablissement_id)))));
--
-- alter policy "pos_mapping_select" on public.pos_item_recipe_mapping
--   using ((EXISTS ( SELECT 1
--      FROM (pos_items pi
--        JOIN pos_connections pc ON ((pc.id = pi.pos_connection_id)))
--     WHERE ((pi.id = pos_item_recipe_mapping.pos_item_id) AND user_can_access_etab(pc.etablissement_id)))));
--
-- -- 3. Commentaires (facultatif)
-- comment on column public.pos_connections.access_token_enc  is null;
-- comment on column public.pos_connections.refresh_token_enc is null;
-- ============================================================================
