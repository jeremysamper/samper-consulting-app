-- Après 01-apply.sql : ce qui est en base doit égaler ce que l'essai à blanc
-- a produit le 21.10.2026 (options stations et desserts de carte actives).
--   liaisons fiche > plat  : 1166, empreinte 0e67c3b285b0005a97f863d9f69f968e
--   liaisons carte > plat  : 533,  empreinte 97b7a308ccb0f322d23057aa70c6a1f1
--   plats créés            : 261 (wl-ev-*) + 8 (wl-brunch-*)
--   recettes sans plat     : 6
select
  (select count(*) from public.cartes where id like 'carte-woodland-%') cartes_creees,
  (select count(*) from public.plats where id like 'wl-ev-%') plats_menus,
  (select count(*) from public.plats where id like 'wl-brunch-%') plats_brunch,
  (select count(*) from public.plat_recettes where plat_id like 'wl-%') liaisons_recettes,
  (select md5(string_agg(plat_id || '>' || recette_id, E'\n' order by plat_id, recette_id))
     from public.plat_recettes where plat_id like 'wl-%') empreinte_liaisons_recettes,
  (select count(*) from public.carte_plats
     where carte_id like 'carte-woodland-%' or carte_id = 'carte-1792552544043-wyiw') liaisons_cartes,
  (select md5(string_agg(carte_id || '>' || plat_id, E'\n' order by carte_id, plat_id))
     from public.carte_plats
     where carte_id like 'carte-woodland-%' or carte_id = 'carte-1792552544043-wyiw') empreinte_liaisons_cartes,
  (select count(*) from public.recettes r where r.etablissement_id = 'etab-2' and coalesce(r.statut, '') <> 'archivée'
     and not exists (select 1 from public.plat_recettes pr where pr.recette_id = r.id)) recettes_sans_plat;
