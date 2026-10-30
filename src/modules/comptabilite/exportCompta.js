// ─────────────────────────────────────────────────────────────────────────────
// Export de la Comptabilité pour la fiduciaire, sans React ni DOM (testé par
// node --test, exportCompta.test.mjs). Règle D19 de la spec.
//
// Cinq feuilles : Résumé (les chiffres de la synthèse, le coût du personnel en
// total seulement, jamais par personne), Ventes (une ligne par jour, TVA
// comprise par taux), Factures d'achat (la feuille de l'export fiduciaire des
// achats, telle quelle), Charges fixes (réparties sur la période) et État TVA.
// Deux sorties : un classeur Excel (en-têtes figés, montants en nombres) et un
// zip de fichiers CSV au même format fr_CH que l'export des achats (UTF-8 avec
// BOM, « ; » entre les colonnes, « . » décimal, dates JJ.MM.AAAA).
//
// Le classeur reprend les styles, cellules et la feuille des factures de
// exportFiduciaire.js : mêmes montants que l'export des achats par
// construction. Rien ici n'est une écriture comptable.
// ─────────────────────────────────────────────────────────────────────────────

import { strToU8, zipSync } from 'fflate';
import {
  STYLES, cNum, cStr, cVide, col, csvFiduciaire, esc, feuilleFactures, totauxFiduciaire,
} from '../inventaire/exportFiduciaire.js';
import { round2 } from '../inventaire/tvaAchats.js';
import { libelleCategorie, parPeriodicite } from './chargesFixes.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const dateCH = (iso) => (ISO.test(String(iso || '')) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
const tauxTexte = (t) => `${String(t).replace('.', ',')} %`;
const nombre = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const NOMS_TAUX = { 8.1: 'Sur place', 2.6: 'À l\'emporter', 3.8: 'Hébergement' };
const TAUX_VENTES = ['8.1', '2.6', '3.8'];

export const PIED_EXPORT = 'La comptabilité de l\'app prépare vos chiffres et vos pièces pour la fiduciaire. Elle ne tient pas les comptes et n\'établit ni le décompte TVA officiel ni les salaires.';

export const nomFichierCompta = (debut, fin, sorte) => (sorte === 'csv'
  ? `comptabilite_${debut}_${fin}_csv.zip`
  : `comptabilite_${debut}_${fin}.xlsx`);

export const titreCompta = (debut, fin) => `Comptabilité du ${dateCH(debut)} au ${dateCH(fin)}`;

// Une feuille générique : colonnes [{ titre, montant, largeur }] et rangs
// [{ cellules, fort }] ; une cellule null reste vide.
const rang = (cellules, fort = false) => ({ cellules, fort });
const vide = () => rang([]);

// ── Résumé ──
function feuilleResume({ s, direction }) {
  const v = s.ventes || {};
  const jours = v.jours || { manuel: 0, pos: 0, notes: 0 };
  const sources = [
    jours.manuel ? `saisi à la main ${jours.manuel} jours` : null,
    jours.pos ? `caisse ${jours.pos} jours` : null,
    v.notesTtc ? `notes de séjour CHF ${v.notesTtc.toFixed(2)}` : null,
  ].filter(Boolean).join(', ');
  const m = s.matiere;
  const stock = m.stock || {};
  const personnelDetail = !direction ? 'réservé à la direction'
    : s.personnel == null ? 'pas encore estimé'
      : 'estimé, charges sociales comprises ; aucune fiche de salaire';
  const pct = (p) => (p == null ? null : round2(p));
  const rangs = [
    rang(['Chiffre d\'affaires hors TVA', s.ca, sources]),
    rang(['Chiffre d\'affaires TVA comprise', v.ttc ?? null, '']),
    ...(v.parTaux || []).map(t => rang([`   dont ${NOMS_TAUX[t.taux] || 'autre taux'} ${tauxTexte(t.taux)}, hors TVA`, t.ht, `TVA ${t.tva.toFixed(2)}`])),
    rang(['Coût matière hors TVA', m.ht, `${m.factures} factures d'achat${m.sansHt ? `, dont ${m.sansHt} comptées TVA comprise faute de montant hors TVA` : ''}${m.bons ? ` ; ${m.bons} bons non additionnés` : ''}`]),
    rang(['   dont achats hors TVA', m.achatsHt, '']),
    rang(['   dont variation de stock', m.variationStock,
      stock.mode === 'inventaire' ? `inventaires validés du ${dateCH(stock.dateDebut)} et du ${dateCH(stock.dateFin)}`
        : stock.mode === 'manque' ? 'pas d\'inventaire au début ou à la fin' : 'sans variation de stock']),
    rang(['Marge brute', s.margeBrute, ''], true),
    rang(['Coût du personnel estimé', s.personnel, personnelDetail]),
    rang(['Charges fixes hors TVA', s.charges, s.chargesDetail ? `${s.chargesDetail.lignes.length} charges réparties par mois` : 'pas encore lues']),
    rang(['Résultat d\'exploitation estimé', s.resultat, [
      s.avantPersonnel ? 'avant personnel' : null, s.personnelPartiel ? 'personnel partiel' : null, s.avantCharges ? 'avant charges fixes' : null,
    ].filter(Boolean).join(', ')], true),
    rang(['Coût matière en % du chiffre d\'affaires', pct(s.ratios.matierePct), '']),
    rang(['Coût du personnel en % du chiffre d\'affaires', pct(s.ratios.personnelPct), '']),
    rang(['TVA estimée à payer sur la période', s.tvaEstimee, [
      s.tvaComplete === false && s.tvaCouverture
        ? `TVA incomplète, chiffre d'affaires connu ${s.tvaCouverture.avec} jours sur ${s.tvaCouverture.attendus}` : null,
      'estimation ; la fiduciaire établit le décompte officiel',
    ].filter(Boolean).join(' ; ')]),
  ];
  if (s.prorata) rangs.push(rang(['Période en cours', null, `au prorata des jours écoulés, ${s.prorata.ecoules} sur ${s.prorata.total}`]));
  if (s.manques?.length) {
    rangs.push(vide(), rang(['Pour des chiffres justes', null, null], true));
    s.manques.forEach(x => rangs.push(rang([x.texte, null, null])));
  }
  rangs.push(vide(), rang([PIED_EXPORT, null, null]));
  return {
    nom: 'Résumé',
    colonnes: [
      { titre: 'Rubrique', largeur: 48 },
      { titre: 'Montant (CHF)', montant: true, largeur: 16 },
      { titre: 'Détail', largeur: 70 },
    ],
    rangs,
  };
}

// ── Ventes ──
function feuilleVentes(parJour) {
  const jours = (parJour || []).filter(j => j.source || j.avecNotes);
  const autres = (j) => {
    const x = Object.entries(j.parTaux || {}).filter(([k]) => !TAUX_VENTES.includes(k)).map(([, val]) => val);
    return x.length ? round2(x.reduce((a, b) => a + b, 0)) : null;
  };
  const lignes = jours.map(j => [
    dateCH(j.jour),
    [j.source === 'manuel' ? 'saisi' : j.source === 'pos' ? 'caisse' : null, j.avecNotes ? 'notes de séjour' : null].filter(Boolean).join(', '),
    ...TAUX_VENTES.map(k => nombre(j.parTaux?.[k])),
    autres(j),
    j.ttc,
    j.avecNotes ? j.notesTtc : null,
  ]);
  const somme = (i) => {
    const valeurs = lignes.map(l => l[i]).filter(x => x != null);
    return valeurs.length ? round2(valeurs.reduce((a, b) => a + b, 0)) : null;
  };
  const total = [`${jours.length} jours`, 'Total', somme(2), somme(3), somme(4), somme(5), somme(6), somme(7)];
  return {
    nom: 'Ventes',
    colonnes: [
      { titre: 'Date', largeur: 11 },
      { titre: 'Source', largeur: 22 },
      { titre: 'Sur place 8,1 % TTC', montant: true, largeur: 14 },
      { titre: 'À l\'emporter 2,6 % TTC', montant: true, largeur: 14 },
      { titre: 'Hébergement 3,8 % TTC', montant: true, largeur: 14 },
      { titre: 'Autres taux TTC', montant: true, largeur: 13 },
      { titre: 'Total TTC', montant: true, largeur: 13 },
      { titre: 'dont notes de séjour', montant: true, largeur: 14 },
    ],
    rangs: [...lignes.map(l => rang(l)), rang(total, true)],
  };
}

// ── Charges fixes ──
function feuilleCharges(detail) {
  const lignes = (detail?.lignes || []).map(({ charge: c, ttc, ht, tva }) => [
    c.libelle || '', libelleCategorie(c.categorie), parPeriodicite(c.periodicite), nombre(c.montant), nombre(c.tvaTaux) ?? 0,
    ttc, ht, tva, c.fournisseur || '', dateCH(c.debut), dateCH(c.fin),
  ]);
  const total = ['Total', `${lignes.length} charges`, null, null, null, detail?.ttc ?? null, detail?.ht ?? null, detail?.tva ?? null, null, null, null];
  return {
    nom: 'Charges fixes',
    colonnes: [
      { titre: 'Libellé', largeur: 30 },
      { titre: 'Catégorie', largeur: 14 },
      { titre: 'Périodicité', largeur: 14 },
      { titre: 'Montant par échéance TTC', montant: true, largeur: 14 },
      { titre: 'Taux de TVA (%)', montant: true, largeur: 10 },
      { titre: 'Sur la période TTC', montant: true, largeur: 13 },
      { titre: 'Hors TVA', montant: true, largeur: 12 },
      { titre: 'TVA', montant: true, largeur: 11 },
      { titre: 'Fournisseur', largeur: 24 },
      { titre: 'Depuis le', largeur: 11 },
      { titre: 'Jusqu\'au', largeur: 11 },
    ],
    rangs: [...lignes.map(l => rang(l)), rang(total, true)],
  };
}

// ── État TVA ──
function feuilleTva(e) {
  const rangs = [];
  if (!e) {
    rangs.push(rang(['État TVA non disponible', null, null, null]));
  } else if (e.methode === 'tdfn') {
    rangs.push(
      rang(['Méthode : taux de la dette fiscale nette, décompte par semestre', null, null, null], true),
      rang(['Chiffre d\'affaires TVA comprise', null, e.ventes.ttc, null]),
      rang(['Taux de la dette fiscale nette', e.tauxTdfn, null, null]),
      rang(['TVA estimée à payer', null, null, e.due], true),
    );
  } else {
    const a = e.achats.totaux;
    rangs.push(
      rang(['Méthode effective, décompte par trimestre', null, null, null], true),
      vide(),
      rang(['TVA sur les ventes', null, null, null], true),
      ...e.ventes.parTaux.map(t => rang([NOMS_TAUX[t.taux] || 'Autre taux', t.taux, t.ht, t.tva])),
      rang(['Total des ventes', null, e.ventes.ht, e.ventes.tva], true),
      vide(),
      rang(['Impôt préalable', null, null, null], true),
      rang(['Factures d\'achat', 2.6, null, a.tva26]),
      rang(['Factures d\'achat', 8.1, null, a.tva81]),
      rang(['Factures d\'achat', 3.8, null, a.tva38]),
      rang(['Factures d\'achat, autre taux', null, null, a.tvaAutre]),
      ...e.charges.map(c => rang(['Charges fixes (estimé)', c.taux, null, c.tva])),
      rang(['Total de l\'impôt préalable', null, null, e.prealable], true),
      vide(),
      rang(['TVA estimée à payer', null, null, e.due], true),
    );
    if (e.achats.nonDeduites) rangs.push(rang([`${e.achats.nonDeduites} factures d'achat sans taux ne sont pas déduites : à vérifier dans Factures & achats.`, null, null, null]));
  }
  if (e && e.couverture && e.ventesCompletes === false) {
    rangs.push(vide(), rang([`Chiffre d'affaires connu ${e.couverture.avec} jours sur ${e.couverture.attendus} : TVA incomplète.`, null, null, null], true));
  }
  rangs.push(vide(), rang(['Estimation pour préparer le décompte : votre fiduciaire établit le décompte officiel.', null, null, null]));
  return {
    nom: 'État TVA',
    colonnes: [
      { titre: 'Rubrique', largeur: 46 },
      { titre: 'Taux (%)', montant: true, largeur: 10 },
      { titre: 'Base hors TVA', montant: true, largeur: 15 },
      { titre: 'TVA', montant: true, largeur: 13 },
    ],
    rangs,
  };
}

//   periode      : { debut, fin } de l'export
//   synthese     : synthese(...) de syntheseCompta.js pour cette période
//   parJour      : jours de ventesParJour de la période
//   lignesAchats : lignesFiduciaire(docs, { debut, fin })
//   charges      : chargesSurPeriode(...) (par défaut celui de la synthèse)
//   etatTva      : etatTva(...) de la période
//   direction    : le coût du personnel n'est porté que pour la direction
export function feuillesCompta({ periode, synthese: s, parJour = [], lignesAchats = [], charges, etatTva = null, direction = true }) {
  return {
    debut: periode.debut,
    fin: periode.fin,
    titre: titreCompta(periode.debut, periode.fin),
    resume: feuilleResume({ s, direction }),
    ventes: feuilleVentes(parJour),
    factures: lignesAchats,
    charges: feuilleCharges(charges === undefined ? s.chargesDetail : charges),
    etatTva: feuilleTva(etatTva),
  };
}

// ── Classeur ──

// Styles d'exportFiduciaire : 0 défaut, 1 en-tête, 2 texte, 3 montant,
// 4 total texte, 5 total montant.
function feuilleXml(f, titre, selectionnee) {
  const rows = [`<row r="1" ht="22" customHeight="1">${cStr('A1', 0, `${f.nom} : ${titre}`)}</row>`];
  rows.push(`<row r="3" ht="30" customHeight="1">${f.colonnes.map((c, i) => cStr(`${col(i)}3`, 1, c.titre)).join('')}</row>`);
  f.rangs.forEach((r, k) => {
    const n = 4 + k;
    if (!r.cellules.length) { rows.push(`<row r="${n}"/>`); return; }
    rows.push(`<row r="${n}">${f.colonnes.map((c, i) => {
      const ref = `${col(i)}${n}`;
      const v = r.cellules[i];
      if (c.montant && typeof v === 'number') return cNum(ref, r.fort ? 5 : 3, v);
      if (v == null || v === '') return cVide(ref, r.fort ? 4 : (c.montant ? 3 : 2));
      return cStr(ref, r.fort ? 4 : 2, String(v));
    }).join('')}</row>`);
  });
  const derniere = col(f.colonnes.length - 1);
  const fin = 3 + f.rangs.length;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${derniere}${Math.max(fin, 3)}"/>
<sheetViews><sheetView${selectionnee ? ' tabSelected="1"' : ''} workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A4" sqref="A4"/></sheetView></sheetViews>
<sheetFormatPr defaultColWidth="12" defaultRowHeight="15"/>
<cols>${f.colonnes.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.largeur || 12}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rows.join('')}</sheetData>
<pageMargins left="0.5" right="0.5" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

export const NOMS_FEUILLES = ['Résumé', 'Ventes', 'Factures d\'achat', 'Charges fixes', 'État TVA'];

// Octets du .xlsx. `date` : horodatage du classeur, à fixer dans un test
// pour des octets reproductibles.
export function xlsxCompta(feuilles, { date = new Date() } = {}) {
  const t = feuilles.titre;
  const xml = [
    feuilleXml(feuilles.resume, t, true),
    feuilleXml(feuilles.ventes, t, false),
    // La feuille des factures de l'export fiduciaire, sélectionnée là-bas
    // parce qu'elle y est seule : ici, seul le Résumé l'est.
    feuilleFactures(feuilles.factures, `Factures d'achat : ${t}`).replace(' tabSelected="1"', ''),
    feuilleXml(feuilles.charges, t, false),
    feuilleXml(feuilles.etatTva, t, false),
  ];
  const fichiers = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${xml.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
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
<dc:title>${esc(t)}</dc:title><dc:creator>Samper Consulting</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${date.toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created>
</cp:coreProperties>`,
    'docProps/app.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Samper Consulting</Application></Properties>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView activeTab="0"/></bookViews>
<sheets>${NOMS_FEUILLES.map((nom, i) => `<sheet name="${esc(nom)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
<calcPr calcId="191029"/>
</workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${xml.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${xml.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    'xl/styles.xml': STYLES,
  };
  xml.forEach((x, i) => { fichiers[`xl/worksheets/sheet${i + 1}.xml`] = x; });
  const entrees = {};
  Object.entries(fichiers).forEach(([chemin, contenu]) => { entrees[chemin] = [strToU8(contenu), { mtime: date }]; });
  return zipSync(entrees, { level: 6 });
}

// ── CSV ──

// Même garde que l'export des achats : un texte qui commence par = + - @ ou
// une tabulation deviendrait une formule dans Excel, il est précédé d'une
// apostrophe.
const celluleCsv = (v, montant) => {
  if (v == null || v === '') return '';
  if (montant && typeof v === 'number') return v.toFixed(2);
  const brut = String(v);
  const s = /^[=+\-@\t\r]/.test(brut) ? `'${brut}` : brut;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function csvFeuille(f) {
  const lignes = [
    f.colonnes.map(c => celluleCsv(c.titre)).join(';'),
    ...f.rangs.map(r => f.colonnes.map((c, i) => celluleCsv(r.cellules[i], c.montant)).join(';')),
  ];
  return '﻿' + lignes.join('\r\n') + '\r\n';
}

// Zip des cinq feuilles en CSV : resume.csv, ventes.csv, factures-achat.csv
// (l'export des achats tel quel), charges-fixes.csv, etat-tva.csv.
export function zipCsvCompta(feuilles, { date = new Date() } = {}) {
  const fichiers = {
    'resume.csv': csvFeuille(feuilles.resume),
    'ventes.csv': csvFeuille(feuilles.ventes),
    'factures-achat.csv': csvFiduciaire(feuilles.factures),
    'charges-fixes.csv': csvFeuille(feuilles.charges),
    'etat-tva.csv': csvFeuille(feuilles.etatTva),
  };
  const entrees = {};
  Object.entries(fichiers).forEach(([nom, texte]) => { entrees[nom] = [strToU8(texte), { mtime: date }]; });
  return zipSync(entrees, { level: 6 });
}

// Totaux de la feuille des factures (pour l'aperçu et les tests).
export const totauxAchatsExport = (feuilles) => totauxFiduciaire(feuilles.factures);
