-- Points : photos du catalogue posées, par établissement (41 attendues chacun).
select etablissement_id,
       count(*) filter (where photo_url like '%/cadeau-catalogue-%') as photos_catalogue,
       count(*) filter (where photo_url is null) as sans_photo,
       count(*) as cadeaux
from public.points_cadeaux
where etablissement_id in ('etab-2', 'etab-1777157340476')
group by etablissement_id
order by etablissement_id;
