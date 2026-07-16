// ================================================================
// lightspeed-client.ts - Wrapper API Lightspeed K-Series (ventes)
//
// Supporte :
//   • Pagination cursor-based (nextPageToken)
//   • Retry exponentiel sur 429 / 5xx (1s, 2s, 4s, 8s)
//   • Mode dry-run : retourne la fixture salesLines_sample.json
//     sans faire aucun appel HTTP à Lightspeed
// ================================================================
import type { SalesLine, OpenCheck, OpenCheckLine, OpenCheckModifier } from './types.ts';

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

// ════════════════════════════════════════════════════════════════
// KDS - Order API « Get All Open Checks » (getCheck)
//
// Scope requis : orders-api (l'app ne demande aujourd'hui que financial-api ;
// un token financial-api renvoie 401/403 ici).
//
// ATTENTION (doc officielle) :
//   • ne renvoie que les receipts des ~15 dernières heures ;
//   • rien pour un compte en Trial Mode (le demo peut l'être).
// ════════════════════════════════════════════════════════════════

/**
 * Refresh d'un access_token Lightspeed. Même logique que pos-sync / pos-backfill,
 * factorisée ici (clientId/clientSecret passés en paramètres - pas de couplage env
 * dans _shared). Réutilisable par toute edge function.
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  lsEnv = 'demo',
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const tokenUrl = lsEnv === 'prod'
    ? 'https://auth.lsk-prod.app/realms/k-series/protocol/openid-connect/token'
    : 'https://auth.lsk-demo.app/realms/k-series/protocol/openid-connect/token';

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Récupère tous les checks ouverts d'une location (getCheck).
 * Réutilise fetchWithRetry (backoff 429/5xx). Le dry-run est géré par l'appelant
 * (il normalise la fixture via normalizeOpenChecks) - _shared reste générique.
 */
export async function fetchOpenChecks(
  accessToken: string,
  businessLocationId: string,
  lsEnv = 'demo',
): Promise<OpenCheck[]> {
  const apiBase = lsEnv === 'prod'
    ? 'https://api.lsk.lightspeed.app'
    : 'https://api.lsk-demo.app';
  const url = `${apiBase}/o/op/1/order/table/getCheck?businessLocationId=${encodeURIComponent(businessLocationId)}`;
  const data = await fetchWithRetry(url, accessToken);
  return normalizeOpenChecks(data);
}

/**
 * Normalise la réponse getCheck (forme d'enveloppe non garantie par la doc :
 * tableau nu, ou { checks } / { data } / { results }) vers OpenCheck[], avec
 * coercition défensive des types. Exporté pour être réutilisé sur la fixture.
 */
export function normalizeOpenChecks(data: unknown): OpenCheck[] {
  const rawChecks: unknown[] = Array.isArray(data)
    ? data
    : (((data as Record<string, unknown>)?.checks
        ?? (data as Record<string, unknown>)?.data
        ?? (data as Record<string, unknown>)?.results
        ?? []) as unknown[]);

  const out: OpenCheck[] = [];
  for (const c of rawChecks) {
    const check = c as Record<string, unknown>;
    const uuid = str(check.uuid);
    if (!uuid) continue; // sans uuid on ne peut ni scoper ni diff

    const lines: OpenCheckLine[] = [];
    for (const l of ((check.salesEntries as unknown[]) ?? [])) {
      const line = l as Record<string, unknown>;
      const lineUuid = str(line.uuid) ?? str(line.id);
      if (!lineUuid) continue;
      lines.push({
        uuid: lineUuid,
        id: str(line.id) ?? undefined,
        itemName: str(line.itemName) ?? '',
        itemSku: str(line.itemSku),
        quantity: num(line.quantity) ?? 0,
        modifiers: normalizeModifiers(line.modifiers),
        timeOfTransactionUtc: normalizeTimestamp(line.timeOfTransactionUtc),
        // active absent => considéré actif (choix prudent)
        active: line.active === undefined ? true : Boolean(line.active),
      });
    }

    out.push({
      uuid,
      tableNumber: str(check.tableNumber),
      clientCount: num(check.clientCount),
      openDate: normalizeTimestamp(check.openDate),
      salesEntries: lines,
    });
  }
  return out;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s.length ? s : null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeModifiers(v: unknown): OpenCheckModifier[] {
  if (!Array.isArray(v)) return [];
  return v.map((m) => {
    const mod = (m ?? {}) as Record<string, unknown>;
    return { name: str(mod.name) ?? '', quantity: num(mod.quantity) ?? 1 };
  });
}

/** openDate / timeOfTransactionUtc : accepte ISO ou epoch (s | ms) → ISO UTC. */
function normalizeTimestamp(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    const ms = v > 1e12 ? v : v * 1000; // heuristique secondes vs millisecondes
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}
