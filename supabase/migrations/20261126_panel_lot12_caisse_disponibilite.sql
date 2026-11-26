-- ============================================================================
-- Lot 12 du panel (26.11.2026) : disponibilité d'un produit de la caisse.
--
-- Un produit a quatre états, exclusifs, posés par une seule fonction
-- (caisse_poser_disponibilite) : en vente, en rupture aujourd'hui, épuisé
-- jusqu'à nouvel arrivage, ou « il en reste N aujourd'hui ». Le compteur du
-- jour est décompté par un déclencheur sur caisse_lignes, qui refuse la ligne
-- de trop : deux postes ne vendent plus la dernière portion.
--
-- Migration additive et idempotente (expand seul). Le front en production ne
-- nomme aucune colonne neuve (upsertBouton choisit ses colonnes) et continue
-- d'appeler caisse_poser_rupture, gardée avec sa signature et son retour. Il
-- lit rupture_le : le déclencheur et la pose d'un épuisé écrivent aussi cette
-- colonne au jour de Zurich, pour que l'ancien écran grise le produit.
--
-- Définitions reprises depuis la production le 26.11.2026 (pg_get_functiondef),
-- identiques aux fichiers 20261122_caisse_rupture_rpc.sql et
-- 20261122_carte_boissons_formats.sql : caisse_poser_rupture et
-- caisse_qr_articles. Seule l'expression en_rupture change dans la seconde.
--
-- Ne touche ni le scellement (20261110_caisse_v7.sql), ni les gardes de
-- caisse_lignes, ni commande_qr_accepter, commande_qr_envoyer,
-- commande_qr_carte, ni le KDS. Aucune policy neuve ni modifiée.
-- Rollback : 20261126_panel_lot12_caisse_disponibilite.rollback.sql, à jouer
-- après le retour du front, jamais avant.
-- ============================================================================

-- Un verrou en attente ne bloque pas les ventes : l'application échoue et se rejoue.
set local lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 1. Colonnes de disponibilité sur caisse_boutons
-- ----------------------------------------------------------------------------
alter table public.caisse_boutons add column if not exists epuise_durable boolean not null default false;
alter table public.caisse_boutons add column if not exists portions_le date;
alter table public.caisse_boutons add column if not exists portions_restantes integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.caisse_boutons'::regclass
       and conname = 'caisse_boutons_portions_restantes_check'
  ) then
    alter table public.caisse_boutons
      add constraint caisse_boutons_portions_restantes_check
      check (portions_restantes is null or portions_restantes between 0 and 999);
  end if;
end $$;

comment on column public.caisse_boutons.epuise_durable is
  'Lot 12 : produit épuisé jusqu''à nouvel arrivage, indisponible tous les jours jusqu''à sa remise en vente.';
comment on column public.caisse_boutons.portions_le is
  'Lot 12 : jour de Zurich du compteur de portions ; un autre jour, le compteur ne compte pas.';
comment on column public.caisse_boutons.portions_restantes is
  'Lot 12 : portions restantes ce jour-là, décomptées par trg_caisse_ligne_portions.';

-- ----------------------------------------------------------------------------
-- 2. caisse_poser_disponibilite : pose l'un des quatre états
-- ----------------------------------------------------------------------------
-- Mêmes contrôles, dans le même ordre, que caisse_poser_rupture. Elle pose un
-- état, elle n'incrémente rien : deux appels identiques donnent le même
-- résultat. Elle n'écrit aucune colonne d'habillage.
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
$$;

alter function public.caisse_poser_disponibilite(text, text, text, integer) owner to postgres;
revoke all on function public.caisse_poser_disponibilite(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.caisse_poser_disponibilite(text, text, text, integer) to authenticated, service_role;

comment on function public.caisse_poser_disponibilite(text, text, text, integer) is
  'Lot 12 : pose en_vente, rupture_jour, epuise ou portions (1 à 999) sur un produit de la caisse. Consultant, patron, resp_cuisine, serveur.';

-- ----------------------------------------------------------------------------
-- 3. caisse_poser_rupture : même signature, même retour, cas particulier
-- ----------------------------------------------------------------------------
-- Vrai : rupture du jour. Faux : en vente, tout effacé (un épuisé et un
-- compteur aussi), pour que « Remettre en vente » de l'écran d'avant ne
-- laisse aucun état caché.
create or replace function public.caisse_poser_rupture(p_etablissement_id text, p_plat_id text, p_rupture boolean)
returns date
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_etat jsonb;
begin
  v_etat := public.caisse_poser_disponibilite(
    p_etablissement_id, p_plat_id,
    case when coalesce(p_rupture, false) then 'rupture_jour' else 'en_vente' end,
    null);
  return (v_etat->>'rupture_le')::date;
end;
$$;

revoke all on function public.caisse_poser_rupture(text, text, boolean) from public, anon;
grant execute on function public.caisse_poser_rupture(text, text, boolean) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Décompte des portions à chaque ligne posée, retirée ou changée
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER : le serveur n'écrit pas caisse_boutons par la RLS. Une
-- unité de ligne vaut une portion (D7) ; une quantité décimale prend une
-- portion entière (ceil, D15). Un ticket de test ne compte jamais (D8). Un
-- ticket introuvable (suppression en cascade) ne rend rien (D9). Le verrou de
-- ligne de l'update fait l'atomicité entre deux postes. Le refus est levé
-- sans errcode (P0001) pour que l'ancien écran montre le message tel quel.
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
  -- Sortie immédiate pour un produit sans compteur du jour : la vente passe.
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
$$;

alter function public.caisse_ligne_portions() owner to postgres;
revoke all on function public.caisse_ligne_portions() from public, anon, authenticated, service_role;

drop trigger if exists trg_caisse_ligne_portions on public.caisse_lignes;
create trigger trg_caisse_ligne_portions
  after insert or delete or update of quantite on public.caisse_lignes
  for each row execute function public.caisse_ligne_portions();

-- ----------------------------------------------------------------------------
-- 5. caisse_qr_articles : un produit épuisé ou au compteur vide est absent
-- ----------------------------------------------------------------------------
-- Même signature, mêmes colonnes rendues. Seul en_rupture change : vrai si
-- rupture_le vaut aujourd'hui à Zurich, ou épuisé durable, ou compteur du
-- jour à zéro. Ni le nombre ni epuise_durable ne sortent vers la page publique.
create or replace function public.caisse_qr_articles(p_etab text, p_categories uuid[])
 returns table(plat_id text, nom text, prix numeric, categorie_id uuid, photo_url text, en_rupture boolean)
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  with reglage as (
    select coalesce(
             (select array_agg(x) from jsonb_array_elements_text(
                case when jsonb_typeof(r.config->'cartes_ids') = 'array' then r.config->'cartes_ids' else '[]'::jsonb end) x),
             '{}'::text[]) as ids
      from (select 1) un
      left join public.caisse_reglages r on r.etablissement_id = p_etab
  ),
  en_vente as (
    select c.id
      from public.cartes c, reglage g
     where c.etablissement_id = p_etab
       and not coalesce(c.archive, false)
       and not coalesce(c.masquee, false)
       and (cardinality(g.ids) = 0 or c.id = any(g.ids))
  ),
  actifs as (
    select p.* from public.plats p
     where p.etablissement_id = p_etab and coalesce(p.actif, true)
  ),
  sur_carte as (
    select a.* from actifs a
     where exists (select 1 from public.carte_plats cp join en_vente v on v.id = cp.carte_id where cp.plat_id = a.id)
  ),
  articles as (
    select * from sur_carte
    union all
    select a.* from actifs a, reglage g
     where cardinality(g.ids) = 0 and not exists (select 1 from sur_carte)
  ),
  ranges as (
    select a.id, a.nom, a.prix_vente, a.photo_url as photo_plat, b.photo_url as photo_bouton, b.rupture_le,
           b.epuise_durable, b.portions_le, b.portions_restantes,
           coalesce(
             (select c.id from public.caisse_categories c
               where c.id = b.categorie_id and c.etablissement_id = p_etab),
             (select c.id from public.caisse_categories c
               where c.etablissement_id = p_etab
                 and lower(btrim(c.nom)) = lower(coalesce(nullif(btrim(a.categorie), ''), 'Plats'))
               order by c.ordre, c.nom limit 1)
           ) as categorie_id
      from articles a
      left join public.caisse_boutons b on b.plat_id = a.id and b.etablissement_id = p_etab
  )
  select r.id, r.nom,
         case when r.prix_vente > 0 then round(r.prix_vente, 2)
              else (select min(f.prix) from public.plat_formats f
                     where f.plat_id = r.id and f.etablissement_id = p_etab) end,
         r.categorie_id,
         case
           when coalesce(r.photo_bouton, r.photo_plat) like 'https://ppmtoiqgajwcdkbnrcll.supabase.co/storage/v1/object/public/%'
             then coalesce(r.photo_bouton, r.photo_plat)
         end,
         coalesce(r.rupture_le = (now() at time zone 'Europe/Zurich')::date, false)
           or coalesce(r.epuise_durable, false)
           or coalesce(r.portions_le = (now() at time zone 'Europe/Zurich')::date and r.portions_restantes <= 0, false)
    from ranges r
    join public.caisse_categories c on c.id = r.categorie_id and c.etablissement_id = p_etab and coalesce(c.actif, true)
   where r.categorie_id = any(p_categories)
     and (r.prix_vente > 0
          or exists (select 1 from public.plat_formats f
                      where f.plat_id = r.id and f.etablissement_id = p_etab));
$function$;
