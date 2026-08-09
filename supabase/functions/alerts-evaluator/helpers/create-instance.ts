// ================================================================
// helpers/create-instance.ts
//
// Crée une instance d'alerte si aucune instance active n'existe déjà
// pour ce couple (règle, sujet). Idempotent - safe à appeler à chaque
// tick.
//
// dedupeKey = sujet de l'alerte (ex: "shift:sh-123"). Sans clé, on
// retombe sur le comportement historique : une seule instance active
// par règle.
// ================================================================
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

interface CreateInstanceParams {
  sb: SupabaseClient;
  ruleId: string;
  etablissementId: string;
  title: string;
  message: string;
  severity: string;
  linkModule?: string | null;
  targetRoles?: string[];
  targetUserIds?: string[];
  dedupeKey?: string | null;
}

export async function createInstanceIfNeeded(
  params: CreateInstanceParams,
): Promise<void> {
  const {
    sb, ruleId, etablissementId, title, message, severity,
    linkModule, targetRoles, targetUserIds, dedupeKey,
  } = params;

  // Vérification idempotente, sur le sujet quand il y en a un.
  let q = sb
    .from('alert_instances')
    .select('id')
    .eq('rule_id', ruleId)
    .eq('status', 'active');
  q = dedupeKey ? q.eq('dedupe_key', dedupeKey) : q.is('dedupe_key', null);

  const { data: existing, error: selErr } = await q.limit(1);

  if (selErr) {
    console.error(`[alerts] createInstanceIfNeeded select rule=${ruleId}:`, selErr.message);
    return;
  }
  if (existing && existing.length > 0) return; // déjà active - pas de doublon

  const { error } = await sb.from('alert_instances').insert({
    rule_id:          ruleId,
    etablissement_id: etablissementId,
    title,
    message,
    severity,
    link_module:     linkModule ?? null,
    target_roles:    targetRoles ?? ['consultant', 'patron'],
    target_user_ids: targetUserIds ?? [],
    dedupe_key:      dedupeKey ?? null,
    status:          'active',
  });

  if (error) {
    console.error(`[alerts] createInstanceIfNeeded rule=${ruleId}:`, error.message);
  }
}
