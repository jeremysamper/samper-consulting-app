-- Points : photos en mise en scène soignée (style B choisi par Jérémy,
-- 15.11.2026) à la place des photos entières de produits, à Woodland Village
-- (etab-2) et au Rucher d'Evolène (etab-1777157340476). Les 41 cadeaux prennent
-- leur photo, son crédit et son original. Seules les photos du catalogue sont
-- touchées : une photo posée par la direction reste. Fichiers déjà déposés dans
-- recette-photos/<établissement>/cadeau-mise-<court>.webp. Rejouable.
-- Retour arrière : 99-rollback.sql.

with photos (nom, court, credit, source) as (
  values
    ('Kit de dressage : pince, cuillère et 6 flacons souples', 'kit-dressage', 'tommasoubezio, licence Unsplash', 'https://unsplash.com/photos/-TCkbUCUBiA'),
    ('Râpe Microplane, économe pro et cuillère parisienne', 'microplane', 'licence Pexels', 'https://www.pexels.com/photo/4600746/'),
    ('Tablier de cuisine pro', 'tablier-cuisine', 'evajosefina, licence Unsplash', 'https://unsplash.com/photos/FD_cw2J5so0'),
    ('Gants anti-coupure et ciseaux de cuisine pro', 'gants-ciseaux', 'studioletsch, licence Unsplash', 'https://unsplash.com/photos/_KBeCpqfaPM'),
    ('Fusil à aiguiser', 'fusil', 'licence Pexels', 'https://www.pexels.com/photo/8629035/'),
    ('Chalumeau de cuisine', 'chalumeau', 'licence Pexels', 'https://www.pexels.com/photo/8644038/'),
    ('Thermomètre infrarouge', 'thermometre-ir', 'jhardman704, licence Unsplash', 'https://unsplash.com/photos/1ahMH8GyEgs'),
    ('Pierre à aiguiser japonaise 1000/6000', 'pierre', 'licence Pexels', 'https://www.pexels.com/photo/11538983/'),
    ('Mandoline japonaise', 'mandoline', 'iupilon, licence Unsplash', 'https://unsplash.com/photos/UCCdpu8Cjiw'),
    ('Couteau d''office haut de gamme', 'couteau-office', 'savernakeknives, licence Unsplash', 'https://unsplash.com/photos/YES-ect0c08'),
    ('Thermomètre sonde pro étanche', 'thermometre-sonde', 'josholalde, licence Unsplash', 'https://unsplash.com/photos/YDLHa1DEfhU'),
    ('Couteau à pain', 'couteau-pain', 'licence Pexels', 'https://www.pexels.com/photo/11646501/'),
    ('Deux pantalons de cuisine pro', 'pantalons', 'licence Pexels', 'https://www.pexels.com/photo/33055598/'),
    ('Trousse à couteaux roulée', 'trousse', 'sanderhallaste, licence Unsplash', 'https://unsplash.com/photos/4j_qFna2u4Y'),
    ('Couteau à filet', 'couteau-filet', 'shresag, licence Unsplash', 'https://unsplash.com/photos/bMwsDfG7HuQ'),
    ('Veste de cuisine haut de gamme', 'veste', 'licence Pexels', 'https://www.pexels.com/photo/6050333/'),
    ('Chaussures de cuisine antidérapantes', 'chaussures-cuisine', 'Kuchen, domaine public, Wikimedia Commons', 'https://commons.wikimedia.org/wiki/File:Clog-Berkemann-white.jpg'),
    ('Couteau santoku', 'santoku', 'knifeforest, licence Unsplash', 'https://unsplash.com/photos/uy1iIr2r-f8'),
    ('Couteau de chef japonais 21 cm', 'chef-japonais', 'sternsteiger, licence Unsplash', 'https://unsplash.com/photos/Bf7bxQYqBL0'),
    ('Couteau japonais deba, poisson', 'deba', 'Stephan Ridgway, CC BY 2.0, Wikimedia Commons', 'https://commons.wikimedia.org/wiki/File:Deba_Shouren_Ginsan_stainless_steel_Knife,_Jikko_Knives,_Sakai_(49070649923).jpg'),
    ('Kit de service : limonadier à double levier, clé de bar et 2 stylos', 'kit-service', 'denleyphotography, licence Unsplash', 'https://unsplash.com/photos/UXToTS7j8TU'),
    ('Ramasse-miettes et 6 liteaux', 'ramasse-miettes', 'kekse_und_ich, licence Unsplash', 'https://unsplash.com/photos/IgIgec1PfHo'),
    ('Tablier de serveur à poches', 'tablier-serveur', 'eyespeak, licence Unsplash', 'https://unsplash.com/photos/1IQH4b2g-sA'),
    ('Carnet de commande en cuir et porte-addition', 'carnet-commande', 'niftyleather, licence Unsplash', 'https://unsplash.com/photos/MfWvsEUb9Xs'),
    ('Pompe à vide, 4 bouchons à champagne et thermomètre à vin', 'pompe-vide', 'VacuVin, CC BY-SA 4.0, Wikimedia Commons', 'https://commons.wikimedia.org/wiki/File:WinesaverRVS.jpg'),
    ('Holster de ceinture en cuir : limonadier, stylos, carnet', 'holster', 'fzfte, licence Unsplash', 'https://unsplash.com/photos/kTozgN5CQHc'),
    ('Aérateur à vin et entonnoir de décantation', 'aerateur', 'themephotos, licence Unsplash', 'https://unsplash.com/photos/mR_lv_G7XCY'),
    ('Portefeuille de serveur en cuir', 'portefeuille', 'constantinevdokimov, licence Unsplash', 'https://unsplash.com/photos/rhP8U-86GZA'),
    ('Kit de bar : shaker, jigger, cuillère et passoire', 'kit-bar', 'licence Unsplash', 'https://unsplash.com/photos/4VYLNi0qeF8'),
    ('Tastevin', 'tastevin', 'starship, licence Unsplash', 'https://unsplash.com/photos/hO3C5xzTpoo'),
    ('Gilet de service haut de gamme', 'gilet', 'licence Pexels', 'https://www.pexels.com/photo/4975615/'),
    ('Tablier de sommelier en cuir', 'tablier-sommelier', 'licence Pexels', 'https://www.pexels.com/photo/6653219/'),
    ('Six verres de dégustation pro', 'verres', 'juliesdfg, licence Unsplash', 'https://unsplash.com/photos/fDTv0BqaiFw'),
    ('Chaussures de service antidérapantes', 'chaussures-service', 'husien_bisky1, licence Unsplash', 'https://unsplash.com/photos/SLIorbhV9iE'),
    ('Coravin Pivot, service du vin au verre', 'coravin', 'denis_sousa, licence Unsplash', 'https://unsplash.com/photos/l47y_u9zCIw'),
    ('Coffret Le Nez du Vin, 12 arômes', 'nez-du-vin', 'qwitka, licence Unsplash', 'https://unsplash.com/photos/3uJt73tr4hI'),
    ('Tire-bouchon Laguiole en Aubrac', 'laguiole', 'licence Pexels', 'https://www.pexels.com/photo/404341/'),
    ('Couteau suisse Victorinox', 'couteau-suisse', 'pf91_photography, licence Unsplash', 'https://unsplash.com/photos/2NuEzrmD2xQ'),
    ('Chaussettes de contention, 3 paires', 'chaussettes', 'vinikhill, licence Unsplash', 'https://unsplash.com/photos/8Al2ylhlCYk'),
    ('Sac de travail en cuir : tenue, chaussures et effets', 'sac-cuir', 'jediahowen, licence Unsplash', 'https://unsplash.com/photos/PpzBE1hWeGI'),
    ('Chaussures pro haut de gamme et semelles orthopédiques', 'chaussures-pro', 'garg_monaal, licence Unsplash', 'https://unsplash.com/photos/99NxpMVxWDA')
)
update public.points_cadeaux c
   set photo_url = 'https://ppmtoiqgajwcdkbnrcll.supabase.co/storage/v1/object/public/recette-photos/' || c.etablissement_id || '/cadeau-mise-' || p.court || '.webp',
       photo_credit = p.credit,
       photo_source = p.source
  from photos p
 where c.nom = p.nom
   and c.etablissement_id in ('etab-2', 'etab-1777157340476')
   and (c.photo_url is null
        or c.photo_url like '%/recette-photos/%/cadeau-catalogue-%'
        or c.photo_url like '%/recette-photos/%/cadeau-detoure-%'
        or c.photo_url like '%/recette-photos/%/cadeau-photo-%'
        or c.photo_url like '%/recette-photos/%/cadeau-mise-%');
