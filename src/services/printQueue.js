import { supabase } from './supabase.js';

// ─────────────────────────────────────────────────────────────────────────────
// File d'impression directe des étiquettes DLC
//
// L'app DÉPOSE un lot, l'agent installé sur le réseau du restaurant vient le
// chercher et l'envoie à l'imprimante. Un iPad ne peut pas adresser une
// imprimante réseau lui-même : ni socket TCP, ni IPP (contenu mixte + CORS),
// ni Bluetooth classique. Ce détour est le seul chemin.
//
// Rien ici n'est indispensable au fonctionnement de l'onglet : sans agent
// joignable, le module repasse à la feuille d'impression système. La brigade ne
// doit jamais se retrouver bloquée parce qu'un Raspberry Pi a redémarré.
// ─────────────────────────────────────────────────────────────────────────────

// Au-delà de ce délai sans signe de vie, on considère l'agent absent. Il relève
// la file toutes les 2 s : deux minutes laissent passer un redémarrage ou une
// coupure réseau brève sans faire basculer l'affichage à chaque hoquet.
const FRAICHEUR_AGENT_MS = 2 * 60 * 1000;

// Garde-fou de taille, aligné sur la contrainte SQL (8 Mo de base64). Un lot
// aberrant doit être refusé côté app, avec un repli propre, plutôt que rejeté
// par la base avec un message illisible pour la brigade.
const TAILLE_MAX_BASE64 = 8000000;

// Agent actif et vivant pour cet établissement, ou null.
export async function agentDisponible(etabId) {
  if (!etabId) return null;
  try {
    const { data, error } = await supabase
      .from('print_agents')
      .select('id, nom, imprimante_label, derniere_vue, actif')
      .eq('etablissement_id', etabId)
      .eq('actif', true)
      .order('derniere_vue', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    // Table absente (migration pas encore appliquée) ou lecture refusée : on
    // ne casse rien, l'onglet garde son comportement d'origine.
    if (error || !data) return null;
    const vue = data.derniere_vue ? new Date(data.derniere_vue).getTime() : 0;
    if (!vue || Date.now() - vue > FRAICHEUR_AGENT_MS) return null;
    return { id: data.id, nom: data.nom, imprimante: data.imprimante_label || null };
  } catch {
    return null;
  }
}

// Dépose un lot dans la file. Retourne l'id du lot créé.
export async function envoyerLot({ etabId, pdfBase64, nbEtiquettes, mode, userId }) {
  if (!etabId) throw new Error('Établissement inconnu.');
  if (!pdfBase64) throw new Error('PDF vide.');
  if (pdfBase64.length > TAILLE_MAX_BASE64) {
    throw new Error('Lot trop volumineux pour l\'impression directe.');
  }
  const { data, error } = await supabase
    .from('print_jobs')
    .insert({
      etablissement_id: etabId,
      nb_etiquettes: nbEtiquettes,
      mode: mode || null,
      pdf_base64: pdfBase64,
      cree_par: userId || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

// Attend la prise en charge par l'agent. Résout sur le statut final, ou sur
// 'attente' si l'agent n'a pas répondu à temps - auquel cas le lot reste dans la
// file et partira quand l'agent reviendra, il n'est jamais perdu.
export async function attendreImpression(jobId, { timeoutMs = 30000, intervalMs = 1500 } = {}) {
  const fin = Date.now() + timeoutMs;
  for (;;) {
    const { data, error } = await supabase
      .from('print_jobs')
      .select('statut, erreur')
      .eq('id', jobId)
      .maybeSingle();
    if (error) return { statut: 'inconnu' };
    if (data && (data.statut === 'imprime' || data.statut === 'erreur')) return data;
    if (Date.now() >= fin) return { statut: 'attente' };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
