// ─────────────────────────────────────────────────────────────────────────────
// Banque de la Comptabilité, sans React ni DOM (testé par node --test,
// rapprochement.test.mjs) : lecture d'un relevé bancaire (camt.053 ou CSV de
// banque suisse), clé stable de chaque ligne, puis rapprochement des
// paiements avec les factures d'achat (règle D17 de la spec).
//
// Lecture du XML sans DOMParser : un petit lecteur tolérant (balises,
// attributs, texte, CDATA, entités, préfixes d'espace de noms retirés), pour
// que la fonction tourne aussi sous node. Un camt.053 donne une ligne par
// écriture (Ntry), ou une par transaction (TxDtls) quand une écriture en
// regroupe plusieurs avec leur montant (ordre groupé de l'e-banking).
//
// Rapprochement : rien ne s'écrit ici. « Sûr » quand le montant est égal au
// centime et que la référence, ou le nom et la date, concordent, et qu'il n'y
// a qu'un candidat de part et d'autre ; tout le reste est « à confirmer »
// (montant et au moins un indice) ou « à la main ». Un crédit est une entrée,
// jamais rapprochée d'une facture d'achat.
// ─────────────────────────────────────────────────────────────────────────────

import { estFacture } from '../inventaire/facturesLogic.js';
import { round2 } from '../inventaire/tvaAchats.js';
import { ajouterJours } from './periodesCompta.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const nombre = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const pad = (n) => String(n).padStart(2, '0');
const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const jours = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

// Écart toléré entre le montant payé et le TTC de la facture : le demi-centime.
const TOLERANCE = 0.005;
// Fenêtre de date autour du règlement ou de l'échéance (jours).
export const JOURS_DATE = 5;
// Sans échéance : la facture se paie dans les 60 jours.
const ECHEANCE_DEFAUT = 60;
// Mots de raison sociale qui ne disent rien du fournisseur.
const MOTS_VIDES = new Set(['sa', 'ag', 'gmbh', 'sarl', 'schweiz', 'suisse', 'cie', 'sagl', 'ltd', 'svizzera']);

// ─── Lecteur XML minimal ─────────────────────────────────────────────────────

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' };
const decoder = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tout, e) => {
  if (e[0] === '#') {
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : tout;
  }
  return ENTITES[e.toLowerCase()] ?? tout;
});
const nomLocal = (n) => n.slice(n.indexOf(':') + 1);

// Arbre { nom, attributs, enfants, texte } ; le préfixe d'espace de noms est
// retiré (<ns2:Ntry> devient Ntry). Une balise mal fermée est tolérée.
export function lireXml(texte) {
  const racine = { nom: '#racine', attributs: {}, enfants: [], texte: '' };
  const pile = [racine];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(String(texte || ''))) !== null) {
    const courant = pile[pile.length - 1];
    if (m[1] !== undefined) { courant.texte += m[1]; continue; }
    if (m[2] !== undefined) {
      const nom = nomLocal(m[2]);
      const i = pile.map(n => n.nom).lastIndexOf(nom);
      if (i > 0) pile.length = i;
      continue;
    }
    if (m[3] !== undefined) {
      const attributs = {};
      (m[4] || '').replace(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (_, k, a, b) => { attributs[nomLocal(k)] = decoder(a ?? b ?? ''); return ''; });
      const n = { nom: nomLocal(m[3]), attributs, enfants: [], texte: '' };
      courant.enfants.push(n);
      if (!m[5]) pile.push(n);
      continue;
    }
    if (m[6] !== undefined) courant.texte += decoder(m[6]);
  }
  return racine;
}

const enfants = (n, nom) => (n ? n.enfants.filter(e => e.nom === nom) : []);
// Tous les nœuds au bout d'un chemin « A/B/C » (chaque niveau peut se répéter).
function tousAu(n, chemin) {
  let niveau = n ? [n] : [];
  chemin.split('/').forEach((nom) => { niveau = niveau.flatMap(x => enfants(x, nom)); });
  return niveau;
}
const au = (n, chemin) => tousAu(n, chemin)[0] || null;
const txt = (n) => (n ? n.texte.trim() : '');
const texteAu = (n, chemin) => txt(au(n, chemin));
function descendants(n, nom, out = []) {
  (n?.enfants || []).forEach((e) => {
    if (e.nom === nom) out.push(e);
    descendants(e, nom, out);
  });
  return out;
}
// « 2026-10-25 » ou « 2026-10-25T00:00:00+02:00 » : le jour seulement.
const jourDe = (s) => (ISO.test(String(s || '').slice(0, 10)) ? String(s).slice(0, 10) : null);
const dateAu = (n, chemin) => jourDe(texteAu(n, `${chemin}/Dt`)) || jourDe(texteAu(n, `${chemin}/DtTm`));
const signe = (ind) => (String(ind || '').toUpperCase() === 'DBIT' ? -1 : 1);

// ─── Clés de ligne ───────────────────────────────────────────────────────────

const texteCle = (s) => sansAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 120);

// Clé d'une ligne : la référence de la banque (AcctSvcrRef) si elle existe,
// sinon date, montant, texte normalisé et rang du doublon le même jour. Deux
// lectures du même fichier donnent les mêmes clés : réimporter un relevé ne
// crée aucun doublon.
export function cleLigne(l, rang = 0) {
  if (l.acctSvcrRef) return String(l.acctSvcrRef).trim();
  const texte = texteCle([l.libelle, l.contrepartie, l.reference].filter(Boolean).join(' '));
  return [l.dateOperation, Number(l.montant).toFixed(2), texte, rang].join('|');
}

// Clés de toutes les lignes d'un relevé : rang du doublon (même date, même
// montant, même texte) ; une référence de banque répétée reçoit un suffixe.
export function avecCles(lignes) {
  const vus = new Map();
  return (lignes || []).map((l) => {
    const base = cleLigne({ ...l, acctSvcrRef: null }, 0);
    const rang = vus.get(base) || 0;
    vus.set(base, rang + 1);
    let cle = cleLigne(l, rang);
    if (l.acctSvcrRef) {
      const n = vus.get(`ref:${cle}`) || 0;
      vus.set(`ref:${cle}`, n + 1);
      if (n) cle = `${cle}#${n + 1}`;
    }
    return { ...l, cle };
  });
}

// Clé ISO 7064 (modulo 97) d'une référence créancier : « RF18 5390 0754 7034 ».
function scorValide(ref) {
  const chiffres = (ref.slice(4) + ref.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let reste = 0;
  for (const c of chiffres) reste = (reste * 10 + Number(c)) % 97;
  return reste === 1;
}

// Références de paiement suisses lues dans un texte : créancier ISO 11649
// (RF, SCOR, la plus longue dont la clé est juste, pour ne pas avaler le mot
// qui suit) ou référence QR à 27 chiffres.
export function referenceDansTexte(texte) {
  const s = String(texte || '').toUpperCase();
  const scor = /\bRF\d{2}(?:\s?[0-9A-Z]{1,4}){1,6}\b/.exec(s);
  if (scor) {
    const brut = scor[0].replace(/\s+/g, '');
    for (let n = brut.length; n >= 5; n -= 1) if (scorValide(brut.slice(0, n))) return brut.slice(0, n);
  }
  const qrr = /\b(?:\d\s?){26}\d\b/.exec(s);
  if (qrr) return qrr[0].replace(/\s+/g, '');
  return null;
}

// ─── camt.053 ────────────────────────────────────────────────────────────────

function nomPartie(tx, role) {
  return texteAu(tx, `RltdPties/${role}/Nm`) || texteAu(tx, `RltdPties/${role}/Pty/Nm`)
    || texteAu(tx, `RltdPties/Ultmt${role}/Nm`) || texteAu(tx, `RltdPties/Ultmt${role}/Pty/Nm`);
}

function detailsTransaction(tx, debit) {
  if (!tx) return { contrepartie: '', reference: '', textes: [] };
  return {
    contrepartie: nomPartie(tx, debit ? 'Cdtr' : 'Dbtr'),
    reference: texteAu(tx, 'RmtInf/Strd/CdtrRefInf/Ref') || texteAu(tx, 'RmtInf/Strd/CdtrRefInf/CdtrRef'),
    textes: [...tousAu(tx, 'RmtInf/Ustrd').map(txt), texteAu(tx, 'AddtlTxInf')],
  };
}

const libelleDe = (textes) => [...new Set(textes.map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean))].join(' / ').slice(0, 500);

// Relevé camt.053 (toutes versions : 001.04 avec <Sts>BOOK</Sts> et
// <Cdtr><Nm>, 001.08 avec <Sts><Cd>BOOK</Cd></Sts> et <Cdtr><Pty><Nm>).
//   → { format: 'camt053', iban, dateDebut, dateFin, soldeDebut, soldeFin, lignes }
//     ou { erreur: 'format' } si ce n'est pas un relevé camt.053
//   ligne : { cle, dateOperation, dateValeur, montant (signé, débit négatif),
//            devise, libelle, contrepartie, reference, acctSvcrRef }
export function lireCamt053(texte) {
  const doc = lireXml(texte);
  const releves = descendants(doc, 'BkToCstmrStmt').flatMap(b => enfants(b, 'Stmt'));
  if (!releves.length) return { erreur: 'format' };
  let iban = '';
  let dateDebut = null;
  let dateFin = null;
  let soldeDebut = null;
  let soldeFin = null;
  const lignes = [];

  releves.forEach((stmt, s) => {
    iban = iban || texteAu(stmt, 'Acct/Id/IBAN') || texteAu(stmt, 'Acct/Id/Othr/Id');
    const de = jourDe(texteAu(stmt, 'FrToDt/FrDtTm'));
    const a = jourDe(texteAu(stmt, 'FrToDt/ToDtTm'));
    if (de && (!dateDebut || de < dateDebut)) dateDebut = de;
    if (a && (!dateFin || a > dateFin)) dateFin = a;
    enfants(stmt, 'Bal').forEach((b) => {
      const code = texteAu(b, 'Tp/CdOrPrtry/Cd');
      const montant = nombre(texteAu(b, 'Amt'));
      if (montant == null) return;
      const valeur = round2(montant * signe(texteAu(b, 'CdtDbtInd')));
      // Solde d'ouverture du premier relevé, de clôture du dernier.
      if ((code === 'OPBD' || code === 'PRCD') && s === 0 && soldeDebut == null) soldeDebut = valeur;
      if (code === 'CLBD') soldeFin = valeur;
    });

    enfants(stmt, 'Ntry').forEach((e) => {
      const statut = texteAu(e, 'Sts/Cd') || texteAu(e, 'Sts');
      if (statut && statut.toUpperCase() !== 'BOOK') return;
      const indEcriture = texteAu(e, 'CdtDbtInd');
      const montantEcriture = nombre(texteAu(e, 'Amt'));
      const dateOperation = dateAu(e, 'BookgDt') || dateAu(e, 'ValDt');
      const dateValeur = dateAu(e, 'ValDt');
      const devise = au(e, 'Amt')?.attributs?.Ccy || 'CHF';
      const refEcriture = texteAu(e, 'AcctSvcrRef');
      const infoEcriture = texteAu(e, 'AddtlNtryInf');
      if (!dateOperation) return;
      const txs = tousAu(e, 'NtryDtls/TxDtls');
      const montantTx = (tx) => nombre(texteAu(tx, 'Amt')) ?? nombre(texteAu(tx, 'AmtDtls/TxAmt/Amt'));
      const eclatee = txs.length > 1 && txs.every(tx => montantTx(tx) != null);

      if (eclatee) {
        txs.forEach((tx, k) => {
          const sg = signe(texteAu(tx, 'CdtDbtInd') || indEcriture);
          const d = detailsTransaction(tx, sg < 0);
          const refTx = texteAu(tx, 'Refs/AcctSvcrRef');
          lignes.push({
            dateOperation, dateValeur, devise,
            montant: round2(montantTx(tx) * sg),
            libelle: libelleDe([...d.textes, infoEcriture]),
            contrepartie: d.contrepartie,
            reference: d.reference || referenceDansTexte(d.textes.join(' ')) || '',
            acctSvcrRef: refTx || (refEcriture ? `${refEcriture}/${k + 1}` : null),
          });
        });
        return;
      }
      if (montantEcriture == null) return;
      const sg = signe(indEcriture);
      const d = detailsTransaction(txs[0], sg < 0);
      const autres = txs.slice(1).flatMap(tx => detailsTransaction(tx, sg < 0).textes);
      lignes.push({
        dateOperation, dateValeur, devise,
        montant: round2(montantEcriture * sg),
        libelle: libelleDe([...d.textes, ...autres, infoEcriture]),
        contrepartie: d.contrepartie,
        reference: d.reference || referenceDansTexte([...d.textes, infoEcriture].join(' ')) || '',
        acctSvcrRef: refEcriture || null,
      });
    });
  });

  const dates = lignes.map(l => l.dateOperation).sort();
  return {
    format: 'camt053',
    iban: iban.replace(/\s+/g, ''),
    dateDebut: dateDebut || dates[0] || null,
    dateFin: dateFin || dates[dates.length - 1] || null,
    soldeDebut,
    soldeFin,
    lignes: avecCles(lignes.filter(l => l.montant !== 0)),
  };
}

// ─── CSV bancaire ────────────────────────────────────────────────────────────

// Nombre d'un relevé : « 1'567.45 », « -1 567,45 », « 1.567,45 », « 1567.45- ».
export function lireNombreBancaire(brut) {
  let s = String(brut ?? '').replace(/[\s  '’]/g, '').replace(/^CHF/i, '').replace(/CHF$/i, '');
  if (!s) return null;
  let negatif = false;
  if (/^\(.*\)$/.test(s)) { negatif = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { negatif = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { negatif = !negatif; s = s.slice(1); }
  else if (s.startsWith('+')) s = s.slice(1);
  const virgule = s.lastIndexOf(',');
  const point = s.lastIndexOf('.');
  if (virgule >= 0 && point >= 0) {
    s = virgule > point ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (virgule >= 0) {
    s = s.replace(',', '.');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return negatif ? -n : n;
}

// Date d'un relevé : JJ.MM.AAAA, AAAA-MM-JJ, JJ/MM/AAAA (année sur 2 chiffres
// acceptée), suivie ou non d'une heure.
export function lireDateBancaire(brut) {
  const s = String(brut ?? '').trim().split(/[\sT]/)[0];
  let a;
  let m;
  let j;
  let x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (x) [, a, m, j] = x;
  else {
    x = /^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/.exec(s);
    if (!x) return null;
    [, j, m, a] = x;
    if (a.length === 2) a = `20${a}`;
  }
  const iso = `${a}-${pad(Number(m))}-${pad(Number(j))}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

// Enregistrements d'un CSV (guillemets respectés, retours à la ligne compris).
function enregistrements(texte) {
  const out = [];
  let courant = '';
  let entre = false;
  for (let i = 0; i < texte.length; i += 1) {
    const c = texte[i];
    if (c === '"') { entre = !entre; courant += c; continue; }
    if (!entre && (c === '\n' || c === '\r')) {
      if (c === '\r' && texte[i + 1] === '\n') i += 1;
      out.push(courant);
      courant = '';
      continue;
    }
    courant += c;
  }
  if (courant) out.push(courant);
  return out;
}

function cellules(ligne, sep) {
  const out = [];
  let cur = '';
  let entre = false;
  for (let i = 0; i < ligne.length; i += 1) {
    const c = ligne[i];
    if (entre) {
      if (c === '"' && ligne[i + 1] === '"') { cur += '"'; i += 1; }
      else if (c === '"') entre = false;
      else cur += c;
    } else if (c === '"') entre = true;
    else if (c === sep) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

const enTete = (s) => sansAccents(s).toLowerCase().replace(/["']/g, '').replace(/\s+/g, ' ').trim();

// Rôle d'une colonne d'après son en-tête (français, allemand, anglais).
export function roleColonne(brut) {
  const h = enTete(brut);
  if (!h) return null;
  if (/solde|saldo|balance|kontostand/.test(h) && !/montant|amount|betrag/.test(h)) return 'solde';
  if (/sous-montant|teilbetrag|einzelbetrag/.test(h)) return null;
  if (/valeur|valuta|value date/.test(h)) return 'valeur';
  if (/credit\s*\/\s*debit|debit\s*\/\s*credit/.test(h)) return 'montant';
  if (/^(debit|belastung|lastschrift)/.test(h)) return 'debit';
  if (/^(credit|gutschrift)/.test(h)) return 'credit';
  if (/montant|betrag|amount/.test(h)) return 'montant';
  if (/^(date de comptabilisation|date comptable|buchungsdatum|buchungstag|booked at|booking date)/.test(h)) return 'dateCompta';
  if (/^(date|datum)/.test(h)) return 'date';
  if (/^(texte|libelle|avis|text|buchungstext|description|communication|details|mitteilung|verwendungszweck|beschreibung|label|motif)/.test(h)) return 'texte';
  if (h === 'iban') return 'iban';
  return null;
}

function colonnesDe(cells) {
  const c = { date: -1, valeur: -1, montant: -1, debit: -1, credit: -1, solde: -1, iban: -1, textes: [] };
  let dateGenerique = -1;
  cells.forEach((h, i) => {
    const r = roleColonne(h);
    if (r === 'texte') c.textes.push(i);
    else if (r === 'dateCompta') { if (c.date < 0) c.date = i; }
    else if (r === 'date') { if (dateGenerique < 0) dateGenerique = i; }
    else if (r && c[r] < 0) c[r] = i;
  });
  if (c.date < 0) c.date = dateGenerique;
  const reconnu = c.date >= 0 && (c.montant >= 0 || c.debit >= 0 || c.credit >= 0);
  return reconnu ? c : null;
}

// IBAN suisse ou liechtensteinois : 21 caractères, souvent groupés par 4.
const IBAN_TEXTE = /\b(?:CH|LI)\d{2}(?:\s?[0-9A-Z]){17}\b/;

// CSV d'une banque suisse : séparateur « ; », « , » ou tabulation détecté,
// lignes d'en-tête de la banque tolérées avant les colonnes, montant signé ou
// débit et crédit séparés. Une ligne sans date ni montant (total, pied) est
// passée. Sans colonnes reconnues : { erreur: 'colonnes' }.
export function lireCsvBancaire(texte) {
  const brut = String(texte || '').replace(/^﻿/, '');
  const recs = enregistrements(brut);
  let entete = null;
  for (let r = 0; r < Math.min(recs.length, 40) && !entete; r += 1) {
    const essais = [';', '\t', ',']
      .map(sep => ({ sep, cells: cellules(recs[r], sep) }))
      .filter(e => e.cells.length > 1)
      .map(e => ({ ...e, cols: colonnesDe(e.cells) }))
      .filter(e => e.cols)
      .sort((a, b) => b.cells.length - a.cells.length);
    if (essais.length) entete = { rang: r, ...essais[0] };
  }
  if (!entete) return { erreur: 'colonnes' };

  const { sep, cols } = entete;
  const lignes = [];
  let iban = '';
  const soldes = [];
  recs.slice(entete.rang + 1).forEach((rec, ordre) => {
    if (!rec.trim()) return;
    const c = cellules(rec, sep);
    const dateOperation = lireDateBancaire(c[cols.date]);
    if (!dateOperation) return;
    let montant = null;
    if (cols.montant >= 0) montant = lireNombreBancaire(c[cols.montant]);
    else {
      const credit = cols.credit >= 0 ? lireNombreBancaire(c[cols.credit]) : null;
      const debit = cols.debit >= 0 ? lireNombreBancaire(c[cols.debit]) : null;
      if (credit) montant = Math.abs(credit);
      else if (debit) montant = -Math.abs(debit);
    }
    if (!montant) return;
    if (cols.iban >= 0 && !iban) iban = String(c[cols.iban] || '').replace(/\s+/g, '');
    if (cols.solde >= 0) {
      const solde = lireNombreBancaire(c[cols.solde]);
      if (solde != null) soldes.push({ date: dateOperation, ordre, solde });
    }
    const textes = cols.textes.map(i => c[i]).filter(Boolean);
    lignes.push({
      dateOperation,
      dateValeur: cols.valeur >= 0 ? lireDateBancaire(c[cols.valeur]) : null,
      devise: 'CHF',
      montant: round2(montant),
      libelle: libelleDe(textes),
      contrepartie: '',
      reference: referenceDansTexte(textes.join(' ')) || '',
      acctSvcrRef: null,
    });
  });
  if (!iban) {
    const avant = recs.slice(0, entete.rang).join(' ').toUpperCase();
    iban = (IBAN_TEXTE.exec(avant)?.[0] || '').replace(/\s+/g, '');
  }
  // Solde de fin : la ligne la plus récente ; à égalité de date, la première
  // du fichier s'il va du plus récent au plus ancien, la dernière sinon.
  let soldeFin = null;
  if (soldes.length) {
    const max = soldes.reduce((m, x) => (x.date > m ? x.date : m), soldes[0].date);
    const duJour = soldes.filter(x => x.date === max);
    const decroissant = lignes.length > 1 && lignes[0].dateOperation > lignes[lignes.length - 1].dateOperation;
    soldeFin = round2((decroissant ? duJour[0] : duJour[duJour.length - 1]).solde);
  }
  const dates = lignes.map(l => l.dateOperation).sort();
  return {
    format: 'csv',
    iban,
    dateDebut: dates[0] || null,
    dateFin: dates[dates.length - 1] || null,
    soldeDebut: null,
    soldeFin,
    lignes: avecCles(lignes),
  };
}

// Relevé de l'un ou l'autre format, d'après son contenu.
export function lireReleve(texte) {
  const s = String(texte || '').replace(/^﻿/, '').trimStart();
  return s.startsWith('<') ? lireCamt053(s) : lireCsvBancaire(s);
}

// ─── Rapprochement ───────────────────────────────────────────────────────────

const numeroNormalise = (s) => sansAccents(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const motsDe = (s) => sansAccents(s).toLowerCase().split(/[^a-z]+/).filter(Boolean);
const montantTtc = (f) => nombre(f.totalTTC);

// Les indices qui relient une ligne de débit à une facture de même montant.
//   reference : la référence ou le texte de la ligne contient le numéro de la
//               facture (3 caractères au moins)
//   nom       : un mot du fournisseur (4 lettres au moins, hors SA, AG...)
//               figure dans le texte ou la contrepartie
//   date      : facture réglée, à 5 jours du règlement ; à régler, entre la
//               date de la facture et l'échéance plus 5 jours (sans
//               échéance, 60 jours après la facture)
export function indicesRapprochement(ligne, f) {
  const texte = [ligne.libelle, ligne.contrepartie, ligne.reference].filter(Boolean).join(' ');
  const numero = numeroNormalise(f.numero);
  const reference = numero.length >= 3
    && (numeroNormalise(ligne.reference).includes(numero) || numeroNormalise(texte).includes(numero));
  const motsTexte = new Set(motsDe(texte));
  const nom = motsDe(f.fournisseurNom).some(m => m.length >= 4 && !MOTS_VIDES.has(m) && motsTexte.has(m));
  const d = ligne.dateOperation;
  let date = false;
  if (ISO.test(String(d || ''))) {
    if (f.regleLe && ISO.test(f.regleLe)) date = Math.abs(jours(f.regleLe, d)) <= JOURS_DATE;
    else {
      const debut = ISO.test(String(f.dateDocument || '')) ? f.dateDocument : null;
      const echeance = ISO.test(String(f.dateEcheance || '')) ? f.dateEcheance : (debut ? ajouterJours(debut, ECHEANCE_DEFAUT) : null);
      date = !!echeance && (!debut || d >= debut) && d <= ajouterJours(echeance, JOURS_DATE);
    }
  }
  return { montant: true, reference, nom, date };
}

const estSur = (i) => i.reference || (i.nom && i.date);
const score = (i) => (i.reference ? 4 : 0) + (i.nom ? 2 : 0) + (i.date ? 1 : 0);

// Factures que le rapprochement peut proposer : factures non exclues, non
// encore liées à une ligne du relevé.
function facturesLibres(factures, lignes) {
  const liees = new Set((lignes || []).map(l => l.documentId).filter(Boolean));
  return (factures || []).filter(f => estFacture(f) && !f.exclu && !liees.has(f.id));
}

//   lignes   : lignes de relevé ({ id, dateOperation, montant, libelle,
//              contrepartie, reference, documentId, ignoree })
//   factures : pièces d'achat (achats_documents mappés)
// → { surs: [{ ligne, facture, indices }],
//     aConfirmer: [{ ligne, facture, indices, raisons }],
//     aLaMain: [ligne], entrees: [ligne] }
export function apparier(lignes, factures) {
  const libres = facturesLibres(factures, lignes).filter(f => montantTtc(f) != null);
  const aTraiter = (lignes || []).filter(l => !l.documentId && !l.ignoree);
  const debits = aTraiter.filter(l => Number(l.montant) < 0);
  const entrees = aTraiter.filter(l => Number(l.montant) > 0);

  const evals = debits.map((ligne) => {
    const du = round2(-Number(ligne.montant));
    const cands = libres
      .filter(f => Math.abs(montantTtc(f) - du) <= TOLERANCE)
      .map(f => ({ facture: f, indices: indicesRapprochement(ligne, f) }));
    return { ligne, cands };
  });
  // Combien de lignes voient chaque facture comme candidate sûre.
  const surPour = new Map();
  evals.forEach(e => e.cands.filter(c => estSur(c.indices)).forEach((c) => {
    surPour.set(c.facture.id, (surPour.get(c.facture.id) || 0) + 1);
  }));

  const surs = [];
  const restes = [];
  evals.forEach((e) => {
    const sursLigne = e.cands.filter(c => estSur(c.indices));
    if (sursLigne.length === 1 && surPour.get(sursLigne[0].facture.id) === 1) {
      surs.push({ ligne: e.ligne, facture: sursLigne[0].facture, indices: sursLigne[0].indices });
    } else restes.push({ ...e, ambigu: sursLigne.length > 0 });
  });

  const prises = new Set(surs.map(s => s.facture.id));
  const aConfirmer = [];
  const aLaMain = [];
  restes.forEach(({ ligne, cands, ambigu }) => {
    const possibles = cands
      .filter(c => !prises.has(c.facture.id) && (c.indices.reference || c.indices.nom || c.indices.date))
      .sort((a, b) => score(b.indices) - score(a.indices)
        || Math.abs(jours(a.facture.regleLe || a.facture.dateEcheance || a.facture.dateDocument || ligne.dateOperation, ligne.dateOperation))
        - Math.abs(jours(b.facture.regleLe || b.facture.dateEcheance || b.facture.dateDocument || ligne.dateOperation, ligne.dateOperation)));
    if (!possibles.length) { aLaMain.push(ligne); return; }
    const { facture, indices } = possibles[0];
    const raisons = [];
    if (!indices.reference && !indices.nom) raisons.push('Le nom ne correspond pas');
    if (!indices.date) raisons.push(facture.regleLe ? 'La date est loin du règlement' : 'La date est loin de l\'échéance');
    if (ambigu || possibles.length > 1) raisons.push('Plusieurs factures possibles');
    aConfirmer.push({ ligne, facture, indices, raisons });
  });

  return { surs, aConfirmer, aLaMain, entrees };
}

// Factures à proposer pour une ligne, de la plus proche par le montant à la
// plus éloignée ; celles sans TTC à la fin.
export function facturesProches(ligne, factures, lignes) {
  const du = Math.abs(Number(ligne?.montant) || 0);
  return facturesLibres(factures, lignes)
    .map(f => ({ facture: f, ecart: montantTtc(f) == null ? null : round2(Math.abs(montantTtc(f) - du)) }))
    .sort((a, b) => (a.ecart == null) - (b.ecart == null) || (a.ecart ?? 0) - (b.ecart ?? 0)
      || String(b.facture.dateDocument || '').localeCompare(String(a.facture.dateDocument || '')));
}

// État de la banque pour l'accueil et l'écran : dernier relevé (par date de
// fin) et nombre de paiements encore à rapprocher.
export function etatBanque(releves, lignes) {
  const dernier = (releves || []).slice().sort((a, b) => String(b.dateFin || '').localeCompare(String(a.dateFin || ''))
    || String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null;
  const aRapprocher = (lignes || []).filter(l => !l.documentId && !l.ignoree && Number(l.montant) < 0).length;
  return { dernier, aRapprocher, nbReleves: (releves || []).length };
}
