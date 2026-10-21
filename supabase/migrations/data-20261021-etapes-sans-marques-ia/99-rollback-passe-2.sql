-- Annule la deuxième passe du 21.10.2026 (fiches des cartes créées avant le
-- 16.10 : étapes et/ou notes) à partir du journal d'activité. Ne touche pas
-- aux fiches du 16.10 (voir 99-rollback.sql). Une fiche retouchée depuis dans
-- l'app n'est pas remise en arrière : la requête finale la liste.
begin;

create temp table _j on commit drop as
select distinct on (ja.ligne_id) ja.ligne_id id, ja.avant, ja.apres, ja.colonnes_modifiees cols
from public.journal_activite ja
join public.recettes r on r.id = ja.ligne_id
where ja.module = 'recettes' and ja.operation = 'UPDATE' and ja.acteur_id is null
  and ja.etablissement_id = 'etab-2' and ja.created_at::date = '2026-10-21'
  and ja.colonnes_modifiees <@ array['etapes', 'notes_consultant']
  and r.created_at::date <> '2026-10-16'
order by ja.ligne_id, ja.created_at;

update public.recettes r
set etapes = case when 'etapes' = any(j.cols) then j.avant->'etapes' else r.etapes end,
    notes_consultant = case when 'notes_consultant' = any(j.cols) then j.avant->>'notes_consultant' else r.notes_consultant end
from _j j
where r.id = j.id and r.etablissement_id = 'etab-2'
  and (not ('etapes' = any(j.cols)) or r.etapes = j.apres->'etapes')
  and (not ('notes_consultant' = any(j.cols)) or r.notes_consultant = j.apres->>'notes_consultant');

select
  (select count(*) from _j) dans_le_journal,
  (select jsonb_agg(r.nom order by r.nom) from public.recettes r join _j j using (id)
    where ('etapes' = any(j.cols) and r.etapes is distinct from j.avant->'etapes')
       or ('notes_consultant' = any(j.cols) and r.notes_consultant is distinct from j.avant->>'notes_consultant')) retouchees_depuis;

commit;
