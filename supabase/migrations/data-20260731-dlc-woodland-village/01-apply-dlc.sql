-- ═══════════════════════════════════════════════════════════════════════════
-- Durées de vie (DLC) — Woodland Village, Carte Estivale 2026
-- carte-1783280207338-590o · 56 fiches recette · 31.07.2026
--
-- Même barème que Hotel Central (cf. data-20260731-dlc-hotel-central) :
--   duree_vie_jours         = 3 / 5 / 7 selon la stabilité de la préparation
--   duree_vie_congele_jours = durée réelle à -18 °C (NULL = ne se congèle pas)
--   duree_vie_decongele_jours inchangé à 2 j, sauf omble chevalier (1 j)
--
-- Une exception au barème, assumée : les langoustines basse température sont
-- à 1 jour. Leur fiche plafonne à 24 h entre 0 et 2 °C ; poser 3 jours sur
-- l'étiquette serait plus permissif que la fiche elle-même.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

update recettes r
set duree_vie_jours = v.dlc, duree_vie_congele_jours = v.congele
from (values

  -- ─── Viandes, volailles, poissons ───────────────────────────────────────
  ('rec-1783293963130-34329', 7, 90),    -- Agneau épaule 36 h : sous-vide 64 °C, forte pasteurisation
  ('rec-1783293963454-16013', 3, 90),    -- Coquelet basse température (la fiche dit 3 jours)
  ('rec-1783293963783-60274', 5, 90),    -- Pintade suprême : sous-vide 69 °C, poche intacte
  ('rec-1783371749149-81342', 3, 90),    -- Blanc de poulet mariné ayran : SV 62 °C, marinade lactée
  ('rec-1783293963852-56679', 5, 60),    -- Tataki de canard : cœur cru, sous-vide
  ('rec-1783371749149-3774',  1, NULL),  -- Langoustines BT : fiche 24 h max, jamais recongelées
  ('rec-1783371748852-3529',  3, NULL),  -- Truite crudo : poisson cru taillé à la commande
  ('rec-1783371749149-56017', 3, 60),    -- Omble chevalier : mise au sel, poisson cru

  -- ─── Pâtisserie, boulangerie, pâtes ─────────────────────────────────────
  ('rec-1783293963130-23545', 3, 60),    -- Baba
  ('rec-1783371748852-29691', 5, 90),    -- Sirop d'imbibage abricot : sucre cuit
  ('rec-1783293963852-52127', 3, 60),    -- Foccaccia (précuite blonde, congelée à plat)
  ('rec-1783293963783-31698', 3, 60),    -- Linguine fraîches aux œufs
  ('rec-1783293963130-81014', 7, NULL),  -- Sablé sésame noir : sec, boîte hermétique
  ('rec-1783293963923-37274', 3, NULL),  -- Meringue italienne en poche
  ('rec-1783371749149-41205', 7, NULL),  -- Meringue séchée : reprend l'humidité à la décongélation
  ('rec-1783371748852-39895', 3, NULL),  -- Crémeux chocolat blanc : gélatine
  ('rec-1783771977742-69352', 5, NULL),  -- Crémeux yuzu : acide et cuit, mais gélatine
  ('rec-1783293963454-49970', 7, NULL),  -- Confiture de lait : boîte stérilisée 3 h
  ('rec-1783370396764-jo6hph', 3, 90),   -- Croquette d'orge : conçue pour être frite congelée

  -- ─── Gels (agar) ────────────────────────────────────────────────────────
  ('rec-1783293963454-53854', 5, NULL),  -- Gel d'abricot
  ('rec-1783293963454-26995', 5, NULL),  -- Gel de café
  ('rec-1783293963540-71773', 5, NULL),  -- Gel de citron
  ('rec-1783371748852-29808', 5, NULL),  -- Gel passion coco

  -- ─── Fruits confits ─────────────────────────────────────────────────────
  ('rec-1783293963852-53369', 7, 180),   -- Abricot confit : sucre et vinaigre
  ('rec-1783293963852-91548', 7, 180),   -- Cerises confites

  -- ─── Sauces, jus, condiments, huiles ────────────────────────────────────
  ('rec-1783293963703-54955', 5, 90),    -- Beurre aux agrumes : échalote et herbes crues
  ('rec-1777158672700',       5, 90),    -- Bouillon vin rouge : fond filtré
  ('rec-1783371748852-18174', 3, 90),    -- Jus de volaille à la mélisse : jus de finition
  ('rec-1783293963852-56600', 7, NULL),  -- Réduction de Cornalin : vin réduit sirupeux
  ('rec-1783371748852-22829', 7, NULL),  -- Glaze teriyaki : soja, miel, réduit
  ('rec-1783466712695-diiml3', 7, NULL), -- Glaçage miel moutarde (la fiche dit 2 semaines)
  ('rec-1777318835849',       7, NULL),  -- Vinaigrette balsamique miel : sans œuf
  ('rec-1783293963852-37054', 3, NULL),  -- Sauce tartare de bœuf : jaunes crus montés
  ('rec-1783371749149-64566', 3, NULL),  -- Sauce sérac : laitier frais
  ('rec-1783293963540-29464', 3, NULL),  -- Sauce yaourt
  ('rec-1783293963783-24319', 3, NULL),  -- Sauce vierge : tomate et abricot crus en dés
  ('rec-1783293963783-34380', 7, NULL),  -- Condiment œuf : câpres, cornichons, moutarde
  ('rec-1783614080768-zntn0z', 7, NULL), -- Condiment tartare : pickles, câprons, huile
  ('rec-1783293963852-84555', 7, NULL),  -- Condiment canard : graines torréfiées, huile
  ('rec-1783293963454-37182', 5, 90),    -- Pesto de pécan
  ('rec-1783293963703-97722', 7, 90),    -- Huile de basilic
  ('rec-1783467904504-37768', 7, 90),    -- Huile de pêche (la fiche dit surgeler, 3 mois)
  ('rec-1777158621564',       7, NULL),  -- Sel épicé pour frites : sec
  ('rec-1783293963783-66140', 7, NULL),  -- Poudre de lard sec
  ('rec-1783467904504-11578', 7, NULL),  -- Chips de viande séchée (la fiche dit 7 jours au sec)
  ('rec-1783468153853-12393', 5, NULL),  -- Marinade avant cuisson sous-vide : ail confit dans l'huile

  -- ─── Légumes, purées ────────────────────────────────────────────────────
  ('rec-1783371748852-26976', 5, 90),    -- Caviar d'aubergine
  ('rec-1783293963852-70310', 5, 90),    -- Houmous
  ('rec-1783293963852-13203', 5, 90),    -- Légumes d'été confits, réservés dans l'huile
  ('rec-1783293963922-43770', 3, NULL),  -- Tzatziki : yaourt et concombre
  ('rec-1783293963783-69137', 3, 90),    -- Mousseline d'épinards
  ('rec-1783370407563-zkl21w', 3, 60),   -- Mousseline de courgette (la fiche dit 2 mois)
  ('rec-1783293963783-70453', 3, 90),    -- Mousseline de haricots blancs
  ('rec-1783293963130-21384', 3, 90),    -- Mousseline de haricots blancs aux figues
  ('rec-1783371748852-20202', 3, 90),    -- Velouté froid de pêche grillée
  ('rec-1777158764118',       3, NULL)   -- Œuf poché frit

) as v(id, dlc, congele)
where r.id = v.id;

-- Poisson cru : 1 jour seulement après décongélation.
update recettes set duree_vie_decongele_jours = 1
where id = 'rec-1783371749149-56017';   -- Omble chevalier

-- Alignement de la qualification MEP sur les 9 fiches repassées non congelables.
update recettes set congelable = false
where id in (
  'rec-1783371749149-3774',    -- Langoustines basse température
  'rec-1783371748852-3529',    -- Truite pour crudo
  'rec-1783293963923-37274',   -- Meringue italienne
  'rec-1783371749149-41205',   -- Meringue italienne séchée
  'rec-1783771977742-69352',   -- Crémeux yuzu
  'rec-1783293963783-24319',   -- Sauce vierge
  'rec-1783293963783-34380',   -- Condiment œuf
  'rec-1783614080768-zntn0z',  -- Condiment tartare
  'rec-1783293963852-84555'    -- Condiment canard
);

commit;
