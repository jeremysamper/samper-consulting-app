-- Inverse de reclassement.sql : les 26 fiches reprennent « Herbes / épices ».
-- Le front reste compatible avec l'ancien libellé (categorieAffichee).

update produits set categorie = 'Herbes / épices', updated_at = now()
where categorie in ('Herbes & fleurs', 'Épices') and id in (
  'prod-1779237212126274', 'prod-1779237212126225', 'prod-177923721212613',
  'prod-1779237212276888', 'prod-1779237210678938', 'prod-1779237212207922',
  'prod-1779237210509932', 'prod-1779237211029372', 'prod-1779237212609516',
  'prod-1779237212609699', 'prod-1779237210853751', 'prod-177923721085349',
  'prod-1779237210853287', 'prod-1779237210853204', 'prod-1779237210853900',
  'prod-1779237210905943', 'prod-1779237210735648', 'prod-1779237210905641',
  'prod-1779237210965855', 'prod-1779237210853313', 'prod-1779237210853610',
  'prod-1779237210965590', 'prod-1779237210853779', 'prod-1779237210853584',
  'prod-1779237210905364', 'prod-1779237210905116'
);
