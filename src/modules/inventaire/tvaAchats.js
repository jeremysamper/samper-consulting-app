// ─────────────────────────────────────────────────────────────────────────────
// TVA des pièces d'achat (achats_documents.tva_taux, montant_tva), sans React.
//
// La lecture IA rend le taux (`tauxTva`, ai-proxy parse-facture : 2.6 pour
// l'alimentaire, 8.1 sinon) et les deux totaux. Rien ici n'est une règle
// fiscale : le montant de TVA est la différence des deux totaux lus quand on
// les a, et le taux ne sert qu'à dire si cette différence est plausible, ou à
// estimer le total manquant. La tenue des comptes reste chez la fiduciaire.
// ─────────────────────────────────────────────────────────────────────────────

// Taux suisses en vigueur depuis le 01.01.2024, dans l'ordre du choix à l'écran.
export const TAUX_TVA = [
  { id: '2.6', taux: 2.6, label: '2,6 %', detail: 'alimentaire, boissons sans alcool' },
  { id: '8.1', taux: 8.1, label: '8,1 %', detail: 'taux normal' },
  { id: '3.8', taux: 3.8, label: '3,8 %', detail: 'hébergement' },
  { id: '0', taux: 0, label: '0 %', detail: 'exonéré' },
];
export const TAUX_AUTRE = 'autre';

export const round2 = (n) => Math.round(n * 100) / 100;
const nombre = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

// « 2,6 % », « 19 % » ; '' sans taux.
export const libelleTaux = (taux) => {
  const t = nombre(taux);
  if (t == null) return '';
  return `${String(t).replace('.', ',')} %`;
};

// Id du choix à l'écran pour un taux : '2.6', '8.1', '3.8', '0', 'autre', ou '' sans taux.
export const choixPourTaux = (taux) => {
  const t = nombre(taux);
  if (t == null) return '';
  return TAUX_TVA.find(x => x.taux === t)?.id || TAUX_AUTRE;
};

// Vrai quand TTC = HT x (1 + taux/100), à 5 centimes plus un pour mille du
// TTC près (arrondis de ligne, ports, rabais au centime). null quand l'un des
// trois manque : rien à juger.
export function tauxCoherent({ totalHT, totalTTC, tvaTaux }) {
  const ht = nombre(totalHT);
  const ttc = nombre(totalTTC);
  const taux = nombre(tvaTaux);
  if (ht == null || ttc == null || taux == null) return null;
  return Math.abs(ttc - ht * (1 + taux / 100)) <= 0.05 + 0.001 * Math.abs(ttc);
}

// Montant de TVA d'une pièce depuis ce qui a été lu ou saisi.
//   - HT et TTC connus : montant = TTC moins HT (valeurs lues, jamais recalculées),
//     `coherent` dit si le taux lu colle (null sans taux) ;
//   - taux et un seul total : l'autre total et la TVA sont déduits, `estime: true`
//     (affiché comme estimation, jamais écrit en base comme total lu) ;
//   - sinon : null partout.
export function montantTvaDepuisTotaux({ totalHT, totalTTC, tvaTaux }) {
  const ht = nombre(totalHT);
  const ttc = nombre(totalTTC);
  const taux = nombre(tvaTaux);
  if (ht != null && ttc != null) {
    return { montantTva: round2(ttc - ht), totalHT: ht, totalTTC: ttc, estime: false, coherent: tauxCoherent({ totalHT: ht, totalTTC: ttc, tvaTaux: taux }) };
  }
  if (taux != null && ht != null) {
    const ttcEstime = round2(ht * (1 + taux / 100));
    return { montantTva: round2(ttcEstime - ht), totalHT: ht, totalTTC: ttcEstime, estime: true, coherent: true };
  }
  if (taux != null && ttc != null) {
    const htEstime = round2(ttc / (1 + taux / 100));
    return { montantTva: round2(ttc - htEstime), totalHT: htEstime, totalTTC: ttc, estime: true, coherent: true };
  }
  return { montantTva: null, totalHT: ht, totalTTC: ttc, estime: false, coherent: null };
}

// Montant de TVA à ÉCRIRE en base pour une pièce : seulement ce qui est connu
// (deux totaux lus), jamais une estimation.
export function montantTvaAEnregistrer({ totalHT, totalTTC }) {
  const ht = nombre(totalHT);
  const ttc = nombre(totalTTC);
  return ht != null && ttc != null ? round2(ttc - ht) : null;
}

// Document dont HT, TTC et taux sont lus mais ne s'accordent pas : il garde
// ses valeurs lues et reste signalé « à vérifier » (accueil, écran de
// vérification, export) jusqu'à correction du taux ou d'un total.
export const tvaIncoherente = (d) => tauxCoherent({ totalHT: d?.totalHT, totalTTC: d?.totalTTC, tvaTaux: d?.tvaTaux }) === false;

// Colonne « à vérifier » de l'export fiduciaire : HT, TTC ou taux manquant,
// ou incohérents entre eux.
export function tvaAVerifier(d) {
  return nombre(d?.totalHT) == null || nombre(d?.totalTTC) == null || nombre(d?.tvaTaux) == null || tvaIncoherente(d);
}
