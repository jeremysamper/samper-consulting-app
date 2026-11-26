-- ============================================================================
-- Rollback du lot 12 du panel (disponibilité d'un produit de la caisse).
-- À jouer après le retour du front d'avant le lot, jamais avant : le front du
-- lot appelle caisse_poser_disponibilite.
-- Remet caisse_poser_rupture et caisse_qr_articles dans leur texte relevé en
-- production le 26.11.2026, retire le déclencheur, sa fonction, la fonction
-- neuve, la contrainte et les trois colonnes. Un épuisé ou un compteur posés
-- entre-temps sont perdus ; une rupture du jour reste (rupture_le).
-- ============================================================================

drop trigger if exists trg_caisse_ligne_portions on public.caisse_lignes;
drop function if exists public.caisse_ligne_portions();

create or replace function public.caisse_poser_rupture(p_etablissement_id text, p_plat_id text, p_rupture boolean)
 returns date
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
$function$;

drop function if exists public.caisse_poser_disponibilite(text, text, text, integer);

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
    from ranges r
    join public.caisse_categories c on c.id = r.categorie_id and c.etablissement_id = p_etab and coalesce(c.actif, true)
   where r.categorie_id = any(p_categories)
     and (r.prix_vente > 0
          or exists (select 1 from public.plat_formats f
                      where f.plat_id = r.id and f.etablissement_id = p_etab));
$function$;

alter table public.caisse_boutons drop constraint if exists caisse_boutons_portions_restantes_check;
alter table public.caisse_boutons drop column if exists portions_restantes;
alter table public.caisse_boutons drop column if exists portions_le;
alter table public.caisse_boutons drop column if exists epuise_durable;
