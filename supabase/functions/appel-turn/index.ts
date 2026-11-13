// ================================================================
// Edge Function « appel-turn » : identifiants du relais TURN pour un appel
// audio dans l'app (lot C2b, Messages et contacts ; audit C5, sections 6, 12
// et 13, décisions D2 à D4).
//
// POST (corps ignoré) → { iceServers, ttl }
//   iceServers : liste prête pour new RTCPeerConnection({ iceServers }),
//                rendue par Cloudflare Realtime TURN (generate-ice-servers) ;
//                identifiants à durée courte (TTL_S), jamais la clé.
//
// Qui reçoit des identifiants : une personne connectée (jeton d'un
// utilisateur), au profil actif, qui n'est pas un compte de poste partagé
// (pointage_postes, D4 : ces comptes n'appellent pas et ne sont pas appelés).
// verify_jwt reste actif à la passerelle, mais la clé publique du projet est
// un jeton valide de rôle anon et la passe : c'est le contrôle ci-dessous qui
// la refuse (401).
//
// Secrets, posés par Jérémy lui-même (D3), jamais dans le dépôt ni dans une
// session : CLOUDFLARE_TURN_KEY_ID, CLOUDFLARE_TURN_KEY_API_TOKEN. Tant qu'ils
// manquent : 503. Lus à chaque requête (un secret posé agit sans redéployer).
//
// Codes : 200 identifiants ; 401 sans personne ; 403 compte inactif ou poste
// partagé ; 405 méthode ; 500 configuration Supabase ou profil illisible ;
// 502 relais en erreur ; 503 relais non configuré.
//
// Écrite sans supabase-js (fetch seul) : traiter() se joue sous Node sur un
// fetch simulé, avec le même fichier compilé que celui déployé.
// ================================================================
import { enTetesCors } from '../_shared/cors.ts';

// 30 minutes : sonnerie (30 s) et appel (15 min au plus), avec de la marge.
export const TTL_S = 1800;

const CLOUDFLARE = 'https://rtc.live.cloudflare.com/v1/turn/keys';

type LireEnv = (cle: string) => string | undefined;

export async function traiter(req: Request, env: LireEnv, f: typeof fetch = fetch): Promise<Response> {
  const cors = enTetesCors(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

  const url = env('SUPABASE_URL');
  const service = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !service) return json({ error: 'Configuration incomplète.' }, 500);

  // 1. Une personne : le jeton doit désigner un utilisateur.
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return json({ error: 'Non authentifié.' }, 401);
  const u = await f(`${url}/auth/v1/user`, { headers: { apikey: service, Authorization: `Bearer ${jwt}` } });
  if (!u.ok) return json({ error: 'Non authentifié.' }, 401);
  const user = await u.json().catch(() => null);
  const uid = typeof user?.id === 'string' ? user.id : '';
  if (!uid) return json({ error: 'Non authentifié.' }, 401);

  // 2. Profil actif, hors poste partagé.
  const h = { apikey: service, Authorization: `Bearer ${service}` };
  const id = encodeURIComponent(uid);
  const [rp, rpp] = await Promise.all([
    f(`${url}/rest/v1/profiles?id=eq.${id}&select=actif`, { headers: h }),
    f(`${url}/rest/v1/pointage_postes?user_id=eq.${id}&select=user_id&limit=1`, { headers: h }),
  ]);
  if (!rp.ok || !rpp.ok) {
    console.error('[appel-turn] profil illisible', rp.status, rpp.status);
    return json({ error: 'Profil illisible.' }, 500);
  }
  const profils = await rp.json().catch(() => null);
  const postes = await rpp.json().catch(() => null);
  if (!Array.isArray(profils) || !Array.isArray(postes)) return json({ error: 'Profil illisible.' }, 500);
  if (profils.length !== 1 || profils[0]?.actif === false) return json({ error: 'Compte inactif.' }, 403);
  if (postes.length > 0) return json({ error: 'Poste partagé : appel indisponible.' }, 403);

  // 3. Secrets du relais.
  const cle = env('CLOUDFLARE_TURN_KEY_ID');
  const jeton = env('CLOUDFLARE_TURN_KEY_API_TOKEN');
  if (!cle || !jeton) return json({ error: 'Relais non configuré.' }, 503);

  // 4. Identifiants à durée courte.
  const r = await f(`${CLOUDFLARE}/${encodeURIComponent(cle)}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: TTL_S }),
  });
  if (!r.ok) {
    console.error('[appel-turn] relais', r.status);
    return json({ error: 'Relais indisponible.' }, 502);
  }
  const d = await r.json().catch(() => null);
  const ice = d?.iceServers;
  if (!ice || typeof ice !== 'object') return json({ error: 'Relais indisponible.' }, 502);
  return json({ iceServers: Array.isArray(ice) ? ice : [ice], ttl: TTL_S });
}

if (typeof Deno !== 'undefined') {
  Deno.serve((req: Request) => traiter(req, (cle) => Deno.env.get(cle)));
}
