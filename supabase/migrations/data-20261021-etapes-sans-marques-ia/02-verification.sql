-- Après les 8 lots : les 647 fiches du 16.10 réécrites une fois chacune, plus
-- aucune tournure interdite, ancienne version de chacune gardée au journal.
with lot as (
  select id from public.recettes
  where etablissement_id = 'etab-2' and created_at::date = '2026-10-16' and coalesce(statut, '') <> 'archivée'
),
j as (
  select ja.ligne_id, count(*) n
  from public.journal_activite ja join lot on lot.id = ja.ligne_id
  where ja.module = 'recettes' and ja.operation = 'UPDATE' and ja.colonnes_modifiees = array['etapes']
    and ja.acteur_id is null and ja.created_at::date = '2026-10-21'
  group by ja.ligne_id
),
t as (
  select r.id, lower(string_agg(x, E'\n' order by o)) txt
  from public.recettes r join lot using (id)
  cross join lateral jsonb_array_elements_text(r.etapes) with ordinality e(x, o)
  group by r.id
)
select
  (select count(*) from lot) fiches,
  (select count(*) from j) reecrites,
  (select count(*) from j where n > 1) reecrites_plusieurs_fois,
  (select count(*) from t where txt ~ '\mvigilance\M') vigilance,
  (select count(*) from t where txt ~ '[;\u2014\u2013\u00b7\u2192]') ponctuation_interdite,
  (select count(*) from t where txt ~ '\msoit\M') soit,
  (select count(*) from t where txt ~ '(ce qui|afin de|afin que|pour que|permet de|permettent de|permettant)') deductions,
  (select count(*) from t where txt ~ 'moins \d|pour ?cent') moins_pour_cent,
  (select count(*) from t where exists (select 1 from jsonb_array_elements_text((select etapes from public.recettes where id = t.id)) x where length(x) > 280)) etapes_trop_longues;
