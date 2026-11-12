// ─────────────────────────────────────────────────────────────────────────────
// Échelles et formats du graphique des Statistiques, sans React ni DOM (testé
// par node --test, echelles.test.mjs).
//
// Unités du catalogue : 'chf' (francs), 'nombre', 'pct' (un rapport entre 0
// et 1, affiché en pour cent), 'min' (minutes), 'h' (heures décimales),
// 'jour' (jours), 'temp' (degrés Celsius). Formats fr-CH. Une valeur absente
// s'écrit « n/a », jamais 0.
// ─────────────────────────────────────────────────────────────────────────────

export const UNITES = {
  chf: { label: 'CHF', decimales: 2 },
  nombre: { label: '', decimales: 0 },
  pct: { label: '%', decimales: 1 },
  min: { label: 'min', decimales: 0 },
  h: { label: 'h', decimales: 2 },
  jour: { label: 'jours', decimales: 0 },
  temp: { label: '°C', decimales: 1 },
};

const estNombre = (v) => typeof v === 'number' && Number.isFinite(v);

// Plafond « rond » d'une échelle : 1, 2, 2.5, 5 ou 10 fois une puissance de 10.
export function plafondRond(max) {
  if (!(max > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  const n = [1, 2, 2.5, 5, 10].find((k) => k * p >= max - 1e-9);
  return Math.round(n * p * 1e6) / 1e6;
}

// Échelle d'un axe pour une liste de valeurs (les null sont ignorés) : part de
// zéro, descend sous zéro seulement s'il y a des valeurs négatives.
//   → { min, max, graduations } ; sans aucune valeur : 0 à 1.
export function echelleDe(valeurs) {
  const connues = (valeurs || []).filter(estNombre);
  const haut = plafondRond(Math.max(0, ...connues));
  const plusBas = Math.min(0, ...connues);
  const bas = plusBas < 0 ? -plafondRond(-plusBas) : 0;
  const graduations = bas < 0 ? [bas, 0, haut] : [0, haut / 2, haut];
  return { min: bas, max: haut, graduations };
}

// Position verticale d'une valeur sur son échelle, de 0 (bas) à 1 (haut).
export function positionSur(echelle, valeur) {
  if (!estNombre(valeur) || !echelle || echelle.max === echelle.min) return null;
  return (valeur - echelle.min) / (echelle.max - echelle.min);
}

const nombreFr = (v, decimales) => v.toLocaleString('fr-CH', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

// Le nombre seul, sans son unité (rendue dans son propre nœud à l'écran).
//   court : pour l'axe (francs sans centimes, pour cent sans décimale).
export function nombreDe(valeur, unite, { court = false } = {}) {
  if (!estNombre(valeur)) return 'n/a';
  if (unite === 'pct') return nombreFr(valeur * 100, court ? 0 : 1);
  if (unite === 'chf') return nombreFr(valeur, court ? 0 : 2);
  if (unite === 'min') return nombreFr(valeur, 0);
  if (unite === 'h') return nombreFr(valeur, court ? 0 : 2);
  if (unite === 'temp') return nombreFr(valeur, 1);
  return nombreFr(valeur, Number.isInteger(valeur) ? 0 : 1);
}

export const libelleUnite = (unite) => UNITES[unite]?.label || '';

// Valeur d'une cellule de tableur : le nombre exact (les pour cent en pour
// cent), ou vide pour « n/a ».
export function valeurTableur(valeur, unite) {
  if (!estNombre(valeur)) return null;
  if (unite === 'pct') return Math.round(valeur * 10000) / 100;
  return valeur;
}

// Rangs des étiquettes de l'axe horizontal à montrer : la première, la
// dernière et un pas régulier entre les deux, au plus `max` étiquettes.
export function rangsEtiquettes(n, max = 7) {
  if (n <= 0) return [];
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const pas = Math.ceil((n - 1) / (max - 1));
  const rangs = [];
  for (let i = 0; i < n - 1; i += pas) rangs.push(i);
  if (n - 1 - rangs[rangs.length - 1] < pas / 2) rangs.pop();
  rangs.push(n - 1);
  return rangs;
}
