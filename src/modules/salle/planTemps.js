// ─────────────────────────────────────────────────────────────────────────────
// Le temps sur le plan de salle : qui occupe une table à une heure donnée,
// quelle table convient à une réservation, et une proposition pour placer
// toutes celles qui restent. Fonctions pures (minutes depuis minuit, heure de
// Zurich), testées sous Node (planTemps.test.mjs).
//
// Durée d'une tablée : la réservation ne porte pas d'heure de départ. Le plan
// compte 1 h 30 à midi et 2 h le soir, assez pour voir la rotation des tables
// sans promettre une heure exacte. Un client arrivé occupe sa table tant
// qu'il n'est pas noté parti ; un client parti la libère.
// ─────────────────────────────────────────────────────────────────────────────

export const DUREE_TABLEE = { midi: 90, brunch: 120, soir: 120 };

// Au-delà, une réservation attendue est signalée en retard (même seuil que la
// colonne du service).
export const TOLERANCE_RETARD = 15;

export const PAS_CURSEUR = 15;

export function minutesDe(heure) {
  const [h, m] = String(heure || '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

export function hhmm(minutes) {
  const v = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

const terminee = (r) => r.statut === 'parti' || r.statut === 'no_show' || r.statut === 'annule' || r.statut === 'refuse';

// Fenêtre d'occupation d'une réservation, en minutes. `maintenant` (minute
// courante) n'est donné que pour le jour même : un client arrivé et pas
// encore parti occupe sa table au moins jusqu'à maintenant.
export function fenetre(resa, maintenant = null) {
  const debut = minutesDe(resa.heure_arrivee);
  if (debut == null) return null;
  const duree = DUREE_TABLEE[resa.service] ?? DUREE_TABLEE.soir;
  let fin = debut + duree;
  if (resa.statut === 'arrive' && maintenant != null) fin = Math.max(fin, maintenant + 15);
  return { debut, fin };
}

export const chevauche = (a, b) => !!a && !!b && a.debut < b.fin && b.debut < a.fin;

export function enRetard(resa, maintenant) {
  if (maintenant == null || resa.statut !== 'confirme') return 0;
  const debut = minutesDe(resa.heure_arrivee);
  if (debut == null) return 0;
  const retard = maintenant - debut;
  return retard > TOLERANCE_RETARD ? retard : 0;
}

// État d'une tablée à l'heure `h`, d'après les réservations posées sur elle.
//   libre     personne maintenant ni plus tard dans le service
//   reservee  une réservation attendue l'occupe à h, ou viendra plus tard
//   atable    le client est arrivé
//   retard    la réservation affichée est attendue et en retard
// `affichee` est la réservation que la table montre, `suivante` celle qui
// prendra la table après elle (la rotation du soir).
export function etatTablee(resas, h, maintenant = null) {
  const vivantes = (resas || [])
    .filter((r) => !terminee(r))
    .map((r) => ({ r, f: fenetre(r, maintenant) }))
    .filter((x) => x.f)
    .sort((a, b) => a.f.debut - b.f.debut);
  if (!vivantes.length) return { etat: 'libre', affichee: null, suivante: null, autres: 0 };
  const point = h ?? vivantes[0].f.debut;
  const actives = vivantes.filter((x) => x.f.debut <= point && point < x.f.fin);
  const aVenir = vivantes.filter((x) => x.f.debut > point);
  // Un client arrivé passe devant une réservation attendue à la même heure.
  actives.sort((a, b) => (a.r.statut === 'arrive' ? 0 : 1) - (b.r.statut === 'arrive' ? 0 : 1));
  const choisie = actives[0] || aVenir[0];
  if (!choisie) return { etat: 'libre', affichee: null, suivante: null, autres: 0 };
  const suivante = (actives[0] ? aVenir[0] : aVenir[1]) || null;
  const r = choisie.r;
  let etat = 'reservee';
  if (r.statut === 'arrive') etat = 'atable';
  else if (enRetard(r, maintenant)) etat = 'retard';
  return {
    etat,
    affichee: r,
    aVenir: !actives.length,
    suivante: suivante ? suivante.r : null,
    autres: Math.max(0, actives.length - 1),
  };
}

// Bornes du curseur horaire d'un service : de la première arrivée moins une
// demi-heure à la dernière fin, au pas du curseur. null sans réservation.
export function bornesCurseur(resas) {
  const f = (resas || []).filter((r) => r.statut !== 'no_show').map((r) => fenetre(r)).filter(Boolean);
  if (!f.length) return null;
  const pas = PAS_CURSEUR;
  const min = Math.floor((Math.min(...f.map((x) => x.debut)) - 30) / pas) * pas;
  const max = Math.ceil(Math.max(...f.map((x) => x.fin)) / pas) * pas;
  return { min, max, pas };
}

// ── Proposer une table ─────────────────────────────────────────────────────
// `tablees` : [{ id (table qui porte le numéro), nom, places, salleId,
// tabouret, tableIds: [...] }], une par tablée (table seule comprise).
// `occupations` : Map tableId -> [réservations posées], toutes celles du
// service. La tablée convient si elle a assez de places et qu'aucune autre
// réservation vivante ne la prend sur la même fenêtre. Parmi celles qui
// conviennent : le moins de places perdues, puis la salle affichée, puis le
// plus petit numéro. Une place de bar ne reçoit qu'une personne.
export function tableesLibres(resa, tablees, occupations, { maintenant = null } = {}) {
  const f = fenetre(resa, maintenant);
  const besoin = Number(resa.nb_couverts) || 1;
  return (tablees || []).filter((tb) => {
    if (tb.places < besoin) return false;
    if (tb.tabouret && besoin > 1) return false;
    const prises = new Set();
    for (const id of tb.tableIds) for (const r of occupations.get(id) || []) prises.add(r);
    for (const r of prises) {
      if (r.id === resa.id || terminee(r)) continue;
      if (!f || chevauche(f, fenetre(r, maintenant))) return false;
    }
    return true;
  });
}

const parNumero = (a, b) => String(a.nom).localeCompare(String(b.nom), undefined, { numeric: true });

export function classer(resa, candidates, salleId = null) {
  const besoin = Number(resa.nb_couverts) || 1;
  return [...candidates].sort((a, b) => (a.places - besoin) - (b.places - besoin)
    || (a.salleId === salleId ? 0 : 1) - (b.salleId === salleId ? 0 : 1)
    || parNumero(a, b));
}

export function proposer(resa, tablees, occupations, opts = {}) {
  return classer(resa, tableesLibres(resa, tablees, occupations, opts), opts.salleId)[0] || null;
}

// Placer tout le monde : les réservations sans table, dans l'ordre d'arrivée
// (les plus grandes d'abord à heure égale, elles ont le moins de choix). Chaque
// proposition retenue occupe sa tablée pour les suivantes. Rend
// [{ resa, tablee | null }] : null quand rien ne convient.
export function planifier(aPlacer, tablees, occupations, opts = {}) {
  const occ = new Map([...occupations].map(([k, v]) => [k, [...v]]));
  const ordre = [...aPlacer].sort((a, b) => (minutesDe(a.heure_arrivee) ?? 0) - (minutesDe(b.heure_arrivee) ?? 0)
    || (Number(b.nb_couverts) || 0) - (Number(a.nb_couverts) || 0));
  return ordre.map((resa) => {
    const tablee = proposer(resa, tablees, occ, opts);
    if (tablee) for (const id of tablee.tableIds) occ.set(id, [...(occ.get(id) || []), resa]);
    return { resa, tablee };
  });
}
