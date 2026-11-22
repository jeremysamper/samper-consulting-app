-- ════════════════════════════════════════════════════════════════════════════
-- Caisse : les serveurs mettent aussi un produit en rupture (lot L2, suite,
-- 22.11.2026, décision de Jérémy : « Oui, les serveurs aussi »).
--
-- La RLS de caisse_boutons reste celle de l'habillage (écriture consultant,
-- patron, resp_cuisine) : un serveur ne change ni le nom court, ni la couleur,
-- ni le picto, ni la photo, ni la catégorie, ni le rang. La rupture passe par
-- cette RPC, qui n'écrit que rupture_le :
--   - appelant connecté, profil lu par auth.uid()::text ;
--   - rôle parmi consultant, patron, resp_cuisine, serveur ;
--   - établissement accessible (user_can_access_etab, comme la RLS) ;
--   - plat de cet établissement (et, en conflit, ligne de cet établissement).
-- Le jour de rupture est celui de Zurich côté serveur : l'horloge d'un poste
-- ne compte pas. p_rupture = false remet en vente (rupture_le à null).
-- Rend le jour posé (null pour une remise en vente).
--
-- SECURITY DEFINER : la fonction contourne la RLS d'écriture de
-- caisse_boutons, c'est son rôle ; elle ne décide jamais d'après current_user
-- (qui vaut son propriétaire), seulement d'après auth.uid().
--
-- Expand seul : le front en ligne écrit encore par l'upsert (rôles de
-- l'habillage) et ignore la fonction. Idempotente (create or replace).
-- Inverse : 20261122_caisse_rupture_rpc.rollback.sql
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.caisse_poser_rupture(
  p_etablissement_id text,
  p_plat_id text,
  p_rupture boolean
)
returns date
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := auth.uid()::text;
  v_role text;
  v_jour date;
  v_n int;
begin
  if v_uid is null then
    raise exception 'caisse: connexion requise' using errcode = '42501';
  end if;
  select p.role into v_role from public.profiles p where p.id = v_uid;
  if v_role is null or v_role not in ('consultant', 'patron', 'resp_cuisine', 'serveur') then
    raise exception 'caisse: rupture reservee' using errcode = '42501';
  end if;
  if p_etablissement_id is null or not public.user_can_access_etab(p_etablissement_id) then
    raise exception 'caisse: etablissement non autorise' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.plats pl where pl.id = p_plat_id and pl.etablissement_id = p_etablissement_id
  ) then
    raise exception 'caisse: plat inconnu pour cet etablissement';
  end if;

  v_jour := case when coalesce(p_rupture, false) then (now() at time zone 'Europe/Zurich')::date else null end;

  insert into public.caisse_boutons (etablissement_id, plat_id, rupture_le)
  values (p_etablissement_id, p_plat_id, v_jour)
  on conflict (plat_id) do update
    set rupture_le = excluded.rupture_le
    where public.caisse_boutons.etablissement_id = excluded.etablissement_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'caisse: plat inconnu pour cet etablissement';
  end if;
  return v_jour;
end;
$$;

revoke all on function public.caisse_poser_rupture(text, text, boolean) from public;
revoke all on function public.caisse_poser_rupture(text, text, boolean) from anon;
grant execute on function public.caisse_poser_rupture(text, text, boolean) to authenticated;

comment on function public.caisse_poser_rupture(text, text, boolean) is
  'Met un produit en rupture pour le jour de Zurich, ou le remet en vente. N''écrit que caisse_boutons.rupture_le. Consultant, patron, resp_cuisine, serveur.';
