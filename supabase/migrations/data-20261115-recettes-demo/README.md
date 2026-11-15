# Toutes les fiches de l'app dans l'établissement Démo (15.11.2026)

Établissement visé : `etab-1781452861459` (Démo). Sources : Hôtel Panorama (`etab-1`), Le Rucher d'Evolène (`etab-1777157340476`), Woodland Village (`etab-2`). Les sources ne sont pas modifiées.

## Ce qui a été fait
- Une fiche par nom (comparé sans casse ni espaces de bord) : 1 175 noms dans l'app, 14 déjà dans Démo, 1 161 fiches ajoutées. Pour un nom présent dans plusieurs établissements, la version gardée est la plus complète (ingrédients et étapes), non archivée.
- Copie indépendante (règle des prix par établissement) : `produitId`, `matchSuggestions`, `needsReview` retirés des ingrédients, `prixUnit` à 0, `prix_vente` à 0. Statut et `masquee` repris de la source. Identifiants `rec-<nombre>` pris dans la plage libre entre la dernière fiche créée et l'heure de l'import.
- Catégories : celles des sources gardées, sauf la catégorie par défaut « Plats », reclassée par mots-clés du nom puis corrigée à la main sur la liste relue (fondues, viandes confites, plats végétariens dressés, crémeux, gels, beurres...). Deux catégories ajoutées : « Boissons » (cordiaux, premix, boissons) et « Petit-déjeuner » (muesli, bircher, confitures, brioches du buffet). Les 14 fiches d'origine de Démo ont été reclassées de même (10 changées).
- Répartition dans Démo : Sauces 224, Garnitures 209, Desserts 201, Entrées 200, Plats 157, Amuse-bouches 89, Boissons 48, Petit-déjeuner 35, Fromages 8, Fonds 4.

## Sauvegarde et retour arrière
Table `sauvegarde.recettes_demo_import_20261115` : une ligne `import` par fiche ajoutée, une ligne `categorie` par fiche d'origine reclassée (catégorie d'avant). `99-rollback.sql` s'appuie dessus. Si des plats de Démo ont été reliés à ces fiches entre-temps, vérifier `plat_recettes` avant de supprimer. Purge de la table de sauvegarde possible dès que l'import est validé.

Script joué par le connecteur Supabase, essai à blanc d'abord (transaction annulée), puis le même texte avec l'essai désactivé.
