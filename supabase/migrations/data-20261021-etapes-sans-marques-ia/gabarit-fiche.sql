-- Deuxième passe (21.10.2026) : fiches des cartes Brunch, Groupes, Mariages et
-- Séminaires créées avant le 16.10. Réécrit les étapes et/ou les notes
-- (notes_consultant). Un champ laissé à null n'est pas touché.
-- Ligne : ('<id>', '<md5 lu>', array[$s$...$s$] ou null, $s$notes$s$ ou null)
-- md5 lu = md5(coalesce(etapes::text, '') || '|' || coalesce(notes_consultant, ''))
-- Les caractères interdits sont écrits par chr() : aucun d'eux en clair ici.
begin;

create temp table _n (id text primary key, ancien_md5 text not null, etapes text[], notes text) on commit drop;
insert into _n (id, ancien_md5, etapes, notes) values
-- LIGNES
;

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

create or replace function pg_temp.nombres(t text) returns numeric[] language sql immutable as $f$
  select coalesce(array_agg(distinct replace(regexp_replace(m[1], '[ ' || chr(160) || chr(8239) || ']', '', 'g'), ',', '.')::numeric), '{}')
  from regexp_matches(coalesce(t, ''), '(\d{1,3}(?:[ ' || chr(160) || chr(8239) || ']\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)', 'g') m
$f$;

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

-- Tournures interdites (bornes de mot : « sauce qui », « pour quelques » et
-- « au moins 12 » ne sont plus refusés à tort)
create temp table _re on commit drop as
select '([' || chr(8212) || chr(8211) || chr(183) || chr(8594) || ';]|\mvigilance\M|\msoit\M|\mce qui\M|\mafin de\M|\mafin que\M|\mpour que\M|\mpermet de\M|\mpermettent de\M|\mpermettant\M|\mgaranti\w*|par excellence|zéro stress|\m(?:deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|cent|cents|mille)\M|(?<!au )\mmoins \d|pour ?cent)' re;

create temp table _a on commit drop as
select n.id, r.nom, n.ancien_md5,
       md5(coalesce(r.etapes::text, '') || '|' || coalesce(r.notes_consultant, '')) md5_actuel,
       r.id is not null existe, r.etapes ancien_etapes, r.notes_consultant ancien_notes, n.etapes nouv_etapes, n.notes nouv_notes,
       coalesce((select string_agg(x, E'\n' order by o) from jsonb_array_elements_text(case when jsonb_typeof(r.etapes) = 'array' then r.etapes else '[]' end) with ordinality e(x, o)), '') ancien_et_txt,
       coalesce(array_to_string(n.etapes, E'\n'), '') nouv_et_txt,
       case when jsonb_typeof(r.etapes) = 'array' then jsonb_array_length(r.etapes) else 0 end n_ancien,
       coalesce(cardinality(n.etapes), 0) n_nouveau
from _n n
left join public.recettes r on r.id = n.id and r.etablissement_id = 'etab-2';

-- Textes complets avant / après (un champ non fourni garde l'ancien)
create temp table _t on commit drop as
select id, nom,
       ancien_et_txt || E'\n' || coalesce(ancien_notes, '') avant,
       (case when nouv_etapes is null then ancien_et_txt else nouv_et_txt end) || E'\n' || coalesce(nouv_notes, ancien_notes, '') apres,
       (case when nouv_etapes is null then '' else nouv_et_txt end) || E'\n' || coalesce(nouv_notes, '') change
from _a;

create temp table _err on commit drop as
select id, nom, raison from (
  select id, nom, 'fiche introuvable' raison from _a where not existe
  union all
  select id, nom, 'rien à écrire' from _a where existe and nouv_etapes is null and nouv_notes is null
  union all
  select id, nom, 'fiche modifiée en base depuis la lecture' from _a where existe and md5_actuel <> ancien_md5
  union all
  select id, nom, 'étapes : ' || n_nouveau || ' pour ' || n_ancien || ' à l''origine' from _a
   where existe and nouv_etapes is not null and (n_nouveau < 1 or n_nouveau > n_ancien + 2)
  union all
  select id, nom, 'étapes plus longues que l''original' from _a
   where existe and nouv_etapes is not null and length(nouv_et_txt) > length(ancien_et_txt)
  union all
  select id, nom, 'notes plus longues que l''original' from _a
   where existe and nouv_notes is not null and length(nouv_notes) > length(coalesce(ancien_notes, ''))
  union all
  select a.id, a.nom, 'étape vide, numérotée ou de plus de 280 caractères : ' || left(x, 60)
  from _a a cross join lateral unnest(coalesce(a.nouv_etapes, '{}')) x
  where length(btrim(x)) = 0 or length(x) > 280 or x ~* '^\s*(\d+\s*[.)]|étape\M)'
  union all
  select t.id, t.nom, 'nombres perdus : ' || array_to_string(array(
           select unnest(pg_temp.nombres(pg_temp.chiffres(t.avant)))
           except select unnest(pg_temp.nombres(pg_temp.chiffres(t.apres)))), ', ')
  from _t t join _a a using (id) where a.existe
   and not (pg_temp.nombres(pg_temp.chiffres(t.avant)) <@ pg_temp.nombres(pg_temp.chiffres(t.apres)))
  union all
  select t.id, t.nom, 'fiche citée perdue : ' || o.nom
  from _t t join _noms o on position(o.nom in lower(t.avant)) > 0 and position(o.nom in lower(t.apres)) = 0
  union all
  select t.id, t.nom, 'tournure interdite : ' || coalesce(substring(pg_temp.sans_noms(t.change) from (select re from _re)), '?')
  from _t t where pg_temp.sans_noms(t.change) ~* (select re from _re)
) z;

do $$
begin
  if exists (select 1 from _err) then
    raise exception 'REFUS %', (select jsonb_agg(jsonb_build_object('id', id, 'nom', nom, 'raison', raison)) from _err);
  end if;
end $$;

create temp table _old on commit drop as
select r.id, r.etapes, r.notes_consultant from public.recettes r join _n using (id);

update public.recettes r
set etapes = coalesce(to_jsonb(n.etapes), r.etapes),
    notes_consultant = coalesce(n.notes, r.notes_consultant)
from _n n
where r.id = n.id and r.etablissement_id = 'etab-2'
  and md5(coalesce(r.etapes::text, '') || '|' || coalesce(r.notes_consultant, '')) = n.ancien_md5;

do $$
declare k int; c int; j int;
begin
  select count(*) into k from public.recettes r join _n n using (id)
   where (n.etapes is null or r.etapes = to_jsonb(n.etapes)) and (n.notes is null or r.notes_consultant = n.notes);
  if k <> (select count(*) from _n) then
    raise exception 'ECRITURE % fiches sur %', k, (select count(*) from _n);
  end if;
  select count(*) into c from _old o join _n n using (id)
   where (n.etapes is not null and o.etapes is distinct from to_jsonb(n.etapes))
      or (n.notes is not null and o.notes_consultant is distinct from n.notes);
  select count(*) into j from _old o join _n n using (id)
   where exists (select 1 from public.journal_activite ja
                  where ja.ligne_id = o.id and ja.module = 'recettes' and ja.operation = 'UPDATE' and ja.created_at = now()
                    and (n.etapes is null or o.etapes = to_jsonb(n.etapes) or ja.avant->'etapes' = o.etapes)
                    and (n.notes is null or o.notes_consultant = n.notes or ja.avant->>'notes_consultant' = o.notes_consultant));
  if j <> c then
    raise exception 'JOURNAL % anciennes versions gardées sur %', j, c;
  end if;
end $$;

select jsonb_build_object(
  'lot', 'LOT',
  'fiches', (select count(*) from _n),
  'empreinte', (select md5(string_agg(id || E'\n' || coalesce(array_to_string(etapes, E'\n'), '') || E'\n' || coalesce(notes, ''), E'\n\n' order by id)) from _n)
) resultat;

commit;
