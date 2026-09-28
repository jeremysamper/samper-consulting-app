-- ════════════════════════════════════════════════════════════════════════════
-- Absences : l'équipier doit appartenir à l'établissement de l'absence
-- ───────────────────────────────────────────────────────────────────────────
-- Suite de 20260929_absences_equipe.sql. Les policies d'écriture vérifiaient
-- l'établissement et le rôle de celui qui écrit, mais pas l'équipier visé :
-- user_id n'était contrôlé que par la clé étrangère vers profiles. Un
-- gestionnaire de l'établissement A pouvait donc poser une absence, rangée
-- sous A, pour un profil de l'établissement B. Aucune fuite vers B (la ligne
-- reste sous A), mais une donnée incohérente (audit rls-auditor, point 2c).
--
-- Correctif : INSERT et UPDATE exigent en plus que etablissement_id figure
-- dans profiles.etablissement_ids de l'équipier. Seuls les WITH CHECK changent :
-- les USING (lecture, suppression, lignes modifiables) restent identiques, pour
-- que la direction puisse toujours retirer une absence existante.
--
-- Le sous-select sur profiles passe par sa RLS (profiles_read, 20260712) :
-- consultant = tout, sinon établissement en commun. Un équipier d'un autre
-- établissement est donc invisible et le contrôle échoue, ce qui est voulu.
--
-- Compatible avec le front déployé : le Planning ne propose que les équipiers
-- dont etablissementIds contient l'établissement courant (Planning.jsx).
-- Conséquence assumée : la modification d'une absence d'un équipier qui a
-- quitté l'établissement est refusée (42501) ; la suppression reste possible.
--
-- Migration idempotente, à appliquer après 20260929_absences_equipe.sql.
-- Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

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

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter manuellement si besoin) : recréer absences_insert et
-- absences_update telles que dans 20260929_absences_equipe.sql (L.54-72),
-- c'est-à-dire sans le bloc « and exists (select 1 from public.profiles …) ».
-- ════════════════════════════════════════════════════════════════════════════
