// Base en mémoire pour les tests de l'Edge Function caisse-tpe. Elle rejoue
// en petit les règles des fonctions caisse_tpe_* (migration v9) : droits par
// personne, ticket ouvert de la maison, reste à payer, plafond, une seule
// transaction en route par ticket et par terminal, terminal simulé pour les
// tickets de test seulement, table des transitions. La preuve de ces règles
// sur la vraie base est l'essai à blanc de la migration ; ici on prouve ce que
// le coeur fait de leurs réponses, et ce qu'il envoie.
//
// Tout ce que la base reçoit est gardé dans `recu` : les tests y cherchent la
// clé d'essai et le numéro de carte.

import { peutPasser } from '../../../../supabase/functions/caisse-tpe/machine.js';

const refus = (message, code = 'P0001') => Object.assign(new Error(message), { code });
const DIRECTION = ['consultant', 'patron'];
const RESPONSABLES = ['consultant', 'patron', 'resp_cuisine'];

export function creerFausseBase({ horloge }) {
  const etat = {
    personnes: new Map(), // uid -> { role, peut, maisons: [], actif }
    tickets: new Map(), // id -> { id, etablissement_id, statut, test, total }
    terminaux: new Map(),
    coffre: new Map(), // terminal id -> secret (texte)
    transactions: new Map(),
    journal: [],
    plafond: 5000,
  };
  const recu = []; // chaque appel reçu, tel quel
  let compteur = 0;
  const id = (p) => `00000000-0000-4000-8000-${String((compteur += 1)).padStart(8, '0')}${p}`;
  const iso = () => new Date(horloge()).toISOString();

  const acces = (uid, etab) => {
    const p = etat.personnes.get(uid);
    if (!p || p.actif === false || !p.role || !p.maisons.includes(etab)) return { role: null, peut: false, nom: null };
    return { role: p.role, peut: p.peut !== false, nom: p.nom || null };
  };
  const reste = (ticketId) => {
    const t = etat.tickets.get(ticketId);
    const pris = [...etat.transactions.values()]
      .filter((x) => x.ticket_id === ticketId && x.statut === 'approuve' && x.rembourse_statut !== 'fait')
      .reduce((s, x) => s + x.montant, 0);
    return Math.round((t.total - pris) * 100) / 100;
  };
  const copie = (o) => JSON.parse(JSON.stringify(o));

  const db = {
    async acces(uid, etab) { recu.push(['acces', uid, etab]); return acces(uid, etab); },

    async terminalPoser(uid, t) {
      recu.push(['terminalPoser', uid, copie(t)]);
      if (!DIRECTION.includes(acces(uid, t.etablissementId).role)) throw refus('caisse: acces refuse', '42501');
      const terminal = {
        id: id('aaaa'), etablissement_id: t.etablissementId, nom: t.nom, prestataire: t.prestataire,
        numero_serie: t.numeroSerie, actif: true, cle_fin: t.cleFin, relie_par: uid, relie_at: iso(),
        premier_paiement_reel_at: null,
      };
      etat.terminaux.set(terminal.id, terminal);
      etat.coffre.set(terminal.id, t.secret);
      etat.journal.push({ libelle: `Terminal de paiement relié : ${t.nom}`, apres: { prestataire: t.prestataire, numero_serie: t.numeroSerie } });
      return copie(terminal);
    },

    async terminalRetirer(uid, terminalId) {
      recu.push(['terminalRetirer', uid, terminalId]);
      const t = etat.terminaux.get(terminalId);
      if (!t) throw refus('caisse: terminal introuvable');
      if (!DIRECTION.includes(acces(uid, t.etablissement_id).role)) throw refus('caisse: acces refuse', '42501');
      t.actif = false;
      etat.coffre.delete(terminalId);
      return copie(t);
    },

    async terminalSecret(uid, terminalId) {
      recu.push(['terminalSecret', uid, terminalId]);
      const t = etat.terminaux.get(terminalId);
      if (!t) throw refus('caisse: terminal introuvable');
      const a = acces(uid, t.etablissement_id);
      if (!a.peut) throw refus('caisse: acces refuse', '42501');
      if (!t.actif) throw refus("caisse: ce terminal n'est plus relie");
      if (!etat.coffre.has(terminalId)) throw refus('caisse: cle du terminal introuvable, le relier a nouveau');
      return { terminal: copie(t), secret: etat.coffre.get(terminalId), role: a.role };
    },

    async demarrer(uid, d) {
      recu.push(['demarrer', uid, copie(d)]);
      const ticket = etat.tickets.get(d.ticketId);
      if (!ticket) throw refus('caisse: ticket introuvable');
      if (!acces(uid, ticket.etablissement_id).peut) throw refus('caisse: acces refuse', '42501');
      const terminal = etat.terminaux.get(d.terminalId);
      if (!terminal || terminal.etablissement_id !== ticket.etablissement_id) throw refus('caisse: terminal inconnu pour cette maison', '42501');
      const deja = [...etat.transactions.values()].find((x) => x.reference === d.reference);
      if (deja) {
        if (deja.ticket_id !== d.ticketId || deja.terminal_id !== d.terminalId || deja.montant !== d.montant) {
          throw refus('caisse: reference de transaction deja utilisee');
        }
        return { transaction: copie(deja), nouvelle: false };
      }
      if (!terminal.actif) throw refus("caisse: ce terminal n'est plus relie");
      if (ticket.statut !== 'ouvert') throw refus("caisse: le ticket n'est pas ouvert");
      if (ticket.test && terminal.prestataire !== 'simule') throw refus('caisse: un ticket de test ne part jamais sur un vrai terminal');
      if (!ticket.test && terminal.prestataire === 'simule') throw refus('caisse: le terminal simule ne sert que les tickets de test');
      if (d.devise !== 'CHF') throw refus("caisse: le terminal n'encaisse qu'en francs suisses");
      if (!(d.montant > 0) || d.pourboire < 0) throw refus('caisse: montant de paiement invalide');
      if (d.montant + d.pourboire > etat.plafond) throw refus(`caisse: montant au-dessus du plafond du terminal (${etat.plafond})`);
      if (d.montant > reste(d.ticketId) + 0.004) throw refus('caisse: montant superieur au reste a payer');
      const enRoute = [...etat.transactions.values()];
      if (enRoute.some((x) => x.ticket_id === d.ticketId && ['demande', 'en_cours', 'incertain'].includes(x.statut))) {
        throw refus('caisse: un paiement par carte est deja en route pour ce ticket');
      }
      if (enRoute.some((x) => x.terminal_id === d.terminalId && ['demande', 'en_cours'].includes(x.statut))) {
        throw refus('caisse: ce terminal est occupe par un autre paiement');
      }
      const tx = {
        id: id('bbbb'), etablissement_id: ticket.etablissement_id, ticket_id: d.ticketId, terminal_id: d.terminalId,
        test: ticket.test, prestataire: terminal.prestataire, montant: d.montant, pourboire: d.pourboire, devise: 'CHF',
        statut: 'demande', reference: d.reference, prestataire_id: null, marque: null, fin_carte: null,
        code_autorisation: null, message: null, demande_par: uid, created_at: iso(), final_at: null,
        tranche_at: null, rembourse_statut: null, rembourse_genre: null, rembourse_message: null,
      };
      etat.transactions.set(tx.id, tx);
      return { transaction: copie(tx), nouvelle: true };
    },

    async noter(transactionId, statut, champs) {
      recu.push(['noter', transactionId, statut, copie(champs || {})]);
      const tx = etat.transactions.get(transactionId);
      if (!tx) throw refus('caisse: transaction de terminal introuvable');
      if (!peutPasser(tx.statut, statut)) return copie(tx);
      const c = champs || {};
      tx.statut = statut;
      tx.prestataire_id = c.prestataire_id || tx.prestataire_id;
      tx.marque = c.marque || tx.marque;
      tx.fin_carte = c.fin_carte || tx.fin_carte;
      tx.code_autorisation = c.code_autorisation || tx.code_autorisation;
      tx.message = statut === 'approuve' ? null : (c.message || tx.message);
      if (statut === 'approuve' && typeof c.pourboire === 'number') tx.pourboire = c.pourboire;
      if (['approuve', 'refuse', 'annule', 'expire'].includes(statut)) tx.final_at = iso();
      return copie(tx);
    },

    async lire(uid, transactionId) {
      recu.push(['lire', uid, transactionId]);
      const tx = etat.transactions.get(transactionId);
      if (!tx) throw refus('caisse: transaction de terminal introuvable');
      const a = acces(uid, tx.etablissement_id);
      if (!a.peut) throw refus('caisse: acces refuse', '42501');
      return { transaction: copie(tx), role: a.role };
    },

    async trancher(uid, transactionId, decision, motif) {
      recu.push(['trancher', uid, transactionId, decision, motif]);
      const tx = etat.transactions.get(transactionId);
      if (!tx) throw refus('caisse: transaction de terminal introuvable');
      if (!RESPONSABLES.includes(acces(uid, tx.etablissement_id).role)) throw refus('caisse: acces refuse', '42501');
      if (!['paye', 'non_paye'].includes(decision)) throw refus('caisse: decision inconnue');
      if (tx.statut !== 'incertain') throw refus('caisse: seule une transaction incertaine se tranche');
      if (String(motif || '').trim().length < 3) throw refus('caisse: un motif est obligatoire (3 a 300 caracteres)');
      tx.statut = decision === 'paye' ? 'approuve' : 'annule';
      tx.tranche_at = iso();
      tx.final_at = iso();
      etat.journal.push({ libelle: `Paiement par carte incertain tranché : ${decision === 'paye' ? 'payé' : 'non payé'}`, motif });
      return copie(tx);
    },

    async rembourserDemander(uid, transactionId) {
      recu.push(['rembourserDemander', uid, transactionId]);
      const tx = etat.transactions.get(transactionId);
      if (!tx) throw refus('caisse: transaction de terminal introuvable');
      if (!DIRECTION.includes(acces(uid, tx.etablissement_id).role)) throw refus('caisse: acces refuse', '42501');
      if (tx.statut !== 'approuve') throw refus('caisse: seul un paiement accepte se rembourse');
      if (tx.rembourse_statut === 'fait') throw refus('caisse: ce paiement est deja rembourse');
      if (etat.tickets.get(tx.ticket_id).statut === 'encaisse') throw refus("caisse: annuler d'abord le ticket, depuis l'historique");
      tx.rembourse_statut = 'demande';
      return { transaction: copie(tx), meme_jour: true };
    },

    async rembourserNoter(transactionId, fait, genre, message) {
      recu.push(['rembourserNoter', transactionId, fait, genre, message]);
      const tx = etat.transactions.get(transactionId);
      if (tx.rembourse_statut !== 'demande') return copie(tx);
      tx.rembourse_statut = fait ? 'fait' : 'echec';
      tx.rembourse_genre = genre;
      tx.rembourse_message = message;
      return copie(tx);
    },
  };

  return { db, etat, recu, reste };
}
