-- ============================================================================
-- HOTFIX SECURITE (Bloc 0 / brief 3, constat C1) - 2026-07-12
--
-- Ferme la fuite NON AUTHENTIFIEE via la vue SECURITY DEFINER
-- public.v_produits_avec_fourn. La vue (owner postgres, sans security_invoker)
-- contourne la RLS de produits / produit_fournisseurs / fournisseurs.
--
-- Etat avant (information_schema.role_table_grants) : anon ET authenticated
-- detenaient SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER sur
-- la vue. Preuve de la fuite (role anon, transaction annulee) : la vue renvoyait
-- 803 lignes (produits + prix d'achat + contacts fournisseurs, tous
-- etablissements) alors que les tables sous-jacentes en direct renvoyaient 0.
--
-- On retire donc TOUS les privileges a anon et authenticated (REVOKE ALL), pour
-- refleter exactement l'etat applique en prod. Seuls postgres et service_role
-- (cote serveur uniquement) conservent l'acces.
--
-- Tourniquet uniquement. Correctif structurel (DROP ou recreation en
-- security_invoker, qui ramenera aussi la vue sous controle de migration car
-- elle n'y figure aujourd'hui pas) = bloc C1 de la phase 2.
--
-- Vue confirmee inutilisee cote client (grep src/ + components/ + bundle = 0).
--
-- Idempotence / replay a froid : la vue n'etant creee par aucune migration, on
-- garde le REVOKE derriere un test d'existence (to_regclass) pour ne jamais
-- casser un rebuild from-scratch. REVOKE d'un privilege absent est deja un no-op.
--
-- ROLLBACK (retablir l'acces des utilisateurs connectes) :
--   GRANT SELECT ON public.v_produits_avec_fourn TO authenticated;
--   -- NE PAS re-grant a anon.
-- ============================================================================

do $$
begin
  if to_regclass('public.v_produits_avec_fourn') is not null then
    revoke all on public.v_produits_avec_fourn from anon;
    revoke all on public.v_produits_avec_fourn from authenticated;
  end if;
end $$;
