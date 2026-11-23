import { supabase } from './supabase.js';

// ─────────────────────────────────────────────────────────────────────────────
// Envoi par Brevo d'un fichier versé dans Documents (Edge Function
// envoi-documents, 22.11.2026). Le navigateur ne passe que l'identifiant du
// document et le texte du message : la fonction relit le fichier, contrôle
// le rôle et l'établissement, et parle seule à Brevo.
//
// Réponses : { data, error }, l'erreur est un message affichable.
// ─────────────────────────────────────────────────────────────────────────────

async function appeler(action, charge = {}) {
  try {
    const { data, error } = await supabase.functions.invoke('envoi-documents', { body: { action, ...charge } });
    if (error) {
      let message = null;
      try { message = (await error.context?.json?.())?.error || null; } catch { /* corps illisible */ }
      return { data: null, error: message || "L'envoi est indisponible pour le moment." };
    }
    if (data?.error) return { data: null, error: data.error };
    return { data, error: null };
  } catch (e) {
    console.error('[envoiDocuments]', action, e?.name || 'Error');
    return { data: null, error: "L'envoi est indisponible pour le moment." };
  }
}

// { configure, expediteur } ; configure faux tant que la clé Brevo manque.
export async function lireEtatEnvoi() {
  const { data, error } = await appeler('etat');
  if (error) return { configure: false, expediteur: null, error };
  return { configure: Boolean(data?.configure), expediteur: data?.expediteur || null, error: null };
}

// a et cc : texte « a@x.ch, b@y.ch » ou liste. Rend { data: { messageId, mode }, error }.
export function envoyerDocument({ documentId, a, cc, objet, message }) {
  return appeler('envoyer', { documentId, a, cc, objet, message });
}
