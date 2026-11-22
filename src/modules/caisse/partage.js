// ─────────────────────────────────────────────────────────────────────────────
// Addition partagée (lot L1, 22.11.2026) : la part d'un paiement selon le mode
// choisi à l'encaissement, et le pourboire en pour cent.
//
// Trois modes :
//   - 'tout'  : la part est le reste à payer (ou un montant tapé, plus petit) ;
//   - 'plat'  : on coche des lignes, ou une partie des unités d'une ligne
//               (« 1 sur 3 ») ; les unités déjà réglées restent marquées ;
//   - 'parts' : 2 à 12 parts égales, la dernière absorbe l'arrondi au centime.
//
// Rien n'est écrit en base : un paiement posé garde, pendant l'encaissement,
// ce qu'il a réglé (`partage`), et le service ne transmet à la RPC que les
// champs qu'elle connaît. Tout se calcule en centimes entiers, comme tva.js.
// Fonctions pures, testées par partage.test.mjs.
// ─────────────────────────────────────────────────────────────────────────────

import { centimes } from './tva.js';

export const PARTS_MIN = 2;
export const PARTS_MAX = 12;
export const POURBOIRES_POURCENT = [5, 10, 15];

const francs = (c) => c / 100;
const borne = (c, max) => Math.max(0, Math.min(c, max));

// Le nombre d'unités qu'on peut cocher une à une : la quantité si elle est un
// entier d'au moins 1, sinon la ligne entière compte pour une unité (vente au
// poids, demi-portion).
export function unitesDe(ligne) {
  const q = Number(ligne?.quantite);
  return Number.isInteger(q) && q >= 1 ? q : 1;
}

// Centimes de la ligne, comme totalLigne.
const centimesLigne = (l) => centimes(Number(l.quantite) * Number(l.prix_unitaire));

// Ce que coûtent k unités d'une ligne dont `deja` unités sont réglées. Pris sur
// le total cumulé de la ligne, pour que la somme des parts fasse toujours le
// total de la ligne, même avec un prix unitaire remisé à plus de deux décimales.
export function montantUnites(ligne, deja, k) {
  const n = unitesDe(ligne);
  const a = Math.max(0, Math.min(deja, n));
  const b = Math.max(a, Math.min(a + k, n));
  const t = centimesLigne(ligne);
  return francs(Math.round((t * b) / n) - Math.round((t * a) / n));
}

// Unités réglées par ligne, lues sur les paiements posés en mode « par plat ».
export function unitesReglees(poses) {
  const m = {};
  (poses || []).forEach((p) => {
    if (p?.partage?.mode !== 'plat') return;
    Object.entries(p.partage.unites || {}).forEach(([id, k]) => { m[id] = (m[id] || 0) + Number(k || 0); });
  });
  return m;
}

// État de chaque ligne en mode « par plat » : unités réglées, restantes,
// cochées (bornées au restant) et ce que coûte la sélection.
export function lignesParPlat(lignes, poses, choix) {
  const reglees = unitesReglees(poses);
  return (lignes || []).map((l) => {
    const unites = unitesDe(l);
    const faites = Math.min(unites, reglees[l.id] || 0);
    const restant = unites - faites;
    const coche = Math.max(0, Math.min(Number(choix?.[l.id] || 0), restant));
    return {
      ligne: l, unites, reglees: faites, restant, coche,
      montantCoche: montantUnites(l, faites, coche),
      montantRestant: montantUnites(l, faites, restant),
    };
  });
}

// La part « par plat » : la somme des unités cochées, bornée au reste à payer.
// `unites` est ce qu'on écrira sur le paiement posé ({ ligneId: k }).
export function partParPlat({ lignes, poses, choix, reste }) {
  const etat = lignesParPlat(lignes, poses, choix);
  const c = etat.reduce((s, e) => s + centimes(e.montantCoche), 0);
  const unites = {};
  etat.forEach((e) => { if (e.coche > 0) unites[e.ligne.id] = e.coche; });
  return { part: francs(borne(c, centimes(reste))), unites, lignes: etat };
}

// Parts égales. La base est ce qu'il reste à partager quand les parts
// commencent : le total moins les paiements posés hors de ce mode (plats déjà
// réglés, acompte au montant libre). Chaque part vaut la base divisée par le
// nombre de parts, arrondie au centime inférieur ; la dernière prend ce qui
// reste de la base, donc l'arrondi.
export function partsEgales({ total, poses, n, reste }) {
  const nb = Math.max(PARTS_MIN, Math.min(PARTS_MAX, Math.round(Number(n) || PARTS_MIN)));
  const enParts = (poses || []).filter((p) => p?.partage?.mode === 'parts');
  const horsParts = (poses || []).filter((p) => p?.partage?.mode !== 'parts');
  const base = centimes(total) - horsParts.reduce((s, p) => s + centimes(p.montant), 0);
  const unePart = Math.floor(Math.max(0, base) / nb);
  const derniere = Math.max(0, base) - (nb - 1) * unePart;
  const payees = enParts.length;
  const verse = enParts.reduce((s, p) => s + centimes(p.montant), 0);
  let suivante;
  if (payees >= nb) suivante = 0;
  else if (payees === nb - 1) suivante = Math.max(0, base) - verse;
  else suivante = unePart;
  return {
    n: nb,
    base: francs(Math.max(0, base)),
    montants: Array.from({ length: nb }, (_, i) => francs(i === nb - 1 ? derniere : unePart)),
    payees,
    part: francs(borne(suivante, centimes(reste))),
  };
}

// Pourboire : 'aucun', un pour cent de la part (5, 10, 15), ou 'libre' avec
// le montant tapé. Arrondi au centime ; jamais négatif.
export function pourboireDe(part, choix, libre = '') {
  if (choix === 'libre') {
    const n = Number(String(libre ?? '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? francs(centimes(n)) : 0;
  }
  const pct = Number(choix);
  if (!POURBOIRES_POURCENT.includes(pct)) return 0;
  return francs(Math.round((centimes(part) * pct) / 100));
}
