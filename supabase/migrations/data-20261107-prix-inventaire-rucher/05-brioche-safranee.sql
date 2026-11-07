-- Brioche safranée passée au kilo, joué le 07.11.2026 (après 04).
-- Jérémy : 4 ou 5 brioches de 600 g, les autres de 80 g. Lecture retenue :
--   02.10 : 50 pièces = 5 x 600 g + 45 x 80 g = 6.6 kg ; 26.10 : 5 pièces = 5 x 600 g = 3.0 kg.
-- Prix : 4.3697 la brioche de 600 g (validé), soit 7.2828 CHF/kg.
do $$
declare r record; v_nouv jsonb; v_n int; v_prix numeric := 7.2828;
begin
  create table sauvegarde.inventaires_rucher_brioche_20261107 as
    select now() as sauve_le, * from public.inventaires where id in ('inv-1790946512915','inv-1792997751713','inv-1794074436242');

  for r in select * from (values
      ('inv-1790946512915', 'l1790947130933-1g', 6.6::numeric, null::numeric),
      ('inv-1792997751713', 'l1792997751713-7p', 3.0, 6.6),
      ('inv-1794074436242', 'l1794074436242-4c', null, 3.0)) t(id, ligne, reel, theo) loop

    select jsonb_agg(case when e->>'id' <> r.ligne then e else (
        with b as (
          select e || jsonb_build_object('unite', 'kg', 'prixUnit', v_prix)
            || case when r.reel is not null then jsonb_build_object('stockReel', r.reel) else '{}'::jsonb end
            || case when r.theo is not null then jsonb_build_object('stockTheo', r.theo, 'precedent', r.theo) else '{}'::jsonb end as l
        )
        select l || case when jsonb_typeof(l->'stockReel')='number' then jsonb_build_object(
            'ecart', round((l->>'stockReel')::numeric - coalesce(case when jsonb_typeof(l->'stockTheo')='number' then (l->>'stockTheo')::numeric end, 0), 2),
            'valeur', round((l->>'stockReel')::numeric * v_prix, 2),
            'ecartValeur', round(((l->>'stockReel')::numeric - coalesce(case when jsonb_typeof(l->'stockTheo')='number' then (l->>'stockTheo')::numeric end, 0)) * v_prix, 2))
          else jsonb_build_object('valeur', 0, 'ecartValeur', 0) end
        from b)
      end order by ord) into v_nouv
    from inventaires i, jsonb_array_elements(i.lignes) with ordinality t(e, ord)
    where i.id = r.id;

    if (select count(*) from jsonb_array_elements(v_nouv) e where e->>'id' = r.ligne and e->>'produit' = 'Brioche safranée (maison)') <> 1 then
      raise exception '% : ligne introuvable', r.id; end if;

    update public.inventaires
       set lignes = v_nouv,
           valeur_totale = (select round(sum(case when jsonb_typeof(e->'valeur')='number' then (e->>'valeur')::numeric else 0 end),2) from jsonb_array_elements(v_nouv) e)
     where id = r.id;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception '% non mis a jour', r.id; end if;
  end loop;
end $$;
