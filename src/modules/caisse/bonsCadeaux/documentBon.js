// ─────────────────────────────────────────────────────────────────────────────
// Le bon cadeau imprimé : une carte A6 à l'italienne (148 x 105 mm), vectorielle
// (jsPDF), construite depuis la ligne du bon, jamais depuis l'écran. Elle
// s'imprime seule ou sur A4, et se partage en PDF.
//
// Charte des documents : bleu pétrole de la marque, ni gras ni capitales.
// Le téléphone de la personne n'est jamais imprimé : il sert à retrouver le
// bon, pas à le décorer. Le QR porte le code seul (codeBon.js).
// Polices standard du PDF (Helvetica, Courier) : apostrophe droite.
// ─────────────────────────────────────────────────────────────────────────────

import { PDF } from '../../../design/brandTokens.js';
import { matriceQr } from '../../../services/qrFacture.js';
import { dateCH } from './codeBon.js';

const chf = (n) => {
  const v = Number(n || 0);
  const [e, d] = Math.abs(v).toFixed(2).split('.');
  return `${e.replace(/\B(?=(\d{3})+(?!\d))/g, "'")}.${d}`;
};

export async function construireBonCadeau({ bon, maison }) {
  const { jsPDF } = await import('jspdf');
  const L = 419.53;
  const H = 297.64;
  const doc = new jsPDF({ unit: 'pt', format: [L, H], orientation: 'landscape', compress: true });
  doc.setProperties({ title: `Bon cadeau ${bon.code}` });
  const couleur = (c, quoi) => {
    if (quoi === 'texte') doc.setTextColor(...c);
    else if (quoi === 'trait') doc.setDrawColor(...c);
    else doc.setFillColor(...c);
  };
  const texte = (t, x, y, { taille = 10, c = PDF.ink, police = 'helvetica', aligne = 'left', largeur = null } = {}) => {
    doc.setFont(police, 'normal');
    doc.setFontSize(taille);
    couleur(c, 'texte');
    const lignes = largeur ? doc.splitTextToSize(String(t), largeur) : [String(t)];
    lignes.forEach((l, i) => doc.text(l, x, y + i * taille * 1.3, { align: aligne }));
    return y + lignes.length * taille * 1.3;
  };

  // Bandeau de la maison, à gauche.
  const bande = 124;
  couleur(PDF.primary, 'fond');
  doc.rect(0, 0, bande, H, 'F');
  texte(maison?.nom || '', 18, 42, { taille: 13, c: PDF.white, largeur: bande - 30 });
  const pied = [maison?.adresse, maison?.localite].filter(Boolean);
  pied.forEach((l, i) => texte(l, 18, H - 36 - (pied.length - 1 - i) * 11, { taille: 8, c: PDF.tint, largeur: bande - 30 }));

  // Corps.
  const x = bande + 28;
  const droite = L - 26;
  texte('Bon cadeau', x, 56, { taille: 26, c: PDF.primary });
  couleur(PDF.accent, 'trait');
  doc.setLineWidth(1);
  doc.line(x, 68, x + 46, 68);
  texte(`pour ${bon.nom}`, x, 90, { taille: 12, largeur: droite - x });
  texte(`CHF ${chf(bon.montant_initial)}`, x, 134, { taille: 32, c: PDF.primary });
  if (bon.message) texte(bon.message, x, 158, { taille: 10, c: PDF.stone, largeur: droite - x });

  // Code et validité, en bas à gauche du corps ; QR en bas à droite.
  const cote = 92;
  const qx = droite - cote;
  const qy = H - 26 - cote;
  texte('Code du bon', x, qy + 18, { taille: 8, c: PDF.stone });
  texte(bon.code, x, qy + 38, { taille: 17, police: 'courier' });
  texte(bon.valable_jusqu_au ? `Valable jusqu'au ${dateCH(bon.valable_jusqu_au)}` : 'Sans limite de validité', x, qy + 56, { taille: 9, c: PDF.stone });
  texte('Présentez ce bon à la caisse. Il se dépense en une ou plusieurs fois.', x, qy + 74, { taille: 7.5, c: PDF.stone, largeur: qx - x - 12 });
  if (bon.emis_at) texte(`Émis le ${dateCH(String(bon.emis_at).slice(0, 10))}`, x, qy + 95, { taille: 7.5, c: PDF.stone });

  const m = await matriceQr(bon.code);
  const marge = 2;
  const pas = cote / (m.taille + marge * 2);
  couleur(PDF.ink, 'fond');
  for (let l = 0; l < m.taille; l += 1) {
    for (let c = 0; c < m.taille; c += 1) {
      if (m.estNoir(l, c)) doc.rect(qx + (c + marge) * pas, qy + (l + marge) * pas, pas + 0.05, pas + 0.05, 'F');
    }
  }
  return doc;
}

export const nomFichierBon = (bon) => `bon-cadeau-${bon.code}.pdf`;
