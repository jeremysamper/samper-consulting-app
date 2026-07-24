-- ═══════════════════════════════════════════════════════════════
-- Nettoyage des allergènes hors référentiel
--
-- Contexte : la colonne « allergènes » des fichiers importés était
-- stockée telle quelle dans recettes.allergenes_ids, puis recopiée
-- dans fiches_salle.allergenes par la génération IA. D'où du texte
-- libre traité comme un id : « aucun », « lait », « crustaces si
-- ecrevisse ». Conséquences : ces valeurs échappent aux filtres
-- allergènes, laissent une case vide dans le tableau allergènes de
-- la carte client, et n'ont aucune puce dans les formulaires (donc
-- impossibles à retirer depuis l'app).
--
-- Le correctif applicatif (src/utils/allergenes.js) ferme l'entrée.
-- Cette migration répare l'existant, à partir de la liste exhaustive
-- des valeurs relevées en prod le 24/07/2026 (aucune regex
-- générique : chaque valeur est arbitrée explicitement).
--
-- Règles :
--  · alias d'un allergène réel  -> id canonique, sans note
--  · valeur qualifiée           -> id canonique + texte d'origine
--                                  conservé en note (la salle garde
--                                  la nuance « si écrevisse »)
--  · rien à déclarer            -> supprimée
-- On ne retire jamais un allergène : dans le doute on déclare. Une
-- valeur inconnue apparue depuis l'arbitrage est conservée telle
-- quelle plutôt que supprimée en silence (l'app sait l'afficher et
-- la faire retirer à la main).
--
-- Idempotente : relancer ne fait rien de plus (les valeurs traitées
-- ne sont plus présentes, et les notes ne sont ajoutées qu'une fois).
--
-- Deux instructions autonomes, sans table temporaire ni transaction
-- explicite : la table d'arbitrage est répétée dans chaque UPDATE pour
-- que le fichier donne le même résultat quel que soit le runner (CLI
-- Supabase, psql, console SQL), y compris en rejeu partiel.
-- ═══════════════════════════════════════════════════════════════

-- ─── Recettes ───
with _allerg_map(valeur, ids, note) as (values
  -- Alias : même allergène, id non canonique.
  ('lait',                                                               array['lactose'],      null::text),
  ('fruits a coque',                                                     array['fruits_coque'], null),
  ('œuf',                                                                array['oeufs'],        null),
  ('œufs',                                                               array['oeufs'],        null),
  ('poisson',                                                            array['poissons'],     null),
  -- Rien à déclarer : bruit, ou fragment produit par un découpage sur
  -- la virgule à l'intérieur d'une parenthèse.
  ('aucun',                                                              array[]::text[],       null),
  ('aucun allergene majeur',                                             array[]::text[],       null),
  ('aucun declare (sans gluten',                                         array[]::text[],       null),
  ('sans lactose',                                                       array[]::text[],       null),
  ('sans lactose)',                                                      array[]::text[],       null),
  ('sans œuf)',                                                          array[]::text[],       null),
  -- Valeurs qualifiées : allergène déclaré + nuance conservée.
  ('crustaces si ecrevisse',                                             array['crustaces'],    'crustacés si écrevisse'),
  ('gluten (orge)',                                                      array['gluten'],       'gluten (orge)'),
  ('gluten possible selon la marque de cornflakes',                      array['gluten'],       'gluten possible selon la marque de cornflakes'),
  ('lait (beurre optionnel)',                                            array['lactose'],      'lait (beurre optionnel)'),
  ('lait (beurre) — non vegan dans cette version',                       array['lactose'],      'lait (beurre), non vegan dans cette version'),
  ('lait (sauce)',                                                       array['lactose'],      'lait (sauce)'),
  ('lait possible',                                                      array['lactose'],      'lait possible'),
  ('fruits a coque (selon mix)',                                         array['fruits_coque'], 'fruits à coque (selon mix)'),
  ('traces d''amande par le noyau',                                      array['fruits_coque'], 'traces d''amande par le noyau'),
  ('moutarde selon marque',                                              array['moutarde'],     'moutarde selon marque'),
  ('poisson (anchois)',                                                  array['poissons'],     'poisson (anchois)'),
  ('poisson (sauce worcestershire)',                                     array['poissons'],     'poisson (sauce worcestershire)'),
  ('sesame possible selon la marque',                                    array['sesame'],       'sésame possible selon la marque'),
  ('soja/tamari',                                                        array['soja'],         'soja (tamari)'),
  ('sulfites (vin)',                                                     array['sulfites'],     'sulfites (vin)'),
  ('sulfites (vinaigre de riz / echalotes)',                             array['sulfites'],     'sulfites (vinaigre de riz, échalotes)'),
  ('sulfites possibles',                                                 array['sulfites'],     'sulfites possibles'),
  ('sulfites eventuels (infusion de fruits seches)',                     array['sulfites'],     'sulfites éventuels (infusion de fruits secs)'),
  ('aucun (garniture abricot seche servie a part : sulfites possibles)', array['sulfites'],     'garniture abricot sec servie à part : sulfites possibles'),
  ('verifier poisson et celeri sur l''etiquette de la bisque',           array['poissons','celeri'], 'vérifier poisson et céleri sur l''étiquette de la bisque'),
  -- Aucun allergène déclaré, mais consigne à conserver.
  ('aucun (contient du miel)',                                           array[]::text[],       'contient du miel'),
  ('verifier la composition du fond',                                    array[]::text[],       'vérifier la composition du fond')
), _allerg_ordre(id, ord) as (
  -- Ordre d'affichage canonique, pour ne pas réécrire les tableaux
  -- dans un ordre aléatoire.
  select id, ord from unnest(array[
    'gluten','lactose','oeufs','poissons','crustaces','fruits_coque','sulfites',
    'arachides','soja','celeri','moutarde','sesame','mollusques','lupin'
  ]) with ordinality as t(id, ord)
), cible as (
  select r.id, r.allergenes_ids, r.notes_consultant
  from recettes r
  where exists (
    select 1 from unnest(coalesce(r.allergenes_ids, '{}')) v
    join _allerg_map m on m.valeur = v
  )
), calcul as (
  select
    c.id,
    -- allergènes canoniques : ceux déjà corrects + ceux issus du mapping.
    (select coalesce(array_agg(o.id order by o.ord), '{}')
       from _allerg_ordre o
      where exists (select 1 from unnest(c.allergenes_ids) v where v = o.id)
         or exists (select 1 from unnest(c.allergenes_ids) v
                    join _allerg_map m on m.valeur = v
                    where o.id = any(m.ids)))
    ||
    -- valeur inconnue non arbitrée : conservée telle quelle.
    (select coalesce(array_agg(distinct v), '{}')
       from unnest(c.allergenes_ids) v
      where v not in (select id from _allerg_ordre)
        and v not in (select valeur from _allerg_map)) as ids,
    (select string_agg(distinct m.note, ' · ')
       from unnest(c.allergenes_ids) v
       join _allerg_map m on m.valeur = v
      where m.note is not null) as note
  from cible c
)
update recettes r
set allergenes_ids = calcul.ids,
    notes_consultant = case
      when calcul.note is null then r.notes_consultant
      when coalesce(r.notes_consultant, '') like '%Précisions allergènes%' then r.notes_consultant
      else nullif(trim(both e'\n' from coalesce(r.notes_consultant, '') || e'\n' || 'Précisions allergènes : ' || calcul.note), '')
    end
from calcul
where r.id = calcul.id;

-- ─── Fiches salle ───
with _allerg_map(valeur, ids, note) as (values
  ('lait',                                                               array['lactose'],      null::text),
  ('fruits a coque',                                                     array['fruits_coque'], null),
  ('œuf',                                                                array['oeufs'],        null),
  ('œufs',                                                               array['oeufs'],        null),
  ('poisson',                                                            array['poissons'],     null),
  ('aucun',                                                              array[]::text[],       null),
  ('aucun allergene majeur',                                             array[]::text[],       null),
  ('aucun declare (sans gluten',                                         array[]::text[],       null),
  ('sans lactose',                                                       array[]::text[],       null),
  ('sans lactose)',                                                      array[]::text[],       null),
  ('sans œuf)',                                                          array[]::text[],       null),
  ('crustaces si ecrevisse',                                             array['crustaces'],    'crustacés si écrevisse'),
  ('gluten (orge)',                                                      array['gluten'],       'gluten (orge)'),
  ('gluten possible selon la marque de cornflakes',                      array['gluten'],       'gluten possible selon la marque de cornflakes'),
  ('lait (beurre optionnel)',                                            array['lactose'],      'lait (beurre optionnel)'),
  ('lait (beurre) — non vegan dans cette version',                       array['lactose'],      'lait (beurre), non vegan dans cette version'),
  ('lait (sauce)',                                                       array['lactose'],      'lait (sauce)'),
  ('lait possible',                                                      array['lactose'],      'lait possible'),
  ('fruits a coque (selon mix)',                                         array['fruits_coque'], 'fruits à coque (selon mix)'),
  ('traces d''amande par le noyau',                                      array['fruits_coque'], 'traces d''amande par le noyau'),
  ('moutarde selon marque',                                              array['moutarde'],     'moutarde selon marque'),
  ('poisson (anchois)',                                                  array['poissons'],     'poisson (anchois)'),
  ('poisson (sauce worcestershire)',                                     array['poissons'],     'poisson (sauce worcestershire)'),
  ('sesame possible selon la marque',                                    array['sesame'],       'sésame possible selon la marque'),
  ('soja/tamari',                                                        array['soja'],         'soja (tamari)'),
  ('sulfites (vin)',                                                     array['sulfites'],     'sulfites (vin)'),
  ('sulfites (vinaigre de riz / echalotes)',                             array['sulfites'],     'sulfites (vinaigre de riz, échalotes)'),
  ('sulfites possibles',                                                 array['sulfites'],     'sulfites possibles'),
  ('sulfites eventuels (infusion de fruits seches)',                     array['sulfites'],     'sulfites éventuels (infusion de fruits secs)'),
  ('aucun (garniture abricot seche servie a part : sulfites possibles)', array['sulfites'],     'garniture abricot sec servie à part : sulfites possibles'),
  ('verifier poisson et celeri sur l''etiquette de la bisque',           array['poissons','celeri'], 'vérifier poisson et céleri sur l''étiquette de la bisque'),
  ('aucun (contient du miel)',                                           array[]::text[],       'contient du miel'),
  ('verifier la composition du fond',                                    array[]::text[],       'vérifier la composition du fond')
), _allerg_ordre(id, ord) as (
  select id, ord from unnest(array[
    'gluten','lactose','oeufs','poissons','crustaces','fruits_coque','sulfites',
    'arachides','soja','celeri','moutarde','sesame','mollusques','lupin'
  ]) with ordinality as t(id, ord)
), cible as (
  select f.id, f.allergenes, f.infos_service
  from fiches_salle f
  where exists (
    select 1 from unnest(coalesce(f.allergenes, '{}')) v
    join _allerg_map m on m.valeur = v
  )
), calcul as (
  select
    c.id,
    (select coalesce(array_agg(o.id order by o.ord), '{}')
       from _allerg_ordre o
      where exists (select 1 from unnest(c.allergenes) v where v = o.id)
         or exists (select 1 from unnest(c.allergenes) v
                    join _allerg_map m on m.valeur = v
                    where o.id = any(m.ids)))
    ||
    (select coalesce(array_agg(distinct v), '{}')
       from unnest(c.allergenes) v
      where v not in (select id from _allerg_ordre)
        and v not in (select valeur from _allerg_map)) as ids,
    (select string_agg(distinct m.note, ' · ')
       from unnest(c.allergenes) v
       join _allerg_map m on m.valeur = v
      where m.note is not null) as note
  from cible c
)
update fiches_salle f
set allergenes = calcul.ids,
    infos_service = case
      when calcul.note is null then f.infos_service
      when coalesce(f.infos_service, '') like '%Précisions allergènes%' then f.infos_service
      else nullif(trim(both ' ' from coalesce(f.infos_service, '') || ' ' || 'Précisions allergènes : ' || calcul.note), '')
    end
from calcul
where f.id = calcul.id;

-- ─── Vérification (doit renvoyer 0 ligne) ───
-- select 'recette' as src, id, allergenes_ids from recettes
--   where exists (select 1 from unnest(coalesce(allergenes_ids,'{}')) v
--                 where v not in ('gluten','lactose','oeufs','poissons','crustaces','fruits_coque',
--                                 'sulfites','arachides','soja','celeri','moutarde','sesame','mollusques','lupin'))
-- union all
-- select 'fiche', id, allergenes from fiches_salle
--   where exists (select 1 from unnest(coalesce(allergenes,'{}')) v
--                 where v not in ('gluten','lactose','oeufs','poissons','crustaces','fruits_coque',
--                                 'sulfites','arachides','soja','celeri','moutarde','sesame','mollusques','lupin'));
