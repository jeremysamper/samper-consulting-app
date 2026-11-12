// ─────────────────────────────────────────────────────────────────────────────
// Durée d'un horaire, seule règle de l'app. La grille et le relevé CCNT du
// Planning (calcHeures), Mon planning et les exports (heuresSegment), les
// soldes, la carte du tableau de bord (chiffresGestion), la Comptabilité et
// les Statistiques la lisent toutes. Pur, testé par dureeHoraire.test.mjs.
//
// Règle :
//   - une fin avant le début tombe le lendemain : 08:00 à 01:30 vaut 17 h 30,
//     22:00 à 02:00 vaut 4 h (fin de service après minuit) ;
//   - une fin égale au début vaut 0, jamais 24 h : l'horaire d'un pointage
//     hors planning naît avec fin = début (migration 20260930), et un départ
//     pointé dans la minute de l'arrivée est un geste en trop, pas une journée ;
//   - la pause se déduit, la durée ne descend jamais sous 0 ;
//   - une heure absente ou illisible : null, rien à compter.
// Les heures sont des « HH:MM » (ou « HH:MM:SS ») sans date : un horaire dure
// donc moins de 24 h.
// ─────────────────────────────────────────────────────────────────────────────

const enMinutes = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// Minutes travaillées, entières, pause déduite ; null si une heure manque.
export function dureeMinutes(debut, fin, pause) {
  const d = enMinutes(debut);
  const f = enMinutes(fin);
  if (d == null || f == null) return null;
  const brut = f < d ? f + 1440 - d : f - d;
  return Math.max(0, brut - (Number(pause) || 0));
}

// La même durée en heures (17.5 pour 17 h 30) ; null si une heure manque.
export const dureeHeures = (debut, fin, pause) => {
  const m = dureeMinutes(debut, fin, pause);
  return m == null ? null : m / 60;
};
