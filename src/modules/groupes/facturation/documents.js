import { construireQrFacture, formaterIban, parserAdresse, validerQrFacture } from '../../../services/qrFacture.js';
import { chf, dateFr, etatFacture, labelMode, montantLigne, totaux, TYPES_FACTURE } from './calculs.js';
import { metaType } from '../typesGroupe.js';

// ═══════════════════════════════════════════════════════════════════════════
// Devis et factures des groupes : ce que le PDF dessine, la QR-facture, et
// les brouillons Gmail préécrits (messages types modifiables dans Réglages,
// clés user_settings ci-dessous, variables {{...}}).
// ═══════════════════════════════════════════════════════════════════════════

export const CLES_MAILS = {
  devis: 'groupes_mail_devis',
  facture: 'groupes_mail_facture',
  relance: 'groupes_mail_relance',
};

export const VARIABLES_MAIL = ['client', 'contact', 'numero', 'objet', 'montant', 'echeance', 'validite', 'reste', 'etablissement'];

export const MAILS_DEFAUT = {
  devis: {
    sujet: 'Devis {{numero}}, {{objet}}',
    corps: `Bonjour {{contact}},

Merci pour votre demande. Vous trouverez en pièce jointe notre devis {{numero}} pour {{objet}}.

Montant : {{montant}}
Ce devis est valable jusqu'au {{validite}}.

Pour confirmer, il suffit de répondre à ce message. Nous restons à votre disposition pour adapter le menu ou l'organisation.

Avec nos meilleures salutations,

{{etablissement}}`,
  },
  facture: {
    sujet: 'Facture {{numero}}, {{objet}}',
    corps: `Bonjour {{contact}},

Vous trouverez en pièce jointe la facture {{numero}} pour {{objet}}.

Montant : {{montant}}
À payer jusqu'au {{echeance}}.

Le bulletin de paiement avec QR code se trouve au bas de la facture.

Avec nos meilleures salutations,

{{etablissement}}`,
  },
  relance: {
    sujet: 'Rappel, facture {{numero}}',
    corps: `Bonjour {{contact}},

Sauf erreur de notre part, la facture {{numero}} pour {{objet}}, échue le {{echeance}}, n'est pas encore réglée. Le montant restant est de {{reste}}.

Si le paiement est déjà parti, merci de ne pas tenir compte de ce message. Vous trouverez la facture en pièce jointe.

Avec nos meilleures salutations,

{{etablissement}}`,
  },
};

export function remplirModele(texte, valeurs) {
  return String(texte || '').replace(/\{\{\s*([a-z]+)\s*\}\}/g, (_, k) => String(valeurs[k] ?? ''));
}

export function lienGmail({ a = '', sujet = '', corps = '' }) {
  const params = new URLSearchParams();
  if (a) params.set('to', a);
  if (sujet) params.set('su', sujet);
  if (corps) params.set('body', corps);
  return `https://mail.google.com/mail/?view=cm&fs=1&tf=1&${params.toString()}`;
}

// Objet d'un document : « Mariage, 14.06.2027, 50 personnes » ou le titre saisi.
export function objetDocument(doc) {
  if (doc?.titre) return doc.titre;
  const morceaux = [
    metaType(doc?.typeGroupe)?.label || '',
    doc?.dateEvenement ? dateFr(doc.dateEvenement) : '',
    Number(doc?.nbPax) > 0 ? `${doc.nbPax} personnes` : '',
  ].filter(Boolean);
  return morceaux.join(', ') || 'Votre événement';
}

const prenomContact = (doc) => doc?.clientContact || doc?.clientNom || '';

export function texteMail(type, doc, { reglages, etablissementNom, modeles, aujourdhui, paiements } = {}) {
  const modele = { ...MAILS_DEFAUT[type], ...(modeles?.[type] || {}) };
  const reste = type === 'relance' && doc ? etatFacture(doc, paiements, aujourdhui).reste : null;
  const valeurs = {
    client: doc?.clientNom || '',
    contact: prenomContact(doc),
    numero: doc?.numero || '',
    objet: objetDocument(doc),
    montant: `CHF ${chf(type === 'devis' ? doc?.total : doc?.montant)}`,
    echeance: dateFr(doc?.echeance),
    validite: dateFr(doc?.valideJusqu),
    reste: reste != null ? `CHF ${chf(reste)}` : '',
    etablissement: reglages?.raisonSociale || etablissementNom || '',
  };
  return { a: doc?.clientEmail || '', sujet: remplirModele(modele.sujet, valeurs), corps: remplirModele(modele.corps, valeurs) };
}

// ── Émetteur et client ─────────────────────────────────────────────────────
function lignesEmetteur(r) {
  const rue = [r.rue, r.numero].filter(Boolean).join(' ');
  const ville = [r.npa, r.localite].filter(Boolean).join(' ');
  return [rue, ville, r.telephone, r.email].filter(Boolean);
}

function lignesClient(doc) {
  const adresse = String(doc?.clientAdresse || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return [doc?.clientContact && doc.clientContact !== doc.clientNom ? `À l'attention de ${doc.clientContact}` : '', ...adresse, doc?.clientEmail || ''];
}

// ── QR-facture ─────────────────────────────────────────────────────────────
// Rend { donnees, erreurs } : donnees null tant que l'identité de facturation
// ne permet pas un QR valable (le PDF sort alors sans bulletin).
export function qrFacture(facture, reglages, reste) {
  if (!reglages?.iban) return { donnees: null, erreurs: ['IBAN manquant dans Réglages, Groupes : devis et factures.'] };
  const debiteur = parserAdresse([facture.clientNom, ...String(facture.clientAdresse || '').split('\n')].filter(Boolean).join('\n'));
  const donnees = construireQrFacture({
    iban: reglages.iban,
    creancier: {
      nom: reglages.raisonSociale, rue: reglages.rue, numero: reglages.numero,
      npa: reglages.npa, localite: reglages.localite, pays: reglages.pays || 'CH',
    },
    debiteur,
    montant: reste > 0 ? reste : null,
    numeroFacture: facture.numero,
    message: `Facture ${facture.numero}`,
  });
  const erreurs = validerQrFacture(donnees);
  return { donnees: erreurs.length ? null : donnees, erreurs };
}

// ── Charges utiles des PDF ─────────────────────────────────────────────────
const lignesPdf = (lignes) => (lignes || []).map((l) => ({ ...l, montant: montantLigne(l) }));

function emetteurPdf(reglages, etablissementNom) {
  return {
    nom: reglages?.raisonSociale || etablissementNom || '',
    lignes: lignesEmetteur(reglages || {}),
    tva: reglages?.assujettiTva !== false ? reglages?.numeroTva || '' : '',
  };
}

export function payloadDevis(devis, { reglages, etablissementNom }) {
  const evenement = [
    devis.dateEvenement ? `Événement le ${dateFr(devis.dateEvenement)}${devis.heure ? ` à ${devis.heure}` : ''}` : '',
    Number(devis.nbPax) > 0 ? `${devis.nbPax} personnes` : '',
  ].filter(Boolean).join(', ');
  return {
    titre: `Devis ${devis.numero || ''}`.trim(),
    objet: objetDocument(devis),
    meta: [`Du ${dateFr(devis.dateDevis)}`, devis.valideJusqu ? `valable jusqu'au ${dateFr(devis.valideJusqu)}` : ''].filter(Boolean).join(', '),
    emetteur: emetteurPdf(reglages, etablissementNom),
    client: { nom: devis.clientNom, lignes: lignesClient(devis) },
    lignes: lignesPdf(devis.lignes),
    totaux: totaux(devis.lignes),
    assujettiTva: reglages?.assujettiTva !== false,
    echeanceTexte: evenement,
    conditions: devis.conditions || reglages?.conditions || '',
    mention: '',
  };
}

export function payloadFacture(facture, { reglages, etablissementNom, paiements, aujourdhui }) {
  const e = etatFacture(facture, paiements, aujourdhui);
  const titreType = facture.type === 'acompte' ? "Facture d'acompte" : facture.type === 'solde' ? 'Facture de solde' : TYPES_FACTURE.totale;
  const iban = reglages?.iban ? `IBAN ${formaterIban(reglages.iban)}` : '';
  return {
    titre: `${titreType} ${facture.numero || ''}`.trim(),
    objet: facture.titre || 'Votre événement',
    meta: [facture.dateFacture ? `Du ${dateFr(facture.dateFacture)}` : '', facture.libelle].filter(Boolean).join(', '),
    emetteur: emetteurPdf(reglages, etablissementNom),
    client: { nom: facture.clientNom, lignes: lignesClient(facture) },
    lignes: lignesPdf(facture.lignes),
    totaux: totaux(facture.lignes),
    assujettiTva: reglages?.assujettiTva !== false,
    dejaPaye: e.paye > 0 ? e.paye : 0,
    reste: e.reste,
    echeanceTexte: facture.echeance && e.etat !== 'payee' ? `À payer jusqu'au ${dateFr(facture.echeance)}.` : (e.etat === 'payee' ? 'Facture réglée, merci.' : ''),
    paiementTexte: facture.modePrevu === 'virement' && iban && e.etat !== 'payee'
      ? `Par virement : ${iban}, en indiquant le numéro ${facture.numero}.`
      : (facture.modePrevu !== 'virement' && e.etat !== 'payee' ? `Paiement prévu : ${labelMode(facture.modePrevu).toLowerCase()}.` : ''),
    mention: facture.mention || reglages?.mentionFacture || '',
    annuleeTexte: facture.statut === 'annulee' ? `Facture annulée le ${dateFr(String(facture.annuleeLe || '').slice(0, 10))}${facture.motifAnnulation ? ` : ${facture.motifAnnulation}` : ''}` : '',
  };
}

const nettoyerNom = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export const nomFichier = (doc, prefixe) => `${nettoyerNom(doc.numero || prefixe)}-${nettoyerNom(doc.clientNom)}.pdf`;
