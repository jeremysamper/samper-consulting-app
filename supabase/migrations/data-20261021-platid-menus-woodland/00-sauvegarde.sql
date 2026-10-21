-- Sauvegarde des 14 menus de groupe de Woodland Village (etab-2), lignes
-- comprises, avant 01-apply.sql. Lecture seule.
--
-- Le texte JSON part en base64 pour traverser le connecteur sans qu'aucun
-- caractère soit réinterprété ; décodé, il est enregistré tel quel dans
-- App-Web/_sauvegardes-supabase/groupe-menus-woodland-avant-platid-20261021.json
-- (hors dépôt). Le md5 du fichier doit être égal à md5 ci-dessous.
--
-- empreinte_lignes_completes : la même que 02-verification.sql, pour relier
-- la sauvegarde à l'état vérifié.
select md5(t) md5, length(t) longueur,
       (select md5(string_agg(gm.id || ' ' || o.v::text, E'\n' order by gm.id, o.ord))
          from public.groupe_menus gm
          cross join lateral jsonb_array_elements(gm.lignes) with ordinality o(v, ord)
          where gm.etablissement_id = 'etab-2') empreinte_lignes_completes,
       encode(convert_to(t, 'UTF8'), 'base64') b64
from (
  select jsonb_agg(to_jsonb(gm) order by gm.id)::text t
  from public.groupe_menus gm
  where gm.etablissement_id = 'etab-2'
) s;
