// ════════════════════════════════════════════════════════════════
// Appel générique de l'edge function « ai-proxy ».
//
// Extrait d'aiService pour être partagé sans tirer ses dépendances lourdes
// (compression d'image, parseur d'unités) dans les bundles qui n'en ont pas
// besoin - la traduction à la volée, notamment, est chargée avec la coque.
// ════════════════════════════════════════════════════════════════
import { supabase } from './supabase.js';

export async function callAiProxy(task, payload) {
  const { data, error } = await supabase.functions.invoke('ai-proxy', { body: { task, payload } });
  if (error) {
    let message = error.message || 'Appel IA échoué.';
    // Le corps d'erreur de la fonction (JSON { error }) est dans error.context.
    try {
      const ctx = error.context && typeof error.context.json === 'function'
        ? await error.context.json()
        : null;
      if (ctx && ctx.error) message = ctx.error;
    } catch (e) { /* on garde le message générique */ }
    throw new Error(message);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

export default callAiProxy;
