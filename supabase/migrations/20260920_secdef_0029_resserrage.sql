-- ============================================================================
-- Advisor 0029 (authenticated_security_definer_function_executable)
-- Resserrage des fonctions SECURITY DEFINER appelables par `authenticated`
--
-- APPLIQUÉ EN PROD via MCP le 21.09.2026. Advisor après application : 9 WARN
-- 0029, celles listées en fin de fichier, rien d'autre. Miroir repo == prod.
--
-- Export Security Advisor du 20.09.2026 : 15 WARN 0029, 0 ERROR. Chaque
-- fonction a été relue (corps, ACL, dépendances par OID, appelants du dépôt et
-- de la base). Six alertes tombent pour de bon, neuf restent parce qu'elles
-- décrivent un choix d'architecture voulu (commentaires posés en fin de
-- fichier). La relecture a aussi sorti deux défauts, corrigés à part :
--   · 20260920_pointer_offline_retour_scope.sql : pointer_offline renvoyait le
--     shift d'un autre. À appliquer AVANT ou AVEC ce fichier, pour ne pas poser
--     le commentaire « voulu » sur un corps qui fuit encore.
--   · 20260921_profiles_verrou_champs_sensibles.sql : auto-promotion possible
--     via profiles. Prioritaire sur tout le reste.
--
--   A. Trois fonctions trigger : EXECUTE retiré à authenticated.
--      fn_autofill_brigade_couverts / fn_update_previsions_from_reservations /
--      fn_update_tags_critiques. PostgreSQL ne contrôle EXECUTE sur une
--      fonction trigger qu'au CREATE TRIGGER, jamais au déclenchement : le
--      grant ne sert à rien. Témoin dans cette base : handle_new_user n'a de
--      grant que pour postgres et service_role et se déclenche à chaque
--      création de compte. SECURITY DEFINER reste nécessaire pour les deux
--      fonctions qui écrivent previsions_jour (inscriptible par consultant /
--      patron / resp_cuisine seulement, alors qu'un hôte crée des
--      réservations). fn_autofill_brigade_couverts ne fait que lire : laissée
--      telle quelle, candidate à INVOKER lors d'une passe ultérieure.
--
--   B. Deux RPC de lecture : passage en SECURITY INVOKER.
--      get_semaine_previsions / get_brigade_dashboard. Plus aucun appelant, ni
--      dans le dépôt (usePrevisionsSemaine lit la table directement) ni en
--      base. La RLS rend le même verdict que le contrôle fait à la main :
--      previsions_jour et brigade_services sont filtrées par
--      user_can_access_etab(etablissement_id) ; brigade_taches et
--      brigade_commandes par un EXISTS sur brigade_services, elle-même filtrée
--      de la même façon. Répétition begin/rollback du 20.09.2026 : 12 cas
--      (patron, cuisinier, consultant, compte sans profil ; établissement
--      propre, étranger, service absent), résultat ou exception identiques
--      avant et après.
--
--   C. user_can_write_planning() : passage en SECURITY INVOKER.
--      Créée comme garde de la policy shifts_write (accès établissement ET
--      rôle consultant / patron / resp_cuisine). Cette policy a été remplacée
--      depuis par shifts_select / insert / update / delete, qui ne testent
--      plus que l'établissement : la fonction n'a plus aucune dépendance. Son
--      corps ne fait qu'appeler current_user_role(), déjà SECURITY DEFINER :
--      INVOKER donne le même résultat, l'alerte tombe, et le helper reste
--      utilisable tel quel le jour où l'écriture des shifts sera de nouveau
--      réservée aux managers (chantier séparé, cf. commentaire posé plus bas).
--
-- Idempotente (revoke / alter rejouables, gardes to_regprocedure). Aucun
-- verrou de table : applicable pendant le service.
--
-- NE PAS REJOUER après ce fichier : 20260713_i1b (re-grant EXECUTE à
-- authenticated sur tout SECURITY DEFINER non trigger) ni 20260520 (recrée
-- les get_* en SECURITY DEFINER). Un DROP + CREATE de l'une de ces fonctions
-- rétablit aussi le grant par défaut à authenticated.
--
-- ROLLBACK :
--   grant execute on function public.fn_autofill_brigade_couverts() to authenticated;
--   grant execute on function public.fn_update_previsions_from_reservations() to authenticated;
--   grant execute on function public.fn_update_tags_critiques() to authenticated;
--   alter function public.get_semaine_previsions(text, date) security definer;
--   alter function public.get_brigade_dashboard(text) security definer;
--   alter function public.user_can_write_planning() security definer;
-- ============================================================================

-- ── A. Fonctions trigger ────────────────────────────────────────────────────
do $$
declare
  sig text;
  fn  regprocedure;
begin
  foreach sig in array array[
    'public.fn_autofill_brigade_couverts()',
    'public.fn_update_previsions_from_reservations()',
    'public.fn_update_tags_critiques()'
  ] loop
    fn := to_regprocedure(sig);
    if fn is null then
      raise notice 'Fonction % absente, rien à faire', sig;
      continue;
    end if;

    -- Le raisonnement ne vaut que pour une fonction trigger.
    if (select prorettype from pg_proc where oid = fn) <> 'trigger'::regtype then
      raise exception '% n''est pas une fonction trigger : revoke refusé', sig;
    end if;

    execute format('revoke execute on function %s from authenticated, anon, public', fn);
  end loop;
end $$;

-- ── B et C. La RLS (B) ou current_user_role() (C) font déjà le travail ──────
do $$
declare
  sig text;
  fn  regprocedure;
begin
  foreach sig in array array[
    'public.get_semaine_previsions(text, date)',
    'public.get_brigade_dashboard(text)',
    'public.user_can_write_planning()'
  ] loop
    fn := to_regprocedure(sig);
    if fn is null then
      raise notice 'Fonction % absente, rien à faire', sig;
      continue;
    end if;
    execute format('alter function %s security invoker', fn);
  end loop;
end $$;

-- ── Justifications posées en base ───────────────────────────────────────────
-- Neuf fonctions restent SECURITY DEFINER et appelables par authenticated, par
-- construction. L'advisor n'offre aucun acquittement par fonction : le
-- commentaire évite de refaire l'analyse au prochain audit.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('public.current_user_role()',
       'Helper RLS utilisé par la plupart des policies. SECURITY DEFINER pour lire profiles sans récursion RLS ; authenticated doit garder EXECUTE, les policies s''évaluent sous son rôle. Ne renvoie que le rôle de l''appelant. Advisor 0029 attendu.'),
      ('public.current_user_etab_ids()',
       'Helper RLS (profiles_read). SECURITY DEFINER pour lire profiles sans récursion RLS. Ne renvoie que les établissements de l''appelant. Advisor 0029 attendu.'),
      ('public.user_can_access_etab(text)',
       'Helper RLS utilisé par la quasi-totalité des policies. SECURITY DEFINER pour lire profiles sans récursion RLS. Ne répond que sur le périmètre de l''appelant (false pour un établissement étranger comme pour un identifiant inexistant). Advisor 0029 attendu.'),
      ('public.pointer_arrivee(text)',
       'RPC de pointage. N''écrit que pointage_debut, heure serveur Europe/Zurich, sur un shift dont user_id = auth.uid(). SECURITY DEFINER voulu pour que le pointage ne dépende pas de shifts_update, policy appelée à être resserrée (aujourd''hui ouverte à tout rôle de l''établissement). Advisor 0029 attendu.'),
      ('public.pointer_depart(text)',
       'RPC de pointage. N''écrit que pointage_fin, heure serveur Europe/Zurich, sur un shift dont user_id = auth.uid(). SECURITY DEFINER voulu pour que le pointage ne dépende pas de shifts_update, policy appelée à être resserrée (aujourd''hui ouverte à tout rôle de l''établissement). Advisor 0029 attendu.'),
      ('public.pointer_offline(text, text, timestamp with time zone, uuid, text)',
       'RPC de rejeu des pointages hors-ligne. SECURITY DEFINER voulu : pointages_offline n''a aucune policy d''écriture, le journal ne s''alimente que par cette fonction. Advisor 0029 attendu.'),
      ('public.kds_bump_item(uuid, boolean)',
       'RPC KDS. SECURITY DEFINER voulu : kds_order_items n''a aucune policy d''écriture, la fonction borne l''écriture aux colonnes de bump après contrôle établissement + rôle cuisine. Advisor 0029 attendu.'),
      ('public.kds_set_suite(uuid, boolean)',
       'RPC KDS. SECURITY DEFINER voulu : kds_order_items n''a aucune policy d''écriture, la fonction borne l''écriture à a_suivre après contrôle établissement + rôle cuisine. Advisor 0029 attendu.'),
      ('public.kds_complete_order(uuid, boolean)',
       'RPC KDS. SECURITY DEFINER voulu : kds_orders n''a aucune policy d''écriture, la fonction borne l''écriture à completed_at / completed_by après contrôle établissement + rôle cuisine. Advisor 0029 attendu.'),
      ('public.user_can_write_planning()',
       'Garde d''écriture du planning (consultant / patron / resp_cuisine), née avec la policy shifts_write. Plus aucune policy ne l''utilise depuis que shifts_insert / update / delete ne testent que l''établissement. SECURITY INVOKER depuis le 20.09.2026 (elle ne fait qu''appeler current_user_role()). À rebrancher telle quelle si l''écriture des shifts redevient réservée aux managers.')
    ) as t(sig, note)
  loop
    if to_regprocedure(r.sig) is not null then
      execute format('comment on function %s is %L', to_regprocedure(r.sig), r.note);
    end if;
  end loop;
end $$;

-- Vérification (doit renvoyer 9 fonctions : 3 helpers RLS, 3 pointer_*, 3 kds_*) :
--   select p.oid::regprocedure
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.prosecdef
--      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
--    order by 1;
