-- Annule la troisième passe (vérification stricte de la carte Brunch,
-- 21.10.2026 à 7 h 53, 58 corrections sur 39 fiches : étapes, notes, noms de
-- recettes, noms d'ingrédients). Source : le journal d'activité, transaction
-- du 2026-10-21 05:53:03.962167+00 (UTC).
-- Plusieurs corrections d'une même fiche ont la même heure : la version
-- d'origine d'une colonne est l'« avant » qui n'est l'« après » d'aucune autre
-- ligne de la même fiche. Une fiche retouchée depuis n'est pas remise en
-- arrière : la requête finale la liste.
begin;

create temp table _j on commit drop as
select ja.ligne_id id, c col, ja.avant->c avant, ja.apres->c apres
from public.journal_activite ja, unnest(ja.colonnes_modifiees) c
where ja.module = 'recettes' and ja.operation = 'UPDATE' and ja.acteur_id is null
  and ja.etablissement_id = 'etab-2' and ja.created_at = '2026-10-21 05:53:03.962167+00';

-- origine = avant qui n'est l'après d'aucune autre ligne ; final = après qui
-- n'est l'avant d'aucune autre ligne
create temp table _o on commit drop as
select a.id, a.col,
       (select x.avant from _j x where x.id = a.id and x.col = a.col
          and not exists (select 1 from _j y where y.id = x.id and y.col = x.col and y.apres = x.avant) limit 1) origine,
       (select x.apres from _j x where x.id = a.id and x.col = a.col
          and not exists (select 1 from _j y where y.id = x.id and y.col = x.col and y.avant = x.apres) limit 1) final
from (select distinct id, col from _j) a;

update public.recettes r set
  etapes           = coalesce((select o.origine from _o o where o.id = r.id and o.col = 'etapes' and r.etapes = o.final), r.etapes),
  notes_consultant = coalesce((select o.origine #>> '{}' from _o o where o.id = r.id and o.col = 'notes_consultant' and to_jsonb(r.notes_consultant) = o.final), r.notes_consultant),
  nom              = coalesce((select o.origine #>> '{}' from _o o where o.id = r.id and o.col = 'nom' and to_jsonb(r.nom) = o.final), r.nom),
  ingredients      = coalesce((select o.origine from _o o where o.id = r.id and o.col = 'ingredients' and r.ingredients = o.final), r.ingredients)
where r.id in (select id from _o);

select (select count(distinct id) from _o) fiches,
       (select jsonb_agg(distinct r.nom) from public.recettes r join _o o on o.id = r.id
         where (o.col = 'etapes' and r.etapes is distinct from o.origine)
            or (o.col = 'notes_consultant' and to_jsonb(r.notes_consultant) is distinct from o.origine)
            or (o.col = 'nom' and to_jsonb(r.nom) is distinct from o.origine)
            or (o.col = 'ingredients' and r.ingredients is distinct from o.origine)) non_remises;

commit;
