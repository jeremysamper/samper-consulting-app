// ════════════════════════════════════════════════════════════════
// Edge function « ai-proxy » — proxy sécurisé vers l'API Claude (Anthropic).
//
// La clé API reste 100 % côté serveur (secret Supabase ANTHROPIC_API_KEY) —
// elle n'est JAMAIS exposée au client. Le client appelle cette fonction avec
// son jeton de session Supabase ; la fonction vérifie l'authentification
// avant tout appel IA.
//
// Secrets attendus (Supabase Dashboard → Edge Functions → Manage secrets) :
//   ANTHROPIC_API_KEY  (requis)  — clé API depuis console.anthropic.com
//   AI_MODEL           (optionnel) — id du modèle Claude (défaut ci-dessous)
// SUPABASE_URL / SUPABASE_ANON_KEY sont injectés automatiquement.
//
// Tâches supportées : 'ocr-recipe'. (Les phases suivantes ajoutent des cas.)
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Modèle par défaut — surchargeable via le secret AI_MODEL.
const DEFAULT_MODEL = 'claude-sonnet-4-5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Consigne système pour l'extraction de recettes depuis une image.
const OCR_SYSTEM = `Tu extrais des recettes de cuisine depuis une image (photo ou scan d'une fiche papier).
Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte autour, au format exact :
{"recipes":[{"nom":"...","categorie":"Plats","portions":4,"ingredients":[{"nom":"Farine","quantite":200,"unite":"g"}],"etapes":["Étape 1...","Étape 2..."]}]}
Règles :
- une image peut contenir plusieurs recettes (renvoie-les toutes dans "recipes")
- "categorie" parmi : Entrées, Plats, Desserts, Fromages, Sauces, Fonds, Amuse-bouches, Garnitures
- "quantite" est un nombre ; si elle n'est pas précisée, mets 0
- "unite" parmi : g, kg, ml, L, pcs, cs, cc, pincée — sinon choisis l'unité la plus proche
- "portions" est un entier ; si absent, mets 4
- conserve la formulation des étapes le plus fidèlement possible
- si l'image ne contient aucune recette lisible, renvoie {"recipes":[]}`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  // ── Authentification : requête issue d'un utilisateur Supabase connecté ──
  const authHeader = req.headers.get('Authorization') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!authHeader || !supabaseUrl || !anonKey) {
    return json({ error: 'Non authentifié' }, 401);
  }
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return json({ error: 'Session invalide' }, 401);

  // ── Clé IA ──
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return json({ error: 'Service IA non configuré (secret ANTHROPIC_API_KEY manquant).' }, 503);
  }
  const model = Deno.env.get('AI_MODEL') || DEFAULT_MODEL;

  // ── Corps de requête ──
  let task: string;
  let payload: Record<string, unknown>;
  try {
    const body = await req.json();
    task = body.task;
    payload = body.payload || {};
  } catch {
    return json({ error: 'Corps de requête invalide' }, 400);
  }

  // ── Construction des messages selon la tâche ──
  let system: string;
  let messages: unknown[];
  const maxTokens = 4096;

  if (task === 'ocr-recipe') {
    const imageBase64 = payload.imageBase64 as string;
    const mediaType = payload.mediaType as string;
    if (!imageBase64 || !mediaType) return json({ error: 'Image manquante.' }, 400);
    system = OCR_SYSTEM;
    messages = [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: 'Extrais la ou les recettes de cette image au format JSON demandé.' },
        ],
      },
      { role: 'assistant', content: '{' }, // préfixe pour forcer une réponse JSON
    ];
  } else {
    return json({ error: `Tâche IA inconnue : ${task}` }, 400);
  }

  // ── Appel Anthropic ──
  let aiResp: Response;
  try {
    aiResp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
    });
  } catch (e) {
    console.error('[ai-proxy] fetch error', e);
    return json({ error: 'Service IA injoignable.' }, 502);
  }

  if (!aiResp.ok) {
    const detail = await aiResp.text();
    console.error('[ai-proxy] Anthropic error', aiResp.status, detail);
    return json({ error: `Erreur du service IA (${aiResp.status}).` }, 502);
  }

  const data = await aiResp.json();
  let text: string = (data?.content || [])
    .filter((c: { type: string }) => c.type === 'text')
    .map((c: { text: string }) => c.text)
    .join('');
  // La réponse a été préfixée par '{' côté assistant → on reforme le JSON.
  text = '{' + text;

  let result: unknown;
  try {
    result = JSON.parse(text);
  } catch {
    return json({ error: "Réponse IA non exploitable.", raw: text.slice(0, 400) }, 502);
  }

  return json({ task, result, usage: data.usage || null });
});
