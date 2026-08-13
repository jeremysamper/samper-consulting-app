-- Restauration de l'état d'avant la liaison en masse du 12.08.2026.
--
-- ATTENTION : remet les ingrédients de etab-2 exactement dans l'état sauvegardé.
-- Tout travail de liaison fait DEPUIS dans l'écran « Lier les ingrédients au
-- catalogue » ou par le scan de facture serait perdu. Vérifier la date avant.

begin;

-- Ce qui serait écrasé, à lire AVANT de valider.
select count(*) as recettes_a_restaurer,
       (select count(*)
        from recettes r, lateral jsonb_array_elements(r.ingredients) i
        where r.etablissement_id = 'etab-2'
          and jsonb_typeof(r.ingredients) = 'array'
          and nullif(i.value->>'produitId','') is not null) as liens_actuels,
       (select count(*)
        from public.bak_20260812_liaison_ingredients b, lateral jsonb_array_elements(b.ingredients) i
        where nullif(i.value->>'produitId','') is not null) as liens_restaures
from public.bak_20260812_liaison_ingredients;

update recettes r
set ingredients = b.ingredients
from public.bak_20260812_liaison_ingredients b
where r.id = b.recette_id
  and r.ingredients is distinct from b.ingredients;

commit;

-- Une fois la restauration confirmée et la table devenue inutile :
-- drop table public.bak_20260812_liaison_ingredients;
