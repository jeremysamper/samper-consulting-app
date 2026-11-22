import { maisonFermee } from '../../utils/reglagesMaison.js';

// Partie pure des fermetures de la réservation en ligne (fermeturesEnLigne.js) :
// lue par les tests sans le client Supabase.

export const HORIZON_FERMETURES_JOURS = 400;

const ajouterJours = (iso, n) => {
  const [a, m, j] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
};

// Les jours fermés toute la journée, de `depuis` à `depuis + nbJours`.
export function joursFermesMaison(fermetures, depuis, nbJours = HORIZON_FERMETURES_JOURS) {
  if (!fermetures || !/^\d{4}-\d{2}-\d{2}$/.test(depuis || '')) return [];
  const out = [];
  for (let i = 0; i <= nbJours; i += 1) {
    const d = ajouterJours(depuis, i);
    if (maisonFermee(fermetures, d)) out.push(d);
  }
  return out;
}

// Jours fermés à écrire pour la réservation en ligne : ceux de la maison, plus
// les jours posés à la main avant le plan (« hérités »), dès aujourd'hui.
export function joursFermesEnLigne(fermetures, herites, aujourdhui) {
  const maison = joursFermesMaison(fermetures, aujourdhui);
  return [...new Set([...maison, ...(herites || []).filter((d) => d >= aujourdhui)])].sort();
}
