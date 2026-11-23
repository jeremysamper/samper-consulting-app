// Les nouveautés du plan 15, une par geste à regarder. Sources : la section
// « Nouveautés visibles » de chaque rapport de lot, et les notes avant et après
// de la mesure du lot 7 (docs/AUDIT-ACCESSIBILITE-2026-11-23.md).
//
// Une nouveauté : id, lot, module (clé de NOTES), role (rôle de la démo), page
// (setPage) ou reglages (section de Réglages), etapes (textes à toucher, dans
// l'ordre), cible (texte ou { texte, selecteur, exact } à mettre en évidence),
// phrase (au vous), criteres (cases notées), coque ('tablette' pour le lot 3),
// avant (capture du lot 7, prise sur le commit de l'audit).

export const CRITERES = {
  pm: 'Prise en main',
  gt: 'Gain de temps',
  sm: 'Sur-mesure',
  info: 'Informations',
  reg: 'Réglages',
};

// Notes avant et après du lot 7, module par module. Hôtel, Spa et Outils
// consultant : la note « avant » est celle de départ du lot 6b à l'écran.
export const NOTES = {
  dashboard: { nom: 'Tableau de bord', pm: [16, 16], gt: [15, 16], sm: [16, 16], info: [10, 14], reg: [15, 15] },
  planning: { nom: 'Planning & Pointage', pm: [13, 15], gt: [17, 17], sm: [18, 18], info: [11, 16], reg: [14, 16] },
  messages: { nom: 'Messages', pm: [18, 18], gt: [11, 17], sm: [8, 15], info: [15, 16], reg: [11, 15] },
  journal: { nom: "Journal d'activité", pm: [15, 15], gt: [7, 15], sm: [6, 15], info: [9, 15], reg: [14, 16] },
  points: { nom: 'Points & boutique', pm: [11, 16], gt: [8, 17], sm: [16, 16], info: [11, 15], reg: [8, 16] },
  comptabilite: { nom: 'Comptabilité', pm: [14, 15], gt: [12, 16], sm: [14, 16], info: [9, 15], reg: [16, 16] },
  cartes: { nom: 'Cartes & Recettes', pm: [11, 15], gt: [15, 15], sm: [17, 17], info: [11, 15], reg: [11, 16] },
  achats: { nom: 'Factures & achats', pm: [15, 15], gt: [14, 16], sm: [11, 15], info: [12, 15], reg: [14, 16] },
  pertes: { nom: 'Pertes', pm: [13, 15], gt: [12, 17], sm: [9, 15], info: [10, 14], reg: [7, 15] },
  haccp: { nom: 'HACCP', pm: [17, 17], gt: [15, 15], sm: [14, 16], info: [14, 16], reg: [6, 16] },
  previsions: { nom: 'Réservations', pm: [12, 15], gt: [18, 18], sm: [17, 17], info: [11, 15], reg: [12, 16] },
  groupes: { nom: 'Groupes', pm: [13, 15], gt: [15, 15], sm: [13, 15], info: [10, 15], reg: [9, 15] },
  commande: { nom: 'Commande', pm: [14, 15], gt: [8, 17], sm: [8, 16], info: [14, 16], reg: [5, 16] },
  mep: { nom: 'Mise en place', pm: [16, 16], gt: [12, 17], sm: [11, 15], info: [14, 15], reg: [8, 16] },
  pos: { nom: 'Ventes POS', pm: [12, 16], gt: [13, 16], sm: [11, 15], info: [12, 15], reg: [9, 15] },
  kds: { nom: 'KDS Cuisine', pm: [18, 18], gt: [17, 17], sm: [15, 15], info: [16, 16], reg: [12, 16] },
  sop: { nom: 'SOPs & Checklists', pm: [14, 15], gt: [10, 16], sm: [15, 15], info: [12, 15], reg: [9, 16] },
  fiches_salle: { nom: 'Fiches salle', pm: [13, 15], gt: [13, 16], sm: [13, 16], info: [8, 16], reg: [9, 16] },
  documents: { nom: 'Documents', pm: [17, 17], gt: [9, 15], sm: [12, 15], info: [15, 15], reg: [14, 15] },
  catalogue: { nom: 'Catalogue produits', pm: [8, 15], gt: [11, 16], sm: [13, 16], info: [9, 15], reg: [10, 16] },
  caisse: { nom: 'Caisse', pm: [16, 16], gt: [17, 17], sm: [17, 17], info: [14, 16], reg: [17, 17] },
  statistiques: { nom: 'Statistiques', pm: [10, 15], gt: [8, 16], sm: [16, 16], info: [7, 13], reg: [14, 16] },
  compte: { nom: 'Réglages', pm: [16, 16], gt: [13, 16], sm: [17, 17], info: [15, 15], reg: [12, 16] },
  spa: { nom: 'Spa & clients', pm: [12, 15], gt: [15, 16], sm: [16, 16], info: [14, 15], reg: [15, 15] },
  hebergement: { nom: 'Hébergement', pm: [16, 16], gt: [14, 16], sm: [15, 15], info: [14, 15], reg: [16, 16] },
  etages: { nom: 'Étages', pm: [9, 15], gt: [13, 16], sm: [11, 15], info: [10, 16], reg: [9, 16] },
  demandes: { nom: 'Demandes', pm: [14, 15], gt: [11, 16], sm: [8, 15], info: [14, 16], reg: [9, 16] },
  activites: { nom: 'Activités', pm: [17, 17], gt: [12, 16], sm: [13, 15], info: [15, 15], reg: [15, 15] },
  passations: { nom: 'Passations', pm: [16, 16], gt: [13, 17], sm: [14, 16], info: [15, 15], reg: [15, 15] },
  repas: { nom: 'Repas hôtel', pm: [17, 17], gt: [12, 16], sm: [8, 15], info: [14, 15], reg: [8, 16] },
  technique: { nom: 'Technique', pm: [17, 17], gt: [13, 16], sm: [15, 15], info: [15, 15], reg: [16, 16] },
};

export const LOTS = {
  1: 'Lot 1, des chiffres justes',
  '2b': 'Lot 2b, chaque module a ses réglages',
  3: 'Lot 3, la tablette',
  '4b': 'Lot 4b, la commande par fournisseur',
  5: 'Lot 5, le bureau et les routines',
  '6a': "Lot 6a, l'hôtel et le spa dans la démo",
  '6b': "Lot 6b, l'hôtel à l'écran",
};

// Ordre de lecture des lots (les clés numériques d'un objet passent devant).
export const ORDRE_LOTS = ['1', '2b', '3', '4b', '5', '6a', '6b'];

export const ROLES = {
  patron: 'Patron',
  resp_cuisine: 'Responsable cuisine',
  cuisinier: 'Cuisinier',
  serveur: 'Serveur',
  hote: 'Réception',
  praticien_spa: 'Praticienne spa',
};

const n = (id, lot, module, role, page, cible, phrase, criteres, extra = {}) => ({ id, lot, module, role, page, cible, phrase, criteres, ...extra });

export const NOUVEAUTES = [
  // ── Lot 1 : des chiffres justes ─────────────────────────────────────────────
  n('l1-tdb-service', 1, 'dashboard', 'patron', 'dashboard', 'personnes au planning', "L'équipe tient dans une seule carte, titrée par son service (Ce midi, Ce soir). Aucun chiffre n'est redit d'une carte à l'autre.", ['info']),
  n('l1-planning-service', 1, 'planning', 'patron', 'planning', 'personnes au planning', 'La carte du planning et ses chiffres parlent du même service.', ['info']),
  n('l1-compta-duree', 1, 'comptabilite', 'patron', 'comptabilite', 'sur les jours', "L'écart se compare à durée égale : les mêmes jours du mois passé, pas le mois entier.", ['info'], { etapes: ['Voir le détail'] }),
  n('l1-stats-defaut', 1, 'statistiques', 'patron', 'statistiques', 'Ventes TVA comprise', 'Les statistiques s\'ouvrent sur les ventes de la maison, TVA comprise, comme la comptabilité.', ['info']),
  n('l1-groupes-client', 1, 'groupes', 'patron', 'groupes', 'couverts', 'Le calendrier et la liste disent le nom du client et « couverts » au lieu de « pax ».', ['info']),
  n('l1-pertes-valeur', 1, 'pertes', 'patron', 'pertes', 'Valeur des pertes', 'La valeur des pertes dit sa période, et les dates s\'écrivent « 22.11 ».', ['info']),
  n('l1-haccp-limite', 1, 'haccp', 'patron', 'haccp', 'hors limite', 'Les repères HACCP disent le compte : 0 relevé hors limite sur 10.', ['info']),
  n('l1-resa-ferme', 1, 'previsions', 'patron', 'previsions', { texte: 'Fermé', exact: true }, 'Les jours de fermeture sont écrits « Fermé » dans la semaine des réservations.', ['info']),
  n('l1-cartes-lait', 1, 'cartes', 'patron', 'cartes', { texte: 'Lait', exact: true }, 'L\'allergène s\'appelle « Lait », plus « Lactose ».', ['info']),
  n('l1-pos-historique', 1, 'pos', 'patron', 'pos', 'Historique court', "L'historique court des ventes est dit une seule fois, en tête.", ['info'], { etapes: ['Mise en place J+1'] }),
  n('l1-catalogue-prix', 1, 'catalogue', 'patron', 'catalogue', 'CHF', 'Les prix du catalogue ont deux décimales et leur unité.', ['info']),
  n('l1-points-accueil', 1, 'points', 'patron', 'points', { texte: 'Accueil', exact: true }, "Les points s'ouvrent sur un accueil : points à dépenser, cadeaux à remettre, podium.", ['pm', 'info']),
  n('l1-caisse-qr', 1, 'caisse', 'patron', 'caisse', 'Commande QR à valider', 'Les commandes par QR tiennent sur une ligne au-dessus du plan, avec « Voir ».', ['info']),

  // ── Lot 2b : chaque module a ses réglages ───────────────────────────────────
  n('l2b-modules', '2b', 'compte', 'patron', 'compte', 'Les modules', 'Réglages a une section par module : vous réglez chaque module au même endroit.', ['reg']),
  n('l2b-pertes-regler', '2b', 'pertes', 'patron', 'pertes', 'Régler', 'Dans chaque module, « Régler » ouvre sa section des réglages.', ['reg']),
  n('l2b-pertes-section', '2b', 'pertes', 'patron', 'compte', 'Qui valide une perte', 'Vous choisissez les motifs de perte, qui valide et le seuil d\'alerte.', ['reg', 'sm'], { reglages: 'pertes' }),
  n('l2b-haccp-chef', '2b', 'haccp', 'resp_cuisine', 'compte', { texte: 'Mettre hors service', exact: true }, 'Le responsable cuisine règle le HACCP. Il met un frigo hors service, sans pouvoir le supprimer.', ['reg'], { reglages: 'haccp', etapes: [{ texte: 'Gérer', exact: true, dans: 'Frigo poisson' }] }),
  n('l2b-haccp-jours', '2b', 'haccp', 'patron', 'compte', 'Jours de relevé', 'Chaque heure de relevé a ses jours de la semaine.', ['reg', 'sm'], { reglages: 'haccp' }),
  n('l2b-commande', '2b', 'commande', 'patron', 'compte', 'Livraison le', 'Pour chaque fournisseur : ses jours de livraison et le stock cible par jour.', ['reg'], { reglages: 'commande' }),
  n('l2b-groupes', '2b', 'groupes', 'patron', 'compte', 'Délai', "Vous choisissez le délai d'alerte des groupes.", ['reg'], { reglages: 'groupes' }),
  n('l2b-points', '2b', 'points', 'patron', 'points', 'Régler', "Les points n'ont plus d'onglet Réglages : « Régler » est à côté des onglets.", ['reg']),
  n('l2b-cartes', '2b', 'cartes', 'patron', 'compte', 'Ordre des onglets', "Vous rangez les onglets des cartes, choisissez la carte d'accueil et les archives.", ['reg'], { reglages: 'cartes' }),
  n('l2b-fiches', '2b', 'fiches_salle', 'patron', 'compte', 'Accords', 'Vous choisissez ce que la salle voit sur ses fiches, par exemple les accords.', ['reg'], { reglages: 'fiches_salle' }),
  n('l2b-kds', '2b', 'kds', 'resp_cuisine', 'kds', 'Régler', 'Au KDS, « Régler » donne le son, l\'alerte et le retard en minutes.', ['reg']),
  n('l2b-achats', '2b', 'achats', 'patron', 'achats', 'Régler', 'Factures & achats a ses conditions de paiement et ses catégories de charges.', ['reg']),
  n('l2b-resa', '2b', 'previsions', 'patron', 'previsions', 'Régler', 'Les réservations ont leur « Régler » ; la réservation en ligne renvoie aux horaires et fermetures.', ['reg']),
  n('l2b-planning', '2b', 'planning', 'patron', 'planning', 'Régler le planning', 'La tuile « Gérer » du planning ouvre « Régler le planning ».', ['reg'], { etapes: ['Gérer'] }),
  n('l2b-notif', '2b', 'messages', 'cuisinier', 'compte', 'nouveau message', "Chacun choisit d'être prévenu d'un nouveau message.", ['reg'], { reglages: 'notifications' }),

  // ── Lot 3 : la tablette ─────────────────────────────────────────────────────
  n('l3-cartes-patron', 3, 'cartes', 'patron', 'cartes', 'Nouvelle fiche', "Sur la tablette, l'en-tête des cartes garde la recherche, « Nouvelle fiche » et « Gérer ».", ['pm'], { coque: 'tablette' }),
  n('l3-cartes-cuisinier', 3, 'cartes', 'cuisinier', 'cartes', { texte: 'Actions', exact: true }, 'Le cuisinier a un seul menu « Actions » : allergènes, export, étiquette.', ['pm'], { coque: 'tablette' }),
  n('l3-resa-semaine', 3, 'previsions', 'patron', 'previsions', 'sept prochains jours', 'La semaine commence aujourd\'hui et donne les couverts des sept prochains jours, comme le tableau de bord.', ['pm', 'info'], { coque: 'tablette' }),
  n('l3-pertes-filtre', 3, 'pertes', 'patron', 'pertes', 'Tous les motifs', 'Le filtre des motifs tient dans une liste, à la place de huit pilules.', ['pm'], { coque: 'tablette' }),
  n('l3-catalogue', 3, 'catalogue', 'patron', 'catalogue', 'Toutes les catégories', 'Le catalogue montre une ligne par produit, sans liste déroulante ni crayon.', ['pm'], { coque: 'tablette' }),
  n('l3-points', 3, 'points', 'patron', 'points', 'À traiter', 'L\'onglet « À traiter » remplace « Commandes » et s\'ouvre quand un cadeau attend.', ['pm'], { coque: 'tablette' }),
  n('l3-planning', 3, 'planning', 'patron', 'planning', 'Cuisine', 'La grille du planning s\'ouvre sur la cuisine ; « Gérer » est loin d\'« Ajouter ».', ['pm'], { coque: 'tablette', etapes: ['Faire le planning'] }),
  n('l3-groupes', 3, 'groupes', 'patron', 'groupes', 'Association des amis du vin', 'Dans le calendrier, le nom du groupe tient sur deux lignes dans sa case.', ['pm'], { coque: 'tablette' }),
  n('l3-sop', 3, 'sop', 'patron', 'sop', { texte: 'Lancer', exact: true }, 'Chaque procédure a « Lancer » en bas et son menu rond en haut à droite.', ['pm'], { coque: 'tablette' }),
  n('l3-fiches', 3, 'fiches_salle', 'patron', 'fiches_salle', { texte: 'Gérer', exact: true }, "L'en-tête des fiches salle garde les cartes, les catégories et « Gérer ».", ['pm'], { coque: 'tablette' }),
  n('l3-pos', 3, 'pos', 'patron', 'pos', 'Suprême de volaille', 'Les plats de Ventes POS s\'écrivent en minuscules accentuées.', ['pm'], { coque: 'tablette' }),
  n('l3-stats', 3, 'statistiques', 'patron', 'statistiques', 'Plus de choix', 'La vue simple des statistiques : période, comparaison, mesures, et « Plus de choix ».', ['pm'], { coque: 'tablette' }),
  n('l3-compta', 3, 'comptabilite', 'patron', 'comptabilite', 'Voir le détail', 'Les quatre cartes de la comptabilité disent le chiffre ; « Voir le détail » déplie le reste.', ['pm'], { coque: 'tablette' }),

  // ── Lot 4b : la commande par fournisseur ────────────────────────────────────
  n('l4-fournisseur', '4b', 'commande', 'cuisinier', 'commande', 'À envoyer avant', 'Un onglet par fournisseur, avec l\'heure limite d\'envoi.', ['gt', 'sm'], { etapes: ['Primeurs du Rhône'] }),
  n('l4-reste', '4b', 'commande', 'cuisinier', 'commande', 'Il en reste', 'Sur chaque ligne, vous tapez ce qu\'il reste ; la quantité se calcule en colis.', ['gt'], { etapes: ['Primeurs du Rhône'] }),
  n('l4-groupes', '4b', 'commande', 'cuisinier', 'commande', 'Groupes à venir', 'Les groupes à venir ajoutent leurs besoins à la commande en un toucher.', ['gt']),
  n('l4-envoi', '4b', 'commande', 'cuisinier', 'commande', "J'envoie la commande", 'Vous envoyez la commande : aperçu du message, puis brouillon Gmail.', ['gt']),
  n('l4-reception', '4b', 'commande', 'cuisinier', 'commande', 'Je réceptionne la livraison', 'À la livraison : reçu, écart ou manquant, avec le lot et la DLC.', ['gt']),
  n('l4-achats-bl', '4b', 'achats', 'patron', 'achats', 'dernier bon le', 'Le bon de livraison saisi à la réception arrive dans Factures & achats, sans ressaisie.', ['gt']),
  n('l4-habituels', '4b', 'commande', 'patron', 'compte', 'Produits habituels', 'Chaque fournisseur a ses produits habituels, réglables.', ['sm'], { reglages: 'commande', etapes: ['Primeurs du Rhône'] }),
  n('l4-pertes', '4b', 'pertes', 'cuisinier', 'pertes', 'Produits fréquents', 'Les produits fréquents permettent de déclarer une perte en deux touches.', ['gt']),
  n('l4-mep', '4b', 'mep', 'cuisinier', 'mep', 'Mise en place de demain', 'La liste de demain est déjà préparée par poste.', ['gt']),
  n('l4-pos', '4b', 'pos', 'resp_cuisine', 'pos', 'suggestions sûres', 'Vous validez d\'un geste les suggestions sûres de correspondance des plats.', ['gt'], { etapes: ['Correspondance des plats'] }),
  n('l4-catalogue', '4b', 'catalogue', 'patron', 'catalogue', 'Ingrédients à relier', 'Les ingrédients à relier au catalogue se relient en série.', ['gt']),

  // ── Lot 5 : le bureau et les routines ───────────────────────────────────────
  n('l5-journal', 5, 'journal', 'patron', 'journal', '7 modifications', 'Le journal se filtre et regroupe les modifications d\'une même personne.', ['gt', 'info']),
  n('l5-journal-reglages', 5, 'journal', 'patron', 'compte', "Vue d'office", "Vous choisissez la vue d'office du journal et le format de l'export.", ['reg'], { reglages: 'journal' }),
  n('l5-messages-cuisine', 5, 'messages', 'cuisinier', 'messages', "l'équipe du soir", 'Les fils d\'équipe : la cuisine voit Cuisine et Toute l\'équipe, et écrit à l\'équipe du soir.', ['gt', 'sm']),
  n('l5-messages-salle', 5, 'messages', 'serveur', 'messages', 'Toute l\'équipe', 'La salle voit les fils Salle et Toute l\'équipe.', ['sm']),
  n('l5-alerte-equipe', 5, 'messages', 'patron', 'dashboard', "Prévenir l'équipe", 'Une alerte se transmet à la brigade : le fil s\'ouvre avec le texte prêt.', ['gt'], { etapes: [{ selecteur: 'button[aria-label*="lerte"]' }] }),
  n('l5-cadeau', 5, 'points', 'patron', 'dashboard', 'Remettre', 'Un cadeau demandé paraît dans « À faire maintenant », avec « Remettre ».', ['gt']),
  n('l5-reprendre', 5, 'sop', 'cuisinier', 'dashboard', { texte: 'Reprendre', exact: true }, 'Une procédure commencée se reprend depuis « À faire maintenant ».', ['gt']),
  n('l5-fiduciaire', 5, 'comptabilite', 'patron', 'comptabilite', 'Pour la fiduciaire', 'L\'Excel de la fiduciaire part en une touche depuis l\'accueil.', ['gt']),
  n('l5-manques', 5, 'comptabilite', 'patron', 'comptabilite', 'Pour des chiffres justes', 'Chaque manque de la comptabilité ouvre sa saisie.', ['info', 'gt']),
  n('l5-compta-reglages', 5, 'comptabilite', 'patron', 'compte', 'Exercice', "Vous choisissez le début de l'exercice et les cartes de l'accueil.", ['sm'], { reglages: 'comptabilite' }),
  n('l5-stats', 5, 'statistiques', 'patron', 'statistiques', 'Meilleur jour', 'Des réponses toutes faites : ce mois contre le mois dernier, meilleur jour, coût du personnel.', ['gt']),
  n('l5-stats-reglages', 5, 'statistiques', 'patron', 'compte', "Vue d'office", "Vous choisissez la vue d'office des statistiques pour la maison.", ['reg'], { reglages: 'statistiques' }),
  n('l5-documents', 5, 'documents', 'patron', 'documents', 'réservé à la direction', 'Le dossier Contrats est réservé à la direction ; chaque dossier dit qui le voit.', ['sm']),
  n('l5-dossier-haccp', 5, 'documents', 'patron', 'haccp', 'Dossier HACCP dans Documents', 'Chaque module ouvre son dossier de Documents, par exemple le HACCP.', ['gt'], { etapes: ['Exporter'] }),
  n('l5-fiches-publier', 5, 'fiches_salle', 'patron', 'fiches_salle', 'à valider', 'Les fiches en brouillon attendent votre validation ; « Publier » en un geste.', ['gt']),
  n('l5-fiches-recette', 5, 'fiches_salle', 'patron', 'fiches_salle', 'Meringues, double crème', "Une fiche salle se crée depuis la recette du plat : la fenêtre liste les plats qui n'en ont pas.", ['gt'], { etapes: [{ texte: 'Gérer', exact: true }, 'Depuis une recette'] }),
  n('l5-sop', 5, 'sop', 'cuisinier', 'sop', 'Reprendre', 'Dans les procédures, « Reprendre » rouvre celle qui est commencée.', ['gt']),

  // ── Lot 6a : l'hôtel et le spa dans la démo ─────────────────────────────────
  n('l6a-roles', '6a', 'hebergement', 'patron', 'dashboard', { selecteur: '#demo-bandeau select' }, 'Le sélecteur de la démo propose la réception et la praticienne spa.', []),
  n('l6a-tdb', '6a', 'dashboard', 'patron', 'dashboard', "Aujourd'hui à l'hôtel", 'Le tableau de bord donne la journée de l\'hôtel : arrivées, départs, en maison, chambres prêtes.', ['info']),
  n('l6a-hebergement', '6a', 'hebergement', 'hote', 'hebergement', 'Arrivées', 'Arrivées et départs du jour, séjours en maison et registre du mois.', ['info']),
  n('l6a-etages', '6a', 'etages', 'hote', 'etages', '304', 'Les chambres par statut, la 304 hors service.', ['info']),
  n('l6a-demandes', '6a', 'demandes', 'hote', 'demandes', { texte: 'fuite' }, 'La fuite en 304 : urgente, escaladée, en retard.', ['info'], { etapes: [{ texte: 'Technique 3', exact: true }] }),
  n('l6a-activites', '6a', 'activites', 'hote', 'activites', 'Programme', 'Le programme du jour et le pointage des consommations.', ['info']),
  n('l6a-passations', '6a', 'passations', 'hote', 'passations', 'passations à lire', 'Les passations à lire et les tâches du jour.', ['info']),
  n('l6a-repas', '6a', 'repas', 'hote', 'repas', 'room service', 'Les couverts du jour et le room service à préparer.', ['info']),
  n('l6a-technique', '6a', 'technique', 'hote', 'technique', 'Ordres de travail', 'Un ordre urgent lié à la demande, un préventif en retard.', ['info']),
  n('l6a-spa', '6a', 'spa', 'praticien_spa', 'spa', 'Agenda', "L'agenda du jour sur deux cabines et les demandes en ligne à confirmer.", ['info']),
  n('l6a-accueil', '6a', 'hebergement', 'hote', 'accueil', { texte: 'Hôtel', exact: true }, "Sur la tablette, l'accueil de la réception a sa rangée Hôtel.", [], { coque: 'tablette' }),
  n('l6a-planning-spa', '6a', 'planning', 'praticien_spa', 'planning', 'Mes horaires', 'La praticienne voit ses horaires au planning, dans le groupe Spa.', ['sm']),

  // ── Lot 6b : l'hôtel à l'écran ──────────────────────────────────────────────
  n('l6b-etages-action', '6b', 'etages', 'patron', 'etages', { texte: 'Commencer', exact: true }, 'Une action par chambre : Commencer, Terminer, Inspecter, et « Gérer ».', ['pm', 'gt']),
  n('l6b-tournee', '6b', 'etages', 'patron', 'etages', 'Prendre ces', 'La tournée du jour : vous prenez vos chambres en un toucher.', ['gt'], { etapes: ['Ma tournée'] }),
  n('l6b-etages-reglages', '6b', 'etages', 'patron', 'compte', 'Temps de ménage', 'Le temps de ménage et le linge se règlent par type de chambre.', ['reg', 'sm'], { reglages: 'etages' }),
  n('l6b-demandes-courantes', '6b', 'demandes', 'hote', 'demandes', 'courantes', 'Les demandes courantes en tête : un toucher remplit tout.', ['gt'], { etapes: ['Nouvelle demande'] }),
  n('l6b-demandes-reglages', '6b', 'demandes', 'patron', 'compte', 'Demandes courantes', 'La maison règle ses demandes courantes.', ['reg', 'sm'], { reglages: 'demandes' }),
  n('l6b-demandes-lignes', '6b', 'demandes', 'hote', 'demandes', 'pris par', 'Les lignes des demandes se lisent : qui l\'a prise, pour quand.', ['info']),
  n('l6b-technique', '6b', 'technique', 'patron', 'technique', 'Demandes sans ordre', 'Une demande sans ordre devient un ordre de travail en un toucher.', ['gt'], { etapes: ['Ordres de travail'] }),
  n('l6b-checkin', '6b', 'hebergement', 'hote', 'hebergement', 'Check-in', 'Le check-in propose la chambre : 101 pour Claude Berger.', ['gt'], { etapes: ['Arrivées du jour', 'Claude Berger'] }),
  n('l6b-repeter', '6b', 'activites', 'patron', 'activites', 'Répéter', 'Une activité se répète : chaque jour une semaine, chaque semaine un mois.', ['gt'], { etapes: ['Nouvelle activité'] }),
  n('l6b-passation', '6b', 'passations', 'hote', 'passations', "L'app a préparé ce texte", 'La passation de la réception arrive pré-remplie : arrivées et départs de demain, demandes ouvertes.', ['gt'], { etapes: ['Nouvelle passation'] }),
  n('l6b-repas', '6b', 'repas', 'patron', 'repas', 'petits-déjeuners', 'Les repas disent le compte et les heures : 15 petits-déjeuners, ouvert de 11:00 à 22:00.', ['info']),
  n('l6b-roomservice', '6b', 'repas', 'patron', 'repas', 'Frais de service', 'La carte du room service en un toucher, frais de service ajoutés.', ['gt'], { etapes: ['Nouvelle commande'] }),
  n('l6b-repas-reglages', '6b', 'repas', 'patron', 'compte', 'Room service', 'Les horaires des repas, le room service et sa carte se règlent ici.', ['reg', 'sm'], { reglages: 'repas' }),
  n('l6b-spa', '6b', 'spa', 'patron', 'spa', 'Agenda', 'Sur la tablette, l\'agenda du spa a des créneaux de 45 px et des boutons de 44 px.', ['pm'], { coque: 'tablette' }),
];

// Capture « avant » du lot 7 (commit de l'audit, même horloge) : la page à
// l'arrivée, pour le même rôle quand elle existe.
const PAGES_CAPTUREES = ['dashboard', 'planning', 'planning-faireleplanning', 'messages', 'journal', 'points', 'comptabilite', 'cartes', 'inventaire', 'achats', 'pertes', 'haccp', 'previsions', 'groupes', 'commande', 'mep', 'pos', 'kds', 'sop', 'fiches_salle', 'documents', 'catalogue', 'caisse', 'statistiques', 'compte',
  'compte-haccp', 'compte-pertes', 'compte-commande', 'compte-mep', 'compte-groupes', 'compte-sop', 'compte-fiches_salle', 'compte-catalogue', 'compte-cartes', 'compte-points', 'compte-ventes_pos', 'compte-kds', 'compte-journal', 'compte-statistiques', 'compte-comptabilite', 'compte-notifications', 'compte-horaires_fermetures', 'compte-reservation_en_ligne', 'compte-planning_modeles', 'compte-achats_paiement', 'compte-inventaire_gerer', 'compte-caisse',
  'spa', 'hebergement', 'etages', 'demandes', 'activites', 'passations', 'repas', 'technique', 'compte-etages', 'compte-demandes', 'compte-repas'];

// Lot 6b : l'avant est celui du lot 6b (la démo avait déjà l'hôtel du lot 6a ;
// sur le commit de l'audit, ces modules n'étaient pas activés dans la démo).
const PAGES_HOTEL_6B = ['hebergement', 'etages', 'demandes', 'activites', 'passations', 'repas', 'technique', 'spa'];

export const LEGENDES_AVANT = {
  audit: "Avant le plan, sur le commit de l'audit du 22 novembre, à la même heure.",
  lot6b: "Avant le lot 6b : l'hôtel était déjà dans la démo (lot 6a), sans les retouches d'écran.",
};

// La capture « avant » d'une nouveauté : { src, legende }, ou null.
export function captureAvant(item) {
  if (item.lot === '6b' && !item.reglages && PAGES_HOTEL_6B.includes(item.page)) {
    const role = item.role === 'hote' ? 'hote' : 'patron';
    const gabarit = item.coque === 'tablette' ? '1024x768' : '1280x820';
    const rang = String(PAGES_HOTEL_6B.indexOf(item.page) + 1).padStart(2, '0');
    return { src: `/demo-nouveautes/avant/lot6b-${role}-${gabarit}-${rang}-${item.page}.jpg`, legende: LEGENDES_AVANT.lot6b, role };
  }
  const audit = captureAudit(item);
  return audit ? { ...audit, legende: LEGENDES_AVANT.audit } : null;
}

function captureAudit(item) {
  let cle = item.reglages ? `compte-${item.reglages}` : item.page;
  if (item.page === 'planning' && (item.etapes || []).includes('Faire le planning')) cle = 'planning-faireleplanning';
  const rang = PAGES_CAPTUREES.indexOf(cle);
  if (rang < 0) return null;
  const tablette = item.coque === 'tablette';
  let role = ['cuisinier', 'serveur'].includes(item.role) && rang < 25 ? item.role : 'patron';
  let gabarit = tablette ? 'doigt1024x768' : 'souris1280x820';
  if (item.role === 'resp_cuisine' && (cle === 'kds' || cle === 'compte-kds')) { role = 'resp_cuisine'; gabarit = 'doigt1024x768'; }
  if (tablette && role !== 'patron' && role !== 'cuisinier' && role !== 'serveur') role = 'patron';
  const resp = role === 'resp_cuisine' ? (cle === 'kds' ? '01-kds' : '02-compte-kds') : `${String(rang + 1).padStart(2, '0')}-${cle}`;
  return { src: `/demo-nouveautes/avant/${role}-${gabarit}-${resp}.jpg`, role };
}
