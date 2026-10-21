-- Réécriture des étapes, un lot de fiches de Woodland (etab-2).
-- Remplacer LOT par le nom du lot et la ligne marquée LIGNES par les fiches :
--   ('<id>', '<md5 lu>', array[$s$Étape 1$s$, $s$Étape 2$s$]),
-- Le md5 lu est md5(etapes::text) relevé à la lecture de la fiche.
-- Tout le lot est refusé, sans rien écrire, si un contrôle échoue (voir consignes.md).
begin;

create temp table _n (id text primary key, ancien_md5 text not null, etapes text[] not null) on commit drop;
insert into _n (id, ancien_md5, etapes) values
-- LIGNES
;

-- Nombres en lettres convertis en chiffres, pour comparer avant et après
create or replace function pg_temp.chiffres(t text) returns text language plpgsql immutable as $f$
declare
  u  text[] := array['un','deux','trois','quatre','cinq','six','sept','huit','neuf'];
  d  text[] := array['vingt','trente','quarante','cinquante','soixante'];
  dv int[]  := array[20, 30, 40, 50, 60];
  s  text[] := array['deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize','vingt','trente','quarante','cinquante','soixante','cent','mille'];
  sv int[]  := array[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 20, 30, 40, 50, 60, 100, 1000];
  r text := lower(coalesce(t, ''));
  i int; j int;
begin
  -- Le § colle au nombre converti : « en deux 400 g » donne « 2§ 400 », lu
  -- comme 2 et 400, et non comme le nombre 2 400 (fiche Fraisier, 21.10.2026).
  r := regexp_replace(r, '\mquatre-vingt-dix\M', '90§', 'g');
  r := regexp_replace(r, '\mquatre-vingts?\M', '80§', 'g');
  r := regexp_replace(r, '\msoixante-dix\M', '70§', 'g');
  r := regexp_replace(r, '\mdix-sept\M', '17§', 'g');
  r := regexp_replace(r, '\mdix-huit\M', '18§', 'g');
  r := regexp_replace(r, '\mdix-neuf\M', '19§', 'g');
  for i in 1..5 loop
    r := regexp_replace(r, '\m' || d[i] || '[- ]et[- ]un\M', (dv[i] + 1)::text || '§', 'g');
    for j in 1..9 loop
      r := regexp_replace(r, '\m' || d[i] || '-' || u[j] || '\M', (dv[i] + j)::text || '§', 'g');
    end loop;
  end loop;
  for j in 2..9 loop
    r := regexp_replace(r, '\m' || u[j] || ' cents?\M', (j * 100)::text || '§', 'g');
  end loop;
  for i in 1..array_length(s, 1) loop
    r := regexp_replace(r, '\m' || s[i] || '\M', sv[i]::text || '§', 'g');
  end loop;
  r := regexp_replace(r, '\mmoins (\d)', '-\1', 'g');
  return r;
end $f$;

-- Ensemble des nombres d'un texte (1 280 = 1280, 4,5 = 4.5)
create or replace function pg_temp.nombres(t text) returns numeric[] language sql immutable as $f$
  select coalesce(array_agg(distinct replace(regexp_replace(m[1], '[ \u00a0\u202f]', '', 'g'), ',', '.')::numeric), '{}')
  from regexp_matches(coalesce(t, ''), '(\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)', 'g') m
$f$;

-- Noms de fiches de l'établissement (12 caractères et plus)
create temp table _noms on commit drop as
select distinct lower(nom) nom from public.recettes
where etablissement_id = 'etab-2' and coalesce(statut, '') <> 'archivée' and length(nom) >= 12;

create or replace function pg_temp.sans_noms(t text) returns text language plpgsql as $f$
declare r text := lower(coalesce(t, '')); n text;
begin
  for n in select nom from _noms order by length(nom) desc loop
    if position(n in r) > 0 then r := replace(r, n, ' '); end if;
  end loop;
  return r;
end $f$;

create temp table _a on commit drop as
select n.id, r.nom, n.ancien_md5, md5(r.etapes::text) md5_actuel, r.etapes ancien, n.etapes nouveau,
       (select string_agg(x, E'\n' order by o) from jsonb_array_elements_text(r.etapes) with ordinality e(x, o)) ancien_txt,
       array_to_string(n.etapes, E'\n') nouveau_txt,
       jsonb_array_length(r.etapes) n_ancien, cardinality(n.etapes) n_nouveau
from _n n
left join public.recettes r on r.id = n.id and r.etablissement_id = 'etab-2';

create temp table _err on commit drop as
select id, nom, raison from (
  select id, nom, 'fiche introuvable' raison from _a where ancien is null
  union all
  select id, nom, 'fiche modifiée en base depuis la lecture' from _a where ancien is not null and md5_actuel <> ancien_md5
  union all
  select id, nom, 'étapes : ' || n_nouveau || ' pour ' || n_ancien || ' à l''origine' from _a
   where ancien is not null and (n_nouveau < 1 or n_nouveau > n_ancien + 2)
  union all
  select id, nom, 'texte plus long que l''original (' || length(nouveau_txt) || ' pour ' || length(ancien_txt) || ')' from _a
   where ancien is not null and length(nouveau_txt) > length(ancien_txt)
  union all
  select a.id, a.nom, 'étape vide, numérotée ou de plus de 280 caractères : ' || left(x, 60)
  from _a a cross join lateral unnest(a.nouveau) x
  where length(btrim(x)) = 0 or length(x) > 280 or x ~* '^\s*(\d+\s*[.)]|étape\M)'
  union all
  select id, nom, 'nombres perdus : ' || array_to_string(array(
           select unnest(pg_temp.nombres(pg_temp.chiffres(ancien_txt)))
           except select unnest(pg_temp.nombres(pg_temp.chiffres(nouveau_txt)))), ', ')
  from _a where ancien is not null
   and not (pg_temp.nombres(pg_temp.chiffres(ancien_txt)) <@ pg_temp.nombres(pg_temp.chiffres(nouveau_txt)))
  union all
  select a.id, a.nom, 'fiche citée perdue : ' || o.nom
  from _a a join _noms o on position(o.nom in lower(a.ancien_txt)) > 0 and position(o.nom in lower(a.nouveau_txt)) = 0
  union all
  select id, nom, 'tournure interdite : ' || coalesce(substring(pg_temp.sans_noms(nouveau_txt) from
           '([\u2014\u2013\u00b7\u2192;]|\mvigilance\M|\msoit\M|ce qui|afin de|afin que|pour que|permet de|permettent de|permettant|garanti\w*|\m(?:deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|cent|cents|mille)\M|moins \d|pour ?cent)'), '?')
  from _a
  where pg_temp.sans_noms(nouveau_txt) ~* '([\u2014\u2013\u00b7\u2192;]|\mvigilance\M|\msoit\M|ce qui|afin de|afin que|pour que|permet de|permettent de|permettant|garanti\w*|\m(deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|cent|cents|mille)\M|moins \d|pour ?cent)'
) z;

do $$
begin
  if exists (select 1 from _err) then
    raise exception 'REFUS %', (select jsonb_agg(jsonb_build_object('id', id, 'nom', nom, 'raison', raison)) from _err);
  end if;
end $$;

-- Écriture, puis preuve : chaque fiche porte ses nouvelles étapes et le
-- journal d'activité a gardé l'ancienne version de chacune.
create temp table _old on commit drop as
select r.id, r.etapes from public.recettes r join _n using (id);

update public.recettes r set etapes = to_jsonb(n.etapes)
from _n n
where r.id = n.id and r.etablissement_id = 'etab-2' and md5(r.etapes::text) = n.ancien_md5;

do $$
declare k int; c int; j int;
begin
  select count(*) into k from public.recettes r join _n n using (id) where r.etapes = to_jsonb(n.etapes);
  if k <> (select count(*) from _n) then
    raise exception 'ECRITURE % fiches sur %', k, (select count(*) from _n);
  end if;
  select count(*) into c from _old o join _n n using (id) where o.etapes <> to_jsonb(n.etapes);
  select count(*) into j from public.journal_activite ja join _old o on o.id = ja.ligne_id
   where ja.module = 'recettes' and ja.operation = 'UPDATE' and ja.created_at = now()
     and ja.avant->'etapes' = o.etapes;
  if j <> c then
    raise exception 'JOURNAL % anciennes versions gardées sur %', j, c;
  end if;
end $$;

select jsonb_build_object(
  'lot', 'LOT',
  'fiches', (select count(*) from _n),
  'empreinte', (select md5(string_agg(id || E'\n' || array_to_string(etapes, E'\n'), E'\n\n' order by id)) from _n)
) resultat;

commit;
