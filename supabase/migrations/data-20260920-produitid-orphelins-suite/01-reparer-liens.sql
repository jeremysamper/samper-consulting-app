-- ═══════════════════════════════════════════════════════════════════════════
-- Suite de la reparation des produitId orphelins (bloc A : cas certains)
--
-- La reparation du 11.08.2026 avait relie 27 lignes et refuse tout appariement
-- non unique. 28 lignes etaient restees orphelines. Leur cause est maintenant
-- identifiee : au re-import du catalogue du 20.05.2026, le PREFIXE DE MARQUE et
-- la PONCTUATION ont disparu des noms de produits.
--     « Cailler Poudre de cacao »        -> « Poudre de cacao »
--     « JuraSel Sel de table vert, iode et fluore » -> « Sel de table vert iode et fluore »
--     « Asperges vertes, Europe »        -> « Asperges vertes Europe »
-- L'appariement sur le nom exact ne pouvait donc pas aboutir.
--
-- Ce bloc ne traite que les 17 lignes CERTAINES : le prix unitaire fige dans la
-- recette est identique au centime pres au prix du produit du catalogue, ce qui
-- confirme l'identite. Aucune valeur affichee ne change, seul le lien est
-- retabli et le food cost recommence a suivre le catalogue.
--
-- Les 11 autres lignes demandent un arbitrage humain, voir le README :
-- estragon passe du g au pcs (2), doublons du catalogue (6), ecarts de prix a
-- trancher (2), produit disparu du catalogue (1).
--
-- Ce script ne modifie QUE la cle produitId. Ni `unite`, ni `prixUnit`, ni
-- `quantite`.
--
-- A executer dans l'ordre : 00-sauvegarde.sql, puis ce fichier, puis
-- 02-verification.sql. Il se termine par `rollback;` : remplacer par `commit;`
-- apres relecture.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- Garde-fou : les 8 produits cibles doivent exister, sinon on ne touche a rien.
do $$
declare manquants text;
begin
  select string_agg(m.new_id, ', ')
    into manquants
    from (values
      ('prod-1779237210905552'), ('prod-1779237212609767'), ('prod-1779237210678563'),
      ('prod-1779237210678923'), ('prod-1779237211029410'), ('prod-1779237210735410'),
      ('prod-1779237210307756'), ('prod-1779237212207405')
    ) as m(new_id)
   where not exists (select 1 from public.produits p where p.id = m.new_id);
  if manquants is not null then
    raise exception 'Produits cibles introuvables : %', manquants;
  end if;
end $$;

with mapping(ing_nom, ing_unite, new_id) as (
  values
    -- nom d'ingredient dans la recette      unite   produit du catalogue (prix identique)
    ('JuraSel Sel de table vert, iodé et fluoré',   'g',  'prod-1779237210905552'), -- Sel de table vert iodé et fluoré, 0.00095/g
    ('Asperges vertes, Europe',                     'g',  'prod-1779237212609767'), -- Asperges vertes Europe, 0.0086/g
    ('Cailler Poudre de cacao',                     'g',  'prod-1779237210678563'), -- Poudre de cacao, 0.03245/g
    ('Economy Miel de fleurs liquide',              'g',  'prod-1779237210678923'), -- Miel de fleurs liquide, 0.00709/g
    ('Gelita gélatine en feuilles, argent',         'g',  'prod-1779237211029410'), -- Gélatine en feuilles argent, 0.0338/g
    ('Grey Poupon Moutarde forte',                  'g',  'prod-1779237210735410'), -- Moutarde forte, 0.00589/g
    ('Quality Amandes, non émondées, moulues',      'g',  'prod-1779237210307756'), -- Quality Amandes non émondées moulues, 0.01495/g
    ('Echalotes, emballés',                         'g',  'prod-1779237212207405')  -- Echalotes Filet 1 kg, 0.00395/g (le prix départage du Sac 5 kg à 0.00067)
),
a_reparer as (
  select r.id as recette_id, e.ord as ligne, m.new_id
    from public.recettes r
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(r.ingredients)='array' then r.ingredients else '[]'::jsonb end
    ) with ordinality as e(value, ord)
    join mapping m
      on m.ing_nom   = e.value->>'nom'
     and m.ing_unite = e.value->>'unite'
   where r.etablissement_id = 'etab-2'
     and nullif(e.value->>'produitId','') is not null
     and not exists (select 1 from public.produits p where p.id = e.value->>'produitId')
)
update public.recettes r
set ingredients = (
  select jsonb_agg(
           case when c.new_id is not null
                then jsonb_set(e.value, '{produitId}', to_jsonb(c.new_id))
                else e.value
           end
           order by e.ord
         )
  from jsonb_array_elements(r.ingredients) with ordinality as e(value, ord)
  left join a_reparer c on c.recette_id = r.id and c.ligne = e.ord
)
where r.id in (select recette_id from a_reparer)
  and jsonb_typeof(r.ingredients) = 'array';

-- Relire 02-verification.sql AVANT de valider.
rollback;
-- commit;
