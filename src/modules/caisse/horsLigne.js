// ─────────────────────────────────────────────────────────────────────────────
// Encaisser en espèces quand le réseau tombe (lot 07 du panel, 25.11.2026).
//
// Fonctions pures, sans React ni réseau. Une maison qui a allumé le réglage
// « Encaisser en espèces sans réseau » peut, sans réseau, encaisser en espèces
// un ticket déjà ouvert et déjà chargé à l'écran. La vente est gardée sur
// l'appareil (file IndexedDB « caisse-queue ») avec l'heure du geste et une
// clé d'idempotence, puis rejouée au retour du réseau par la RPC
// caisse_encaisser_hors_ligne, qui appelle caisse_encaisser telle quelle : la
// base reste seule à numéroter et à sceller. Carte, terminal, bon cadeau,
// note de chambre et ticket de test restent refusés hors ligne.
//
// Un élément de la file ne porte aucune donnée de client (ni nom, ni adresse,
// ni nom de retrait) : seulement de quoi rejouer la vente et la reconnaître.
// ─────────────────────────────────────────────────────────────────────────────

import { manquesLegaux } from './reglages.js';
import { estSimule } from './tpe/ecranTpe.js';
import { totalLigne, totalLignes } from './tva.js';

export const ETATS_FILE = ['attente', 'refuse', 'deja_encaisse'];

// Pourquoi rien ne s'encaisse sans réseau, en une phrase pour le bandeau.
export const RAISONS_HORS_LIGNE = {
  eteint: null,
  reglages: "Pas de réseau : les réglages de la caisse n'ont pas été lus, rien ne s'encaisse. Le ticket reste ouvert.",
  test: "Pas de réseau : un ticket de test ne s'encaisse pas hors ligne.",
  vide: "Pas de réseau : un ticket vide ne s'encaisse pas.",
  moyen: "Pas de réseau : ce ticket porte déjà un paiement qui n'est pas en espèces. Il reste ouvert, encaissez-le dès que le réseau revient.",
  legal: 'Pas de réseau : les coordonnées légales de la maison sont incomplètes. Le ticket reste ouvert.',
  carte: "Pas de réseau : les paiements par carte de ce ticket n'ont pas été lus avant la coupure. Il reste ouvert, encaissez-le dès que le réseau revient.",
  en_route: 'Pas de réseau : un paiement par carte est en route sur le terminal. Le ticket reste ouvert, encaissez-le dès que le réseau revient.',
};

const refus = (code) => ({ ok: false, code, raison: RAISONS_HORS_LIGNE[code] });

const estEspecesSeules = (p) => p && p.moyen === 'especes' && !p.tpe && !p.bonCadeau && !p.bon_cadeau && !p.sejourId;

// Ce ticket peut-il s'encaisser en espèces sans réseau ?
//   reglages        : réglages fusionnés (reglages.js), avec reglagesLus ;
//   paiements       : paiements posés, plus celui qu'on s'apprête à poser ;
//   terminaux       : terminaux de la maison (caisse_tpe_terminaux) ;
//   lectureTpe      : 'sans' | 'lecture' | 'lue' | 'echec' (Encaissement.jsx) ;
//   paiementEnRoute : paiement par carte resté en route, ou null.
// Rend { ok, code, raison } ; raison est nulle quand le réglage est éteint
// (l'écran reste alors celui d'avant, mot pour mot).
export function peutEncaisserHorsLigne({ reglages, ticket, paiements, terminaux, lectureTpe, paiementEnRoute } = {}) {
  if (reglages?.especes_hors_ligne !== true) return refus('eteint');
  if (reglages.reglagesLus === false) return refus('reglages');
  if (!ticket || ticket.test) return refus('test');
  if (!(ticket.lignes || []).length) return refus('vide');
  if (!(paiements || []).every(estEspecesSeules)) return refus('moyen');
  if (manquesLegaux(reglages.legal).length) return refus('legal');
  // Une carte acceptée ne doit pas être oubliée : avec un vrai terminal, les
  // paiements par carte du ticket doivent avoir été lus avant la coupure.
  const reels = (terminaux || []).filter((t) => t && t.actif && !estSimule(t));
  if (reels.length) {
    if (paiementEnRoute) return refus('en_route');
    if (lectureTpe !== 'lue') return refus('carte');
  }
  return { ok: true, code: null, raison: null };
}

const deuxDecimales = (n) => Math.round(Number(n || 0) * 100) / 100;

// Le titre d'une vente gardée, sans nom de client : la table se résout à
// l'affichage (tableId), une vente directe dit son numéro de retrait.
function titreSansClient(ticket) {
  if (ticket?.table_id) return null;
  return ticket?.retrait_numero != null ? `Retrait n° ${ticket.retrait_numero}` : 'Vente directe';
}

// L'élément gardé dans la file. `controle` est le résultat de
// preparerPaiements (tva.js) : le rendu et l'arrondi viennent de lui.
export function elementDeFile({ clientUuid, ticket, paiements, aEmporter, controle, userId, poste, gesteAt, maintenant = Date.now() }) {
  const lignes = ticket?.lignes || [];
  return {
    clientUuid,
    etablissementId: ticket?.etablissement_id || null,
    ticketId: ticket?.id || null,
    userId: userId || null,
    poste: poste ? String(poste).slice(0, 60) : null,
    gesteAt,
    createdAt: maintenant,
    aEmporter: Boolean(aEmporter),
    paiements: (paiements || []).map((p) => ({
      moyen: 'especes',
      libelle: p.libelle || null,
      montant: deuxDecimales(p.montant),
      recu: p.recu == null || p.recu === '' ? null : deuxDecimales(p.recu),
      pourboire: deuxDecimales(p.pourboire),
    })),
    etat: 'attente',
    motif: null,
    numero: null,
    apercu: {
      titre: titreSansClient(ticket),
      tableId: ticket?.table_id || null,
      total: totalLignes(lignes),
      du: deuxDecimales(controle?.encaisse),
      rendu: deuxDecimales(controle?.rendu),
      arrondi: deuxDecimales(controle?.arrondi),
      pourboire: deuxDecimales(controle?.pourboire),
      lignes: lignes.map((l) => ({ libelle: l.libelle, quantite: Number(l.quantite), total: totalLigne(l) })),
    },
  };
}

// Ce que le rejeu fait d'une réponse de caisse_encaisser_hors_ligne.
//   'rejoue'        : la vente a son numéro, l'élément sort de la file ;
//   'deja_encaisse' : le ticket était déjà encaissé, l'élément reste, marqué ;
//   'refuse'        : la caisse a refusé, l'élément reste, marqué ;
//   'reessayer'     : réseau, jeton ou panne passagère, rien ne change.
// Seul un refus de la caisse (P0001 ou 42501, message « caisse: ») fige une
// vente en refus : une panne passagère ne doit jamais le faire.
export function classerRejeu(reponse, erreur) {
  if (!erreur) {
    return ['rejoue', 'deja_encaisse', 'refuse'].includes(reponse?.statut) ? reponse.statut : 'reessayer';
  }
  const code = String(erreur.code || '');
  if (!code || code === 'PGRST202' || code === 'PGRST301') return 'reessayer';
  if ((code === 'P0001' || code === '42501') && String(erreur.message || '').startsWith('caisse:')) return 'refuse';
  return 'reessayer';
}

// Les tickets ouverts sans ceux dont la vente attend son envoi sur cet
// appareil. Un ticket dont la vente est refusée ou déjà encaissée réapparaît :
// il doit pouvoir être repris en ligne.
export function ticketsHorsFile(tickets, file) {
  const enAttente = new Set((file || []).filter((e) => e && e.etat === 'attente').map((e) => e.ticketId));
  if (!enAttente.size) return tickets || [];
  return (tickets || []).filter((t) => !enAttente.has(t.id));
}
