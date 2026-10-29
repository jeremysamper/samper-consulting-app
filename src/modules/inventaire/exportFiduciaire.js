// ─────────────────────────────────────────────────────────────────────────────
// Export fiduciaire des factures d'achat, sans React ni DOM (testé par node
// --test, exportFiduciaire.test.mjs).
//
// Une ligne par facture d'achat non exclue dont la date tombe dans l'intervalle,
// tous périmètres confondus, puis une ligne de totaux. La TVA est ventilée par
// taux (2,6 %, 8,1 %, 3,8 %, autre taux avec le taux indiqué à côté) : la
// fiduciaire reporte chaque colonne dans son compte de TVA déductible. Rien
// n'est une écriture comptable : c'est la pré-comptabilité du terrain, les
// montants lus sur les pièces et vérifiés par l'équipe.
//
// Trois sorties : lignes (objets), CSV (fr_CH : UTF-8 avec BOM pour Excel,
// « ; » entre les colonnes, « . » décimal, dates JJ.MM.AAAA) et classeur Excel
// écrit en OOXML et zippé par fflate, sur le modèle de exportXlsxInventaire.js
// (ce fichier n'est pas repris ici : une branche en cours le modifie, et le
// classeur fiduciaire n'a besoin ni de ses formules ni de ses styles).
// ─────────────────────────────────────────────────────────────────────────────

import { zipSync, strToU8 } from 'fflate';
import { estFacture, libelleMode } from './facturesLogic.js';
import { libelleTaux, montantTvaDepuisTotaux, round2, tvaAVerifier } from './tvaAchats.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const nombre = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const dateCH = (iso) => (ISO.test(String(iso || '')) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
const perimetreDe = (d) => (d.perimetre || '').trim() || 'Général';

// Colonnes, dans l'ordre du fichier. « TVA autre » porte le montant, « Taux
// autre » le taux correspondant (un taux étranger, ou un ancien taux suisse).
export const COLONNES = [
  'Date', 'Fournisseur', 'Numéro', 'Périmètre', 'HT',
  'TVA 2,6 %', 'TVA 8,1 %', 'TVA 3,8 %', 'TVA autre', 'Taux autre',
  'TTC', 'Échéance', 'Réglée le', 'Mode', 'Note', 'Pièce', 'À vérifier',
];
// Clés des lignes, alignées sur COLONNES.
const CLES = [
  'date', 'fournisseur', 'numero', 'perimetre', 'ht',
  'tva26', 'tva81', 'tva38', 'tvaAutre', 'tauxAutre',
  'ttc', 'echeance', 'regleLe', 'mode', 'note', 'piece', 'aVerifier',
];
const NUMERIQUES = new Set(['ht', 'tva26', 'tva81', 'tva38', 'tvaAutre', 'tauxAutre', 'ttc']);
const TOTALISEES = ['ht', 'tva26', 'tva81', 'tva38', 'tvaAutre', 'ttc'];

// ── Intervalles ──

// Premier et dernier jour du mois de `iso`, décalé de `decalage` mois
// (0 = mois en cours, -1 = mois précédent).
export function intervalleMois(iso, decalage = 0) {
  if (!ISO.test(String(iso || ''))) return null;
  const a = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1 + decalage;
  const debut = new Date(Date.UTC(a, m, 1));
  const fin = new Date(Date.UTC(a, m + 1, 0));
  return { debut: debut.toISOString().slice(0, 10), fin: fin.toISOString().slice(0, 10) };
}

export function dansIntervalle(date, { debut, fin }) {
  if (!ISO.test(String(date || ''))) return false;
  if (debut && date < debut) return false;
  if (fin && date > fin) return false;
  return true;
}

// ── Lignes ──

// `pieces` : Map id de facture -> nombre de pièces conservées (optionnel) ; la
// colonne « Pièce » donne le nom de fichier gardé à l'import, sinon ce nombre.
export function lignesFiduciaire(factures, { debut, fin, pieces } = {}) {
  const retenues = (factures || []).filter(d => estFacture(d) && !d.exclu && dansIntervalle(d.dateDocument, { debut, fin }));
  retenues.sort((a, b) => String(a.dateDocument).localeCompare(String(b.dateDocument))
    || String(a.fournisseurNom || '').localeCompare(String(b.fournisseurNom || ''), 'fr')
    || String(a.numero || '').localeCompare(String(b.numero || ''), 'fr'));
  return retenues.map(d => {
    const taux = nombre(d.tvaTaux);
    const tva = nombre(d.montantTva) ?? montantTvaDepuisTotaux(d).montantTva;
    const colonneTva = taux === 2.6 ? 'tva26' : taux === 8.1 ? 'tva81' : taux === 3.8 ? 'tva38' : 'tvaAutre';
    const nbPieces = pieces instanceof Map ? pieces.get(d.id) : null;
    const l = {
      id: d.id,
      date: dateCH(d.dateDocument),
      fournisseur: d.fournisseurNom || '',
      numero: d.numero || '',
      perimetre: perimetreDe(d),
      ht: nombre(d.totalHT),
      tva26: null, tva81: null, tva38: null, tvaAutre: null, tauxAutre: null,
      ttc: nombre(d.totalTTC),
      echeance: dateCH(d.dateEcheance),
      regleLe: dateCH(d.regleLe),
      mode: libelleMode(d.regleMode),
      note: d.regleNote || '',
      piece: d.nomFichier || (nbPieces ? `${nbPieces} ${nbPieces > 1 ? 'pièces' : 'pièce'}` : ''),
      aVerifier: tvaAVerifier(d) ? 'oui' : '',
    };
    // Un taux 0 ou absent sans TVA : la colonne « autre » reste vide.
    if (tva != null && (taux !== 0 || tva !== 0)) l[colonneTva] = tva;
    if (colonneTva === 'tvaAutre' && taux != null && taux !== 0) l.tauxAutre = taux;
    return l;
  });
}

export function totauxFiduciaire(lignes) {
  const t = { fournisseur: 'Total', n: lignes.length };
  TOTALISEES.forEach(k => {
    const valeurs = lignes.map(l => l[k]).filter(v => v != null);
    t[k] = valeurs.length ? round2(valeurs.reduce((s, v) => s + v, 0)) : null;
  });
  return t;
}

// ── CSV (fr_CH) ──

// Un texte lu sur une pièce (fournisseur, numéro, note) qui commence par
// = + - @ ou une tabulation deviendrait une formule à l'ouverture dans Excel :
// il est précédé d'une apostrophe, qui le garde en texte. Le classeur Excel
// n'en a pas besoin, ses textes sont des cellules inlineStr jamais évaluées.
const cellule = (v, numerique) => {
  if (v == null || v === '') return '';
  if (numerique) return Number(v).toFixed(2);
  const brut = String(v);
  const s = /^[=+\-@\t\r]/.test(brut) ? `'${brut}` : brut;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function csvFiduciaire(lignes) {
  const t = totauxFiduciaire(lignes);
  const rangs = [
    COLONNES.join(';'),
    ...lignes.map(l => CLES.map(k => cellule(l[k], NUMERIQUES.has(k))).join(';')),
    CLES.map(k => (k === 'fournisseur' ? 'Total' : k === 'numero' ? `${t.n} ${t.n > 1 ? 'factures' : 'facture'}` : TOTALISEES.includes(k) ? cellule(t[k], true) : '')).join(';'),
  ];
  return '﻿' + rangs.join('\r\n') + '\r\n';
}

// ── Classeur Excel (OOXML, une feuille) ──

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const col = (i) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));
const num = (n) => String(+Number(n).toFixed(6));
const cStr = (ref, s, texte) => `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(texte)}</t></is></c>`;
const cNum = (ref, s, n) => `<c r="${ref}" s="${s}"><v>${num(n)}</v></c>`;
const cVide = (ref, s) => `<c r="${ref}" s="${s}"/>`;
const LARGEURS = [11, 30, 14, 14, 12, 11, 11, 11, 11, 10, 12, 11, 11, 14, 28, 26, 10];

// Styles : 0 défaut, 1 en-tête, 2 texte, 3 montant, 4 total texte, 5 total montant.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="10"/><name val="Arial"/><family val="2"/></font><font><b/><sz val="10"/><name val="Arial"/><family val="2"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF1"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFC8CE"/></left><right style="thin"><color rgb="FFBFC8CE"/></right><top style="thin"><color rgb="FFBFC8CE"/></top><bottom style="thin"><color rgb="FFBFC8CE"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function feuilleFactures(lignes, titre) {
  const t = totauxFiduciaire(lignes);
  const rows = [];
  rows.push(`<row r="1" ht="22" customHeight="1">${cStr('A1', 0, titre)}</row>`);
  rows.push(`<row r="3" ht="30" customHeight="1">${COLONNES.map((h, i) => cStr(`${col(i)}3`, 1, h)).join('')}</row>`);
  lignes.forEach((l, k) => {
    const r = 4 + k;
    rows.push(`<row r="${r}">${CLES.map((cle, i) => {
      const ref = `${col(i)}${r}`;
      if (NUMERIQUES.has(cle)) return l[cle] == null ? cVide(ref, 3) : cNum(ref, 3, l[cle]);
      return l[cle] ? cStr(ref, 2, l[cle]) : cVide(ref, 2);
    }).join('')}</row>`);
  });
  const rt = 4 + lignes.length;
  rows.push(`<row r="${rt}">${CLES.map((cle, i) => {
    const ref = `${col(i)}${rt}`;
    if (cle === 'fournisseur') return cStr(ref, 4, 'Total');
    if (cle === 'numero') return cStr(ref, 4, `${t.n} ${t.n > 1 ? 'factures' : 'facture'}`);
    if (TOTALISEES.includes(cle)) return t[cle] == null ? cVide(ref, 5) : cNum(ref, 5, t[cle]);
    return cVide(ref, 4);
  }).join('')}</row>`);
  const derniere = col(CLES.length - 1);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${derniere}${rt}"/>
<sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A4" sqref="A4"/></sheetView></sheetViews>
<sheetFormatPr defaultColWidth="12" defaultRowHeight="15"/>
<cols>${LARGEURS.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rows.join('')}</sheetData>
<autoFilter ref="A3:${derniere}${Math.max(rt - 1, 3)}"/>
<pageMargins left="0.5" right="0.5" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

// Octets du .xlsx. `date` : horodatage du classeur (par défaut maintenant),
// à fixer dans un test pour obtenir des octets reproductibles.
export function xlsxFiduciaire(lignes, titre, { date = new Date() } = {}) {
  const fichiers = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
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
<dc:title>${esc(titre)}</dc:title><dc:creator>Samper Consulting</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${date.toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created>
</cp:coreProperties>`,
    'docProps/app.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Samper Consulting</Application></Properties>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView activeTab="0"/></bookViews>
<sheets><sheet name="Factures d'achat" sheetId="1" r:id="rId1"/></sheets>
<calcPr calcId="191029"/>
</workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    'xl/styles.xml': STYLES,
    'xl/worksheets/sheet1.xml': feuilleFactures(lignes, titre),
  };
  const entrees = {};
  // Horodatage fixé dans le zip aussi : deux appels à la même date donnent les mêmes octets.
  Object.entries(fichiers).forEach(([chemin, xml]) => { entrees[chemin] = [strToU8(xml), { mtime: date }]; });
  return zipSync(entrees, { level: 6 });
}

// ── Noms de fichiers et de dossiers ──

// « Transgourmet », « n° 170587 » : dossier ASCII sûr pour le zip des pièces.
export const slugFiduciaire = (texte, repli) => {
  const s = String(texte || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return s || repli;
};

// <AAAA-MM>/<date>_<fournisseur>_<numero> : dossier d'une facture dans le zip.
export const dossierPiece = (f) => {
  const date = ISO.test(String(f.dateDocument || '')) ? f.dateDocument : 'sans-date';
  const mois = date === 'sans-date' ? date : date.slice(0, 7);
  return `${mois}/${date}_${slugFiduciaire(f.fournisseurNom, 'fournisseur-non-lu')}_${slugFiduciaire(f.numero, 'sans-numero')}`;
};

export const nomFichierExport = (debut, fin, extension) => `factures-achat_${debut}_${fin}.${extension}`;

// Titre du classeur : « Factures d'achat du 01.10.2026 au 31.10.2026 ».
export const titreExport = (debut, fin) => `Factures d'achat du ${dateCH(debut)} au ${dateCH(fin)}`;
