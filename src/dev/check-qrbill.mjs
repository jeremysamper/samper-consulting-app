// Contrôle de la QR-facture : on enregistre TOUS les appels de dessin émis par
// pdfUtils._dessinerQrFacture, on vérifie les cotes au dixième de millimètre,
// puis on rejoue le tout en SVG pour un contrôle à l'œil.
//
// Pourquoi ce fichier existe : les cotes du récépissé sont NORMATIVES, et une
// mise en page fausse ne se voit qu'au moment où un client n'arrive pas à
// payer. La mesure attrape ce que l'œil laisse passer - 45 mm au lieu de 46 -
// et l'œil attrape ce que la mesure laisse passer, une croix suisse à l'envers.
//
//   node src/dev/check-qrbill.mjs sortie.png            (cas nominal)
//   node src/dev/check-qrbill.mjs sortie.png degrade    (client non analysable)
//
// Hors application : jamais importé par le bundle, dépend de sharp (devDep).
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

const RACINE = new URL('../', import.meta.url).href;
const { pdfUtils } = await import(`${RACINE}services/pdf.js`);
const { construireQrFacture, parserAdresse, validerQrFacture } = await import(`${RACINE}services/qrFacture.js`);

// ─── Faux document jsPDF : enregistre au lieu d'écrire ───
const appels = [];
const etat = { remplissage: '#000', trait: '#000', taille: 10, gras: false, epaisseur: 0.2, pointilles: false };
const hex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

const faux = {
  getNumberOfPages: () => 1,
  setPage: () => {},
  setFillColor: (r, g, b) => { etat.remplissage = hex(r, g, b); },
  setDrawColor: (r, g, b) => { etat.trait = hex(r, g, b); },
  setTextColor: () => {},
  setLineWidth: (w) => { etat.epaisseur = w; },
  setLineDashPattern: (motif) => { etat.pointilles = Array.isArray(motif) && motif.length > 0; },
  setFont: (_famille, style) => { etat.gras = style === 'bold'; },
  setFontSize: (t) => { etat.taille = t; },
  rect: (x, y, l, h) => appels.push({ type: 'rect', x, y, l, h, couleur: etat.remplissage }),
  line: (x1, y1, x2, y2) => appels.push({ type: 'ligne', x1, y1, x2, y2, couleur: etat.trait, epaisseur: etat.epaisseur, pointilles: etat.pointilles }),
  lines: (segments, x, y) => {
    let cx = x; let cy = y;
    segments.forEach(([dx, dy]) => {
      appels.push({ type: 'ligne', x1: cx, y1: cy, x2: cx + dx, y2: cy + dy, couleur: etat.trait, epaisseur: etat.epaisseur });
      cx += dx; cy += dy;
    });
  },
  // Largeur approchée d'Helvetica : 0,5 em par caractère. Suffisant pour
  // reproduire le repliement, pas pour mesurer un centrage au point près.
  splitTextToSize: (texte, largeur) => {
    const parCaractere = etat.taille * 0.352778 * 0.5;
    const max = Math.max(1, Math.floor(largeur / parCaractere));
    const mots = String(texte).split(' ');
    const out = []; let ligne = '';
    mots.forEach((mot) => {
      if (!ligne) ligne = mot;
      else if ((ligne + ' ' + mot).length <= max) ligne += ' ' + mot;
      else { out.push(ligne); ligne = mot; }
    });
    if (ligne) out.push(ligne);
    return out;
  },
  text: (txt, x, y, options) => appels.push({ type: 'texte', txt, x, y, taille: etat.taille, gras: etat.gras, align: options?.align || 'left' }),
};

// ─── Données ───
// « degrade » : client dont l'adresse n'a pas pu être analysée et montant
// libre. La norme veut alors des champs vides à coins d'angle, pas des trous.
const degrade = process.argv.includes('degrade');
const donnees = construireQrFacture({
  iban: 'CH33 0076 5001 0561 6551 0',
  creancier: { nom: 'SAMPER Jérémy', rue: 'Route de Collombé', numero: '24A', npa: '1976', localite: 'Erde', pays: 'CH' },
  debiteur: degrade ? null : parserAdresse('Le Rucher SA\nRoute du Village 12\n1997 Haute-Nendaz'),
  montant: degrade ? null : 2900,
  devise: 'CHF',
  numeroFacture: 'FAC-20260817-01',
  message: 'Facture FAC-20260817-01 - Mission de consulting culinaire',
});
console.log('validation :', validerQrFacture(donnees).join(' | ') || 'OK');

const qr = await pdfUtils._preparerQrFacture(donnees);
console.log(`QR : version ${qr.matrice.version}, ${qr.matrice.taille} modules`);
pdfUtils._dessinerQrFacture(faux, qr);
console.log(`${appels.length} opérations de dessin enregistrées`);

// ─── Vérifications ───
let ko = 0;
const proche = (obtenu, attendu, tol, label) => {
  const bon = Math.abs(obtenu - attendu) <= tol;
  if (!bon) ko += 1;
  console.log(`  ${bon ? 'ok    ' : 'ECHEC '} ${label} : ${obtenu.toFixed(3)} (attendu ${attendu} ± ${tol})`);
};
const vrai = (cond, label, extra = '') => {
  if (!cond) ko += 1;
  console.log(`  ${cond ? 'ok    ' : 'ECHEC '} ${label} ${extra}`);
};

const pas = 46 / qr.matrice.taille;
const modules = appels.filter((a) => a.type === 'rect' && a.couleur === '#000000' && a.h > 0 && Math.abs(a.h - pas) < 1e-9);
console.log('\n— Swiss QR Code —');
proche(Math.min(...modules.map((m) => m.x)), 67, 0.01, 'bord gauche');
proche(Math.max(...modules.map((m) => m.x + m.l)), 113, 0.01, 'bord droit');
proche(Math.min(...modules.map((m) => m.y)), 209, 0.01, 'bord haut');
proche(Math.max(...modules.map((m) => m.y + m.h)), 255, 0.01, 'bord bas');
vrai(modules.length < qr.matrice.taille ** 2 / 2, 'suites horizontales fusionnées', `(${modules.length} rectangles pour ${qr.matrice.taille ** 2} modules)`);

// Contrôle croisé module par module, dans les DEUX sens : aucun module noir
// oublié, aucun module blanc noirci. Les deux ensemble prouvent que le dessin
// est la matrice à l'identique - donc ni transposé, ni miroir, ni décalé, les
// trois façons de produire un code d'allure normale qui ne décode pas.
let manquants = 0;
let enTrop = 0;
for (let l = 0; l < qr.matrice.taille; l += 1) {
  for (let c = 0; c < qr.matrice.taille; c += 1) {
    const cx = 67 + (c + 0.5) * pas;
    const cy = 209 + (l + 0.5) * pas;
    const couvert = modules.some((m) => cx > m.x && cx < m.x + m.l && cy > m.y && cy < m.y + m.h);
    if (qr.matrice.estNoir(l, c)) { if (!couvert) manquants += 1; } else if (couvert) enTrop += 1;
  }
}
vrai(manquants === 0, 'tous les modules noirs sont dessinés', `(${manquants} manquant(s))`);
vrai(enTrop === 0, 'aucun module blanc noirci', `(${enTrop} en trop)`);

const blanc = appels.find((a) => a.type === 'rect' && a.couleur === '#ffffff' && Math.abs(a.l - 7) < 1e-9);
console.log('\n— Croix suisse —');
vrai(!!blanc, 'liseré blanc 7 × 7 mm présent');
proche(blanc.x + 3.5, 90, 0.01, 'centre x');
proche(blanc.y + 3.5, 232, 0.01, 'centre y');
const barres = appels.filter((a) => a.type === 'rect' && a.couleur === '#ffffff' && a.l < 5 && a.h < 5);
vrai(barres.length === 2, 'deux barres de croix', `(${barres.length})`);
proche(Math.min(barres[0].l, barres[0].h), 1.18, 0.01, 'épaisseur de barre (6/32 du carré)');
proche(Math.max(barres[0].l, barres[0].h), 3.94, 0.01, 'longueur de barre (20/32 du carré)');

const lignes = appels.filter((a) => a.type === 'ligne' && a.pointilles);
console.log('\n— Traits de découpe —');
vrai(lignes.length === 2, 'deux traits pointillés', `(${lignes.length})`);
vrai(lignes.some((l) => l.y1 === 192 && l.x1 === 0 && l.x2 === 210), 'horizontal sur toute la largeur à 192 mm');
vrai(lignes.some((l) => l.x1 === 62 && l.y1 === 192 && l.y2 === 297), 'vertical à 62 mm');

const textes = appels.filter((a) => a.type === 'texte');
console.log('\n— Rubriques imposées —');
// « Payable par » devient « Payable par (nom/adresse) » quand le débiteur est
// inconnu : la rubrique demande alors de remplir, elle ne constate plus.
['Récépissé', 'Section paiement', 'Compte / Payable à', 'Référence', 'Monnaie', 'Montant', 'Point de dépôt']
  .forEach((r) => vrai(textes.some((t) => t.txt === r), `« ${r} »`));
vrai(textes.some((t) => t.txt === (degrade ? 'Payable par (nom/adresse)' : 'Payable par')), '« Payable par »');
if (degrade) {
  // Coins d'angle : 4 coins × 2 segments × 4 champs (débiteur et montant, des
  // deux côtés du trait de découpe).
  const segments = appels.filter((a) => a.type === 'ligne' && !a.pointilles);
  vrai(segments.length === 32, 'champs vides marqués par des coins d’angle', `(${segments.length} segments)`);
  // La colonne gauche de la section paiement s'arrête à 118 mm : au-delà
  // commence le bloc informations, qu'un cadre vide ne doit pas traverser.
  const deborde = segments.filter((s) => s.x1 > 62 && s.x1 < 118 && Math.max(s.x1, s.x2) > 118.01);
  vrai(deborde.length === 0, 'cadres vides contenus dans leur colonne', `(${deborde.length} débordement(s))`);
  const horsRecepisse = segments.filter((s) => s.x1 < 62 && Math.max(s.x1, s.x2) > 57.01);
  vrai(horsRecepisse.length === 0, 'cadres du récépissé dans la marge', `(${horsRecepisse.length})`);
}
vrai(textes.filter((t) => t.txt === 'Compte / Payable à').every((t) => t.gras), 'rubriques en gras');
vrai(textes.some((t) => t.txt === 'Récépissé' && t.taille === 11), 'titres en 11 pt');

// Seuls les textes sont concernés : le trait de découpe vertical descend
// jusqu'au bord de la feuille, c'est son rôle.
const debordent = textes.filter((t) => t.y > 292.5);
vrai(debordent.length === 0, 'aucun texte sous la marge basse de 5 mm', `(${debordent.length})`);

const colonneMontant = textes.filter((t) => t.txt === 'Montant');
vrai(colonneMontant.every((t) => t.x - (t.x > 62 ? 67 : 5) >= 12), 'colonne Montant dégagée de « Monnaie »');

// ─── Rejeu en SVG puis en PNG, pour le contrôle à l'œil ───
const ECHELLE = 6;
const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${210 * ECHELLE}" height="${105 * ECHELLE}" viewBox="0 192 210 105">`,
  '<rect x="0" y="192" width="210" height="105" fill="#fff"/>'];
appels.forEach((a) => {
  if (a.type === 'rect') {
    svg.push(`<rect x="${a.x}" y="${a.y}" width="${a.l}" height="${a.h}" fill="${a.couleur}" shape-rendering="crispEdges"/>`);
  } else if (a.type === 'ligne') {
    svg.push(`<line x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}" stroke="${a.couleur}" stroke-width="${a.epaisseur || 0.2}"${a.pointilles ? ' stroke-dasharray="1 1"' : ''}/>`);
  } else {
    const ancre = a.align === 'right' ? 'end' : 'start';
    const echappe = a.txt.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    // baseline: 'top' de jsPDF → on descend d'une hauteur d'ascendante.
    svg.push(`<text x="${a.x}" y="${a.y + a.taille * 0.352778 * 0.79}" font-family="Helvetica, Arial, sans-serif" font-size="${a.taille * 0.352778}" font-weight="${a.gras ? 'bold' : 'normal'}" text-anchor="${ancre}" fill="#000">${echappe}</text>`);
  }
});
svg.push('</svg>');

const sortie = process.argv[2] || 'qr-facture.png';
await sharp(Buffer.from(svg.join('\n'))).png().toFile(sortie);
console.log(`\nimage : ${sortie}`);

console.log(ko === 0 ? '\n✅ cotes conformes\n' : `\n❌ ${ko} contrôle(s) en échec\n`);
process.exit(ko === 0 ? 0 : 1);
