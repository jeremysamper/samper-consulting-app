-- Retour à l'état laissé par l'import du 20.11.2026 : un plat par fiche.
-- Retire des 37 plats les sous-fiches ajoutées, puis recrée les 67 plats de
-- sous-fiche avec leurs liens, depuis les tables du schéma sauvegarde.
begin;

delete from public.plat_recettes pr
using public.carte_plats cp
where cp.plat_id = pr.plat_id
  and cp.carte_id = 'carte-1795205208352-ym7p'
  and pr.recette_id in (select recette_id from sauvegarde.carte_hiver_20261120_plat_recettes);

insert into public.plats select * from sauvegarde.carte_hiver_20261120_plats on conflict (id) do nothing;
insert into public.carte_plats select * from sauvegarde.carte_hiver_20261120_carte_plats on conflict (id) do nothing;
insert into public.plat_recettes select * from sauvegarde.carte_hiver_20261120_plat_recettes on conflict (id) do nothing;

-- Attendu : 104 plats et 104 liens sur la carte.
select (select count(*) from public.carte_plats where carte_id = 'carte-1795205208352-ym7p') plats,
       (select count(*) from public.plat_recettes pr join public.carte_plats cp on cp.plat_id = pr.plat_id
         where cp.carte_id = 'carte-1795205208352-ym7p') liens;

commit;
