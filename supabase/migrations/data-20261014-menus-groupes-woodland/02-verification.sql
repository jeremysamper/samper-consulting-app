-- Après import : 14 menus, 459 lignes, par type et par saison.
select type_groupe, count(*) as menus,
       sum(jsonb_array_length(lignes)) as lignes,
       sum((select count(*) from jsonb_array_elements(lignes) l where l->>'saison' = 'ete')) as ete,
       sum((select count(*) from jsonb_array_elements(lignes) l where l->>'saison' = 'hiver')) as hiver,
       sum((select count(*) from jsonb_array_elements(lignes) l where l->>'platId' is not null)) as reliees
from public.groupe_menus
where etablissement_id = 'etab-2' and id like 'woodland-%'
group by type_groupe
order by type_groupe;

-- Empreinte des lignes (id, libellé, saison, régime, rubrique) par menu, à
-- comparer à celle calculée sur menus-woodland.json.
select id, md5(string_agg(
         concat_ws('|', l->>'id', l->>'libelle', coalesce(l->>'saison', ''), coalesce(l->>'regime', ''), coalesce(l->>'rubrique', '')),
         E'\n' order by o)) as empreinte
from public.groupe_menus, jsonb_array_elements(lignes) with ordinality as t(l, o)
where etablissement_id = 'etab-2' and id like 'woodland-%'
group by id
order by id;
