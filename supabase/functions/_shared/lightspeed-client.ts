// ================================================================
// lightspeed-client.ts — Wrapper API Lightspeed K-Series (ventes)
//
// Supporte :
//   • Pagination cursor-based (nextPageToken)
//   • Retry exponentiel sur 429 / 5xx (1s, 2s, 4s, 8s)
//   • Mode dry-run : retourne la fixture salesLines_sample.json
//     sans faire aucun appel HTTP à Lightspeed
// ================================================================
import type { SalesLine } from './types.ts';

const MAX_RETRIES   = 4;
const RETRY_BASE_MS = 1000;
const PAGE_DELAY_MS = 200;   // délai poli entre pages

/**
 * Récupère toutes les salesLines pour une journée donnée.
 *
 * @param accessToken          Token Bearer Lightspeed (ignoré en dryRun)
 * @param businessLocationId   ID de la location Lightspeed
 * @param dateFrom             ISO UTC début de journée locale (ex: "2026-05-21T22:00:00.000Z")
 * @param dateTo               ISO UTC fin de journée locale   (ex: "2026-05-22T21:59:59.999Z")
 * @param lsEnv                'demo' | 'prod'
 * @param dryRun               Si true, charge la fixture et ignore les paramètres HTTP
 */
export async function fetchSalesLines(
  accessToken: string,
  businessLocationId: string,
  dateFrom: string,
  dateTo: string,
  lsEnv = 'demo',
  dryRun = false
): Promise<SalesLine[]> {
  if (dryRun) {
    return loadFixture();
  }

  const apiBase   = lsEnv === 'prod'
    ? 'https://api.lsk.lightspeed.app'
    : 'https://api.lsk-demo.app';

  const lines: SalesLine[] = [];
  let nextPageToken: string | null = null;

  do {
    const params = new URLSearchParams({
      from:     dateFrom,
      to:       dateTo,
      pageSize: '100',
    });
    if (nextPageToken) params.set('nextPageToken', nextPageToken);

    const url = `${apiBase}/f/v2/business-location/${businessLocationId}/sales?${params}`;
    const data = await fetchWithRetry(url, accessToken);

    // Extraire les salesLines depuis les tickets
    for (const sale of (data.sales ?? [])) {
      for (const line of (sale.salesLines ?? [])) {
        if (!line.name || line.qty == null) continue;
        lines.push({
          name:      String(line.name),
          sku:       line.sku ? String(line.sku) : null,
          qty:       Number(line.qty) || 0,
          price:     Math.round((Number(line.price) || 0) * 100), // LS retourne en CHF, on stocke en centimes
          timestamp: String(sale.businessDate ?? sale.createdAt ?? dateFrom),
        });
      }
    }

    nextPageToken = data.nextPageToken ?? null;

    // Délai poli entre pages
    if (nextPageToken) {
      await delay(PAGE_DELAY_MS);
    }
  } while (nextPageToken);

  return lines;
}

/**
 * Récupère les business locations disponibles sur ce compte.
 * Utilisé pour le sélecteur multi-location lors du flow OAuth.
 */
export async function fetchBusinessLocations(
  accessToken: string,
  lsEnv = 'demo'
): Promise<Array<{ businessId: string; businessName: string; locationId: string; locationName: string }>> {
  const apiBase = lsEnv === 'prod'
    ? 'https://api.lsk.lightspeed.app'
    : 'https://api.lsk-demo.app';

  // D'abord les businesses
  const bizData = await fetchWithRetry(
    `${apiBase}/account/v1/businesses`,
    accessToken
  );

  const locations: Array<{ businessId: string; businessName: string; locationId: string; locationName: string }> = [];

  for (const biz of (bizData.businesses ?? bizData.data ?? [])) {
    // Puis les locations de chaque business
    const locData = await fetchWithRetry(
      `${apiBase}/account/v1/businesses/${biz.id}/locations`,
      accessToken
    );
    for (const loc of (locData.locations ?? locData.data ?? [])) {
      locations.push({
        businessId:   String(biz.id),
        businessName: String(biz.name ?? biz.id),
        locationId:   String(loc.id),
        locationName: String(loc.name ?? loc.id),
      });
    }
  }

  return locations;
}

// ── Helpers ───────────────────────────────────────────────────────

async function fetchWithRetry(url: string, accessToken: string): Promise<Record<string, unknown>> {
  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (res.ok) {
      return res.json() as Promise<Record<string, unknown>>;
    }

    if (res.status === 429 || res.status >= 500) {
      attempt++;
      if (attempt > MAX_RETRIES) {
        const body = await res.text();
        throw new Error(`Lightspeed API error ${res.status} after ${MAX_RETRIES} retries: ${body.slice(0, 200)}`);
      }
      const backoff = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      console.warn(`[lightspeed-client] ${res.status} → retry ${attempt}/${MAX_RETRIES} in ${backoff}ms`);
      await delay(backoff);
      continue;
    }

    // Erreur non-retriable (401, 403, 404…)
    const body = await res.text();
    throw new Error(`Lightspeed API error ${res.status}: ${body.slice(0, 200)}`);
  }

  throw new Error('Lightspeed API: max retries reached');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadFixture(): Promise<SalesLine[]> {
  // Chemin relatif depuis l'edge function pos-sync qui consomme ce module
  try {
    const fixtureUrl = new URL(
      '../../pos-sync/__fixtures__/salesLines_sample.json',
      import.meta.url
    );
    const text = await Deno.readTextFile(fixtureUrl);
    const json = JSON.parse(text) as { sales: Array<SalesLine & { _note?: string }> };
    // Filtrer les clés de commentaire
    return json.sales.map(({ _note: _n, ...line }) => line);
  } catch (e) {
    console.error('[lightspeed-client] Fixture introuvable :', e);
    return [];
  }
}
