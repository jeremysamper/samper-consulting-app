-- Historique de la vitrine porté à trois mois et demi (26.11.2026, après 03-semer.sql).
-- Le jeu semé ne couvrait que trois semaines de réservations et deux de caisse :
-- les Statistiques n'avaient pas de période précédente. Les jours passés du jeu
-- sont recopiés en arrière par blocs de semaines entières (les jours de la
-- semaine restent alignés), chaque copie ne gardant qu'une part des lignes,
-- tirée par empreinte, pour que les périodes ne soient pas identiques.
-- Les copies entrent au registre : elles avancent chaque jour avec le reste.
-- Puis la caisse est renumérotée et sa chaîne reconstruite dans l'ordre du temps.
-- Une seule transaction ; essai à blanc : rollback à la place du commit.

begin;
set local session_replication_role = replica;

-- Identifiant d'une copie : uuid dérivé, ou suffixe -h<k> pour un texte.
create or replace function pg_temp.hid(p text, k int) returns text language sql immutable as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (select substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-4' || substr(h, 14, 3) || '-8' || substr(h, 18, 3) || '-' || substr(h, 21, 12)
            from (select md5('vitrine-histo:' || p || ':' || k) h) x)
    else p || '-h' || k end
$$;
-- Tirage stable : vrai pour environ part x 1000 lignes sur 1000.
create or replace function pg_temp.garde(p text, k int, part numeric) returns boolean language sql immutable as $$
  select abs(('x' || substr(md5('garde:' || p || ':' || k), 1, 7))::bit(28)::int) % 1000 < part * 1000
$$;

create temp table _cols on commit drop as
  select table_name as tab, column_name as col, data_type as typ, is_generated = 'ALWAYS' as genere
    from information_schema.columns where table_schema = 'public';
create index on _cols (tab);
create temp table _copies (tab text, old text, k int, nouveau text, primary key (tab, old, k)) on commit drop;

-- Écrit les copies listées dans _copies pour une table, en une seule
-- instruction : dates et heures reculées de pas x k jours (sauf colonnes
-- nommées), identifiant de copie, clé vers le parent recopié, champs forcés,
-- et une expression jsonb libre sur x et c (numéro provisoire de la caisse).
create or replace function pg_temp.ecrire(t text, pas int, fk text, parent text, forces jsonb, sauf text[], extra text default null) returns int language plpgsql as $$
declare v_cols text; v_cols_r text; v_dec text; v_n int; v_parent text := '';
begin
  select string_agg(format('%I', col), ', '), string_agg(format('r.%I', col), ', ')
    into v_cols, v_cols_r from _cols where tab = t and not genere;
  select string_agg(case when typ = 'date'
                      then format('%L, x.%I - %s * c.k', col, col, pas)
                      else format('%L, x.%I - make_interval(days => %s * c.k)', col, col, pas) end, ', ')
    into v_dec from _cols
   where tab = t and not genere and not (col = any(sauf))
     and typ in ('date', 'timestamp with time zone', 'timestamp without time zone');
  if fk is not null then
    v_parent := format(' || jsonb_build_object(%L, p.nouveau)', fk);
  end if;
  execute format(
    'insert into public.%1$I (%2$s)
     select %7$s
       from _copies c join public.%1$I x on x.id::text = c.old %5$s
      cross join lateral jsonb_populate_record(null::public.%1$I,
              to_jsonb(x) %3$s || jsonb_build_object(''id'', c.nouveau) %4$s %6$s || $1) r
      where c.tab = %1$L
     on conflict do nothing',
    t, v_cols, case when v_dec is null then '' else '|| jsonb_build_object(' || v_dec || ')' end, v_parent,
    case when fk is null then '' else format('join _copies p on p.tab = %L and p.old = x.%I::text and p.k = c.k', parent, fk) end,
    case when extra is null then '' else '|| ' || extra end,
    v_cols_r)
  using forces;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Liste les copies d'une table parente : lignes semées qui passent le filtre,
-- k de 1 à blocs, part gardée par copie.
create or replace function pg_temp.lister(t text, filtre text, blocs int, parts numeric[]) returns void language plpgsql as $$
begin
  execute format(
    'insert into _copies (tab, old, k, nouveau)
     select %1$L, x.id::text, k, pg_temp.hid(x.id::text, k)
       from public.%1$I x join vitrine.lignes l on l.table_nom = %1$L and l.ligne_id = x.id::text
      cross join generate_series(1, %3$s) k
      where (%2$s) and pg_temp.garde(x.id::text, k, ($1)[k])
     on conflict do nothing', t, filtre, blocs) using parts;
end $$;
-- Liste les copies d'une table enfant : une par copie de son parent.
create or replace function pg_temp.lister_enfant(t text, fk text, parent text) returns void language plpgsql as $$
begin
  execute format(
    'insert into _copies (tab, old, k, nouveau)
     select %1$L, x.id::text, p.k, pg_temp.hid(x.id::text, p.k)
       from public.%1$I x join _copies p on p.tab = %3$L and p.old = x.%2$I::text
     on conflict do nothing', t, fk, parent);
end $$;

do $$
declare r date := (select jour_ref from vitrine.etat where id = 1);
begin
  -- Salle : trois semaines passées, quatre fois en arrière (84 jours).
  perform pg_temp.lister('reservations', format('x.date_service between %L and %L and x.statut in (''parti'', ''no_show'', ''annule'')', r - 21, r - 1), 4, array[0.92, 0.85, 0.95, 0.8]);
  perform pg_temp.lister_enfant('reservation_tags', 'reservation_id', 'reservations');
  perform pg_temp.lister_enfant('reservation_tables', 'reservation_id', 'reservations');
  perform pg_temp.ecrire('reservations', 21, null, null, '{"groupe_evenement_id": null}', '{}');
  perform pg_temp.ecrire('reservation_tags', 21, 'reservation_id', 'reservations', '{}', '{}');
  perform pg_temp.ecrire('reservation_tables', 21, 'reservation_id', 'reservations', '{}', '{}');
  perform pg_temp.lister('previsions_jour', format('x.date_service between %L and %L', r - 21, r - 1), 4, array[1, 1, 1, 1]);
  perform pg_temp.ecrire('previsions_jour', 21, null, null, '{}', '{}');

  -- Caisse : deux semaines encaissées, six fois en arrière (84 jours).
  perform pg_temp.lister('caisse_tickets', format('x.numero is not null and x.statut = ''encaisse'' and x.jour_exploitation between %L and %L', r - 14, r - 1), 6, array[0.95, 0.88, 0.9, 0.82, 0.93, 0.86]);
  perform pg_temp.lister_enfant('caisse_lignes', 'ticket_id', 'caisse_tickets');
  perform pg_temp.lister_enfant('caisse_paiements', 'ticket_id', 'caisse_tickets');
  perform pg_temp.lister('caisse_clotures', format('x.jour_exploitation between %L and %L', r - 14, r - 1), 6, array[1, 1, 1, 1, 1, 1]);
  -- Numéros provisoires hors de portée (unicité par année), renumérotés plus bas.
  perform pg_temp.ecrire('caisse_tickets', 14, null, null, '{"reservation_id": null}', '{}', 'jsonb_build_object(''numero'', x.numero + 10000 * c.k)');
  perform pg_temp.ecrire('caisse_lignes', 14, 'ticket_id', 'caisse_tickets', '{}', '{}');
  perform pg_temp.ecrire('caisse_paiements', 14, 'ticket_id', 'caisse_tickets', '{"tpe_transaction_id": null, "bon_cadeau_id": null}', '{}');
  perform pg_temp.ecrire('caisse_clotures', 14, null, null, '{}', '{}', 'jsonb_build_object(''numero'', x.numero + 1000 * c.k)');

  -- Équipe et cuisine.
  perform pg_temp.lister('shifts', format('x.date between %L and %L', r - 21, r - 1), 4, array[1, 1, 1, 1]);
  perform pg_temp.ecrire('shifts', 21, null, null, '{}', '{}');
  perform pg_temp.lister('haccp_releves', format('x.date between %L and %L', r - 21, r - 1), 4, array[0.97, 0.95, 0.98, 0.94]);
  perform pg_temp.ecrire('haccp_releves', 21, null, null, '{}', '{}');
  perform pg_temp.lister('haccp_controls', format('x.date between %L and %L', r - 21, r - 1), 4, array[0.95, 0.9, 0.95, 0.9]);
  perform pg_temp.ecrire('haccp_controls', 21, null, null, '{}', '{}');
  perform pg_temp.lister('pertes', format('x.date between %L and %L', r - 14, r - 1), 6, array[0.8, 0.7, 0.9, 0.75, 0.85, 0.7]);
  perform pg_temp.ecrire('pertes', 14, null, null, '{"mep_item_id": null}', '{}');

  -- Achats et ventes.
  perform pg_temp.lister('achats_documents', format('x.date_document between %L and %L', r - 42, r - 1), 2, array[0.9, 0.85]);
  perform pg_temp.ecrire('achats_documents', 42, null, null, '{}', '{}');
  perform pg_temp.lister('ventes_jour', format('x.jour between %L and %L', r - 56, r - 1), 1, array[1]);
  perform pg_temp.ecrire('ventes_jour', 56, null, null, '{}', '{}');

  -- Hôtel : séjours terminés dans les trois dernières semaines.
  perform pg_temp.lister('sejours', format('x.arrivee >= %L and x.depart <= %L and x.statut in (''parti'', ''annule'', ''no_show'')', r - 21, r), 4, array[0.9, 0.85, 0.95, 0.8]);
  perform pg_temp.lister_enfant('sejour_occupants', 'sejour_id', 'sejours');
  perform pg_temp.lister_enfant('sejour_lignes', 'sejour_id', 'sejours');
  perform pg_temp.ecrire('sejours', 21, null, null, '{"identifiant": null}', '{}');
  perform pg_temp.ecrire('sejour_occupants', 21, 'sejour_id', 'sejours', '{}', '{date_naissance}');
  perform pg_temp.ecrire('sejour_lignes', 21, 'sejour_id', 'sejours', '{"origine_id": null}', '{}');
end $$;

-- Numéros de facture d'achat distincts pour les copies (le nombre final recule).
update public.achats_documents a
   set numero = substring(a.numero from '^(.*?)\d+$')
                || lpad(greatest(1, substring(a.numero from '(\d+)$')::int - 97 * c.k)::text, length(substring(a.numero from '(\d+)$')), '0')
  from _copies c
 where c.tab = 'achats_documents' and c.nouveau = a.id and a.numero ~ '\d+$';

-- Copies au registre (seulement celles réellement écrites).
do $$
declare t text;
begin
  for t in select distinct tab from _copies loop
    execute format('insert into vitrine.lignes (table_nom, ligne_id) select %1$L, c.nouveau from _copies c join public.%1$I x on x.id::text = c.nouveau where c.tab = %1$L on conflict do nothing', t);
  end loop;
end $$;

-- Caisse : toutes les pièces semées renumérotées dans l'ordre du temps, puis
-- chaîne reconstruite (Démo n'a aucune pièce scellée hors vitrine).
do $$
begin
  if exists (select 1 from public.caisse_chaine c
              where c.etablissement_id = 'etab-1781452861459'
                and not exists (select 1 from vitrine.lignes l
                                 where (l.table_nom = 'caisse_tickets' and l.ligne_id = c.ticket_id::text)
                                    or (l.table_nom = 'caisse_clotures' and l.ligne_id = c.cloture_id::text))) then
    raise exception 'Démo porte des pièces scellées hors vitrine : reconstruction refusée';
  end if;
end $$;
delete from public.caisse_chaine where etablissement_id = 'etab-1781452861459';
update public.caisse_tickets t set numero = t.numero + 1000000
  from vitrine.lignes l where l.table_nom = 'caisse_tickets' and l.ligne_id = t.id::text and t.numero is not null;
update public.caisse_tickets t set numero = o.n, annee = extract(year from t.jour_exploitation)::int
  from (select x.id, row_number() over (partition by extract(year from x.jour_exploitation) order by x.closed_at, x.id) n
          from public.caisse_tickets x join vitrine.lignes l on l.table_nom = 'caisse_tickets' and l.ligne_id = x.id::text
         where x.numero is not null) o
 where t.id = o.id;
update public.caisse_clotures c set numero = c.numero + 1000000
  from vitrine.lignes l where l.table_nom = 'caisse_clotures' and l.ligne_id = c.id::text;
update public.caisse_clotures c set numero = o.n
  from (select x.id, row_number() over (order by x.jour_exploitation, x.cloture_at) n
          from public.caisse_clotures x join vitrine.lignes l on l.table_nom = 'caisse_clotures' and l.ligne_id = x.id::text) o
 where c.id = o.id;
update public.caisse_clotures c
   set totaux = public.caisse_totaux_jour(c.etablissement_id, c.jour_exploitation)
  from vitrine.lignes l where l.table_nom = 'caisse_clotures' and l.ligne_id = c.id::text;
update public.caisse_clotures c
   set especes_comptees = c.fond_caisse + coalesce((c.totaux #>> '{especes,attendues}')::numeric, 0), ecart = 0
  from vitrine.lignes l where l.table_nom = 'caisse_clotures' and l.ligne_id = c.id::text;
insert into public.caisse_chaine (etablissement_id, rang, genre, ticket_id, cloture_id, empreinte, empreinte_precedente, created_at)
select 'etab-1781452861459', row_number() over (order by p.ts, p.k), p.genre, p.tid, p.cid, repeat('0', 64), repeat('0', 64), p.ts
  from (select x.closed_at ts, 'ticket' genre, x.id tid, null::uuid cid, x.numero k
          from public.caisse_tickets x join vitrine.lignes l on l.table_nom = 'caisse_tickets' and l.ligne_id = x.id::text
         where x.numero is not null
        union all
        select c.cloture_at, 'cloture', null, c.id, 1000000 + c.numero
          from public.caisse_clotures c join vitrine.lignes l on l.table_nom = 'caisse_clotures' and l.ligne_id = c.id::text) p;
insert into public.caisse_compteurs (etablissement_id, cle, valeur)
select 'etab-1781452861459', 'chaine', count(*) from public.caisse_chaine where etablissement_id = 'etab-1781452861459'
union all
select 'etab-1781452861459', 'ticket:' || annee, max(numero) from public.caisse_tickets
 where etablissement_id = 'etab-1781452861459' and numero is not null group by annee
union all
select 'etab-1781452861459', 'cloture', coalesce(max(numero), 0) from public.caisse_clotures where etablissement_id = 'etab-1781452861459'
on conflict (etablissement_id, cle) do update set valeur = excluded.valeur;
select vitrine.resceller();

commit;
