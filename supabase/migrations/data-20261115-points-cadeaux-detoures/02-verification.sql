-- Points : photos détourées posées (33 par établissement), photos d'ambiance restantes (0 attendu).
select etablissement_id,
       count(*) filter (where photo_url like '%/cadeau-detoure-%' and photo_credit is not null and photo_source is not null) as detourees,
       count(*) filter (where photo_url like '%/cadeau-catalogue-%') as ambiance,
       count(*) filter (where photo_url is null) as picto,
       count(*) as cadeaux
from public.points_cadeaux
where etablissement_id in ('etab-2', 'etab-1777157340476')
group by etablissement_id
order by etablissement_id;
