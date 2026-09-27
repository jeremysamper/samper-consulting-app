// ================================================================
// api/spa-oauth.ts : retour de la connexion Gmail / Outlook du spa
//
// Google ou Microsoft renvoient ici (GET ?code=...&state=...) après que le
// spa a accepté de connecter sa boîte mail. On transmet le code à l'Edge
// Function spa-mailer (action boite_fin), qui l'échange contre les jetons,
// les chiffre et les enregistre. Rien de secret ne passe par le navigateur
// au-delà du code, à usage unique et lié au vérificateur PKCE gardé en base.
//
// La page prévient l'onglet de l'app (BroadcastChannel, et window.opener
// quand il existe encore : la page de connexion Google peut couper ce lien)
// puis se ferme. Ouverte dans le même onglet (fenêtre surgissante bloquée),
// elle ramène à l'app. Le script est un fichier statique
// (/spa-oauth-retour.js) : la politique de sécurité n'admet pas de script
// écrit dans la page.
//
// Adresse à déclarer chez Google et Microsoft :
//   https://samperconsulting-app.com/api/spa-oauth
// ================================================================

export const config = {
  runtime:     'nodejs',
  maxDuration: 20,
};

type Req = { method: string; url?: string; query?: Record<string, string | string[] | undefined> };
type Res = {
  status: (code: number) => Res;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
};

function param(req: Req, nom: string): string {
  const q = req.query?.[nom];
  const brut = Array.isArray(q) ? q[0] : q;
  if (brut) return String(brut);
  try {
    return new URL(req.url || '', 'http://x').searchParams.get(nom) || '';
  } catch {
    return '';
  }
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function page(ok: boolean, titre: string, texte: string) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(titre)}</title>
<style>
  :root { color-scheme: light dark; --bg:#f3efe9; --card:#fff; --text:#2b2b2b; --muted:#6f6f6f; --line:#e7dfd3; --ok:#2f6f77; --err:#a4493d; --btn:#2b2b2b; --btn-text:#fff; }
  @media (prefers-color-scheme: dark) { :root { --bg:#16181c; --card:#20242a; --text:#ececec; --muted:#a3a3a3; --line:#333a42; --ok:#7fb8bf; --err:#e39a8e; --btn:#ececec; --btn-text:#16181c; } }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:var(--bg); color:var(--text);
         font-family: Helvetica, Arial, sans-serif; padding:16px; box-sizing:border-box; }
  main { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:32px 28px; max-width:440px; width:100%; text-align:center; }
  .pastille { width:44px; height:44px; border-radius:50%; margin:0 auto 16px; display:flex; align-items:center; justify-content:center;
              background:color-mix(in srgb, var(${ok ? '--ok' : '--err'}) 14%, transparent); color:var(${ok ? '--ok' : '--err'}); }
  h1 { font-family: Georgia, 'Times New Roman', serif; font-weight:400; font-size:24px; margin:0 0 12px; }
  p { color:var(--muted); line-height:1.6; margin:0 0 20px; font-size:15px; }
  a { display:inline-flex; align-items:center; min-height:46px; padding:0 22px; border-radius:10px; background:var(--btn); color:var(--btn-text);
      font-size:15px; text-decoration:none; }
  .fermer { font-size:13px; margin:16px 0 0; }
</style></head>
<body data-ok="${ok ? '1' : '0'}" data-message="${esc(texte)}"><main>
  <div class="pastille" aria-hidden="true">${ok
    ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
    : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'}</div>
  <h1>${esc(titre)}</h1>
  <p>${esc(texte)}</p>
  <a href="/">Retour à l'app</a>
  <p class="fermer" id="fermer" hidden>Vous pouvez fermer cette fenêtre.</p>
</main>
<script src="/spa-oauth-retour.js"></script>
</body></html>`;
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  // Le code et l'état restent hors des journaux et du Referer des liens.
  res.setHeader('Referrer-Policy', 'no-referrer');

  const etat = param(req, 'state');
  const code = param(req, 'code');
  const erreur = param(req, 'error');

  if (!etat) {
    return res.status(400).send(page(false, 'Lien incomplet',
      'Cette page s\'ouvre à la fin de la connexion d\'une boîte mail. Recommencez depuis l\'onglet E-mails du spa.'));
  }

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url) {
    return res.status(500).send(page(false, 'Connexion impossible', 'Configuration du serveur incomplète.'));
  }

  try {
    const r = await fetch(`${url}/functions/v1/spa-mailer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(anon ? { apikey: anon } : {}) },
      body: JSON.stringify({ action: 'boite_fin', etat, code, erreur }),
    });
    const corps = await r.json().catch(() => ({}));
    if (!r.ok || !corps?.ok) {
      return res.status(400).send(page(false, 'Boîte non connectée',
        String(corps?.erreur || 'La connexion n\'a pas abouti. Recommencez depuis l\'app.')));
    }
    const nom = corps.fournisseur === 'microsoft' ? 'Outlook' : 'Gmail';
    return res.status(200).send(page(true, 'Boîte connectée',
      `Les e-mails du spa partiront désormais de ${corps.adresse} (${nom}).`));
  } catch (err) {
    console.error('[spa-oauth]', err);
    return res.status(502).send(page(false, 'Un souci est survenu',
      'La connexion n\'a pas pu être enregistrée. Réessayez dans un instant.'));
  }
}
