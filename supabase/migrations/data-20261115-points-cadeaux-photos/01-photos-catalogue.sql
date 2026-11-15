-- Points : photo de chacun des 41 cadeaux du catalogue de P2, à Woodland Village
-- (etab-2) et au Rucher d'Evolène (etab-1777157340476). Fichiers déjà déposés
-- dans recette-photos/<établissement>/cadeau-catalogue-<nom court>.webp.
-- Une photo déjà posée (par la direction) n'est jamais remplacée ; un cadeau
-- renommé n'est pas retrouvé et garde son picto. Rejouable. À jouer après
-- 20261115_points_cadeaux_photo.sql. Retour arrière : 99-rollback.sql.

with photos (nom, court) as (
  values
    ('Kit de dressage : pince, cuillère et 6 flacons souples', 'kit-dressage'),
    ('Râpe Microplane, économe pro et cuillère parisienne', 'microplane'),
    ('Tablier de cuisine pro', 'tablier-cuisine'),
    ('Gants anti-coupure et ciseaux de cuisine pro', 'gants-ciseaux'),
    ('Fusil à aiguiser', 'fusil'),
    ('Chalumeau de cuisine', 'chalumeau'),
    ('Thermomètre infrarouge', 'thermometre-ir'),
    ('Pierre à aiguiser japonaise 1000/6000', 'pierre'),
    ('Mandoline japonaise', 'mandoline'),
    ('Couteau d''office haut de gamme', 'couteau-office'),
    ('Thermomètre sonde pro étanche', 'thermometre-sonde'),
    ('Couteau à pain', 'couteau-pain'),
    ('Deux pantalons de cuisine pro', 'pantalons'),
    ('Trousse à couteaux roulée', 'trousse'),
    ('Couteau à filet', 'couteau-filet'),
    ('Veste de cuisine haut de gamme', 'veste'),
    ('Chaussures de cuisine antidérapantes', 'chaussures-cuisine'),
    ('Couteau santoku', 'santoku'),
    ('Couteau de chef japonais 21 cm', 'chef-japonais'),
    ('Couteau japonais deba, poisson', 'deba'),
    ('Kit de service : limonadier à double levier, clé de bar et 2 stylos', 'kit-service'),
    ('Ramasse-miettes et 6 liteaux', 'ramasse-miettes'),
    ('Tablier de serveur à poches', 'tablier-serveur'),
    ('Carnet de commande en cuir et porte-addition', 'carnet-commande'),
    ('Pompe à vide, 4 bouchons à champagne et thermomètre à vin', 'pompe-vide'),
    ('Holster de ceinture en cuir : limonadier, stylos, carnet', 'holster'),
    ('Aérateur à vin et entonnoir de décantation', 'aerateur'),
    ('Portefeuille de serveur en cuir', 'portefeuille'),
    ('Kit de bar : shaker, jigger, cuillère et passoire', 'kit-bar'),
    ('Tastevin', 'tastevin'),
    ('Gilet de service haut de gamme', 'gilet'),
    ('Tablier de sommelier en cuir', 'tablier-sommelier'),
    ('Six verres de dégustation pro', 'verres'),
    ('Chaussures de service antidérapantes', 'chaussures-service'),
    ('Coravin Pivot, service du vin au verre', 'coravin'),
    ('Coffret Le Nez du Vin, 12 arômes', 'nez-du-vin'),
    ('Tire-bouchon Laguiole en Aubrac', 'laguiole'),
    ('Couteau suisse Victorinox', 'couteau-suisse'),
    ('Chaussettes de contention, 3 paires', 'chaussettes'),
    ('Sac de travail en cuir : tenue, chaussures et effets', 'sac-cuir'),
    ('Chaussures pro haut de gamme et semelles orthopédiques', 'chaussures-pro')
)
update public.points_cadeaux c
   set photo_url = 'https://ppmtoiqgajwcdkbnrcll.supabase.co/storage/v1/object/public/recette-photos/' || c.etablissement_id || '/cadeau-catalogue-' || p.court || '.webp'
  from photos p
 where c.nom = p.nom
   and c.etablissement_id in ('etab-2', 'etab-1777157340476')
   and c.photo_url is null;
