// ════════════════════════════════════════════════════════════════
// diff.ts - Logique PURE de diff getCheck -> kds_order_items.
//
// Sans DB, sans réseau, déterministe : testée dans __tests__/diff.test.ts.
// L'edge function applique ensuite le résultat via upsert idempotent.
//
// Règles :
//   • ligne absente en base        -> upsert (nouvelle)
//   • ligne présente, hash inchangé -> ignorée (idempotence : aucun write)
//   • ligne présente, hash changé   -> upsert ; reset_bump=true si elle était
//                                      bumpée (re-fire cuisine)
//   • ligne connue absente du check -> voidedLineKeys (active=false)  [si encore active]
// ════════════════════════════════════════════════════════════════
import type {
  OpenCheck,
  ExistingItem,
  CheckDiff,
  KdsItemUpsert,
  OpenCheckModifier,
} from '../_shared/types.ts';

/**
 * Hash déterministe (FNV-1a 32-bit -> hex 8 chars) du contenu métier d'une ligne.
 * Simple détecteur de changement, NON cryptographique. Les modifiers sont triés
 * pour que l'ordre d'arrivée ne produise pas de faux changement.
 */
export function contentHash(
  nom: string | null,
  sku: string | null,
  qty: number | null,
  active: boolean,
  modifiers: OpenCheckModifier[],
): string {
  const mods = [...modifiers]
    .map((m) => `${m.name}:${m.quantity}`)
    .sort()
    .join(',');
  const canonical = `${nom ?? ''}|${sku ?? ''}|${qty ?? ''}|${active ? 1 : 0}|${mods}`;

  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Clé d'identité stable d'une ligne : check_uuid:line_uuid (voir migration, D1). */
export function lineKey(checkUuid: string, lineUuid: string): string {
  return `${checkUuid}:${lineUuid}`;
}

/**
 * Diff d'un check contre le snapshot des lignes déjà en base pour ce check.
 * @param check     check normalisé (getCheck)
 * @param existing  lignes déjà en base pour CE check (kds_order_items)
 */
export function computeCheckDiff(check: OpenCheck, existing: ExistingItem[]): CheckDiff {
  const existingByKey = new Map<string, ExistingItem>();
  for (const e of existing) existingByKey.set(e.ls_line_key, e);

  const upserts: KdsItemUpsert[] = [];
  const seen = new Set<string>();

  for (const line of check.salesEntries) {
    const key = lineKey(check.uuid, line.uuid);
    seen.add(key);

    const hash = contentHash(line.itemName, line.itemSku, line.quantity, line.active, line.modifiers);
    const prev = existingByKey.get(key);

    if (prev && prev.content_hash === hash) {
      continue; // inchangé -> aucun write (idempotence)
    }

    const changedWhileBumped = !!prev && prev.content_hash !== hash && prev.bump_status === 'bumped';

    upserts.push({
      ls_line_key: key,
      nom: line.itemName || null,
      sku: line.itemSku,
      qty: line.quantity,
      modifiers: line.modifiers,
      fired_at: line.timeOfTransactionUtc,
      active: line.active,
      content_hash: hash,
      reset_bump: changedWhileBumped,
    });
  }

  // Lignes connues en base pour ce check, absentes du poll et encore actives -> annulées.
  const voidedLineKeys: string[] = [];
  const prefix = `${check.uuid}:`;
  for (const e of existing) {
    if (e.active && e.ls_line_key.startsWith(prefix) && !seen.has(e.ls_line_key)) {
      voidedLineKeys.push(e.ls_line_key);
    }
  }

  return {
    order: {
      ls_check_uuid: check.uuid,
      table_no: check.tableNumber,
      couverts: check.clientCount,
      opened_at: check.openDate,
    },
    upserts,
    voidedLineKeys,
  };
}
