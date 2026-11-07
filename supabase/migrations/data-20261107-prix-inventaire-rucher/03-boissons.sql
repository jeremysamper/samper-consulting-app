-- Prix des inventaires Boissons du Rucher, joué le 07.11.2026 (après 01-maj-prix.sql).
-- inv-1792997740029 (26.10, validé) : 106 lignes sans prix ; inv-1793627029424 (02.11, en cours) : 99.
-- Prix par nom de produit (empreinte md5 de la liste), produits maison par préfixe, garde sur updated_at.
do $$
declare v_md5 text; r record; v_nouv jsonb; v_n int; v_vis int;
begin
  create temp table _p(nom text primary key, prix numeric) on commit drop;
  insert into _p values
('Ange gardien', 10.38),
('Asperule', 10.38),
('Assam hatimara thé noir', 10.38),
('Bai mu dan', 10.38),
('Baies romantiques', 10.38),
('Basilic sacré', 10.38),
('Body perfect', 10.38),
('Douceur dorée', 10.38),
('Earl grey', 10.38),
('Feuille de bambou', 10.38),
('Fleurs d’osmenthus', 10.38),
('Gentiane', 10.38),
('Hojicha thé vert', 10.38),
('Lapsang souchang', 10.38),
('Mélisse', 10.38),
('Menthe marocaine', 10.38),
('Millefeuille', 10.38),
('Monarde', 10.38),
('Montagne bleu', 10.38),
('Puech sombre', 10.38),
('Reine des prés', 10.38),
('Reine des prés bio', 10.38),
('Sencha bancha', 10.38),
('Sencha kukicha', 10.38),
('Shèng thé vert', 10.38),
('St Bernard', 10.38),
('Thé noir golden buds', 10.38),
('Thé vert jasmin', 10.38),
('Thé vert shi feng', 10.38),
('Tout feu tout flamme', 10.38),
('Alpinesse', 1.6),
('Arkina 1L Gazeuse', 1.12),
('Arkina 1L plate', 1.12),
('Arkina Gazeuse 33cl', 0.99),
('Arkina plate 33cl', 0.99),
('Arkina Gazeuse 50cl', 1.1),
('Arkina plate 50cl', 1.1),
('Café carioca', 24.2),
('Coca cola', 1.5),
('Coca cola zero', 1.5),
('Cola craft', 1.6),
('Cola craft zero', 1.6),
('Hidromel', 11),
('Hydromel', 11),
('Iris abricot', 1.73),
('Iris poire', 1.73),
('Iris pomme', 1.73),
('Iris reisin', 1.73),
('Iris tomate', 1.73),
('Iris abricot 1L', 3.9),
('Iris poire 1L', 3.9),
('Iris pomme 1L', 3.9),
('Mate', 1.6),
('Opaline fleur de sureau', 1.95),
('Opaline framboise', 1.95),
('Opaline gingembre', 1.95),
('Opaline pomme', 1.95),
('Sachets de thé', 0.06),
('Sinalco', 1.25),
('Sirop grenadine', 6.2),
('Urban kambucha gingembre', 2.2),
('Urban kambucha hibiscus', 2.2),
('Urban kambucha original', 2.2),
('Valais gazeuse 1L', 1.4),
('Valais gazeuse 33cl', 1.01),
('Valais plate 33cl', 1.01),
('Valais gazeuse pet 33cl', 1.15),
('Valais plate pet 33cl', 1.15),
('Whitefrontier blanche', 2.2),
('Whitefrontier blonde', 2.2),
('Yodeli', 1.16);
  select md5(string_agg(nom||':'||prix::text, ',' order by nom collate "C")) into v_md5 from _p;
  if v_md5 <> 'bd6de05365540f585f673ad93e6ef986' then raise exception 'empreinte differente %', v_md5; end if;

  create table sauvegarde.inventaires_rucher_boissons_prix_20261107 as
    select now() as sauve_le, * from public.inventaires where id in ('inv-1792997740029','inv-1793627029424');

  for r in select * from (values ('inv-1792997740029', '2026-11-02 13:35:26.739816+00'::timestamptz, 106),
                                 ('inv-1793627029424', '2026-11-06 16:51:43.251707+00'::timestamptz, 99)) t(id, maj, attendu) loop
    select count(*) into v_vis from inventaires i, jsonb_array_elements(i.lignes) e
     where i.id = r.id and coalesce((e->>'prixUnit')::numeric,0)=0;
    if v_vis <> r.attendu then raise exception '% : % lignes sans prix, % attendues', r.id, v_vis, r.attendu; end if;

    select jsonb_agg(case when q.prix is null then e else
        e || jsonb_build_object('prixUnit', q.prix) ||
        case when jsonb_typeof(e->'stockReel')='number' then jsonb_build_object(
          'valeur', round((e->>'stockReel')::numeric*q.prix, 2),
          'ecartValeur', round(((e->>'stockReel')::numeric - case when jsonb_typeof(e->'stockTheo')='number' then (e->>'stockTheo')::numeric else 0 end)*q.prix, 2))
        else jsonb_build_object('valeur', 0, 'ecartValeur', 0) end
      end order by ord) into v_nouv
    from inventaires i, jsonb_array_elements(i.lignes) with ordinality t(e, ord)
    left join lateral (
      select case
        when coalesce((e->>'prixUnit')::numeric,0) > 0 then null
        when p.prix is not null then p.prix
        when (e ? 'recetteId' or e->>'categorie'='Produits maison') then case
          when e->>'produit' like 'Base %' then 2.0
          when e->>'produit' like 'Cordial %' then 5.0
          when e->>'produit' like 'Premix %' then 1.5
          when e->>'produit' like 'Infusion %' then 1.0 end
      end as prix
      from (select 1) z left join _p p on p.nom = e->>'produit'
    ) q on true
    where i.id = r.id;

    if (select count(*) from jsonb_array_elements(v_nouv) e where coalesce((e->>'prixUnit')::numeric,0)=0) <> 0 then
      raise exception '% : il resterait des lignes sans prix', r.id; end if;

    update public.inventaires
       set lignes = v_nouv,
           valeur_totale = (select round(sum(case when jsonb_typeof(e->'valeur')='number' then (e->>'valeur')::numeric else 0 end),2) from jsonb_array_elements(v_nouv) e)
     where id = r.id and updated_at = r.maj;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception '% modifie entre-temps', r.id; end if;
  end loop;
end $$;
