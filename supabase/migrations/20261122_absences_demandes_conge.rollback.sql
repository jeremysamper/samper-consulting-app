-- ════════════════════════════════════════════════════════════════════════════
-- Inverse de 20261122_absences_demandes_conge.sql (à jouer à la main).
-- ───────────────────────────────────────────────────────────────────────────
-- Remet points_programme et les politiques telles qu'en base avant le lot L5
-- (relevé du 22.11.2026), puis retire la colonne statut. Les demandes en
-- attente et les refus sont supprimés d'abord : sans la colonne, ils
-- deviendraient des absences lues par toute l'équipe. À faire précéder d'un
-- retour du front à une version qui ne lit pas statut (Instant Rollback
-- Vercel), sinon les demandes de congé de l'écran échouent.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.points_programme(p_user text, p_etab text, p_jour date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
           select 1 from public.shifts s
           left join public.points_shifts_suivi su on su.shift_id = s.id
           where s.etablissement_id = p_etab
             and s.user_id = p_user
             and s.date = p_jour
             and s.debut <> s.fin
             and coalesce(s.note, '') <> 'Pointage hors planning'
             and lower(coalesce(s.statut, '')) not in ('annulé', 'annule', 'refusé', 'refuse')
             -- Planifié avant ce jour : un service créé ou placé ce jour-là (par
             -- exemple par un responsable pour lui-même) ne compte pas. L'heure
             -- vient du serveur (points_shifts_suivi), created_at seulement pour
             -- un service d'avant le suivi ou écrit par la maintenance.
             and coalesce(su.planifie_le, s.created_at, '-infinity'::timestamptz) < (p_jour::timestamp at time zone 'Europe/Zurich')
         )
     and not exists (
           select 1 from public.absences a
           where a.etablissement_id = p_etab
             and a.user_id = p_user
             and p_jour between a.date_debut and a.date_fin
         )
     and not exists (
           select 1 from public.reservation_en_ligne_parametres p
           where p.etablissement_id = p_etab
             and p_jour = any (coalesce(p.jours_fermes, '{}'::date[]))
         )
$fn$;

drop policy if exists absences_select on public.absences;
create policy absences_select on public.absences
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists absences_insert on public.absences;
create policy absences_insert on public.absences
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
    and exists (
      select 1 from public.profiles p
      where p.id = absences.user_id
        and absences.etablissement_id = any(p.etablissement_ids)
    )
  );

drop policy if exists absences_update on public.absences;
create policy absences_update on public.absences
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
    and exists (
      select 1 from public.profiles p
      where p.id = absences.user_id
        and absences.etablissement_id = any(p.etablissement_ids)
    )
  );

drop policy if exists absences_delete on public.absences;
create policy absences_delete on public.absences
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  );

delete from public.absences where statut <> 'acceptee';

drop index if exists public.idx_absences_etab_demandes;
drop index if exists public.idx_absences_user;
alter table public.absences drop constraint if exists absences_statut_check;
alter table public.absences drop column if exists statut;

commit;
