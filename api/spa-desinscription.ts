// ================================================================
// api/spa-desinscription.ts : lien « Se désinscrire » des e-mails du spa
//
// GET  ?t=<jeton>  → page de confirmation avec un bouton. On ne désinscrit
//                    PAS au GET : les antivirus de messagerie ouvrent tous les
//                    liens d'un e-mail pour les analyser, et désinscriraient
//                    le client à son insu.
// POST ?t=<jeton>  → désinscription (bouton de la page, ou désinscription en
//                    un clic des messageries, RFC 8058 : corps
//                    « List-Unsubscribe=One-Click »).
//
// La page est servie ici et non par l'Edge Function : Supabase renvoie le
// HTML des fonctions en text/plain.
// ================================================================

export const config = {
  runtime:     'nodejs',
  maxDuration: 15,
};

type Req = { method: string; url?: string; query?: Record<string, string | string[] | undefined> };
type Res = {
  status: (code: number) => Res;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
};

const JETON = /^[0-9a-f-]{36}$/i;

function lireJeton(req: Req): string {
  const q = req.query?.t;
  const brut = Array.isArray(q) ? q[0] : q;
  if (brut) return String(brut);
  try {
    return new URL(req.url || '', 'http://x').searchParams.get('t') || '';
  } catch {
    return '';
  }
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function page(titre: string, contenu: string) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(titre)}</title>
<style>
  :root { color-scheme: light dark; --bg:#f3efe9; --card:#fff; --text:#2b2b2b; --muted:#6f6f6f; --line:#e7dfd3; --btn:#2b2b2b; --btn-text:#fff; }
  @media (prefers-color-scheme: dark) { :root { --bg:#16181c; --card:#20242a; --text:#ececec; --muted:#a3a3a3; --line:#333a42; --btn:#ececec; --btn-text:#16181c; } }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:var(--bg); color:var(--text);
         font-family: Helvetica, Arial, sans-serif; padding:16px; box-sizing:border-box; }
  main { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:32px 28px; max-width:440px; width:100%; text-align:center; }
  h1 { font-family: Georgia, 'Times New Roman', serif; font-weight:400; font-size:24px; margin:0 0 12px; }
  p { color:var(--muted); line-height:1.6; margin:0 0 20px; font-size:15px; }
  button { min-height:46px; padding:0 22px; border-radius:10px; border:none; background:var(--btn); color:var(--btn-text); font-size:15px; cursor:pointer; }
</style></head>
<body><main>${contenu}</main></body></html>`;
}

async function desinscrire(jeton: string): Promise<{ ok: boolean; etablissement?: string | null; erreur?: string }> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url) return { ok: false, erreur: 'configuration' };
  const r = await fetch(`${url}/functions/v1/spa-mailer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(anon ? { apikey: anon } : {}) },
    body: JSON.stringify({ action: 'desinscription', token: jeton }),
  });
  const corps = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, erreur: corps?.error || `HTTP ${r.status}` };
  return { ok: true, etablissement: corps?.etablissement ?? null };
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const jeton = lireJeton(req);

  if (!JETON.test(jeton)) {
    return res.status(400).send(page('Lien invalide',
      '<h1>Lien invalide</h1><p>Ce lien de désinscription est incomplet. Utilisez le lien présent au bas de l\'e-mail reçu.</p>'));
  }

  if (req.method === 'POST') {
    try {
      const r = await desinscrire(jeton);
      if (!r.ok) {
        return res.status(404).send(page('Lien expiré',
          '<h1>Lien expiré</h1><p>Ce lien n\'est plus valable. Si vous recevez encore nos e-mails, répondez simplement à l\'un d\'eux pour nous le signaler.</p>'));
      }
      const chez = r.etablissement ? ` de ${esc(r.etablissement)}` : '';
      return res.status(200).send(page('Désinscription confirmée',
        `<h1>C'est fait</h1><p>Vous ne recevrez plus les nouvelles ni les attentions d'anniversaire${chez}. Vos rendez-vous ne sont pas concernés.</p>`));
    } catch (err) {
      console.error('[spa-desinscription]', err);
      return res.status(502).send(page('Erreur',
        '<h1>Un souci est survenu</h1><p>La désinscription n\'a pas pu être enregistrée. Merci de réessayer dans un instant.</p>'));
    }
  }

  return res.status(200).send(page('Se désinscrire', `
    <h1>Se désinscrire</h1>
    <p>Vous ne recevrez plus nos nouvelles ni nos attentions d'anniversaire par e-mail.</p>
    <form method="post" action="/api/spa-desinscription?t=${esc(encodeURIComponent(jeton))}">
      <button type="submit">Confirmer la désinscription</button>
    </form>`));
}
