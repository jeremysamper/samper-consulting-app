// ─────────────────────────────────────────────────────────────────────────────
// Objectifs de la maison dans Statistiques (18.11.2026), réglés dans
// Réglages > La maison > Objectifs (reglages_maison.objectifs).
//
//   coût matière et coût du personnel : en % du chiffre, à ne pas dépasser ;
//     trait sur le graphique à tout pas, verdict dans la tuile ;
//   chiffre d'affaires : par mois, à atteindre ; trait sur le graphique au pas
//     du mois seulement, et la tuile le rappelle sans verdict (sa période
//     n'est pas forcément un mois).
// Pur, testé par objectifs.test.mjs.
// ─────────────────────────────────────────────────────────────────────────────

const MESURES = {
  'comptabilite.matiere_pct': { cle: 'matierePct', sens: 'bas' },
  'comptabilite.personnel_pct': { cle: 'personnelPct', sens: 'bas' },
  'comptabilite.ca_ht': { cle: 'caMensuelHt', sens: 'haut', parMois: true },
};
const estNombre = (v) => typeof v === 'number' && Number.isFinite(v);

// { [id de mesure]: { valeur, sens, trace, verdict, parMois } } pour les
// objectifs réglés.
export function objectifsDe(objectifs, pas) {
  const out = {};
  Object.entries(MESURES).forEach(([id, m]) => {
    const valeur = objectifs?.[m.cle];
    if (!estNombre(valeur)) return;
    out[id] = { valeur, sens: m.sens, parMois: Boolean(m.parMois), trace: !m.parMois || pas === 'mois', verdict: !m.parMois };
  });
  return out;
}

// 'atteint' | 'manque' | null (pas de verdict ou pas de valeur).
export function verdictObjectif(total, objectif) {
  if (!objectif?.verdict || !estNombre(total)) return null;
  const atteint = objectif.sens === 'bas' ? total <= objectif.valeur : total >= objectif.valeur;
  return atteint ? 'atteint' : 'manque';
}
