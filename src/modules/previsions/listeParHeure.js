import { minutesDe } from '../salle/planTemps.js';

// ─────────────────────────────────────────────────────────────────────────────
// Réservations du service rangées par heure d'arrivée (22.11.2026, lot L7) :
// un groupe par quart d'heure, dans l'ordre du service, les réservations de
// chaque quart d'heure à leur minute puis par nom. Les partis et les no-shows
// restent à part (repliés en bas de la liste, comme dans la vue par état).
//
// Chaque groupe porte ses couverts et leur part du quart d'heure le plus
// chargé du service (0 à 1), pour une barre qui montre le rythme des
// arrivées. « encours » marque le quart d'heure de l'heure de Zurich donnée.
// Pur, testé par listeParHeure.test.mjs.
// ─────────────────────────────────────────────────────────────────────────────

export const QUART = 15;

const couvertsDe = (r) => Number(r.nb_couverts) || 0;
export const estTerminee = (r) => r.statut === 'parti' || r.statut === 'no_show';

export function grouperParQuart(resas, minute = null) {
  const groupes = new Map();
  (resas || []).forEach((r) => {
    if (estTerminee(r)) return;
    const m = minutesDe(r.heure_arrivee);
    const debut = m == null ? null : Math.floor(m / QUART) * QUART;
    const cle = debut == null ? 'sans' : String(debut);
    if (!groupes.has(cle)) groupes.set(cle, { debut, resas: [] });
    groupes.get(cle).resas.push(r);
  });
  const liste = [...groupes.values()].sort((a, b) => (a.debut ?? Infinity) - (b.debut ?? Infinity));
  liste.forEach((g) => {
    g.resas.sort((a, b) => ((minutesDe(a.heure_arrivee) ?? 0) - (minutesDe(b.heure_arrivee) ?? 0))
      || String(a.nom || '').localeCompare(String(b.nom || ''), 'fr'));
    g.couverts = g.resas.reduce((s, r) => s + couvertsDe(r), 0);
  });
  const max = Math.max(0, ...liste.map((g) => g.couverts));
  liste.forEach((g) => {
    g.part = max > 0 ? g.couverts / max : 0;
    g.encours = minute != null && g.debut != null && minute >= g.debut && minute < g.debut + QUART;
  });
  return liste;
}
