-- Vérification, lecture seule, hors transaction : à lancer avant et après
-- 01-apply.sql et à comparer aux valeurs du README.
--   empreinte_liaisons           après : celle de l'essai à blanc
--   empreinte_lignes_hors_platid avant = après (seul platId a bougé)
--   empreinte_menus_hors_lignes  avant = après
--   empreinte_lignes_completes   avant : celle de la sauvegarde ; après un
--                                retour arrière : de nouveau celle d'avant
with l as (
  select gm.id menu_id, o.ord, o.v, o.v->>'id' ligne_id, nullif(o.v->>'platId', '') plat_id
  from public.groupe_menus gm
  cross join lateral jsonb_array_elements(gm.lignes) with ordinality o(v, ord)
  where gm.etablissement_id = 'etab-2'
)
select jsonb_build_object(
  'lignes', (select count(*) from l),
  'liees', (select count(*) from l where plat_id is not null),
  'non_liees', (select count(*) from l where plat_id is null),
  'plats_introuvables', (select coalesce(jsonb_agg(distinct l.menu_id || ' ' || (l.v->>'libelle')), '[]'::jsonb) from l
       where l.plat_id is not null and not exists (select 1 from public.plats p where p.id = l.plat_id and p.etablissement_id = 'etab-2' and p.actif)),
  'fiches_sans_portions', (select coalesce(jsonb_agg(distinct r.nom), '[]'::jsonb) from l
       join public.plat_recettes pr on pr.plat_id = l.plat_id join public.recettes r on r.id = pr.recette_id
       where coalesce(r.statut, '') <> 'archivée' and not coalesce(r.portions > 0, false)),
  'tartelette', (select jsonb_agg(jsonb_build_object('id', l.ligne_id, 'saison', l.v->>'saison', 'plat', p.nom) order by l.ord)
       from l left join public.plats p on p.id = l.plat_id where l.ligne_id like 'mariage-0-mi-05%'),
  'paris_brest', (select l.plat_id from l where l.ligne_id = 'mariage-0-ga-15'),
  'empreinte_liaisons', (select md5(string_agg(ligne_id || '>' || coalesce(plat_id, '-'), E'\n' order by ligne_id)) from l),
  'empreinte_lignes_hors_platid', (select md5(string_agg(menu_id || ' ' || (case when ligne_id = 'mariage-0-mi-05' then v - 'platId' - 'saison' else v - 'platId' end)::text, E'\n' order by menu_id, ord))
       from l where ligne_id <> 'mariage-0-mi-05-hiver'),
  'empreinte_lignes_completes', (select md5(string_agg(menu_id || ' ' || v::text, E'\n' order by menu_id, ord)) from l),
  'empreinte_menus_hors_lignes', (select md5(string_agg((to_jsonb(gm) - 'lignes' - 'updated_at')::text, E'\n' order by gm.id))
       from public.groupe_menus gm where gm.etablissement_id = 'etab-2')
) r;
