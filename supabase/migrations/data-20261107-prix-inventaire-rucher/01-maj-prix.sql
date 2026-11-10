-- Prix de l'inventaire Cuisine du Rucher (inv-1792997751713), joué le 07.11.2026.
-- Une seule instruction : tout passe ou rien. Empreinte md5 de la liste de prix
-- (calculée hors base sur la même liste), 117 lignes visées, garde sur updated_at.
do $$
declare v_md5 text; v_match int; v_nouv jsonb; v_n int;
begin
  create temp table _maj(id text primary key, prix numeric) on commit drop;
  insert into _maj values
('l1792997751713-79', 3.37),
('l1792997751713-80', 9.57),
('l1792997751713-8e', 18.83),
('l1792997751713-8h', 6.57),
('l1792997751713-8y', 1.76),
('l1792997751713-95', 8.48),
('l1792997751713-97', 0.76),
('l1792997751713-9j', 0.0072),
('l1792997751713-9r', 10.56),
('l1792997751713-9y', 11.93),
('l1793864177754-0', 2.4),
('l1793864235044-1', 1.86),
('l1793864278495-2', 4.65),
('l1793864293311-3', 2.6),
('l1793864464958-4', 6.86),
('l1793865143949-7', 2.5),
('l1793865984600-8', 3.5),
('l1793866562310-9', 0.025),
('l1793866754826-a', 0.28),
('l1793866852644-b', 10),
('l1793867126564-c', 2.4519),
('l1793867502206-d', 19.8),
('l1793867899356-e', 14),
('l1793867930365-f', 18),
('l1793868290202-g', 4.9522),
('l1793868434958-h', 1.5),
('l1793869206472-0', 6.8),
('l1793869307831-1', 10.7),
('l1793869321386-2', 7.4),
('l1793869341767-3', 8),
('l1793869369497-4', 9.4),
('l1793869488508-5', 8.5),
('l1793869541078-6', 12.8),
('l1793869580642-7', 10.3),
('l1793869607822-8', 4.2),
('l1793869650003-9', 10.5),
('l1793869692765-a', 5),
('l1793869707502-b', 2),
('l1793869891470-c', 27.5),
('l1793870031958-d', 0.0055),
('l1793870168643-e', 2.3764),
('l1793870291352-f', 2.17),
('l1793870431742-g', 4),
('l1793870478821-h', 6),
('l1793870541262-i', 2.3764),
('l1793871111363-j', 7.4),
('l1793966128841-0', 15),
('l1793966364849-1', 65),
('l1793966419050-2', 14.2),
('l1793966448765-3', 12),
('l1793966989301-4', 25),
('l1793967024251-5', 11.83),
('l1793967077360-6', 18),
('l1793967106228-7', 20),
('l1793967135204-8', 45),
('l1793967195415-9', 0.1264),
('l1793967229400-a', 15.5),
('l1793967257729-b', 45),
('l1793967288906-c', 25.41),
('l1793967318336-d', 18),
('l1793967360855-e', 30),
('l1793967402987-f', 16),
('l1793967478096-g', 15.13),
('l1793967524905-h', 40),
('l1793967558886-i', 45),
('l1793967608566-j', 18),
('l1793967636227-k', 5.75),
('l1793967670757-l', 1.5),
('l1793967727736-m', 20),
('l1793967776282-n', 0.02),
('l1793967952637-o', 30),
('l1793967996047-p', 15),
('l1793968043026-q', 0.005),
('l1793968073890-r', 0.08),
('l1793968105022-s', 8.75),
('l1793968137986-t', 0.02),
('l1793968175416-u', 0.06),
('l1793968201514-v', 0.0189),
('l1793968232077-w', 0.04),
('l1793968258260-x', 0.02),
('l1793968482644-y', 3.45),
('l1793968712561-10', 10.6),
('l1793968968605-11', 15),
('l1793968996182-12', 30.5),
('l1793969173542-13', 1.3),
('l1793969223069-14', 3),
('l1793969267861-15', 2.35),
('l1793969296613-16', 2.54),
('l1793969360592-17', 40),
('l1793969590601-18', 25),
('l1793969641430-19', 10.2),
('l1793969808550-1a', 17.16),
('l1793969834448-1b', 17.16),
('l1793969954404-1c', 27.24),
('l1793970038697-1d', 8.9),
('l1793970062649-1e', 14.5),
('l1793970121707-1f', 8.8),
('l1793970182837-1g', 21.17),
('l1793970224732-1h', 9),
('l1793970256185-1i', 21.17),
('l1793970360904-1j', 6),
('l1793970494611-1k', 32.45),
('l1793970554078-1l', 28),
('l1793970610875-1m', 17.25),
('l1793970785654-1n', 25),
('l1793970905611-1o', 14),
('l1793972688801-1p', 12),
('l1793972945251-1q', 25),
('l1793973364181-1r', 5.29),
('l1793973506791-1s', 8),
('l1793973934036-1t', 23.25),
('l1793974142102-1u', 0.04),
('l1792997751713-7a', 14.8),
('l1792997751713-98', 23.28),
('l1792997751713-9k', 13.29),
('l1792997751713-9v', 7.37);
  select md5(string_agg(id||':'||prix::text, ',' order by id collate "C")) into v_md5 from _maj;
  if v_md5 <> 'd29820b882b675e930e572119546303e' then raise exception 'empreinte differente %', v_md5; end if;
  -- Fleurs comestibles : correction d'unité (pcs devenu g sans conversion).
  insert into _maj select e->>'id', 0.794 from inventaires i, jsonb_array_elements(i.lignes) e
   where i.id='inv-1792997751713' and e->>'produit'='Fleurs comestibles';

  select count(*) into v_match from inventaires i, jsonb_array_elements(i.lignes) e join _maj m on m.id=e->>'id'
   where i.id='inv-1792997751713';
  if v_match <> 117 then raise exception 'lignes visees %', v_match; end if;

  create table sauvegarde.inventaires_rucher_prix_20261107 as
    select now() as sauve_le, * from public.inventaires where id='inv-1792997751713';

  -- Valeur et écart en valeur comme inventaire_modifier_ligne (20261106b).
  select jsonb_agg(case when m.id is null then e else
      e || jsonb_build_object('prixUnit', m.prix) ||
      case when jsonb_typeof(e->'stockReel')='number' then jsonb_build_object(
        'valeur', round((e->>'stockReel')::numeric*m.prix, 2),
        'ecartValeur', round(((e->>'stockReel')::numeric - case when jsonb_typeof(e->'stockTheo')='number' then (e->>'stockTheo')::numeric else 0 end)*m.prix, 2))
      else jsonb_build_object('valeur', 0, 'ecartValeur', 0) end
    end order by ord) into v_nouv
  from inventaires i, jsonb_array_elements(i.lignes) with ordinality t(e, ord) left join _maj m on m.id=e->>'id'
  where i.id='inv-1792997751713';

  update public.inventaires
     set lignes = v_nouv,
         valeur_totale = (select round(sum(case when jsonb_typeof(e->'valeur')='number' then (e->>'valeur')::numeric else 0 end),2) from jsonb_array_elements(v_nouv) e)
   where id='inv-1792997751713' and updated_at = '2026-11-07 17:16:27.246068+00';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'inventaire modifie entre-temps (row_count %)', v_n; end if;
end $$;
