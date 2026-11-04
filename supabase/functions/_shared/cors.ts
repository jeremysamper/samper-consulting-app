// SAMPER CONSULTING - Edge Functions : garde d'origine partagée (SI1)
//
// Origines admises : l'app, ses previews Vercel, le développement local.
// Garde reprise de create-user (L0, 27.10.2026). Sans effet hors navigateur :
// un appel de serveur à serveur (cron Vercel, déclencheur base, agent local)
// ne porte pas d'en-tête Origin et ignore les en-têtes CORS.

const ORIGINES = ['https://samperconsulting-app.com', 'https://www.samperconsulting-app.com'];
const ORIGINE_PREVIEW = /^https:\/\/sc-app-[a-z0-9-]+-samper-consulting\.vercel\.app$/;
const ORIGINE_LOCALE = /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/;

export function origineAdmise(origine: string): boolean {
  return ORIGINES.includes(origine) || ORIGINE_PREVIEW.test(origine) || ORIGINE_LOCALE.test(origine);
}

// En-têtes CORS calculés par requête (modèle create-user) : pour les
// fonctions qui construisent leurs en-têtes dans le handler.
export function enTetesCors(req: Request, methodes = 'POST, OPTIONS'): Record<string, string> {
  const origine = req.headers.get('Origin') ?? '';
  return {
    ...(origineAdmise(origine) ? { 'Access-Control-Allow-Origin': origine } : {}),
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': methodes,
  };
}

// Pose l'origine admise sur une réponse déjà construite : pour les fonctions
// dont les réponses partagent des en-têtes constants (json helper au niveau
// module). Retire tout Access-Control-Allow-Origin posé en amont.
export function appliquerCors(req: Request, reponse: Response): Response {
  const headers = new Headers(reponse.headers);
  headers.delete('Access-Control-Allow-Origin');
  headers.append('Vary', 'Origin');
  const origine = req.headers.get('Origin') ?? '';
  if (origineAdmise(origine)) headers.set('Access-Control-Allow-Origin', origine);
  return new Response(reponse.body, { status: reponse.status, statusText: reponse.statusText, headers });
}
