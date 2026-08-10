// ================================================================
// api/cron/alerts-evaluator.ts — Vercel Cron Route (thin trigger)
//
// Déclenchée automatiquement toutes les heures via vercel.json.
// Son unique rôle est d'appeler l'Edge Function Supabase
// alerts-evaluator qui fait le vrai travail.
//
// Sécurité :
//   - Vercel Cron inclut automatiquement Authorization Bearer CRON_SECRET.
//   - L'Edge Function vérifie ce même secret côté Supabase.
//
// Runtime : Node.js (maxDuration 60s → budget suffisant pour trigger)
// ================================================================

export const config = {
  runtime:     'nodejs',
  maxDuration: 60,
};

/**
 * Lit l'en-tête Authorization quel que soit le runtime.
 *
 * En runtime Node (celui déclaré ci-dessus), `req.headers` est un OBJET
 * simple à clés minuscules, sans méthode `.get()`. L'ancienne version
 * appelait `headers.get?.('authorization')`, qui rendait donc toujours
 * undefined : la comparaison échouait pour tout le monde, Vercel Cron
 * compris, dès que CRON_SECRET était défini.
 */
function readAuthHeader(req: unknown): string {
  const h = (req as { headers?: unknown }).headers;
  if (!h) return '';

  if (typeof (h as Headers).get === 'function') {
    return (h as Headers).get('authorization') ?? ''; // runtime Edge
  }

  const rec = h as Record<string, string | string[] | undefined>;
  const raw = rec.authorization ?? rec.Authorization;
  return Array.isArray(raw) ? raw[0] ?? '' : raw ?? '';
}

export default async function handler(
  req: { method: string; headers: unknown },
  res: { status: (code: number) => { json: (body: unknown) => void } }
) {
  const cronSecret  = process.env.CRON_SECRET;
  const authHeader  = readAuthHeader(req);

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Diagnostic sans jamais journaliser le secret lui-même.
    console.warn(
      `[cron/alerts-evaluator] rejet 401 - en-tête authorization ${authHeader ? 'présent mais différent' : 'absent'}`,
    );
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    return res.status(500).json({ error: 'SUPABASE_URL non définie' });
  }

  const edgeFnUrl = `${supabaseUrl}/functions/v1/alerts-evaluator`;

  let data: unknown;
  let status = 200;

  try {
    const response = await fetch(edgeFnUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': cronSecret ? `Bearer ${cronSecret}` : '',
      },
      body: JSON.stringify({}),
    });

    data   = await response.json();
    status = response.ok ? 200 : response.status;
  } catch (err) {
    console.error('[cron/alerts-evaluator] Erreur appel Edge Function:', err);
    return res.status(502).json({
      error:   'Erreur lors de l\'appel à l\'Edge Function alerts-evaluator',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  console.log(
    `[cron/alerts-evaluator] EF répondu ${status}:`,
    JSON.stringify(data).slice(0, 500),
  );
  return res.status(status).json(data);
}
