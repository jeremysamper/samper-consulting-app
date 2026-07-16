// ================================================================
// evaluators/personnalisee.ts
//
// Alerte personnalisée - se déclenche à l'heure planifiée (daily).
// Pas de condition métier : l'alerte est toujours active à l'heure
// configurée ; l'utilisateur la rejette manuellement.
//
// rule_config attendu :
//   { title?: string, message: string }
//   ex: { title: "Rappel fermeture", message: "Vérifier les congélateurs." }
// ================================================================
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { AlertRule, EvalResult } from '../types.ts';

export async function evalPersonnalisee(
  _sb: SupabaseClient,
  rule: AlertRule,
): Promise<EvalResult> {
  const { title, message } = rule.rule_config as {
    title?: string;
    message?: string;
  };

  if (!message) {
    console.warn(`[alerts/personnalisee] rule ${rule.id} sans message - ignorée`);
    return { shouldFire: false };
  }

  return {
    shouldFire: true,
    title:   title || rule.name,
    message: message,
  };
}
