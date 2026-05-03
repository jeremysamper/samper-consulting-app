// ═══════════════════════════════════════════════════════════════
// SOP TEMPLATES — Bibliothèque de SOPs pré-faites pour Samper Consulting
// ═══════════════════════════════════════════════════════════════
// Conçues pour la restauration suisse pro (gastro/brasserie/hôtel-restaurant)
// L'utilisateur peut dupliquer puis personnaliser pour chaque client.
// ═══════════════════════════════════════════════════════════════

const SOP_TEMPLATES = [
  // ─── 1. Ouverture matinale cuisine ───
  {
    titre: 'Ouverture matinale cuisine',
    description: 'Procédure standard d\'ouverture de la cuisine en début de service',
    categorie: 'Ouverture / Fermeture',
    frequence: 'quotidienne',
    tags: ['HACCP', 'Cuisine'],
    sections: [
      {
        id: 's1', titre: 'Sécurité & équipement',
        etapes: [
          { id: 'e1', label: 'Vérifier vannes gaz fermées (avant allumage)', critique: true },
          { id: 'e2', label: 'Allumer hottes et ventilations', critique: false },
          { id: 'e3', label: 'Allumer fourneaux et fours (préchauffe)', critique: false },
          { id: 'e4', label: 'Vérifier extincteurs accessibles', critique: true },
        ]
      },
      {
        id: 's2', titre: 'Contrôles HACCP',
        etapes: [
          { id: 'e5', label: 'Relever températures chambres froides', critique: true, info: 'Doit être ≤ 4°C' },
          { id: 'e6', label: 'Relever températures congélateurs', critique: true, info: 'Doit être ≤ -18°C' },
          { id: 'e7', label: 'Vérifier propreté des plans de travail', critique: false },
          { id: 'e8', label: 'Désinfecter mains + tabliers propres', critique: true },
        ]
      },
      {
        id: 's3', titre: 'Mise en place produit',
        etapes: [
          { id: 'e9',  label: 'Sortir les viandes et abats nécessaires', critique: false },
          { id: 'e10', label: 'Préparer fonds et bouillons', critique: false },
          { id: 'e11', label: 'Laver et préparer légumes', critique: false },
          { id: 'e12', label: 'Vérifier stocks à réapprovisionner', critique: false },
        ]
      },
    ]
  },

  // ─── 2. Mise en place service midi ───
  {
    titre: 'Mise en place service midi',
    description: 'Préparation et organisation avant le service de midi',
    categorie: 'Service',
    frequence: 'quotidienne',
    tags: ['Service'],
    sections: [
      {
        id: 's1', titre: 'Cuisine chaude',
        etapes: [
          { id: 'e1', label: 'Préchauffe fourneaux et plaques', critique: false },
          { id: 'e2', label: 'Préparer sauces et émulsions', critique: false },
          { id: 'e3', label: 'Cuissons longues lancées (rôtis, mijotés)', critique: false },
          { id: 'e4', label: 'Préparer garnitures principales', critique: false },
        ]
      },
      {
        id: 's2', titre: 'Cuisine froide',
        etapes: [
          { id: 'e5', label: 'Mise en place entrées (assiettes pré-dressées si applicable)', critique: false },
          { id: 'e6', label: 'Préparer mises en bouche', critique: false },
          { id: 'e7', label: 'Préparer sauces froides et vinaigrettes', critique: false },
          { id: 'e8', label: 'Charger les bacs frigorifiques de service', critique: false },
        ]
      },
      {
        id: 's3', titre: 'Pâtisserie & desserts',
        etapes: [
          { id: 'e9',  label: 'Mise en place desserts du jour', critique: false },
          { id: 'e10', label: 'Vérifier glaces et sorbets en stock service', critique: false },
        ]
      },
      {
        id: 's4', titre: 'Briefing équipe',
        etapes: [
          { id: 'e11', label: 'Briefing 5 min : plats du jour, allergies, ruptures', critique: true },
          { id: 'e12', label: 'Vérifier quantités plats limités (suggestions)', critique: false },
        ]
      },
    ]
  },

  // ─── 3. Nettoyage fin de service ───
  {
    titre: 'Nettoyage fin de service',
    description: 'Nettoyage et désinfection après le service',
    categorie: 'Hygiène',
    frequence: 'quotidienne',
    tags: ['HACCP', 'Hygiène'],
    sections: [
      {
        id: 's1', titre: 'Plans de travail',
        etapes: [
          { id: 'e1', label: 'Débarrasser tous les plans de travail', critique: false },
          { id: 'e2', label: 'Dégraissage et désinfection avec produit alimentaire', critique: true },
          { id: 'e3', label: 'Rangement ustensiles et batterie nettoyés', critique: false },
        ]
      },
      {
        id: 's2', titre: 'Équipements chauds',
        etapes: [
          { id: 'e4', label: 'Nettoyage fourneaux (grilles, plaques, intérieur)', critique: false },
          { id: 'e5', label: 'Nettoyage friteuses (filtration ou changement huile selon planning)', critique: false },
          { id: 'e6', label: 'Nettoyage hottes et filtres (selon planning)', critique: false },
          { id: 'e7', label: 'Vérifier extinction complète gaz et plaques', critique: true },
        ]
      },
      {
        id: 's3', titre: 'Frigos et stockage',
        etapes: [
          { id: 'e8',  label: 'Filmer et étiqueter tous les bacs (date + nom)', critique: true, info: 'Norme HACCP' },
          { id: 'e9',  label: 'Ranger frigos par familles, dates les plus anciennes devant', critique: true },
          { id: 'e10', label: 'Vider et nettoyer poubelles cuisine', critique: false },
        ]
      },
      {
        id: 's4', titre: 'Sols et finitions',
        etapes: [
          { id: 'e11', label: 'Balayage et lavage des sols', critique: false },
          { id: 'e12', label: 'Nettoyage portes et poignées de frigos', critique: false },
          { id: 'e13', label: 'Désinfection lavabos et siphons', critique: true },
        ]
      },
    ]
  },

  // ─── 4. Fermeture du restaurant ───
  {
    titre: 'Fermeture du restaurant',
    description: 'Procédure complète de fermeture en fin de journée',
    categorie: 'Ouverture / Fermeture',
    frequence: 'quotidienne',
    tags: ['Sécurité'],
    sections: [
      {
        id: 's1', titre: 'Cuisine',
        etapes: [
          { id: 'e1', label: 'Vérifier extinction de tous les équipements de cuisson', critique: true },
          { id: 'e2', label: 'Couper l\'arrivée gaz principale', critique: true },
          { id: 'e3', label: 'Vérifier fermeture des portes de frigos', critique: true },
          { id: 'e4', label: 'Éteindre hottes et ventilations', critique: false },
        ]
      },
      {
        id: 's2', titre: 'Salle',
        etapes: [
          { id: 'e5', label: 'Tables dressées pour le lendemain', critique: false },
          { id: 'e6', label: 'Caisse fermée et clôturée', critique: true },
          { id: 'e7', label: 'Linge à laver mis de côté', critique: false },
          { id: 'e8', label: 'Climatisation/chauffage en mode nuit', critique: false },
        ]
      },
      {
        id: 's3', titre: 'Sécurité',
        etapes: [
          { id: 'e9',  label: 'Toutes lumières non nécessaires éteintes', critique: false },
          { id: 'e10', label: 'Portes et fenêtres verrouillées', critique: true },
          { id: 'e11', label: 'Alarme activée', critique: true },
        ]
      },
    ]
  },

  // ─── 5. Inventaire hebdomadaire ───
  {
    titre: 'Inventaire hebdomadaire',
    description: 'Comptage des stocks pour gestion et commandes',
    categorie: 'Stock',
    frequence: 'hebdomadaire',
    tags: ['Stock'],
    sections: [
      {
        id: 's1', titre: 'Préparation',
        etapes: [
          { id: 'e1', label: 'Imprimer ou ouvrir la feuille d\'inventaire', critique: false },
          { id: 'e2', label: 'Préparer balance et ustensiles de comptage', critique: false },
        ]
      },
      {
        id: 's2', titre: 'Comptage',
        etapes: [
          { id: 'e3', label: 'Compter chambre froide positive (viandes, poissons, laitages)', critique: false },
          { id: 'e4', label: 'Compter congélateurs', critique: false },
          { id: 'e5', label: 'Compter épicerie sèche (céréales, conserves, secs)', critique: false },
          { id: 'e6', label: 'Compter cave (vins, alcools, soft)', critique: false },
          { id: 'e7', label: 'Compter consommables (papier, produits ménagers)', critique: false },
        ]
      },
      {
        id: 's3', titre: 'Saisie & commandes',
        etapes: [
          { id: 'e8',  label: 'Saisir les quantités dans le module Inventaire', critique: false },
          { id: 'e9',  label: 'Identifier les ruptures et seuils bas', critique: true },
          { id: 'e10', label: 'Préparer les commandes fournisseurs nécessaires', critique: false },
        ]
      },
    ]
  },

  // ─── 6. Réception fournisseur ───
  {
    titre: 'Réception fournisseur',
    description: 'Contrôle qualité et HACCP à la réception d\'une livraison',
    categorie: 'Stock',
    frequence: 'ponctuelle',
    tags: ['HACCP', 'Stock'],
    sections: [
      {
        id: 's1', titre: 'Contrôle administratif',
        etapes: [
          { id: 'e1', label: 'Bon de livraison conforme à la commande', critique: true },
          { id: 'e2', label: 'Quantités correctes (peser/compter)', critique: true },
        ]
      },
      {
        id: 's2', titre: 'Contrôle qualité produits',
        etapes: [
          { id: 'e3', label: 'Température produits frais ≤ 4°C (sonde)', critique: true, info: 'HACCP — refuser si > 4°C' },
          { id: 'e4', label: 'Température surgelés ≤ -18°C', critique: true, info: 'HACCP — refuser si > -15°C' },
          { id: 'e5', label: 'Aspect visuel (pas de rupture chaîne du froid)', critique: true },
          { id: 'e6', label: 'DLC/DDM acceptables (vérifier dates)', critique: true },
          { id: 'e7', label: 'Emballage intact, pas de produit endommagé', critique: false },
        ]
      },
      {
        id: 's3', titre: 'Stockage',
        etapes: [
          { id: 'e8',  label: 'Rangement immédiat selon famille (PEPS / FEFO)', critique: true, info: 'Premier Entré Premier Sorti' },
          { id: 'e9',  label: 'Étiquetage si reconditionnement (date + nom)', critique: true },
          { id: 'e10', label: 'Signature et archivage du bon de livraison', critique: false },
        ]
      },
    ]
  },
];

window.SOP_TEMPLATES = SOP_TEMPLATES;
