// ================================================================
// smtp.ts - Envoi d'un e-mail par une boîte reliée par mot de passe
// (Infomaniak, Hostpoint, Bluewin...).
//
// TLS dès la connexion, port 465 : Supabase refuse les connexions sortantes
// vers les ports 25 et 587, le 465 est le seul chemin. Le message arrive déjà
// composé (MIME) ; ce module ne fait que le dialogue SMTP.
// Sans dépendance externe : Deno.connectTls du runtime Edge.
// ================================================================

export const HOTE_INFOMANIAK = 'mail.infomaniak.com';
const PORT = 465;
const DELAI_MS = 20000;
const NOM_CLIENT = 'samperconsulting-app.com';

export type CompteSmtp = { hote: string; utilisateur: string; motDePasse: string };

export class ErreurSmtp extends Error {
  code: number;
  authentification: boolean;
  constructor(message: string, code = 0, authentification = false) {
    super(message);
    this.code = code;
    this.authentification = authentification;
  }
}

// Nom d'hôte public seulement : pas d'adresse IP, pas de nom local.
export const HOTE_OK = /^(?=.{4,253}$)(?!\d+\.\d+\.\d+\.\d+$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function avecDelai<T>(p: Promise<T>, quoi: string): Promise<T> {
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<never>((_, rejeter) => {
    minuterie = setTimeout(() => rejeter(new ErreurSmtp(`Le serveur d'envoi ne répond pas (${quoi}).`)), DELAI_MS);
  });
  return Promise.race([p, delai]).finally(() => clearTimeout(minuterie));
}

function base64(texte: string) {
  const octets = new TextEncoder().encode(texte);
  let s = '';
  for (const o of octets) s += String.fromCharCode(o);
  return btoa(s);
}

// Ouvre une session authentifiée, envoie le message s'il y en a un, puis
// ferme. Sans envoi, la session sert d'essai des identifiants.
export async function smtp(compte: CompteSmtp, envoi?: { de: string; a: string; message: string }) {
  let conn: Deno.TlsConn;
  try {
    conn = await avecDelai(Deno.connectTls({ hostname: compte.hote, port: PORT }), 'connexion');
  } catch (e) {
    if (e instanceof ErreurSmtp) throw e;
    throw new ErreurSmtp(`Connexion au serveur d'envoi ${compte.hote} impossible : vérifiez son adresse.`);
  }
  const encodeur = new TextEncoder();
  const decodeur = new TextDecoder();
  const morceau = new Uint8Array(4096);
  let tampon = '';

  // Une réponse SMTP : des lignes « 250-... » puis une dernière « 250 ... ».
  const lire = async (): Promise<{ code: number; lignes: string[] }> => {
    for (;;) {
      const lignes = tampon.split('\r\n');
      for (let i = 0; i < lignes.length - 1; i++) {
        if (/^\d{3}(?: |$)/.test(lignes[i])) {
          tampon = lignes.slice(i + 1).join('\r\n');
          return { code: Number(lignes[i].slice(0, 3)), lignes: lignes.slice(0, i + 1).map((l) => l.slice(4)) };
        }
      }
      const n = await avecDelai(conn.read(morceau), 'lecture');
      if (n === null) throw new ErreurSmtp('Le serveur d\'envoi a coupé la connexion.');
      tampon += decodeur.decode(morceau.subarray(0, n), { stream: true });
    }
  };
  const ecrire = async (texte: string) => {
    const octets = encodeur.encode(texte);
    let fait = 0;
    while (fait < octets.length) fait += await avecDelai(conn.write(octets.subarray(fait)), 'écriture');
  };
  const commande = async (ligne: string | null, attendus: number[], etape: string) => {
    if (ligne !== null) await ecrire(`${ligne}\r\n`);
    const r = await lire();
    if (!attendus.includes(r.code)) {
      // 530, 534, 535 : identifiants refusés. Un refus passager (454) ne doit
      // pas faire passer la boîte en erreur.
      const refus = etape === 'authentification' && [530, 534, 535].includes(r.code);
      throw new ErreurSmtp(`${etape} : ${r.code} ${r.lignes.join(' ')}`.slice(0, 300), r.code, refus);
    }
    return r;
  };

  try {
    await commande(null, [220], 'accueil');
    const ehlo = await commande(`EHLO ${NOM_CLIENT}`, [250], 'présentation');
    const mecanismes = ehlo.lignes.find((l) => /^AUTH[ =]/i.test(l))?.toUpperCase() || '';
    if (mecanismes.includes('PLAIN') || !mecanismes.includes('LOGIN')) {
      await commande(`AUTH PLAIN ${base64(`\0${compte.utilisateur}\0${compte.motDePasse}`)}`, [235], 'authentification');
    } else {
      await commande('AUTH LOGIN', [334], 'authentification');
      await commande(base64(compte.utilisateur), [334], 'authentification');
      await commande(base64(compte.motDePasse), [235], 'authentification');
    }
    if (envoi) {
      await commande(`MAIL FROM:<${envoi.de}>`, [250], 'expéditeur');
      await commande(`RCPT TO:<${envoi.a}>`, [250, 251], 'destinataire');
      await commande('DATA', [354], 'message');
      // Fins de ligne CRLF, et un point en début de ligne doublé (RFC 5321).
      const corps = envoi.message.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
      await ecrire(`${corps}${corps.endsWith('\r\n') ? '' : '\r\n'}.\r\n`);
      await commande(null, [250], 'envoi');
    }
    try { await ecrire('QUIT\r\n'); } catch { /* fermeture au mieux */ }
  } finally {
    try { conn.close(); } catch { /* déjà fermée */ }
  }
}

// Message lisible par l'équipe. Le détail technique reste dans les journaux.
export function messageSmtp(e: unknown) {
  if (e instanceof ErreurSmtp) {
    if (e.authentification) return 'Adresse ou mot de passe refusé par le serveur d\'envoi.';
    if (!e.code) return e.message;
    if (e.code === 550 || e.code === 553) return `Adresse refusée par le serveur d'envoi (${e.message}).`;
    return `Envoi refusé par le serveur d'envoi (${e.message}).`;
  }
  return 'Le serveur d\'envoi n\'a pas répondu. Réessayez.';
}
