-- ═══════════════════════════════════════════════════════════════════════════
-- Durées de vie (DLC) — Woodland Village, Carte Automnale
-- carte-1787604411839-oe3j · 91 fiches rattachées, 78 modifiées · 29.09.2026
--
-- Même barème que l'Estivale (cf. data-20260731-dlc-woodland-village), poussé
-- au plus haut de chaque classe, sur demande de Jérémy (« au maximum possible »,
-- plafond 7 j confirmé) :
--   duree_vie_jours         = 3 / 5 / 7 selon la stabilité de la préparation,
--                             la fiche primant quand elle est plus stricte ;
--                             au-delà de 7 j sur la fiche, 7 j = DLC entamé
--   duree_vie_congele_jours = durée écrite sur la fiche (3 mois = 90, 2 mois = 60),
--                             NULL quand la fiche interdit la congélation
--   duree_vie_decongele_jours inchangé à 2 j
--
-- 13 assiettes dressées à la minute (burger, coupe, tataki dressé...) restent
-- à 3 j : elles ne passent jamais par une étiquette.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

update recettes r
set duree_vie_jours = v.dlc, duree_vie_congele_jours = v.congele
from (values

  -- ─── Viandes, gibier, volaille, poulpe ──────────────────────────────────
  ('rec-1787607253393-17616', 3, NULL),  -- Entrecôte parée : découpe crue (la fiche dit 5 j, barème cru = 3)
  ('rec-1787607253266-90573', 3, NULL),  -- Médaillons de cerf parés : découpe crue (fiche 5 j)
  ('rec-1787607253393-36591', 3, NULL),  -- Viandes à fondue : crues, la fiche interdit la congélation
  ('rec-1787607253149-58976', 5, 60),    -- Chevreuil saisi pour tataki : fiche 5 j ; congélation parasitaire obligatoire
  ('rec-1787607253393-53548', 3, 60),    -- Pigeon filets et cuisses : filets crus ; cuisses confites 2 mois
  ('rec-1787607253393-75070', 3, 60),    -- Suprême de volaille jaune : SV 63 °C, comme le poulet ayran ; 2 mois
  ('rec-1787607253266-70640', 7, 90),    -- Sanglier confit 12 h : confit dans la graisse ; 3 mois
  ('rec-1787607253393-92892', 5, 90),    -- Ragoût de cerf : braisé ; 3 mois
  ('rec-1787607253149-29493', 3, 60),    -- Poulpe cuit sous vide : produit de la mer ; 2 mois
  ('rec-1787607253340-74667', 3, 60),    -- Poulpe grillé : produit de la mer ; 2 mois
  ('rec-1787607253149-46695', 3, 60),    -- Carpaccio de poulpe pressé : produit de la mer ; 2 mois

  -- ─── Fonds, jus, sauces ─────────────────────────────────────────────────
  ('rec-1787607253560-84022', 5, 90),    -- Fond blanc de volaille
  ('rec-1787607253560-88062', 5, 90),    -- Fond mère de gibier
  ('rec-1787607253615-23555', 5, 90),    -- Bouillon de fondue au vin rouge et baies
  ('rec-1787607253560-95713', 5, 90),    -- Jus corsé aux morilles
  ('rec-1787607253560-60422', 5, 90),    -- Jus de pigeon corsé
  ('rec-1787607253560-51623', 5, 90),    -- Jus poivrade
  ('rec-1787607253560-34367', 3, 90),    -- Jus de poulpe : jus de cuisson d'un produit de la mer
  ('rec-1787607253690-95141', 5, 90),    -- Base sauce aux champignons des bois (sans crème)
  ('rec-1787607253690-63593', 3, NULL),  -- Sauce au vieux fromage d'alpage : la fiche dit 3 j, ne se congèle pas
  ('rec-1787607253749-35500', 3, NULL),  -- Crème de raifort : crème crue infusée (fiche 4 j, barème laitier = 3)
  ('rec-1787607253615-82653', 5, NULL),  -- Mayonnaise ail noir : la fiche dit 5 j, jamais congelée
  ('rec-1787607253615-5985',  5, NULL),  -- Mayonnaise chili crisp : idem
  ('rec-1787607253615-50327', 5, NULL),  -- Mayonnaise herbes alpines : idem
  ('rec-1787607253615-29346', 5, NULL),  -- Mayonnaise paprika fumé : idem
  ('rec-1787607253615-16596', 5, NULL),  -- Émulsion d'échalote : fiche 21 j, alignée sur les mayonnaises qu'elle contient
  ('rec-1787607253749-75889', 7, NULL),  -- Vinaigrette au miel de montagne (fiche 15 j)

  -- ─── Condiments, pickles, huiles ────────────────────────────────────────
  ('rec-1787607253690-1801',  7, NULL),  -- Chanterelles en pickles (fiche 2 mois)
  ('rec-1787607253690-15167', 7, NULL),  -- Pickles de coing (fiche 2 mois)
  ('rec-1787607253690-29711', 7, NULL),  -- Chou rouge cru mariné (fiche 15 j, jamais congelé)
  ('rec-1787607253690-80267', 7, NULL),  -- Condiment ail noir et noisettes (fiche 15 j)
  ('rec-1787607253615-14095', 7, NULL),  -- Condiment citron confit et câpres (fiche 15 j)
  ('rec-1787607253615-99267', 7, NULL),  -- Condiment coing et genièvre (fiche 1 mois, ne pas congeler)
  ('rec-1787607253615-26500', 7, 180),   -- Condiment d'airelles (fiche 1 mois) ; fruits au sucre, comme les confits
  ('rec-1787607253749-19098', 7, 90),    -- Huile de sapin (fiche 1 mois), comme l'huile de basilic

  -- ─── Légumes, purées, garnitures ────────────────────────────────────────
  ('rec-1787607253149-21612', 7, NULL),  -- Betteraves en croûte de sel (fiche 10 j sous vide, ne pas congeler)
  ('rec-1787607253340-64165', 5, 90),    -- Céleri-rave grillé
  ('rec-1787607253340-52658', 5, 90),    -- Courge rôtie
  ('rec-1787607253149-24355', 5, 90),    -- Fenouil brûlé
  ('rec-1787607253340-70397', 5, 90),    -- Oignon confit
  ('rec-1787607253690-54413', 5, 90),    -- Compotée d'oignons aux marrons
  ('rec-1787607253690-55649', 5, 90),    -- Marrons caramélisés
  ('rec-1787607253690-41135', 7, 90),    -- Marmelade de chou rouge : vinaigre, miel, vin réduit
  ('rec-1787607253340-86129', 4, NULL),  -- Chou kale : la fiche dit 4 j
  ('rec-1787607253340-46838', 5, 90),    -- Choux de Bruxelles mousseline (fiche 5 j), comme les mousselines d'été
  ('rec-1787607253749-48813', 3, 90),    -- Mousseline de fenouil : crème
  ('rec-1787607253690-36781', 3, 90),    -- Crème légère de panais : lait
  ('rec-1787607253266-33702', 3, 90),    -- Velouté d'artichaut : crème
  ('rec-1787607253393-73329', 5, 90),    -- Pommes grenailles fondantes (fiche 3 mois)
  ('rec-1787607253266-62374', 5, 90),    -- Polenta croustillante
  ('rec-1787607253340-92541', 3, 90),    -- Orge perlé crémeux : céréale cuite à la crème
  ('rec-1787607253266-97046', 5, 90),    -- Galette de spätzli : pâte cuite, pressée
  ('rec-1787607253393-36608', 3, 60),    -- Pâte à tagliolini fraîche : œuf cru, comme les linguine
  ('rec-1787607253150-5915',  3, 60),    -- Cromesquis de raclette : appareil lait et jaunes
  ('rec-1787607253473-49843', 5, 60),    -- Fondue moitié-moitié : mélange râpé (fiche 2 mois)
  ('rec-1787607253266-82154', 3, NULL),  -- Oeufs parfaits : la fiche dit 3 j maximum
  ('rec-1787607253749-56628', 1, NULL),  -- Espuma de foin : la fiche dit « ne se conserve pas »

  -- ─── Desserts, pâtisserie ───────────────────────────────────────────────
  ('rec-1787607253560-67793', 5, 60),    -- Crémeux myrtille : la fiche dit 5 j ou 2 mois
  ('rec-1787607253473-53867', 5, 60),    -- Namelaka chocolat noir : la fiche dit 5 j ou 2 mois
  ('rec-1787607253473-79274', 3, NULL),  -- Riz au lait tonka : la fiche dit production tous les 3 j
  ('rec-1787607253473-33319', 7, NULL),  -- Poires au vin : sirop (fiche 1 mois, ne pas congeler)
  ('rec-1787607253856-63793', 7, NULL),  -- Caramel beurre salé (fiche 1 mois)
  ('rec-1787607253749-57758', 7, NULL),  -- Gel de genièvre : la fiche dit 7 j, jamais congelé (agar)
  ('rec-1787607253749-3787',  7, NULL),  -- Gel de prune : idem

  -- ─── Secs (boîte hermétique) ────────────────────────────────────────────
  ('rec-1787607253560-93311', 7, NULL),  -- Sablé sarrasin
  ('rec-1787607253473-75505', 7, NULL),  -- Croustillant aux céréales
  ('rec-1787607253856-86481', 7, NULL),  -- Croûtons épicés
  ('rec-1787607253856-36970', 7, NULL),  -- Poudre de caramel
  ('rec-1787607253856-48993', 7, NULL),  -- Poudre de sapin
  ('rec-1787607253856-70971', 7, NULL),  -- Assaisonnement woodland
  ('rec-1787607253749-6070',  7, NULL),  -- Noisettes torréfiées
  ('rec-1787607253749-11812', 7, NULL),  -- Noix torréfiées
  ('rec-1787607253749-64674', 7, NULL),  -- Pistaches torréfiées
  ('rec-1787607253856-44730', 3, NULL),  -- Chips de lard sec : la fiche dit 3 j au sec

  -- ─── Assiettes dont la fiche plafonne à 24 h ────────────────────────────
  ('rec-1787607253149-17165', 1, NULL),  -- Carpaccio de betteraves : tenue 24 h
  ('rec-1787607253149-74864', 1, NULL),  -- Carpaccio de poulpe : tenue 24 h
  ('rec-1787607253149-31400', 1, NULL),  -- Salade d'automne : trévise 24 h, copeaux du jour
  ('rec-1787607253473-32893', 1, NULL)   -- Planchette du chasseur : tranchée le jour même

) as v(id, dlc, congele)
where r.id = v.id
  and r.etablissement_id = 'etab-2';

commit;
