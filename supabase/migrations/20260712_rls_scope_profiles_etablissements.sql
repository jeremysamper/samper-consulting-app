-- ═══════════════════════════════════════════════════════════════════════════
-- Fuite cross-tenant : profiles et etablissements étaient lisibles par TOUT
-- utilisateur authentifié (politique SELECT USING (true)), le filtrage n'étant
-- fait que côté client. Résultat prouvé (harness RLS par rôle, begin/rollback) :
-- un patron/cuisinier/resp_cuisine d'un établissement recevait dans la réponse
-- serveur brute les 3 autres établissements + les profils (emails, rôles,
-- etablissement_ids) des autres tenants — sur REST comme sur Realtime
-- (les deux tables sont dans la publication supabase_realtime).
--
-- Correctif : la défense passe côté serveur. Le filtrage client existant reste
-- en place mais n'est plus la seule barrière.
--   * etablissements : lecture limitée au périmètre du user ; le consultant
--     conserve l'accès total (identique à etabs_write, role = consultant).
--   * profiles : soi-même OU au moins un établissement en commun ; consultant
--     = tout. Un helper SECURITY DEFINER évite la récursion RLS (la politique
--     de profiles interroge profiles).
--
-- Compromis assumés (v1, validés avec Jérémy) :
--   * L'exposition des emails ENTRE collègues d'un même établissement reste
--     acceptée — on ne durcit pas plus en v1.
--   * Un utilisateur ayant quitté l'établissement (plus d'intersection
--     etablissement_ids) devient invisible pour un non-consultant alors que son
--     id subsiste sur des lignes (declare_par, valide_par, operateur_id,
--     user_id de shift…). Le fallback d'affichage propre est traité CÔTÉ FRONT
--     (commit séparé) — pas de champ vide ni de crash.
--
-- BRIEF 3 (audit sécurité) — NE PAS traiter ici : les politiques SELECT
-- USING (true) restantes sont des RÉFÉRENTIELS GLOBAUX assumés
-- (app_settings, permissions, pos_providers, module_labels). Elles ne portent
-- pas de donnée rattachée à un tenant et sont laissées en l'état volontairement,
-- à re-vérifier dans l'audit sécurité dédié, pas dans ce chantier.
--
-- Idempotent : CREATE OR REPLACE FUNCTION + ALTER POLICY rejouables sans erreur.
-- Rollback fourni en regard (bloc commenté en fin de fichier).
-- ═══════════════════════════════════════════════════════════════════════════

-- Périmètre d'établissements du user courant. SECURITY DEFINER : lit profiles
-- en contournant la RLS → utilisable dans la politique de profiles sans récursion
-- (même pattern que current_user_role()). search_path figé, forme (select ...)
-- pour l'évaluation InitPlan (une fois par requête, pas par ligne).
create or replace function public.current_user_etab_ids()
returns text[]
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(
    (select etablissement_ids from profiles where id = auth.uid()::text limit 1),
    array[]::text[]
  );
$function$;

grant execute on function public.current_user_etab_ids() to authenticated, anon;

-- etablissements : le consultant garde tout (comme etabs_write) ; sinon périmètre.
alter policy etabs_read on public.etablissements
  using (
    current_user_role() = 'consultant'
    or user_can_access_etab(id)
  );

-- profiles : consultant = tout ; sinon soi-même OU établissement en commun.
alter policy profiles_read on public.profiles
  using (
    current_user_role() = 'consultant'
    or id = (select auth.uid())::text
    or etablissement_ids && current_user_etab_ids()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (à exécuter tel quel pour revenir à l'état précédent) :
--
-- alter policy etabs_read on public.etablissements using (true);
-- alter policy profiles_read on public.profiles using (true);
-- drop function if exists public.current_user_etab_ids();
-- ─────────────────────────────────────────────────────────────────────────────
