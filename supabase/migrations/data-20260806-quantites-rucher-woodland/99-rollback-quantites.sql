-- 06.08.2026 · Retour arrière des quantités (Rucher + Woodland)
-- A n'exécuter que pour annuler 01-apply-unites-ml.sql et 02-apply-portions.sql.

begin;

-- ─── Contrôle avant retour arrière ────────────────────────────────────────
-- Doit renvoyer 255 : le nombre de lignes converties le 06.08.2026. Un écart
-- signifie que les fiches ont bougé depuis (saisie brigade, réimport) : dans
-- ce cas ne PAS dérouler ce script, repartir de la sauvegarde JSON
-- (recettes-rucher-woodland-avant-20260806.json) qui porte l'état exact.
select count(*) as lignes_en_ml_attendu_255
from recettes r, jsonb_array_elements(r.ingredients) i
where r.etablissement_id in ('etab-1777157340476','etab-2')
  and i->>'unite' = 'ml'
  and i->>'id' not in (
    -- 49 lignes déjà en ml AVANT l'opération : elles ne doivent pas repartir
    -- en grammes, elles n'ont jamais été touchées.
    'i-1777318574109-4','i-1777158590638-0','i-1777158590638-1','i-1777158672700-0',
    'i-1777158672700-1','i-1777158672700-2','i-1777158661826-6','i-1778762044410-4',
    'i-1777158625026-3','i-1777158628699-3','i-1777158634203-1','i-1777158634203-2',
    'i-1777158634203-3','i-1777158637659-0','i-1777158643303-0','i-1777158643303-1',
    'i-1777158666498-1','i-1777158677032-0','i-1777158677032-1','i1783293963454_3_390',
    'i-1777158680790-1','i-1777158683855-0','i-1777158683855-1','i-1777158683855-2',
    'i-1777158691881-2','i-1777158703129-7','i-1777158717216-1','i-1777158730146-6',
    'i-1777158741306-1','i-1777158752963-1','i1783293963783_4_59','i-1777158759669-3',
    'i-1777158764118-2','i-1777158764118-6','i-1777158767920-0','i-1777158767920-1',
    'i-1777158771713-2','i1783293963454_4_798','i1783293963454_5_279','i-1777158777456-1',
    'i-1777158783772-2','i-1777158783772-3','i-1777158787855-2','i1782062110426_1_134',
    'i-1777158796582-2','i-1777158826363-2','i-1777158826363-4','i1777318857739',
    'i1777318880762'
  );

-- ─── 1. Unités : ml -> g, sauf les 49 lignes qui étaient déjà en ml ───────
with elems as (
  select r.id, t.ord, t.i,
         (t.i->>'unite' = 'ml' and t.i->>'id' not in (
            'i-1777318574109-4','i-1777158590638-0','i-1777158590638-1','i-1777158672700-0',
            'i-1777158672700-1','i-1777158672700-2','i-1777158661826-6','i-1778762044410-4',
            'i-1777158625026-3','i-1777158628699-3','i-1777158634203-1','i-1777158634203-2',
            'i-1777158634203-3','i-1777158637659-0','i-1777158643303-0','i-1777158643303-1',
            'i-1777158666498-1','i-1777158677032-0','i-1777158677032-1','i1783293963454_3_390',
            'i-1777158680790-1','i-1777158683855-0','i-1777158683855-1','i-1777158683855-2',
            'i-1777158691881-2','i-1777158703129-7','i-1777158717216-1','i-1777158730146-6',
            'i-1777158741306-1','i-1777158752963-1','i1783293963783_4_59','i-1777158759669-3',
            'i-1777158764118-2','i-1777158764118-6','i-1777158767920-0','i-1777158767920-1',
            'i-1777158771713-2','i1783293963454_4_798','i1783293963454_5_279','i-1777158777456-1',
            'i-1777158783772-2','i-1777158783772-3','i-1777158787855-2','i1782062110426_1_134',
            'i-1777158796582-2','i-1777158826363-2','i-1777158826363-4','i1777318857739',
            'i1777318880762'
         )) as a_remettre
  from recettes r,
       lateral (select x.i, x.ord from jsonb_array_elements(r.ingredients) with ordinality as x(i, ord)) t
  where r.etablissement_id in ('etab-1777157340476','etab-2')
), recomposees as (
  select id,
         jsonb_agg(case when a_remettre then i || jsonb_build_object('unite','g') else i end order by ord) as anciens,
         count(*) filter (where a_remettre) as modifiees
  from elems group by id
)
update recettes r
set ingredients = c.anciens
from recomposees c
where r.id = c.id and c.modifiees > 0;

-- ─── 2. Portions : valeurs d'avant le 06.08.2026 ──────────────────────────
with cible(id, portions) as (values
  -- écarts relevés contre fiche source
  ('rec-1782062101967-54830', 20), ('rec-1783293963852-70310', 20),
  ('rec-1783293963922-43770', 20), ('rec-1783371749149-41205', 300),
  ('rec-1783371748852-18174', 35), ('rec-1783371748852-29691', 30),
  -- préparations de batch : toutes étaient à 1
  ('rec-1782782357203-75889', 1), ('rec-1782782357203-92381', 1),
  ('rec-1782782357204-15761', 1), ('rec-1782782357204-95546', 1),
  ('rec-1782782357204-86457', 1), ('rec-1782782357204-78856', 1),
  ('rec-1782782357204-58314', 1), ('rec-1782782357204-90680', 1),
  ('rec-1782782357203-13675', 1), ('rec-1782782357204-7390',  1),
  ('rec-1782727652041-39423', 1), ('rec-1782727643733-15149', 1),
  ('rec-1782727651977-28677', 1), ('rec-1782727643823-7052',  1),
  ('rec-1780444936467-8222',  1), ('rec-1783293963540-29464', 1),
  ('rec-1780444936467-7270',  1), ('rec-1783293963783-70453', 1),
  ('rec-1783293963783-31698', 1), ('rec-1783468153853-12393', 1)
)
update recettes r set portions = c.portions
from cible c where r.id = c.id;

-- cordials : tous étaient à 120
update recettes set portions = 120
where etablissement_id = 'etab-1777157340476' and nom like 'Cordial%';

commit;
