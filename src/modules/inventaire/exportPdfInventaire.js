// ─────────────────────────────────────────────────────────────────────────────
// PDF de l'état d'inventaire : la feuille « Inventaire » du classeur, mise en
// page comme son impression (A4 paysage, ajusté à la largeur, bandeau titre,
// en-tête doré et lignes alternées, titre et en-tête répétés sur chaque page).
//
// Vectoriel (jsPDF) et non capture d'écran : net à tout zoom, léger, et
// indépendant de ce qui est affiché à l'écran.
// ─────────────────────────────────────────────────────────────────────────────

import { INVENTAIRE_MODELE as M, rgb } from '../../design/brandTokens.js';
import { LARGEURS } from './exportXlsxInventaire.js';

const ENTETES = ['Zone', 'Catégorie', 'Produit', 'Conditionnement', 'Qté reçue', 'Unité', 'Sortie', 'Stock actuel',
  "Valeur d'achat (CHF)", 'PU moyen (CHF)', 'Valeur stock (CHF)', 'Fournisseur(s) et documents'];

// Colonnes à fond crème sur les lignes impaires, comme dans le classeur (les
// colonnes chiffrées de droite restent blanches).
const CREME = [true, true, true, true, true, true, false, false, false, false, false, true];
// Alignement : g = gauche, c = centre, d = droite.
const ALIGN = ['g', 'g', 'g', 'g', 'c', 'g', 'c', 'c', 'd', 'd', 'd', 'g'];
// Quantités posées en bas de cellule, le reste centré (styles du classeur).
const EN_BAS = [false, false, false, false, true, false, true, true, false, false, false, false];

// Nombres à la française, comme l'impression du classeur : virgule décimale,
// espace des milliers (espace simple : l'espace fine n'existe pas dans les
// polices standard du PDF).
const milliers = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const chf = (n) => {
  if (n == null || n === '' || !Number.isFinite(Number(n))) return '';
  const v = Number(n);
  if (Math.abs(v) < 0.005) return '-';
  const [e, d] = Math.abs(v).toFixed(2).split('.');
  return `${v < 0 ? '-' : ''}${milliers(e)},${d}`;
};
const qte = (n) => {
  if (n == null || !Number.isFinite(Number(n))) return '';
  const s = String(+Number(n).toFixed(3));
  const [e, d] = s.replace('-', '').split('.');
  return `${Number(n) < 0 ? '-' : ''}${milliers(e)}${d ? ',' + d : ''}`;
};

// Tronque au pixel près ; « ... » en ASCII (l'ellipse n'est pas rendue par
// les polices standard de jsPDF).
function ajuster(doc, texte, largeur) {
  const t = String(texte ?? '');
  if (doc.getTextWidth(t) <= largeur) return t;
  let bas = 0, haut = t.length;
  while (bas < haut) {
    const m = Math.ceil((bas + haut) / 2);
    if (doc.getTextWidth(t.slice(0, m) + '...') <= largeur) bas = m; else haut = m - 1;
  }
  return t.slice(0, bas).trimEnd() + '...';
}

export async function construirePdfInventaire(etat) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  // Marges du classeur (0,605 po × 0,469 po).
  const mx = 43.6, my = 33.8;

  // Largeur Excel (caractères) → points, à l'échelle de l'impression du
  // classeur modèle : 0,39 (lignes de 6 pt, texte de 4 pt, environ 90 lignes
  // par page), mesurée sur le PDF de référence. Comme dans ce PDF, la dernière
  // colonne (fournisseurs et documents) s'étire jusqu'à la marge droite.
  const naturelles = LARGEURS.map(w => (w * 7 + 5) * 0.75);
  const echelle = 0.39;
  const W = naturelles.map(w => w * echelle);
  W[W.length - 1] = Math.max(W[W.length - 1], pageW - 2 * mx - W.slice(0, -1).reduce((a, b) => a + b, 0));
  const X = W.reduce((acc, w, i) => { acc.push(i ? acc[i - 1] + W[i - 1] : mx); return acc; }, []);
  const largeurTable = W.reduce((a, b) => a + b, 0);
  const f = (pt) => pt * echelle; // tailles du classeur à l'échelle
  // Espace sous le bandeau mesuré sur le PDF de référence (environ 12,5 pt).
  const hTitre = f(25.5), hVide = f(32), hEntete = f(30), hLigne = f(15.75);
  const pad = f(3);

  const couleur = (hex) => rgb(hex);
  const cadre = (x, y, w, h, fond) => {
    if (fond) { doc.setFillColor(...couleur(fond)); doc.rect(x, y, w, h, 'F'); }
    doc.setDrawColor(...couleur(M.filet));
    doc.setLineWidth(0.3);
    doc.rect(x, y, w, h, 'S');
  };
  const texte = (t, i, y, h, { taille, gras = false, italique = false, teinte = '#000000' } = {}) => {
    doc.setFont('helvetica', gras && italique ? 'bolditalic' : gras ? 'bold' : italique ? 'italic' : 'normal');
    doc.setFontSize(taille);
    doc.setTextColor(...couleur(teinte));
    const t2 = ajuster(doc, t, W[i] - 2 * pad);
    const base = EN_BAS[i] ? y + h - taille * 0.3 : y + h / 2 + taille * 0.35;
    if (ALIGN[i] === 'c') doc.text(t2, X[i] + W[i] / 2, base, { align: 'center' });
    else if (ALIGN[i] === 'd') doc.text(t2, X[i] + W[i] - pad, base, { align: 'right' });
    else doc.text(t2, X[i] + pad, base);
  };

  const entetePage = () => {
    let y = my;
    doc.setFillColor(...couleur(M.titre));
    doc.rect(mx, y, largeurTable, hTitre, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(f(14));
    doc.setTextColor(255, 255, 255);
    doc.text(ajuster(doc, etat.titre, largeurTable - 2 * pad), mx + largeurTable / 2, y + hTitre / 2 + f(14) * 0.35, { align: 'center' });
    y += hTitre + hVide;
    ENTETES.forEach((h, i) => {
      cadre(X[i], y, W[i], hEntete, M.entete);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(f(10));
      doc.setTextColor(255, 255, 255);
      // En-tête sur deux lignes au besoin (« Valeur d'achat / (CHF) »).
      const lignes = doc.splitTextToSize(h, W[i] - 2 * pad).slice(0, 2);
      const interligne = f(10) * 1.15;
      const y0 = y + hEntete / 2 - ((lignes.length - 1) * interligne) / 2 + f(10) * 0.35;
      lignes.forEach((l, k) => doc.text(l, X[i] + W[i] / 2, y0 + k * interligne, { align: 'center' }));
    });
    return y + hEntete;
  };

  let y = entetePage();
  const basPage = pageH - my;
  etat.lignes.forEach((l, k) => {
    if (y + hLigne > basPage) { doc.addPage(); y = entetePage(); }
    const creme = k % 2 === 0;
    const valeurs = [
      l.zone, l.categorie, l.produit, l.conditionnement, qte(l.qteRecue), l.unite, qte(l.sortie),
      qte(l.stockActuel), chf(l.valeurAchat), l.qteRecue ? chf(l.puMoyen) : '', l.qteRecue ? chf(l.valeurStock) : '', l.sources,
    ];
    valeurs.forEach((v, i) => {
      cadre(X[i], y, W[i], hLigne, creme && CREME[i] ? M.zebra : null);
      const style = i === 3 ? { taille: f(9), teinte: M.note }
        : i === 11 ? { taille: f(9), teinte: M.source }
          : { taille: f(10) };
      if (v !== '' && v != null) texte(v, i, y, hLigne, style);
    });
    y += hLigne;
  });

  // Ligne TOTAL, bandeau bleu comme le titre.
  if (y + hLigne > basPage) { doc.addPage(); y = entetePage(); }
  ENTETES.forEach((_, i) => cadre(X[i], y, W[i], hLigne, M.titre));
  const blanc = '#FFFFFF';
  texte('TOTAL', 2, y, hLigne, { taille: f(11), gras: true, teinte: blanc });
  texte(String(etat.totaux.references), 4, y, hLigne, { taille: f(11), gras: true, teinte: blanc });
  texte('références', 5, y, hLigne, { taille: f(9), italique: true, teinte: blanc });
  texte(chf(etat.totaux.valeurAchat), 8, y, hLigne, { taille: f(11), gras: true, teinte: blanc });
  texte(chf(etat.totaux.valeurStock), 10, y, hLigne, { taille: f(11), gras: true, teinte: blanc });

  doc.setProperties({ title: etat.titre, creator: 'Samper Consulting' });
  return doc;
}
