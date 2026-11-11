// SAMPER CONSULTING - caisse-tpe : le terminal simulé.
//
// Aucun appel réseau, aucun argent. Il ne sert que les tickets de test (la
// base le garantit : contrainte test = (prestataire = 'simule') et refus dans
// caisse_tpe_demarrer), pour former l'équipe et pour essayer la caisse.
//
// Il ne garde aucun état : ce qu'il répond se déduit de la transaction (son
// montant, son âge). Les centimes de la part du ticket choisissent le scénario :
//   .01  refusé                      .02  annulé sur le terminal
//   .03  silence, puis accepté (délai dépassé, retrouvé ensuite)
//   .04  erreur réseau, au démarrage et ensuite (le prestataire reste muet)
//   .06  délai du terminal dépassé
//   autre : accepté au bout de trois secondes.
// L'interface est celle de tout adaptateur (voir adaptateurs/index.js).

const ATTENTE_MS = 3000;
// Le scénario .03 se tait plus longtemps que le délai du socle (120 s).
const SILENCE_MS = 130000;

const centimes = (n) => Math.round(Number(n || 0) * 100);
const scenario = (transaction) => centimes(transaction.montant) % 100;
const age = (transaction, maintenant) => maintenant - Date.parse(transaction.created_at);
const idDe = (transaction) => `sim_${String(transaction.reference || transaction.id).replace(/-/g, '').slice(0, 12)}`;

const accord = (transaction) => ({
  statut: 'approuve',
  idPrestataire: idDe(transaction),
  montantCentimes: centimes(transaction.montant),
  pourboireCentimes: centimes(transaction.pourboire),
  devise: 'CHF',
  marque: 'Simulation',
  finCarte: '0000',
  codeAutorisation: 'SIM000',
});

export const simule = {
  id: 'simule',
  nom: 'Terminal simulé',
  simulation: true,
  description: "Aucun appareil, aucun argent : pour s'entraîner en mode test.",
  champsSecret: [{ cle: 'cle', libelle: "Clé d'essai", aide: 'Huit caractères au moins. Ce que vous voulez : ce terminal ne parle à personne.', min: 8, max: 200 }],
  codeJumelage: { libelle: 'Code de jumelage', aide: 'Six lettres ou chiffres, par exemple ESSAI1.' },
  cleDe: (secret) => secret?.cle,

  async jumeler({ code }) {
    if (!/^[A-Z0-9]{6}$/.test(String(code || ''))) {
      return { fait: false, message: 'Code de jumelage refusé : six lettres majuscules ou chiffres.' };
    }
    return { fait: true };
  },

  async dejumeler() {
    return { fait: true };
  },

  async etat() {
    return { relie: true, pourboireSurTerminal: false };
  },

  async demarrer({ transaction }) {
    if (scenario(transaction) === 4) throw new Error('simulation : réseau coupé');
    return { statut: 'en_cours', idPrestataire: idDe(transaction) };
  },

  async statut({ transaction, maintenant }) {
    const s = scenario(transaction);
    const a = age(transaction, maintenant);
    if (s === 4) throw new Error('simulation : réseau coupé');
    if (s === 3) return a >= SILENCE_MS ? accord(transaction) : { statut: 'en_cours', idPrestataire: idDe(transaction) };
    if (a < ATTENTE_MS) return { statut: 'en_cours', idPrestataire: idDe(transaction) };
    if (s === 1) return { statut: 'refuse', idPrestataire: idDe(transaction), message: 'Carte refusée (simulation).' };
    if (s === 2) return { statut: 'annule', idPrestataire: idDe(transaction), message: 'Annulé sur le terminal (simulation).' };
    if (s === 6) return { statut: 'expire', idPrestataire: idDe(transaction), message: 'Délai du terminal dépassé (simulation).' };
    return accord(transaction);
  },

  async annuler({ transaction }) {
    if (scenario(transaction) === 4) throw new Error('simulation : réseau coupé');
    return { statut: 'annule', idPrestataire: idDe(transaction), message: 'Annulé à la caisse.' };
  },

  async rembourser({ memeJour }) {
    return { fait: true, genre: memeJour ? 'void' : 'refund' };
  },
};
