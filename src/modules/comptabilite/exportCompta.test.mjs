// node --test : export de la Comptabilité pour la fiduciaire (exportCompta.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, unzipSync } from 'fflate';
import { csvFeuille, feuillesCompta, nomFichierCompta, NOMS_FEUILLES, titreCompta, xlsxCompta, zipCsvCompta } from './exportCompta.js';
import { synthese } from './syntheseCompta.js';
import { resumeVentes, ventesParJour } from './ventesCompta.js';
import { etatTva } from './tvaCompta.js';
import { coutPersonnel } from './personnelCompta.js';
import { periodeMois } from './periodesCompta.js';
import { csvFiduciaire, lignesFiduciaire, totauxFiduciaire } from '../inventaire/exportFiduciaire.js';

const doc = (o) => ({ typeDocument: 'facture', perimetre: 'Général', exclu: false, lignes: [], totalHT: null, totalTTC: null, tvaTaux: null, montantTva: null, regleLe: null, ...o });
const DOCS = [
  doc({ id: 'tg', fournisseurNom: 'Transgourmet', numero: 'TG-88412', dateDocument: '2026-10-06', totalHT: 1240.5, tvaTaux: 2.6, totalTTC: 1272.75, montantTva: 32.25 }),
  doc({ id: 'pr', fournisseurNom: 'Prodega', numero: 'PR-5531', dateDocument: '2026-10-10', totalHT: 860, tvaTaux: 2.6, totalTTC: 882.36, montantTva: 22.36 }),
  doc({ id: 'fv', fournisseurNom: '=Fellay Vins', numero: '2026-311', dateDocument: '2026-10-12', totalHT: 1450, tvaTaux: 8.1, totalTTC: 1567.45, montantTva: 117.45, regleLe: '2026-10-25' }),
  doc({ id: 'lv', fournisseurNom: 'Laiterie du Valais', dateDocument: '2026-10-26', totalTTC: 312.4 }),
  doc({ id: 'bl', fournisseurNom: 'Transgourmet', typeDocument: 'bon_livraison', dateDocument: '2026-10-05', totalHT: 1240.5 }),
  doc({ id: 'sep', fournisseurNom: 'Transgourmet', dateDocument: '2026-09-20', totalHT: 2105, tvaTaux: 2.6, totalTTC: 2159.73 }),
];
const CHARGES = [
  { id: 'c1', libelle: 'Loyer', categorie: 'loyer', montant: 6500, tvaTaux: 0, periodicite: 'mensuelle', debut: '2026-01-01', fin: null },
  { id: 'c2', libelle: 'Électricité et chauffage', categorie: 'energie', montant: 1450, tvaTaux: 8.1, periodicite: 'trimestrielle', debut: '2026-01-01', fin: null, fournisseur: 'Romande Énergie' },
];
const OCT = periodeMois('2026-10-01');
const APRES = '2026-11-15';

// Octobre passé : ventes de 20 jours, salaires de deux personnes nommées.
function donnees() {
  const manuel = [];
  for (let j = 1; j <= 20; j += 1) {
    const jour = `2026-10-${String(j).padStart(2, '0')}`;
    manuel.push({ jour, taux: 8.1, montantTtc: 1081 }, { jour, taux: 2.6, montantTtc: 102.6 });
  }
  const parJour = ventesParJour({ manuel, debut: OCT.debut, fin: OCT.fin });
  const ventes = resumeVentes({ parJour, joursOuverts: new Set(), debut: OCT.debut, finEffective: OCT.fin, aujourdhui: APRES });
  const personnel = coutPersonnel({
    personnes: ['karim', 'sarah'],
    salaires: [
      { id: 's1', profileId: 'karim', mode: 'mensuel', montant: 4950, treizieme: true, debut: '2026-01-01', fin: null },
      { id: 's2', profileId: 'sarah', mode: 'horaire', montant: 26.5, treizieme: false, debut: '2026-01-01', fin: null },
    ],
    shifts: [{ userId: 'sarah', date: '2026-10-03', debut: '17:00', fin: '23:30', pause: 30, pointageDebut: '17:00', pointageFin: '23:30' }],
    reglages: { chargesSocialesPct: 15 },
    debut: OCT.debut,
    fin: OCT.fin,
    aujourdhui: APRES,
  });
  const tva = etatTva({ ventes: parJour, docs: DOCS, charges: CHARGES, reglages: {}, debut: OCT.debut, fin: OCT.fin, aujourdhui: APRES });
  const s = synthese({ periode: OCT, aujourdhui: APRES, ventes, docs: DOCS, charges: CHARGES, personnel, inventaires: [], tva });
  const lignesAchats = lignesFiduciaire(DOCS, OCT);
  return { s, parJour, tva, lignesAchats };
}

const lireZip = (octets) => Object.fromEntries(Object.entries(unzipSync(octets)).map(([k, v]) => [k, strFromU8(v)]));
// Cellules d'une feuille OOXML, par référence : { A4: 'texte' | nombre }.
function cellules(xml) {
  const out = {};
  const re = /<c r="([A-Z]+\d+)" s="\d+"(?: t="inlineStr")?(?:\/>|>(?:<is><t xml:space="preserve">([\s\S]*?)<\/t><\/is>|<v>([^<]*)<\/v>)<\/c>)/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    if (m[2] !== undefined) out[m[1]] = m[2].replace(/&apos;/g, '\'').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    else if (m[3] !== undefined) out[m[1]] = Number(m[3]);
  }
  return out;
}
// Valeur de la colonne B de la ligne dont la colonne A vaut `libelle`.
const valeurDe = (c, libelle, colonne = 'B') => {
  const ref = Object.keys(c).find(k => /^A\d+$/.test(k) && c[k] === libelle);
  return ref ? c[`${colonne}${ref.slice(1)}`] : undefined;
};

test('noms de fichiers et titre', () => {
  assert.equal(nomFichierCompta('2026-10-01', '2026-10-31', 'xlsx'), 'comptabilite_2026-10-01_2026-10-31.xlsx');
  assert.equal(nomFichierCompta('2026-10-01', '2026-10-31', 'csv'), 'comptabilite_2026-10-01_2026-10-31_csv.zip');
  assert.equal(titreCompta('2026-10-01', '2026-10-31'), 'Comptabilité du 01.10.2026 au 31.10.2026');
});

test('classeur : cinq feuilles, le Résumé seul sélectionné, Résumé égal à la synthèse', () => {
  const { s, parJour, tva, lignesAchats } = donnees();
  const f = feuillesCompta({ periode: OCT, synthese: s, parJour, lignesAchats, etatTva: tva });
  const zip = lireZip(xlsxCompta(f, { date: new Date('2026-11-15T10:00:00Z') }));
  const noms = [...zip['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map(m => m[1].replace(/&apos;/g, '\''));
  assert.deepEqual(noms, NOMS_FEUILLES);
  assert.equal(Object.keys(zip).filter(k => /^xl\/worksheets\/sheet\d\.xml$/.test(k)).length, 5);
  assert.equal(Object.values(zip).filter(x => x.includes('tabSelected="1"')).length, 1);
  assert.ok(zip['xl/worksheets/sheet1.xml'].includes('tabSelected="1"'));
  // En-têtes figés sur chaque feuille.
  for (let i = 1; i <= 5; i += 1) assert.ok(zip[`xl/worksheets/sheet${i}.xml`].includes('state="frozen"'));

  const r = cellules(zip['xl/worksheets/sheet1.xml']);
  assert.equal(valeurDe(r, 'Chiffre d\'affaires hors TVA'), s.ca);
  assert.equal(valeurDe(r, 'Coût matière hors TVA'), s.matiere.ht);
  assert.equal(valeurDe(r, 'Marge brute'), s.margeBrute);
  assert.equal(valeurDe(r, 'Coût du personnel estimé'), s.personnel);
  assert.equal(valeurDe(r, 'Charges fixes hors TVA'), s.charges);
  assert.equal(valeurDe(r, 'Résultat d\'exploitation estimé'), s.resultat);
  assert.equal(valeurDe(r, 'TVA estimée à payer sur la période'), s.tvaEstimee);
  assert.equal(valeurDe(r, 'Coût matière en % du chiffre d\'affaires'), Math.round(s.ratios.matierePct * 100) / 100);
  assert.equal(typeof s.ca, 'number');
});

test('feuille Factures d\'achat = lignesFiduciaire ligne pour ligne ; État TVA = totauxFiduciaire', () => {
  const { s, parJour, tva, lignesAchats } = donnees();
  const f = feuillesCompta({ periode: OCT, synthese: s, parJour, lignesAchats, etatTva: tva });
  const zip = lireZip(xlsxCompta(f, { date: new Date('2026-11-15T10:00:00Z') }));
  const fac = cellules(zip['xl/worksheets/sheet3.xml']);
  const attendues = lignesFiduciaire(DOCS, OCT);
  assert.equal(attendues.length, 4);
  attendues.forEach((l, k) => {
    const n = 4 + k;
    assert.equal(fac[`A${n}`], l.date);
    assert.equal(fac[`B${n}`], l.fournisseur);
    assert.equal(fac[`K${n}`], l.ttc ?? undefined);
  });
  // Ligne de totaux juste après.
  assert.equal(fac[`B${4 + attendues.length}`], 'Total');

  const totaux = totauxFiduciaire(attendues);
  const t = cellules(zip['xl/worksheets/sheet5.xml']);
  const lignesAchat = Object.keys(t).filter(k => /^A\d+$/.test(k) && t[k] === 'Factures d\'achat');
  const parTaux = Object.fromEntries(lignesAchat.map(k => [t[`B${k.slice(1)}`], t[`D${k.slice(1)}`]]));
  assert.equal(parTaux[2.6], totaux.tva26);
  assert.equal(parTaux[8.1], totaux.tva81);
  assert.equal(parTaux[3.8], undefined);
  assert.equal(valeurDe(t, 'TVA estimée à payer', 'D'), tva.due);
  assert.equal(valeurDe(t, 'Total de l\'impôt préalable', 'D'), tva.prealable);
});

test('CSV : BOM, « ; », montants à deux décimales, formule désamorcée ; zip des cinq fichiers', () => {
  const { s, parJour, tva, lignesAchats } = donnees();
  const f = feuillesCompta({ periode: OCT, synthese: s, parJour, lignesAchats, etatTva: tva });
  const octets = zipCsvCompta(f, { date: new Date('2026-11-15T10:00:00Z') });
  const zip = lireZip(octets);
  assert.deepEqual(Object.keys(zip).sort(), ['charges-fixes.csv', 'etat-tva.csv', 'factures-achat.csv', 'resume.csv', 'ventes.csv']);
  // BOM UTF-8 en tête de chaque fichier (le décodage le retire : lu sur les octets).
  Object.values(unzipSync(octets)).forEach(u8 => assert.deepEqual([...u8.slice(0, 3)], [0xef, 0xbb, 0xbf]));
  assert.equal(zip['factures-achat.csv'], csvFiduciaire(lignesAchats).replace(/^﻿/, ''));
  assert.ok(zip['factures-achat.csv'].includes('\'=Fellay Vins'));
  const ventes = zip['ventes.csv'].replace(/^﻿/, '').split('\r\n');
  assert.equal(ventes[0], 'Date;Source;Sur place 8,1 % TTC;À l\'emporter 2,6 % TTC;Hébergement 3,8 % TTC;Autres taux TTC;Total TTC;dont notes de séjour');
  assert.equal(ventes[1], '01.10.2026;saisi;1081.00;102.60;;;1183.60;');
  assert.equal(ventes[21], '20 jours;Total;21620.00;2052.00;;;23672.00;');
  const charges = csvFeuille(f.charges).split('\r\n');
  assert.ok(charges[1].startsWith('Loyer;Loyer;par mois;6500.00;0.00;6500.00;6500.00;0.00;'));
});

test('aucun nom ni salaire de personne dans les octets du classeur ni des CSV', () => {
  const { s, parJour, tva, lignesAchats } = donnees();
  const f = feuillesCompta({ periode: OCT, synthese: s, parJour, lignesAchats, etatTva: tva });
  const textes = [
    ...Object.values(lireZip(xlsxCompta(f, { date: new Date('2026-11-15T10:00:00Z') }))),
    ...Object.values(lireZip(zipCsvCompta(f, { date: new Date('2026-11-15T10:00:00Z') }))),
  ].join('\n');
  ['karim', 'sarah', 'Karim', 'Sarah', '4950', '26.5', '26.50'].forEach(x => assert.ok(!textes.includes(x), x));
  // Le total du personnel, lui, y est.
  assert.ok(textes.includes(String(s.personnel)) || textes.includes(s.personnel.toFixed(2)));
});

test('hors direction : le coût du personnel est « réservé à la direction »', () => {
  const { s, parJour, tva, lignesAchats } = donnees();
  const f = feuillesCompta({ periode: OCT, synthese: { ...s, personnel: null }, parJour, lignesAchats, etatTva: tva, direction: false });
  const r = f.resume.rangs.find(x => x.cellules[0] === 'Coût du personnel estimé');
  assert.deepEqual(r.cellules.slice(1), [null, 'réservé à la direction']);
});

test('personnel partiel et TVA incomplète : le Résumé et l\'État TVA le disent', () => {
  const { s, parJour, tva, lignesAchats } = donnees();
  const incomplete = { ...tva, couverture: { avec: 1, attendus: 92 }, ventesCompletes: false };
  const s2 = { ...s, personnelPartiel: true, avantPersonnel: false, tvaComplete: false, tvaCouverture: { avec: 1, attendus: 92 } };
  const f = feuillesCompta({ periode: OCT, synthese: s2, parJour, lignesAchats, etatTva: incomplete });
  const res = f.resume.rangs.find(x => x.cellules[0] === 'Résultat d\'exploitation estimé');
  assert.ok(res.cellules[2].includes('personnel partiel'));
  const tvaRang = f.resume.rangs.find(x => x.cellules[0] === 'TVA estimée à payer sur la période');
  assert.ok(tvaRang.cellules[2].startsWith('TVA incomplète, chiffre d\'affaires connu 1 jours sur 92'));
  assert.ok(f.etatTva.rangs.some(x => x.cellules[0] === 'Chiffre d\'affaires connu 1 jours sur 92 : TVA incomplète.'));
  // Complète : aucune réserve.
  const f2 = feuillesCompta({ periode: OCT, synthese: s, parJour, lignesAchats, etatTva: { ...tva, couverture: { avec: 20, attendus: 20 }, ventesCompletes: true } });
  assert.ok(!f2.etatTva.rangs.some(x => String(x.cellules[0] || '').includes('TVA incomplète')));
});
