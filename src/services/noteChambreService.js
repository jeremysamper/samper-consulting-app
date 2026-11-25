import { supabase } from './supabase.js';

// ─────────────────────────────────────────────────────────────────────────────
// Lot 05 du panel : porter un ticket de caisse sur la note de la chambre
// (migration 20261125_panel_lot05_note_chambre).
//
// Trois RPC, chacune rend { data, error } avec un message affichable. Le
// montant porté est toujours calculé par la base, jamais envoyé d'ici.
// ─────────────────────────────────────────────────────────────────────────────

const MESSAGES_NOTE = {
  'note: connexion requise': 'Votre session a expiré. Reconnectez-vous.',
  'note: compte sans rôle': "Votre compte n'a pas de rôle. Demandez à la direction.",
  'note: accès refusé': "Vous n'avez pas les droits pour cette action.",
  'note: ticket ou séjour manquant': 'Choisissez un séjour.',
  'note: ticket introuvable': 'Ce ticket est introuvable.',
  'note: ticket de test': 'Un ticket de test ne va jamais sur une note.',
  'note: ticket non encaissé': "Ce ticket n'est pas encaissé.",
  'note: ticket trop ancien': 'Ce ticket date de plus de 14 jours : ajoutez-le à la main sur la note.',
  'note: séjour introuvable': 'Ce séjour est introuvable.',
  'note: séjour pas en maison': "Ce séjour n'est plus en maison.",
  'note: aucun paiement sur la chambre': "Ce ticket n'a pas de paiement sur la chambre.",
  'note: ticket déjà porté sur une autre note': "Ce ticket est déjà sur la note d'une autre chambre.",
};

function messageNote(error, repli) {
  if (!error) return null;
  console.error('[noteChambreService]', error);
  const brut = String(error.message || '');
  if (MESSAGES_NOTE[brut]) return MESSAGES_NOTE[brut];
  if (String(error.code || '') === '42501') return MESSAGES_NOTE['note: accès refusé'];
  return repli;
}

// Porte le ticket encaissé sur la note du séjour. Un second appel rend la
// ligne déjà écrite (deja: true), il n'en crée pas une autre.
export async function porterTicketSurNote(ticketId, sejourId) {
  const { data, error } = await supabase.rpc('sejour_porter_ticket', {
    p_ticket_id: ticketId,
    p_sejour_id: sejourId,
  });
  if (error) return { data: null, error: messageNote(error, "Le ticket n'a pas pu être porté sur la note. Réessayez.") };
  return { data, error: null };
}

// Tickets payés sur la chambre, depuis 14 jours au plus, qui n'ont pas trouvé
// leur note. Une erreur n'est jamais une liste vide.
export async function listerTicketsAPorter(etablissementId) {
  const { data, error } = await supabase.rpc('sejour_tickets_a_porter', {
    p_etablissement_id: etablissementId,
  });
  if (error) return { data: null, error: messageNote(error, 'Les tickets ne se lisent pas. Réessayez.') };
  return { data: Array.isArray(data) ? data : [], error: null };
}

// Contre-lignes des tickets annulés après leur report. Rend le nombre ajouté.
export async function verifierReportsSejour(sejourId) {
  const { data, error } = await supabase.rpc('sejour_reports_verifier', { p_sejour_id: sejourId });
  if (error) return { data: null, error: messageNote(error, "La note n'a pas pu être vérifiée.") };
  return { data: Number(data) || 0, error: null };
}
