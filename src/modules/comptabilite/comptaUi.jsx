import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Petits morceaux d'affichage partagés par les écrans de la Comptabilité :
// montants, pourcentages, dates, styles communs. Francs entiers sur les
// grandes cartes, centimes dans les listes (D21) ; une valeur inconnue
// s'écrit « n/a », jamais 0. Nombres et dates dans leurs propres nœuds : la
// phrase autour reste une entrée du glossaire au lieu de partir à l'IA.
// ─────────────────────────────────────────────────────────────────────────────

const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

export const chf = (n) => (Number(n) || 0).toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const chfEntier = (n) => Math.round(Number(n) || 0).toLocaleString('fr-CH', { maximumFractionDigits: 0 });
export const pctTexte = (p) => `${(Math.round(p * 10) / 10).toLocaleString('fr-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
export const tauxTexte = (t) => `${String(t).replace('.', ',')} %`;
export const dateCH = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
// « ven. 30.10 »
export const jourCourt = (iso) => `${JOURS_COURTS[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
export const pluriel = (n, un, plusieurs) => (n > 1 ? plusieurs : un);

// Montant saisi : « 2 650,50 », « 2'650.50 », « 2650 » → 2650.5 ; '' → null ;
// illisible, plus de deux décimales ou 10 millions et plus → NaN.
export function lireMontant(texte) {
  const s = String(texte ?? '').replace(/[\s  '’]/g, '').replace(',', '.');
  if (!s) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return NaN;
  const n = Number(s);
  return n < 10000000 ? n : NaN;
}

// « CHF 1 234,50 » (ou entier), « n/a » sans valeur.
export function Chf({ v, entier = false }) {
  if (v == null) return <span>n/a</span>;
  return <span style={{ fontFamily: 'var(--font-num)', whiteSpace: 'nowrap' }}><span>CHF</span> <span>{entier ? chfEntier(v) : chf(v)}</span></span>;
}

// Montant seul, sans « CHF », aligné à droite dans un tableau.
export function Montant({ v }) {
  return <span style={{ fontFamily: 'var(--font-num)', whiteSpace: 'nowrap' }}>{v == null ? 'n/a' : chf(v)}</span>;
}

export const st = {
  page: { display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0, maxWidth: '100%' },
  section: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  sectionTitre: { fontSize: 15, fontWeight: 500, color: 'var(--text)', fontFamily: 'var(--font-serif)' },
  remarque: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 },
  texte: { fontSize: 14, color: 'var(--text)', lineHeight: 1.5 },
  ligne: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', minWidth: 0, flexWrap: 'wrap' },
  ligneGauche: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 200px' },
  ligneTitre: { fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis' },
  ligneDetail: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 },
  num: { fontFamily: 'var(--font-num)', fontSize: 14, color: 'var(--text)', whiteSpace: 'nowrap' },
  primaire: { minHeight: 44 },
  lien: { background: 'none', border: 'none', padding: '6px 0', minHeight: 32, color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 'inherit', textAlign: 'left' },
};
