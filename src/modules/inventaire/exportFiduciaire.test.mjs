// node --test : export fiduciaire des factures d'achat (exportFiduciaire.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import {
  COLONNES, lignesFiduciaire, totauxFiduciaire, csvFiduciaire, xlsxFiduciaire,
  intervalleMois, dansIntervalle, dossierPiece, slugFiduciaire, nomFichierExport, titreExport,
} from './exportFiduciaire.js';

const facture = (id, patch) => ({
  id, etablissementId: 'etab-r', perimetre: 'Cuisine', typeDocument: 'facture', exclu: false,
  fournisseurNom: 'Fournisseur', numero: '', dateDocument: null, totalHT: null, totalTTC: null, tvaTaux: null, montantTva: null,
  dateEcheance: null, regleLe: null, regleMode: '', regleNote: '', nomFichier: '', lignes: [], ...patch,
});

// A, B, D, I dans l'intervalle, C sur la borne de fin ; E (bon), F (hors
// intervalle), G (sans date), H (exclue) n'y entrent pas.
const DOCS = [
  facture('A', { dateDocument: '2026-10-05', fournisseurNom: 'Transgourmet', numero: '170587', totalHT: 443, totalTTC: 454.5, tvaTaux: 2.6, montantTva: 11.5, dateEcheance: '2026-11-04', regleLe: '2026-10-20', regleMode: 'virement', regleNote: 'Réf 123', nomFichier: 'tg.pdf' }),
  facture('B', { dateDocument: '2026-10-12', fournisseurNom: 'Aligro', numero: '55', perimetre: 'Boissons', totalHT: 1000, totalTTC: 1081, tvaTaux: 8.1, montantTva: 81 }),
  facture('C', { dateDocument: '2026-10-31', fournisseurNom: 'Boucherie "Du Coin"; SA', numero: '9', totalHT: null, totalTTC: 200, tvaTaux: 2.6 }),
  facture('D', { dateDocument: '2026-10-01', fournisseurNom: 'Hôtel des Alpes', numero: 'H-1', totalHT: 500, totalTTC: 519, tvaTaux: 3.8, montantTva: 19 }),
  facture('E', { dateDocument: '2026-10-15', typeDocument: 'bon_livraison', fournisseurNom: 'Transgourmet', numero: 'BL-1', totalHT: 80 }),
  facture('F', { dateDocument: '2026-09-30', fournisseurNom: 'Aligro', numero: '54', totalHT: 300, totalTTC: 307.8, tvaTaux: 2.6, montantTva: 7.8 }),
  facture('G', { dateDocument: null, fournisseurNom: 'Sans date', numero: 'X', totalHT: 10, totalTTC: 10.26, tvaTaux: 2.6 }),
  facture('H', { dateDocument: '2026-10-20', fournisseurNom: 'Doublon', numero: '170587', exclu: true, totalHT: 443, totalTTC: 454.5, tvaTaux: 2.6 }),
  facture('I', { dateDocument: '2026-10-22', fournisseurNom: 'Importateur', numero: 'IMP-7', totalHT: 100, totalTTC: 107.7, tvaTaux: 7.7, montantTva: 7.7 }),
];
const INTERVALLE = { debut: '2026-10-01', fin: '2026-10-31' };

test('une ligne par facture non exclue de l\'intervalle, bornes incluses, sans date et bons écartés, triée par date puis fournisseur', () => {
  const lignes = lignesFiduciaire(DOCS, INTERVALLE);
  assert.deepEqual(lignes.map(l => l.id), ['D', 'A', 'B', 'I', 'C']);
  assert.deepEqual(lignes.map(l => l.date), ['01.10.2026', '05.10.2026', '12.10.2026', '22.10.2026', '31.10.2026']);
});

test('bornes : le 31.10 entre, le 01.11 et le 30.09 non ; une date vide jamais', () => {
  assert.equal(dansIntervalle('2026-10-31', INTERVALLE), true);
  assert.equal(dansIntervalle('2026-10-01', INTERVALLE), true);
  assert.equal(dansIntervalle('2026-11-01', INTERVALLE), false);
  assert.equal(dansIntervalle('2026-09-30', INTERVALLE), false);
  assert.equal(dansIntervalle(null, INTERVALLE), false);
  assert.equal(dansIntervalle('2026-10-15', { debut: null, fin: null }), true);
});

test('TVA ventilée par taux : 2,6 ; 8,1 ; 3,8 ; autre avec son taux ; estimée quand un total manque', () => {
  const parId = Object.fromEntries(lignesFiduciaire(DOCS, INTERVALLE).map(l => [l.id, l]));
  assert.equal(parId.A.tva26, 11.5); assert.equal(parId.A.tva81, null);
  assert.equal(parId.B.tva81, 81); assert.equal(parId.B.tva26, null);
  assert.equal(parId.D.tva38, 19);
  assert.equal(parId.I.tvaAutre, 7.7); assert.equal(parId.I.tauxAutre, 7.7);
  // C : HT non lu, TTC 200 à 2,6 % : HT estimé 194.93, TVA 5.07, à vérifier.
  assert.equal(parId.C.tva26, 5.07);
  assert.equal(parId.C.ht, null);
  assert.equal(parId.C.ttc, 200);
  assert.equal(parId.C.aVerifier, 'oui');
  assert.equal(parId.A.aVerifier, '');
});

test('colonnes du fichier : la liste de D5, taux autre à côté du montant autre', () => {
  assert.deepEqual(COLONNES, [
    'Date', 'Fournisseur', 'Numéro', 'Périmètre', 'HT',
    'TVA 2,6 %', 'TVA 8,1 %', 'TVA 3,8 %', 'TVA autre', 'Taux autre',
    'TTC', 'Échéance', 'Réglée le', 'Mode', 'Note', 'Pièce', 'À vérifier',
  ]);
});

test('règlement, pièce et périmètre repris sur la ligne', () => {
  const [, a, b] = lignesFiduciaire(DOCS, { ...INTERVALLE, pieces: new Map([['B', 2]]) });
  assert.equal(a.regleLe, '20.10.2026'); assert.equal(a.mode, 'Virement'); assert.equal(a.note, 'Réf 123');
  assert.equal(a.echeance, '04.11.2026'); assert.equal(a.piece, 'tg.pdf'); assert.equal(a.perimetre, 'Cuisine');
  assert.equal(b.regleLe, ''); assert.equal(b.mode, ''); assert.equal(b.piece, '2 pièces'); assert.equal(b.perimetre, 'Boissons');
});

test('ligne de totaux : HT, chaque TVA, TTC ; une colonne sans valeur reste vide', () => {
  const t = totauxFiduciaire(lignesFiduciaire(DOCS, INTERVALLE));
  assert.equal(t.n, 5);
  assert.equal(t.ht, 2043);
  assert.equal(t.tva26, 16.57);
  assert.equal(t.tva81, 81);
  assert.equal(t.tva38, 19);
  assert.equal(t.tvaAutre, 7.7);
  assert.equal(t.ttc, 2362.2);
  assert.equal(totauxFiduciaire([]).ht, null);
});

test('CSV fr_CH : BOM, point-virgule, point décimal à deux décimales, guillemets doublés, fins de ligne CRLF', () => {
  const csv = csvFiduciaire(lignesFiduciaire(DOCS, INTERVALLE));
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  const rangs = csv.slice(1).split('\r\n');
  assert.equal(rangs[0], COLONNES.join(';'));
  assert.equal(rangs.length, 1 + 5 + 1 + 1); // en-tête, 5 lignes, totaux, vide final
  assert.equal(rangs[2], '05.10.2026;Transgourmet;170587;Cuisine;443.00;11.50;;;;;454.50;04.11.2026;20.10.2026;Virement;Réf 123;tg.pdf;');
  assert.equal(rangs[5], '31.10.2026;"Boucherie ""Du Coin""; SA";9;Cuisine;;5.07;;;;;200.00;;;;;;oui');
  assert.equal(rangs[6], ';Total;5 factures;;2043.00;16.57;81.00;19.00;7.70;;2362.20;;;;;;');
});

test('CSV : un texte lu qui commence par = + - @ reste du texte (apostrophe), les montants non', () => {
  const docs = [
    facture('X1', { dateDocument: '2026-10-03', fournisseurNom: '=HYPERLINK("http://x";"y")', numero: '-12', totalHT: 10, totalTTC: 10.26, tvaTaux: 2.6, montantTva: 0.26, regleNote: '@note' }),
    facture('X2', { dateDocument: '2026-10-04', fournisseurNom: '+Fournisseur', numero: 'A-1', totalHT: -5, totalTTC: -5.13, tvaTaux: 2.6, montantTva: -0.13 }),
  ];
  const rangs = csvFiduciaire(lignesFiduciaire(docs, INTERVALLE)).slice(1).split('\r\n');
  assert.equal(rangs[1], '03.10.2026;"\'=HYPERLINK(""http://x"";""y"")";\'-12;Cuisine;10.00;0.26;;;;;10.26;;;;\'@note;;');
  assert.equal(rangs[2], '04.10.2026;\'+Fournisseur;A-1;Cuisine;-5.00;-0.13;;;;;-5.13;;;;;;');
});

test('CSV d\'une liste vide : en-tête et ligne de totaux seulement', () => {
  const rangs = csvFiduciaire([]).slice(1).split('\r\n');
  assert.equal(rangs[0], COLONNES.join(';'));
  assert.equal(rangs[1], ';Total;0 facture;;;;;;;;;;;;;;');
});

test('classeur Excel : zip OOXML complet, montants en cellules numériques, texte en inlineStr, octets reproductibles à date fixée', () => {
  const lignes = lignesFiduciaire(DOCS, INTERVALLE);
  const date = new Date('2026-10-29T10:00:00Z');
  const a = xlsxFiduciaire(lignes, 'Factures test', { date });
  const b = xlsxFiduciaire(lignes, 'Factures test', { date });
  assert.deepEqual(Array.from(a), Array.from(b));
  const entrees = unzipSync(a);
  assert.deepEqual(Object.keys(entrees).sort(), [
    '[Content_Types].xml', '_rels/.rels', 'docProps/app.xml', 'docProps/core.xml',
    'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml',
  ]);
  const feuille = strFromU8(entrees['xl/worksheets/sheet1.xml']);
  assert.match(feuille, /<c r="K5" s="3"><v>454.5<\/v><\/c>/);             // TTC de A, numérique
  assert.match(feuille, /<c r="B5" s="2" t="inlineStr"><is><t xml:space="preserve">Transgourmet<\/t><\/is><\/c>/);
  assert.match(feuille, /<c r="E9" s="5"><v>2043<\/v><\/c>/);              // total HT
  assert.match(feuille, /Boucherie &quot;Du Coin&quot;; SA/);               // échappement XML
  assert.doesNotMatch(feuille, /t="inlineStr"><is><t[^>]*>454\.5</);        // jamais un montant en texte
  assert.match(strFromU8(entrees['xl/workbook.xml']), /<sheet name="Factures d'achat"/);
  assert.match(strFromU8(entrees['docProps/core.xml']), /2026-10-29T10:00:00Z/);
});

test('intervalle du mois : en cours, précédent, et février bissextile', () => {
  assert.deepEqual(intervalleMois('2026-10-29', 0), { debut: '2026-10-01', fin: '2026-10-31' });
  assert.deepEqual(intervalleMois('2026-10-29', -1), { debut: '2026-09-01', fin: '2026-09-30' });
  assert.deepEqual(intervalleMois('2026-01-15', -1), { debut: '2025-12-01', fin: '2025-12-31' });
  assert.deepEqual(intervalleMois('2028-02-10', 0), { debut: '2028-02-01', fin: '2028-02-29' });
  assert.equal(intervalleMois('', 0), null);
});

test('dossiers du zip : ASCII sûr, accents retirés, repli sans fournisseur ni numéro', () => {
  assert.equal(dossierPiece(DOCS[3]), '2026-10/2026-10-01_Hotel_des_Alpes_H-1');
  assert.equal(dossierPiece(DOCS[2]), '2026-10/2026-10-31_Boucherie_Du_Coin_SA_9');
  assert.equal(dossierPiece(facture('Z', { dateDocument: null, fournisseurNom: '', numero: '' })), 'sans-date/sans-date_fournisseur-non-lu_sans-numero');
  assert.equal(slugFiduciaire('Épicerie fine « Le Cèdre » n° 12/2026', 'x'), 'Epicerie_fine_Le_Cedre_n_12_2026');
  assert.equal(nomFichierExport('2026-10-01', '2026-10-31', 'csv'), 'factures-achat_2026-10-01_2026-10-31.csv');
  assert.equal(titreExport('2026-10-01', '2026-10-31'), 'Factures d\'achat du 01.10.2026 au 31.10.2026');
});
