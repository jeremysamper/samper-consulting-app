// ================================================================
// aggregate.ts - Agrégation des salesLines par SKU + date locale
// ================================================================
import type { SalesLine, AggregatedSale } from './types.ts';
import { utcToLocalDateString } from './timezone.ts';

/** Mots parasites à retirer du nom pour le slugify fallback */
const STOP_WORDS = new Set([
  'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'au', 'aux',
  'avec', 'et', 'ou', 'en', 'à', 'a', 'sur', 'sous', 'par',
  'sauce', 'gratiné', 'gratinée', 'poêlé', 'poêlée', 'maison',
]);

/**
 * Normalise un nom de plat en clé stable.
 * "Risotto aux champignons" → "risotto champignons"
 */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // retrait accents
    .replace(/[^a-z0-9 ]/g, ' ')       // garde alphanumériques + espace
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w))
    .join('-');
}

/**
 * Agrège une liste de salesLines par clé (sku ou slug du nom) + date locale.
 *
 * @param lines    SalesLines brutes de Lightspeed
 * @param timezone Timezone IANA de l'établissement (ex: "Europe/Zurich")
 * @returns        Tableau de AggregatedSale prêt pour upsert
 */
export function aggregateSalesLines(
  lines: SalesLine[],
  timezone: string
): AggregatedSale[] {
  // Map<clé, Map<dateLocale, { qty, revenue_cts, name }>>
  const acc = new Map<string, Map<string, { qty: number; revenue_cts: number; name: string }>>();

  for (const line of lines) {
    if (line.qty <= 0) continue;  // skip les retours/annulations (qty < 0) ou vides

    const key      = line.sku?.trim() || slugifyName(line.name);
    if (!key) continue;

    const date     = utcToLocalDateString(line.timestamp, timezone);
    const revenue  = line.price * line.qty;

    if (!acc.has(key)) acc.set(key, new Map());
    const byDate = acc.get(key)!;

    if (byDate.has(date)) {
      const existing = byDate.get(date)!;
      existing.qty          += line.qty;
      existing.revenue_cts  += revenue;
    } else {
      byDate.set(date, { qty: line.qty, revenue_cts: revenue, name: line.name });
    }
  }

  // Aplatir en tableau
  const result: AggregatedSale[] = [];
  for (const [key, byDate] of acc) {
    for (const [date, { qty, revenue_cts, name }] of byDate) {
      result.push({ key, name, date, qty, revenue_cts });
    }
  }

  return result;
}
