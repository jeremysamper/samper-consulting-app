// ─────────────────────────────────────────────────────────────────────────────
// Pastilles « +N » et popup « points obtenus » (lot P3) : règles sans React.
//
// Les indicateurs viennent de la RPC points_indicateurs (personne connectée
// seulement) : { actif, participant, programme_aujourdhui, moment, actions:
// { action: { points, plafond, faits, reste } }, reste_jour, reste_mois,
// zones_payees, perimetres_payes }. Réponse vide = système éteint ou personne
// qui ne participe pas : aucune pastille.
// ─────────────────────────────────────────────────────────────────────────────

// Matin avant 15 h, soir dès 15 h, heure de Zurich (même règle que
// points_moment_zurich en base).
export function momentZurich(date = new Date()) {
  const heure = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', hourCycle: 'h23' }).format(date));
  return heure < 15 ? 'matin' : 'soir';
}

// Minutes depuis minuit à Zurich.
export function minutesZurich(date = new Date()) {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(date).split(':').map(Number);
  return h * 60 + m;
}

const normaliser = (texte) => String(texte ?? '').trim().toLowerCase();

// Points qu'un geste rapporterait encore maintenant, ou null (aucune pastille).
//   zoneId    : relevé HACCP, la zone déjà payée pour la demi-journée ne paie plus
//   perimetre : inventaire, le périmètre payé dans les 7 jours ne paie plus
export function pointsPastille(ind, action, { zoneId = null, perimetre = null } = {}) {
  if (!ind || !ind.actif || !ind.participant || !ind.programme_aujourdhui) return null;
  const a = ind.actions?.[action];
  const points = Number(a?.points) || 0;
  if (points <= 0 || !(Number(a?.reste) > 0)) return null;
  if (points > (Number(ind.reste_jour) || 0) || points > (Number(ind.reste_mois) || 0)) return null;
  if (action === 'releve_haccp' && zoneId != null && (ind.zones_payees || []).includes(zoneId)) return null;
  if ((action === 'comptage_zone' || action === 'inventaire_valide') && perimetre != null
      && (ind.perimetres_payes || []).map(normaliser).includes(normaliser(perimetre))) return null;
  return points;
}

// Pastille du bouton « J'arrive » : pas encore pointé et l'heure de début du
// service pas dépassée (à la minute, comme en base).
export function pastillePointage(ind, shift, maintenant = new Date()) {
  const points = pointsPastille(ind, 'pointage_ponctuel');
  if (points == null || !shift || shift.pointageDebut) return null;
  if (shift.note === 'Pointage hors planning') return null;
  const [h, m] = String(shift.debut || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return minutesZurich(maintenant) <= h * 60 + m ? points : null;
}

// Popup : les crédits reçus à moins de 1,5 s d'écart se fondent en un seul
// (somme, « N gestes »). Rend le popup à afficher.
export const FENETRE_FUSION_MS = 1500;
export function fusionnerPopup(courant, credit, maintenant = Date.now()) {
  const points = Number(credit?.points) || 0;
  if (courant && maintenant - courant.dernier <= FENETRE_FUSION_MS) {
    return { points: courant.points + points, gestes: courant.gestes + 1, libelle: courant.libelle, dernier: maintenant };
  }
  return { points, gestes: 1, libelle: credit?.libelle || '', dernier: maintenant };
}
