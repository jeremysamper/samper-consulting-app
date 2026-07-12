-- ============================================================================
-- I2 — Durcissement des fonctions SECURITY DEFINER (brief 3)
--
-- 1) Les deux triggers d'auth (handle_new_user / handle_user_delete) sont
--    exposés en RPC via PostgREST : on retire leur EXECUTE à anon/authenticated.
--    Ils continuent de se déclencher normalement comme triggers (le déclenchement
--    n'exige pas de privilège EXECUTE pour le rôle courant).
-- 2) search_path explicite sur les fonctions SECURITY DEFINER qui en manquent
--    (advisor 0011 function_search_path_mutable).
--
-- Périmètre volontairement EXCLU : les helpers RLS (user_can_access_etab,
-- current_user_role, current_user_etab_ids) gardent leur EXECUTE — ils sont
-- évalués dans les politiques et le rôle authenticated en a besoin. Ils ne
-- renvoient que le périmètre de l'appelant (vide pour anon) → résidu justifié.
--
-- Idempotent + replay-safe : chaque objet est vérifié via to_regprocedure
-- avant action (aucune erreur si la fonction n'existe pas encore).
--
-- ROLLBACK :
--   grant execute on function public.handle_new_user()   to anon, authenticated;
--   grant execute on function public.handle_user_delete() to anon, authenticated;
--   -- et, si besoin : alter function <sig> reset search_path;  (par fonction)
-- ============================================================================

do $$
declare
  fn text;
  -- Fonctions à doter d'un search_path fixe (signatures exactes).
  sp_targets text[] := array[
    'public.pointer_arrivee(text)',
    'public.pointer_depart(text)',
    'public.user_can_write_planning()',
    'public.update_updated_at()',
    'public.set_updated_at()',
    'public.fn_update_previsions_from_reservations()',
    'public.fn_update_tags_critiques()',
    'public.fn_autofill_brigade_couverts()',
    'public.get_semaine_previsions(text, date)',
    'public.get_brigade_dashboard(text)'
  ];
begin
  -- 1) Triggers hors surface RPC
  if to_regprocedure('public.handle_new_user()') is not null then
    revoke execute on function public.handle_new_user() from anon, authenticated;
  end if;
  if to_regprocedure('public.handle_user_delete()') is not null then
    revoke execute on function public.handle_user_delete() from anon, authenticated;
  end if;

  -- 2) search_path explicite
  foreach fn in array sp_targets loop
    if to_regprocedure(fn) is not null then
      execute format('alter function %s set search_path = public, pg_temp', fn);
    end if;
  end loop;
end $$;
