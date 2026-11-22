-- ════════════════════════════════════════════════════════════════════════════
-- Absences : demandes de congé par l'employé (lot L5)
-- ───────────────────────────────────────────────────────────────────────────
-- Jusqu'ici seule la direction posait une absence. Un employé peut maintenant
-- demander un congé depuis Mon planning : sa ligne naît en 'demande', la
-- personne qui gère le planning l'accepte ou la refuse, et une demande
-- acceptée devient une absence comme les autres.
--
-- Colonne statut ('demande', 'acceptee', 'refusee'), 'acceptee' par défaut :
-- toutes les lignes existantes restent des absences, et le front déployé, qui
-- n'envoie pas de statut, continue de poser des absences acceptées.
--
-- Droits :
--   - lecture : une absence acceptée reste lue par tout l'établissement ; une
--     demande ou un refus seulement par la personne concernée et par qui gère
--     le planning (la décision ne regarde pas l'équipe) ;
--   - création : qui gère le planning, comme avant ; un employé, pour lui-même
--     seulement, et en 'demande' seulement ;
--   - modification : qui gère le planning seul. Un employé ne peut donc ni
--     accepter sa propre demande ni la changer ;
--   - suppression : qui gère le planning ; un employé retire sa propre demande
--     tant qu'elle est en attente.
-- « Qui gère le planning » = user_peut_gerer('planning', ...) avec les rôles
-- par défaut d'avant (consultant, patron, resp_cuisine) : la règle des
-- horaires, des contrats et des groupes, et celle du front
-- (peutEcrirePlanning, gardesPlanning.js). Les politiques d'écriture d'avant
-- lisaient la liste de rôles seule.
--
-- points_programme (gestes des points) ne compte que les absences acceptées :
-- une demande en attente ou refusée ne retire pas le jour.
--
-- Migration additive et idempotente. Inverse :
-- 20261122_absences_demandes_conge.rollback.sql.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.absences
  add column if not exists statut text not null default 'acceptee';

alter table public.absences drop constraint if exists absences_statut_check;
alter table public.absences add constraint absences_statut_check
  check (statut in ('demande', 'acceptee', 'refusee'));

-- La colonne « À traiter » lit les demandes ouvertes d'un établissement.
create index if not exists idx_absences_etab_demandes
  on public.absences(etablissement_id) where statut = 'demande';

-- La RLS d'une personne (ses demandes, sa ligne) et la suppression en cascade
-- depuis profiles lisent user_id (relecture review-sql du 22.11.2026).
create index if not exists idx_absences_user
  on public.absences(user_id, date_debut);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists absences_select on public.absences;
create policy absences_select on public.absences
  for select to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (
      statut = 'acceptee'
      or user_id = (select auth.uid())::text
      or (select user_peut_gerer('planning', array['consultant','patron','resp_cuisine']))
    )
  );

drop policy if exists absences_insert on public.absences;
create policy absences_insert on public.absences
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and exists (
      select 1 from public.profiles p
      where p.id = absences.user_id
        and absences.etablissement_id = any(p.etablissement_ids)
    )
    and (
      (select user_peut_gerer('planning', array['consultant','patron','resp_cuisine']))
      or (
        statut = 'demande'
        and user_id = (select auth.uid())::text
        and created_by is not distinct from (select auth.uid())::text
      )
    )
  );

drop policy if exists absences_update on public.absences;
create policy absences_update on public.absences
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select user_peut_gerer('planning', array['consultant','patron','resp_cuisine']))
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select user_peut_gerer('planning', array['consultant','patron','resp_cuisine']))
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
    and (
      (select user_peut_gerer('planning', array['consultant','patron','resp_cuisine']))
      or (statut = 'demande' and user_id = (select auth.uid())::text)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Points : seules les absences acceptées retirent un jour programmé.
-- Corps repris de la version en base (20261115_points_shifts_retouche.sql),
-- seule la ligne « a.statut = 'acceptee' » s'ajoute.
-- ─────────────────────────────────────────────────────────────────────────────
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
             and a.statut = 'acceptee'
             and p_jour between a.date_debut and a.date_fin
         )
     and not exists (
           select 1 from public.reservation_en_ligne_parametres p
           where p.etablissement_id = p_etab
             and p_jour = any (coalesce(p.jours_fermes, '{}'::date[]))
         )
$fn$;

-- Droits d'exécution de 20261115_points_indicateurs.sql (postgres et
-- service_role seuls), reposés pour qu'un rejeu ne dépende pas de l'historique.
revoke execute on function public.points_programme(text, text, date) from public, anon, authenticated;

comment on column public.absences.statut is
  'demande (posée par l''employé, en attente), acceptee (absence, lue par tout l''établissement), refusee. Défaut acceptee : la direction pose une absence directement.';
