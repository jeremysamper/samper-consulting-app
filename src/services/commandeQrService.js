import { supabase } from './supabase.js';

// ─────────────────────────────────────────────────────────────────────────────
// Commande par QR, côté app (lot L3, migration 20261122_caisse_commande_qr).
//
//   Réglages (caisse_commande_qr_parametres) : lus par l'équipe, écrits par
//   consultant et patron (la base refuse les autres rôles).
//   Commandes reçues (caisse_commandes_qr) : lues par l'équipe ; décidées
//   par les RPC commande_qr_accepter et commande_qr_refuser, que la base
//   réserve à qui a la caisse dans l'établissement.
//
// Lectures : { data, error }, jamais un tableau vide en cas d'échec.
// ─────────────────────────────────────────────────────────────────────────────

// Une commande attend au plus 3 heures, puis expire (côté serveur aussi).
export const ATTENTE_MAX_MS = 3 * 60 * 60 * 1000;

const MESSAGES = {
  'caisse: acces refuse': "Vous n'avez pas les droits pour cette action.",
  'commande_qr: commande introuvable': 'Cette commande a disparu. Rechargez la liste.',
  'commande_qr: motif de 3 a 200 signes': 'Le motif doit faire entre 3 et 200 signes.',
  'commande_qr: table disparue, commande a refuser': "Cette table n'est plus dans le plan de salle. Refusez la commande et prévenez le client.",
  'commande_qr: un produit a disparu, commande a refuser': "Un produit de cette commande n'existe plus. Refusez-la et prenez la commande à la main.",
  'commande_qr: ticket introuvable': "Le ticket n'a pas pu être ouvert. Réessayez.",
  '23505': 'Cette adresse est déjà prise. Changez-la.',
  '42501': "Seule la direction modifie ces réglages.",
  '23514': 'Réglage refusé : vérifiez les plages horaires.',
};

function messageErreur(error, repli) {
  if (!error) return null;
  console.error('[commandeQrService]', error);
  const brut = String(error.message || '');
  if (MESSAGES[brut]) return MESSAGES[brut];
  const code = String(error.code || '');
  if (MESSAGES[code]) return MESSAGES[code];
  if (/^caisse: /.test(brut)) return brut;
  return repli || 'Erreur technique. Réessayez.';
}

export const REGLAGES_QR_DEFAUT = { actif: false, slug: null, categories: [], plages: [] };

export async function lireReglagesQr(etablissementId) {
  const { data, error } = await supabase
    .from('caisse_commande_qr_parametres')
    .select('etablissement_id, actif, slug, categories, plages, updated_at')
    .eq('etablissement_id', etablissementId)
    .maybeSingle();
  if (error) return { data: null, error: messageErreur(error, 'Réglages illisibles. Réessayez.') };
  return { data: data ? { ...REGLAGES_QR_DEFAUT, ...data } : { ...REGLAGES_QR_DEFAUT }, error: null };
}

// Écrit la ligne entière de l'établissement (upsert sur la clé).
export async function ecrireReglagesQr(etablissementId, reglages) {
  const { data, error } = await supabase
    .from('caisse_commande_qr_parametres')
    .upsert({
      etablissement_id: etablissementId,
      actif: Boolean(reglages.actif),
      slug: reglages.slug || null,
      categories: reglages.categories || [],
      plages: reglages.plages || [],
    }, { onConflict: 'etablissement_id' })
    .select('etablissement_id, actif, slug, categories, plages, updated_at')
    .maybeSingle();
  if (error) return { data: null, error: messageErreur(error), code: error.code };
  if (!data) return { data: null, error: MESSAGES['42501'] };
  return { data, error: null };
}

// Commandes en attente de l'établissement, des 3 dernières heures, les plus
// anciennes d'abord.
export async function listerEnAttente(etablissementId) {
  const depuis = new Date(Date.now() - ATTENTE_MAX_MS).toISOString();
  const { data, error } = await supabase
    .from('caisse_commandes_qr')
    .select('id, table_id, table_nom, au_bar, prenom, lignes, total, statut, created_at')
    .eq('etablissement_id', etablissementId)
    .eq('statut', 'a_valider')
    .gte('created_at', depuis)
    .order('created_at', { ascending: true });
  if (error) return { data: null, error: messageErreur(error, 'Commandes QR illisibles.') };
  return { data: data || [], error: null };
}

export async function accepterCommande(commandeId) {
  const { data, error } = await supabase.rpc('commande_qr_accepter', { p_commande_id: commandeId });
  if (error) return { data: null, error: messageErreur(error, "La commande n'a pas pu être acceptée. Réessayez.") };
  return { data, error: null };
}

export async function refuserCommande(commandeId, motif) {
  const { data, error } = await supabase.rpc('commande_qr_refuser', { p_commande_id: commandeId, p_motif: motif });
  if (error) return { data: null, error: messageErreur(error, "La commande n'a pas pu être refusée. Réessayez.") };
  return { data, error: null };
}
