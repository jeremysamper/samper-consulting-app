// ================================================================
// api/cron/spa-anniversaires.ts : Vercel Cron Route (thin trigger)
//
// Déclenchée deux fois par jour via vercel.json (07:00 et 11:00 UTC, soit
// 9 h et 13 h l'été à Zurich, 8 h et 12 h l'hiver). Le second passage est un
// rattrapage : un e-mail d'anniversaire déjà parti n'est jamais renvoyé
// (index unique partiel sur spa_envois), un e-mail en échec est retenté.
//
// Le vrai travail est fait par l'Edge Function spa-mailer, qui vérifie ce
// même CRON_SECRET.
// ================================================================

export const config = {
  runtime:     'nodejs',
  maxDuration: 60,
};

function readAuthHeader(req: unknown): string {
  const h = (req as { headers?: unknown }).headers;
  if (!h) return '';

  if (typeof (h as Headers).get === 'function') {
    return (h as Headers).get('authorization') ?? '';
  }

  const rec = h as Record<string, string | string[] | undefined>;
  const raw = rec.authorization ?? rec.Authorization;
  return Array.isArray(raw) ? raw[0] ?? '' : raw ?? '';
}

export default async function handler(
  req: { method: string; headers: unknown },
  res: { status: (code: number) => { json: (body: unknown) => void } }
) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = readAuthHeader(req);

  // Fermé par défaut : sans secret, personne ne déclenche d'envoi d'e-mails.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.warn(
      `[cron/spa-anniversaires] rejet 401 - ${!cronSecret ? 'CRON_SECRET non défini' : 'en-tête authorization absent ou différent'}`,
    );
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    return res.status(500).json({ error: 'SUPABASE_URL non définie' });
  }

  let data: unknown;
  let status = 200;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/spa-mailer`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ action: 'anniversaires' }),
    });

    data   = await response.json();
    status = response.ok ? 200 : response.status;
  } catch (err) {
    console.error('[cron/spa-anniversaires] Erreur appel Edge Function:', err);
    return res.status(502).json({
      error:   'Erreur lors de l\'appel à l\'Edge Function spa-mailer',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  console.log(
    `[cron/spa-anniversaires] EF répondu ${status}:`,
    JSON.stringify(data).slice(0, 500),
  );
  return res.status(status).json(data);
}
