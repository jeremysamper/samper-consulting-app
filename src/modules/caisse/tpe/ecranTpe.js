// ─────────────────────────────────────────────────────────────────────────────
// Terminal de paiement relié (caisse v9) : ce que l'écran déduit, en fonctions
// pures. L'écran ne décide de rien d'important : la base valide chaque
// démarrage et chaque encaissement, l'Edge Function caisse-tpe parle au
// prestataire. Ici on range seulement ce qu'il faut montrer.
//
//   Une transaction : { id, statut, montant, pourboire, marque, fin_carte,
//   code_autorisation, message, terminal_id, tranche, rembourse_statut, test }
//   statut : demande, en_cours, approuve, refuse, annule, expire, incertain.
// ─────────────────────────────────────────────────────────────────────────────

// L'écran redemande le statut à ce rythme pendant que le client paie.
export const RYTHME_SUIVI_MS = 2000;
export const ROLES_TRANCHER = ['consultant', 'patron', 'resp_cuisine'];
export const ROLES_TERMINAL = ['consultant', 'patron'];
export const PLAFOND_DEFAUT = 5000;
export const PLAFONDS = [500, 1000, 2000, 5000, 10000];

export const estSimule = (terminal) => terminal?.prestataire === 'simule';

// Les terminaux qui peuvent servir ce ticket : reliés, et du bon monde. Le
// terminal simulé ne sert que les tickets de test, un vrai terminal jamais.
export function terminauxPour(terminaux, ticket) {
  return (terminaux || []).filter((t) => t.actif && estSimule(t) === Boolean(ticket?.test));
}

// Le terminal du poste : celui qu'il a retenu s'il est encore utilisable,
// sinon le premier.
export function choisirTerminal(utilisables, retenu) {
  const liste = utilisables || [];
  return liste.find((t) => t.id === retenu) || liste[0] || null;
}

// Où en est la feuille « Présentez la carte ».
//   envoi : la demande part ; attente : le terminal attend la carte ;
//   accepte ; refuse (refusé, annulé, délai du terminal) ; incertain.
export function etapeDe(transaction) {
  if (!transaction) return 'envoi';
  switch (transaction.statut) {
    case 'demande':
    case 'en_cours':
      return 'attente';
    case 'approuve':
      return 'accepte';
    case 'incertain':
      return 'incertain';
    default:
      return 'refuse';
  }
}

export const enRoute = (transaction) => ['demande', 'en_cours', 'incertain'].includes(transaction?.statut);
// Une transaction qui vaut de l'argent pris : approuvée et pas remboursée.
export const estPrise = (transaction) => transaction?.statut === 'approuve' && transaction?.rembourse_statut !== 'fait';

export function titreFin(transaction) {
  if (transaction?.statut === 'annule') return 'Paiement annulé';
  if (transaction?.statut === 'expire') return 'Délai dépassé sur le terminal';
  return 'Paiement refusé';
}

// Le paiement que pose une transaction approuvée. Le montant et le pourboire
// sont ceux du terminal : la base refuse tout autre chiffre.
export function paiementDe(transaction, libelle = null) {
  return {
    moyen: 'carte',
    libelle: libelle || null,
    montant: Number(transaction.montant),
    pourboire: Number(transaction.pourboire || 0),
    tpe: transaction.id,
    terminal_id: transaction.terminal_id || null,
    marque: transaction.marque || null,
    fin_carte: transaction.fin_carte || null,
    code_autorisation: transaction.code_autorisation || null,
  };
}

// À l'ouverture de l'encaissement : ce que les transactions du ticket
// imposent. Un paiement accepté plus tôt (écran fermé, réseau coupé) se
// rattache au ticket sans second débit ; une transaction en route se reprend.
export function reprise(transactions, poses = []) {
  const dejaPosees = new Set((poses || []).map((p) => p.tpe).filter(Boolean));
  const liste = transactions || [];
  return {
    aPoser: liste.filter((t) => estPrise(t) && !dejaPosees.has(t.id)),
    enRoute: liste.find(enRoute) || null,
  };
}

// Les morceaux de la ligne « Carte Visa, fin 1234, autorisation 123456 »,
// seulement ceux qui existent. L'écran les pose chacun dans son nœud ; la
// quittance les assemble (detailCarteTexte).
export function detailCarte(transaction) {
  const t = transaction || {};
  return {
    marque: t.marque || null,
    fin: /^\d{4}$/.test(String(t.fin_carte || '')) ? String(t.fin_carte) : null,
    autorisation: t.code_autorisation || null,
  };
}

export function detailCarteTexte(transaction) {
  const d = detailCarte(transaction);
  return [
    d.marque ? `Carte ${d.marque}` : 'Carte',
    d.fin ? `fin ${d.fin}` : null,
    d.autorisation ? `autorisation ${d.autorisation}` : null,
  ].filter(Boolean).join(', ');
}

// L'écart entre le bouclement du terminal et les cartes de la caisse, au
// centime ; null tant que le bouclement n'est pas saisi.
export function ecartBouclement(netCaisse, bouclement) {
  if (bouclement == null || bouclement === '') return null;
  return Math.round((Number(bouclement) - Number(netCaisse || 0)) * 100) / 100;
}

// Le plafond d'une transaction réglé par la maison (clé tpe_plafond), borné
// comme dans la base (caisse_tpe_plafond).
export function plafondDe(config) {
  const n = Number(config?.tpe_plafond);
  return typeof config?.tpe_plafond === 'number' && n >= 1 && n <= 100000 ? Math.round(n * 100) / 100 : PLAFOND_DEFAUT;
}

// Les refus de la base et de la fonction, dits en clair. La base les lève
// sans accents ; un message inconnu qui commence par « caisse: » est montré
// tel quel, sans son préfixe.
const MESSAGES = {
  'caisse: acces refuse': "Vous n'avez pas les droits pour cette action.",
  'caisse: ticket introuvable': 'Ticket introuvable.',
  "caisse: le ticket n'est pas ouvert": "Ce ticket n'est plus ouvert.",
  'caisse: terminal inconnu pour cette maison': "Ce terminal n'est pas celui de cette maison.",
  "caisse: ce terminal n'est plus relie": "Ce terminal n'est plus relié.",
  'caisse: terminal introuvable': 'Terminal introuvable.',
  'caisse: un ticket de test ne part jamais sur un vrai terminal': 'Un ticket de test ne part jamais sur un vrai terminal.',
  'caisse: le terminal simule ne sert que les tickets de test': 'Le terminal simulé ne sert que les tickets de test.',
  "caisse: le terminal n'encaisse qu'en francs suisses": "Le terminal n'encaisse qu'en francs suisses.",
  'caisse: montant de paiement invalide': 'Montant de paiement invalide.',
  'caisse: un paiement par carte est deja en route pour ce ticket': 'Un paiement par carte est déjà en route pour ce ticket.',
  'caisse: ce terminal est occupe par un autre paiement': 'Ce terminal est occupé par un autre paiement.',
  'caisse: reference de transaction deja utilisee': 'Cette tentative a déjà été envoyée. Réessayez.',
  'caisse: reference de transaction manquante': 'Tentative mal formée. Réessayez.',
  'caisse: transaction de terminal introuvable': 'Paiement introuvable.',
  'caisse: seule une transaction incertaine se tranche': "Ce paiement n'est plus en doute.",
  'caisse: un motif est obligatoire (3 a 300 caracteres)': 'Un motif est obligatoire.',
  'caisse: pas de numero de carte dans un motif': 'Pas de numéro de carte dans un motif.',
  'caisse: decision inconnue': 'Choix inconnu.',
  'caisse: seul un paiement accepte se rembourse': 'Seul un paiement accepté se rembourse.',
  'caisse: ce paiement est deja rembourse': 'Ce paiement est déjà remboursé.',
  'caisse: un remboursement est deja en cours pour ce paiement': 'Un remboursement est déjà en cours pour ce paiement.',
  "caisse: annuler d'abord le ticket, depuis l'historique": "Annulez d'abord le ticket, depuis l'historique.",
  'caisse: prestataire de terminal inconnu': 'Prestataire de terminal inconnu.',
  'caisse: nom du terminal invalide (1 a 40 caracteres)': 'Nom du terminal manquant ou trop long.',
  'caisse: numero de serie du terminal invalide': 'Numéro de série invalide (lettres, chiffres, point, tiret).',
  'caisse: cle du terminal manquante': 'Clé du terminal manquante.',
  'caisse: ce terminal est deja relie a cette maison': 'Ce terminal est déjà relié à cette maison.',
  'caisse: un paiement est en route sur ce terminal': 'Un paiement est en route sur ce terminal.',
  'caisse: cle du terminal introuvable, le relier a nouveau': 'Clé du terminal introuvable : reliez-le à nouveau.',
  'caisse: jour de bouclement invalide': 'Jour de bouclement invalide.',
  'caisse: total du bouclement invalide': 'Total du bouclement invalide.',
  'caisse: periode de rapport invalide': 'Période de rapport invalide.',
  // Encaissement et gardes du ticket (migration v9).
  'caisse: un paiement par carte attend sa reponse sur le terminal': 'Un paiement par carte attend sa réponse sur le terminal.',
  "caisse: un paiement accepte sur le terminal manque a l'encaissement": "Un paiement accepté sur le terminal manque à l'encaissement. Rouvrez l'encaissement.",
  'caisse: un remboursement sur le terminal est en cours pour ce ticket': 'Un remboursement sur le terminal est en cours pour ce ticket.',
  "caisse: ce ticket porte un paiement par carte accepte, a rembourser sur le terminal avant l'abandon": "Ce ticket porte un paiement par carte accepté : remboursez-le sur le terminal avant d'abandonner le ticket.",
  'caisse: ce ticket porte une transaction de terminal, il ne se supprime pas': 'Ce ticket porte un paiement par carte : il ne se supprime pas.',
  "caisse: le terminal n'a pas accepte ce paiement": "Le terminal n'a pas accepté ce paiement.",
  "caisse: le montant du paiement n'est pas celui du terminal": "Le montant du paiement n'est pas celui du terminal. Rouvrez l'encaissement.",
  "caisse: cette transaction de terminal n'est pas celle de ce ticket": "Ce paiement par carte n'est pas celui de ce ticket.",
  "caisse: une transaction de terminal ne sert qu'une fois": "Un paiement par carte ne sert qu'une fois.",
  'caisse: un paiement par terminal relie est un paiement par carte': 'Un paiement par terminal relié est un paiement par carte.',
  "caisse: un paiement par terminal relie se pose par l'encaissement": "Un paiement par terminal relié se pose par l'encaissement.",
};

export function messageTpe(brut, repli = 'Le terminal ne répond pas. Réessayez.') {
  const t = String(brut || '');
  if (MESSAGES[t]) return MESSAGES[t];
  if (/^caisse: montant superieur au reste a payer/.test(t)) return 'Ce montant dépasse le reste à payer.';
  if (/^caisse: montant au-dessus du plafond du terminal/.test(t)) return 'Ce montant dépasse le plafond du terminal (Réglages de la caisse).';
  if (/^caisse: ce ticket porte un paiement par carte \(/.test(t)) return 'Ce ticket porte un paiement par carte : son total ne peut pas descendre en dessous.';
  if (/^caisse: /.test(t)) return t.replace(/^caisse: /, '').replace(/^./, (c) => c.toUpperCase());
  return t && !/[{}<>]/.test(t) && t.length <= 160 ? t : repli;
}
