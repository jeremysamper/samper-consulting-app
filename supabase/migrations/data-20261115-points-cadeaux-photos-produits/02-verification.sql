-- Points : photos de produits posées (41 par établissement, avec crédit et original).
select etablissement_id,
       count(*) filter (where photo_url like '%/cadeau-photo-%' and photo_credit is not null and photo_source is not null) as photos_produits,
       count(*) filter (where photo_url like '%/cadeau-detoure-%' or photo_url like '%/cadeau-catalogue-%') as anciennes,
       count(*) filter (where photo_url is null) as picto,
       count(*) as cadeaux
from public.points_cadeaux
where etablissement_id in ('etab-2', 'etab-1777157340476')
group by etablissement_id
order by etablissement_id;
