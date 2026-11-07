-- Pièces et poids des produits maison, joué le 07.11.2026 (après 01 et 03).
-- Cuisine 02.10 (inv-1790946512915, validé) : financiers (50 pcs) et madeleines (100 pcs) passés en kg
--   (poids de pièce tiré de la fiche : 610 g / 20 et 417 g / 24), prix au kg recalculé.
-- Cuisine 26.10 (inv-1792997751713, validé) : mêmes prix ; stock théorique et précédent des financiers
--   et madeleines ramenés en kg (ils valaient encore 50 et 100 pièces face à 5 et 3.5 kg comptés).
-- Cuisine 07.11 (inv-1794074436242, en cours, rien de compté) : prix seulement.
-- Pièce de cake = un cake entier (moule de 20 cm, environ 1 kg de pâte selon les fiches du Rucher).
do $$
declare r record; v_nouv jsonb; v_n int;
begin
  create temp table _px(nom text primary key, prix numeric, poids_piece_kg numeric) on commit drop;
  insert into _px values
   ('Financier amande (maison)', 12.51, 0.0305),
   ('Madeleine (maison)', 7.33, 0.017375),
   ('Pancakes (maison)', 0.108, null),
   ('Cake citron (maison)', 5.63, null),
   ('Cake au safran et amande (maison)', 12.38, null),
   ('Carrot cake (maison)', 7.03, null);

  create table sauvegarde.inventaires_rucher_pieces_20261107 as
    select now() as sauve_le, * from public.inventaires where id in ('inv-1790946512915','inv-1792997751713','inv-1794074436242');

  for r in select * from (values
      ('inv-1790946512915', '2026-10-03 05:40:26.240374+00'::timestamptz, 'pcs_vers_kg'),
      ('inv-1792997751713', '2026-11-07 17:28:30.298132+00'::timestamptz, 'theo_converti'),
      ('inv-1794074436242', '2026-11-07 18:00:36.773784+00'::timestamptz, 'prix')) t(id, maj, mode) loop

    select jsonb_agg(case when x.nom is null then e else (
        with b as (
          select e || jsonb_build_object('prixUnit', x.prix)
            || case when r.mode = 'pcs_vers_kg' and x.poids_piece_kg is not null and e->>'unite' = 'pcs'
                    then jsonb_build_object('unite', 'kg', 'stockReel', round((e->>'stockReel')::numeric * x.poids_piece_kg, 3)) else '{}'::jsonb end
            || case when r.mode = 'theo_converti' and x.poids_piece_kg is not null and (e->>'stockTheo')::numeric > 10
                    then jsonb_build_object('stockTheo', round((e->>'stockTheo')::numeric * x.poids_piece_kg, 3), 'precedent', round((e->>'precedent')::numeric * x.poids_piece_kg, 3)) else '{}'::jsonb end as l
        )
        select l || case when jsonb_typeof(l->'stockReel')='number' then jsonb_build_object(
            'ecart', round((l->>'stockReel')::numeric - coalesce(case when jsonb_typeof(l->'stockTheo')='number' then (l->>'stockTheo')::numeric end, 0), 2),
            'valeur', round((l->>'stockReel')::numeric * x.prix, 2),
            'ecartValeur', round(((l->>'stockReel')::numeric - coalesce(case when jsonb_typeof(l->'stockTheo')='number' then (l->>'stockTheo')::numeric end, 0)) * x.prix, 2))
          else jsonb_build_object('valeur', 0, 'ecartValeur', 0) end
        from b)
      end order by ord) into v_nouv
    from inventaires i, jsonb_array_elements(i.lignes) with ordinality t(e, ord) left join _px x on x.nom = e->>'produit'
    where i.id = r.id;

    if (select count(*) from jsonb_array_elements(v_nouv) e where e->>'produit' in (select nom from _px)) <> 6 then
      raise exception '% : lignes visees', r.id; end if;

    update public.inventaires
       set lignes = v_nouv,
           valeur_totale = (select round(sum(case when jsonb_typeof(e->'valeur')='number' then (e->>'valeur')::numeric else 0 end),2) from jsonb_array_elements(v_nouv) e)
     where id = r.id and updated_at = r.maj;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception '% modifie entre-temps', r.id; end if;
  end loop;
end $$;
