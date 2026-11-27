-- Retour arrière de 20261127_roles_hotel_droits.sql : les rôles par défaut
-- reviennent à ceux d'avant (réception hors des réservations et des groupes,
-- gouvernante hors du planning) et la RPC chambre_remettre_en_service part.
-- À passer avant de revenir au front d'avant (expand/contract à l'envers :
-- le front d'avant n'appelle pas la RPC, il ne la regrette pas).

begin;

set local lock_timeout = '3s';

do $migration$
declare
  v_lots constant jsonb := '[
    {"module": "previsions", "roles": ["consultant", "patron", "resp_cuisine", "hote"], "ajout": "receptionniste"},
    {"module": "groupes", "roles": ["consultant", "patron", "resp_cuisine", "hote", "cuisinier"], "ajout": "receptionniste"},
    {"module": "planning", "roles": ["consultant", "patron", "resp_cuisine"], "ajout": "gouvernante"}
  ]';
  v_lot jsonb;
  v_ancien text;
  v_etendu text;
  v_roles text;
  v_pol record;
  v_sql text;
begin
  for v_lot in select * from jsonb_array_elements(v_lots) loop
    select string_agg(format('%L::text', r), ', ') into v_roles
      from jsonb_array_elements_text(v_lot->'roles') r;
    v_ancien := format('user_peut_gerer(%L::text, ARRAY[%s])', v_lot->>'module', v_roles);
    v_etendu := format('user_peut_gerer(%L::text, ARRAY[%s, %L::text])', v_lot->>'module', v_roles, v_lot->>'ajout');
    for v_pol in
      select tablename, policyname, qual, with_check from pg_policies
       where schemaname = 'public'
         and position(v_etendu in coalesce(qual, '') || coalesce(with_check, '')) > 0
    loop
      v_sql := format('alter policy %I on public.%I', v_pol.policyname, v_pol.tablename);
      if v_pol.qual is not null then
        v_sql := v_sql || format(' using (%s)', replace(v_pol.qual, v_etendu, v_ancien));
      end if;
      if v_pol.with_check is not null then
        v_sql := v_sql || format(' with check (%s)', replace(v_pol.with_check, v_etendu, v_ancien));
      end if;
      execute v_sql;
    end loop;
  end loop;
end
$migration$;

do $migration$
declare
  v_lots constant jsonb := '[
    {"fonction": "groupe_evenements_avant_maj", "ancien": "user_peut_gerer(''groupes'', array[''consultant'',''patron'',''resp_cuisine'',''hote'',''cuisinier''])", "nouveau": "user_peut_gerer(''groupes'', array[''consultant'',''patron'',''resp_cuisine'',''hote'',''cuisinier'',''receptionniste''])"},
    {"fonction": "echange_decider", "ancien": "user_peut_gerer(''planning'', array[''consultant'', ''patron'', ''resp_cuisine''])", "nouveau": "user_peut_gerer(''planning'', array[''consultant'', ''patron'', ''resp_cuisine'', ''gouvernante''])"},
    {"fonction": "peut_pointer_pour", "ancien": "user_peut_gerer(''planning'', array[''consultant'', ''patron'', ''resp_cuisine''])", "nouveau": "user_peut_gerer(''planning'', array[''consultant'', ''patron'', ''resp_cuisine'', ''gouvernante''])"},
    {"fonction": "planning_modeles_remplacer", "ancien": "user_peut_gerer(''planning'', array[''consultant'', ''patron'', ''resp_cuisine''])", "nouveau": "user_peut_gerer(''planning'', array[''consultant'', ''patron'', ''resp_cuisine'', ''gouvernante''])"}
  ]';
  v_lot jsonb;
  v_def text;
begin
  for v_lot in select * from jsonb_array_elements(v_lots) loop
    select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_lot->>'fonction';
    if position(v_lot->>'nouveau' in v_def) > 0 then
      execute replace(v_def, v_lot->>'nouveau', v_lot->>'ancien');
    end if;
  end loop;
end
$migration$;

drop function if exists public.chambre_remettre_en_service(uuid);

commit;
