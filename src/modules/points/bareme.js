// ─────────────────────────────────────────────────────────────────────────────
// Points des employés : règles d'affichage, sans React.
//
// Miroir des migrations des points :
//   BAREME_DEFAUT      = points_bareme_defaut() (20261119_points_nouveaux_gestes.sql)
//   ROLES_PARTICIPANTS = points_roles_defaut()
//   LIBELLES_ACTIONS   = points_libelle_action() (20261119_points_nouveaux_gestes.sql)
//   PLAFONDS_TOTAUX    = défauts de points_reglages.plafond_jour_total et _mois_total
// La base reste la seule à créditer ; ces listes ne servent qu'à l'écran.
// points.test.mjs compare les clés des deux côtés.
// ─────────────────────────────────────────────────────────────────────────────

export const BAREME_DEFAUT = {
  releve_haccp: { points: 2, plafond: 8 },
  controle_haccp: { points: 3, plafond: 5 },
  photo_tracabilite: { points: 3, plafond: 3 },
  facture_achat: { points: 5, plafond: 3 },
  perte_declaree: { points: 2, plafond: 2 },
  comptage_zone: { points: 10, plafond: 5 },
  inventaire_valide: { points: 20, plafond: 1 },
  pointage_ponctuel: { points: 2, plafond: 2 },
  reservation_saisie: { points: 1, plafond: 4 },
  client_accueilli: { points: 1, plafond: 8 },
  mep_cochee: { points: 1, plafond: 6 },
  passation_ecrite: { points: 3, plafond: 1 },
  tache_faite: { points: 2, plafond: 4 },
  chambre_prete: { points: 1, plafond: 10 },
  ordre_termine: { points: 3, plafond: 4 },
  seance_spa: { points: 2, plafond: 5 },
};

export const ACTIONS = Object.keys(BAREME_DEFAUT);

export const LIBELLES_ACTIONS = {
  releve_haccp: 'Relevé HACCP',
  controle_haccp: 'Contrôle HACCP',
  photo_tracabilite: 'Photo de traçabilité',
  facture_achat: "Facture d'achat",
  perte_declaree: 'Perte déclarée',
  comptage_zone: "Zone d'inventaire comptée",
  inventaire_valide: 'Inventaire validé',
  pointage_ponctuel: "Pointage à l'heure",
  reservation_saisie: 'Réservation saisie',
  client_accueilli: 'Client accueilli',
  mep_cochee: 'Mise en place cochée',
  passation_ecrite: 'Passation écrite',
  tache_faite: 'Tâche du jour faite',
  chambre_prete: 'Chambre prête',
  ordre_termine: 'Ordre de travail terminé',
  seance_spa: 'Compte rendu de séance',
};

// Ce que rapporte chaque geste, dit à l'employé (« Ce qui rapporte des points »).
export const EXPLICATIONS_ACTIONS = {
  releve_haccp: "Le premier relevé d'une zone le matin (avant 15 h), puis le premier du soir.",
  controle_haccp: 'Chaque contrôle HACCP enregistré.',
  photo_tracabilite: 'Une photo par produit et par jour, le produit indiqué.',
  facture_achat: 'Chaque facture scannée ou en PDF, avec son numéro, une seule fois.',
  perte_declaree: 'Chaque perte déclarée avec son produit et sa quantité.',
  comptage_zone: "Chaque zone comptée, versée quand l'inventaire est validé, cinq au plus.",
  inventaire_valide: "L'inventaire que vous validez, un par périmètre et par semaine.",
  pointage_ponctuel: "Votre arrivée pointée dans l'heure qui précède le début, pas en retard, sur un service que vous n'avez pas planifié vous-même.",
  reservation_saisie: "Chaque réservation que vous saisissez pour aujourd'hui ou plus tard, avec un nom et des couverts. Une réservation annulée ensuite ne rapporte plus.",
  client_accueilli: 'Chaque client que vous marquez arrivé le jour de sa réservation.',
  mep_cochee: "Chaque ligne de mise en place que vous cochez, pour aujourd'hui ou demain. Une ligne décochée ne rapporte plus.",
  passation_ecrite: "La première passation du jour pour un pôle et un service, d'au moins une phrase complète.",
  tache_faite: 'Chaque tâche du jour que vous cochez dans les Passations.',
  chambre_prete: 'Chaque chambre que vous passez à « Propre », une fois par chambre et par jour.',
  ordre_termine: "Chaque ordre de travail que vous terminez avec son compte rendu, quand une autre personne ou un plan l'a ouvert.",
  seance_spa: 'Chaque compte rendu de séance écrit le jour même avec vos observations, un par client et par jour.',
};

// Module dont dépend chaque geste : un geste dont le module est éteint dans
// l'établissement n'est ni expliqué à l'équipe ni réglé par la direction (rien
// ne peut s'y gagner). La facture vient de plusieurs écrans : toujours montrée.
export const MODULE_ACTION = {
  releve_haccp: 'haccp',
  controle_haccp: 'haccp',
  photo_tracabilite: 'haccp',
  perte_declaree: 'pertes',
  comptage_zone: 'inventaire',
  inventaire_valide: 'inventaire',
  pointage_ponctuel: 'planning',
  reservation_saisie: 'previsions',
  client_accueilli: 'previsions',
  mep_cochee: 'mep',
  passation_ecrite: 'passations',
  tache_faite: 'passations',
  chambre_prete: 'etages',
  ordre_termine: 'technique',
  seance_spa: 'spa',
};

// Gestes possibles dans l'établissement, dans l'ordre du barème.
// estActif   = isModuleActiveForEtab de moduleConfig.js, passé par l'écran ;
// peutOuvrir = (module) => la personne ouvre ce module (écran de l'employé
//              seulement : la direction règle le barème pour toute l'équipe).
export function actionsDeLEtablissement(etablissement, estActif, peutOuvrir = null) {
  return ACTIONS.filter((a) => {
    const module = MODULE_ACTION[a];
    if (!module) return true;
    if (typeof estActif === 'function' && !estActif(etablissement, module)) return false;
    if (typeof peutOuvrir === 'function' && !peutOuvrir(module)) return false;
    return true;
  });
}

// Rôles participants par défaut ; consultant et patron n'y entrent jamais.
export const ROLES_PARTICIPANTS = ['resp_cuisine', 'cuisinier', 'serveur', 'hote', 'praticien_spa',
  'receptionniste', 'gouvernante', 'femme_de_chambre', 'technicien'];
export const ROLES_JAMAIS = ['consultant', 'patron'];

export const AJUSTEMENT_MAX = 500;
// Plafonds par personne, tous gestes confondus (P2, F1) : au plus 4 800 points
// par personne et par an avec les défauts.
export const PLAFONDS_TOTAUX = { jour: 40, mois: 400 };
export const PLAFOND_JOUR_TOTAL_MAX = 200;
export const PLAFOND_MOIS_TOTAL_MAX = 2000;
// Coût d'un cadeau (contrainte points_cadeaux_cout_bornes).
export const COUT_MIN = 100;
export const COUT_MAX = 10000;

// Photo d'un cadeau : seulement une adresse publique du stockage Supabase de
// l'app (contrainte points_cadeaux_photo_url_check, migration
// 20261115_points_cadeaux_photo ; la CSP n'affiche aucune autre source).
export const MOTIF_PHOTO_CADEAU = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\//;
export function photoCadeauValide(url) {
  return typeof url === 'string' && url.length <= 1000 && MOTIF_PHOTO_CADEAU.test(url);
}

// Page d'origine d'une photo du catalogue (crédits) : une adresse https.
export function sourcePhotoValide(url) {
  return typeof url === 'string' && url.length <= 1000 && /^https:\/\/[^\s]+$/.test(url);
}

// Catégories du catalogue ; « commun » paraît dans les deux rangées.
export const CATEGORIES_CADEAU = ['cuisine', 'salle', 'commun'];
export const LIBELLES_CATEGORIES = { cuisine: 'Cuisine', salle: 'Salle', commun: 'Commun' };
export const FILTRES_BOUTIQUE = [
  { id: 'cuisine', label: 'Cuisine' },
  { id: 'salle', label: 'Salle' },
  { id: 'tout', label: 'Tout' },
];

// Rangée choisie d'office selon le rôle (P2, F11).
export function filtreParDefaut(role) {
  if (role === 'serveur' || role === 'hote') return 'salle';
  if (role === 'resp_cuisine' || role === 'cuisinier') return 'cuisine';
  return 'tout';
}

export function filtrerCadeaux(cadeaux, filtre) {
  const liste = cadeaux || [];
  if (filtre !== 'cuisine' && filtre !== 'salle') return liste;
  return liste.filter((c) => (c.categorie || 'commun') === filtre || (c.categorie || 'commun') === 'commun');
}

// Gérer les points (P2, F8) : la direction seulement, et sa case « Modifier ».
// Un participant ne gère jamais, même avec la case cochée.
export function peutGererPoints(role, droitGerer) {
  return ROLES_JAMAIS.includes(role) && Boolean(droitGerer);
}
export const POINTS_MAX = 100;
export const PLAFOND_MAX = 50;

export function libelleAction(action) {
  return LIBELLES_ACTIONS[action] || action || '';
}

// Barème tel qu'il s'applique : la valeur lue si elle est lisible, sinon le
// défaut (même règle que points_bareme_effectif côté base).
export function baremeEffectif(bareme) {
  const res = {};
  for (const action of ACTIONS) {
    const v = bareme && typeof bareme === 'object' ? bareme[action] : null;
    const lisible = v && Number.isInteger(v.points) && Number.isInteger(v.plafond)
      && v.points >= 0 && v.points <= POINTS_MAX && v.plafond >= 0 && v.plafond <= PLAFOND_MAX;
    res[action] = lisible ? { points: v.points, plafond: v.plafond } : { ...BAREME_DEFAUT[action] };
  }
  return res;
}

// Contrôle de saisie du barème avant envoi (la base refait le même).
// Rend null si tout va bien, sinon le message à afficher.
export function erreurBareme(bareme) {
  for (const action of ACTIONS) {
    const v = bareme?.[action];
    if (!v) continue;
    if (!Number.isInteger(v.points) || v.points < 0 || v.points > POINTS_MAX) {
      return `${libelleAction(action)} : les points vont de 0 à ${POINTS_MAX}.`;
    }
    if (!Number.isInteger(v.plafond) || v.plafond < 0 || v.plafond > PLAFOND_MAX) {
      return `${libelleAction(action)} : le plafond va de 0 à ${PLAFOND_MAX}.`;
    }
  }
  return null;
}

// Entrée « Points & boutique » du menu (rail, menu déplié, coque tactile,
// recherche) : qui gère la voit toujours (il allume le système) ; les autres
// seulement quand le système est actif pour l'établissement ET qu'ils y
// participent. Avant l'activation, aucun employé ne voit rien changer.
export function entreeMenuVisible({ actif = false, participant = false, gere = false } = {}) {
  return Boolean(gere) || (Boolean(actif) && Boolean(participant));
}

// Prochain cadeau abordable : le moins cher des cadeaux actifs en stock que
// le solde ne couvre pas encore. Rend { cadeau, manque, part } ou null quand
// tout est déjà abordable ou qu'il n'y a rien à viser.
export function prochainCadeau(cadeaux, solde) {
  const s = Number(solde) || 0;
  const visables = (cadeaux || [])
    .filter((c) => c && c.actif !== false && (c.stock == null || c.stock > 0) && Number(c.cout) > s)
    .sort((a, b) => Number(a.cout) - Number(b.cout) || String(a.nom).localeCompare(String(b.nom), 'fr'));
  const cadeau = visables[0];
  if (!cadeau) return null;
  const cout = Number(cadeau.cout);
  return { cadeau, manque: cout - s, part: Math.max(0, Math.min(1, s / cout)) };
}

// Pourquoi « Commander » est éteint, ou null s'il est permis. L'écran rend le
// nombre dans son propre nœud (traduction du DOM : la phrase reste fixe).
export function raisonCommandeImpossible(cadeau, solde) {
  if (!cadeau || cadeau.actif === false) return { cle: 'retire' };
  if (cadeau.stock != null && cadeau.stock <= 0) return { cle: 'stock' };
  const manque = Number(cadeau.cout) - (Number(solde) || 0);
  if (manque > 0) return { cle: 'manque', manque };
  return null;
}

// Début du mois de Zurich, pour « ce mois ».
export function debutMoisZurich(maintenant = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit' })
    .formatToParts(maintenant);
  const an = parts.find((p) => p.type === 'year').value;
  const mois = parts.find((p) => p.type === 'month').value;
  return `${an}-${mois}`;
}

function moisZurich(iso) {
  if (!iso) return '';
  return debutMoisZurich(new Date(iso));
}

// Repères du mois : points gagnés (crédits moins annulations) et gestes
// comptés (crédits non annulés), sur les mouvements déjà chargés.
export function chiffresDuMois(mouvements, maintenant = new Date()) {
  const mois = debutMoisZurich(maintenant);
  const duMois = (mouvements || []).filter((m) => moisZurich(m.createdAt) === mois);
  const credits = duMois.filter((m) => m.sens === 'credit');
  const annulations = duMois.filter((m) => m.sens === 'annulation');
  const gagnes = [...credits, ...annulations].reduce((s, m) => s + (Number(m.points) || 0), 0);
  return { gagnes, gestes: Math.max(0, credits.length - annulations.length) };
}

// Texte du retour immédiat après un crédit.
export function messageCredit(mouvement) {
  const n = Number(mouvement?.points) || 0;
  return `+${n} point${n > 1 ? 's' : ''} : ${mouvement?.libelle || libelleAction(mouvement?.action)}`;
}

export const LIBELLES_STATUTS = {
  demandee: 'Demandée',
  remise: 'Cadeau remis',
  refusee: 'Refusée',
  annulee: 'Annulée',
};

export function formatPoints(n) {
  const v = Number(n) || 0;
  return new Intl.NumberFormat('fr-CH').format(v);
}
