-- ═══════════════════════════════════════════════════════════════════════════
-- Durées de vie (DLC) — Hotel Central / Le Rucher
-- Cartes concernées : « Carte Mensuelle PDJ », « Buffet PDJ », « Beverage »
-- 84 fiches recette. 31.07.2026
--
-- Règle appliquée :
--   duree_vie_jours         = 3 / 5 / 7 selon la stabilité de la préparation
--     3 = cru, laitier frais, œuf, produit de la mer, découpe fraîche
--     5 = cuit ou stabilisé (acide, sous-vide, blanchi, pasteurisé léger)
--     7 = très stabilisé (sucre, sel, acide, gras, sec, fermenté, pot stérilisé)
--   duree_vie_congele_jours = durée réelle à -18 °C (NULL = ne se congèle pas)
--     remplace le 90 j forfaitaire posé à la migration du 30.07.2026
--   duree_vie_decongele_jours inchangé à 2 j, sauf gravlax (1 j, poisson cru)
--   congelable (qualification MEP) touché uniquement sur les 3 fiches
--     repassées en « non congelable »
-- ═══════════════════════════════════════════════════════════════════════════

begin;

update recettes r
set duree_vie_jours         = v.dlc,
    duree_vie_congele_jours = v.congele
from (values

  -- ─── BEVERAGE · Bases du Carnet ─────────────────────────────────────────
  ('rec-1784994174198-38063', 3, 90),    -- Base Achillée millefeuille (fiche : garde 96 h)
  ('rec-1784994174198-55864', 3, 90),    -- Base Aspérule odorante
  ('rec-1784994174198-31509', 3, 90),    -- Base Monarde
  ('rec-1784994174198-24791', 3, 90),    -- Base Reine des Prés
  ('rec-1784994174198-26471', 7, NULL),  -- Base Kéfir baies sauvages : ferment vivant, jamais congelé

  -- ─── BEVERAGE · Cordiaux (embouteillés à chaud, acidifiés) ──────────────
  -- 7 j = DLC entamé. Bouteille fermée : 6 semaines (cf. fiche).
  ('rec-1784990818400-84663', 7, NULL),  -- Cordial Abricots
  ('rec-1784990818400-61305', 7, NULL),  -- Cordial Achillée millefeuille
  ('rec-1784990818400-14378', 7, NULL),  -- Cordial Foin
  ('rec-1784990818400-69129', 7, NULL),  -- Cordial Gentiane Orange Citron
  ('rec-1784990818400-45689', 7, NULL),  -- Cordial Mélisse Miel Citron
  ('rec-1784990818400-74657', 7, NULL),  -- Cordial Miel d'Evolène et Safran
  ('rec-1784990818400-67916', 7, NULL),  -- Cordial Monarde
  ('rec-1784990818400-93476', 7, NULL),  -- Cordial Myrtille
  ('rec-1784990818400-48817', 7, NULL),  -- Cordial Orange Citron
  ('rec-1784990818742-50596', 7, NULL),  -- Cordial Osmanthus
  ('rec-1784990818742-94446', 7, NULL),  -- Cordial Pomme Citron
  ('rec-1784990818742-18009', 7, NULL),  -- Cordial Rhubarbe
  ('rec-1784990818400-41585', 7, NULL),  -- Cordial Thé blanc Bai Mu Dan
  ('rec-1784990818742-79993', 7, NULL),  -- Cordial Thé Sencha

  -- ─── BEVERAGE · Premix (montage au verre à la minute, rien n'est stocké) ─
  ('rec-1784990818742-18114', 3, NULL),  -- Premix Abricot
  ('rec-1784990818742-71538', 3, NULL),  -- Premix Agrumes
  ('rec-1784990818742-31551', 3, NULL),  -- Premix Foin
  ('rec-1784990818742-71308', 3, NULL),  -- Premix Gentiane Orange Citron
  ('rec-1784990818742-70248', 3, NULL),  -- Premix Kéfir baies sauvages
  ('rec-1784990818832-93345', 3, NULL),  -- Premix Miel Mélisse
  ('rec-1784990818832-41374', 3, NULL),  -- Premix Miel Safran
  ('rec-1784990818832-65534', 3, NULL),  -- Premix Millefeuille
  ('rec-1784990818832-98499', 3, NULL),  -- Premix Monarde
  ('rec-1784990818832-75191', 3, NULL),  -- Premix Myrtille
  ('rec-1784990818832-90452', 3, NULL),  -- Premix Osmanthus
  ('rec-1784990818832-57712', 3, NULL),  -- Premix Pomme
  ('rec-1784990818832-96836', 3, NULL),  -- Premix Rhubarbe
  ('rec-1784990818742-35341', 3, NULL),  -- Premix Thé blanc Bai Mu Dan
  ('rec-1784990818832-66789', 3, NULL),  -- Premix Thé Sencha

  -- ─── BUFFET PDJ ─────────────────────────────────────────────────────────
  ('rec-1782727643823-8919',  7, 90),    -- Beurre aiguilles de sapin blanc (gras + sel)
  ('rec-1782727643823-20712', 7, 90),    -- Beurre de cendre
  ('rec-1782727643823-39541', 7, 90),    -- Beurre demi-sel d'épicéa
  ('rec-1782727643733-66662', 7, NULL),  -- Granola : sec, jamais congelé
  ('rec-1782727643733-1066',  7, NULL),  -- Muesli : sec, mélange à cru
  ('rec-1782727643823-8389',  7, NULL),  -- Sel fumé d'épicéa : sel sec
  ('rec-1782727643823-7052',  7, NULL),  -- Vinaigre maison : acétique
  ('rec-1782763452875-42129', 7, NULL),  -- Pâte de fruits : 75 °Brix + acide
  ('rec-1782763452875-71129', 7, NULL),  -- Pâte de fruits séchée fruits rouges
  ('rec-1782727643823-65793', 7, NULL),  -- Zeste confit et séché
  ('rec-1782727643891-78107', 3, 60),    -- Brioche aux raisins : viennoiserie mie fraîche
  ('rec-1782727643823-23992', 3, 60),    -- Brioche safranée
  ('rec-1782727643733-32421', 5, 60),    -- Financier amande : sucre + beurre, tient mieux
  ('rec-1782727643733-9202',  3, 60),    -- Madeleine : sèche vite

  -- ─── CARTE MENSUELLE PDJ ────────────────────────────────────────────────
  ('rec-1782763452874-30471', 7, 180),   -- Abricot confit pasteurisé 75 °C (fiche : 3 semaines)
  ('rec-1782727652041-2008',  3, NULL),  -- Crémeux lacté gourmand : crème montée
  ('rec-1782727652041-41583', 3, 30),    -- Granité et consommé d'abricot : qualité glace 1 mois
  ('rec-1784911603155-rpos59', 7, NULL), -- Tuiles croustillantes (fiche : 3 semaines au sec)
  ('rec-1782727651977-28677', 3, NULL),  -- Avocat guacamole : avocat cru + écrevisses
  ('rec-1782727652041-18309', 3, 90),    -- Eau de tomate limpide : clarifié non pasteurisé
  ('rec-1782727652041-2425',  7, NULL),  -- Sarrasin soufflé : sec et croustillant
  ('rec-1782727651977-84600', 3, NULL),  -- Tartare de tomate : découpe crue
  ('rec-1782763452875-87684', 7, 90),    -- Tomates cerises confites sous-vide, sous huile
  ('rec-1782727651977-65235', 3, NULL),  -- Brioche perdue : appareil œuf-lait cru, minute
  ('rec-1782727652041-59602', 3, NULL),  -- Crème légère lactique
  ('rec-1782727651887-82569', 5, 90),    -- Eau aromatique reine-des-prés, flacon stérile
  ('rec-1782763452875-26226', 7, NULL),  -- Prune lacto : ferment vivant acide
  ('rec-1782727651887-74617', 5, 90),    -- Prunes de saison rôties : fruit cuit
  ('rec-1782727651977-39214', 3, NULL),  -- Crème prise au foin : gélatine, laitier
  ('rec-1784911855648-17532', 7, 60),    -- Croustillant praliné : insert pâtisserie
  ('rec-1782727652041-48176', 3, NULL),  -- Fruits rouges marinés du jardin
  ('rec-1782727652041-32072', 5, NULL),  -- Gel de pamplemousse : gel, synérèse à la décongélation
  ('rec-1782727652111-76945', 3, 90),    -- Infusion de mélisse : infusion fraîche
  ('rec-1782727643733-92106', 7, NULL),  -- Assaisonnement fermenté (garum) : très salé
  ('rec-1782727651977-1655',  3, NULL),  -- Concombre mariné croquant
  ('rec-1782727652111-5705',  5, NULL),  -- Fine nappe de lait fermenté acidulé
  ('rec-1782727652041-39423', 3, 60),    -- Gravlax d'omble : poisson cru mariné, sous-vide
  ('rec-1782727652041-81591', 7, 90),    -- Huile vive infusée aux herbes, soutirée claire
  ('rec-1782727643823-19040', 3, NULL),  -- Base bircher : céréales trempées au lait
  ('rec-1782727643891-18387', 7, NULL),  -- Confiture abricot : pot stérilisé 105 °C
  ('rec-1782727643891-72078', 7, NULL),  -- Confiture fruits des bois
  ('rec-1782727643891-30202', 7, NULL),  -- Confiture rhubarbe
  ('rec-1782727643733-15149', 3, NULL),  -- Lait infusé : laitier frais
  ('rec-1785174628632-18849', 3, 60),    -- Pancakes : cuit moelleux
  ('rec-1782727643733-63634', 7, NULL),  -- Praliné coulant pignons d'arole, noisette, miel
  ('rec-1782727643823-45714', 3, NULL),  -- Skyr battu : laitier frais
  ('rec-1782727643891-77206', 7, 90),    -- Touche acidulée pasteurisée en bocal
  ('rec-1782727651887-58813', 3, NULL),  -- Œuf poché
  ('rec-1782727651887-28927', 5, 90),    -- Pesto d'orties blanchies et amande
  ('rec-1782727651887-90720', 3, 30)     -- Pressé de rösti : pomme de terre cuite

) as v(id, dlc, congele)
where r.id = v.id;

-- Poisson cru : 1 jour seulement après décongélation.
update recettes set duree_vie_decongele_jours = 1
where id = 'rec-1782727652041-39423';

-- Alignement de la qualification MEP sur les 3 fiches repassées non congelables,
-- pour que la MEP et le poste d'étiquetage disent la même chose.
update recettes set congelable = false
where id in (
  'rec-1782727651977-28677',   -- Avocat guacamole
  'rec-1782727651977-65235',   -- Brioche perdue, appareil
  'rec-1782727652041-32072'    -- Gel de pamplemousse
);

commit;
