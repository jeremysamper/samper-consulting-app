import { supabase } from './supabase.js';
import { messageTpe } from '../modules/caisse/tpe/ecranTpe.js';

// ─────────────────────────────────────────────────────────────────────────────
// Caisse v9 : terminal de paiement relié (migration 20261111_caisse_v9_tpe,
// Edge Function caisse-tpe).
//
// Le navigateur ne parle qu'à Supabase. Tout ce qui touche un terminal passe
// par l'Edge Function caisse-tpe, avec le jeton de la personne : relier,
// retirer, démarrer, redemander le statut, annuler, trancher, rembourser. Les
// tables se lisent (RLS : qui a la caisse de la maison) et ne s'écrivent
// jamais d'ici. La clé d'un terminal part une fois vers la fonction et ne
// revient pas : aucune lecture de ce fichier ne la contient.
//
// Comme caisseService : { data, error }, l'erreur est un message affichable,
// et une lecture en échec ne rend jamais une liste vide.
// ─────────────────────────────────────────────────────────────────────────────

async function appeler(action, charge = {}, repli) {
  try {
    const { data, error } = await supabase.functions.invoke('caisse-tpe', { body: { action, ...charge } });
    if (error) {
      // FunctionsHttpError : le message utile est dans le corps de la réponse.
      // Sans réponse du serveur (context absent), on ne sait pas si la demande
      // est arrivée : reseau = true, l'appelant rejoue la MÊME demande.
      let message = null;
      const repondu = Boolean(error.context && typeof error.context.status === 'number');
      try { message = (await error.context?.json?.())?.error || null; } catch { /* corps illisible */ }
      return { data: null, error: messageTpe(message, repli), reseau: !repondu };
    }
    if (data?.error) return { data: null, error: messageTpe(data.error, repli), reseau: false };
    return { data, error: null, reseau: false };
  } catch (e) {
    console.error('[caisseTpeService]', action, e?.name || 'Error');
    return { data: null, error: messageTpe(null, repli), reseau: true };
  }
}

function erreurLecture(error, repli) {
  console.error('[caisseTpeService]', error?.code || '', error?.message || '');
  return messageTpe(error?.message, repli);
}

// ── Terminaux d'une maison (reliés et retirés : un terminal retiré reste cité
// par ses transactions). Colonnes nommées : rien d'autre ne se lit. ──
const COLONNES_TERMINAL = 'id, etablissement_id, nom, prestataire, numero_serie, actif, cle_fin, relie_at, relie_par_nom, retire_at, premier_paiement_reel_at';
export async function listTerminaux(etablissementId) {
  const { data, error } = await supabase
    .from('caisse_tpe_terminaux')
    .select(COLONNES_TERMINAL)
    .eq('etablissement_id', etablissementId)
    .order('actif', { ascending: false })
    .order('relie_at', { ascending: true });
  if (error) return { data: null, error: erreurLecture(error, 'Terminaux illisibles. Réessayez.') };
  return { data: data || [], error: null };
}

// Les prestataires que la fonction sait piloter, et ce qu'il faut saisir.
export const listPrestataires = () => appeler('prestataires', {}, 'Prestataires illisibles. Réessayez.');

// Relier : la clé (secret) part ici, une fois. Elle n'est gardée nulle part
// dans le navigateur ; l'appelant vide son champ dès la réponse.
export const relierTerminal = ({ etablissementId, prestataire, nom, numeroSerie, secret, code }) => appeler('terminal_relier', {
  etablissement_id: etablissementId, prestataire, nom, numero_serie: numeroSerie, secret, code,
}, "Le terminal n'a pas pu être relié. Réessayez.");
export const retirerTerminal = (terminalId) => appeler('terminal_retirer', { terminal_id: terminalId }, "Le terminal n'a pas pu être retiré. Réessayez.");
export const etatTerminal = (terminalId) => appeler('terminal_etat', { terminal_id: terminalId }, 'État du terminal illisible.');

// ── Transactions ──
const COLONNES_TRANSACTION = 'id, ticket_id, terminal_id, statut, montant, pourboire, devise, test, marque, fin_carte, code_autorisation, message, created_at, final_at, tranche_at, tranche_par_nom, tranche_motif, rembourse_statut, rembourse_genre, rembourse_message, rembourse_at';
const vue = (t) => ({ ...t, montant: Number(t.montant), pourboire: Number(t.pourboire), tranche: t.tranche_at != null });

// Les transactions d'un ticket, de la plus ancienne à la plus récente.
export async function listTransactionsTicket(ticketId) {
  const { data, error } = await supabase
    .from('caisse_tpe_transactions')
    .select(COLONNES_TRANSACTION)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) return { data: null, error: erreurLecture(error, 'Paiements par carte illisibles. Réessayez.') };
  return { data: (data || []).map(vue), error: null };
}

// Démarrer : la référence est tirée par l'écran, une par tentative. Rejouer
// la même référence rend la même transaction, sans second débit.
export const demarrerPaiement = ({ ticketId, terminalId, montant, pourboire = 0, reference }) => appeler('demarrer', {
  ticket_id: ticketId, terminal_id: terminalId, montant, pourboire, reference,
});
export const statutPaiement = (transactionId) => appeler('statut', { transaction_id: transactionId });
export const annulerPaiement = (transactionId) => appeler('annuler', { transaction_id: transactionId });
export const trancherPaiement = (transactionId, decision, motif) => appeler('trancher', {
  transaction_id: transactionId, decision, motif,
}, "La décision n'a pas été enregistrée. Réessayez.");
export const rembourserPaiement = (transactionId) => appeler('rembourser', { transaction_id: transactionId },
  "Le remboursement n'a pas pu être demandé. Réessayez.");

// ── Clôture : bouclement du terminal ──
export async function poserBouclement({ etablissementId, terminalId, jour, montant }) {
  const { data, error } = await supabase.rpc('caisse_tpe_bouclement_poser', {
    p_etablissement_id: etablissementId, p_terminal_id: terminalId, p_jour: jour, p_montant: montant,
  });
  if (error) return { data: null, error: erreurLecture(error, "Le bouclement n'a pas été enregistré. Réessayez.") };
  return { data, error: null };
}

// Le dernier bouclement saisi de chaque terminal pour un jour.
export async function listBouclements(etablissementId, jour) {
  const { data, error } = await supabase
    .from('caisse_tpe_bouclements')
    .select('terminal_id, jour_exploitation, montant, saisi_par_nom, created_at')
    .eq('etablissement_id', etablissementId)
    .eq('jour_exploitation', jour)
    .order('created_at', { ascending: false });
  if (error) return { data: null, error: erreurLecture(error, 'Bouclements illisibles.') };
  const vus = new Set();
  const derniers = (data || []).filter((b) => (vus.has(b.terminal_id) ? false : vus.add(b.terminal_id)));
  return { data: derniers.map((b) => ({ ...b, montant: Number(b.montant) })), error: null };
}

// ── Rapports : les liens paiement vers terminal d'une période (direction). ──
export async function rapportTpe(etablissementId, debut, fin) {
  const { data, error } = await supabase.rpc('caisse_tpe_rapport', {
    p_etablissement_id: etablissementId, p_debut: debut, p_fin: fin,
  });
  if (error) return { data: null, error: erreurLecture(error, 'Rapport des terminaux illisible.') };
  return { data, error: null };
}
