-- Annule 01-apply.sql. Les plats créés (wl-*) partent avec leurs liaisons
-- (plat_recettes et carte_plats en cascade), les 6 cartes avec les leurs
-- (dont le lien de la fondue moitié-moitié vers les cartes Groupes).
-- Restent les liens de la carte Brunch vers les 10 desserts des cartes
-- restaurant, retirés un par un : un plat existant ajouté plus tard au brunch
-- à la main n'est pas touché.
-- Ne supprime aucune recette, aucun plat existant, ni la carte Brunch.
begin;

delete from public.carte_plats
where carte_id = 'carte-1792552544043-wyiw'
  and plat_id in (
    'e0b1e283-b577-49b0-b88a-5ea78e6b88d8', -- Coupe du chasseur
    '1a656a88-8bfe-4d79-a9a9-6866bd0bd44e', -- Namelaka de chocolat noir
    '023e7c42-86cf-45df-9a06-7404dee8fe16', -- Riz au lait à la fève de tonka
    'f9ed8b1d-e9f1-43c4-91bd-960f144d3a0b', -- Crémeux myrtille
    '5dc4c996-020c-4b37-879e-fbfa53055d15', -- Baba à l'abricotine
    'a5f94f82-15c3-4506-aec5-a450cf58b0ef', -- Crémeux chocolat blanc
    'eb02031e-96bc-4649-b63f-555ff5a4d28d', -- Mousse yuzu
    'e8e8ae63-4c17-48c1-9f1c-706ab9fa61b2', -- Crémeux tonka
    'd5aef48a-cc7f-43ae-ac8d-3bc94e52a1a4', -- Paris-Brest
    '91e356d6-aa22-4a75-92a0-1d4e00813d0d'  -- Poire confite
  );

delete from public.plats where etablissement_id = 'etab-2' and id like 'wl-%';

delete from public.cartes where etablissement_id = 'etab-2' and id like 'carte-woodland-%';

commit;
