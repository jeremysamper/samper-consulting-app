-- Retour arrière de 01-photos-produits.sql : retour à l'état détouré (33 photos
-- détourées avec crédit, picto pour les 8 autres). Les fichiers restent dans le
-- stockage. Une photo posée par la direction reste.
with photos (nom, court, credit, source) as (
  values
    ('Râpe Microplane, économe pro et cuillère parisienne', 'microplane', 'Donovan Govan, CC BY-SA 3.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Micro_Plane.jpg'),
    ('Tablier de cuisine pro', 'tablier-cuisine', 'Auckland Museum, CC BY 4.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Apron,_bib_(AM_1995.129.2-1).jpg'),
    ('Gants anti-coupure et ciseaux de cuisine pro', 'gants-ciseaux', 'Evan-Amos, domaine public, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Kitchen-Scissors.jpg'),
    ('Fusil à aiguiser', 'fusil', 'Kagor, CC BY-SA 3.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Cucina_009_retouched.jpg'),
    ('Chalumeau de cuisine', 'chalumeau', 'MeMaria, CC BY-SA 4.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Newport-zero-mini-butane-torch-lighter-silver.jpg'),
    ('Thermomètre infrarouge', 'thermometre-ir', 'Jobsarayutw, CC BY-SA 4.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:An_infrared_thermometer.JPG'),
    ('Pierre à aiguiser japonaise 1000/6000', 'pierre', 'SilentC, CC BY-SA 3.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Waterstones.jpg'),
    ('Couteau d''office haut de gamme', 'couteau-office', 'Donovan Govan, CC BY-SA 3.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Paring_Knife.jpg'),
    ('Thermomètre sonde pro étanche', 'thermometre-sonde', 'Veganbaking.net, CC BY-SA 2.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Digital_thermometer_in_vegan_bread_(5024088168).jpg'),
    ('Couteau à pain', 'couteau-pain', 'domaine public, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Broodmes.jpg'),
    ('Couteau à filet', 'couteau-filet', 'Ermell, CC BY-SA 4.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Schrade_Uncle_Henry_Fillet_Knife_168UH.jpg'),
    ('Veste de cuisine haut de gamme', 'veste', 'devin rowe, CC BY 3.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Chef_coat_and_women''s_jacket_edited.jpg'),
    ('Chaussures de cuisine antidérapantes', 'chaussures-cuisine', 'Kuchen, domaine public, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Clog-Berkemann-white.jpg'),
    ('Couteau santoku', 'santoku', 'Simon A. Eugster, CC BY-SA 4.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Santoku-Kai-Shun-Nagare.jpg'),
    ('Couteau de chef japonais 21 cm', 'chef-japonais', 'Benlisquare, CC BY-SA 4.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:240mm_gyuto_(top-down_view).jpg'),
    ('Couteau japonais deba, poisson', 'deba', 'Stephan Ridgway, CC BY 2.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Deba_Shouren_Ginsan_stainless_steel_Knife,_Jikko_Knives,_Sakai_(49070649923).jpg'),
    ('Kit de service : limonadier à double levier, clé de bar et 2 stylos', 'kit-service', 'Ivar Leidus, CC BY-SA 4.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Corkscrew_-_sommelier_knife.jpg'),
    ('Ramasse-miettes et 6 liteaux', 'ramasse-miettes', 'Cooper Hewitt, domaine public, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Kayserzinn_Crumber,_1898%E2%80%931900_(CH_52027721).jpg'),
    ('Tablier de serveur à poches', 'tablier-serveur', 'Unsplash, détourée', 'https://unsplash.com/photos/23abf40d03c9'),
    ('Carnet de commande en cuir et porte-addition', 'carnet-commande', 'Kelly Jean, CC0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Leather_notebook_(Unsplash).jpg'),
    ('Pompe à vide, 4 bouchons à champagne et thermomètre à vin', 'pompe-vide', 'VacuVin, CC BY-SA 4.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:WinesaverRVS.jpg'),
    ('Portefeuille de serveur en cuir', 'portefeuille', 'Pexels, détourée', 'https://www.pexels.com/photo/5342623/'),
    ('Kit de bar : shaker, jigger, cuillère et passoire', 'kit-bar', 'Clément Bucco-Lechat, CC BY-SA 3.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Shaker_-_2.jpg'),
    ('Tastevin', 'tastevin', 'CC BY-SA 4.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Tastevin_avec_appui_pouce_recto.jpg'),
    ('Gilet de service haut de gamme', 'gilet', 'Jibranpcc, CC BY-SA 4.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Waistcoat_in_pakistan.jpg'),
    ('Six verres de dégustation pro', 'verres', 'Pexels, détourée', 'https://www.pexels.com/photo/32098272/'),
    ('Chaussures de service antidérapantes', 'chaussures-service', 'Samuel Windsor, CC BY-SA 4.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Samuel_Windsor_oxford_shoe.jpg'),
    ('Tire-bouchon Laguiole en Aubrac', 'laguiole', 'Jean-Pol Grandmont, CC BY 4.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:0_Laguiole_avec_tire-bouchon_Rossignol_-_Thiers_(2).JPG'),
    ('Couteau suisse Victorinox', 'couteau-suisse', 'Andrew Toskin, CC BY-SA 2.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Victorinox_Swiss_Army_Knife_-_Climber_(15554551505).jpg'),
    ('Chaussettes de contention, 3 paires', 'chaussettes', 'DrKssn, CC BY-SA 3.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Mediven550_dk8518.jpg'),
    ('Sac de travail en cuir : tenue, chaussures et effets', 'sac-cuir', 'Erol Ahmed, CC0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Duffel_bag_on_the_floor_next_to_a_chair_(9XiN0r2NWSM).jpg'),
    ('Chaussures pro haut de gamme et semelles orthopédiques', 'chaussures-pro', 'OlafJanssen, CC BY-SA 3.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:Pair_of_plain_toe_oxfords_from_Allen_Edmonds_shoe_company.jpg'),
    ('Kit de dressage : pince, cuillère et 6 flacons souples', 'kit-dressage', 'Peter Schneider, CC BY-SA 4.0, Wikimedia Commons, détourée', 'https://commons.wikimedia.org/wiki/File:K%C3%BCchenpinzette.jpg')
)
update public.points_cadeaux c
   set photo_url = 'https://ppmtoiqgajwcdkbnrcll.supabase.co/storage/v1/object/public/recette-photos/' || c.etablissement_id || '/cadeau-detoure-' || p.court || '.webp',
       photo_credit = p.credit,
       photo_source = p.source
  from photos p
 where c.nom = p.nom
   and c.etablissement_id in ('etab-2', 'etab-1777157340476')
   and c.photo_url like '%/recette-photos/%/cadeau-photo-%';

update public.points_cadeaux
   set photo_url = null, photo_credit = null, photo_source = null
 where etablissement_id in ('etab-2', 'etab-1777157340476')
   and photo_url like '%/recette-photos/%/cadeau-photo-%';
