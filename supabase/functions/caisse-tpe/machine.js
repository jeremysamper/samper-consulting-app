// SAMPER CONSULTING - caisse-tpe : machine à états d'une transaction de terminal.
//
// Fonctions pures, sans import : lues par l'Edge Function (Deno) et par les
// tests du dépôt (node --test). La base porte la même table de transitions
// dans le déclencheur caisse_tpe_transaction_garde : ce fichier décide, la
// base refuse ce qui ne se peut pas.
//
//   demande    : la ligne existe, le prestataire n'a pas encore répondu ;
//   en_cours   : le terminal attend la carte ;
//   approuve   : payé (final) ;
//   refuse     : refusé par le terminal ou le prestataire (final) ;
//   annule     : annulé à la caisse ou sur le terminal (final) ;
//   expire     : le terminal a laissé passer son délai (final) ;
//   incertain  : on ne sait pas. Rien n'est posé. Il ne redevient jamais
//                « en cours » : soit le prestataire finit par répondre, soit
//                un responsable tranche.

export const STATUTS = ['demande', 'en_cours', 'approuve', 'refuse', 'annule', 'expire', 'incertain'];
export const FINAUX = ['approuve', 'refuse', 'annule', 'expire'];

const TRANSITIONS = {
  demande: ['en_cours', 'approuve', 'refuse', 'annule', 'expire', 'incertain'],
  en_cours: ['approuve', 'refuse', 'annule', 'expire', 'incertain'],
  incertain: ['approuve', 'refuse', 'annule', 'expire'],
  approuve: [],
  refuse: [],
  annule: [],
  expire: [],
};

// Sans réponse finale au bout de ce délai, la transaction devient incertaine.
export const DELAI_REPONSE_MS = 120000;

export const estFinal = (statut) => FINAUX.includes(statut);
export const peutPasser = (de, vers) => (TRANSITIONS[de] || []).includes(vers);
// Tant qu'une transaction est dans un de ces états, aucune autre ne démarre
// sur le même ticket (un geste, un débit au plus).
export const bloqueTicket = (statut) => statut === 'demande' || statut === 'en_cours' || statut === 'incertain';
// Le terminal, lui, n'est tenu que par une transaction réellement en route.
export const bloqueTerminal = (statut) => statut === 'demande' || statut === 'en_cours';

export const enCentimes = (n) => Math.round(Number(n || 0) * 100);
const enFrancs = (c) => Math.round(Number(c)) / 100;

const champs = (r, plus = {}) => ({
  prestataire_id: r?.idPrestataire ?? null,
  marque: r?.marque ?? null,
  fin_carte: r?.finCarte ?? null,
  code_autorisation: r?.codeAutorisation ?? null,
  message: r?.message ?? null,
  ...plus,
});

// Ce que devient une transaction quand le prestataire rend `resultat` (déjà
// passé par la liste blanche) à l'instant `maintenant` (millisecondes).
// Rend { statut, champs } ou null quand rien ne change.
//   resultat.statut : en_cours, approuve, refuse, annule, expire, incertain,
//   ou injoignable (pas de réponse du prestataire).
export function suivant(transaction, resultat, maintenant) {
  if (!transaction || !resultat || estFinal(transaction.statut)) return null;
  const de = transaction.statut;
  const tard = maintenant - Date.parse(transaction.created_at) > DELAI_REPONSE_MS;
  const incertain = (message) => (de === 'incertain'
    ? null
    : { statut: 'incertain', champs: champs(resultat, { message }) });

  switch (resultat.statut) {
    case 'approuve': {
      // Un accord ne vaut que pour le montant et la devise demandés.
      if (resultat.devise != null && resultat.devise !== (transaction.devise || 'CHF')) {
        return incertain('Le terminal a répondu dans une autre devise.');
      }
      if (resultat.montantCentimes == null || resultat.montantCentimes !== enCentimes(transaction.montant)) {
        return incertain('Le terminal a répondu pour un autre montant.');
      }
      // Un accord sans identifiant du prestataire ne se pose pas : on ne
      // pourrait ni le retrouver ni le rembourser.
      if (!resultat.idPrestataire && !transaction.prestataire_id) {
        return incertain('Accord du terminal sans identifiant.');
      }
      const pourboire = resultat.pourboireCentimes == null
        ? Number(transaction.pourboire || 0)
        : enFrancs(resultat.pourboireCentimes);
      return { statut: 'approuve', champs: champs(resultat, { pourboire, message: null }) };
    }
    case 'refuse':
    case 'annule':
    case 'expire':
      return { statut: resultat.statut, champs: champs(resultat) };
    case 'en_cours':
      if (de === 'incertain') return null;
      if (tard) return incertain('Le terminal ne répond pas.');
      if (de === 'demande') return { statut: 'en_cours', champs: champs(resultat) };
      return null;
    case 'injoignable':
      if (de === 'incertain') return null;
      // Au démarrage, une demande sans réponse est déjà un doute : le
      // terminal l'a peut-être reçue.
      if (de === 'demande' || tard) return incertain('Le terminal ne répond pas.');
      return null;
    default:
      return incertain('Réponse du terminal illisible.');
  }
}
