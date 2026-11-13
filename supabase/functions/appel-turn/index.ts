// ================================================================
// Edge Function « appel-turn » : identifiants du relais pour un appel audio
// dans l'app (lots C2b, Messages et contacts ; amendement A10 du brief :
// relais coturn de la maison, sur un serveur en Suisse chez Infomaniak,
// aucun serveur d'un tiers).
//
// POST (corps ignoré) → { iceServers, ttl }
//   iceServers : liste prête pour new RTCPeerConnection({ iceServers }) :
//                découverte d'adresse (STUN) et relais (TURN en UDP et TCP
//                sur 3478, TLS sur 5349) du serveur COTURN_DOMAINE, avec un
//                identifiant temporaire valable TTL_S secondes.
//
// Identifiant temporaire (mécanisme REST de coturn, option use-auth-secret,
// README.turnserver, section « TURN REST API ») :
//   username   = "<expiration>:<id du compte>", expiration en secondes
//                depuis 1970 ; coturn refuse l'identifiant une fois
//                l'expiration passée ;
//   credential = base64(HMAC-SHA1(secret partagé, username)).
// Le secret ne quitte jamais cette fonction ni le serveur coturn.
//
// Qui reçoit des identifiants : une personne connectée (jeton d'un
// utilisateur), au profil actif, qui n'est pas un compte de poste partagé
// (pointage_postes, D4 : ces comptes n'appellent pas et ne sont pas appelés).
// verify_jwt reste actif à la passerelle, mais une clé publique du projet la
// passe : c'est le contrôle ci-dessous qui la refuse (401).
//
// Secrets, posés par Jérémy lui-même (A10), jamais dans le dépôt ni dans une
// session : COTURN_SECRET (tiré sur le serveur par infra/coturn/installer.sh)
// et COTURN_DOMAINE (nom du serveur, par exemple relais.example.ch). Tant que
// l'un manque : 503, et l'app reste en connexion directe. Lus à chaque
// requête (un secret posé agit sans redéployer).
//
// Codes : 200 identifiants ; 401 sans personne ; 403 compte inactif ou poste
// partagé ; 405 méthode ; 500 configuration Supabase ou profil illisible ;
// 503 relais non configuré.
//
// Écrite sans supabase-js (fetch et WebCrypto seuls) : traiter() se joue sous
// Node sur un fetch simulé, avec le même fichier compilé que celui déployé.
// ================================================================
import { enTetesCors } from '../_shared/cors.ts';

// 30 minutes : sonnerie (30 s) et appel (15 min au plus), avec de la marge.
export const TTL_S = 1800;

// Ports du kit infra/coturn (turnserver.conf) : à changer ensemble.
const PORT = 3478;
const PORT_TLS = 5349;

// Nom d'hôte DNS seul : lettres, chiffres, tirets, points.
const NOM_HOTE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

type LireEnv = (cle: string) => string | undefined;

async function hmacSha1Base64(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cle = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', cle, enc.encode(message)));
  let bin = '';
  for (const o of sig) bin += String.fromCharCode(o);
  return btoa(bin);
}

export async function traiter(
  req: Request,
  env: LireEnv,
  f: typeof fetch = fetch,
  maintenant: () => number = Date.now,
): Promise<Response> {
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
  const secret = env('COTURN_SECRET') || '';
  const domaine = (env('COTURN_DOMAINE') || '').trim().toLowerCase();
  if (!secret || !domaine) return json({ error: 'Relais non configuré.' }, 503);
  if (!NOM_HOTE.test(domaine)) {
    console.error('[appel-turn] COTURN_DOMAINE n\'est pas un nom d\'hôte');
    return json({ error: 'Relais non configuré.' }, 503);
  }

  // 4. Identifiant temporaire, signé par le secret partagé.
  const expiration = Math.floor(maintenant() / 1000) + TTL_S;
  const username = `${expiration}:${uid}`;
  const credential = await hmacSha1Base64(secret, username);
  return json({
    iceServers: [
      { urls: [`stun:${domaine}:${PORT}`] },
      {
        urls: [
          `turn:${domaine}:${PORT}?transport=udp`,
          `turn:${domaine}:${PORT}?transport=tcp`,
          `turns:${domaine}:${PORT_TLS}?transport=tcp`,
        ],
        username,
        credential,
      },
    ],
    ttl: TTL_S,
  });
}

if (typeof Deno !== 'undefined') {
  Deno.serve((req: Request) => traiter(req, (cle) => Deno.env.get(cle)));
}
