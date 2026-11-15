-- Carte Automnale Woodland (etab-2) : le plat « Tagliolini aux champignons des bois »
-- devient trois plats, comme sur la carte imprimée, et deux plats enfants entrent.
-- Sauvegarde des lignes modifiées dans le schéma sauvegarde, retour par 99-rollback.sql.

begin;

-- 0. Sauvegarde
create table sauvegarde.carte_automnale_20261115_recettes as
  select * from public.recettes where id in (
    'rec-1787607253393-11262', 'rec-1787607253393-36608',
    'rec-1787607253690-95141', 'rec-1787607253393-53548');
create table sauvegarde.carte_automnale_20261115_plats as
  select * from public.plats where id in (
    '26c8d8af-42b1-422b-a62a-753830f4ffb5', '87442eb2-18a6-4fa8-a579-fc266d8de671',
    '54302596-2187-4a7d-8265-9210ac3f898c', '608f832e-2e78-447c-9160-c5fe4f7de8f4');
create table sauvegarde.carte_automnale_20261115_plat_recettes as
  select * from public.plat_recettes where plat_id = '26c8d8af-42b1-422b-a62a-753830f4ffb5';
revoke all on sauvegarde.carte_automnale_20261115_recettes,
              sauvegarde.carte_automnale_20261115_plats,
              sauvegarde.carte_automnale_20261115_plat_recettes from public, anon, authenticated;

-- 1. Pâte fraîche : taillée en fettuccine, oeufs déclarés
update public.recettes set
  nom = 'Pâte à fettuccine fraîche',
  allergenes_ids = array['gluten', 'oeufs'],
  etapes = '["Pétrir jusqu''à une pâte lisse et ferme, filmer, reposer 2 heures au froid.", "Abaisser au laminoir jusqu''au cran 6, tailler en fettuccine de 7 mm de large.", "Fariner généreusement, former des nids de 90 g.", "Surgeler à plat puis conditionner sous vide. DLC 2 mois.", "Cuire 2 minutes 30 directement du surgelé. NE JAMAIS DÉCONGELER, les nids collent en masse."]'::jsonb,
  updated_at = now()
where id = 'rec-1787607253393-36608';

-- 2. Base sauce : mouillée au bouillon de légumes, végétarienne pour les trois plats
update public.recettes set
  allergenes_ids = array['lactose', 'sulfites'],
  ingredients = '[{"id": "i1787607253690_0_668", "nom": "Champignons des bois", "unite": "g", "prixUnit": 0, "quantite": 2400, "categorie": "Autres"}, {"id": "i1787607253690_1_339", "nom": "Échalote", "unite": "g", "prixUnit": 0, "quantite": 300, "categorie": "Autres"}, {"id": "i1787607253690_2_980", "nom": "Ail", "unite": "g", "prixUnit": 0, "quantite": 40, "categorie": "Autres"}, {"id": "i1787607253690_3_742", "nom": "Vin blanc", "unite": "ml", "prixUnit": 0, "quantite": 500, "categorie": "Autres"}, {"id": "i1787607253690_4_425", "nom": "Bouillon de légumes", "unite": "g", "prixUnit": 0, "quantite": 1200, "categorie": "Autres"}, {"id": "i1787607253690_5_620", "nom": "Beurre", "unite": "g", "prixUnit": 0, "quantite": 200, "categorie": "Autres"}, {"id": "i1787607253690_6_244", "nom": "Thym", "unite": "g", "prixUnit": 0, "quantite": 10, "categorie": "Autres"}]'::jsonb,
  etapes = '["Faire suer les champignons à sec, puis colorer au beurre.", "Ajouter échalote et ail, suer 3 minutes.", "Déglacer au vin blanc, réduire à sec.", "Mouiller au bouillon de légumes, cuire 15 minutes, thym en fin de cuisson.", "Sous vide en poches de 500 g, sans crème. Surgelé, DLC 3 mois.", "Ajouter la crème à la régénération.", "Base végétarienne, commune aux trois plats de fettuccine."]'::jsonb,
  updated_at = now()
where id = 'rec-1787607253690-95141';

-- 3. Pigeon : rendement réel d'un filet et d'une cuisse par assiette
update public.recettes set
  portions = 16,
  etapes = '["Rendement : 8 pigeons d''environ 450 g, soit 16 portions d''un filet et d''une cuisse.", "Lever les filets, réserver sous vide au froid positif 4 jours. Cuisson minute rosée.", "Confire les cuisses dans la graisse à 85 degrés pendant 3 heures.", "Effilocher les cuisses tièdes. Sous vide. Surgelé, DLC 2 mois.", "Garder les carcasses pour la fiche Jus de pigeon corsé."]'::jsonb,
  updated_at = now()
where id = 'rec-1787607253393-53548';

-- 4. L'ancienne fiche des trois versions devient la fiche du plat végétarien
update public.recettes set
  nom = 'Fettuccine aux champignons des bois',
  portions = 10,
  prix_vente = 28,
  masquee = false,
  allergenes_ids = array['gluten', 'oeufs', 'lactose', 'sulfites'],
  ingredients = '[{"id": "i1794765600000_0_11262", "nom": "Pâte à fettuccine fraîche", "unite": "g", "prixUnit": 0, "quantite": 900, "categorie": "Autres"}, {"id": "i1794765600000_1_11262", "nom": "Base sauce aux champignons des bois", "unite": "g", "prixUnit": 0, "quantite": 700, "categorie": "Autres"}, {"id": "i1794765600000_2_11262", "nom": "Crème", "unite": "ml", "prixUnit": 0, "quantite": 400, "categorie": "Autres"}, {"id": "i1794765600000_3_11262", "nom": "Champignons des bois rôtis", "unite": "g", "prixUnit": 0, "quantite": 400, "categorie": "Autres"}, {"id": "i1794765600000_4_11262", "nom": "Vieux fromage d''alpage râpé", "unite": "g", "prixUnit": 0, "quantite": 100, "categorie": "Autres"}]'::jsonb,
  etapes = '["Par assiette : 1 nid de pâtes de 90 g, 70 g de base, 40 ml de crème, 40 g de champignons rôtis et 10 g de fromage râpé.", "Régénérer la base avec la crème et réduire 2 minutes.", "Réchauffer les champignons rôtis à la poêle, sans matière grasse.", "Cuire les pâtes 2 minutes 30, directement du surgelé. Les lier dans la sauce avec un peu d''eau de cuisson.", "Dresser les pâtes en nid, poser les champignons dessus et râper le fromage à l''envoi.", "Plat végétarien : ni fond de volaille ni jus de pigeon dans la casserole ou dans la poêle."]'::jsonb,
  notes_consultant = 'Le vieux fromage d''alpage est le plus souvent fait à la présure animale. Pour une assiette strictement végétarienne, le retirer ou choisir un fromage à présure microbienne.',
  updated_at = now()
where id = 'rec-1787607253393-11262';

-- 5. Nouvelles fiches
insert into public.recettes (id, etablissement_id, nom, categorie, portions, prix_vente, statut, allergenes_ids, ingredients, etapes, notes_consultant, duree_vie_jours, congelable, duree_vie_congele_jours) values
('rec-1794765600000-11001', 'etab-2', 'Suprême de volaille jaune, fettuccine aux champignons des bois', 'Plats', 10, 36, 'brouillon',
 array['gluten', 'oeufs', 'lactose', 'sulfites'],
 '[{"id": "i1794765600000_0_11001", "nom": "Suprême de volaille jaune", "unite": "g", "prixUnit": 0, "quantite": 800, "categorie": "Autres"}, {"id": "i1794765600000_1_11001", "nom": "Pâte à fettuccine fraîche", "unite": "g", "prixUnit": 0, "quantite": 900, "categorie": "Autres"}, {"id": "i1794765600000_2_11001", "nom": "Base sauce aux champignons des bois", "unite": "g", "prixUnit": 0, "quantite": 700, "categorie": "Autres"}, {"id": "i1794765600000_3_11001", "nom": "Crème", "unite": "ml", "prixUnit": 0, "quantite": 400, "categorie": "Autres"}, {"id": "i1794765600000_4_11001", "nom": "Beurre", "unite": "g", "prixUnit": 0, "quantite": 50, "categorie": "Autres"}, {"id": "i1794765600000_5_11001", "nom": "Vieux fromage d''alpage râpé", "unite": "g", "prixUnit": 0, "quantite": 100, "categorie": "Autres"}]'::jsonb,
 '["Par assiette : 1 suprême de 80 g, 1 nid de pâtes de 90 g, 70 g de base, 40 ml de crème et 10 g de fromage râpé.", "Décongeler les suprêmes la veille en chambre froide.", "À la commande, colorer le suprême face peau au beurre pendant 3 minutes, puis le passer 4 minutes au four à 180 °C. Il est déjà cuit, il doit seulement revenir à 63 °C à cœur.", "Régénérer la base avec la crème et réduire 2 minutes.", "Cuire les pâtes 2 minutes 30, directement du surgelé. Les lier dans la sauce avec un peu d''eau de cuisson.", "Dresser les pâtes en nid. Trancher le suprême en 3 et le poser dessus, peau vers le haut. Râper le fromage à l''envoi."]'::jsonb,
 null, 3, null, null),
('rec-1794765600000-11002', 'etab-2', 'Pigeon rôti, fettuccine aux champignons des bois', 'Plats', 10, 39, 'brouillon',
 array['gluten', 'oeufs', 'lactose', 'sulfites'],
 '[{"id": "i1794765600000_0_11002", "nom": "Pigeon, filets et cuisses confites", "unite": "g", "prixUnit": 0, "quantite": 2250, "categorie": "Autres"}, {"id": "i1794765600000_1_11002", "nom": "Jus de pigeon corsé", "unite": "ml", "prixUnit": 0, "quantite": 200, "categorie": "Autres"}, {"id": "i1794765600000_2_11002", "nom": "Pâte à fettuccine fraîche", "unite": "g", "prixUnit": 0, "quantite": 900, "categorie": "Autres"}, {"id": "i1794765600000_3_11002", "nom": "Base sauce aux champignons des bois", "unite": "g", "prixUnit": 0, "quantite": 700, "categorie": "Autres"}, {"id": "i1794765600000_4_11002", "nom": "Crème", "unite": "ml", "prixUnit": 0, "quantite": 400, "categorie": "Autres"}, {"id": "i1794765600000_5_11002", "nom": "Beurre", "unite": "g", "prixUnit": 0, "quantite": 50, "categorie": "Autres"}]'::jsonb,
 '["Par assiette : 1 filet et 1 cuisse de pigeon, 1 nid de pâtes de 90 g, 70 g de base, 40 ml de crème et 20 ml de jus de pigeon.", "Décongeler les cuisses effilochées la veille en chambre froide.", "À la commande, saler le filet et le saisir côté peau au beurre pendant 3 minutes. Le retourner 1 minute, puis le laisser reposer 4 minutes. Il reste rosé, à 54 °C à cœur.", "Réchauffer l''effiloché de cuisse dans une cuillère de jus de pigeon.", "Régénérer la base avec la crème et réduire 2 minutes.", "Cuire les pâtes 2 minutes 30, directement du surgelé. Les lier dans la sauce avec un peu d''eau de cuisson.", "Dresser les pâtes en nid, l''effiloché dessus, puis le filet tranché en deux. Verser le jus de pigeon chaud autour, sur la crème.", "Le jus de pigeon fait la signature du plat. Ne jamais l''oublier."]'::jsonb,
 null, 3, null, null),
('rec-1794765600000-11003', 'etab-2', 'Poulet ultra croustillant, frites', 'Plats', 10, 15, 'brouillon',
 array['gluten', 'lactose'],
 '[{"id": "i1794765600000_0_11003", "nom": "Blancs de poulet", "unite": "g", "prixUnit": 0, "quantite": 1000, "categorie": "Autres"}, {"id": "i1794765600000_1_11003", "nom": "Ayran", "unite": "g", "prixUnit": 0, "quantite": 500, "categorie": "Autres"}, {"id": "i1794765600000_2_11003", "nom": "Cornflakes nature", "unite": "g", "prixUnit": 0, "quantite": 300, "categorie": "Autres"}, {"id": "i1794765600000_3_11003", "nom": "Sel fin", "unite": "g", "prixUnit": 0, "quantite": 12, "categorie": "Autres"}, {"id": "i1794765600000_4_11003", "nom": "Huile de friture", "unite": "g", "prixUnit": 0, "quantite": 150, "categorie": "Autres"}, {"id": "i1794765600000_5_11003", "nom": "Frites", "unite": "g", "prixUnit": 0, "quantite": 1300, "categorie": "Autres"}]'::jsonb,
 '["Par assiette : 100 g de poulet cru, soit 4 à 5 aiguillettes, et 130 g de frites.", "Tailler les blancs de poulet en aiguillettes de 2 cm de large. Les mélanger avec l''ayran et 8 g de sel.", "Mariner 24 heures au froid, en bac filmé.", "Concasser les cornflakes au rouleau, en éclats, sans les réduire en poudre.", "Sortir les aiguillettes de l''ayran et les égoutter 1 minute sur une grille. Les presser une à une dans les cornflakes, sur toutes les faces. L''ayran resté sur la viande fait tenir la panure.", "Réserver les aiguillettes panées sur plaque, à 3 °C, 4 heures au plus. Au-delà, la panure ramollit.", "À la commande, frire à 170 °C pendant 4 minutes, jusqu''à 72 °C à cœur. Égoutter et saler.", "Frire les frites à part, les saler avec le reste du sel et les dresser à côté du poulet.", "Jeter l''ayran de la marinade, il ne sert jamais deux fois."]'::jsonb,
 'Gluten : le malt d''orge des cornflakes en contient. Méthode crue, sans précuisson. La fiche Blanc de poulet mariné ayran, panure cornflakes, celle du burger de la carte estivale, passe par une cuisson sous vide.',
 2, null, null),
('rec-1794765600000-11004', 'etab-2', 'Sauce bolognaise maison', 'Sauces', 20, 0, 'brouillon',
 array['celeri'],
 '[{"id": "i1794765600000_0_11004", "nom": "Viande hachée de bœuf", "unite": "g", "prixUnit": 0, "quantite": 1000, "categorie": "Autres"}, {"id": "i1794765600000_1_11004", "nom": "Oignons jaunes", "unite": "g", "prixUnit": 0, "quantite": 200, "categorie": "Autres"}, {"id": "i1794765600000_2_11004", "nom": "Carottes", "unite": "g", "prixUnit": 0, "quantite": 150, "categorie": "Autres"}, {"id": "i1794765600000_3_11004", "nom": "Céleri branche", "unite": "g", "prixUnit": 0, "quantite": 100, "categorie": "Autres"}, {"id": "i1794765600000_4_11004", "nom": "Ail", "unite": "g", "prixUnit": 0, "quantite": 10, "categorie": "Autres"}, {"id": "i1794765600000_5_11004", "nom": "Huile d''olive", "unite": "ml", "prixUnit": 0, "quantite": 40, "categorie": "Autres"}, {"id": "i1794765600000_6_11004", "nom": "Concentré de tomate", "unite": "g", "prixUnit": 0, "quantite": 40, "categorie": "Autres"}, {"id": "i1794765600000_7_11004", "nom": "Tomates pelées concassées", "unite": "g", "prixUnit": 0, "quantite": 1200, "categorie": "Autres"}, {"id": "i1794765600000_8_11004", "nom": "Eau", "unite": "g", "prixUnit": 0, "quantite": 200, "categorie": "Autres"}, {"id": "i1794765600000_9_11004", "nom": "Laurier", "unite": "g", "prixUnit": 0, "quantite": 1, "categorie": "Autres"}, {"id": "i1794765600000_10_11004", "nom": "Sucre", "unite": "g", "prixUnit": 0, "quantite": 5, "categorie": "Autres"}, {"id": "i1794765600000_11_11004", "nom": "Sel fin", "unite": "g", "prixUnit": 0, "quantite": 14, "categorie": "Autres"}]'::jsonb,
 '["Rendement : 2 000 g, 20 portions de 100 g.", "Tailler les oignons, les carottes et le céleri en brunoise de 3 mm. Hacher l''ail.", "Suer la brunoise et l''ail à l''huile d''olive pendant 10 minutes, sans coloration.", "Ajouter la viande et la colorer à feu vif en l''égrenant, 8 minutes.", "Ajouter le concentré de tomate et le pincer 2 minutes.", "Ajouter les tomates, l''eau, le laurier, le sucre et le sel. Mijoter 1 heure 30 à petit feu, couvercle entrouvert, en remuant souvent.", "Retirer le laurier. Refroidir en cellule à moins de 10 °C en moins de 2 heures.", "Conditionner sous vide en poches de 1 000 g, à plat, étiquetées.", "Conservation : 4 jours à 3 °C, ou 2 mois surgelé.", "Régénération : à la casserole ou au bain-marie, jusqu''à 75 °C à cœur.", "Ni vin ni piment : la sauce est faite pour les enfants."]'::jsonb,
 null, 4, true, 60),
('rec-1794765600000-11005', 'etab-2', 'Fettuccine bolognaise', 'Plats', 10, 15, 'brouillon',
 array['gluten', 'oeufs', 'celeri', 'lactose'],
 '[{"id": "i1794765600000_0_11005", "nom": "Pâte à fettuccine fraîche", "unite": "g", "prixUnit": 0, "quantite": 900, "categorie": "Autres"}, {"id": "i1794765600000_1_11005", "nom": "Sauce bolognaise maison", "unite": "g", "prixUnit": 0, "quantite": 1000, "categorie": "Autres"}, {"id": "i1794765600000_2_11005", "nom": "Vieux fromage d''alpage râpé", "unite": "g", "prixUnit": 0, "quantite": 50, "categorie": "Autres"}]'::jsonb,
 '["Par assiette : 1 nid de pâtes de 90 g, 100 g de sauce bolognaise et 5 g de fromage râpé.", "Régénérer la sauce à la casserole, jusqu''à 75 °C à cœur.", "Cuire les pâtes 2 minutes 30, directement du surgelé. Les égoutter en gardant un peu d''eau de cuisson.", "Lier les pâtes dans la sauce 30 secondes, avec un trait d''eau de cuisson.", "Dresser en nid. Servir le fromage à part, dans un ramequin."]'::jsonb,
 'Fromage servi à part : sans lui, l''assiette ne contient pas de lactose.',
 3, null, null);

-- 6. Plats : l'ancien plat devient le végétarien, trois plats neufs
update public.plats set
  nom = 'Fettuccine aux champignons des bois', prix_vente = 28,
  description = 'Crème de vin blanc', ordre = 8, updated_at = now()
where id = '26c8d8af-42b1-422b-a62a-753830f4ffb5';

update public.plats set ordre = 4, updated_at = now() where id = '87442eb2-18a6-4fa8-a579-fc266d8de671'; -- Entrecôte
update public.plats set ordre = 7, updated_at = now() where id = '54302596-2187-4a7d-8265-9210ac3f898c'; -- Poulpe
update public.plats set ordre = 9, updated_at = now() where id = '608f832e-2e78-447c-9160-c5fe4f7de8f4'; -- Courge

insert into public.plats (id, etablissement_id, nom, categorie, prix_vente, description, ordre, actif) values
('wl-auto-supreme-volaille', 'etab-2', 'Suprême de volaille jaune', 'Plats', 36, 'Fettuccine aux champignons des bois, crème de vin blanc', 5, true),
('wl-auto-pigeon-roti', 'etab-2', 'Pigeon rôti', 'Plats', 39, 'Fettuccine aux champignons des bois, crème de vin blanc', 6, true),
('wl-auto-enf-poulet', 'etab-2', 'Poulet ultra croustillant', 'Enfants', 15, 'Avec ses frites', 1, true),
('wl-auto-enf-bolognaise', 'etab-2', 'Fettuccine bolognaise', 'Enfants', 15, 'Pâtes fraîches et bolognaise maison', 2, true);

-- 7. Fiches rattachées à chaque plat (dressage et toute sa chaîne)
delete from public.plat_recettes
where plat_id = '26c8d8af-42b1-422b-a62a-753830f4ffb5'
  and recette_id in ('rec-1787607253393-75070', 'rec-1787607253393-53548',
                     'rec-1787607253560-60422', 'rec-1787607253560-84022');

insert into public.plat_recettes (id, plat_id, recette_id, role, ordre)
select gen_random_uuid()::text, v.plat_id, v.recette_id, 'composant', v.ordre
from (values
  ('26c8d8af-42b1-422b-a62a-753830f4ffb5', 'rec-1792178958215-93305', 3),
  ('26c8d8af-42b1-422b-a62a-753830f4ffb5', 'rec-1792178958455-48195', 4),
  ('wl-auto-supreme-volaille', 'rec-1794765600000-11001', 0),
  ('wl-auto-supreme-volaille', 'rec-1787607253393-75070', 1),
  ('wl-auto-supreme-volaille', 'rec-1787607253393-36608', 2),
  ('wl-auto-supreme-volaille', 'rec-1787607253690-95141', 3),
  ('wl-auto-supreme-volaille', 'rec-1792178958215-93305', 4),
  ('wl-auto-pigeon-roti', 'rec-1794765600000-11002', 0),
  ('wl-auto-pigeon-roti', 'rec-1787607253393-53548', 1),
  ('wl-auto-pigeon-roti', 'rec-1787607253560-60422', 2),
  ('wl-auto-pigeon-roti', 'rec-1787607253393-36608', 3),
  ('wl-auto-pigeon-roti', 'rec-1787607253690-95141', 4),
  ('wl-auto-pigeon-roti', 'rec-1792178958215-93305', 5),
  ('wl-auto-enf-poulet', 'rec-1794765600000-11003', 0),
  ('wl-auto-enf-bolognaise', 'rec-1794765600000-11005', 0),
  ('wl-auto-enf-bolognaise', 'rec-1794765600000-11004', 1),
  ('wl-auto-enf-bolognaise', 'rec-1787607253393-36608', 2)
) as v(plat_id, recette_id, ordre);

-- 8. Les quatre plats neufs sur la Carte Automnale
insert into public.carte_plats (id, carte_id, plat_id, ordre)
select gen_random_uuid()::text, 'carte-1787604411839-oe3j', p, 0
from unnest(array['wl-auto-supreme-volaille', 'wl-auto-pigeon-roti',
                  'wl-auto-enf-poulet', 'wl-auto-enf-bolognaise']) as p;

commit;
