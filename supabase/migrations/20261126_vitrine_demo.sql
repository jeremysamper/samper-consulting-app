-- Vitrine : l'établissement Démo (etab-1781452861459) rempli comme une maison
-- qui travaille avec l'app chaque jour, pour les présentations aux clients.
--
-- Les lignes fictives sont semées depuis le jeu de la démo publique
-- (src/demo/donnees/, horloge figée à midi), voir data-20261126-vitrine-demo/.
-- Chaque ligne semée est inscrite dans vitrine.lignes. Chaque heure,
-- vitrine.rattraper() avance ces lignes d'autant de jours qu'il s'en est
-- écoulé depuis vitrine.etat.jour_ref : la vitrine montre toujours un
-- service en cours aujourd'hui, une semaine de planning, un historique.
-- Ce qui est saisi à la main dans Démo n'est jamais déplacé.
--
-- Schéma hors API (ni anon ni authenticated), fonctions réservées au
-- propriétaire et à pg_cron. Purement additif.

create schema if not exists vitrine;
revoke all on schema vitrine from public, anon, authenticated;

create table if not exists vitrine.lignes (
  table_nom  text not null,
  ligne_id   text not null,
  inscrit_le timestamptz not null default now(),
  primary key (table_nom, ligne_id)
);
comment on table vitrine.lignes is
  'Lignes fictives de l''établissement Démo (vitrine), avancées chaque jour par vitrine.rattraper().';

create table if not exists vitrine.etat (
  id       int primary key default 1 check (id = 1),
  etab_id  text not null,
  jour_ref date not null
);

create table if not exists vitrine.journal (
  le      timestamptz not null default now(),
  jours   int not null,
  lignes  int not null,
  echecs  text[] not null default '{}'
);

-- Avance de p_jours toutes les dates et heures des lignes semées. Déclencheurs
-- coupés (replica) : les gardes de la caisse refusent toute modification d'une
-- pièce, et rien ne doit partir (notifications, points). Deux pas (+36500 j
-- puis -36500 j) pour ne jamais heurter une contrainte d'unicité sur une date
-- (prévision du jour, clôture du jour). Une table en échec est annulée seule
-- (sous-bloc) et notée au journal.
create or replace function vitrine.avancer(p_jours int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  v_aller text;
  v_retour text;
  v_n int;
  v_total int := 0;
  v_echecs text[] := '{}';
begin
  if p_jours is null or p_jours <= 0 then
    return 0;
  end if;
  -- Portée : la transaction en cours (rétabli en sortie). Ni en attribut de
  -- fonction ni par set_config : seule l'instruction SET est permise au rôle.
  execute 'set local session_replication_role = replica';

  for t in select distinct l.table_nom from vitrine.lignes l order by 1 loop
    select
      string_agg(case when c.data_type = 'date'
                   then format('%I = %I + %s', c.column_name, c.column_name, p_jours + 36500)
                   else format('%I = %I + make_interval(days => %s)', c.column_name, c.column_name, p_jours + 36500) end, ', '),
      string_agg(case when c.data_type = 'date'
                   then format('%I = %I - 36500', c.column_name, c.column_name)
                   else format('%I = %I - make_interval(days => 36500)', c.column_name, c.column_name) end, ', ')
      into v_aller, v_retour
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name = t.table_nom
       and c.data_type in ('date', 'timestamp with time zone', 'timestamp without time zone')
       and c.is_generated = 'NEVER';
    continue when v_aller is null;

    begin
      execute format(
        'update public.%I x set %s from vitrine.lignes l where l.table_nom = %L and l.ligne_id = x.id::text',
        t.table_nom, v_aller, t.table_nom);
      get diagnostics v_n = row_count;
      execute format(
        'update public.%I x set %s from vitrine.lignes l where l.table_nom = %L and l.ligne_id = x.id::text',
        t.table_nom, v_retour, t.table_nom);
      v_total := v_total + v_n;
    exception when others then
      v_echecs := v_echecs || (t.table_nom || ' : ' || sqlerrm);
    end;
  end loop;

  begin
    perform vitrine.resceller();
  exception when others then
    v_echecs := v_echecs || ('caisse_chaine : ' || sqlerrm);
  end;

  execute 'set local session_replication_role = origin';
  insert into vitrine.journal (jours, lignes, echecs) values (p_jours, v_total, v_echecs);
  return v_total;
end;
$$;

-- Rattrape les jours écoulés depuis la dernière avance (jour de Zurich).
-- Sans effet quand la vitrine est à jour : peut tourner chaque heure.
create or replace function vitrine.rattraper()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref date;
  v_jour date := (now() at time zone 'Europe/Zurich')::date;
  v_n int;
begin
  select e.jour_ref into v_ref from vitrine.etat e where e.id = 1 for update;
  if v_ref is null or v_jour <= v_ref then
    return 0;
  end if;
  v_n := vitrine.avancer(v_jour - v_ref);
  update vitrine.etat set jour_ref = v_jour where id = 1;
  return v_n;
end;
$$;

-- Retire toutes les lignes semées (et elles seules), registre compris.
-- À jouer à la main si la vitrine doit disparaître.
create or replace function vitrine.effacer()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  v_n int;
  v_total int := 0;
begin
  execute 'set local session_replication_role = replica';
  -- Maillons des pièces semées d'abord, puis les rangs restants resserrés.
  delete from public.caisse_chaine c
   using vitrine.lignes l
   where c.etablissement_id = (select e.etab_id from vitrine.etat e where e.id = 1)
     and ((l.table_nom = 'caisse_tickets' and l.ligne_id = c.ticket_id::text)
       or (l.table_nom = 'caisse_clotures' and l.ligne_id = c.cloture_id::text));
  for t in select distinct l.table_nom from vitrine.lignes l loop
    execute format(
      'delete from public.%I x using vitrine.lignes l where l.table_nom = %L and l.ligne_id = x.id::text',
      t.table_nom, t.table_nom);
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end loop;
  delete from vitrine.lignes;
  update public.caisse_chaine c set rang = c.rang + 1000000000
   where c.etablissement_id = (select e.etab_id from vitrine.etat e where e.id = 1);
  update public.caisse_chaine c set rang = o.n
    from (select x.rang, row_number() over (order by x.rang) as n
            from public.caisse_chaine x
           where x.etablissement_id = (select e.etab_id from vitrine.etat e where e.id = 1)) o
   where c.etablissement_id = (select e.etab_id from vitrine.etat e where e.id = 1) and c.rang = o.rang;
  update public.caisse_compteurs k
     set valeur = (select count(*) from public.caisse_chaine x where x.etablissement_id = k.etablissement_id)
   where k.etablissement_id = (select e.etab_id from vitrine.etat e where e.id = 1) and k.cle = 'chaine';
  perform vitrine.resceller();
  execute 'set local session_replication_role = origin';
  return v_total;
end;
$$;

revoke all on all tables in schema vitrine from public, anon, authenticated;
revoke all on function vitrine.avancer(int), vitrine.rattraper(), vitrine.effacer() from public, anon, authenticated;

insert into vitrine.etat (id, etab_id, jour_ref)
values (1, 'etab-1781452861459', date '2026-11-26')
on conflict (id) do nothing;

-- Chaque heure à la minute 11 : sans effet sauf au premier passage d'un jour neuf.
select cron.schedule('vitrine-demo-rattraper', '11 * * * *', 'select vitrine.rattraper()')
where not exists (select 1 from cron.job where jobname = 'vitrine-demo-rattraper');

-- ── Chaîne d'intégrité de la caisse (même jour, second passage) ─────────────
-- Les empreintes d'un ticket et d'une clôture portent leurs dates : après
-- chaque avance, la chaîne de Démo est recalculée maillon par maillon, dans
-- l'ordre des rangs, avec les fonctions de scellement de la caisse. Le
-- contrôle d'intégrité (caisse_verifier_chaine) reste donc vert.
create or replace function vitrine.resceller()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_etab text;
  v_avant text := current_setting('session_replication_role');
  v_prec text := repeat('0', 64);
  v_emp text;
  v_t public.caisse_tickets;
  v_c public.caisse_clotures;
  v_n int := 0;
begin
  select e.etab_id into v_etab from vitrine.etat e where e.id = 1;
  execute 'set local session_replication_role = replica';
  for r in
    select c.rang, c.genre, c.ticket_id, c.cloture_id
      from public.caisse_chaine c
     where c.etablissement_id = v_etab
     order by c.rang
  loop
    if r.genre = 'cloture' then
      select * into v_c from public.caisse_clotures where id = r.cloture_id;
      v_emp := public.caisse_empreinte(v_prec, public.caisse_contenu_cloture(v_c));
      update public.caisse_clotures set empreinte = v_emp, empreinte_precedente = v_prec where id = r.cloture_id;
    else
      select * into v_t from public.caisse_tickets where id = r.ticket_id;
      if r.genre = 'ticket' then
        v_emp := public.caisse_empreinte(v_prec, public.caisse_contenu_ticket(v_t));
        update public.caisse_tickets set empreinte = v_emp, empreinte_precedente = v_prec where id = r.ticket_id;
      else
        v_emp := public.caisse_empreinte(v_prec, public.caisse_contenu_annulation(v_t));
      end if;
    end if;
    update public.caisse_chaine
       set empreinte = v_emp, empreinte_precedente = v_prec
     where etablissement_id = v_etab and rang = r.rang;
    v_prec := v_emp;
    v_n := v_n + 1;
  end loop;
  execute format('set local session_replication_role = %s', v_avant);
  return v_n;
end;
$$;
revoke all on function vitrine.resceller() from public, anon, authenticated;
