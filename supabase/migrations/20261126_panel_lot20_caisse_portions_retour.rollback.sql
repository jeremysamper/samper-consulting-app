-- ============================================================================
-- Rollback du lot 20 du panel : 20261126_panel_lot20_caisse_portions_retour.sql
--
-- À jouer après le retour du front, jamais avant. Remet les deux fonctions
-- dans leur texte du lot 12, relevé en production le 26.11.2026 avant la
-- migration (pg_get_functiondef, empreintes md5
-- f3e1709ebf8110307ed3f653a2fdc3c9 pour caisse_poser_disponibilite et
-- 52a021a1f9d402745594e780fa54ff18 pour caisse_ligne_portions), puis retire
-- la colonne portions_posees_a, que plus rien ne lit ensuite.
-- ============================================================================

set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.caisse_poser_disponibilite(p_etablissement_id text, p_plat_id text, p_etat text, p_portions integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_role text;
  v_jour date := (now() at time zone 'Europe/Zurich')::date;
  v_rupture date;
  v_epuise boolean := false;
  v_portions_le date;
  v_restantes integer;
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

  if p_etat = 'en_vente' then
    null;
  elsif p_etat = 'rupture_jour' then
    v_rupture := v_jour;
  elsif p_etat = 'epuise' then
    v_epuise := true;
    v_rupture := v_jour;
  elsif p_etat = 'portions' then
    if p_portions is null or p_portions < 1 or p_portions > 999 then
      raise exception 'caisse: nombre de portions invalide' using errcode = '22023';
    end if;
    v_portions_le := v_jour;
    v_restantes := p_portions;
  else
    raise exception 'caisse: etat de disponibilite inconnu' using errcode = '22023';
  end if;

  insert into public.caisse_boutons (etablissement_id, plat_id, rupture_le, epuise_durable, portions_le, portions_restantes)
  values (p_etablissement_id, p_plat_id, v_rupture, v_epuise, v_portions_le, v_restantes)
  on conflict (plat_id) do update
    set rupture_le = excluded.rupture_le,
        epuise_durable = excluded.epuise_durable,
        portions_le = excluded.portions_le,
        portions_restantes = excluded.portions_restantes
    where public.caisse_boutons.etablissement_id = excluded.etablissement_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'caisse: plat inconnu pour cet etablissement';
  end if;

  return jsonb_build_object(
    'etat', p_etat,
    'rupture_le', v_rupture,
    'epuise_durable', v_epuise,
    'portions_le', v_portions_le,
    'portions_restantes', v_restantes
  );
end;
$function$
;

alter function public.caisse_poser_disponibilite(text, text, text, integer) owner to postgres;
revoke all on function public.caisse_poser_disponibilite(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.caisse_poser_disponibilite(text, text, text, integer) to authenticated, service_role;
comment on function public.caisse_poser_disponibilite(text, text, text, integer) is
  'Lot 12 : pose en_vente, rupture_jour, epuise ou portions (1 à 999) sur un produit de la caisse. Consultant, patron, resp_cuisine, serveur.';

CREATE OR REPLACE FUNCTION public.caisse_ligne_portions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_plat text;
  v_ticket uuid;
  v_test boolean;
  v_delta integer;
  v_jour date;
  v_reste integer;
  v_n int;
begin
  if tg_op = 'DELETE' then
    v_plat := old.plat_id;
    v_ticket := old.ticket_id;
    v_delta := -ceil(coalesce(old.quantite, 0))::integer;
  elsif tg_op = 'INSERT' then
    v_plat := new.plat_id;
    v_ticket := new.ticket_id;
    v_delta := ceil(coalesce(new.quantite, 0))::integer;
  else
    v_plat := new.plat_id;
    v_ticket := new.ticket_id;
    v_delta := ceil(coalesce(new.quantite, 0))::integer - ceil(coalesce(old.quantite, 0))::integer;
  end if;

  if v_plat is null or v_delta = 0 then
    return null;
  end if;

  v_jour := (now() at time zone 'Europe/Zurich')::date;
  if not exists (
    select 1 from public.caisse_boutons b where b.plat_id = v_plat and b.portions_le = v_jour
  ) then
    return null;
  end if;

  select t.test into v_test from public.caisse_tickets t where t.id = v_ticket;
  if not found or coalesce(v_test, false) then
    return null;
  end if;

  if v_delta > 0 then
    update public.caisse_boutons b
       set portions_restantes = b.portions_restantes - v_delta,
           rupture_le = case when b.portions_restantes - v_delta = 0 then v_jour else b.rupture_le end
     where b.plat_id = v_plat
       and b.portions_le = v_jour
       and b.portions_restantes >= v_delta;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      select b.portions_restantes into v_reste
        from public.caisse_boutons b
       where b.plat_id = v_plat and b.portions_le = v_jour;
      if found and v_reste is not null then
        if v_reste <= 0 then
          raise exception 'caisse: il ne reste plus de portion de ce produit';
        elsif v_reste = 1 then
          raise exception 'caisse: il ne reste qu''une portion de ce produit';
        else
          raise exception 'caisse: il ne reste que % portions de ce produit', v_reste;
        end if;
      end if;
    end if;
  else
    update public.caisse_boutons b
       set portions_restantes = least(999, coalesce(b.portions_restantes, 0) - v_delta),
           rupture_le = null
     where b.plat_id = v_plat
       and b.portions_le = v_jour;
  end if;
  return null;
end;
$function$
;

alter function public.caisse_ligne_portions() owner to postgres;
revoke all on function public.caisse_ligne_portions() from public, anon, authenticated, service_role;
comment on function public.caisse_ligne_portions() is null;

alter table public.caisse_boutons drop column if exists portions_posees_a;
