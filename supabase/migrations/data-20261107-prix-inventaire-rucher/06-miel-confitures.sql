-- Miel et confitures maison, joué le 07.11.2026 (après 05).
-- Jérémy : miel 27 kg (34 saisi), confitures maison 22 kg au total (33.5 saisi), foin 16 kg et pickles 10.5 kg confirmés.
-- Les 22 kg répartis au prorata du comptage : rhubarbe 7.9, fruits des bois 7.5, abricot 6.6.
-- Prix des confitures recalculés depuis les fiches (prix du Rucher, sans rendement) :
--   abricot 4.87 (abricot frais 7.01), rhubarbe 3.78 (rhubarbe surgelée 5.36), fruits des bois 6.36 (mélange de baies 9.18).
do $$
declare r record; v_nouv jsonb; v_n int;
begin
  create temp table _c(nom text primary key, prix numeric, reel numeric) on commit drop;
  insert into _c values
   ('Miel', null, 27),
   ('Confiture rhubarbe (maison)', 3.78, 7.9),
   ('Confiture fruits des bois (maison)', 6.36, 7.5),
   ('Confiture abricot (maison)', 4.87, 6.6);

  create table sauvegarde.inventaires_rucher_miel_confitures_20261107 as
    select now() as sauve_le, * from public.inventaires where id in ('inv-1790946512915','inv-1792997751713','inv-1794074436242');

  for r in select * from (values ('inv-1790946512915', 'prix'), ('inv-1792997751713', 'compte'), ('inv-1794074436242', 'theo')) t(id, mode) loop
    select jsonb_agg(case when c.nom is null then e else (
        with b as (
          select e
            || case when c.prix is not null then jsonb_build_object('prixUnit', c.prix) else '{}'::jsonb end
            || case when r.mode = 'compte' then jsonb_build_object('stockReel', c.reel) else '{}'::jsonb end
            || case when r.mode = 'theo' then jsonb_build_object('stockTheo', c.reel, 'precedent', c.reel) else '{}'::jsonb end as l
        )
        select l || case when jsonb_typeof(l->'stockReel')='number' then jsonb_build_object(
            'ecart', round((l->>'stockReel')::numeric - coalesce(case when jsonb_typeof(l->'stockTheo')='number' then (l->>'stockTheo')::numeric end, 0), 2),
            'valeur', round((l->>'stockReel')::numeric * (l->>'prixUnit')::numeric, 2),
            'ecartValeur', round(((l->>'stockReel')::numeric - coalesce(case when jsonb_typeof(l->'stockTheo')='number' then (l->>'stockTheo')::numeric end, 0)) * (l->>'prixUnit')::numeric, 2))
          else jsonb_build_object('valeur', 0, 'ecartValeur', 0) end
        from b)
      end order by ord) into v_nouv
    from inventaires i, jsonb_array_elements(i.lignes) with ordinality t(e, ord) left join _c c on c.nom = e->>'produit'
    where i.id = r.id;

    if (select count(*) from jsonb_array_elements(v_nouv) e where e->>'produit' in (select nom from _c)) <> 4 then
      raise exception '% : lignes visees', r.id; end if;

    update public.inventaires
       set lignes = v_nouv,
           valeur_totale = (select round(sum(case when jsonb_typeof(e->'valeur')='number' then (e->>'valeur')::numeric else 0 end),2) from jsonb_array_elements(v_nouv) e)
     where id = r.id;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception '% non mis a jour', r.id; end if;
  end loop;
end $$;
