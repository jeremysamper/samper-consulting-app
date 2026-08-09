// ================================================================
// helpers/resolve-stale.ts
//
// Résout les instances actives d'une règle dont la condition est
// redevenue fausse (ex: l'employé a fini par pointer → plus d'alerte).
//
// keepKeys = sujets encore en alerte à ce tick. Les instances actives
// dont le sujet n'y figure plus sont résolues, les autres restent.
// Sans keepKeys (ou liste vide) → tout est résolu.
// ================================================================
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export async function resolveStaleInstances(
  sb: SupabaseClient,
  ruleId: string,
  keepKeys?: Array<string | null>,
): Promise<void> {
  const nowIso = new Date().toISOString();

  // Cas simple : plus rien ne se déclenche → toutes les actives sont résolues.
  if (!keepKeys || keepKeys.length === 0) {
    const { error } = await sb
      .from('alert_instances')
      .update({ status: 'resolved', resolved_at: nowIso })
      .eq('rule_id', ruleId)
      .eq('status', 'active');

    if (error) console.error(`[alerts] resolveStaleInstances rule=${ruleId}:`, error.message);
    return;
  }

  // Résolution partielle : filtrage en TS plutôt qu'en SQL, car un
  // `not.in` sur une colonne nullable ne rattrape pas les lignes NULL.
  const { data: active, error: selErr } = await sb
    .from('alert_instances')
    .select('id, dedupe_key')
    .eq('rule_id', ruleId)
    .eq('status', 'active');

  if (selErr) {
    console.error(`[alerts] resolveStaleInstances select rule=${ruleId}:`, selErr.message);
    return;
  }

  const keep = new Set(keepKeys.map((k) => k ?? ''));
  const staleIds = (active ?? [])
    .filter((row) => !keep.has((row as { dedupe_key: string | null }).dedupe_key ?? ''))
    .map((row) => (row as { id: string }).id);

  if (staleIds.length === 0) return;

  const { error } = await sb
    .from('alert_instances')
    .update({ status: 'resolved', resolved_at: nowIso })
    .in('id', staleIds);

  if (error) console.error(`[alerts] resolveStaleInstances rule=${ruleId}:`, error.message);
}
