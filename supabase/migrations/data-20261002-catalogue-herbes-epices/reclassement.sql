-- ─────────────────────────────────────────────────────────────────────────────
-- Catalogue : « Herbes / épices » scindée en « Herbes & fleurs » et « Épices »
-- À appliquer APRÈS la mise en ligne du front qui connaît les deux catégories :
-- l'ancien front n'a pas « Épices » dans son sélecteur, et enregistrer une fiche
-- reclassée la ferait retomber sur la première option (« Viandes »).
--
-- 26 fiches, toutes Woodland Village (etab-2), classées par le même classeur que
-- l'app (classerProduit.js / affinerCategorie). Liste par id, relevée le
-- 02.10.2026. Sous-dossier « data-… » : jamais rejoué par la CLI Supabase.
-- Inverse : rollback.sql.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

update produits set categorie = 'Herbes & fleurs', updated_at = now()
where categorie = 'Herbes / épices' and id in (
  'prod-1779237212126274', -- Aneth
  'prod-1779237212126225', -- Basilic
  'prod-177923721212613',  -- Basilic
  'prod-1779237212276888', -- Coriandre
  'prod-1779237210678938', -- Décor fleuri Bourgeon Bio Suisse
  'prod-1779237212207922', -- Estragon
  'prod-1779237210509932', -- Majestic feuilles d'estragon
  'prod-1779237211029372', -- Sauge en feuilles
  'prod-1779237212609516', -- Thym
  'prod-1779237212609699'  -- Thym
);

update produits set categorie = 'Épices', updated_at = now()
where categorie = 'Herbes / épices' and id in (
  'prod-1779237210853751', -- Cannelle en bâton
  'prod-177923721085349',  -- Cannelle en poudre
  'prod-1779237210853287', -- Curry doux
  'prod-1779237210853204', -- Curry doux
  'prod-1779237210853900', -- Curry fort
  'prod-1779237210905943', -- Gousse de vanille Bourbon
  'prod-1779237210735648', -- Graines de courge Bourgeon bio
  'prod-1779237210905641', -- Graines de sésame blanc grillées
  'prod-1779237210965855', -- Graines de sésame noir grillées
  'prod-1779237210853313', -- Paprika doux
  'prod-1779237210853610', -- Paprika doux
  'prod-1779237210965590', -- Piment d'Espelette
  'prod-1779237210853779', -- Poivre noir en grains
  'prod-1779237210853584', -- Poivre noir en grains
  'prod-1779237210905364', -- Rizdor
  'prod-1779237210905116'  -- Sel de l'Himalaya
);

commit;
