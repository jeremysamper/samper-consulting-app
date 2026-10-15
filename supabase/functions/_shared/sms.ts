// ================================================================
// sms.ts - SMS envoyés avec la carte SIM du restaurant.
//
// Un téléphone Android reste au restaurant, avec la carte SIM achetée par le
// restaurant et l'appli libre « SMS Gateway for Android » (sms-gate.app). Le
// serveur de l'appli relaie l'envoi au téléphone, qui envoie le SMS depuis le
// numéro de la SIM. API : POST <serveur>/messages, authentification Basic avec
// l'identifiant et le mot de passe affichés par l'appli.
// Sans dépendance externe.
// ================================================================

export const SERVEUR_SMS_DEFAUT = 'https://api.sms-gate.app/3rdparty/v1';
const DELAI_MS = 15000;
// Un SMS de confirmation qui n'a pas pu partir dans les 6 heures (téléphone
// éteint) n'est plus envoyé : il arriverait trop tard pour servir.
const DUREE_DE_VIE_S = 6 * 3600;

export type CompteSms = { serveur: string; identifiant: string; motDePasse: string };
export type Appareil = { id: string; nom: string; vuLe: string | null };

export class ErreurSms extends Error {
  statut: number;
  constructor(message: string, statut = 0) {
    super(message);
    this.statut = statut;
  }
  get identifiantsRefuses() { return this.statut === 401 || this.statut === 403; }
}

function base64(texte: string) {
  const octets = new TextEncoder().encode(texte);
  let s = '';
  for (const o of octets) s += String.fromCharCode(o);
  return btoa(s);
}

async function appeler(compte: CompteSms, chemin: string, init: RequestInit = {}) {
  let r: Response;
  try {
    r = await fetch(`${compte.serveur.replace(/\/+$/, '')}${chemin}`, {
      ...init,
      headers: {
        Authorization: `Basic ${base64(`${compte.identifiant}:${compte.motDePasse}`)}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(DELAI_MS),
    });
  } catch {
    throw new ErreurSms('Le service SMS ne répond pas. Réessayez.');
  }
  const corps = await r.json().catch(() => null);
  if (!r.ok) {
    const detail = String(corps?.message || corps?.error || '').slice(0, 200);
    throw new ErreurSms(detail ? `${r.status} ${detail}` : `HTTP ${r.status}`, r.status);
  }
  return corps;
}

// Téléphones reliés à ce compte : sert d'essai des identifiants.
export async function listerAppareils(compte: CompteSms): Promise<Appareil[]> {
  const liste = await appeler(compte, '/devices');
  return (Array.isArray(liste) ? liste : [])
    .filter((d) => d && !d.deletedAt)
    .map((d) => ({ id: String(d.id || ''), nom: String(d.name || 'Téléphone'), vuLe: d.lastSeen || null }))
    .sort((a, b) => String(b.vuLe || '').localeCompare(String(a.vuLe || '')));
}

export async function envoyerSms(compte: CompteSms, numero: string, texte: string): Promise<{ id: string | null }> {
  const r = await appeler(compte, '/messages', {
    method: 'POST',
    body: JSON.stringify({
      textMessage: { text: texte },
      phoneNumbers: [numero],
      ttl: DUREE_DE_VIE_S,
      withDeliveryReport: true,
    }),
  });
  return { id: r?.id ? String(r.id) : null };
}

// Numéro de portable au format international (+41791234567), ou null.
// Un numéro suisse doit être un portable (075 à 079) : un fixe ne reçoit pas
// de SMS. Un numéro étranger est pris tel quel.
export function normaliserMobile(brut: string | null | undefined): string | null {
  const s = String(brut || '').replace(/[\s.\-()/]/g, '');
  let n: string | null = null;
  if (/^\+\d{8,15}$/.test(s)) n = s;
  else if (/^00\d{8,15}$/.test(s)) n = `+${s.slice(2)}`;
  else if (/^0\d{9}$/.test(s)) n = `+41${s.slice(1)}`;
  if (!n) return null;
  if (n.startsWith('+41') && !/^\+417[5-9]\d{7}$/.test(n)) return null;
  return n;
}

// Caractères hors de l'alphabet SMS standard remplacés par leur plus proche
// voisin : un seul de ces caractères ferait passer tout le message en Unicode
// (70 caractères par SMS au lieu de 160).
const VOISINS: Record<string, string> = {
  'â': 'a', 'ê': 'e', 'ë': 'e', 'î': 'i', 'ï': 'i', 'ô': 'o', 'û': 'u', 'ç': 'c', 'œ': 'oe',
  'Â': 'A', 'Ê': 'E', 'Ë': 'E', 'Î': 'I', 'Ï': 'I', 'Ô': 'O', 'Û': 'U', 'Œ': 'OE',
};
// Ponctuation typographique (apostrophes et guillemets courbes, tirets,
// espaces insécables), désignée par son code pour ne pas l'écrire ici.
const PONCTUATION: [number, string][] = [
  [0x2019, '\''], [0x2018, '\''], [0xab, '"'], [0xbb, '"'], [0x2013, '-'], [0x2014, '-'], [0xa0, ' '], [0x202f, ' '],
];
for (const [code, voisin] of PONCTUATION) VOISINS[String.fromCharCode(code)] = voisin;
const HORS_ALPHABET = new RegExp(`[${Object.keys(VOISINS).join('')}]`, 'g');

export function texteSms(t: string) {
  return t.replace(HORS_ALPHABET, (c) => VOISINS[c] || c);
}

export function messageSms(e: unknown) {
  if (e instanceof ErreurSms) {
    if (e.identifiantsRefuses) return 'Identifiant ou mot de passe refusé : recopiez ceux affichés dans l\'appli du téléphone.';
    if (!e.statut) return e.message;
    return `Envoi refusé par le service SMS (${e.message}).`;
  }
  return 'Le service SMS n\'a pas répondu. Réessayez.';
}
