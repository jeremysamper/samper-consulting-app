-- Rollback : restaure les ingredients exactement tels qu'ils etaient avant
-- 01-reparer-liens.sql. Ne supprime PAS la table de sauvegarde (le faire
-- manuellement une fois la reparation validee en production).

begin;

update recettes r
set ingredients = b.ingredients
from backup_recettes_ingredients_20260811 b
where b.recette_id = r.id
  and r.ingredients is distinct from b.ingredients;

-- Controle : doit rendre 0 (plus aucun ecart avec la sauvegarde).
select count(*) as recettes_encore_differentes
from recettes r
join backup_recettes_ingredients_20260811 b on b.recette_id = r.id
where r.ingredients is distinct from b.ingredients;

commit;

-- Une fois la reparation definitivement validee :
-- drop table backup_recettes_ingredients_20260811;
