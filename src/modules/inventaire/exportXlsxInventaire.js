// ─────────────────────────────────────────────────────────────────────────────
// Export Excel de l'état d'inventaire, au format du classeur remis aux
// établissements (Le Rucher, août 2026) : feuille « Inventaire <périmètre> »
// et feuille « Synthèse <périmètre> », formules comprises.
//
// SheetJS (déjà dans le projet) n'écrit pas les styles dans sa version
// communautaire : le classeur est donc écrit directement en OOXML et zippé
// avec fflate (déjà présent, c'est le moteur de compression de jsPDF). Les
// index de styles reprennent ceux du classeur modèle, cellule pour cellule.
// ─────────────────────────────────────────────────────────────────────────────

import { zipSync, strToU8 } from 'fflate';
import { INVENTAIRE_MODELE as M } from '../../design/brandTokens.js';
import { agregerPar } from './etatInventaire.js';
import { SANS_ZONE } from './zones.js';

const argb = (hex) => 'FF' + hex.replace('#', '').toUpperCase();
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Caractères de contrôle interdits en XML 1.0 (collage depuis un PDF...).
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const col = (i) => String.fromCharCode(65 + i);
const num = (n) => (Number.isFinite(n) ? String(+n.toFixed(6)) : '0');

// Nom de feuille Excel : 31 caractères, sans []:*?/\ .
export const nomFeuille = (prefixe, perimetre) => `${prefixe} ${String(perimetre || '').toLocaleLowerCase('fr')}`
  .replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim();
const refFeuille = (nom) => `'${nom.replace(/'/g, "''")}'`;

// ── Cellules ──
const cStr = (ref, s, texte) => `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(texte)}</t></is></c>`;
const cNum = (ref, s, n) => `<c r="${ref}" s="${s}"><v>${num(n)}</v></c>`;
const cVide = (ref, s) => `<c r="${ref}" s="${s}"/>`;
// Formule avec sa valeur en cache : un aperçu (iPad, Mail) qui ne recalcule
// pas affiche quand même les bons chiffres.
const cForm = (ref, s, f, valeur) => (valeur === '' || valeur == null
  ? `<c r="${ref}" s="${s}" t="str"><f>${esc(f)}</f><v></v></c>`
  : `<c r="${ref}" s="${s}"><f>${esc(f)}</f><v>${num(valeur)}</v></c>`);
const ligne = (r, cellules, ht) => `<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cellules.join('')}</row>`;

// ── Styles : mêmes index que le classeur modèle ──
const STYLES = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="General"/><numFmt numFmtId="165" formatCode="General"/><numFmt numFmtId="166" formatCode="#,##0.00;\\-#,##0.00;\\-"/></numFmts>
<fonts count="14">
<font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="10"/><name val="Arial"/><family val="2"/></font>
<font><sz val="10"/><name val="Arial"/><family val="2"/></font>
<font><sz val="10"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>
<font><i/><sz val="9"/><color rgb="${argb(M.note)}"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FF000000"/><name val="Arial"/><family val="2"/></font>
<font><sz val="9"/><color rgb="${argb(M.note)}"/><name val="Arial"/><family val="2"/></font>
<font><sz val="9"/><color rgb="${argb(M.source)}"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>
<font><i/><sz val="9"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FF000000"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FF000000"/><name val="Arial"/><family val="2"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${argb(M.titre)}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${argb(M.entete)}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${argb(M.zebra)}"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="${argb(M.filet)}"/></left><right style="thin"><color rgb="${argb(M.filet)}"/></right><top style="thin"><color rgb="${argb(M.filet)}"/></top><bottom style="thin"><color rgb="${argb(M.filet)}"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="29">${[
    // [numFmt, font, fill, border, horizontal, vertical, wrap]
    [164, 0, 0, 0, 'general', 'bottom', 0], //  0 défaut
    [164, 1, 0, 0, 'general', 'bottom', 0], //  1 colonnes
    [164, 4, 2, 0, 'center', 'center', 0],  //  2 titre
    [164, 5, 0, 0, 'general', 'bottom', 0], //  3 note (non utilisée)
    [164, 6, 3, 1, 'center', 'center', 1],  //  4 en-tête inventaire
    [164, 7, 4, 1, 'general', 'center', 0], //  5 texte, ligne crème
    [164, 8, 4, 1, 'general', 'center', 0], //  6 conditionnement, crème
    [164, 7, 4, 1, 'center', 'bottom', 0],  //  7 qté reçue, crème
    [164, 7, 0, 1, 'center', 'bottom', 0],  //  8 sortie
    [165, 7, 0, 1, 'center', 'bottom', 0],  //  9 nombre centré
    [166, 7, 0, 1, 'general', 'center', 0], // 10 montant
    [164, 9, 4, 1, 'general', 'center', 0], // 11 sources, crème
    [164, 7, 0, 1, 'general', 'center', 0], // 12 texte, ligne blanche
    [164, 8, 0, 1, 'general', 'center', 0], // 13 conditionnement, blanc
    [164, 9, 0, 1, 'general', 'center', 0], // 14 sources, blanc
    [164, 0, 2, 1, 'general', 'bottom', 0], // 15 total, vide
    [164, 10, 2, 1, 'general', 'bottom', 0], // 16 « TOTAL »
    [165, 10, 2, 1, 'center', 'bottom', 0], // 17 nb de références
    [164, 11, 2, 1, 'general', 'bottom', 0], // 18 « références »
    [166, 10, 2, 1, 'general', 'bottom', 0], // 19 total CHF
    [164, 5, 0, 0, 'general', 'center', 1], // 20 note (non utilisée)
    [164, 12, 0, 0, 'general', 'bottom', 0], // 21 titre de bloc
    [164, 6, 3, 1, 'center', 'bottom', 1],  // 22 en-tête synthèse
    [164, 7, 0, 1, 'general', 'bottom', 0], // 23 libellé synthèse
    [166, 7, 0, 1, 'general', 'bottom', 0], // 24 montant synthèse
    [164, 13, 4, 1, 'general', 'bottom', 0], // 25 « Total »
    [165, 13, 4, 1, 'center', 'bottom', 0], // 26 total nombre
    [166, 13, 4, 1, 'general', 'bottom', 0], // 27 total CHF
    [164, 6, 3, 1, 'center', 'bottom', 0],  // 28 en-tête documents
  ].map(([nf, f, fi, b, h, v, w]) => `<xf numFmtId="${nf}" fontId="${f}" fillId="${fi}" borderId="${b}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${h}" vertical="${v}"${w ? ' wrapText="1"' : ''}/></xf>`).join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// ── Feuille « Inventaire » ──
const ENTETES = ['Zone', 'Catégorie', 'Produit', 'Conditionnement', 'Qté reçue', 'Unité', 'Sortie', 'Stock actuel',
  "Valeur d'achat (CHF)", 'PU moyen (CHF)', 'Valeur stock (CHF)', 'Fournisseur(s) et documents'];
export const LARGEURS = [14, 24, 34, 26, 11, 14, 9, 12, 15, 14, 15, 89.71];
// Styles des lignes de données : [ligne crème, ligne blanche] par colonne.
const STYLES_LIGNE = [
  [5, 5, 5, 6, 7, 5, 8, 9, 10, 10, 10, 11],
  [12, 12, 12, 13, 9, 12, 8, 9, 10, 10, 10, 14],
];

function feuilleInventaire(etat) {
  const premiere = 4;
  const derniere = premiere + etat.lignes.length - 1;
  const rows = [];
  rows.push(ligne(1, [cStr('A1', 2, etat.titre), ...LARGEURS.slice(1).map((_, i) => cVide(`${col(i + 1)}1`, 2))], 25.5));
  rows.push(ligne(3, ENTETES.map((h, i) => cStr(`${col(i)}3`, 4, h)), 30));
  etat.lignes.forEach((l, k) => {
    const r = premiere + k;
    const s = STYLES_LIGNE[k % 2];
    const pu = l.qteRecue ? l.valeurAchat / l.qteRecue : '';
    rows.push(ligne(r, [
      l.zone ? cStr(`A${r}`, s[0], l.zone) : cVide(`A${r}`, s[0]),
      cStr(`B${r}`, s[1], l.categorie),
      cStr(`C${r}`, s[2], l.produit),
      l.conditionnement ? cStr(`D${r}`, s[3], l.conditionnement) : cVide(`D${r}`, s[3]),
      cNum(`E${r}`, s[4], l.qteRecue),
      cStr(`F${r}`, s[5], l.unite),
      cNum(`G${r}`, s[6], l.sortie),
      cForm(`H${r}`, s[7], `E${r}-G${r}`, l.stockActuel),
      cNum(`I${r}`, s[8], l.valeurAchat),
      cForm(`J${r}`, s[9], `IF(E${r}=0,"",I${r}/E${r})`, pu),
      cForm(`K${r}`, s[10], `IF(E${r}=0,"",J${r}*H${r})`, l.qteRecue ? pu * l.stockActuel : ''),
      l.sources ? cStr(`L${r}`, s[11], l.sources) : cVide(`L${r}`, s[11]),
    ], 15.75));
  });
  const rt = derniere + 1;
  const plage = (c) => `${c}${premiere}:${c}${Math.max(derniere, premiere)}`;
  rows.push(ligne(rt, [
    cVide(`A${rt}`, 15), cVide(`B${rt}`, 15), cStr(`C${rt}`, 16, 'TOTAL'), cVide(`D${rt}`, 15),
    cForm(`E${rt}`, 17, `COUNTA(${plage('C')})`, etat.totaux.references), cStr(`F${rt}`, 18, 'références'),
    cVide(`G${rt}`, 15), cVide(`H${rt}`, 15),
    cForm(`I${rt}`, 19, `SUM(${plage('I')})`, etat.totaux.valeurAchat), cVide(`J${rt}`, 15),
    cForm(`K${rt}`, 19, `SUM(${plage('K')})`, etat.totaux.valeurStock), cVide(`L${rt}`, 15),
  ], 15.75));

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:L${rt}"/>
<sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A4" sqref="A4"/></sheetView></sheetViews>
<sheetFormatPr defaultColWidth="14.43" defaultRowHeight="15"/>
<cols>${LARGEURS.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1" style="1"/>`).join('')}</cols>
<sheetData>${rows.join('')}</sheetData>
<autoFilter ref="A3:L${Math.max(derniere, 3)}"/>
<mergeCells count="1"><mergeCell ref="A1:L1"/></mergeCells>
<conditionalFormatting sqref="G${premiere}:G${Math.max(derniere, premiere)}"><cfRule type="colorScale" priority="1"><colorScale><cfvo type="min"/><cfvo type="max"/><color rgb="FFFFFFFF"/><color rgb="FF57BB8A"/></colorScale></cfRule></conditionalFormatting>
<pageMargins left="0.605" right="0.605" top="0.469" bottom="0.469" header="0.512" footer="0.512"/>
<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

// ── Feuille « Synthèse » ──
function feuilleSynthese(etat, nomInventaire, derniereLigne) {
  const inv = refFeuille(nomInventaire);
  const plage = (c) => `${inv}!$${c}$4:$${c}$${derniereLigne}`;
  const rows = [];
  let r = 1;
  rows.push(ligne(r, [cStr('A1', 2, etat.titreSynthese), cVide('B1', 2), cVide('C1', 2), cVide('D1', 2)], 25.5));
  r = 3;

  const bloc = (titre, entete, valeurs, colonne, champ) => {
    rows.push(ligne(r, [cStr(`A${r}`, 21, titre)])); r += 1;
    rows.push(ligne(r, [entete, 'Nb de références', "Valeur d'achat (CHF)", 'Valeur stock (CHF)'].map((h, i) => cStr(`${col(i)}${r}`, 22, h)))); r += 1;
    const debut = r;
    valeurs.forEach(v => {
      // Produits sans zone : cellule vide dans l'inventaire, critère "" ici.
      const critere = champ === 'zone' && v === SANS_ZONE ? '""' : `A${r}`;
      const a = agregerPar(etat, champ, v);
      rows.push(ligne(r, [
        cStr(`A${r}`, 23, v),
        cForm(`B${r}`, 9, `COUNTIF(${plage(colonne)},${critere})`, a.references),
        cForm(`C${r}`, 24, `SUMIF(${plage(colonne)},${critere},${plage('I')})`, a.valeurAchat),
        cForm(`D${r}`, 24, `SUMIF(${plage(colonne)},${critere},${plage('K')})`, a.valeurStock),
      ], 15.75));
      r += 1;
    });
    const fin = r - 1;
    const somme = (c, v) => cForm(`${c}${r}`, c === 'B' ? 26 : 27, `SUM(${c}${debut}:${c}${fin})`, v);
    rows.push(ligne(r, [cStr(`A${r}`, 25, 'Total'), somme('B', etat.totaux.references), somme('C', etat.totaux.valeurAchat), somme('D', etat.totaux.valeurStock)], 15.75));
    r += 2;
  };
  bloc('Zone de stockage', 'Zone de stockage', etat.zones, 'A', 'zone');
  bloc('Catégorie', 'Catégorie', etat.categories, 'B', 'categorie');

  rows.push(ligne(r, [cStr(`A${r}`, 21, 'Documents intégrés')])); r += 1;
  rows.push(ligne(r, ['Document', 'Date', 'Fournisseur'].map((h, i) => cStr(`${col(i)}${r}`, 28, h)), 15.75)); r += 1;
  etat.documents.forEach(d => {
    rows.push(ligne(r, [cStr(`A${r}`, 23, d.document), cStr(`B${r}`, 23, d.date), cStr(`C${r}`, 23, d.fournisseur)], 15.75));
    r += 1;
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="A1:D${r - 1}"/>
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultColWidth="14.43" defaultRowHeight="15"/>
<cols>${[34, 16, 22, 20].map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1" style="1"/>`).join('')}</cols>
<sheetData>${rows.join('')}</sheetData>
<mergeCells count="1"><mergeCell ref="A1:D1"/></mergeCells>
<pageMargins left="0.75" right="0.75" top="1" bottom="1" header="0.512" footer="0.512"/>
<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="1"/>
</worksheet>`;
}

// Construit le classeur (Uint8Array du .xlsx).
export function construireXlsxInventaire(etat) {
  const nomInv = nomFeuille('Inventaire', etat.perimetre);
  let nomSyn = nomFeuille('Synthèse', etat.perimetre);
  if (nomSyn === nomInv) nomSyn = `${nomSyn.slice(0, 28)} 2`;
  const derniere = Math.max(4 + etat.lignes.length - 1, 4);

  const fichiers = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${esc(etat.titre)}</dc:title><dc:creator>Samper Consulting</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created>
</cp:coreProperties>`,
    'docProps/app.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Samper Consulting</Application></Properties>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView activeTab="0"/></bookViews>
<sheets><sheet name="${esc(nomInv)}" sheetId="1" r:id="rId1"/><sheet name="${esc(nomSyn)}" sheetId="2" r:id="rId2"/></sheets>
<definedNames>
<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${esc(refFeuille(nomInv))}!$A$3:$L$${derniere}</definedName>
<definedName name="_xlnm.Print_Titles" localSheetId="0">${esc(refFeuille(nomInv))}!$1:$3</definedName>
</definedNames>
<calcPr calcId="191029" fullCalcOnLoad="1"/>
</workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    'xl/styles.xml': STYLES(),
    'xl/worksheets/sheet1.xml': feuilleInventaire(etat),
    'xl/worksheets/sheet2.xml': feuilleSynthese(etat, nomInv, derniere),
  };
  const entrees = {};
  Object.entries(fichiers).forEach(([chemin, xml]) => { entrees[chemin] = strToU8(xml); });
  return zipSync(entrees, { level: 6 });
}

export function telechargerFichier(octets, nom, type) {
  const blob = new Blob([octets], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Laisser le temps au navigateur (Safari surtout) de lire le blob.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
