-- Annule la réécriture du 21.10.2026 à partir du journal d'activité, qui a
-- gardé l'ancienne version des étapes de chaque fiche (colonne avant).
-- Une fiche retouchée depuis dans l'app n'est pas remise en arrière : sa
-- version actuelle n'est plus celle écrite par la réécriture (contrôle sur
-- apres). La requête finale liste ces fiches.
begin;

create temp table _j on commit drop as
select distinct on (ja.ligne_id) ja.ligne_id id, ja.avant->'etapes' avant, ja.apres->'etapes' apres
from public.journal_activite ja
join public.recettes r on r.id = ja.ligne_id
where ja.module = 'recettes' and ja.operation = 'UPDATE' and ja.colonnes_modifiees = array['etapes']
  and ja.acteur_id is null and ja.etablissement_id = 'etab-2'
  and r.created_at::date = '2026-10-16'
  and ja.created_at::date = '2026-10-21'
order by ja.ligne_id, ja.created_at;

update public.recettes r set etapes = j.avant
from _j j
where r.id = j.id and r.etablissement_id = 'etab-2' and r.etapes = j.apres;

select
  (select count(*) from _j) dans_le_journal,
  (select count(*) from public.recettes r join _j j using (id) where r.etapes = j.avant) remises_en_arriere,
  (select jsonb_agg(r.nom order by r.nom) from public.recettes r join _j j using (id) where r.etapes <> j.avant) retouchees_depuis;

commit;
