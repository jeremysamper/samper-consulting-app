-- ═══════════════════════════════════════════════════════════════════════════
-- Durées de vie (DLC) — Woodland Village, Carte Automnale, SECONDE PASSE
-- carte-1787604411839-oe3j · 29.09.2026
--
-- Demande de Jérémy après la première passe : « pousser vraiment au maximum ».
-- Le plafond de 7 j est levé : mayonnaise industrielle 21 j, poulpe cuit sous
-- vide 21 j, le plus de produits possible à 7 j au frais, et la surgélation
-- poussée au maximum.
--
--   duree_vie_jours         : 7 j pour tout ce qui est cuit et conditionné sous
--                             vide ; la durée de la fiche quand elle dépasse 7 j
--                             (pickles, condiments, sirops) ; durée de garde au
--                             sec pour les secs
--   duree_vie_congele_jours : 180 j pour fonds, jus, braisés, viandes, légumes
--                             rôtis ; 90 j pour ce qui contient de la crème ou
--                             une texture fragile (purées, pâtes, crémeux)
--   duree_vie_decongele_jours inchangé à 2 j
--
-- Retour à la première passe : rejouer 01-apply-dlc.sql.
-- Retour à l'état d'origine : 99-rollback-dlc.sql.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

update recettes r
set duree_vie_jours = v.dlc, duree_vie_congele_jours = v.congele
from (values

  -- ─── Viandes, gibier, volaille, poulpe ──────────────────────────────────
  ('rec-1787607253393-17616', 7, 180),   -- Entrecôte parée : pièce entière sous vide
  ('rec-1787607253266-90573', 7, 180),   -- Médaillons de cerf parés : pièce entière sous vide
  ('rec-1787607253393-36591', 3, NULL),  -- Viandes à fondue : tranches fines marinées (fiche 3 j gibier), pas de congélation
  ('rec-1787607253149-58976', 5, 180),   -- Chevreuil pour tataki : cœur cru, déjà passé par la congélation parasitaire
  ('rec-1787607253393-53548', 4, 180),   -- Pigeon : filets crus 4 j (fiche) ; cuisses confites
  ('rec-1787607253393-75070', 7, 120),   -- Suprême de volaille : SV 63 °C, poche intacte
  ('rec-1787607253266-70640', 7, 180),   -- Sanglier confit 12 h (la fiche : « s'améliore à la surgélation »)
  ('rec-1787607253393-92892', 7, 180),   -- Ragoût de cerf, viande et jus sous vide
  ('rec-1787607253149-29493', 21, 180),  -- Poulpe cuit sous vide : 5 h à 80 °C, poche intacte
  ('rec-1787607253340-74667', 7, 180),   -- Poulpe grillé : repris hors de la poche
  ('rec-1787607253149-46695', 7, 90),    -- Carpaccio de poulpe pressé : boudin, tranché surgelé

  -- ─── Fonds, jus, sauces ─────────────────────────────────────────────────
  ('rec-1787607253560-84022', 7, 180),   -- Fond blanc de volaille
  ('rec-1787607253560-88062', 7, 180),   -- Fond mère de gibier
  ('rec-1787607253615-23555', 7, 180),   -- Bouillon de fondue au vin rouge et baies
  ('rec-1787607253560-95713', 7, 180),   -- Jus corsé aux morilles (sans beurre)
  ('rec-1787607253560-60422', 7, 180),   -- Jus de pigeon corsé
  ('rec-1787607253560-51623', 7, 180),   -- Jus poivrade (sans beurre)
  ('rec-1787607253560-34367', 7, 180),   -- Jus de poulpe au vinaigre de cidre
  ('rec-1787607253690-95141', 7, 180),   -- Base sauce aux champignons des bois (sans crème)
  ('rec-1787607253690-63593', 5, NULL),  -- Sauce au vieux fromage : sauce crème cuite (fiche 3 j), ne se congèle pas
  ('rec-1787607253749-35500', 4, NULL),  -- Crème de raifort : crème infusée à froid (fiche 4 j)
  ('rec-1787607253615-82653', 21, NULL), -- Mayonnaise ail noir : base industrielle stable
  ('rec-1787607253615-5985',  21, NULL), -- Mayonnaise chili crisp : idem
  ('rec-1787607253615-29346', 21, NULL), -- Mayonnaise paprika fumé : idem, épice sèche
  ('rec-1787607253615-50327', 7, NULL),  -- Mayonnaise herbes alpines : herbes fraîches crues
  ('rec-1787607253615-16596', 21, NULL), -- Émulsion d'échalote (fiche 21 j)
  ('rec-1790685028251',       15, NULL), -- Vinaigrette balsamique miel : émulsion sans œuf (remplace la vinaigrette au miel de montagne, supprimée le 29.09 à 14 h 30)

  -- ─── Condiments, pickles, huiles ────────────────────────────────────────
  ('rec-1787607253690-1801',  60, NULL), -- Chanterelles en pickles (fiche 2 mois)
  ('rec-1787607253690-15167', 60, NULL), -- Pickles de coing (fiche 2 mois)
  ('rec-1787607253690-29711', 15, NULL), -- Chou rouge cru mariné (fiche 15 j)
  ('rec-1787607253690-80267', 15, NULL), -- Condiment ail noir et noisettes (fiche 15 j)
  ('rec-1787607253615-14095', 15, NULL), -- Condiment citron confit et câpres (fiche 15 j)
  ('rec-1787607253615-99267', 30, NULL), -- Condiment coing et genièvre (fiche 1 mois)
  ('rec-1787607253615-26500', 30, 180),  -- Condiment d'airelles (fiche 1 mois)
  ('rec-1787607253749-19098', 7, 180),   -- Huile de sapin : végétal frais dans l'huile, 7 j au frais (fiche 1 mois)

  -- ─── Légumes, purées, garnitures ────────────────────────────────────────
  ('rec-1787607253149-21612', 10, NULL), -- Betteraves en croûte de sel (fiche 10 j sous vide)
  ('rec-1787607253340-64165', 7, 180),   -- Céleri-rave grillé
  ('rec-1787607253340-52658', 7, 180),   -- Courge rôtie
  ('rec-1787607253149-24355', 7, 180),   -- Fenouil brûlé
  ('rec-1787607253340-70397', 7, 180),   -- Oignon confit
  ('rec-1787607253690-54413', 7, 180),   -- Compotée d'oignons aux marrons
  ('rec-1787607253690-55649', 7, 180),   -- Marrons caramélisés
  ('rec-1787607253690-41135', 7, 180),   -- Marmelade de chou rouge
  ('rec-1787607253340-86129', 4, NULL),  -- Chou kale : feuille fraîche (fiche 4 j)
  ('rec-1787607253340-46838', 7, 180),   -- Choux de Bruxelles mousseline
  ('rec-1787607253749-48813', 7, 90),    -- Mousseline de fenouil : crème cuite, sous vide
  ('rec-1787607253690-36781', 7, 90),    -- Crème légère de panais : lait cuit, sous vide
  ('rec-1787607253266-33702', 7, 90),    -- Velouté d'artichaut : crème cuite, sous vide
  ('rec-1787607253393-73329', 7, 90),    -- Pommes grenailles fondantes
  ('rec-1787607253266-62374', 7, 180),   -- Polenta croustillante
  ('rec-1787607253340-92541', 5, 90),    -- Orge perlé crémeux : céréale cuite (Bacillus cereus)
  ('rec-1787607253266-97046', 7, 180),   -- Galette de spätzli
  ('rec-1787607253393-36608', 5, 90),    -- Pâte à tagliolini fraîche : œuf cru
  ('rec-1787607253150-5915',  3, 90),    -- Cromesquis de raclette : panure à l'œuf cru
  ('rec-1787607253473-49843', 7, 180),   -- Fondue moitié-moitié : fromages râpés
  ('rec-1787607253266-82154', 3, NULL),  -- Oeufs parfaits : la fiche dit 3 j maximum
  ('rec-1787607253749-56628', 1, NULL),  -- Espuma de foin : la fiche dit « ne se conserve pas »

  -- ─── Desserts, pâtisserie ───────────────────────────────────────────────
  ('rec-1787607253560-67793', 7, 90),    -- Crémeux myrtille : cuit 84 °C sous vide
  ('rec-1787607253473-53867', 5, 90),    -- Namelaka : crème froide ajoutée crue (fiche 5 j)
  ('rec-1787607253473-79274', 5, NULL),  -- Riz au lait tonka : riz cuit au lait
  ('rec-1787607253473-33319', 30, NULL), -- Poires au vin (fiche 1 mois)
  ('rec-1787607253856-63793', 30, 180),  -- Caramel beurre salé (fiche 1 mois)
  ('rec-1787607253749-57758', 7, NULL),  -- Gel de genièvre (fiche 7 j)
  ('rec-1787607253749-3787',  7, NULL),  -- Gel de prune (fiche 7 j)

  -- ─── Secs (boîte hermétique) ────────────────────────────────────────────
  ('rec-1787607253560-93311', 14, NULL), -- Sablé sarrasin
  ('rec-1787607253473-75505', 14, NULL), -- Croustillant aux céréales
  ('rec-1787607253856-86481', 14, NULL), -- Croûtons épicés
  ('rec-1787607253856-36970', 7, NULL),  -- Poudre de caramel : reprend l'humidité
  ('rec-1787607253856-48993', 30, NULL), -- Poudre de sapin
  ('rec-1787607253856-70971', 90, NULL), -- Assaisonnement woodland : épices sèches
  ('rec-1787607253749-6070',  30, NULL), -- Noisettes torréfiées : rancissement
  ('rec-1787607253749-11812', 30, NULL), -- Noix torréfiées : rancissement
  ('rec-1787607253749-64674', 30, NULL), -- Pistaches torréfiées : rancissement
  ('rec-1787607253856-44730', 7, NULL),  -- Chips de lard sec (fiche 3 j pour le croquant)

  -- ─── Assiettes dont la fiche plafonne à 24 h ────────────────────────────
  ('rec-1787607253149-17165', 1, NULL),  -- Carpaccio de betteraves : tenue 24 h
  ('rec-1787607253149-74864', 1, NULL),  -- Carpaccio de poulpe : tenue 24 h
  ('rec-1787607253149-31400', 1, NULL),  -- Salade d'automne : trévise 24 h
  ('rec-1787607253473-32893', 1, NULL)   -- Planchette du chasseur : tranchée le jour même

) as v(id, dlc, congele)
where r.id = v.id
  and r.etablissement_id = 'etab-2';

commit;
