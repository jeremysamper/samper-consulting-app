
// ============================================================
// SAMPER CONSULTING — Données de démonstration
// ============================================================

const DEMO_DATA = {
  etablissements: [
    { id: 'etab-1', nom: 'Hôtel Panorama', type: 'Hôtel-Restaurant', adresse: 'Rue du Rhône 42, 1204 Genève', tel: '+41 22 310 45 60', couleur: '#8B6914' },
    { id: 'etab-2', nom: 'Woodland Village', type: 'Restaurant Bistronomique', adresse: 'Avenue de la Gare 18, 1800 Vevey', tel: '+41 21 921 23 00', couleur: '#1a5276' }
  ],

  utilisateurs: [
    { id: 'u1', nom: 'Samper', prenom: 'Jérémy', role: 'consultant', email: 'jeremy@samper-consulting.ch', etablissementIds: ['etab-1','etab-2'], poste: 'Consultant culinaire', avatar: 'JS', actif: true },
    { id: 'u2', nom: 'Dupont', prenom: 'Pierre', role: 'patron', email: 'p.dupont@lecomptoir.ch', etablissementIds: ['etab-1'], poste: 'Directeur', avatar: 'PD', actif: true },
    { id: 'u3', nom: 'Müller', prenom: 'Sarah', role: 'resp_cuisine', email: 's.muller@lecomptoir.ch', etablissementIds: ['etab-1'], poste: 'Cheffe de cuisine', avatar: 'SM', actif: true },
    { id: 'u4', nom: 'Rossi', prenom: 'Luca', role: 'cuisinier', email: 'l.rossi@lecomptoir.ch', etablissementIds: ['etab-1'], poste: 'Cuisinier chef de partie', avatar: 'LR', actif: true },
    { id: 'u5', nom: 'Favre', prenom: 'Julie', role: 'serveur', email: 'j.favre@lecomptoir.ch', etablissementIds: ['etab-1'], poste: 'Serveuse', avatar: 'JF', actif: true },
    { id: 'u6', nom: 'Blanc', prenom: 'Thomas', role: 'cuisinier', email: 't.blanc@lecomptoir.ch', etablissementIds: ['etab-1'], poste: 'Cuisinier commis', avatar: 'TB', actif: true },
    { id: 'u7', nom: 'Girod', prenom: 'Emma', role: 'serveur', email: 'e.girod@lecomptoir.ch', etablissementIds: ['etab-1'], poste: 'Serveuse', avatar: 'EG', actif: true }
  ],

  credentials: {
    'jeremysamper.pro@gmail.com': { userId: 'u1' }
  },

  roles: {
    consultant:   { label: 'Consultant culinaire', couleur: '#92702A' },
    patron:       { label: 'Patron / Directeur',   couleur: '#1a5276' },
    resp_cuisine: { label: 'Responsable cuisine',  couleur: '#1e6b40' },
    cuisinier:    { label: 'Cuisinier',            couleur: '#6c3483' },
    serveur:      { label: 'Serveur / Serveuse',   couleur: '#2e7ab8' }
  },

  permissions: {
    consultant:   { dashboard:true, planning:true, pointage:true, recettes:true, cartes:true, inventaire:true, pertes:true, haccp:true, fiches_salle:true, documents:true, roles:true, parametres:true, consultant_tools:true, factures:true, catalogue:true, sop:true, kit_cuisinier:true },
    patron:       { dashboard:true, planning:true, pointage:true, recettes:true, cartes:true, inventaire:true, pertes:true, haccp:true, fiches_salle:true, documents:true, roles:false, parametres:true, consultant_tools:false, factures:false, catalogue:true, sop:true, kit_cuisinier:true },
    resp_cuisine: { dashboard:true, planning:true, pointage:true, recettes:true, cartes:false, inventaire:true, pertes:true, haccp:true, fiches_salle:true, documents:true, roles:false, parametres:false, consultant_tools:false, factures:false, catalogue:true, sop:true, kit_cuisinier:true },
    cuisinier:    { dashboard:true, planning:true, pointage:true, recettes:true, cartes:false, inventaire:false, pertes:true, haccp:true, fiches_salle:false, documents:true, roles:false, parametres:false, consultant_tools:false, factures:false, catalogue:true, sop:true, kit_cuisinier:true },
    serveur:      { dashboard:true, planning:true, pointage:true, recettes:false, cartes:true, inventaire:false, pertes:false, haccp:false, fiches_salle:true, documents:true, roles:false, parametres:false, consultant_tools:false, factures:false, catalogue:false, sop:true, kit_cuisinier:true }
  },

  // Planning semaine du 21 avril 2026
  planning: [
    // Sarah Müller - Lundi à Vendredi
    { id: 's1', userId:'u3', date:'2026-04-21', debut:'09:00', fin:'17:30', pause:45, poste:'Cuisine', statut:'confirmé', pointageDebut:'09:02', pointageFin:null },
    { id: 's2', userId:'u3', date:'2026-04-22', debut:'09:00', fin:'17:30', pause:45, poste:'Cuisine', statut:'confirmé', pointageDebut:'09:00', pointageFin:'17:35' },
    { id: 's3', userId:'u3', date:'2026-04-23', debut:'09:00', fin:'17:30', pause:45, poste:'Cuisine', statut:'confirmé', pointageDebut:null, pointageFin:null },
    { id: 's4', userId:'u3', date:'2026-04-24', debut:'09:00', fin:'17:30', pause:45, poste:'Cuisine', statut:'confirmé', pointageDebut:null, pointageFin:null },
    { id: 's5', userId:'u3', date:'2026-04-25', debut:'09:00', fin:'17:30', pause:45, poste:'Cuisine', statut:'confirmé', pointageDebut:null, pointageFin:null },
    // Luca Rossi - Mardi à Samedi
    { id: 's6', userId:'u4', date:'2026-04-21', debut:'10:00', fin:'18:30', pause:30, poste:'Chef de partie', statut:'confirmé', pointageDebut:'10:05', pointageFin:null },
    { id: 's7', userId:'u4', date:'2026-04-22', debut:'10:00', fin:'22:00', pause:60, poste:'Chef de partie (soir)', statut:'confirmé', pointageDebut:'10:00', pointageFin:'22:10' },
    { id: 's8', userId:'u4', date:'2026-04-24', debut:'10:00', fin:'22:00', pause:60, poste:'Chef de partie (soir)', statut:'confirmé', pointageDebut:null, pointageFin:null },
    { id: 's9', userId:'u4', date:'2026-04-25', debut:'10:00', fin:'22:00', pause:60, poste:'Chef de partie (soir)', statut:'confirmé', pointageDebut:null, pointageFin:null },
    // Julie Favre - Mercredi à Dimanche
    { id: 's10', userId:'u5', date:'2026-04-21', debut:'11:00', fin:'22:00', pause:60, poste:'Salle', statut:'confirmé', pointageDebut:'11:00', pointageFin:null },
    { id: 's11', userId:'u5', date:'2026-04-22', debut:'11:00', fin:'22:00', pause:60, poste:'Salle', statut:'confirmé', pointageDebut:'10:58', pointageFin:'22:05' },
    { id: 's12', userId:'u5', date:'2026-04-23', debut:'11:00', fin:'22:00', pause:60, poste:'Salle', statut:'confirmé', pointageDebut:null, pointageFin:null },
    { id: 's13', userId:'u5', date:'2026-04-24', debut:'11:00', fin:'22:00', pause:60, poste:'Salle', statut:'confirmé', pointageDebut:null, pointageFin:null },
    { id: 's14', userId:'u5', date:'2026-04-25', debut:'11:00', fin:'22:00', pause:60, poste:'Salle', statut:'confirmé', pointageDebut:null, pointageFin:null },
    // Thomas Blanc - Lundi à Samedi matin
    { id: 's15', userId:'u6', date:'2026-04-21', debut:'07:00', fin:'15:30', pause:30, poste:'Commis', statut:'confirmé', pointageDebut:'07:02', pointageFin:null },
    { id: 's16', userId:'u6', date:'2026-04-22', debut:'07:00', fin:'15:30', pause:30, poste:'Commis', statut:'confirmé', pointageDebut:'07:00', pointageFin:'15:28' },
    { id: 's17', userId:'u6', date:'2026-04-23', debut:'07:00', fin:'15:30', pause:30, poste:'Commis', statut:'confirmé', pointageDebut:null, pointageFin:null },
    { id: 's18', userId:'u6', date:'2026-04-24', debut:'07:00', fin:'15:30', pause:30, poste:'Commis', statut:'confirmé', pointageDebut:null, pointageFin:null },
    { id: 's19', userId:'u6', date:'2026-04-25', debut:'07:00', fin:'15:30', pause:30, poste:'Commis', statut:'confirmé', pointageDebut:null, pointageFin:null },
    // Emma Girod
    { id: 's20', userId:'u7', date:'2026-04-21', debut:'11:00', fin:'22:00', pause:60, poste:'Salle', statut:'confirmé', pointageDebut:'11:00', pointageFin:null },
    { id: 's21', userId:'u7', date:'2026-04-23', debut:'11:00', fin:'22:00', pause:60, poste:'Salle', statut:'confirmé', pointageDebut:null, pointageFin:null },
    { id: 's22', userId:'u7', date:'2026-04-24', debut:'11:00', fin:'22:00', pause:60, poste:'Salle (remplacement)', statut:'modifié', pointageDebut:null, pointageFin:null },
    { id: 's23', userId:'u7', date:'2026-04-25', debut:'11:00', fin:'22:00', pause:60, poste:'Salle', statut:'confirmé', pointageDebut:null, pointageFin:null },
  ],

  recettes: [
    {
      id: 'rec-1',
      nom: 'Risotto aux champignons sauvages',
      portions: 4,
      categorie: 'Plats',
      statut: 'active',
      version: 3,
      prixVente: 32.00,
      allergenesIds: ['lactose','gluten','sulfites'],
      notesConsultant: 'Recette signature. Ratio céréale/bouillon à respecter impérativement. Vérifier la cuisson al dente. Mantecatura hors feu obligatoire.',
      modifie: '2026-04-18',
      modifiePar: 'u3',
      tempsPreparation: 20,
      tempsCuisson: 25,
      tempsTotal: 45,
      ingredients: [
        { id:'i1', nom:'Riz Arborio',           quantite:320, unite:'g',  prixUnit:0.0035, categorie:'Épicerie sèche' },
        { id:'i2', nom:'Champignons sauvages',   quantite:200, unite:'g',  prixUnit:0.028,  categorie:'Légumes' },
        { id:'i3', nom:'Bouillon de légumes',    quantite:800, unite:'ml', prixUnit:0.0015, categorie:'Fonds & sauces' },
        { id:'i4', nom:'Parmesan AOP',           quantite:60,  unite:'g',  prixUnit:0.05,   categorie:'Produits laitiers' },
        { id:'i5', nom:'Beurre doux',            quantite:50,  unite:'g',  prixUnit:0.018,  categorie:'Produits laitiers' },
        { id:'i6', nom:'Échalotes',              quantite:60,  unite:'g',  prixUnit:0.008,  categorie:'Légumes' },
        { id:'i7', nom:'Vin blanc sec',          quantite:100, unite:'ml', prixUnit:0.006,  categorie:'Vins & alcools' },
        { id:'i8', nom:'Huile d\'olive',         quantite:20,  unite:'ml', prixUnit:0.012,  categorie:'Épicerie sèche' },
        { id:'i9', nom:'Sel, poivre',            quantite:5,   unite:'g',  prixUnit:0.003,  categorie:'Épicerie sèche' },
      ],
      etapes: [
        'Ciseler finement les échalotes.',
        'Faire suer les échalotes dans l\'huile d\'olive avec une noisette de beurre, sans coloration, 3 minutes à feu doux.',
        'Ajouter le riz Arborio et le nacrer 2 minutes en remuant constamment.',
        'Déglacer au vin blanc. Laisser absorber complètement.',
        'Ajouter le bouillon chaud louche par louche (env. 80 ml) en remuant. Attendre absorption avant d\'ajouter la suivante.',
        'En parallèle, saisir les champignons à feu très vif dans une poêle séparée. Saler en fin de cuisson.',
        'Après 16–18 min de cuisson du riz, incorporer les champignons.',
        'Mantecatura : retirer du feu, incorporer le beurre froid en dés et le parmesan râpé. Remuer vigoureusement.',
        'Ajuster l\'assaisonnement. Servir immédiatement dans des assiettes creuses préchauffées.'
      ],
      dressage: 'Dresser en cercle généreux dans l\'assiette creuse préchauffée. Disposer quelques champignons entiers sur le dessus. Finir avec des copeaux de parmesan et un filet d\'huile de truffe blanche. Poivre du moulin.',
      conservation: '24h maximum au réfrigérateur, à conserver non mantecato. Ne pas congeler. Réchauffer avec un peu de bouillon à feu doux.',
    },
    {
      id: 'rec-2',
      nom: 'Pavé de bœuf Simmental, jus corsé',
      portions: 4,
      categorie: 'Plats',
      statut: 'active',
      version: 2,
      prixVente: 54.00,
      allergenesIds: ['lactose'],
      notesConsultant: 'Privilégier un repos de 5 min sous aluminium après cuisson. Températures cœur : saignant 52°C, rosé 57°C, à point 63°C.',
      modifie: '2026-04-10',
      modifiePar: 'u1',
      tempsPreparation: 15,
      tempsCuisson: 12,
      tempsTotal: 27,
      ingredients: [
        { id:'i10', nom:'Bœuf Simmental (pavé)',  quantite:800, unite:'g',  prixUnit:0.052, categorie:'Viandes' },
        { id:'i11', nom:'Beurre clarifié',        quantite:30,  unite:'g',  prixUnit:0.022, categorie:'Produits laitiers' },
        { id:'i12', nom:'Fond de veau',           quantite:200, unite:'ml', prixUnit:0.008, categorie:'Fonds & sauces' },
        { id:'i13', nom:'Thym frais',             quantite:5,   unite:'g',  prixUnit:0.04,  categorie:'Herbes & aromates' },
        { id:'i14', nom:'Ail',                    quantite:10,  unite:'g',  prixUnit:0.012, categorie:'Légumes' },
        { id:'i15', nom:'Beurre doux (arrosage)', quantite:40,  unite:'g',  prixUnit:0.018, categorie:'Produits laitiers' },
        { id:'i16', nom:'Sel de Guérande',        quantite:4,   unite:'g',  prixUnit:0.015, categorie:'Épicerie sèche' },
        { id:'i17', nom:'Poivre de Sarawak',      quantite:2,   unite:'g',  prixUnit:0.08,  categorie:'Épicerie sèche' },
      ],
      etapes: [
        'Sortir les pavés 30 min avant cuisson. Sécher soigneusement avec du papier absorbant.',
        'Chauffer une poêle en fonte à feu très vif. Ajouter le beurre clarifié.',
        'Saisir les pavés 2 min de chaque côté pour former une croûte dorée.',
        'Réduire à feu moyen. Ajouter le beurre, le thym et l\'ail écrasé.',
        'Arroser continuellement pendant 3–4 min selon l\'épaisseur et la cuisson souhaitée.',
        'Laisser reposer 5 min sur une grille sous papier aluminium.',
        'Déglacer la poêle avec le fond de veau. Réduire de moitié. Monter au beurre hors feu.',
        'Saler au sel de Guérande, poivrer au moment du service.'
      ],
      dressage: 'Dresser le pavé légèrement en biais. Napper d\'un cordon de jus corsé. Accompagnement selon saison.',
      conservation: 'À consommer immédiatement. Ne pas précuire.',
    },
    {
      id: 'rec-3',
      nom: 'Tarte citron meringuée façon Comptoir',
      portions: 8,
      categorie: 'Desserts',
      statut: 'active',
      version: 5,
      prixVente: 14.00,
      allergenesIds: ['gluten','oeufs','lactose'],
      notesConsultant: 'Meringue italienne obligatoire (plus stable). Torchage au chalumeau pour une finition uniforme. Pâte sucrée à préparer la veille.',
      modifie: '2026-03-22',
      modifiePar: 'u1',
      tempsPreparation: 45,
      tempsCuisson: 30,
      tempsTotal: 75,
      ingredients: [
        { id:'i18', nom:'Farine T55',          quantite:200, unite:'g',  prixUnit:0.001,  categorie:'Épicerie sèche' },
        { id:'i19', nom:'Beurre froid',        quantite:100, unite:'g',  prixUnit:0.018,  categorie:'Produits laitiers' },
        { id:'i20', nom:'Sucre glace',         quantite:80,  unite:'g',  prixUnit:0.002,  categorie:'Épicerie sèche' },
        { id:'i21', nom:'Œufs entiers',        quantite:2,   unite:'pcs',prixUnit:0.35,   categorie:'Œufs' },
        { id:'i22', nom:'Jus de citron frais', quantite:180, unite:'ml', prixUnit:0.012,  categorie:'Fruits' },
        { id:'i23', nom:'Zestes de citron',    quantite:3,   unite:'pcs',prixUnit:0.25,   categorie:'Fruits' },
        { id:'i24', nom:'Jaunes d\'œuf',       quantite:4,   unite:'pcs',prixUnit:0.20,   categorie:'Œufs' },
        { id:'i25', nom:'Sucre semoule',       quantite:200, unite:'g',  prixUnit:0.0015, categorie:'Épicerie sèche' },
        { id:'i26', nom:'Beurre doux (crème)', quantite:80,  unite:'g',  prixUnit:0.018,  categorie:'Produits laitiers' },
        { id:'i27', nom:'Blancs d\'œuf',       quantite:120, unite:'g',  prixUnit:0.12,   categorie:'Œufs' },
        { id:'i28', nom:'Eau',                 quantite:40,  unite:'ml', prixUnit:0,      categorie:'Autres' },
      ],
      etapes: [
        'PÂTE SUCRÉE : Sabler farine + beurre froid. Ajouter sucre glace, œuf, sel. Former un disque. Filmer, 2h réfrigérateur.',
        'Étaler à 3mm, foncer un cercle 24cm. Piquer, réfrigérer 30min.',
        'Cuire à blanc 175°C, 20 min avec billes, puis 8 min sans. Dorer à l\'œuf battu en fin de cuisson.',
        'CRÈME CITRON : Chauffer jus citron + zestes. Fouetter jaunes + sucre (blanchiment). Verser le jus chaud en filet. Cuire à 83°C sans cesser de remuer.',
        'Chinoiser. À 60°C, incorporer le beurre froid en dés. Mixer. Filmer au contact. Refroidir.',
        'Garnir le fond de tarte de crème citron froide. Lisser. Réfrigérer 1h.',
        'MERINGUE ITALIENNE : Cuire sucre + eau à 121°C. Monter les blancs en neige ferme. Verser le sucre cuit en filet. Fouetter jusqu\'à refroidissement.',
        'Dresser la meringue à la poche (douille saint-honoré) ou à la spatule. Torcher au chalumeau.'
      ],
      dressage: 'Servir la tarte à température ambiante. Décorer avec quelques zestes de citron confits et une feuille de mélisse.',
      conservation: '48h au réfrigérateur sans meringue. Ajouter meringue et torcher au moment du service.',
    }
  ],

  cartes: [
    {
      id: 'carte-1',
      nom: 'Carte Printemps 2026',
      statut: 'active',
      dateDebut: '2026-03-01',
      dateFin: '2026-05-31',
      etablissementId: 'etab-1',
      plats: [
        { id:'p1', nom:'Velouté d\'asperges vertes, crème de chèvre',  categorie:'Entrées',  prix:18, recetteId:null,    allergenes:['lactose'],          statut:'active' },
        { id:'p2', nom:'Tartare de saumon Label Rouge, condiments',     categorie:'Entrées',  prix:24, recetteId:null,    allergenes:['poissons'],         statut:'active' },
        { id:'p3', nom:'Risotto aux champignons sauvages',              categorie:'Plats',    prix:32, recetteId:'rec-1', allergenes:['lactose','gluten','sulfites'], statut:'active' },
        { id:'p4', nom:'Pavé de bœuf Simmental, jus corsé',            categorie:'Plats',    prix:54, recetteId:'rec-2', allergenes:['lactose'],          statut:'active' },
        { id:'p5', nom:'Dos de cabillaud, beurre blanc aux herbes',     categorie:'Plats',    prix:38, recetteId:null,    allergenes:['poissons','lactose'],statut:'active' },
        { id:'p6', nom:'Tarte citron meringuée façon Comptoir',         categorie:'Desserts', prix:14, recetteId:'rec-3', allergenes:['gluten','oeufs','lactose'], statut:'active' },
        { id:'p7', nom:'Fondant au chocolat Valrhona, glace vanille',   categorie:'Desserts', prix:14, recetteId:null,    allergenes:['gluten','oeufs','lactose'], statut:'active' },
        { id:'p8', nom:'Sélection de fromages affinés (3 pièces)',      categorie:'Fromages', prix:16, recetteId:null,    allergenes:['lactose'],          statut:'active' },
      ]
    },
    {
      id: 'carte-2',
      nom: 'Carte Hiver 2025–2026',
      statut: 'archivée',
      dateDebut: '2025-11-01',
      dateFin: '2026-02-28',
      etablissementId: 'etab-1',
      plats: []
    }
  ],

  inventaires: [
    {
      id:'inv-1', date:'2026-04-01', statut:'validé', etablissementId:'etab-1',
      valeurTotale: 4820.50, validePar:'u2',
      lignes:[
        { id:'l1',  produit:'Bœuf Simmental (kg)',   categorie:'Viandes',           unite:'kg',  stockTheo:12,  stockReel:10.5, prixUnit:52.00 },
        { id:'l2',  produit:'Saumon Label Rouge (kg)',categorie:'Poissons',          unite:'kg',  stockTheo:8,   stockReel:7.0,  prixUnit:24.00 },
        { id:'l3',  produit:'Volaille fermière (kg)', categorie:'Viandes',           unite:'kg',  stockTheo:6,   stockReel:6.0,  prixUnit:18.00 },
        { id:'l4',  produit:'Riz Arborio (kg)',       categorie:'Épicerie sèche',    unite:'kg',  stockTheo:5,   stockReel:4.8,  prixUnit:3.50  },
        { id:'l5',  produit:'Farine T55 (kg)',        categorie:'Épicerie sèche',    unite:'kg',  stockTheo:10,  stockReel:9.2,  prixUnit:1.20  },
        { id:'l6',  produit:'Parmesan AOP (kg)',      categorie:'Produits laitiers', unite:'kg',  stockTheo:2,   stockReel:1.8,  prixUnit:50.00 },
        { id:'l7',  produit:'Beurre doux (kg)',       categorie:'Produits laitiers', unite:'kg',  stockTheo:5,   stockReel:4.6,  prixUnit:9.50  },
        { id:'l8',  produit:'Crème liquide (L)',      categorie:'Produits laitiers', unite:'L',   stockTheo:8,   stockReel:7.5,  prixUnit:4.20  },
        { id:'l9',  produit:'Champignons sauvages(kg)',categorie:'Légumes',          unite:'kg',  stockTheo:3,   stockReel:2.2,  prixUnit:28.00 },
        { id:'l10', produit:'Asperges vertes (botte)',categorie:'Légumes',           unite:'botte',stockTheo:15, stockReel:12.0, prixUnit:6.00  },
        { id:'l11', produit:'Citrons (kg)',           categorie:'Fruits',            unite:'kg',  stockTheo:4,   stockReel:3.8,  prixUnit:2.50  },
        { id:'l12', produit:'Vin blanc Chablis (bt)', categorie:'Vins & alcools',   unite:'bt',  stockTheo:24,  stockReel:21.0, prixUnit:12.00 },
      ]
    },
    {
      id:'inv-2', date:'2026-03-01', statut:'validé', etablissementId:'etab-1',
      valeurTotale: 5120.30, validePar:'u2',
      lignes:[]
    }
  ],

  pertes: [
    { id:'pt1', date:'2026-04-20', produit:'Saumon Label Rouge',   quantite:0.8, unite:'kg',     valeurUnit:24,   motif:'DLC dépassée',         categorie:'Poissons',      commentaire:'Oublié en chambre froide positive', declarePar:'u3', valide:true  },
    { id:'pt2', date:'2026-04-19', produit:'Risotto (portions)',   quantite:3,   unite:'portions',valeurUnit:8.40, motif:'Surproduction',        categorie:'Préparations',  commentaire:'Service soir moins fréquenté que prévu', declarePar:'u4', valide:true  },
    { id:'pt3', date:'2026-04-18', produit:'Sauce beurre blanc',  quantite:0.5, unite:'L',       valeurUnit:17,   motif:'Erreur de préparation',categorie:'Préparations',  commentaire:'Sauce tournée — trop chauffée', declarePar:'u4', valide:false },
    { id:'pt4', date:'2026-04-17', produit:'Asperges vertes',     quantite:1.2, unite:'kg',      valeurUnit:12,   motif:'DLC dépassée',         categorie:'Légumes',       commentaire:'', declarePar:'u3', valide:true  },
    { id:'pt5', date:'2026-04-15', produit:'Fond de veau',        quantite:2,   unite:'L',       valeurUnit:5.50, motif:'Surproduction',        categorie:'Fonds & sauces',commentaire:'Excédent non conservé', declarePar:'u3', valide:true  },
    { id:'pt6', date:'2026-04-12', produit:'Filet de cabillaud',  quantite:0.6, unite:'kg',      valeurUnit:22,   motif:'Retour client',        categorie:'Poissons',      commentaire:'Client allergique — plat renvoyé', declarePar:'u5', valide:true  },
    { id:'pt7', date:'2026-04-10', produit:'Champignons sauvages',quantite:0.4, unite:'kg',      valeurUnit:28,   motif:'DLC dépassée',         categorie:'Légumes',       commentaire:'', declarePar:'u4', valide:true  },
  ],

  parametresCCNT: {
    heuresContractuelles: 42,
    dureeMaxJournaliere: 10,
    pauseMinimaleHeures: 0.5,
    pauseMinimale8h: 1,
    reposMinimalEntreServices: 11,
    heuresSupplementairesDeclenche: 42,
    majorationHS: 25,
    majorationNuit: 50,
    heureDebutNuit: '22:00',
    heureFinNuit: '06:00',
  }
};

// Calculs helpers
DEMO_DATA.recettes.forEach(r => {
  r.coutMatiere = r.ingredients.reduce((s,i) => s + i.quantite * i.prixUnit, 0);
  r.coutPortion = r.coutMatiere / r.portions;
  r.foodCost = r.prixVente ? (r.coutPortion / r.prixVente * 100) : null;
  r.margeGrossePct = r.prixVente ? ((r.prixVente - r.coutPortion) / r.prixVente * 100) : null;
});

DEMO_DATA.inventaires.forEach(inv => {
  inv.lignes.forEach(l => {
    l.ecart = +(l.stockReel - l.stockTheo).toFixed(2);
    l.valeur = +(l.stockReel * l.prixUnit).toFixed(2);
    l.ecartValeur = +(l.ecart * l.prixUnit).toFixed(2);
  });
  if (inv.lignes.length > 0) inv.valeurTotale = +inv.lignes.reduce((s,l) => s+l.valeur, 0).toFixed(2);
});

// Data version check — force data refresh when structure changes
const DATA_VERSION = '4';
if (localStorage.getItem('sc_data_version') !== DATA_VERSION) {
  // Structure modifiée (etablissementId ajouté au planning, pertes, etc.) — on reset les données métier
  ['sc_user','sc_page','sc_permissions','sc_recettes','sc_cartes','sc_planning',
   'sc_inventaires','sc_pertes','sc_utilisateurs','sc_etablissements',
   'sc_inventaire_selected','sc_current_etab'].forEach(k => localStorage.removeItem(k));
  localStorage.setItem('sc_data_version', DATA_VERSION);
}

const scRead = (key, fallback) => {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
};
const scWrite = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};

// Ajouter etablissementId par défaut (etab-1) aux éléments qui n'en ont pas
DEMO_DATA.planning.forEach(s => { if (!s.etablissementId) s.etablissementId = 'etab-1'; });
DEMO_DATA.pertes.forEach(p => { if (!p.etablissementId) p.etablissementId = 'etab-1'; });
DEMO_DATA.recettes.forEach(r => { if (!r.etablissementId) r.etablissementId = 'etab-1'; });

// Hydrate DEMO_DATA from persistent store at boot
DEMO_DATA.permissions   = scRead('sc_permissions',   DEMO_DATA.permissions);
DEMO_DATA.recettes      = scRead('sc_recettes',      DEMO_DATA.recettes);
DEMO_DATA.cartes        = scRead('sc_cartes',        DEMO_DATA.cartes);
DEMO_DATA.planning      = scRead('sc_planning',      DEMO_DATA.planning);
DEMO_DATA.inventaires   = scRead('sc_inventaires',   DEMO_DATA.inventaires);
DEMO_DATA.pertes        = scRead('sc_pertes',        DEMO_DATA.pertes);
DEMO_DATA.utilisateurs  = scRead('sc_utilisateurs',  DEMO_DATA.utilisateurs);
DEMO_DATA.etablissements= scRead('sc_etablissements',DEMO_DATA.etablissements);

// Recalculate derived recipe fields
DEMO_DATA.recettes.forEach(r => {
  r.coutMatiere = (r.ingredients || []).reduce((s,i) => s + (Number(i.quantite)||0) * (Number(i.prixUnit)||0), 0);
  r.coutPortion = r.portions ? r.coutMatiere / r.portions : 0;
  r.foodCost = r.prixVente ? (r.coutPortion / r.prixVente * 100) : null;
  r.margeGrossePct = r.prixVente ? ((r.prixVente - r.coutPortion) / r.prixVente * 100) : null;
  if (r.tempsPreparation != null && r.tempsCuisson != null && r.tempsTotal == null) {
    r.tempsTotal = Number(r.tempsPreparation) + Number(r.tempsCuisson);
  }
});

// Reset complet (bouton dans Paramètres)
const scResetAllData = () => {
  if (!window.confirm('Réinitialiser TOUTES les données aux valeurs de démo ?\nCette action est irréversible.')) return;
  ['sc_permissions','sc_recettes','sc_cartes','sc_planning','sc_inventaires',
   'sc_pertes','sc_utilisateurs','sc_etablissements','sc_inventaire_selected',
   'sc_haccp_zones','sc_haccp_tpls','sc_haccp_releves','sc_haccp_controls',
   'sc_fiches_salle','sc_current_etab','sc_app_logo','sc_data_version'].forEach(k => localStorage.removeItem(k));
  window.location.reload();
};

// ═══════════════════════════════════════════════════════════════
// HYDRATATION DEPUIS SUPABASE (si configuré)
// Remplace etablissements, utilisateurs, permissions par les données live
// ═══════════════════════════════════════════════════════════════
async function hydrateFromSupabase() {
  if (!window.SB) return false;
  try {
    const [etabs, profiles, perms] = await Promise.all([
      window.SB.db.listEtablissements(),
      window.SB.db.listProfiles(),
      window.SB.db.listPermissions(),
    ]);
    if (etabs && etabs.length) {
      DEMO_DATA.etablissements = etabs.map(e => ({
        id: e.id, nom: e.nom, type: e.type, adresse: e.adresse,
        tel: e.tel, email: e.email, couleur: e.couleur, actif: e.actif,
        notes: e.notes, ccntHeuresSemaine: e.ccnt_heures_semaine,
        logo_url: e.logo_url, // utilisé pour le logo applicatif et les PDF de facture
      }));
    }
    if (profiles && profiles.length) {
      DEMO_DATA.utilisateurs = profiles.map(p => ({
        id: p.id, email: p.email, prenom: p.prenom, nom: p.nom, avatar: p.avatar || ((p.prenom?.[0] || '') + (p.nom?.[0] || '')).toUpperCase(),
        role: p.role, poste: p.poste, etablissementIds: p.etablissement_ids || [],
        actif: p.actif,
      }));
    }
    if (perms && Object.keys(perms).length) {
      DEMO_DATA.permissions = { ...DEMO_DATA.permissions, ...perms };
    }
    console.log('[Data] Hydraté depuis Supabase ✓', { etabs: etabs?.length, users: profiles?.length });
    return true;
  } catch (err) {
    console.error('[Data] Erreur hydratation Supabase:', err);
    return false;
  }
}

Object.assign(window, { DEMO_DATA, scRead, scWrite, scResetAllData, hydrateFromSupabase });

// ═══════════════════════════════════════════════════════════════
// HELPERS REACT — Hooks de synchronisation Supabase
// ═══════════════════════════════════════════════════════════════

// Hook pour synchroniser une liste avec une table Supabase en temps réel
// Usage : const [items, setItems, refresh] = useSupabaseList('recettes', etabId);
window.useSupabaseList = function(tableName, etabId, listFn, mapFn) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    if (!window.SB) { setLoading(false); return; }
    try {
      const rows = await listFn(etabId);
      setItems(rows);
    } catch (err) {
      console.error(`[useSupabaseList:${tableName}]`, err);
    } finally {
      setLoading(false);
    }
  }, [etabId, tableName]);

  React.useEffect(() => {
    if (!window.SB) { setLoading(false); return; }
    let unsub = null;
    let mounted = true;

    refresh();

    unsub = window.SB.realtime.subscribe(tableName, (payload) => {
      if (!mounted) return;
      const row = payload.new || payload.old;
      // Filtrer par établissement si applicable
      if (etabId && row?.etablissement_id && row.etablissement_id !== etabId) return;

      setItems(prev => {
        if (payload.eventType === 'INSERT') {
          const mapped = mapFn ? mapFn(payload.new) : payload.new;
          if (prev.find(x => x.id === mapped.id)) return prev;
          return [...prev, mapped];
        }
        if (payload.eventType === 'UPDATE') {
          const mapped = mapFn ? mapFn(payload.new) : payload.new;
          return prev.map(x => x.id === mapped.id ? mapped : x);
        }
        if (payload.eventType === 'DELETE') {
          return prev.filter(x => x.id !== payload.old.id);
        }
        return prev;
      });
    });

    return () => {
      mounted = false;
      if (unsub) unsub();
    };
  }, [etabId, tableName]);

  return [items, setItems, refresh, loading];
};
