// SAMPER CONSULTING - caisse-tpe : le coeur de la fonction.
//
// Chemin unique : écran, puis cette fonction (jeton de la personne), puis le
// prestataire. Le coeur ne décide d'aucun droit et ne croit pas l'écran : la
// base relit tout (fonctions caisse_tpe_*, migration 20261111_caisse_v9_tpe).
// Il fait trois choses : demander à la base, parler à l'adaptateur, passer
// chaque réponse par la liste blanche avant de la noter ou de la rendre.
//
// Ce que ce fichier ne fait jamais :
//   - rendre, journaliser ou garder la clé d'un terminal : elle vient du
//     coffre, sert à un appel, et meurt avec la requête ;
//   - rendre, journaliser ou garder une réponse brute du prestataire ;
//   - rester ouvert pendant un paiement : il répond tout de suite, l'écran
//     redemande le statut (une Edge Function coupe à 150 s sans réponse).
//
// Sans dépendance à Deno : la base (db), les adaptateurs, l'horloge et le
// journal sont passés en argument. index.ts branche les vrais, les tests du
// dépôt branchent une base en mémoire.

import { suivant, estFinal } from './machine.js';
import { resultatPropre, remboursementPropre, textePropre, vueTerminal, vueTransaction } from './listeBlanche.js';

// Une demande restée sans identifiant du prestataire au bout de ce délai n'a
// jamais abouti : l'écran s'est fermé, ou la fonction a été interrompue.
const DEMARRAGE_PERDU_MS = 15000;
const DIRECTION = ['consultant', 'patron'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const rendre = (statut, corps) => ({ statut, corps });
const refus = (statut, message) => rendre(statut, { error: message });

// Les refus de la base sont des phrases écrites pour l'écran (« caisse: ... »).
// Toute autre erreur est technique : son texte ne sort pas d'ici.
function erreurBase(e) {
  const message = String(e?.message || '');
  if (message.startsWith('caisse:')) return refus(String(e?.code || '') === '42501' ? 403 : 400, message);
  return null;
}

export function creerCoeur({ db, adaptateurs, maintenant = () => Date.now(), journal = () => {} }) {
  // Un appel à l'adaptateur : sa réponse passe par la liste blanche, une
  // exception vaut « injoignable ». Rien d'autre n'en sort.
  async function interroger(adaptateur, methode, args) {
    try {
      return resultatPropre(await adaptateur[methode]({ ...args, maintenant: maintenant() }));
    } catch (e) {
      journal('adaptateur_injoignable', { adaptateur: adaptateur.id, methode, genre: e?.name || 'Error' });
      return { statut: 'injoignable' };
    }
  }

  // Note en base ce que le résultat change, s'il change quelque chose.
  async function appliquer(transaction, resultat) {
    const s = suivant(transaction, resultat, maintenant());
    if (!s) return transaction;
    journal('transaction', { id: transaction.id, de: transaction.statut, vers: s.statut });
    return db.noter(transaction.id, s.statut, s.champs);
  }

  async function terminalEtCle(uid, terminalId) {
    const s = await db.terminalSecret(uid, terminalId);
    let secret = null;
    try { secret = JSON.parse(s.secret); } catch { secret = null; }
    return { terminal: s.terminal, secret, role: s.role, adaptateur: adaptateurs[s.terminal.prestataire] || null };
  }

  const actions = {
    // Les prestataires proposés dans les Réglages : ce qu'il faut saisir, rien de secret.
    async prestataires() {
      return rendre(200, {
        prestataires: Object.values(adaptateurs).map((a) => ({
          id: a.id, nom: a.nom, description: a.description || null, simulation: a.simulation === true,
          champs: (a.champsSecret || []).map((c) => ({ cle: c.cle, libelle: c.libelle, aide: c.aide || null })),
          code: a.codeJumelage ? { libelle: a.codeJumelage.libelle, aide: a.codeJumelage.aide || null } : null,
        })),
      });
    },

    // Relier un terminal : consultant et patron. La clé est lue une fois ici,
    // sert au jumelage, part au coffre, et n'est jamais rendue.
    async terminal_relier(uid, c) {
      const adaptateur = adaptateurs[c.prestataire];
      if (!adaptateur) return refus(400, 'Ce prestataire de terminal n\'est pas disponible.');
      const acces = await db.acces(uid, c.etablissement_id);
      if (!DIRECTION.includes(acces?.role)) return refus(403, 'caisse: acces refuse');
      const secret = {};
      for (const champ of adaptateur.champsSecret || []) {
        const v = typeof c.secret?.[champ.cle] === 'string' ? c.secret[champ.cle].trim() : '';
        if (v.length < (champ.min || 1) || v.length > (champ.max || 200)) {
          return refus(400, `${champ.libelle} : valeur manquante ou trop courte.`);
        }
        secret[champ.cle] = v;
      }
      let jumelage;
      try {
        jumelage = await adaptateur.jumeler({ secret, numeroSerie: c.numero_serie, code: c.code, nom: c.nom });
      } catch (e) {
        journal('jumelage_injoignable', { adaptateur: adaptateur.id, genre: e?.name || 'Error' });
        return refus(502, 'Le prestataire ne répond pas. Réessayez.');
      }
      if (jumelage?.fait !== true) {
        return refus(400, textePropre(jumelage?.message, 160) || 'Le terminal a refusé le jumelage.');
      }
      const cle = String(adaptateur.cleDe?.(secret) || '');
      let terminal;
      try {
        terminal = await db.terminalPoser(uid, {
          etablissementId: c.etablissement_id, prestataire: adaptateur.id, nom: c.nom, numeroSerie: c.numero_serie,
          secret: JSON.stringify(secret), cleFin: cle.length >= 12 ? cle.slice(-4) : null,
        });
      } catch (e) {
        // Le lien n'est pas enregistré : on défait le jumelage, sans insister.
        try { await adaptateur.dejumeler({ secret, numeroSerie: c.numero_serie }); } catch { /* rien à faire de plus */ }
        throw e;
      }
      journal('terminal_relie', { id: terminal.id, adaptateur: adaptateur.id });
      return rendre(200, { terminal: vueTerminal(terminal) });
    },

    // Retirer un terminal : consultant et patron. Le prestataire est prévenu
    // si possible ; le retrait se fait même s'il ne répond pas.
    async terminal_retirer(uid, c) {
      let dejumele = null;
      try {
        const t = await terminalEtCle(uid, c.terminal_id);
        if (!DIRECTION.includes(t.role)) return refus(403, 'caisse: acces refuse');
        if (t.adaptateur && t.secret) {
          try { dejumele = (await t.adaptateur.dejumeler({ secret: t.secret, numeroSerie: t.terminal.numero_serie }))?.fait === true; } catch { dejumele = false; }
        }
      } catch (e) {
        // Clé déjà absente du coffre : le retrait reste possible. Un refus de
        // droit, lui, s'arrête ici.
        if (String(e?.code || '') === '42501') throw e;
      }
      const terminal = await db.terminalRetirer(uid, c.terminal_id);
      journal('terminal_retire', { id: terminal.id });
      return rendre(200, { terminal: vueTerminal(terminal), dejumele });
    },

    // L'état du lien, vu du prestataire.
    async terminal_etat(uid, c) {
      const t = await terminalEtCle(uid, c.terminal_id);
      if (!t.adaptateur || !t.secret) return rendre(200, { relie: null, pourboireSurTerminal: null });
      try {
        const e = await t.adaptateur.etat({ secret: t.secret, numeroSerie: t.terminal.numero_serie });
        return rendre(200, {
          relie: typeof e?.relie === 'boolean' ? e.relie : null,
          pourboireSurTerminal: typeof e?.pourboireSurTerminal === 'boolean' ? e.pourboireSurTerminal : null,
        });
      } catch {
        return rendre(200, { relie: null, pourboireSurTerminal: null });
      }
    },

    // Démarrer : la base valide et crée la transaction (ou rend celle de la
    // même référence), puis seulement le terminal est appelé. Une transaction
    // déjà créée n'appelle jamais le terminal une seconde fois.
    async demarrer(uid, c) {
      const d = await db.demarrer(uid, {
        ticketId: c.ticket_id, terminalId: c.terminal_id, montant: c.montant, pourboire: c.pourboire || 0,
        reference: c.reference, devise: c.devise || 'CHF',
      });
      let transaction = d.transaction;
      if (d.nouvelle !== true) return rendre(200, { transaction: vueTransaction(transaction) });
      let t;
      try {
        t = await terminalEtCle(uid, transaction.terminal_id);
      } catch {
        t = null;
      }
      if (!t || !t.adaptateur || !t.secret) {
        // Rien n'est parti vers un terminal : la tentative est close, sans doute possible.
        transaction = await db.noter(transaction.id, 'refuse', { message: 'Terminal indisponible : le relier à nouveau dans les Réglages.' });
        return rendre(200, { transaction: vueTransaction(transaction) });
      }
      const resultat = await interroger(t.adaptateur, 'demarrer', { secret: t.secret, numeroSerie: t.terminal.numero_serie, transaction });
      transaction = await appliquer(transaction, resultat);
      return rendre(200, { transaction: vueTransaction(transaction) });
    },

    // Redemander le statut. Sert au suivi (toutes les deux secondes) comme au
    // « Redemander » d'un résultat incertain.
    async statut(uid, c) {
      const lu = await db.lire(uid, c.transaction_id);
      let transaction = lu.transaction;
      if (estFinal(transaction.statut)) return rendre(200, { transaction: vueTransaction(transaction) });
      if (!transaction.prestataire_id) {
        // Le démarrage n'a jamais abouti : après un court délai c'est un doute.
        if (transaction.statut === 'demande' && maintenant() - Date.parse(transaction.created_at) > DEMARRAGE_PERDU_MS) {
          transaction = await appliquer(transaction, { statut: 'injoignable' });
        }
        return rendre(200, { transaction: vueTransaction(transaction) });
      }
      let t;
      try { t = await terminalEtCle(uid, transaction.terminal_id); } catch { t = null; }
      const resultat = t && t.adaptateur && t.secret
        ? await interroger(t.adaptateur, 'statut', { secret: t.secret, numeroSerie: t.terminal.numero_serie, transaction })
        : { statut: 'injoignable' };
      transaction = await appliquer(transaction, resultat);
      return rendre(200, { transaction: vueTransaction(transaction) });
    },

    // Annuler à la caisse un paiement en route. Le terminal a le dernier mot :
    // s'il a déjà accepté, la transaction est approuvée.
    async annuler(uid, c) {
      const lu = await db.lire(uid, c.transaction_id);
      let transaction = lu.transaction;
      if (estFinal(transaction.statut) || transaction.statut === 'incertain') {
        return rendre(200, { transaction: vueTransaction(transaction) });
      }
      if (!transaction.prestataire_id) return actions.statut(uid, c);
      let t;
      try { t = await terminalEtCle(uid, transaction.terminal_id); } catch { t = null; }
      const resultat = t && t.adaptateur && t.secret
        ? await interroger(t.adaptateur, 'annuler', { secret: t.secret, numeroSerie: t.terminal.numero_serie, transaction })
        : { statut: 'injoignable' };
      transaction = await appliquer(transaction, resultat);
      return rendre(200, { transaction: vueTransaction(transaction) });
    },

    // Trancher un résultat incertain : la base vérifie le rôle et le motif.
    async trancher(uid, c) {
      const transaction = await db.trancher(uid, c.transaction_id, c.decision, c.motif);
      journal('transaction_tranchee', { id: transaction.id, vers: transaction.statut });
      return rendre(200, { transaction: vueTransaction(transaction) });
    },

    // Rembourser sur le terminal : un geste à part, consultant et patron.
    // Annulation du jour si l'accord est du jour, remboursement sinon.
    async rembourser(uid, c) {
      const d = await db.rembourserDemander(uid, c.transaction_id);
      let transaction = d.transaction;
      let reponse;
      try {
        const t = await terminalEtCle(uid, transaction.terminal_id);
        if (!t.adaptateur || !t.secret) throw new Error('terminal indisponible');
        reponse = remboursementPropre(await t.adaptateur.rembourser({
          secret: t.secret, numeroSerie: t.terminal.numero_serie, transaction, memeJour: d.meme_jour === true,
        }));
      } catch (e) {
        journal('remboursement_injoignable', { id: transaction.id, genre: e?.name || 'Error' });
        reponse = { fait: false, genre: null, message: 'Le terminal ne répond pas : remboursement à faire sur le terminal.' };
      }
      transaction = await db.rembourserNoter(transaction.id, reponse.fait, reponse.genre, reponse.message);
      journal('remboursement', { id: transaction.id, fait: reponse.fait });
      return rendre(200, { transaction: vueTransaction(transaction) });
    },
  };

  const IDS = ['ticket_id', 'terminal_id', 'transaction_id', 'reference'];

  async function traiter(uid, corps) {
    if (!uid) return refus(401, 'Non authentifié.');
    const c = corps && typeof corps === 'object' && !Array.isArray(corps) ? corps : {};
    const action = typeof c.action === 'string' && Object.prototype.hasOwnProperty.call(actions, c.action) ? c.action : null;
    if (!action) return refus(400, 'Action inconnue.');
    for (const cle of IDS) {
      if (c[cle] != null && !UUID.test(String(c[cle]))) return refus(400, 'Identifiant invalide.');
    }
    try {
      return await actions[action](uid, c);
    } catch (e) {
      const connu = erreurBase(e);
      if (connu) return connu;
      journal('erreur', { action, genre: e?.name || 'Error', code: String(e?.code || '') });
      return refus(500, 'Erreur technique. Réessayez.');
    }
  }

  return { traiter };
}

// La porte d'entrée, sans Deno : pas de jeton, pas de personne, pas d'appel.
//   demande : { methode, autorisation, corps }
//   lireUtilisateur(autorisation) -> identifiant de la personne, ou null.
export async function gererRequete(demande, { coeur, lireUtilisateur }) {
  if (demande.methode !== 'POST') return refus(405, 'Méthode non admise.');
  if (!demande.autorisation || !/^Bearer\s+\S+/.test(demande.autorisation)) return refus(401, 'Non authentifié.');
  let uid = null;
  try { uid = await lireUtilisateur(demande.autorisation); } catch { uid = null; }
  if (!uid) return refus(401, 'Non authentifié.');
  return coeur.traiter(uid, demande.corps);
}
