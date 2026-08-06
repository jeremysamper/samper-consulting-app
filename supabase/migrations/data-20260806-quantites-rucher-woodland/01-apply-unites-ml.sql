-- 06.08.2026 · Liquides à densité ~1 passés de g à ml
-- Le Rucher d'Evolène (etab-1777157340476) puis Woodland Village (etab-2).
-- La valeur ne bouge pas, seule l'unité change : prixUnit reste en CHF par
-- unité, le coût matière et le food cost sont donc inchangés.
--
-- DEJA APPLIQUE EN PRODUCTION LE 06.08.2026. Trace, pas tâche en attente.
--
-- Classement sur la TETE du nom, avant la parenthèse de composant : sans ça
-- « Sucre (crème) », « Jaunes (crème) », « Grains de kéfir d'eau » et les thés
-- en feuilles partaient en ml alors que ce sont des solides pesés.
-- Les liquides denses (sirop, miel, huile, cordial, lait concentré) sont
-- exclus : à 1,25 de densité, 30 g de sirop font 23 ml, une conversion à
-- valeur égale y serait fausse.

begin;

with elems as (
  select r.id, t.ord, t.i,
         (
           (hh.h ~ '^(eau|eaux|jus|verjus|vinaigre|vin|bouillon|fumet|consomme|infusion|hydrolat|lait|creme|petit-lait|kefir|biere|cidre|marinade|saumure|kombucha)([^a-z]|$)'
            or hh.h ~ '(creme entiere|creme liquide)')
           and hh.h !~ '^(grains|poudre|sucre|jaunes|beurre|chocolat|the|menthe|cordial|sirop)'
           and hh.h !~ '(creme d.amande|creme montee|creme patissiere|lait concentre|lait d.amande|infusion fruitee)'
           and t.i->>'unite' = 'g'
         ) as liq
  from recettes r,
       lateral (select x.i, x.ord from jsonb_array_elements(r.ingredients) with ordinality as x(i, ord)) t,
       lateral (select lower(translate(btrim(split_part(split_part(t.i->>'nom','(',1),',',1)),
                'éèêëàâäîïôöûüçœ','eeeeaaaiioouuco')) as h) hh
  where r.etablissement_id in ('etab-1777157340476','etab-2')
), recomposees as (
  select id,
         jsonb_agg(case when liq then i || jsonb_build_object('unite','ml') else i end order by ord) as nouveaux,
         count(*) filter (where liq) as modifiees
  from elems group by id
)
update recettes r
set ingredients = c.nouveaux
from recomposees c
where r.id = c.id and c.modifiees > 0;

-- Attendu : 180 recettes touchées, 255 lignes converties
-- (133 au Rucher qui n'en avait aucune, 122 à Woodland qui en comptait 49).
-- Le nombre total de lignes d'ingrédients ne doit pas bouger : 711 et 1151.

commit;
