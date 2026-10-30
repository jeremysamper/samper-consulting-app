// node --test : relevés bancaires et rapprochement de la Comptabilité (rapprochement.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  apparier, avecCles, cleLigne, etatBanque, facturesProches, indicesRapprochement, lireCamt053, lireCsvBancaire,
  lireDateBancaire, lireNombreBancaire, lireReleve, lireXml,
} from './rapprochement.js';

// ── Relevé camt.053 d'exemple, deux versions de balises ──
const entete = (ns) => `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:${ns}"><BkToCstmrStmt>
<GrpHdr><MsgId>MSG-1</MsgId><CreDtTm>2026-10-30T06:00:00</CreDtTm></GrpHdr>`;
const bal = (cd, montant, ind, date) => `<Bal><Tp><CdOrPrtry><Cd>${cd}</Cd></CdOrPrtry></Tp><Amt Ccy="CHF">${montant}</Amt><CdtDbtInd>${ind}</CdtDbtInd><Dt><Dt>${date}</Dt></Dt></Bal>`;

// Version 001.08 : <Sts><Cd>, <Cdtr><Pty><Nm>.
function ntry08({ ref, montant, ind, date, nom, ustrd, scor, info, txs }) {
  const partie = ind === 'DBIT' ? 'Cdtr' : 'Dbtr';
  const tx = (t) => `<TxDtls><Refs>${t.ref ? `<AcctSvcrRef>${t.ref}</AcctSvcrRef>` : ''}</Refs>${t.montant != null ? `<Amt Ccy="CHF">${t.montant}</Amt><CdtDbtInd>${t.ind || ind}</CdtDbtInd>` : ''}`
    + `<RltdPties><${partie}><Pty><Nm>${t.nom}</Nm></Pty></${partie}></RltdPties>`
    + `<RmtInf>${t.ustrd ? `<Ustrd>${t.ustrd}</Ustrd>` : ''}${t.scor ? `<Strd><CdtrRefInf><Tp><CdOrPrtry><Prtry>QRR</Prtry></CdOrPrtry></Tp><Ref>${t.scor}</Ref></CdtrRefInf></Strd>` : ''}</RmtInf></TxDtls>`;
  const details = txs ? txs.map(tx).join('') : tx({ nom, ustrd, scor });
  return `<Ntry>${ref ? `<NtryRef>${ref}</NtryRef>` : ''}<Amt Ccy="CHF">${montant}</Amt><CdtDbtInd>${ind}</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts>`
    + `<BookgDt><Dt>${date}</Dt></BookgDt><ValDt><Dt>${date}</Dt></ValDt>${ref ? `<AcctSvcrRef>${ref}</AcctSvcrRef>` : ''}`
    + `<NtryDtls>${details}</NtryDtls>${info ? `<AddtlNtryInf>${info}</AddtlNtryInf>` : ''}</Ntry>`;
}

// Scénario de la feuille de route (6.9) : 7 lignes, dont deux paiements
// regroupés dans une seule écriture de l'e-banking.
const RELEVE_BANC = `${entete('camt.053.001.08')}<Stmt><Id>STMT-1</Id>
<FrToDt><FrDtTm>2026-09-29T00:00:00</FrDtTm><ToDtTm>2026-10-29T23:59:59</ToDtTm></FrToDt>
<Acct><Id><IBAN>CH93 0076 2011 6238 5295 7</IBAN></Id><Ccy>CHF</Ccy></Acct>
${bal('OPBD', '18450.20', 'CRDT', '2026-09-29')}${bal('CLBD', '15113.33', 'CRDT', '2026-10-29')}
${ntry08({ ref: 'BK-001', montant: '1059.38', ind: 'DBIT', date: '2026-09-30', nom: 'FELLAY VINS SA', info: 'LSV+ DEBIT DIRECT' })}
${ntry08({ ref: 'BK-002', montant: '2159.73', ind: 'DBIT', date: '2026-10-10', nom: 'TRANSGOURMET SCHWEIZ AG', scor: '210000000003139471430009017' })}
${ntry08({ ref: 'BK-003', montant: '1272.75', ind: 'DBIT', date: '2026-10-22', nom: 'TWINT', ustrd: 'TWINT ACHAT PRIVE' })}
${ntry08({ ref: 'BK-004', montant: '1567.45', ind: 'DBIT', date: '2026-10-25', nom: 'FELLAY VINS SA', ustrd: 'Facture 2026-311', scor: 'RF18539007547034' })}
${ntry08({ ref: 'BK-005', montant: '4312.80', ind: 'CRDT', date: '2026-10-27', nom: 'SIX Payment Services AG', ustrd: 'Decompte cartes 26.10' })}
${ntry08({ ref: 'BK-006', montant: '1590.36', ind: 'DBIT', date: '2026-10-29', info: 'ORDRE GROUPE E-BANKING', txs: [
    { ref: 'BK-006-1', montant: '882.36', nom: 'Prodega Cash + Carry', ustrd: 'PR-5531' },
    { ref: 'BK-006-2', montant: '708.00', nom: 'Boucherie du Village', ustrd: 'Viande semaine 43' },
  ] })}
</Stmt></BkToCstmrStmt></Document>`;

// Les factures du banc (stub.js, restaurant etab-r) au 30.10.2026.
const doc = (o) => ({ typeDocument: 'facture', perimetre: 'Général', exclu: false, lignes: [], totalHT: null, totalTTC: null, tvaTaux: null, montantTva: null, regleLe: null, dateEcheance: null, ...o });
const FACTURES = [
  doc({ id: 'tg', fournisseurNom: 'Transgourmet', numero: 'TG-88412', dateDocument: '2026-10-06', totalTTC: 1272.75, dateEcheance: '2026-11-05' }),
  doc({ id: 'pr', fournisseurNom: 'Prodega', numero: 'PR-5531', dateDocument: '2026-10-10', totalTTC: 882.36, dateEcheance: '2026-10-27' }),
  doc({ id: 'fv', fournisseurNom: 'Fellay Vins', numero: '2026-311', dateDocument: '2026-10-12', totalTTC: 1567.45, dateEcheance: '2026-11-11', regleLe: '2026-10-25' }),
  doc({ id: 'bv', fournisseurNom: 'Boucherie du Village', numero: '1187', dateDocument: '2026-10-21', totalTTC: 708.15, dateEcheance: '2026-11-20' }),
  doc({ id: 'lv', fournisseurNom: 'Laiterie du Valais', numero: 'L-2219', dateDocument: '2026-10-26', totalTTC: 312.4, dateEcheance: '2026-11-25' }),
  doc({ id: 'bl', fournisseurNom: 'Transgourmet', numero: 'BL-88412', typeDocument: 'bon_livraison', dateDocument: '2026-10-05', totalHT: 1240.5 }),
  doc({ id: 'tg0', fournisseurNom: 'Transgourmet', numero: 'TG-87120', dateDocument: '2026-09-20', totalTTC: 2159.73, dateEcheance: '2026-10-20', regleLe: '2026-10-10' }),
  doc({ id: 'fv0', fournisseurNom: 'Fellay Vins', numero: '2026-288', dateDocument: '2026-09-15', totalTTC: 1059.38, dateEcheance: '2026-10-15', regleLe: '2026-09-30' }),
  doc({ id: 're', fournisseurNom: 'Romande Énergie', numero: 'RE-2026-09', dateDocument: '2026-10-18', totalTTC: 1450, dateEcheance: '2026-11-17' }),
];

test('camt.053.001.08 : compte, période, soldes, montants signés, contrepartie et référence', () => {
  const r = lireCamt053(RELEVE_BANC);
  assert.equal(r.format, 'camt053');
  assert.equal(r.iban, 'CH9300762011623852957');
  assert.deepEqual([r.dateDebut, r.dateFin, r.soldeDebut, r.soldeFin], ['2026-09-29', '2026-10-29', 18450.2, 15113.33]);
  assert.equal(r.lignes.length, 7);
  const fellay = r.lignes.find(l => l.cle === 'BK-004');
  assert.deepEqual(
    [fellay.dateOperation, fellay.montant, fellay.contrepartie, fellay.reference, fellay.libelle],
    ['2026-10-25', -1567.45, 'FELLAY VINS SA', 'RF18539007547034', 'Facture 2026-311'],
  );
  const six = r.lignes.find(l => l.montant > 0);
  assert.deepEqual([six.montant, six.contrepartie], [4312.8, 'SIX Payment Services AG']);
  // Le solde de fin égale le solde de début plus les mouvements.
  const somme = r.lignes.reduce((s, l) => s + l.montant, 0);
  assert.equal(Math.round((r.soldeDebut + somme) * 100) / 100, r.soldeFin);
});

test('camt.053.001.04 : <Sts>BOOK</Sts>, <Cdtr><Nm>, préfixe d\'espace de noms, écriture en attente passée', () => {
  const xml = `<?xml version="1.0"?><ns2:Document xmlns:ns2="urn:iso:std:iso:20022:tech:xsd:camt.053.001.04"><ns2:BkToCstmrStmt><ns2:Stmt>
<ns2:Acct><ns2:Id><ns2:IBAN>CH5604835012345678009</ns2:IBAN></ns2:Id></ns2:Acct>
<ns2:Bal><ns2:Tp><ns2:CdOrPrtry><ns2:Cd>OPBD</ns2:Cd></ns2:CdOrPrtry></ns2:Tp><ns2:Amt Ccy="CHF">120.50</ns2:Amt><ns2:CdtDbtInd>DBIT</ns2:CdtDbtInd><ns2:Dt><ns2:Dt>2026-10-01</ns2:Dt></ns2:Dt></ns2:Bal>
<ns2:Ntry><ns2:Amt Ccy="CHF">250.00</ns2:Amt><ns2:CdtDbtInd>DBIT</ns2:CdtDbtInd><ns2:Sts>BOOK</ns2:Sts><ns2:BookgDt><ns2:Dt>2026-10-03</ns2:Dt></ns2:BookgDt>
<ns2:AcctSvcrRef>Z-77</ns2:AcctSvcrRef><ns2:NtryDtls><ns2:TxDtls><ns2:RltdPties><ns2:Cdtr><ns2:Nm>Caf&#233; &amp; Cie</ns2:Nm></ns2:Cdtr></ns2:RltdPties>
<ns2:RmtInf><ns2:Ustrd><![CDATA[Facture <A-12>]]></ns2:Ustrd></ns2:RmtInf></ns2:TxDtls></ns2:NtryDtls></ns2:Ntry>
<ns2:Ntry><ns2:Amt Ccy="CHF">99.00</ns2:Amt><ns2:CdtDbtInd>DBIT</ns2:CdtDbtInd><ns2:Sts>PDNG</ns2:Sts><ns2:BookgDt><ns2:Dt>2026-10-04</ns2:Dt></ns2:BookgDt></ns2:Ntry>
</ns2:Stmt></ns2:BkToCstmrStmt></ns2:Document>`;
  const r = lireCamt053(xml);
  assert.equal(r.iban, 'CH5604835012345678009');
  assert.equal(r.soldeDebut, -120.5);
  assert.equal(r.lignes.length, 1);
  assert.deepEqual(
    [r.lignes[0].montant, r.lignes[0].contrepartie, r.lignes[0].libelle, r.lignes[0].cle],
    [-250, 'Café & Cie', 'Facture <A-12>', 'Z-77'],
  );
  // Sans FrToDt : la période va de la première à la dernière ligne.
  assert.deepEqual([r.dateDebut, r.dateFin], ['2026-10-03', '2026-10-03']);
});

test('écriture regroupée : une ligne par transaction quand chacune porte son montant', () => {
  const r = lireCamt053(RELEVE_BANC);
  const groupe = r.lignes.filter(l => l.cle.startsWith('BK-006'));
  assert.deepEqual(groupe.map(l => [l.cle, l.montant, l.contrepartie]), [
    ['BK-006-1', -882.36, 'Prodega Cash + Carry'],
    ['BK-006-2', -708, 'Boucherie du Village'],
  ]);
  // Sans montant par transaction : une seule ligne pour l'écriture.
  const xml = `${entete('camt.053.001.08')}<Stmt>${ntry08({ ref: 'G1', montant: '300.00', ind: 'DBIT', date: '2026-10-05', txs: [{ nom: 'A' }, { nom: 'B', ustrd: 'deux' }] })}</Stmt></BkToCstmrStmt></Document>`;
  const un = lireCamt053(xml);
  assert.deepEqual(un.lignes.map(l => [l.cle, l.montant, l.libelle]), [['G1', -300, 'deux']]);
});

test('un fichier qui n\'est pas un camt.053 est refusé', () => {
  assert.deepEqual(lireCamt053('<Document><BkToCstmrNtfctn/></Document>'), { erreur: 'format' });
  assert.deepEqual(lireCamt053('pas du xml'), { erreur: 'format' });
  assert.equal(lireXml('<a><b x="1"/>t</a>').enfants[0].enfants[0].attributs.x, '1');
});

test('CSV Raiffeisen : montant signé, heure après la date, IBAN en colonne, solde de fin', () => {
  const csv = '﻿IBAN;Booked At;Text;Credit/Debit Amount;Balance;Valuta Date\n'
    + 'CH93 0076 2011 6238 5295 7;2026-10-25 00:00:00.0;"FELLAY VINS SA; Facture 2026-311";-1567.45;16882.75;2026-10-25 00:00:00.0\n'
    + 'CH93 0076 2011 6238 5295 7;2026-10-27 00:00:00.0;SIX Payment Services;4312.80;21195.55;2026-10-27 00:00:00.0\n'
    + 'CH93 0076 2011 6238 5295 7;2026-10-29 00:00:00.0;Paiement QR RF18 5390 0754 7034;-1\'590.36;19605.19;2026-10-29 00:00:00.0\n';
  const r = lireCsvBancaire(csv);
  assert.equal(r.format, 'csv');
  assert.equal(r.iban, 'CH9300762011623852957');
  assert.deepEqual([r.dateDebut, r.dateFin, r.soldeFin], ['2026-10-25', '2026-10-29', 19605.19]);
  assert.deepEqual(r.lignes.map(l => l.montant), [-1567.45, 4312.8, -1590.36]);
  assert.equal(r.lignes[0].libelle, 'FELLAY VINS SA; Facture 2026-311');
  assert.equal(r.lignes[2].reference, 'RF18539007547034');
  assert.equal(r.lignes[0].dateValeur, '2026-10-25');
});

test('CSV PostFinance : lignes de la banque avant les colonnes, débit et crédit séparés, du plus récent au plus ancien', () => {
  const csv = 'Date de début:;01.10.2026\nDate de fin:;29.10.2026\nCompte:;CH56 0483 5012 3456 7800 9\nMonnaie:;CHF\n\n'
    + 'Date de comptabilisation;Texte de notification;Crédit en CHF;Débit en CHF;Valeur;Solde en CHF\n'
    + '29.10.2026;ACHAT/SERVICE PRODEGA;;882.36;29.10.2026;10 117.64\n'
    + '27.10.2026;CREDIT SIX PAYMENT SERVICES;4 312,80;;27.10.2026;11 000.00\n'
    + '\nDisclaimer:;Ce document a été établi automatiquement\n';
  const r = lireCsvBancaire(csv);
  assert.equal(r.iban, 'CH5604835012345678009');
  assert.deepEqual(r.lignes.map(l => [l.dateOperation, l.montant, l.libelle]), [
    ['2026-10-29', -882.36, 'ACHAT/SERVICE PRODEGA'],
    ['2026-10-27', 4312.8, 'CREDIT SIX PAYMENT SERVICES'],
  ]);
  assert.equal(r.soldeFin, 10117.64);
  // Le même contenu passe aussi par lireReleve.
  assert.equal(lireReleve(csv).lignes.length, 2);
});

test('CSV aux colonnes inconnues refusé', () => {
  assert.deepEqual(lireCsvBancaire('Nom;Quantité;Prix\nTomates;3;4.50\n'), { erreur: 'colonnes' });
  assert.deepEqual(lireCsvBancaire(''), { erreur: 'colonnes' });
});

test('nombres et dates des relevés suisses', () => {
  assert.equal(lireNombreBancaire("1'567.45"), 1567.45);
  assert.equal(lireNombreBancaire('-1 567,45'), -1567.45);
  assert.equal(lireNombreBancaire('1.567,45'), 1567.45);
  assert.equal(lireNombreBancaire('1,567.45'), 1567.45);
  assert.equal(lireNombreBancaire('1567.45-'), -1567.45);
  assert.equal(lireNombreBancaire('CHF 12.00'), 12);
  assert.equal(lireNombreBancaire('abc'), null);
  assert.equal(lireDateBancaire('25.10.2026'), '2026-10-25');
  assert.equal(lireDateBancaire('2026-10-25T08:00:00'), '2026-10-25');
  assert.equal(lireDateBancaire('25/10/26'), '2026-10-25');
  assert.equal(lireDateBancaire('31.02.2026'), null);
});

test('clé stable au réimport ; deux lignes identiques le même jour se distinguent par leur rang', () => {
  const a = lireCamt053(RELEVE_BANC).lignes.map(l => l.cle);
  const b = lireCamt053(RELEVE_BANC).lignes.map(l => l.cle);
  assert.deepEqual(a, b);
  const lignes = avecCles([
    { dateOperation: '2026-10-05', montant: -12.5, libelle: 'Café', contrepartie: '', reference: '' },
    { dateOperation: '2026-10-05', montant: -12.5, libelle: 'CAFÉ', contrepartie: '', reference: '' },
    { dateOperation: '2026-10-06', montant: -12.5, libelle: 'Café', contrepartie: '', reference: '' },
  ]);
  assert.deepEqual(lignes.map(l => l.cle), ['2026-10-05|-12.50|cafe|0', '2026-10-05|-12.50|cafe|1', '2026-10-06|-12.50|cafe|0']);
  assert.equal(cleLigne({ acctSvcrRef: ' R-1 ', dateOperation: '2026-10-05', montant: 1 }), 'R-1');
  // Une référence de banque répétée dans le fichier reçoit un suffixe.
  const doublon = avecCles([{ acctSvcrRef: 'X', montant: -1, dateOperation: '2026-10-01' }, { acctSvcrRef: 'X', montant: -2, dateOperation: '2026-10-01' }]);
  assert.deepEqual(doublon.map(l => l.cle), ['X', 'X#2']);
});

test('scénario du banc : 4 sûrs, 1 à confirmer, 1 à la main, 1 entrée, aucune fausse paire', () => {
  const lignes = lireCamt053(RELEVE_BANC).lignes.map((l, i) => ({ ...l, id: `l${i}`, documentId: null, ignoree: false }));
  const r = apparier(lignes, FACTURES);
  const paires = Object.fromEntries(r.surs.map(s => [s.ligne.cle, s.facture.id]));
  assert.deepEqual(paires, { 'BK-001': 'fv0', 'BK-002': 'tg0', 'BK-004': 'fv', 'BK-006-1': 'pr' });
  assert.equal(r.aConfirmer.length, 1);
  assert.equal(r.aConfirmer[0].ligne.cle, 'BK-003');
  assert.equal(r.aConfirmer[0].facture.id, 'tg');
  assert.deepEqual(r.aConfirmer[0].raisons, ['Le nom ne correspond pas']);
  assert.deepEqual(r.aLaMain.map(l => l.cle), ['BK-006-2']);
  assert.deepEqual(r.entrees.map(l => l.cle), ['BK-005']);
});

test('indices : référence, nom, date de règlement ou d\'échéance', () => {
  const pr = FACTURES.find(f => f.id === 'pr');
  const ligne = { dateOperation: '2026-10-29', montant: -882.36, libelle: 'PR-5531', contrepartie: 'Prodega Cash + Carry', reference: '' };
  assert.deepEqual(indicesRapprochement(ligne, pr), { montant: true, reference: true, nom: true, date: true });
  // Deux jours après l'échéance : dans la fenêtre ; sept jours après : non.
  assert.equal(indicesRapprochement({ ...ligne, dateOperation: '2026-11-03' }, pr).date, false);
  // « SA », « AG » et les mots courts ne suffisent pas à faire un nom.
  const sa = { ...pr, fournisseurNom: 'AB SA', numero: '' };
  assert.equal(indicesRapprochement({ ...ligne, libelle: 'XY SA', contrepartie: '' }, sa).nom, false);
  // Facture réglée : à 5 jours du règlement.
  const fv = FACTURES.find(f => f.id === 'fv');
  assert.equal(indicesRapprochement({ dateOperation: '2026-10-31', montant: -1567.45, libelle: '' }, fv).date, false);
  assert.equal(indicesRapprochement({ dateOperation: '2026-10-30', montant: -1567.45, libelle: '' }, fv).date, true);
});

test('lignes liées ou ignorées, factures déjà liées et exclues : hors du rapprochement ; doute entre deux factures', () => {
  const base = { contrepartie: 'Transgourmet', reference: '', documentId: null, ignoree: false };
  const deux = [
    doc({ id: 'a', fournisseurNom: 'Transgourmet', numero: 'A1', dateDocument: '2026-10-01', totalTTC: 100, dateEcheance: '2026-10-31' }),
    doc({ id: 'b', fournisseurNom: 'Transgourmet', numero: 'B2', dateDocument: '2026-10-02', totalTTC: 100, dateEcheance: '2026-10-31' }),
    doc({ id: 'x', fournisseurNom: 'Transgourmet', numero: 'X9', dateDocument: '2026-10-02', totalTTC: 100, exclu: true }),
  ];
  const r = apparier([{ ...base, id: '1', dateOperation: '2026-10-20', montant: -100, libelle: 'Paiement' }], deux);
  assert.equal(r.surs.length, 0);
  assert.equal(r.aConfirmer.length, 1);
  assert.ok(r.aConfirmer[0].raisons.includes('Plusieurs factures possibles'));
  // La facture a est déjà liée : seule b reste, elle devient sûre.
  const r2 = apparier([
    { ...base, id: '0', dateOperation: '2026-10-19', montant: -100, libelle: '', documentId: 'a' },
    { ...base, id: '1', dateOperation: '2026-10-20', montant: -100, libelle: 'Paiement' },
    { ...base, id: '2', dateOperation: '2026-10-21', montant: -55, libelle: 'Frais', ignoree: true },
  ], deux);
  assert.deepEqual(r2.surs.map(s => [s.ligne.id, s.facture.id]), [['1', 'b']]);
  assert.equal(r2.aLaMain.length + r2.aConfirmer.length + r2.entrees.length, 0);
});

test('factures proches d\'une ligne par écart de montant ; état de la banque', () => {
  const ligne = { montant: -708, dateOperation: '2026-10-29' };
  const proches = facturesProches(ligne, FACTURES, []);
  assert.equal(proches[0].facture.id, 'bv');
  assert.equal(proches[0].ecart, 0.15);
  assert.ok(!proches.some(p => p.facture.id === 'bl'));
  const e = etatBanque(
    [{ id: 'r1', dateFin: '2026-09-30' }, { id: 'r2', dateFin: '2026-10-29' }],
    [{ montant: -10 }, { montant: -5, documentId: 'x' }, { montant: -3, ignoree: true }, { montant: 40 }],
  );
  assert.deepEqual([e.dernier.id, e.aRapprocher, e.nbReleves], ['r2', 1, 2]);
});
