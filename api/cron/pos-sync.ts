// ================================================================
// api/cron/pos-sync.ts — Vercel Cron Route (thin trigger)
//
// Déclenchée automatiquement à 04:00 UTC via vercel.json crons.
// Son unique rôle est d'appeler l'Edge Function Supabase pos-sync
// qui fait le vrai travail (150s+ de budget Supabase vs 60s Vercel).
//
// Sécurité :
//   - Vercel Cron inclut automatiquement l'en-tête Authorization
//     "Bearer <CRON_SECRET>" si CRON_SECRET est défini dans les env vars.
//   - L'Edge Function pos-sync vérifie ce même secret côté Supabase.
//
// Runtime : Node.js (maxDuration 60s → budget suffisant pour trigger)
// ================================================================

export const config = {
  runtime:     'nodejs',
  maxDuration: 60,
};

export default async function handler(
  req: { method: string; headers: { get: (k: string) => string | null } },
  res: { status: (code: number) => { json: (body: unknown) => void } }
) {
  // Sécurité : Vercel Cron injecte l'en-tête Authorization automatiquement.
  // On vérifie le secret pour bloquer les appels manuels non autorisés.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = (req as unknown as Request).headers
    ? (req as unknown as Request).headers.get?.('authorization') ?? ''
    : '';

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    return res.status(500).json({ error: 'SUPABASE_URL non définie' });
  }

  const edgeFnUrl = `${supabaseUrl}/functions/v1/pos-sync`;

  let data: unknown;
  let status = 200;

  try {
    const response = await fetch(edgeFnUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        // Transmet le CRON_SECRET à l'Edge Function pour son propre contrôle
        'Authorization': cronSecret ? `Bearer ${cronSecret}` : '',
      },
      body: JSON.stringify({}), // body vide → l'EF sync hier
    });

    data   = await response.json();
    status = response.ok ? 200 : response.status;
  } catch (err) {
    console.error('[cron/pos-sync] Erreur appel Edge Function:', err);
    return res.status(502).json({
      error:   'Erreur lors de l'appel à l'Edge Function pos-sync',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  console.log(`[cron/pos-sync] EF pos-sync répondu ${status}:`, JSON.stringify(data).slice(0, 500));
  return res.status(status).json(data);
}
