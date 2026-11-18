-- ─────────────────────────────────────────────────────────────────────────────
-- Points & boutique : classement visible par l'équipe (17.11.2026).
--
-- Le brief d'origine (D14) écartait tout classement entre employés (pression
-- et nLPD). Jérémy le lève le 17.11.2026 (« Aussi l'équipe ») : chaque
-- participant voit le podium et le classement de son établissement.
--
-- Données minimales : prénom, initiale du nom, solde, et « moi » pour la
-- personne connectée. Aucun identifiant de profil ne sort.
-- Sont classés : les participants (points_participe : profil actif, rattaché,
-- rôle participant, non exclu) qui ont au moins un point, hors personnes
-- masquées du planning de l'établissement (planning_masques). Un solde à zéro
-- ne figure pas au classement de l'équipe.
-- Lecture : qui participe dans un établissement où les points sont allumés,
-- ou qui gère les points. Système éteint : aucune ligne.
--
-- Additive (une fonction neuve, aucune écriture) : compatible avec le front
-- déployé, qui ne l'appelle pas. Retour arrière :
--   drop function if exists public.points_classement(text);
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.points_classement(p_etab text)
returns table (prenom text, nom_initiale text, solde integer, moi boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid text := (select auth.uid())::text;
  v_reg public.points_reglages;
  v_lecteur boolean := false;
begin
  -- Gardes évaluées dans des variables, avant toute requête de résultat.
  if v_uid is null or not coalesce(public.user_can_access_etab(p_etab), false) then
    raise exception 'Accès réservé à l''équipe de cet établissement' using errcode = '42501';
  end if;
  select * into v_reg from public.points_reglages where etablissement_id = p_etab;
  if not found or not v_reg.actif then
    return;
  end if;
  v_lecteur := coalesce(public.points_participe(v_uid, p_etab, v_reg), false)
            or coalesce(public.points_gere(p_etab), false);
  if not v_lecteur then
    raise exception 'Le classement est réservé aux participants' using errcode = '42501';
  end if;

  return query
  select p.prenom::text,
         nullif(left(btrim(coalesce(p.nom, '')), 1), '')::text,
         s.total::integer,
         (p.id = v_uid)
  from public.profiles p
  cross join lateral (
    select coalesce(sum(m.points), 0) as total
    from public.points_mouvements m
    where m.etablissement_id = p_etab and m.user_id = p.id
  ) s
  where p_etab = any (coalesce(p.etablissement_ids, '{}'::text[]))
    and public.points_participe(p.id, p_etab, v_reg)
    and not exists (
      select 1 from public.planning_masques pm
      where pm.etablissement_id = p_etab and pm.user_id = p.id
    )
    and s.total > 0
  order by s.total desc, p.prenom nulls last;
end;
$fn$;

comment on function public.points_classement(text) is
  'Classement de l''équipe (prénom, initiale, solde, moi) pour les participants et qui gère ; masqués du planning et soldes nuls exclus.';

revoke execute on function public.points_classement(text) from public, anon;
grant execute on function public.points_classement(text) to authenticated;
