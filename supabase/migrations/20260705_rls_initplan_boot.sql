-- Optimisation RLS : auth.uid() était réévalué POUR CHAQUE LIGNE dans les
-- politiques ci-dessous (lint Supabase auth_rls_initplan). La forme
-- (select auth.uid()) est évaluée UNE seule fois par requête (InitPlan).
-- Sémantique strictement identique — gain de latence sur les tables lues
-- au boot (profiles, user_settings, module_labels) et à chaque module.
-- Idempotent : ALTER POLICY rejouable sans erreur.

alter policy profiles_self_update on public.profiles
  using (id = (select auth.uid())::text);

alter policy module_labels_select on public.module_labels
  using ((select auth.uid()) is not null);

alter policy users_can_write_own_settings on public.user_settings
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy consultants_can_write_compteurs on public.factures_compteurs
  using (exists (
    select 1 from profiles p
    where p.id = (select auth.uid())::text and p.role = 'consultant'
  ))
  with check (exists (
    select 1 from profiles p
    where p.id = (select auth.uid())::text and p.role = 'consultant'
  ));

alter policy alert_reads_own on public.alert_reads
  using ((select auth.uid())::text = user_id);
