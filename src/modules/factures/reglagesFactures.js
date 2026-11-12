import { useSyncExternalStore } from 'react';
import { readText } from '../../utils/storage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Réglages de la facturation client, partagés par l'écran Factures et par ses
// deux sections de la page des réglages (SectionsFactures.jsx) :
//
//   factures_textes : les textes du document, client par client
//                     (user_settings, clé facture_textes:<etab>) ;
//   factures_email  : l'e-mail d'envoi, activation, objet, copie, message type
//                     (user_settings, quatre clés email_facture_*).
//
// Fichier léger : ni PDF ni QR, la page des réglages ne charge pas l'écran
// Factures pour montrer ses réglages. Les constantes viennent de Factures.jsx,
// mot pour mot.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Templates email par défaut pour la notification client ───
// Variables disponibles : {{numero}}, {{date}}, {{echeance}}, {{montant}},
// {{etablissement}}, {{prestation}}, {{reference}}
export const EMAIL_VARS = ['numero', 'date', 'echeance', 'montant', 'etablissement', 'prestation', 'reference'];

export const DEFAULT_EMAIL_SUBJECT = 'Facture n° {{numero}}, Samper Consulting';

export const DEFAULT_EMAIL_TEMPLATE = `Bonjour,

Vous trouverez en pièce jointe la facture n° {{numero}} du {{date}}, relative à la prestation suivante : {{prestation}}.

Montant : {{montant}}
Échéance de paiement : {{echeance}}

Le règlement peut être effectué par virement sur le compte indiqué au bas de la facture. Le document reste également disponible dans votre espace Samper Consulting, rubrique Documents.

Je reste à disposition pour toute question.

Avec mes meilleures salutations,

Jérémy Samper
Consultant culinaire
Samper Consulting
+41 76 626 54 00
jeremysamper.pro@gmail.com`;

// ─── Textes du document facture, par établissement client ───
// Tout ce qui était figé dans le PDF (émetteur, coordonnées bancaires, mention
// TVA, signature) est éditable et enregistré sur l'établissement sélectionné :
// un client facturé depuis une autre entité ou avec un autre compte garde ses
// propres textes. Stockage en user_settings sous une clé scopée par etabId,
// donc pas de migration ni de colonne à ajouter.
export const DEFAULT_FACTURE_TEXTS = {
  titre: 'Facture de prestation',
  emetteur: `Jérémy Samper, consultant culinaire
Téléphone : +41 76 626 54 00
E-mail : jeremysamper.pro@gmail.com
Adresse : Route de Collombé 24A, 1976 Erde, Suisse`,
  // Vide = bloc client dérivé de la fiche établissement (nom + adresse). Dès
  // qu'un texte est enregistré il prime : c'est là que vivent la personne de
  // contact, une raison sociale différente ou une adresse de facturation.
  client: '',
  prestationDefaut: 'Mission de consulting culinaire',
  adresseEmission: 'Route de Collombé 24A, 1976 Erde, Suisse',
  paiementTitre: 'Coordonnées de paiement',
  paiement: `Titulaire : SAMPER Jérémy
Banque : Banque Cantonale du Valais (BCVS)
IBAN : CH33 0076 5001 0561 6551 0
SWIFT / BIC : BCVSCH2LXXX`,
  mentionTva: 'Numéro TVA : Non assujetti (activité indépendante en création)',
  ville: 'Erde',
  signature: 'Jérémy Samper, consultant culinaire',
  // ─── QR-facture suisse ───
  // L'adresse du créancier est saisie en champs séparés et non reprise du bloc
  // émetteur : depuis novembre 2025 la norme n'accepte plus que les adresses
  // structurées, et deviner rue / n° / NPA dans un texte libre qu'on maîtrise
  // serait une fragilité gratuite. Le débiteur, lui, n'a pas ce luxe : il est
  // analysé depuis le bloc client (cf. parserAdresse).
  qrActive: true,
  qrIban: 'CH33 0076 5001 0561 6551 0',
  qrCreancierNom: 'SAMPER Jérémy',
  qrCreancierRue: 'Route de Collombé',
  qrCreancierNumero: '24A',
  qrCreancierNpa: '1976',
  qrCreancierLocalite: 'Erde',
  qrCreancierPays: 'CH',
};

export const FACTURE_TEXT_FIELDS = [
  { key: 'titre', label: 'Titre du document', rows: 0, hint: 'Le numéro de facture est ajouté automatiquement à la suite.' },
  { key: 'emetteur', label: 'Bloc émetteur', rows: 5 },
  { key: 'client', label: 'Bloc client', rows: 4, hint: "Laisser vide pour reprendre le nom et l'adresse de la fiche établissement. Reste modifiable facture par facture dans le formulaire." },
  { key: 'prestationDefaut', label: 'Prestation par défaut', rows: 2, hint: 'Pré-remplit le détail de la prestation quand ce client est sélectionné.' },
  { key: 'adresseEmission', label: "Adresse d'émission", rows: 0, hint: 'Laisser vide pour masquer la ligne du tableau.' },
  { key: 'paiementTitre', label: 'Titre du bloc paiement', rows: 0 },
  { key: 'paiement', label: 'Coordonnées de paiement', rows: 5, hint: 'Une ligne par entrée, au format « Libellé : valeur ».' },
  { key: 'mentionTva', label: 'Mention TVA', rows: 2, hint: 'Laisser vide pour masquer la ligne.' },
  { key: 'ville', label: "Ville d'émission", rows: 0, hint: 'Utilisée pour la ligne « Fait à… ».' },
  { key: 'signature', label: 'Signature', rows: 2 },

  { groupe: 'QR-facture', key: 'qrActive', label: 'Ajouter la QR-facture au bas du PDF', type: 'bool', hint: 'Récépissé et section paiement conformes à la norme suisse, générés depuis les champs ci-dessous.' },
  { groupe: 'QR-facture', key: 'qrIban', label: 'IBAN de paiement', rows: 0, hint: 'Compte suisse ou liechtensteinois. Un QR-IBAN (institution 30000-31999) n\'est pas géré : il exigerait une référence QR.' },
  { groupe: 'QR-facture', key: 'qrCreancierNom', label: 'Créancier : nom', rows: 0 },
  { groupe: 'QR-facture', key: 'qrCreancierRue', label: 'Créancier : rue', rows: 0, hint: 'Sans le numéro, qui a son propre champ.' },
  { groupe: 'QR-facture', key: 'qrCreancierNumero', label: 'Créancier : n°', rows: 0 },
  { groupe: 'QR-facture', key: 'qrCreancierNpa', label: 'Créancier : NPA', rows: 0 },
  { groupe: 'QR-facture', key: 'qrCreancierLocalite', label: 'Créancier : localité', rows: 0 },
  { groupe: 'QR-facture', key: 'qrCreancierPays', label: 'Créancier : pays', rows: 0, hint: 'Code à deux lettres : CH, FR, DE…' },
];

export const factureTextsKey = (etabId) => `facture_textes:${etabId}`;

// Fusion avec les valeurs par défaut : une facture enregistrée avant l'ajout
// d'un champ ne doit pas afficher un bloc vide.
export const mergeFactureTexts = (raw) => {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FACTURE_TEXTS };
  const out = { ...DEFAULT_FACTURE_TEXTS };
  Object.keys(DEFAULT_FACTURE_TEXTS).forEach(k => {
    // Le type doit correspondre à celui du défaut : l'interrupteur de la
    // QR-facture est un booléen, et un `false` enregistré se perdrait sous un
    // test qui n'accepte que les chaînes.
    if (typeof raw[k] === typeof DEFAULT_FACTURE_TEXTS[k]) out[k] = raw[k];
  });
  return out;
};

// ─── E-mail d'envoi : les quatre réglages du consultant ───
export const CLES_EMAIL = {
  enabled: 'email_facture_enabled',
  template: 'email_facture_template',
  subject: 'email_facture_subject',
  cc: 'email_facture_cc',
};

const ancienneValeur = (cle) => { try { return readText(cle, null); } catch { return null; } };

// Lecture dans le cache user_settings (hydraté à la connexion). Les deux
// premières valeurs gardent le repli localStorage d'avant leur passage en base.
export function lireReglagesEmail(db) {
  const lue = (cle) => db?.getUserSettingSync?.(cle);
  const actif = lue(CLES_EMAIL.enabled);
  const ancienActif = actif == null ? ancienneValeur('sc_email_facture_enabled') : null;
  const modele = lue(CLES_EMAIL.template);
  const objet = lue(CLES_EMAIL.subject);
  const copie = lue(CLES_EMAIL.cc);
  return {
    enabled: actif != null ? !!actif : (ancienActif != null ? ancienActif !== 'false' : true),
    template: modele ? String(modele) : (ancienneValeur('sc_email_facture_template') || DEFAULT_EMAIL_TEMPLATE),
    subject: objet ? String(objet) : DEFAULT_EMAIL_SUBJECT,
    cc: copie ? String(copie) : '',
  };
}

// La case « Notification client » reste dans le formulaire de la facture :
// même réglage que dans la section. Quand elle y change, la section restée
// montée derrière relit sur ce signal (reglagesSignal.js).
export const SIGNAL_NOTIFICATION = 'factures_email:case';

// ─── Client dont la section montre les textes ───
// La facture ouverte le désigne avant d'ouvrir la section ; le sélecteur de la
// section le change. Sans choix, c'est l'établissement courant.
let clientTextes = null;
const abonnes = new Set();
const sAbonner = (fn) => { abonnes.add(fn); return () => abonnes.delete(fn); };

export function choisirClientTextes(etabId) {
  clientTextes = etabId || null;
  abonnes.forEach((fn) => fn());
}

export function useClientTextes(defaut) {
  const choisi = useSyncExternalStore(sAbonner, () => clientTextes, () => null);
  return choisi || defaut || null;
}
