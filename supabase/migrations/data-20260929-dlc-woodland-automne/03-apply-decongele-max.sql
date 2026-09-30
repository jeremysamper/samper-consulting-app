-- ═══════════════════════════════════════════════════════════════════════════
-- Durée après décongélation — Woodland Village, Carte Automnale, TROISIÈME PASSE
-- carte-1787604411839-oe3j · 41 fiches congelables · 29.09.2026
--
-- Demande de Jérémy : « remonte aussi la décongélation au max ».
-- Règle : décongelé, la fiche garde sa durée au frais, plafonnée à 7 j
-- (plafond des cases Divers de l'onglet Étiquettes DLC). Les produits crus ou
-- fragiles au dégel restent à 3 j : entrecôte, cerf, chevreuil tataki, pigeon
-- (filets crus), carpaccio de poulpe pressé (tranché surgelé), pâte à
-- tagliolini et cromesquis (œuf cru, cuits directement du surgelé).
-- Résultat appliqué : 7 fiches à 3 j, 2 à 5 j (namelaka, orge perlé), 32 à 7 j.
--
-- Retour arrière : les 41 fiches étaient toutes à 2 j (voir en bas).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

with r as (
  select distinct pr.recette_id id
  from carte_plats cp join plat_recettes pr on pr.plat_id = cp.plat_id
  where cp.carte_id = 'carte-1787604411839-oe3j'
)
update recettes rc
set duree_vie_decongele_jours = case
  when rc.id in (
    'rec-1787607253393-17616',  -- Entrecôte parée
    'rec-1787607253266-90573',  -- Médaillons de cerf parés
    'rec-1787607253149-58976',  -- Chevreuil saisi pour tataki
    'rec-1787607253393-53548',  -- Pigeon, filets et cuisses confites
    'rec-1787607253149-46695',  -- Carpaccio de poulpe pressé
    'rec-1787607253393-36608',  -- Pâte à tagliolini fraîche
    'rec-1787607253150-5915'    -- Cromesquis de raclette AOP
  ) then 3
  else least(rc.duree_vie_jours, 7)
end
from r
where rc.id = r.id
  and rc.etablissement_id = 'etab-2'
  and rc.duree_vie_congele_jours is not null
  and rc.duree_vie_decongele_jours = 2;

commit;

-- Retour arrière :
-- update recettes rc set duree_vie_decongele_jours = 2
-- from (select distinct pr.recette_id id from carte_plats cp
--       join plat_recettes pr on pr.plat_id = cp.plat_id
--       where cp.carte_id = 'carte-1787604411839-oe3j') r
-- where rc.id = r.id and rc.etablissement_id = 'etab-2'
--   and rc.duree_vie_congele_jours is not null;
