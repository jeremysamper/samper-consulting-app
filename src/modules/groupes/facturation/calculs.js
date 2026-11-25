import { convives, rubriquesDuChoix, tarif } from '../choixMenu.js';
import { libelleGroupe, metaType } from '../typesGroupe.js';

// ═══════════════════════════════════════════════════════════════════════════
// Devis, factures et paiements des groupes : calculs purs (ni React ni DOM),
// partagés par les écrans, les PDF et l'export.
//
// MONTANTS
// Une ligne vaut quantité x prix unitaire TTC, arrondi au centime (demi vers
// le haut, loin de zéro). La base pose la même somme (groupe_lignes_total,
// migration 20261123) : pour qu'elles tombent juste, la quantité garde au
// plus trois décimales et le prix deux, et tout se calcule en entiers.
//
// TVA
// Les prix sont TTC (usage suisse de la restauration). La TVA incluse se
// calcule par taux, sur la somme des lignes de ce taux.
// ═══════════════════════════════════════════════════════════════════════════

export const TAUX_TVA = [
  { taux: 8.1, label: '8,1 %', detail: 'restauration, boissons' },
  { taux: 3.8, label: '3,8 %', detail: 'hébergement' },
  { taux: 2.6, label: '2,6 %', detail: "à l'emporter" },
  { taux: 0, label: 'Hors TVA', detail: 'taxes, débours' },
];
export const TAUX_DEFAUT = 8.1;

export const MODES_PREVUS = [
  { id: 'virement', label: 'Virement' },
  { id: 'carte', label: 'Carte bancaire' },
  { id: 'especes', label: 'Espèces' },
  { id: 'twint', label: 'TWINT' },
  { id: 'autre', label: 'Autre' },
];
export const MODES_PAIEMENT = [
  ...MODES_PREVUS.slice(0, 4),
  { id: 'cheque', label: 'Chèque' },
  { id: 'autre', label: 'Autre' },
];
export const labelMode = (id) => MODES_PAIEMENT.find((m) => m.id === id)?.label || 'Autre';

export const STATUTS_DEVIS = {
  brouillon: { label: 'Brouillon' },
  envoye: { label: 'Envoyé' },
  accepte: { label: 'Accepté' },
  refuse: { label: 'Refusé' },
  expire: { label: 'Expiré' },
};

export const ETATS_FACTURE = {
  prevue: { label: 'Prévue' },
  a_payer: { label: 'À payer' },
  partiel: { label: 'Payée en partie' },
  payee: { label: 'Payée' },
  en_retard: { label: 'En retard' },
  annulee: { label: 'Annulée' },
};

export const TYPES_FACTURE = {
  acompte: 'Acompte',
  solde: 'Solde',
  totale: 'Facture',
};

// ── Nombres ────────────────────────────────────────────────────────────────
const entier = (x, decimales) => {
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n * 10 ** decimales) : 0;
};
// Centimes depuis des francs (montant déjà au centime).
export const centimes = (chf) => entier(chf, 2);
export const francs = (cts) => Math.round(cts) / 100;
const arrondiLoinDeZero = (x) => Math.sign(x) * Math.round(Math.abs(x));

// Saisie : quantité à trois décimales, prix à deux, nombres (jamais de chaîne :
// la base ignore une valeur qui n'est pas un nombre JSON).
export const normaliserQuantite = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
};
export const normaliserPrix = (v) => {
  const n = Number(String(v ?? '').replace(/['\s]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

// Montant d'une ligne, en centimes.
export function centimesLigne(l) {
  const q = entier(l?.quantite, 3);
  const p = entier(l?.prixUnitaire, 2);
  return arrondiLoinDeZero((q * p) / 1000);
}
export const montantLigne = (l) => francs(centimesLigne(l));

// « 1'394.85 » ; signe moins devant.
export function chf(n) {
  const v = Number(n) || 0;
  const [ent, dec] = Math.abs(v).toFixed(2).split('.');
  return `${v < 0 ? '-' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, "'")}.${dec}`;
}
export const chfLong = (n) => `CHF ${chf(n)}`;

export const libelleTaux = (taux) => {
  const t = Number(taux) || 0;
  return t ? `${String(t).replace('.', ',')} %` : 'Hors TVA';
};

// ── Lignes ─────────────────────────────────────────────────────────────────
let compteurId = 0;
export const nouvelId = () => {
  compteurId += 1;
  const alea = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `l-${alea}-${compteurId}`;
};

export function nouvelleLigne(partiel = {}) {
  return {
    id: nouvelId(),
    libelle: '',
    detail: '',
    quantite: 1,
    prixUnitaire: 0,
    tvaTaux: TAUX_DEFAUT,
    ...partiel,
  };
}

// Ligne propre à l'enregistrement : nombres normalisés, champs inconnus
// retirés sauf la marque de déduction d'un acompte.
export function ligneEnregistrable(l) {
  const sortie = {
    id: l?.id || nouvelId(),
    libelle: String(l?.libelle || '').trim(),
    detail: String(l?.detail || '').trim(),
    quantite: normaliserQuantite(l?.quantite),
    prixUnitaire: normaliserPrix(l?.prixUnitaire),
    tvaTaux: Number.isFinite(Number(l?.tvaTaux)) ? Number(l.tvaTaux) : TAUX_DEFAUT,
  };
  if (l?.deduction) sortie.deduction = String(l.deduction);
  return sortie;
}

export const lignesEnregistrables = (lignes) => (Array.isArray(lignes) ? lignes : [])
  .filter((l) => String(l?.libelle || '').trim() || centimesLigne(l) !== 0)
  .map(ligneEnregistrable);

// Total et TVA incluse par taux. parTaux trié du plus fort au plus faible.
export function totaux(lignes) {
  const groupes = new Map();
  let total = 0;
  (Array.isArray(lignes) ? lignes : []).forEach((l) => {
    const c = centimesLigne(l);
    total += c;
    const taux = Number(l?.tvaTaux) || 0;
    groupes.set(taux, (groupes.get(taux) || 0) + c);
  });
  const parTaux = [...groupes.entries()]
    .filter(([, base]) => base !== 0)
    .sort((a, b) => b[0] - a[0])
    .map(([taux, base]) => ({
      taux,
      base: francs(base),
      tva: taux ? francs(arrondiLoinDeZero((base * taux) / (100 + taux))) : 0,
    }));
  const tva = francs(parTaux.reduce((s, g) => s + centimes(g.tva), 0));
  return { total: francs(total), tva, parTaux };
}

// ── Devis depuis un groupe ─────────────────────────────────────────────────
// Lignes de départ d'un devis fait pour un groupe : le menu pour les adultes,
// une ligne enfant à chiffrer, les suppléments et formules par personne, les
// stations au montant. Tout reste modifiable dans le devis.
export function lignesDepuisGroupe({ groupe, menu, complements, menus }) {
  const ctx = convives(groupe || {});
  const lignes = [];
  const titreMenu = groupe?.menuNumero ? libelleGroupe(groupe.typeGroupe, groupe.menuNumero) : metaType(groupe?.typeGroupe)?.label || 'Groupe';
  if (!menu) {
    lignes.push(nouvelleLigne({ libelle: titreMenu, quantite: ctx.total || 1, prixUnitaire: 0 }));
    return lignes;
  }
  const rubriques = rubriquesDuChoix({
    menu, complements, typeGroupe: groupe?.typeGroupe, dateISO: groupe?.dateEvenement,
  });
  const t = tarif({ menu, rubriques, choix: groupe?.choix, menus });
  const parPersonne = ctx.enfants > 0 ? ctx.adultes : ctx.total;
  t.lignes.forEach((l, i) => {
    lignes.push(nouvelleLigne({
      libelle: l.label,
      detail: i === 0 ? titreMenu : '',
      quantite: parPersonne || 1,
      prixUnitaire: normaliserPrix(l.prix),
    }));
  });
  if (!t.lignes.length) lignes.push(nouvelleLigne({ libelle: titreMenu, quantite: parPersonne || 1 }));
  if (ctx.enfants > 0) lignes.push(nouvelleLigne({ libelle: 'Menu enfant', quantite: ctx.enfants, prixUnitaire: 0 }));
  if (t.stations > 0) lignes.push(nouvelleLigne({ libelle: 'Stations et animations', quantite: 1, prixUnitaire: normaliserPrix(t.stations) }));
  return lignes;
}

// ── Tranches de facturation ────────────────────────────────────────────────
// Arrondi d'une tranche intermédiaire aux 5 centimes (payable en espèces) ;
// la dernière prend le reste exact.
const cinqCentimes = (cts) => arrondiLoinDeZero(cts / 5) * 5;

// mode : 'une_fois' | 'acompte_solde' | 'echeances'
// params : { pct } pour acompte_solde ; { parts: [{ pct } | { montant }] }
// pour echeances (la dernière part prend le reste, sa valeur est ignorée).
// Rend [{ type, libelle, montant }] ; somme = total.
export function planTranches(mode, total, params = {}) {
  const totalCts = centimes(total);
  if (mode === 'acompte_solde') {
    const pct = Math.min(100, Math.max(0, Number(params.pct) || 0));
    const acompte = cinqCentimes((totalCts * pct) / 100);
    return [
      { type: 'acompte', libelle: `Acompte ${String(pct).replace('.', ',')} %`, montant: francs(acompte) },
      { type: 'solde', libelle: 'Solde', montant: francs(totalCts - acompte) },
    ];
  }
  if (mode === 'echeances') {
    const parts = Array.isArray(params.parts) && params.parts.length ? params.parts : [{}];
    const sortie = [];
    let reste = totalCts;
    parts.forEach((p, i) => {
      const derniere = i === parts.length - 1;
      let cts;
      if (derniere) cts = reste;
      else if (p.montant != null && p.montant !== '') cts = centimes(normaliserPrix(p.montant));
      else cts = cinqCentimes((totalCts * (Number(p.pct) || 0)) / 100);
      reste -= cts;
      sortie.push({
        type: derniere ? 'solde' : 'acompte',
        libelle: derniere ? 'Solde' : `Acompte ${i + 1}`,
        montant: francs(cts),
      });
    });
    return sortie;
  }
  return [{ type: 'totale', libelle: 'Facture', montant: francs(totalCts) }];
}

// Répartit un montant sur les taux du devis, au prorata de leur base, sans
// perdre un centime (plus forts restes). Une ligne par taux : la TVA d'un
// acompte suit celle de ce qu'il paie.
export function lignesAcompte(lignesDevis, montant, libelle = 'Acompte', reference = '') {
  const { parTaux } = totaux(lignesDevis);
  const cible = centimes(montant);
  const bases = parTaux.filter((g) => g.base > 0);
  const totalBases = bases.reduce((s, g) => s + centimes(g.base), 0);
  const suffixe = reference ? ` sur ${reference}` : '';
  if (!bases.length || totalBases <= 0) {
    return [nouvelleLigne({ libelle: `${libelle}${suffixe}`, quantite: 1, prixUnitaire: francs(cible), tvaTaux: TAUX_DEFAUT })];
  }
  const parts = bases.map((g) => {
    const exact = (cible * centimes(g.base)) / totalBases;
    return { taux: g.taux, cts: Math.floor(exact), reste: exact - Math.floor(exact) };
  });
  let manque = cible - parts.reduce((s, p) => s + p.cts, 0);
  [...parts].sort((a, b) => b.reste - a.reste).forEach((p) => {
    if (manque > 0) { p.cts += 1; manque -= 1; }
  });
  const plusieurs = parts.length > 1;
  return parts.filter((p) => p.cts !== 0).map((p) => nouvelleLigne({
    libelle: `${libelle}${suffixe}${plusieurs ? (p.taux ? `, part à ${libelleTaux(p.taux)}` : ', part hors TVA') : ''}`,
    quantite: 1,
    prixUnitaire: francs(p.cts),
    tvaTaux: p.taux,
  }));
}

// Lignes de déduction des acomptes (émis ou prévus, jamais annulés) : une par
// ligne d'acompte, au même taux, en négatif. Marquées `deduction` pour être
// recalculées sans toucher aux lignes saisies.
export function lignesDeduction(acomptes) {
  const sortie = [];
  (acomptes || []).filter((f) => f && f.statut !== 'annulee').forEach((f) => {
    const nom = f.numero ? `Acompte ${f.numero}` : (f.libelle || 'Acompte');
    (f.lignes || []).forEach((l) => {
      const c = centimesLigne(l);
      if (!c) return;
      sortie.push(nouvelleLigne({
        libelle: `${nom} déduit`,
        quantite: 1,
        prixUnitaire: francs(-c),
        tvaTaux: Number(l.tvaTaux) || 0,
        deduction: f.id || nom,
      }));
    });
  });
  return sortie;
}

// Solde : les lignes du devis (à ajuster : pax final, boissons du jour) moins
// les acomptes.
export function lignesSolde(lignesDevis, acomptes) {
  const base = (lignesDevis || []).filter((l) => !l.deduction).map((l) => ({ ...l, id: nouvelId() }));
  return [...base, ...lignesDeduction(acomptes)];
}

// Remplace les déductions d'une facture de solde par celles des acomptes
// actuels (un acompte prévu a reçu son numéro, un autre a été annulé).
export function rafraichirDeductions(lignes, acomptes) {
  return [...(lignes || []).filter((l) => !l.deduction), ...lignesDeduction(acomptes)];
}

// ── États ──────────────────────────────────────────────────────────────────
export function paiementsDe(factureId, paiements) {
  return (paiements || []).filter((p) => p.factureId === factureId);
}

export function etatFacture(facture, paiements, aujourdhui) {
  const montant = centimes(facture?.montant);
  if (!facture || facture.statut === 'prevue') return { etat: 'prevue', paye: 0, reste: francs(montant) };
  const paye = paiementsDe(facture.id, paiements).reduce((s, p) => s + centimes(p.montant), 0);
  if (facture.statut === 'annulee') return { etat: 'annulee', paye: francs(paye), reste: 0 };
  const reste = montant - paye;
  let etat;
  if (reste <= 0) etat = 'payee';
  else if (facture.echeance && aujourdhui && facture.echeance < aujourdhui) etat = 'en_retard';
  else if (paye > 0) etat = 'partiel';
  else etat = 'a_payer';
  return { etat, paye: francs(paye), reste: francs(Math.max(0, reste)), tropPercu: reste < 0 ? francs(-reste) : 0 };
}

export function etatDevis(devis, aujourdhui) {
  const statut = devis?.statut || 'brouillon';
  if ((statut === 'brouillon' || statut === 'envoye') && devis?.valideJusqu && aujourdhui && devis.valideJusqu < aujourdhui) {
    return 'expire';
  }
  return statut;
}

// Ce qu'un devis a déjà fait naître : facturé (émis), prévu, encaissé.
export function suiviDevis(devis, factures, paiements) {
  const siennes = (factures || []).filter((f) => f.devisId === devis?.id && f.statut !== 'annulee');
  const emises = siennes.filter((f) => f.statut === 'emise');
  const facture = emises.reduce((s, f) => s + centimes(f.montant), 0);
  const prevu = siennes.filter((f) => f.statut === 'prevue').reduce((s, f) => s + centimes(f.montant), 0);
  const encaisse = emises.reduce((s, f) => s + paiementsDe(f.id, paiements).reduce((t, p) => t + centimes(p.montant), 0), 0);
  return {
    factures: siennes,
    facture: francs(facture),
    prevu: francs(prevu),
    encaisse: francs(encaisse),
    resteAFacturer: francs(centimes(devis?.total) - facture - prevu),
  };
}

// Repères du suivi : devis en cours, à encaisser, en retard, encaissé du mois.
export function reperesFacturation({ devis, factures, paiements }, aujourdhui) {
  const enCours = (devis || []).filter((d) => ['brouillon', 'envoye'].includes(etatDevis(d, aujourdhui)));
  let aEncaisser = 0;
  let nbAEncaisser = 0;
  let enRetard = 0;
  let nbEnRetard = 0;
  (factures || []).forEach((f) => {
    const e = etatFacture(f, paiements, aujourdhui);
    if (['a_payer', 'partiel', 'en_retard'].includes(e.etat)) {
      aEncaisser += centimes(e.reste);
      nbAEncaisser += 1;
    }
    if (e.etat === 'en_retard') {
      enRetard += centimes(e.reste);
      nbEnRetard += 1;
    }
  });
  const mois = String(aujourdhui || '').slice(0, 7);
  const encaisseMois = (paiements || [])
    .filter((p) => mois && String(p.datePaiement || '').startsWith(mois))
    .reduce((s, p) => s + centimes(p.montant), 0);
  return {
    devisEnCours: enCours.length,
    montantDevisEnCours: francs(enCours.reduce((s, d) => s + centimes(d.total), 0)),
    aEncaisser: francs(aEncaisser),
    nbAEncaisser,
    enRetard: francs(enRetard),
    nbEnRetard,
    encaisseMois: francs(encaisseMois),
  };
}

// ── Dates ──────────────────────────────────────────────────────────────────
export function ajouterJours(dateISO, n) {
  if (!dateISO) return '';
  const [a, m, j] = String(dateISO).split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + (Number(n) || 0)));
  return d.toISOString().slice(0, 10);
}
export function joursEntre(debutISO, finISO) {
  if (!debutISO || !finISO) return null;
  const t = (iso) => { const [a, m, j] = String(iso).slice(0, 10).split('-').map(Number); return Date.UTC(a, m - 1, j); };
  return Math.round((t(finISO) - t(debutISO)) / 86400000);
}
export const dateFr = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('.') : '');

// ── Export CSV pour la fiduciaire ──────────────────────────────────────────
// Un texte qui commence par =, +, -, @, une tabulation ou un retour devient
// une formule à l'ouverture dans Excel (nom de client saisi) : une apostrophe
// le garde en texte. Les montants (« -12.00 ») restent des nombres.
const champCsv = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const nombreCsv = (n) => (Number(n) || 0).toFixed(2);

// Une ligne par facture émise ou annulée, avec la TVA par taux ; puis une
// ligne par paiement. Séparateur point-virgule (Excel suisse).
export function csvFacturation({ factures, paiements }, aujourdhui) {
  const taux = TAUX_TVA.map((t) => t.taux);
  const entete = ['Numéro', 'Date', 'Échéance', 'Client', 'Objet', 'Type', 'État', 'Montant TTC',
    ...taux.flatMap((t) => [`Base ${libelleTaux(t)}`, `TVA ${libelleTaux(t)}`]), 'Payé', 'Reste'];
  const lignes = [entete.map(champCsv).join(';')];
  (factures || []).filter((f) => f.statut !== 'prevue')
    .sort((a, b) => String(a.numero || '').localeCompare(String(b.numero || '')))
    .forEach((f) => {
      const t = totaux(f.lignes);
      const e = etatFacture(f, paiements, aujourdhui);
      const parTaux = taux.flatMap((tx) => {
        const g = t.parTaux.find((x) => x.taux === tx);
        return [nombreCsv(g?.base), nombreCsv(g?.tva)];
      });
      lignes.push([
        f.numero, dateFr(f.dateFacture), dateFr(f.echeance), f.clientNom, f.titre, TYPES_FACTURE[f.type] || f.type,
        ETATS_FACTURE[e.etat]?.label || e.etat, nombreCsv(f.montant), ...parTaux, nombreCsv(e.paye), nombreCsv(e.reste),
      ].map(champCsv).join(';'));
    });
  lignes.push('');
  lignes.push(['Paiement', 'Date', 'Facture', 'Client', 'Mode', 'Référence', 'Montant'].map(champCsv).join(';'));
  const parId = new Map((factures || []).map((f) => [f.id, f]));
  (paiements || []).slice().sort((a, b) => String(a.datePaiement).localeCompare(String(b.datePaiement))).forEach((p, i) => {
    const f = parId.get(p.factureId);
    lignes.push([i + 1, dateFr(p.datePaiement), f?.numero || '', f?.clientNom || '', labelMode(p.mode), p.reference || '', nombreCsv(p.montant)]
      .map(champCsv).join(';'));
  });
  return `﻿${lignes.join('\r\n')}\r\n`;
}
