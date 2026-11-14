// ─────────────────────────────────────────────────────────────────────────────
// Points des employés : règles d'affichage, sans React.
//
// Miroir de la migration supabase/migrations/20261114_points_boutique.sql :
//   BAREME_DEFAUT      = points_bareme_defaut()
//   ROLES_PARTICIPANTS = points_roles_defaut()
//   LIBELLES_ACTIONS   = points_libelle_action()
// La base reste la seule à créditer ; ces listes ne servent qu'à l'écran.
// points.test.mjs compare les clés des deux côtés.
// ─────────────────────────────────────────────────────────────────────────────

export const BAREME_DEFAUT = {
  releve_haccp: { points: 2, plafond: 10 },
  controle_haccp: { points: 3, plafond: 5 },
  photo_tracabilite: { points: 3, plafond: 10 },
  facture_achat: { points: 5, plafond: 10 },
  perte_declaree: { points: 2, plafond: 5 },
  comptage_zone: { points: 10, plafond: 5 },
  inventaire_valide: { points: 20, plafond: 2 },
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
};

// Ce que rapporte chaque geste, dit à l'employé (« Ce qui rapporte des points »).
export const EXPLICATIONS_ACTIONS = {
  releve_haccp: 'Chaque relevé de température enregistré.',
  controle_haccp: 'Chaque contrôle HACCP enregistré.',
  photo_tracabilite: 'Chaque photo de traçabilité, avec sa photo.',
  facture_achat: 'Chaque facture ou bon scanné, photo ou PDF.',
  perte_declaree: 'Chaque perte déclarée, quelle que soit la quantité.',
  comptage_zone: "Chaque zone comptée dans un inventaire, une fois par zone.",
  inventaire_valide: 'Chaque inventaire que vous validez.',
};

// Rôles participants par défaut ; consultant et patron n'y entrent jamais.
export const ROLES_PARTICIPANTS = ['resp_cuisine', 'cuisinier', 'serveur', 'hote', 'praticien_spa',
  'receptionniste', 'gouvernante', 'femme_de_chambre', 'technicien'];
export const ROLES_JAMAIS = ['consultant', 'patron'];

export const AJUSTEMENT_MAX = 500;
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
