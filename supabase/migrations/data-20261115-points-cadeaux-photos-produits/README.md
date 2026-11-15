# Photos des produits de la boutique des points (15.11.2026)

Demande de Jérémy : les photos détourées ne vont pas, il veut des photos normales des vrais produits, avec un petit crédit ; quand le vrai produit n'a pas de photo libre, une image pertinente.

- Les photos des fabricants et des boutiques ne sont pas reprises : elles sont protégées, un crédit ne donne pas le droit de les utiliser.
- 35 cadeaux montrent le vrai produit (photo libre de l'objet exact, par exemple la râpe Microplane, le couteau Victorinox Climber, la pompe Vacu Vin, le santoku Kai Shun, le sabot Berkemann, un Coravin avec sa boîte).
- 6 cadeaux montrent une image pertinente faute de photo libre du produit exact : Deux pantalons de cuisine pro ; Trousse à couteaux roulée ; Holster de ceinture en cuir : limonadier, stylos, carnet ; Aérateur à vin et entonnoir de décantation ; Tablier de sommelier en cuir ; Coffret Le Nez du Vin, 12 arômes. La direction peut y mettre la photo du cadeau acheté dans Gérer.
- Cadrage : photo entière, carré autour de l'objet entier avec du contexte (objet repéré par un modèle local, sur la machine). S'il faut compléter le carré, c'est par la couleur du fond quand il est uni, sinon par la même photo floutée. 900 x 900, WebP, 1,7 Mo pour les 41.
- Sources : Wikimedia Commons (CC0, domaine public, CC BY, CC BY-SA), Unsplash, Pexels. Crédit et original dans `points_cadeaux.photo_credit` et `photo_source`, affichés par « Crédits des photos » sous la boutique.
- Fichiers déposés deux fois (un dossier par établissement) dans le bucket public `recette-photos`, sous `<établissement>/cadeau-photo-<nom court>.webp`.
- Ordre : fichiers déposés, `01-photos-produits.sql`, `02-verification.sql` (41 photos de produits par établissement), puis le front. Retour arrière : `99-rollback.sql` (état détouré).

| Cadeau | Nature | Fichier | Crédit | Original |
|---|---|---|---|---|
| Kit de dressage : pince, cuillère et 6 flacons souples | produit | `cadeau-photo-kit-dressage.webp` | Peter Schneider, CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:K%C3%BCchenpinzette.jpg |
| Râpe Microplane, économe pro et cuillère parisienne | produit | `cadeau-photo-microplane.webp` | Donovan Govan, CC BY-SA 3.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Micro_Plane.jpg |
| Tablier de cuisine pro | produit | `cadeau-photo-tablier-cuisine.webp` | Auckland Museum, CC BY 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Apron,_bib_(AM_1995.129.2-1).jpg |
| Gants anti-coupure et ciseaux de cuisine pro | produit | `cadeau-photo-gants-ciseaux.webp` | Evan-Amos, domaine public, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Kitchen-Scissors.jpg |
| Fusil à aiguiser | produit | `cadeau-photo-fusil.webp` | Kagor, CC BY-SA 3.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Cucina_009_retouched.jpg |
| Chalumeau de cuisine | produit | `cadeau-photo-chalumeau.webp` | MeMaria, CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Newport-zero-mini-butane-torch-lighter-silver.jpg |
| Thermomètre infrarouge | produit | `cadeau-photo-thermometre-ir.webp` | Jobsarayutw, CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:An_infrared_thermometer.JPG |
| Pierre à aiguiser japonaise 1000/6000 | produit | `cadeau-photo-pierre.webp` | SilentC, CC BY-SA 3.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Waterstones.jpg |
| Mandoline japonaise | produit | `cadeau-photo-mandoline.webp` | Alex Sims, CC BY-SA 2.5, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Cooking_Mandolin_with_Carrot.jpg |
| Couteau d'office haut de gamme | produit | `cadeau-photo-couteau-office.webp` | Donovan Govan, CC BY-SA 3.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Paring_Knife.jpg |
| Thermomètre sonde pro étanche | produit | `cadeau-photo-thermometre-sonde.webp` | Veganbaking.net, CC BY-SA 2.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Digital_thermometer_in_vegan_bread_(5024088168).jpg |
| Couteau à pain | produit | `cadeau-photo-couteau-pain.webp` | domaine public, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Broodmes.jpg |
| Deux pantalons de cuisine pro | image pertinente | `cadeau-photo-pantalons.webp` | licence Pexels | https://www.pexels.com/photo/33055598/ |
| Trousse à couteaux roulée | image pertinente | `cadeau-photo-trousse.webp` | licence Unsplash | https://unsplash.com/photos/9Z8gixUbw8A |
| Couteau à filet | produit | `cadeau-photo-couteau-filet.webp` | Ermell, CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Schrade_Uncle_Henry_Fillet_Knife_168UH.jpg |
| Veste de cuisine haut de gamme | produit | `cadeau-photo-veste.webp` | devin rowe, CC BY 3.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Chef_coat_and_women's_jacket_edited.jpg |
| Chaussures de cuisine antidérapantes | produit | `cadeau-photo-chaussures-cuisine.webp` | Kuchen, domaine public, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Clog-Berkemann-white.jpg |
| Couteau santoku | produit | `cadeau-photo-santoku.webp` | Simon A. Eugster, CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Santoku-Kai-Shun-Nagare.jpg |
| Couteau de chef japonais 21 cm | produit | `cadeau-photo-chef-japonais.webp` | Benlisquare, CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:240mm_gyuto_(top-down_view).jpg |
| Couteau japonais deba, poisson | produit | `cadeau-photo-deba.webp` | Stephan Ridgway, CC BY 2.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Deba_Shouren_Ginsan_stainless_steel_Knife,_Jikko_Knives,_Sakai_(49070649923).jpg |
| Kit de service : limonadier à double levier, clé de bar et 2 stylos | produit | `cadeau-photo-kit-service.webp` | Ivar Leidus, CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Corkscrew_-_sommelier_knife.jpg |
| Ramasse-miettes et 6 liteaux | produit | `cadeau-photo-ramasse-miettes.webp` | Cooper Hewitt, domaine public, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Kayserzinn_Crumber,_1898%E2%80%931900_(CH_52027721).jpg |
| Tablier de serveur à poches | produit | `cadeau-photo-tablier-serveur.webp` | eyespeak, licence Unsplash | https://unsplash.com/photos/1IQH4b2g-sA |
| Carnet de commande en cuir et porte-addition | produit | `cadeau-photo-carnet-commande.webp` | Kelly Jean, CC0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Leather_notebook_(Unsplash).jpg |
| Pompe à vide, 4 bouchons à champagne et thermomètre à vin | produit | `cadeau-photo-pompe-vide.webp` | VacuVin, CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:WinesaverRVS.jpg |
| Holster de ceinture en cuir : limonadier, stylos, carnet | image pertinente | `cadeau-photo-holster.webp` | licence Pexels | https://www.pexels.com/photo/37326800/ |
| Aérateur à vin et entonnoir de décantation | image pertinente | `cadeau-photo-aerateur.webp` | Geoff Parsons from Portsmouth, VA, CC BY-SA 2.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:New_Decanter.jpg |
| Portefeuille de serveur en cuir | produit | `cadeau-photo-portefeuille.webp` | licence Pexels | https://www.pexels.com/photo/5342623/ |
| Kit de bar : shaker, jigger, cuillère et passoire | produit | `cadeau-photo-kit-bar.webp` | Clément Bucco-Lechat, CC BY-SA 3.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Shaker_-_2.jpg |
| Tastevin | produit | `cadeau-photo-tastevin.webp` | CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Tastevin_avec_appui_pouce_recto.jpg |
| Gilet de service haut de gamme | produit | `cadeau-photo-gilet.webp` | Jibranpcc, CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Waistcoat_in_pakistan.jpg |
| Tablier de sommelier en cuir | image pertinente | `cadeau-photo-tablier-sommelier.webp` | eedgarivann, licence Unsplash | https://unsplash.com/photos/s36NqLkAB-s |
| Six verres de dégustation pro | produit | `cadeau-photo-verres.webp` | licence Pexels | https://www.pexels.com/photo/32098272/ |
| Chaussures de service antidérapantes | produit | `cadeau-photo-chaussures-service.webp` | Samuel Windsor, CC BY-SA 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Samuel_Windsor_oxford_shoe.jpg |
| Coravin Pivot, service du vin au verre | produit | `cadeau-photo-coravin.webp` | Missy Ward, CC BY 2.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Distributeur_%C3%A0_vin.jpg |
| Coffret Le Nez du Vin, 12 arômes | image pertinente | `cadeau-photo-nez-du-vin.webp` | Volant, licence Unsplash | https://unsplash.com/photos/b4l0ixB1FQM |
| Tire-bouchon Laguiole en Aubrac | produit | `cadeau-photo-laguiole.webp` | Jean-Pol Grandmont, CC BY 4.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:0_Laguiole_avec_tire-bouchon_Rossignol_-_Thiers_(2).JPG |
| Couteau suisse Victorinox | produit | `cadeau-photo-couteau-suisse.webp` | Andrew Toskin, CC BY-SA 2.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Victorinox_Swiss_Army_Knife_-_Climber_(15554551505).jpg |
| Chaussettes de contention, 3 paires | produit | `cadeau-photo-chaussettes.webp` | DrKssn, CC BY-SA 3.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Mediven550_dk8518.jpg |
| Sac de travail en cuir : tenue, chaussures et effets | produit | `cadeau-photo-sac-cuir.webp` | Erol Ahmed, CC0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Duffel_bag_on_the_floor_next_to_a_chair_(9XiN0r2NWSM).jpg |
| Chaussures pro haut de gamme et semelles orthopédiques | produit | `cadeau-photo-chaussures-pro.webp` | OlafJanssen, CC BY-SA 3.0, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Pair_of_plain_toe_oxfords_from_Allen_Edmonds_shoe_company.jpg |
