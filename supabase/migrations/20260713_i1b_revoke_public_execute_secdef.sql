-- ============================================================================
-- I1b — Fermeture de la porte PUBLIC sur les fonctions SECURITY DEFINER
--
-- APPLIQUÉ EN PROD via MCP le 13/07/2026 (après I1). Mirroir repo == prod.
--
-- Pourquoi : I1 retirait les grants explicites de anon, mais 15 fonctions
-- SECURITY DEFINER gardaient EXECUTE via le pseudo-rôle PUBLIC. anon étant
-- membre de PUBLIC, il pouvait encore les appeler (pointer_arrivee,
-- get_brigade_dashboard, …). Revoke anon seul était donc cosmétique sur les
-- fonctions : I1b ferme PUBLIC.
--
-- Sûreté : on garantit EXECUTE à authenticated sur les fonctions appelables
-- (hors triggers) AVANT de retirer anon + PUBLIC, pour ne casser ni la RLS
-- (current_user_role / current_user_etab_ids) ni les RPC applicatives. Les
-- fonctions trigger n'ont besoin d'aucun grant pour se déclencher. Idempotent.
--
-- ROLLBACK : re-grant ciblé uniquement (jamais à PUBLIC ni anon en masse).
-- ============================================================================

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig, (p.prorettype = 'trigger'::regtype) as is_trigger
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    if not r.is_trigger then
      execute format('grant execute on function %s to authenticated;', r.sig);
    end if;
    execute format('revoke execute on function %s from anon;', r.sig);
    execute format('revoke execute on function %s from public;', r.sig);
  end loop;
end $$;

-- Vérification (doit renvoyer 0) :
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.prosecdef
--     and has_function_privilege('anon', p.oid, 'EXECUTE');
