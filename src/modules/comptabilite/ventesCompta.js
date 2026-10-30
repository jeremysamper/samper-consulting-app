// ─────────────────────────────────────────────────────────────────────────────
// Ventes de la Comptabilité, sans React ni DOM (testé par node --test,
// ventesCompta.test.mjs).
//
// Trois sources, par jour (règle D9 de la spec) :
//   - la saisie à la main du jour (ventes_jour, TVA comprise, par taux) : elle
//     corrige la caisse, elle la remplace donc pour ce jour ;
//   - sinon la caisse (pos_sales) : la caisse ne distingue pas l'emporter, son
//     montant est compté à 8,1 % (dit à l'écran) ;
//   - plus les lignes de note de séjour de l'hôtel, par taux de la ligne, hors
//     encaissements et hors taxes de séjour et d'hébergement (perçues pour la
//     commune). Une remise, négative, diminue le jour.
// Montants saisis TVA comprise (le ticket Z du soir) ; le compte de résultat
// est hors TVA. Le hors TVA d'un taux se calcule sur le total TTC du taux sur
// la période, arrondi au centime une fois (D8), comme un décompte.
// ─────────────────────────────────────────────────────────────────────────────

import { round2 } from '../inventaire/tvaAchats.js';
import { listeJours, ajouterJours } from './periodesCompta.js';

// Taux proposés à la saisie du chiffre du jour, dans l'ordre de l'écran.
export const TAUX_VENTES = [
  { cle: '8.1', taux: 8.1, label: 'Sur place (8,1 %)' },
  { cle: '2.6', taux: 2.6, label: 'À l\'emporter (2,6 %)' },
  { cle: '3.8', taux: 3.8, label: 'Hébergement (3,8 %)' },
];
export const TAUX_CAISSE = 8.1;
const NOTES_EXCLUES = new Set(['paiement', 'taxe_sejour', 'taxe_hebergement']);
const ORDRE_TAUX = TAUX_VENTES.map(t => t.taux);

const nombre = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
// Clé d'un taux : '8.1', '2.6', '3.8', '0'.
export const cleTaux = (t) => String(nombre(t) ?? 0);

// Une ligne par jour qui a au moins une source, triée par jour.
//   manuel : [{ jour, taux, montantTtc }]   (ventes_jour)
//   pos    : [{ jour, montantTtc }]         (pos_sales, revenue_cts / 100)
//   notes  : [{ jour, type, montant, tvaTaux }]  (sejour_lignes)
// → [{ jour, source: 'manuel' | 'pos' | null, parTaux: { cle: ttc }, ttc,
//      posTtc (null sans caisse ce jour), notesTtc, avecNotes }]
export function ventesParJour({ manuel = [], pos = [], notes = [], debut = null, fin = null } = {}) {
  const dans = (j) => typeof j === 'string' && (!debut || j >= debut) && (!fin || j <= fin);
  const jours = new Map();
  const jour = (j) => {
    if (!jours.has(j)) jours.set(j, { jour: j, manuel: null, pos: null, notes: null });
    return jours.get(j);
  };
  (manuel || []).forEach((v) => {
    const m = nombre(v.montantTtc);
    if (!dans(v.jour) || m == null) return;
    const x = jour(v.jour);
    x.manuel = x.manuel || {};
    const k = cleTaux(v.taux);
    x.manuel[k] = (x.manuel[k] || 0) + m;
  });
  (pos || []).forEach((v) => {
    const m = nombre(v.montantTtc);
    if (!dans(v.jour) || m == null) return;
    const x = jour(v.jour);
    x.pos = (x.pos || 0) + m;
  });
  (notes || []).forEach((l) => {
    const m = nombre(l.montant);
    if (!dans(l.jour) || m == null || NOTES_EXCLUES.has(l.type)) return;
    const x = jour(l.jour);
    x.notes = x.notes || {};
    const k = cleTaux(l.tvaTaux);
    x.notes[k] = (x.notes[k] || 0) + m;
  });

  return [...jours.values()].sort((a, b) => a.jour.localeCompare(b.jour)).map((x) => {
    const parTaux = {};
    const ajouter = (k, v) => { parTaux[k] = (parTaux[k] || 0) + v; };
    let source = null;
    if (x.manuel) { source = 'manuel'; Object.entries(x.manuel).forEach(([k, v]) => ajouter(k, v)); }
    else if (x.pos != null) { source = 'pos'; ajouter(cleTaux(TAUX_CAISSE), x.pos); }
    let notesTtc = 0;
    if (x.notes) Object.entries(x.notes).forEach(([k, v]) => { ajouter(k, v); notesTtc += v; });
    Object.keys(parTaux).forEach((k) => { parTaux[k] = round2(parTaux[k]); });
    return {
      jour: x.jour,
      source,
      parTaux,
      ttc: round2(Object.values(parTaux).reduce((s, v) => s + v, 0)),
      posTtc: x.pos == null ? null : round2(x.pos),
      notesTtc: round2(notesTtc),
      avecNotes: !!x.notes,
    };
  });
}

const rangTaux = (t) => {
  const i = ORDRE_TAUX.indexOf(t);
  return i === -1 ? ORDRE_TAUX.length : i;
};

// Totaux d'une période : TTC, hors TVA et TVA, par taux et en tout.
// Sans aucun jour connu : ttc, ht et tva valent null (affichés « n/a »).
export function totauxVentes(parJour) {
  const parTaux = new Map();
  const jours = { manuel: 0, pos: 0, notes: 0 };
  let notesTtc = 0;
  (parJour || []).forEach((j) => {
    if (j.source === 'manuel') jours.manuel += 1;
    if (j.source === 'pos') jours.pos += 1;
    if (j.avecNotes) { jours.notes += 1; notesTtc += j.notesTtc || 0; }
    Object.entries(j.parTaux || {}).forEach(([k, v]) => parTaux.set(k, (parTaux.get(k) || 0) + v));
  });
  const lignes = [...parTaux.entries()].map(([k, brut]) => {
    const taux = Number(k);
    const ttc = round2(brut);
    const ht = round2(ttc / (1 + taux / 100));
    return { taux, ttc, ht, tva: round2(ttc - ht) };
  }).sort((a, b) => rangTaux(a.taux) - rangTaux(b.taux) || b.taux - a.taux);
  const connu = jours.manuel + jours.pos + jours.notes > 0;
  const somme = (k) => round2(lignes.reduce((s, l) => s + l[k], 0));
  return {
    ttc: connu ? somme('ttc') : null,
    ht: connu ? somme('ht') : null,
    tva: connu ? somme('tva') : null,
    parTaux: lignes,
    jours,
    notesTtc: round2(notesTtc),
  };
}

// Jours attendus et jours manquants d'une période. Un jour est « ouvert »
// quand il a au moins un horaire au planning ; s'il n'y a aucun horaire sur la
// période, tous les jours comptent. Jusqu'à hier seulement : aujourd'hui ne
// compte que s'il est déjà saisi (la journée n'est pas finie). Un jour fermé
// qui a un chiffre compte quand même.
//   → { avec, attendus, manquants: [jour ISO] }
export function couvertureVentes({ parJour, joursOuverts, debut, finEffective, aujourdhui }) {
  const fin = finEffective && finEffective < aujourdhui ? finEffective : aujourdhui;
  const jours = listeJours(debut, fin);
  const ouverts = joursOuverts instanceof Set ? joursOuverts : new Set(joursOuverts || []);
  const toutOuvert = !jours.some(j => ouverts.has(j));
  const avecChiffre = new Set((parJour || []).filter(j => j.source).map(j => j.jour));
  let avec = 0, attendus = 0;
  const manquants = [];
  jours.forEach((j) => {
    const aChiffre = avecChiffre.has(j);
    if (j === aujourdhui) {
      if (aChiffre) { avec += 1; attendus += 1; }
      return;
    }
    const ouvert = toutOuvert || ouverts.has(j);
    if (!ouvert && !aChiffre) return;
    attendus += 1;
    if (aChiffre) avec += 1;
    else manquants.push(j);
  });
  return { avec, attendus, manquants };
}

// Les jours ouverts passés d'une période qui n'ont aucun chiffre d'affaires.
export function joursSansChiffre(args) {
  return couvertureVentes(args).manquants;
}

// Résumé d'une période pour la synthèse : totaux plus couverture.
export function resumeVentes({ parJour, joursOuverts, debut, finEffective, aujourdhui }) {
  return { ...totauxVentes(parJour), ...couvertureVentes({ parJour, joursOuverts, debut, finEffective, aujourdhui }) };
}

// Les n derniers jours jusqu'à aujourd'hui, le plus récent d'abord
// (écran Chiffre du jour).
export function derniersJours(aujourdhui, n = 14) {
  return Array.from({ length: n }, (_, i) => ajouterJours(aujourdhui, -i));
}
