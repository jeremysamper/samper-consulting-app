-- Semis de la vitrine dans l'établissement Démo (joué le 26.11.2026 à 23 h 45).
-- Prérequis : 20261126_vitrine_demo.sql appliquée, et la table vitrine.depot
-- remplie par les lots de 02-convertir.mjs (voir README.md, « Rejouer »).
-- Une seule transaction : toute erreur annule tout. Essai à blanc : remplacer
-- le commit final par rollback.

begin;
set local session_replication_role = replica;  -- gardes de caisse, points, notifications coupés

-- 1. Lignes des lots, inscrites au registre (seulement celles réellement écrites).
do $$
declare d record; v_cols text;
begin
  for d in select * from vitrine.depot order by ordre loop
    select string_agg(format('%I', c), ', ') into v_cols from unnest(d.colonnes) c;
    if 'id' = any(d.colonnes) then
      execute format('with ins as (insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing returning id::text) insert into vitrine.lignes (table_nom, ligne_id) select %L, id from ins on conflict do nothing', d.table_nom, v_cols, v_cols, d.table_nom, d.table_nom) using d.lignes;
    else
      execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing', d.table_nom, v_cols, v_cols, d.table_nom) using d.lignes;
    end if;
  end loop;
end $$;

-- 2. Tickets numérotés de 1 à N dans l'ordre d'encaissement (le contrôle
--    d'intégrité veut une suite sans trou qui commence à 1).
update public.caisse_tickets t set numero = o.n, annee = extract(year from t.jour_exploitation)::int
  from (select x.id, row_number() over (order by x.closed_at, x.id) n from public.caisse_tickets x
          join vitrine.lignes l on l.table_nom = 'caisse_tickets' and l.ligne_id = x.id::text
         where x.numero is not null) o
 where t.id = o.id;

-- 3. Clôtures : totaux réels du jour, espèces comptées sans écart.
update public.caisse_clotures c
   set totaux = public.caisse_totaux_jour(c.etablissement_id, c.jour_exploitation)
  from vitrine.lignes l where l.table_nom = 'caisse_clotures' and l.ligne_id = c.id::text;
update public.caisse_clotures c
   set especes_comptees = c.fond_caisse + coalesce((c.totaux #>> '{especes,attendues}')::numeric, 0), ecart = 0
  from vitrine.lignes l where l.table_nom = 'caisse_clotures' and l.ligne_id = c.id::text;

-- 4. Chaîne d'intégrité : tickets et clôtures dans l'ordre du temps, puis
--    sceaux calculés par les fonctions de la caisse.
insert into public.caisse_chaine (etablissement_id, rang, genre, ticket_id, cloture_id, empreinte, empreinte_precedente, created_at)
select 'etab-1781452861459', row_number() over (order by p.ts, p.k), p.genre, p.tid, p.cid, repeat('0', 64), repeat('0', 64), p.ts
  from (select x.closed_at ts, 'ticket' genre, x.id tid, null::uuid cid, x.numero k
          from public.caisse_tickets x join vitrine.lignes l on l.table_nom = 'caisse_tickets' and l.ligne_id = x.id::text
         where x.numero is not null
        union all
        select c.cloture_at, 'cloture', null, c.id, 100000 + c.numero
          from public.caisse_clotures c join vitrine.lignes l on l.table_nom = 'caisse_clotures' and l.ligne_id = c.id::text) p;
insert into public.caisse_compteurs (etablissement_id, cle, valeur)
select 'etab-1781452861459', k.cle, k.v from (values
  ('chaine', (select count(*) from public.caisse_chaine where etablissement_id = 'etab-1781452861459')),
  ('ticket:2026', (select coalesce(max(numero), 0) from public.caisse_tickets where etablissement_id = 'etab-1781452861459' and annee = 2026)),
  ('cloture', (select coalesce(max(numero), 0) from public.caisse_clotures where etablissement_id = 'etab-1781452861459'))) k(cle, v)
on conflict (etablissement_id, cle) do update set valeur = excluded.valeur;
select vitrine.resceller();

-- 5. Type hôtel-restaurant : la carte « Aujourd'hui à l'hôtel » du tableau de
--    bord ne paraît que pour un hôtel.
update public.etablissements set type = 'Hôtel-Restaurant' where id = 'etab-1781452861459';

-- 6. Le jeu est daté du 26.11.2026 : la vitrine rattrape le jour de Zurich.
update vitrine.etat set jour_ref = date '2026-11-26' where id = 1;
select vitrine.rattraper();

commit;
