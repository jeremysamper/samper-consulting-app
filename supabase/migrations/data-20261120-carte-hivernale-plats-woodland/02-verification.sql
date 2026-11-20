-- Relevé après application, à comparer à l'essai à blanc :
-- 37 plats, 147 liens plat-fiche, empreinte 45f69ebdf39dccda9736675f8e07323a,
-- 67 plats sauvegardés, 104 fiches de la carte toutes sur un plat.
select
  (select count(*) from public.carte_plats where carte_id = 'carte-1795205208352-ym7p') plats,
  (select count(*) from public.plat_recettes pr
     join public.carte_plats cp on cp.plat_id = pr.plat_id
    where cp.carte_id = 'carte-1795205208352-ym7p') liens,
  (select md5(string_agg(r.nom || '>' || f.nom, E'\n' order by r.nom collate "C", f.nom collate "C"))
     from public.carte_plats cp
     join public.plat_recettes pr0 on pr0.plat_id = cp.plat_id and pr0.ordre = 0
     join public.recettes r on r.id = pr0.recette_id
     join public.plat_recettes pr on pr.plat_id = cp.plat_id
     join public.recettes f on f.id = pr.recette_id
    where cp.carte_id = 'carte-1795205208352-ym7p') empreinte,
  (select count(*) from sauvegarde.carte_hiver_20261120_plats) plats_sauvegardes,
  (select count(distinct pr.recette_id) from public.plat_recettes pr
     join public.carte_plats cp on cp.plat_id = pr.plat_id
    where cp.carte_id = 'carte-1795205208352-ym7p') fiches;
