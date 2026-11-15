# Photos détourées du catalogue de la boutique des points (15.11.2026)

Demande de Jérémy : seulement des images détourées, posées proprement dans l'app, à la place des photos d'ambiance qui dénaturaient la direction artistique.

- 33 cadeaux ont une photo de l'objet exact. Détourage sur la machine (modèle local @imgly/background-removal-node, aucun envoi à un service), puis cadrage : objet centré dans un carré transparent de 800 px, marge de 8 %, WebP avec transparence (1,2 Mo pour les 33). La veste de cuisine, à moitié cachée sur l'original, est reconstituée en miroir de sa moitié visible. Le verre garde sa transparence.
- 8 cadeaux n'ont pas de photo libre de l'objet exact. Ils gardent le picto en attendant une photo de la direction : Mandoline japonaise ; Deux pantalons de cuisine pro ; Trousse à couteaux roulée ; Holster de ceinture en cuir : limonadier, stylos, carnet ; Aérateur à vin et entonnoir de décantation ; Tablier de sommelier en cuir ; Coravin Pivot, service du vin au verre ; Coffret Le Nez du Vin, 12 arômes.
- Sources : Wikimedia Commons (CC0, domaine public, CC BY, CC BY-SA), Unsplash et Pexels (licences propres, sans mention obligatoire). Crédit et original de chaque photo dans `points_cadeaux.photo_credit` et `photo_source`, affichés par « Crédits des photos » sous la boutique. Les détourages tirés d'une photo CC BY-SA restent sous CC BY-SA.
- Fichiers déposés deux fois (un dossier par établissement) dans le bucket public `recette-photos`, sous `<établissement>/cadeau-detoure-<nom court>.webp`.
- Ordre : fichiers déposés, `20261115_points_cadeaux_photo_credit.sql`, `01-photos-detourees.sql`, `02-verification.sql` (33 détourées et 0 photo d'ambiance par établissement), puis le front. Retour arrière : `99-rollback.sql` (photos d'ambiance), puis l'inverse de la migration.

| Cadeau | Fichier | Crédit | Original |
|---|---|---|---|
| Râpe Microplane, économe pro et cuillère parisienne | `cadeau-detoure-microplane.webp` | Donovan Govan, CC BY-SA 3.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Micro_Plane.jpg |
| Tablier de cuisine pro | `cadeau-detoure-tablier-cuisine.webp` | Auckland Museum, CC BY 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Apron,_bib_(AM_1995.129.2-1).jpg |
| Gants anti-coupure et ciseaux de cuisine pro | `cadeau-detoure-gants-ciseaux.webp` | Evan-Amos, domaine public, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Kitchen-Scissors.jpg |
| Fusil à aiguiser | `cadeau-detoure-fusil.webp` | Kagor, CC BY-SA 3.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Cucina_009_retouched.jpg |
| Chalumeau de cuisine | `cadeau-detoure-chalumeau.webp` | MeMaria, CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Newport-zero-mini-butane-torch-lighter-silver.jpg |
| Thermomètre infrarouge | `cadeau-detoure-thermometre-ir.webp` | Jobsarayutw, CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:An_infrared_thermometer.JPG |
| Pierre à aiguiser japonaise 1000/6000 | `cadeau-detoure-pierre.webp` | SilentC, CC BY-SA 3.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Waterstones.jpg |
| Couteau d'office haut de gamme | `cadeau-detoure-couteau-office.webp` | Donovan Govan, CC BY-SA 3.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Paring_Knife.jpg |
| Thermomètre sonde pro étanche | `cadeau-detoure-thermometre-sonde.webp` | Veganbaking.net, CC BY-SA 2.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Digital_thermometer_in_vegan_bread_(5024088168).jpg |
| Couteau à pain | `cadeau-detoure-couteau-pain.webp` | domaine public, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Broodmes.jpg |
| Couteau à filet | `cadeau-detoure-couteau-filet.webp` | Ermell, CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Schrade_Uncle_Henry_Fillet_Knife_168UH.jpg |
| Veste de cuisine haut de gamme | `cadeau-detoure-veste.webp` | devin rowe, CC BY 3.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Chef_coat_and_women's_jacket_edited.jpg |
| Chaussures de cuisine antidérapantes | `cadeau-detoure-chaussures-cuisine.webp` | Kuchen, domaine public, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Clog-Berkemann-white.jpg |
| Couteau santoku | `cadeau-detoure-santoku.webp` | Simon A. Eugster, CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Santoku-Kai-Shun-Nagare.jpg |
| Couteau de chef japonais 21 cm | `cadeau-detoure-chef-japonais.webp` | Benlisquare, CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:240mm_gyuto_(top-down_view).jpg |
| Couteau japonais deba, poisson | `cadeau-detoure-deba.webp` | Stephan Ridgway, CC BY 2.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Deba_Shouren_Ginsan_stainless_steel_Knife,_Jikko_Knives,_Sakai_(49070649923).jpg |
| Kit de service : limonadier à double levier, clé de bar et 2 stylos | `cadeau-detoure-kit-service.webp` | Ivar Leidus, CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Corkscrew_-_sommelier_knife.jpg |
| Ramasse-miettes et 6 liteaux | `cadeau-detoure-ramasse-miettes.webp` | Cooper Hewitt, domaine public, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Kayserzinn_Crumber,_1898%E2%80%931900_(CH_52027721).jpg |
| Tablier de serveur à poches | `cadeau-detoure-tablier-serveur.webp` | eyespeak, licence Unsplash | https://unsplash.com/photos/1IQH4b2g-sA |
| Carnet de commande en cuir et porte-addition | `cadeau-detoure-carnet-commande.webp` | Kelly Jean, CC0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Leather_notebook_(Unsplash).jpg |
| Pompe à vide, 4 bouchons à champagne et thermomètre à vin | `cadeau-detoure-pompe-vide.webp` | VacuVin, CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:WinesaverRVS.jpg |
| Portefeuille de serveur en cuir | `cadeau-detoure-portefeuille.webp` | licence Pexels | https://www.pexels.com/photo/5342623/ |
| Kit de bar : shaker, jigger, cuillère et passoire | `cadeau-detoure-kit-bar.webp` | Clément Bucco-Lechat, CC BY-SA 3.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Shaker_-_2.jpg |
| Tastevin | `cadeau-detoure-tastevin.webp` | CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Tastevin_avec_appui_pouce_recto.jpg |
| Gilet de service haut de gamme | `cadeau-detoure-gilet.webp` | Jibranpcc, CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Waistcoat_in_pakistan.jpg |
| Six verres de dégustation pro | `cadeau-detoure-verres.webp` | licence Pexels | https://www.pexels.com/photo/32098272/ |
| Chaussures de service antidérapantes | `cadeau-detoure-chaussures-service.webp` | Samuel Windsor, CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Samuel_Windsor_oxford_shoe.jpg |
| Tire-bouchon Laguiole en Aubrac | `cadeau-detoure-laguiole.webp` | Jean-Pol Grandmont, CC BY 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:0_Laguiole_avec_tire-bouchon_Rossignol_-_Thiers_(2).JPG |
| Couteau suisse Victorinox | `cadeau-detoure-couteau-suisse.webp` | Andrew Toskin, CC BY-SA 2.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Victorinox_Swiss_Army_Knife_-_Climber_(15554551505).jpg |
| Chaussettes de contention, 3 paires | `cadeau-detoure-chaussettes.webp` | DrKssn, CC BY-SA 3.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Mediven550_dk8518.jpg |
| Sac de travail en cuir : tenue, chaussures et effets | `cadeau-detoure-sac-cuir.webp` | Erol Ahmed, CC0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Duffel_bag_on_the_floor_next_to_a_chair_(9XiN0r2NWSM).jpg |
| Chaussures pro haut de gamme et semelles orthopédiques | `cadeau-detoure-chaussures-pro.webp` | OlafJanssen, CC BY-SA 3.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Pair_of_plain_toe_oxfords_from_Allen_Edmonds_shoe_company.jpg |
| Kit de dressage : pince, cuillère et 6 flacons souples | `cadeau-detoure-kit-dressage.webp` | Peter Schneider, CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:K%C3%BCchenpinzette.jpg |
