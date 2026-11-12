// ─────────────────────────────────────────────────────────────────────────────
// Entrées du journal d'activité par tranche, sans React ni service (testé par
// node --test, serieJournal.test.mjs), pour le module Statistiques. Le jour
// d'une entrée est celui de Zurich (Journal.jsx borne ses semaines du lundi
// minuit au lundi suivant, heure de Zurich). Libellés des modules : ceux de
// Journal.jsx (MODULES, l. 22).
// ─────────────────────────────────────────────────────────────────────────────

import { zurichDateHeure } from '../../utils/zurichTime.js';

export const MODULES_JOURNAL = { recettes: 'Recettes', produits: 'Produits', pertes: 'Pertes', inventaires: 'Inventaires', caisse: 'Caisse' };
export const OPERATIONS_JOURNAL = { INSERT: 'Création', UPDATE: 'Modification', DELETE: 'Suppression' };

const ajouter = (acc, cle) => { acc[cle] = (acc[cle] || 0) + 1; };

export function serieJournal(lignes, tranches) {
  const datees = (lignes || []).filter((l) => l?.created_at).map((l) => ({ ...l, jour: zurichDateHeure(l.created_at).jour }));
  return (tranches || []).map((t) => {
    const dedans = datees.filter((l) => l.jour >= t.debut && l.jour <= t.fin);
    const parModule = {};
    const parOperation = {};
    dedans.forEach((l) => { ajouter(parModule, l.module || 'autre'); ajouter(parOperation, l.operation || 'autre'); });
    return { debut: t.debut, fin: t.fin, entrees: dedans.length, parModule, parOperation };
  });
}
