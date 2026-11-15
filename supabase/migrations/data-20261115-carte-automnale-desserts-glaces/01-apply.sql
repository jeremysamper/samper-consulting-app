-- Carte Automnale Woodland (etab-2), page Dessert : assortiment de fromages,
-- coupe Danemark, onglet Glaces avec neuf glaces et le supplément alcool,
-- prix des desserts alignés sur la carte imprimée. Côté caisse : catégorie
-- Glaces, supplément au taux normal, réglage `supplements` lu par la fiche
-- de ligne. Retour par 99-rollback.sql.

begin;

-- 0. Sauvegarde
create table sauvegarde.desserts_20261115_plats as
  select * from public.plats where id in (
    'e0b1e283-b577-49b0-b88a-5ea78e6b88d8', '1a656a88-8bfe-4d79-a9a9-6866bd0bd44e',
    '023e7c42-86cf-45df-9a06-7404dee8fe16', 'f9ed8b1d-e9f1-43c4-91bd-960f144d3a0b');
create table sauvegarde.desserts_20261115_caisse_categories as
  select * from public.caisse_categories where etablissement_id = 'etab-2';
create table sauvegarde.desserts_20261115_caisse_reglages as
  select * from public.caisse_reglages where etablissement_id = 'etab-2';
revoke all on sauvegarde.desserts_20261115_plats, sauvegarde.desserts_20261115_caisse_categories,
              sauvegarde.desserts_20261115_caisse_reglages from public, anon, authenticated;

-- 1. Prix de la carte imprimée
update public.plats set prix_vente = 15, updated_at = now() where id = 'e0b1e283-b577-49b0-b88a-5ea78e6b88d8'; -- Coupe du chasseur
update public.plats set prix_vente = 16, updated_at = now() where id = '1a656a88-8bfe-4d79-a9a9-6866bd0bd44e'; -- Namelaka
update public.plats set prix_vente = 14, updated_at = now() where id = '023e7c42-86cf-45df-9a06-7404dee8fe16'; -- Riz au lait
update public.plats set prix_vente = 15, updated_at = now() where id = 'f9ed8b1d-e9f1-43c4-91bd-960f144d3a0b'; -- Crémeux myrtille

-- 2. Fiches de la coupe Danemark (la glace vanille est achetée)
insert into public.recettes (id, etablissement_id, nom, categorie, portions, prix_vente, statut, allergenes_ids, ingredients, etapes, notes_consultant, duree_vie_jours, congelable) values
('rec-1794765600000-12001', 'etab-2', 'Sauce chocolat maison', 'Sauces', 20, 0, 'brouillon',
 array['lactose', 'soja'],
 '[{"id": "i1794765600000_0_12001", "nom": "Chocolat noir 64 %", "unite": "g", "prixUnit": 0, "quantite": 250, "categorie": "Autres"}, {"id": "i1794765600000_1_12001", "nom": "Crème entière 35 %", "unite": "g", "prixUnit": 0, "quantite": 250, "categorie": "Autres"}, {"id": "i1794765600000_2_12001", "nom": "Lait entier", "unite": "g", "prixUnit": 0, "quantite": 100, "categorie": "Autres"}, {"id": "i1794765600000_3_12001", "nom": "Sucre", "unite": "g", "prixUnit": 0, "quantite": 20, "categorie": "Autres"}]'::jsonb,
 '["Rendement : 600 g, 20 portions de 30 g.", "Hacher le chocolat et le mettre dans un cul-de-poule.", "Porter à ébullition la crème, le lait et le sucre.", "Verser le liquide chaud sur le chocolat en 3 fois, en mélangeant du centre vers les bords à la maryse.", "Mixer 30 secondes au mixeur plongeant, sans incorporer d''air. La sauce est lisse et brillante.", "Débarrasser en bac filmé au contact, refroidir et réserver à 3 °C.", "Conservation : 5 jours à 3 °C.", "Régénération : au bain-marie, à 50 °C. Servir chaude, versée sur la glace devant le client ou au passe."]'::jsonb,
 'Soja : la plupart des chocolats contiennent de la lécithine de soja. Vérifier l''étiquette du chocolat employé.',
 5, false),
('rec-1794765600000-12002', 'etab-2', 'Chantilly au siphon maison', 'Desserts', 20, 0, 'brouillon',
 array['lactose'],
 '[{"id": "i1794765600000_0_12002", "nom": "Crème entière 35 %", "unite": "g", "prixUnit": 0, "quantite": 500, "categorie": "Autres"}, {"id": "i1794765600000_1_12002", "nom": "Sucre glace", "unite": "g", "prixUnit": 0, "quantite": 40, "categorie": "Autres"}, {"id": "i1794765600000_2_12002", "nom": "Cartouche de gaz pour siphon", "unite": "pièce", "prixUnit": 0, "quantite": 2, "categorie": "Autres"}]'::jsonb,
 '["Rendement : 1 siphon de 1 litre, 20 portions de 25 g.", "Mélanger la crème très froide et le sucre glace au fouet, sans monter.", "Passer au chinois dans le siphon. Ne jamais dépasser 500 g de crème dans un siphon de 1 litre.", "Visser la tête, percuter 2 cartouches et secouer 10 fois, tête en bas.", "Réserver le siphon au froid 2 heures au moins avant le service.", "Au service, secouer 3 fois et pocher tête en bas.", "Conservation : 3 jours à 3 °C dans le siphon. Démonter et laver le siphon à chaque fin de charge."]'::jsonb,
 null, 3, false);

-- 3. Plats neufs
insert into public.plats (id, etablissement_id, nom, categorie, prix_vente, description, ordre, actif) values
('wl-auto-fromages', 'etab-2', 'Assortiment de fromages', 'Desserts', 15, 'Sélection de fromages de saison', 5, true),
('wl-auto-coupe-danemark', 'etab-2', 'Coupe Danemark', 'Desserts', 15, 'Glace vanille, sauce chocolat chaud et chantilly', 6, true),
('wl-auto-glace-vanille', 'etab-2', 'Glace vanille', 'Glaces', 4, 'La boule', 1, true),
('wl-auto-glace-chocolat', 'etab-2', 'Glace chocolat', 'Glaces', 4, 'La boule', 2, true),
('wl-auto-glace-cafe', 'etab-2', 'Glace café', 'Glaces', 4, 'La boule', 3, true),
('wl-auto-glace-caramel', 'etab-2', 'Glace caramel', 'Glaces', 4, 'La boule', 4, true),
('wl-auto-glace-fraise', 'etab-2', 'Glace fraise', 'Glaces', 4, 'La boule', 5, true),
('wl-auto-glace-framboise', 'etab-2', 'Glace framboise', 'Glaces', 4, 'La boule', 6, true),
('wl-auto-glace-abricot', 'etab-2', 'Glace abricot', 'Glaces', 4, 'La boule', 7, true),
('wl-auto-glace-poire', 'etab-2', 'Glace poire', 'Glaces', 4, 'La boule', 8, true),
('wl-auto-glace-citron', 'etab-2', 'Glace citron', 'Glaces', 4, 'La boule', 9, true),
('wl-auto-supp-alcool', 'etab-2', 'Supplément alcool', 'Glaces', 5, 'Alcool au choix', 10, true);

insert into public.plat_recettes (id, plat_id, recette_id, role, ordre) values
(gen_random_uuid()::text, 'wl-auto-coupe-danemark', 'rec-1794765600000-12001', 'composant', 0),
(gen_random_uuid()::text, 'wl-auto-coupe-danemark', 'rec-1794765600000-12002', 'composant', 1);

insert into public.carte_plats (id, carte_id, plat_id, ordre)
select gen_random_uuid()::text, 'carte-1787604411839-oe3j', p, 0
from unnest(array['wl-auto-fromages', 'wl-auto-coupe-danemark',
  'wl-auto-glace-vanille', 'wl-auto-glace-chocolat', 'wl-auto-glace-cafe', 'wl-auto-glace-caramel',
  'wl-auto-glace-fraise', 'wl-auto-glace-framboise', 'wl-auto-glace-abricot', 'wl-auto-glace-poire',
  'wl-auto-glace-citron', 'wl-auto-supp-alcool']) as p;

-- 4. Caisse : onglet Glaces après Desserts, réglé comme Desserts
update public.caisse_categories set ordre = ordre + 1, updated_at = now()
where etablissement_id = 'etab-2' and ordre >= 3;
insert into public.caisse_categories (etablissement_id, nom, ordre, picto, actif, taux_tva, emporter_reduit)
select 'etab-2', 'Glaces', 3, 'cornet', true, d.taux_tva, d.emporter_reduit
from public.caisse_categories d where d.etablissement_id = 'etab-2' and d.nom = 'Desserts';

-- 5. Le supplément reste au taux normal, même à l'emporter (alcool)
insert into public.caisse_boutons (etablissement_id, plat_id, taux_tva, ordre)
values ('etab-2', 'wl-auto-supp-alcool', 8.1, 10);

-- 6. Le supplément se propose sur chaque produit de l'onglet Glaces ; ses choix
--    sont les produits rangés dans « Alcools », lus en direct par la caisse.
update public.caisse_reglages
set config = config || jsonb_build_object('supplements', jsonb_build_array(
      jsonb_build_object('plat_id', 'wl-auto-supp-alcool', 'choix', 'Alcools', 'pour', jsonb_build_array('Glaces')))),
    updated_at = now()
where etablissement_id = 'etab-2';

commit;
