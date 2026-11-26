-- ============================================================================
-- Lot 20 du panel (26.11.2026) : le retour d'une portion au compteur du jour.
--
-- Le lot 12 rendait une portion à chaque ligne retirée (ou baissée) d'un
-- produit compté. Une ligne d'un ticket ouvert la veille, ou vendue avant que
-- la cuisine repose le compteur, relevait le compteur au-dessus du stock réel.
-- Désormais, une portion n'est rendue que si la ligne a été créée le jour de
-- Zurich du compteur, et après sa dernière pose. Sinon, la ligne se retire
-- sans toucher au compteur.
--
-- caisse_boutons ne gardait que le jour du compteur (portions_le) ; updated_at
-- bouge à chaque décompte. Une colonne neuve, portions_posees_a, garde
-- l'instant de la dernière pose, écrit par caisse_poser_disponibilite. Un
-- compteur posé avant cette migration n'a pas d'instant : seul le jour compte.
--
-- Migration additive et idempotente (expand seul). Le front en production lit
-- caisse_boutons par * (la colonne neuve est ignorée), appelle
-- caisse_poser_disponibilite et caisse_poser_rupture avec leurs signatures et
-- leurs retours, inchangés.
--
-- Définitions reprises depuis la production le 26.11.2026 (pg_get_functiondef,
-- empreintes md5 f3e1709ebf8110307ed3f653a2fdc3c9 et
-- 52a021a1f9d402745594e780fa54ff18), identiques au fichier
-- 20261126_panel_lot12_caisse_disponibilite.sql. Changent seulement : l'écriture
-- de portions_posees_a dans caisse_poser_disponibilite, et la condition du
-- retour dans caisse_ligne_portions.
--
-- Aucune policy, aucune table neuve. Ne touche ni le scellement, ni les gardes
-- de caisse_lignes, ni caisse_poser_rupture, ni caisse_qr_articles, ni le KDS.
-- Rollback : 20261126_panel_lot20_caisse_portions_retour.rollback.sql, à jouer
-- après le retour du front, jamais avant.
-- ============================================================================

-- Un verrou en attente ne bloque pas les ventes : l'application échoue et se rejoue.
set local lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 1. Instant de la dernière pose du compteur
-- ----------------------------------------------------------------------------
alter table public.caisse_boutons add column if not exists portions_posees_a timestamptz;

comment on column public.caisse_boutons.portions_posees_a is
  'Lot 20 : instant de la dernière pose du compteur de portions ; une ligne créée avant ne rend pas de portion.';

-- ----------------------------------------------------------------------------
-- 2. caisse_poser_disponibilite : écrit l'instant de la pose
-- ----------------------------------------------------------------------------
-- Définition du lot 12, plus portions_posees_a : now() pour un compteur, nul
-- pour les trois autres états (la remise à zéro de la fin de journée passe
-- par en_vente, D1).
create or replace function public.caisse_poser_disponibilite(
  p_etablissement_id text, p_plat_id text, p_etat text, p_portions integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := auth.uid()::text;
  v_role text;
  v_jour date := (now() at time zone 'Europe/Zurich')::date;
  v_rupture date;
  v_epuise boolean := false;
  v_portions_le date;
  v_restantes integer;
  v_posees_a timestamptz;
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
    v_posees_a := now();
  else
    raise exception 'caisse: etat de disponibilite inconnu' using errcode = '22023';
  end if;

  insert into public.caisse_boutons (etablissement_id, plat_id, rupture_le, epuise_durable, portions_le, portions_restantes, portions_posees_a)
  values (p_etablissement_id, p_plat_id, v_rupture, v_epuise, v_portions_le, v_restantes, v_posees_a)
  on conflict (plat_id) do update
    set rupture_le = excluded.rupture_le,
        epuise_durable = excluded.epuise_durable,
        portions_le = excluded.portions_le,
        portions_restantes = excluded.portions_restantes,
        portions_posees_a = excluded.portions_posees_a
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
$$;

alter function public.caisse_poser_disponibilite(text, text, text, integer) owner to postgres;
revoke all on function public.caisse_poser_disponibilite(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.caisse_poser_disponibilite(text, text, text, integer) to authenticated, service_role;

comment on function public.caisse_poser_disponibilite(text, text, text, integer) is
  'Lot 12 : pose en_vente, rupture_jour, epuise ou portions (1 à 999) sur un produit de la caisse. Consultant, patron, resp_cuisine, serveur. Lot 20 : garde l''instant de la pose du compteur.';

-- ----------------------------------------------------------------------------
-- 3. caisse_ligne_portions : une portion rendue seulement pour une ligne du jour
-- ----------------------------------------------------------------------------
-- Définition du lot 12. Seul le retour (v_delta < 0) change : la ligne doit
-- avoir été créée le jour du compteur (jour de Zurich de created_at) et pas
-- avant sa dernière pose (portions_posees_a, ignoré quand il est nul). On lit
-- l'instant d'avant l'écriture (old.created_at, présent en DELETE comme en
-- UPDATE) : changer created_at dans la même écriture ne déplace pas la ligne.
-- Une ligne sans instant ne rend rien. Une hausse de quantité décompte
-- toujours, quel que soit l'âge de la ligne : servie aujourd'hui, elle prend
-- sur le stock d'aujourd'hui.
create or replace function public.caisse_ligne_portions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plat text;
  v_ticket uuid;
  v_test boolean;
  v_delta integer;
  v_jour date;
  v_reste integer;
  v_cree timestamptz;
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
    v_cree := old.created_at;
    update public.caisse_boutons b
       set portions_restantes = least(999, coalesce(b.portions_restantes, 0) - v_delta),
           rupture_le = null
     where b.plat_id = v_plat
       and b.portions_le = v_jour
       and v_cree is not null
       and (v_cree at time zone 'Europe/Zurich')::date = b.portions_le
       and (b.portions_posees_a is null or v_cree >= b.portions_posees_a);
  end if;
  return null;
end;
$$;

alter function public.caisse_ligne_portions() owner to postgres;
revoke all on function public.caisse_ligne_portions() from public, anon, authenticated, service_role;

comment on function public.caisse_ligne_portions() is
  'Lot 12 : décompte du compteur de portions du jour à chaque ligne de caisse. Lot 20 : une portion n''est rendue que pour une ligne créée le jour du compteur et après sa dernière pose.';
