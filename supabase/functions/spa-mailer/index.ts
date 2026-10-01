// ================================================================
// Edge Function « spa-mailer »
//
// Tous les e-mails du module Spa partent d'ici, et c'est ici seulement que
// naissent les bons cadeaux (spa_bons n'a aucune politique INSERT pour le
// front).
//
// D'OÙ PARTENT LES E-MAILS (fonction expedier) :
//   1. de la boîte mail du spa quand il l'a connectée (Gmail ou Outlook,
//      connexion OAuth, jetons chiffrés dans spa_boites_mail) : l'e-mail
//      part de son adresse et les réponses y arrivent ;
//   2. sinon par Resend (adresse d'envoi Samper Consulting), s'il est
//      configuré ; aussi en repli quand la boîte connectée échoue ;
//   3. sinon rien ne part, et l'app le dit.
//
// Actions (POST JSON { action, ... }) :
//   etat              membre      → canaux d'envoi disponibles, boîte connectée
//   boite_debut       direction   → { fournisseur } : adresse de connexion Google
//                                   ou Microsoft (state + PKCE)
//   boite_fin         public      → { etat, code } : fin de connexion (appelée par
//                                   la route Vercel /api/spa-oauth)
//   boite_deconnexion direction   → retire la boîte (révocation Google)
//   test              direction   → e-mail d'essai à l'adresse du compte connecté
//   campagne          direction   → actualité à tous les clients consentants
//   bon               équipe      → bon cadeau à un client, tout de suite
//   anniversaires     cron        → tous les établissements dont l'envoi est actif
//                     direction   → le seul établissement demandé (rattrapage)
//   desinscription    public      → { token } : retire le consentement (clients
//                                   du spa ou du fichier clients des restaurants)
//   rdv_statut        équipe      → e-mail « confirmé » ou « refusé » après
//                                   traitement d'une demande venue du site
//
// Réservation en ligne (widget sur le site du client, migration 20260928) :
//   public_infos     public   → { slug } : carte des soins en ligne, horaires
//   public_creneaux  public   → { slug, soinId, date } : heures libres
//   public_reserver  public   → pose une DEMANDE (statut 'demande') via
//                               spa_reserver_en_ligne (verrou, pas de doublon)
// Ces actions ne renvoient jamais le nom d'un autre client. Anti-abus : champ
// piège, durée de saisie minimale, 5 demandes par heure et par adresse IP
// (hachée), 3 par jour et par e-mail.
//
// Réservation d'une table en ligne (module Réservations, migration 20260929),
// même principe, page /table/<adresse> :
//   public_table_infos     public  → { slug } : jours ouverts, taille max
//   public_table_creneaux  public  → { slug, date, couverts } : heures d'arrivée
//                                    encore ouvertes, par service
//   public_table_reserver  public  → pose la réservation ('demande' ou
//                                    'confirme' selon le mode du restaurant) via
//                                    resa_reserver_en_ligne (verrou, capacité),
//                                    puis complète la fiche client (resa_clients :
//                                    prénom, nom, accord pour les actualités)
//   resa_statut            équipe  → e-mail « confirmée » ou « refusée » après
//                                    traitement d'une demande venue du site
// Mêmes protections anti-abus (journal spa_demandes_en_ligne partagé). Les
// e-mails partent par le même canal que ceux du spa (boîte connectée de
// l'établissement, sinon Resend), signés du nom de l'établissement.
//
// Sécurité : verify_jwt=false (lien de désinscription, cron, retour OAuth et
// réservation publique n'ont pas de session). Chaque action authentifie
// elle-même : CRON_SECRET pour le cron, JWT + profil (rôle, établissements)
// pour l'équipe, jeton uuid pour la désinscription, state à usage unique pour
// le retour OAuth.
//
// Secrets : RESEND_API_KEY + SPA_MAIL_FROM (repli Resend), CRON_SECRET,
// GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (connexion Gmail),
// MS_CLIENT_ID + MS_CLIENT_SECRET (connexion Outlook / Microsoft 365),
// APP_PUBLIC_URL (facultatif, défaut https://samperconsulting-app.com ; l'adresse
// de retour OAuth est <APP_PUBLIC_URL>/api/spa-oauth).
// Les jetons des boîtes sont chiffrés (AES-GCM) avec une clé dérivée de
// SUPABASE_SERVICE_ROLE_KEY : si cette clé change, les spas reconnectent leur
// boîte.
// ================================================================
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

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

const TZ = 'Europe/Zurich';
const ROLES_EQUIPE = ['consultant', 'patron', 'resp_cuisine', 'cuisinier', 'serveur', 'hote', 'praticien_spa'];
const ROLES_DIRECTION = ['consultant', 'patron'];
const RESEND_URL = 'https://api.resend.com';
const LOT_MAX = 100; // limite de l'API batch de Resend
// Une boîte Gmail ou Outlook limite les envois (quelques centaines par jour) :
// au-delà, une actualité doit passer par Resend.
const PLAFOND_BOITE = 400;

type Admin = SupabaseClient;

function admin(): Admin {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

function config() {
  const cle = Deno.env.get('RESEND_API_KEY') || '';
  const from = Deno.env.get('SPA_MAIL_FROM') || '';
  const appUrl = (Deno.env.get('APP_PUBLIC_URL') || 'https://samperconsulting-app.com').replace(/\/+$/, '');
  return {
    cle,
    from,
    appUrl,
    resend: Boolean(cle && from),
    google: { id: Deno.env.get('GOOGLE_CLIENT_ID') || '', secret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '' },
    microsoft: { id: Deno.env.get('MS_CLIENT_ID') || '', secret: Deno.env.get('MS_CLIENT_SECRET') || '' },
    redirection: `${appUrl}/api/spa-oauth`,
  };
}
type Cfg = ReturnType<typeof config>;
type Fournisseur = 'google' | 'microsoft';
const connexionDispo = (cfg: Cfg, f: Fournisseur) => Boolean(cfg[f].id && cfg[f].secret);

// ── Dates à Zurich ────────────────────────────────────────────────
function zurichToday(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}

function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function estBissextile(annee: number) {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
}

// Anniversaire « aujourd'hui » : un client né un 29 février est fêté le 28
// les années non bissextiles, plutôt que jamais.
function fetéAujourdhui(naissance: string, aujourdhui: string): boolean {
  const [annee, mois, jour] = aujourdhui.split('-').map(Number);
  const [, mN, jN] = naissance.split('-').map(Number);
  if (mN === 2 && jN === 29 && !estBissextile(annee)) return mois === 2 && jour === 28;
  return mois === mN && jour === jN;
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];
function dateLongue(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MOIS[m - 1]} ${y}`;
}

// ── Base64 et chiffrement ─────────────────────────────────────────
const utf8 = (t: string) => new TextEncoder().encode(t);

function versB64(octets: Uint8Array) {
  let s = '';
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s);
}
function depuisB64(b: string) {
  const s = atob(b);
  const o = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i);
  return o;
}
const versB64Url = (o: Uint8Array) => versB64(o).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const aleatoire = (n: number) => versB64Url(crypto.getRandomValues(new Uint8Array(n)));

let cleChiffrement: CryptoKey | null = null;
async function cle() {
  if (cleChiffrement) return cleChiffrement;
  const base = await crypto.subtle.importKey('raw', utf8(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''), 'HKDF', false, ['deriveKey']);
  cleChiffrement = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: utf8('spa-boites-mail'), info: utf8('v1') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
  return cleChiffrement;
}
async function chiffrer(texte: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const code = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cle(), utf8(texte)));
  return `${versB64(iv)}.${versB64(code)}`;
}
async function dechiffrer(valeur: string) {
  const [iv, code] = valeur.split('.');
  const clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: depuisB64(iv) }, await cle(), depuisB64(code));
  return new TextDecoder().decode(clair);
}

// ── Codes de bon : sans caractères ambigus (0/O, 1/I/L) ───────────
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function codeBon(nomEtab: string) {
  const prefixe = (nomEtab || 'SPA').normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'SPA';
  const octets = crypto.getRandomValues(new Uint8Array(8));
  const c = Array.from(octets, (o) => ALPHABET[o % ALPHABET.length]).join('');
  return `${prefixe}-${c.slice(0, 4)}-${c.slice(4)}`;
}

// ── Gabarit HTML ─────────────────────────────────────────────────
function esc(s: unknown) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function personnaliser(texte: string, client: { prenom?: string | null; nom?: string | null }) {
  const prenom = (client.prenom || '').trim() || (client.nom || '').trim();
  return String(texte || '')
    .replace(/\{prenom\}/gi, prenom)
    .replace(/\{nom\}/gi, (client.nom || '').trim());
}

function paragraphes(texte: string) {
  return String(texte || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#2b2b2b;">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

type Etab = { id: string; nom: string; adresse?: string | null; tel?: string | null; email?: string | null };
type Params = {
  anniversaire_actif: boolean; bon_valeur: string; bon_validite_jours: number;
  anniversaire_sujet: string | null; anniversaire_message: string | null;
  nom_expediteur: string | null; email_reponse: string | null; signature: string | null;
};
type Client = {
  id: string; prenom: string | null; nom: string | null; email: string | null;
  date_naissance: string | null; consentement_marketing: boolean; desinscription_token: string; archive: boolean;
};
type Bon = { code: string; valeur: string; valable_jusqu: string | null; message?: string | null };

const PARAMS_DEFAUT: Params = {
  anniversaire_actif: false,
  bon_valeur: '20 % sur le soin de votre choix',
  bon_validite_jours: 60,
  anniversaire_sujet: null,
  anniversaire_message: null,
  nom_expediteur: null,
  email_reponse: null,
  signature: null,
};

const SUJET_ANNIV = 'Joyeux anniversaire {prenom} : un cadeau vous attend';
const MESSAGE_ANNIV = 'Bonjour {prenom},\n\nToute l\'équipe vous souhaite un très joyeux anniversaire.\n\nPour l\'occasion, nous avons le plaisir de vous offrir le bon ci-dessous. Il suffit de le présenter (ou de nous donner son code) lors de votre réservation.\n\nAu plaisir de vous accueillir très bientôt.';

function lienDesinscription(appUrl: string, token: string) {
  return `${appUrl}/api/spa-desinscription?t=${encodeURIComponent(token)}`;
}

function gabarit(opts: {
  etab: Etab; params: Params; titre: string; corps: string; bon?: Bon | null; lienDesinscr?: string | null;
}) {
  const { etab, params, titre, corps, bon, lienDesinscr } = opts;
  const signature = (params.signature || '').trim() || `L'équipe ${etab.nom}`;
  const coordonnees = [etab.adresse, etab.tel, params.email_reponse || etab.email].filter(Boolean).map(esc).join('<br>');
  const carteBon = bon ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;border-collapse:separate;">
      <tr><td style="border:1px solid #d9cbb6;border-radius:14px;background:#fbf7f1;padding:26px 22px;text-align:center;">
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9a8466;margin-bottom:10px;">Bon cadeau</div>
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.35;color:#2b2b2b;margin-bottom:16px;">${esc(bon.valeur)}</div>
        ${bon.message ? `<div style="font-size:14px;line-height:1.55;color:#5a5a5a;margin-bottom:16px;">${esc(bon.message)}</div>` : ''}
        <div style="display:inline-block;padding:10px 18px;border:1px dashed #9a8466;border-radius:8px;font-family:'Courier New',monospace;font-size:18px;letter-spacing:2px;color:#2b2b2b;">${esc(bon.code)}</div>
        ${bon.valable_jusqu ? `<div style="font-size:12px;color:#8a8a8a;margin-top:12px;">Valable jusqu'au ${esc(dateLongue(bon.valable_jusqu))}</div>` : ''}
      </td></tr>
    </table>` : '';
  const pied = lienDesinscr
    ? `Vous recevez cet e-mail car vous avez accepté de recevoir nos nouvelles. <a href="${esc(lienDesinscr)}" style="color:#8a8a8a;">Se désinscrire</a>`
    : '';
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titre)}</title></head>
<body style="margin:0;padding:0;background:#f3efe9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe9;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:30px 32px 8px;text-align:center;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;letter-spacing:1px;color:#2b2b2b;">${esc(etab.nom)}</div>
          <div style="width:40px;height:1px;background:#d9cbb6;margin:16px auto 0;"></div>
        </td></tr>
        <tr><td style="padding:24px 32px 8px;font-family:Helvetica,Arial,sans-serif;">
          ${paragraphes(corps)}
          ${carteBon}
          <p style="margin:0 0 4px;font-size:15px;line-height:1.6;color:#2b2b2b;">${esc(signature).replace(/\n/g, '<br>')}</p>
        </td></tr>
        <tr><td style="padding:22px 32px 28px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#8a8a8a;text-align:center;border-top:1px solid #f0ebe3;">
          ${coordonnees ? `<div>${coordonnees}</div>` : ''}
          ${pied ? `<div style="margin-top:8px;">${pied}</div>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function texteBrut(corps: string, bon?: Bon | null, lien?: string | null) {
  const lignes = [corps.trim()];
  if (bon) {
    lignes.push('', `BON CADEAU : ${bon.valeur}`, `Code : ${bon.code}`);
    if (bon.valable_jusqu) lignes.push(`Valable jusqu'au ${dateLongue(bon.valable_jusqu)}`);
  }
  if (lien) lignes.push('', `Se désinscrire : ${lien}`);
  return lignes.join('\n');
}

function enTetesDesinscription(lien: string | null) {
  if (!lien) return undefined;
  return { 'List-Unsubscribe': `<${lien}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
}

// ── Canal 2 : Resend ──────────────────────────────────────────────
type Mail = {
  to: string; subject: string; html: string; text: string;
  from: string; reply_to?: string; headers?: Record<string, string>;
};

function expediteur(etab: Etab, params: Params, from: string) {
  const nom = ((params.nom_expediteur || '').trim() || etab.nom).replace(/["<>]/g, '');
  return `${nom} <${from}>`;
}

async function envoyerUn(cle: string, mail: Mail): Promise<{ id?: string; erreur?: string }> {
  try {
    const r = await fetch(`${RESEND_URL}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(mail),
    });
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) return { erreur: String(corps?.message || corps?.error || `HTTP ${r.status}`).slice(0, 300) };
    return { id: corps?.id };
  } catch (e) {
    return { erreur: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
}

// Lot de 100 au plus. Resend renvoie les ids dans l'ordre ; en cas d'échec du
// lot entier, chaque e-mail du lot est marqué en échec.
async function envoyerLot(cle: string, mails: Mail[]): Promise<{ id?: string; erreur?: string }[]> {
  try {
    const r = await fetch(`${RESEND_URL}/emails/batch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(mails),
    });
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) {
      const erreur = String(corps?.message || corps?.error || `HTTP ${r.status}`).slice(0, 300);
      return mails.map(() => ({ erreur }));
    }
    const ids: { id?: string }[] = Array.isArray(corps?.data) ? corps.data : [];
    return mails.map((_, i) => ({ id: ids[i]?.id }));
  } catch (e) {
    const erreur = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    return mails.map(() => ({ erreur }));
  }
}

// ── Canal 1 : la boîte mail du spa (Gmail ou Outlook) ─────────────
type Boite = {
  etablissement_id: string; fournisseur: Fournisseur; adresse: string; nom: string | null;
  jeton_chiffre: string; acces_chiffre: string | null; acces_expire_at: string | null;
  statut: 'actif' | 'erreur'; derniere_erreur: string | null; connecte_at: string;
};

const SCOPES_GOOGLE = 'openid email https://www.googleapis.com/auth/gmail.send';
const SCOPES_MICROSOFT = 'offline_access openid email User.Read Mail.Send';
const JETON_URL: Record<Fournisseur, string> = {
  google: 'https://oauth2.googleapis.com/token',
  microsoft: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
};

async function lireBoite(sb: Admin, etabId: string): Promise<Boite | null> {
  const { data } = await sb.from('spa_boites_mail').select('*').eq('etablissement_id', etabId).maybeSingle();
  return (data as Boite) || null;
}

async function peutEnvoyer(sb: Admin, cfg: Cfg, etabId: string) {
  if (cfg.resend) return true;
  const b = await lireBoite(sb, etabId);
  return Boolean(b && b.statut === 'actif');
}

async function marquerBoite(sb: Admin, etabId: string, maj: Record<string, unknown>) {
  await sb.from('spa_boites_mail').update({ ...maj, updated_at: new Date().toISOString() }).eq('etablissement_id', etabId);
}

// Jeton d'accès valable (renouvelé si besoin). Le jeton d'accès est gardé
// chiffré avec son heure d'expiration : une actualité envoyée à 300 clients
// ne renouvelle qu'une fois. Microsoft renvoie un nouveau jeton de
// renouvellement à chaque fois : il remplace l'ancien.
async function jetonAcces(sb: Admin, cfg: Cfg, boite: Boite, forcer = false): Promise<string> {
  if (!forcer && boite.acces_chiffre && boite.acces_expire_at
    && new Date(boite.acces_expire_at).getTime() - 120000 > Date.now()) {
    return dechiffrer(boite.acces_chiffre);
  }
  const f = boite.fournisseur;
  const form = new URLSearchParams({
    client_id: cfg[f].id, client_secret: cfg[f].secret,
    grant_type: 'refresh_token', refresh_token: await dechiffrer(boite.jeton_chiffre),
  });
  if (f === 'microsoft') form.set('scope', SCOPES_MICROSOFT);
  const r = await fetch(JETON_URL[f], { method: 'POST', body: form });
  const c = await r.json().catch(() => ({}));
  if (!r.ok || !c.access_token) {
    const message = c.error === 'invalid_grant'
      ? 'La connexion à la boîte mail a expiré ou a été retirée : reconnectez-la.'
      : `La boîte mail a refusé le renouvellement de la connexion (${c.error || r.status}).`;
    await marquerBoite(sb, boite.etablissement_id, { statut: 'erreur', derniere_erreur: message });
    boite.statut = 'erreur';
    throw new Error(message);
  }
  const maj: Record<string, unknown> = {
    acces_chiffre: await chiffrer(c.access_token),
    acces_expire_at: new Date(Date.now() + Number(c.expires_in || 3600) * 1000).toISOString(),
    statut: 'actif', derniere_erreur: null,
  };
  if (c.refresh_token) maj.jeton_chiffre = await chiffrer(c.refresh_token);
  await marquerBoite(sb, boite.etablissement_id, maj);
  Object.assign(boite, maj);
  return c.access_token;
}

// En-tête MIME (RFC 2047) : nom d'expéditeur et objet accentués.
const motEncode = (t: string) => `=?UTF-8?B?${versB64(utf8(t))}?=`;
const b64Lignes = (t: string) => versB64(utf8(t)).replace(/.{76}/g, '$&\r\n');

function messageMime(m: { de: string; a: string; repondreA?: string; objet: string; html: string; texte: string; entetes?: Record<string, string> }) {
  const frontiere = `spa-${crypto.randomUUID()}`;
  const lignes = [
    `From: ${m.de}`,
    `To: ${m.a}`,
    ...(m.repondreA ? [`Reply-To: ${m.repondreA}`] : []),
    `Subject: ${motEncode(m.objet)}`,
    'MIME-Version: 1.0',
    ...Object.entries(m.entetes || {}).map(([k, v]) => `${k}: ${v}`),
    `Content-Type: multipart/alternative; boundary="${frontiere}"`,
    '',
    `--${frontiere}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64Lignes(m.texte),
    `--${frontiere}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64Lignes(m.html),
    `--${frontiere}--`,
    '',
  ];
  return versB64Url(utf8(lignes.join('\r\n')));
}

type Envoi = { to: string; subject: string; html: string; text: string; headers?: Record<string, string> };

async function envoyerViaBoite(sb: Admin, cfg: Cfg, boite: Boite, e: Envoi, nomExpediteur: string, repondreA?: string) {
  const tenter = async (jeton: string) => {
    if (boite.fournisseur === 'google') {
      const raw = messageMime({
        de: `${motEncode(nomExpediteur)} <${boite.adresse}>`, a: e.to, repondreA,
        objet: e.subject, html: e.html, texte: e.text, entetes: e.headers,
      });
      const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      });
      const c = await r.json().catch(() => ({}));
      return { statut: r.status, id: c?.id as string | undefined, erreur: r.ok ? undefined : `Gmail : ${c?.error?.message || r.status}` };
    }
    // Microsoft Graph n'accepte que des en-têtes personnalisés « X- » : le lien
    // de désinscription reste dans le pied de l'e-mail.
    const r = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: e.subject,
          body: { contentType: 'HTML', content: e.html },
          toRecipients: [{ emailAddress: { address: e.to } }],
          replyTo: repondreA ? [{ emailAddress: { address: repondreA } }] : [],
        },
        saveToSentItems: true,
      }),
    });
    if (r.status === 202 || r.ok) return { statut: r.status, id: undefined, erreur: undefined };
    const c = await r.json().catch(() => ({}));
    return { statut: r.status, id: undefined, erreur: `Outlook : ${c?.error?.message || r.status}` };
  };
  try {
    let res = await tenter(await jetonAcces(sb, cfg, boite));
    // Jeton d'accès retiré entre-temps : on renouvelle une fois et on réessaie.
    if (res.statut === 401) res = await tenter(await jetonAcces(sb, cfg, boite, true));
    return { id: res.id, erreur: res.erreur ? res.erreur.slice(0, 300) : undefined };
  } catch (err) {
    return { erreur: (err instanceof Error ? err.message : String(err)).slice(0, 300) };
  }
}

// ── Point d'envoi unique ──────────────────────────────────────────
// boiteConnue : évite de relire la boîte pour chaque e-mail d'une actualité
// (undefined = à lire, null = aucune).
async function expedier(
  sb: Admin, cfg: Cfg, etab: Etab, params: Params, e: Envoi, boiteConnue?: Boite | null,
): Promise<{ id?: string; erreur?: string; canal: 'google' | 'microsoft' | 'resend' | null }> {
  const boite = boiteConnue === undefined ? await lireBoite(sb, etab.id) : boiteConnue;
  const nomExpediteur = ((params.nom_expediteur || '').trim() || etab.nom).replace(/["<>]/g, '');
  if (boite && boite.statut === 'actif') {
    const r = await envoyerViaBoite(sb, cfg, boite, e, nomExpediteur, params.email_reponse || undefined);
    if (!r.erreur || !cfg.resend) return { ...r, canal: boite.fournisseur };
    console.warn('[spa-mailer] boîte en échec, repli Resend :', r.erreur);
  }
  if (cfg.resend) {
    const r = await envoyerUn(cfg.cle, {
      from: expediteur(etab, params, cfg.from),
      to: e.to,
      reply_to: params.email_reponse || etab.email || undefined,
      subject: e.subject,
      html: e.html,
      text: e.text,
      headers: e.headers,
    });
    return { ...r, canal: 'resend' };
  }
  return { erreur: 'Aucune boîte mail connectée et aucun service d\'envoi configuré.', canal: null };
}

// ── Lecture établissement + paramètres ────────────────────────────
async function lireEtab(sb: Admin, etabId: string): Promise<{ etab: Etab; params: Params } | null> {
  const [{ data: etab }, { data: params }] = await Promise.all([
    sb.from('etablissements').select('id, nom, adresse, tel, email').eq('id', etabId).maybeSingle(),
    sb.from('spa_parametres').select('*').eq('etablissement_id', etabId).maybeSingle(),
  ]);
  if (!etab) return null;
  return { etab: etab as Etab, params: { ...PARAMS_DEFAUT, ...(params || {}) } as Params };
}

// ── Authentification de l'équipe ──────────────────────────────────
type Appelant = { uid: string; email: string | null; role: string; etabIds: string[] };

async function appelant(req: Request, sb: Admin): Promise<Appelant | null> {
  const auth = req.headers.get('authorization') || '';
  const jwt = auth.replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data, error } = await sb.auth.getUser(jwt);
  if (error || !data?.user) return null;
  const { data: profil } = await sb.from('profiles')
    .select('role, etablissement_ids, actif, email').eq('id', data.user.id).maybeSingle();
  if (!profil || profil.actif === false) return null;
  return {
    uid: data.user.id,
    email: profil.email || data.user.email || null,
    role: profil.role || '',
    etabIds: Array.isArray(profil.etablissement_ids) ? profil.etablissement_ids : [],
  };
}

function autorise(a: Appelant | null, etabId: string, roles: string[]) {
  return Boolean(a && etabId && a.etabIds.includes(etabId) && roles.includes(a.role));
}

// ── Connexion de la boîte (OAuth, code + PKCE) ────────────────────
async function debutConnexion(sb: Admin, cfg: Cfg, etabId: string, f: Fournisseur, userId: string) {
  const etat = aleatoire(32);
  const verificateur = aleatoire(48);
  const defi = versB64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(verificateur))));
  await sb.from('spa_oauth_etats').delete().lt('expire_at', new Date().toISOString());
  const { error } = await sb.from('spa_oauth_etats').insert({
    etat, etablissement_id: etabId, fournisseur: f, verificateur, user_id: userId,
  });
  if (error) throw error;
  const commun = {
    client_id: cfg[f].id, redirect_uri: cfg.redirection, response_type: 'code',
    state: etat, code_challenge: defi, code_challenge_method: 'S256',
  };
  if (f === 'google') {
    return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      ...commun, scope: SCOPES_GOOGLE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
    })}`;
  }
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${new URLSearchParams({
    ...commun, scope: SCOPES_MICROSOFT, response_mode: 'query', prompt: 'select_account',
  })}`;
}

async function finConnexion(sb: Admin, cfg: Cfg, etat: string, code: string, erreurFournisseur: string) {
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(etat)) return { erreur: 'Lien de connexion invalide. Recommencez depuis l\'app.' };
  // Usage unique : la ligne est supprimée en même temps qu'elle est lue.
  const { data: e } = await sb.from('spa_oauth_etats').delete().eq('etat', etat).select().maybeSingle();
  if (!e || new Date(e.expire_at).getTime() < Date.now()) return { erreur: 'Le lien de connexion a expiré. Recommencez depuis l\'app.' };
  if (erreurFournisseur || !code) return { erreur: 'Connexion annulée : aucune boîte n\'a été connectée.' };
  const f = e.fournisseur as Fournisseur;
  if (!connexionDispo(cfg, f)) return { erreur: 'Connexion non activée.' };

  const form = new URLSearchParams({
    code, client_id: cfg[f].id, client_secret: cfg[f].secret, redirect_uri: cfg.redirection,
    grant_type: 'authorization_code', code_verifier: e.verificateur,
  });
  if (f === 'microsoft') form.set('scope', SCOPES_MICROSOFT);
  const r = await fetch(JETON_URL[f], { method: 'POST', body: form });
  const t = await r.json().catch(() => ({}));
  if (!r.ok || !t.access_token) {
    console.error('[spa-mailer] échange du code', f, t?.error, t?.error_description);
    return { erreur: 'La connexion a été refusée. Réessayez, ou vérifiez que vous avez accepté les autorisations.' };
  }
  if (!t.refresh_token) return { erreur: 'La boîte n\'a pas accordé d\'accès durable. Recommencez la connexion.' };
  if (f === 'google' && !String(t.scope || '').includes('gmail.send')) {
    return { erreur: 'Il faut cocher l\'autorisation « Envoyer des e-mails en votre nom ». Recommencez la connexion.' };
  }

  let adresse = '';
  let nom: string | null = null;
  if (f === 'google') {
    const u = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${t.access_token}` } });
    const c = await u.json().catch(() => ({}));
    adresse = c.email || '';
    nom = c.name || null;
  } else {
    const u = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName', { headers: { Authorization: `Bearer ${t.access_token}` } });
    const c = await u.json().catch(() => ({}));
    adresse = c.mail || c.userPrincipalName || '';
    nom = c.displayName || null;
  }
  if (!adresse) return { erreur: 'Impossible de lire l\'adresse de la boîte. Réessayez.' };

  // Une boîte Google remplacée par une AUTRE adresse : on révoque l'ancien
  // accès. Pas pour la même adresse : chez Google, révoquer l'ancien jeton
  // retirerait aussi celui qu'on vient d'obtenir (même autorisation).
  const ancienne = await lireBoite(sb, e.etablissement_id);
  if (ancienne && ancienne.fournisseur === 'google' && ancienne.adresse !== adresse.toLowerCase()) {
    try {
      await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', body: new URLSearchParams({ token: await dechiffrer(ancienne.jeton_chiffre) }) });
    } catch { /* révocation au mieux */ }
  }

  const maintenant = new Date().toISOString();
  const { error } = await sb.from('spa_boites_mail').upsert({
    etablissement_id: e.etablissement_id,
    fournisseur: f,
    adresse: adresse.toLowerCase(),
    nom,
    jeton_chiffre: await chiffrer(t.refresh_token),
    acces_chiffre: await chiffrer(t.access_token),
    acces_expire_at: new Date(Date.now() + Number(t.expires_in || 3600) * 1000).toISOString(),
    statut: 'actif',
    derniere_erreur: null,
    connecte_par: e.user_id,
    connecte_at: maintenant,
    updated_at: maintenant,
  }, { onConflict: 'etablissement_id' });
  if (error) {
    console.error('[spa-mailer] enregistrement de la boîte', error);
    return { erreur: 'La connexion n\'a pas pu être enregistrée. Réessayez.' };
  }
  return { ok: true, adresse: adresse.toLowerCase(), fournisseur: f };
}

// ── Émission d'un bon ─────────────────────────────────────────────
async function creerBon(sb: Admin, etab: Etab, clientId: string, champs: {
  motif: 'anniversaire' | 'cadeau'; valeur: string; message?: string | null; validiteJours: number; createdBy?: string | null;
}) {
  for (let essai = 0; essai < 4; essai++) {
    const { data, error } = await sb.from('spa_bons').insert({
      etablissement_id: etab.id,
      client_id: clientId,
      code: codeBon(etab.nom),
      motif: champs.motif,
      valeur: champs.valeur,
      message: champs.message || null,
      valable_jusqu: addDaysIso(zurichToday(), champs.validiteJours),
      created_by: champs.createdBy || null,
    }).select().single();
    if (!error) return data;
    if (error.code !== '23505') throw error; // collision de code : on retire
  }
  throw new Error('Impossible de générer un code de bon unique.');
}

// ── Anniversaires d'un établissement ──────────────────────────────
async function anniversairesEtab(sb: Admin, cfg: Cfg, etabId: string, forcer = false) {
  const lu = await lireEtab(sb, etabId);
  if (!lu) return { etabId, erreur: 'établissement introuvable' };
  const { etab, params } = lu;
  if (!params.anniversaire_actif && !forcer) return { etabId, ignore: 'envoi désactivé' };
  if (!(await peutEnvoyer(sb, cfg, etabId))) return { etabId, ignore: 'aucun canal d\'envoi' };

  const aujourdhui = zurichToday();
  const annee = Number(aujourdhui.slice(0, 4));
  const { data: clients, error } = await sb.from('spa_clients')
    .select('id, prenom, nom, email, date_naissance, consentement_marketing, desinscription_token, archive')
    .eq('etablissement_id', etabId)
    .eq('consentement_marketing', true)
    .eq('archive', false)
    .not('email', 'is', null)
    .not('date_naissance', 'is', null);
  if (error) return { etabId, erreur: error.message };

  const fetes = (clients as Client[]).filter((c) => c.date_naissance && fetéAujourdhui(c.date_naissance, aujourdhui));
  let envoyes = 0; let echecs = 0; let dejaFaits = 0;

  for (const c of fetes) {
    // Réservation de la place : l'index unique partiel empêche un second
    // e-mail la même année, même si deux passages du cron se chevauchent.
    const { data: envoi, error: errClaim } = await sb.from('spa_envois').insert({
      etablissement_id: etabId, client_id: c.id, type: 'anniversaire', email: c.email, annee, statut: 'en_cours',
    }).select('id').single();
    if (errClaim) { dejaFaits++; continue; }

    try {
      const bon = await creerBon(sb, etab, c.id, {
        motif: 'anniversaire', valeur: params.bon_valeur, validiteJours: params.bon_validite_jours,
      });
      const lien = lienDesinscription(cfg.appUrl, c.desinscription_token);
      const sujet = personnaliser(params.anniversaire_sujet || SUJET_ANNIV, c);
      const corps = personnaliser(params.anniversaire_message || MESSAGE_ANNIV, c);
      const res = await expedier(sb, cfg, etab, params, {
        to: c.email!,
        subject: sujet,
        html: gabarit({ etab, params, titre: sujet, corps, bon, lienDesinscr: lien }),
        text: texteBrut(corps, bon, lien),
        headers: enTetesDesinscription(lien),
      });
      if (res.erreur) {
        // Le bon n'a pas été reçu : on le retire pour que le rattrapage en
        // émette un propre, et la place se libère (statut 'echec').
        await sb.from('spa_bons').delete().eq('id', bon.id);
        await sb.from('spa_envois').update({ statut: 'echec', erreur: res.erreur }).eq('id', envoi.id);
        echecs++;
      } else {
        await sb.from('spa_bons').update({ envoye_at: new Date().toISOString() }).eq('id', bon.id);
        await sb.from('spa_envois').update({ statut: 'envoye', provider_id: res.id || null, bon_id: bon.id }).eq('id', envoi.id);
        envoyes++;
      }
    } catch (e) {
      await sb.from('spa_envois').update({ statut: 'echec', erreur: (e instanceof Error ? e.message : String(e)).slice(0, 300) }).eq('id', envoi.id);
      echecs++;
    }
  }
  return { etabId, fetes: fetes.length, envoyes, echecs, dejaFaits };
}

// ── Réservation en ligne ──────────────────────────────────────────
const SLUG_OK = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const DATE_OK = /^\d{4}-\d{2}-\d{2}$/;
const HEURE_OK = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

type ParamsEnLigne = {
  etablissement_id: string; slug: string; horaires: Record<string, { de: string; a: string }[]>;
  praticiens_en_ligne: string[]; delai_min_heures: number; horizon_jours: number; pas_minutes: number;
  message_en_ligne: string | null;
};

const enMinutes = (hhmm: string) => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const enHeure = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const normaliser = (t: unknown) => String(t ?? '').trim().toLowerCase();

function isoJour(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7; // 1 = lundi … 7 = dimanche
}
function ecartJours(de: string, a: string) {
  const [y1, m1, d1] = de.split('-').map(Number);
  const [y2, m2, d2] = a.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
function zurichMinutes() {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  return Number(p.find((x) => x.type === 'hour')?.value || 0) * 60 + Number(p.find((x) => x.type === 'minute')?.value || 0);
}
function jourLong(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const j = JOURS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${j} ${d === 1 ? '1er' : d} ${MOIS[m - 1]}`;
}

async function lireEnLigne(sb: Admin, slug: string) {
  if (!SLUG_OK.test(slug)) return null;
  const { data: p } = await sb.from('spa_parametres')
    .select('etablissement_id, slug, horaires, praticiens_en_ligne, delai_min_heures, horizon_jours, pas_minutes, message_en_ligne, en_ligne_actif, email_reponse, nom_expediteur, signature')
    .eq('slug', slug).eq('en_ligne_actif', true).maybeSingle();
  if (!p || !(p.praticiens_en_ligne || []).length) return null;
  const lu = await lireEtab(sb, p.etablissement_id);
  if (!lu) return null;
  return { enLigne: p as unknown as ParamsEnLigne, etab: lu.etab, params: lu.params };
}

// Heures de début libres pour un soin un jour donné : dans une plage
// d'ouverture, au-delà du délai minimal, avec au moins un praticien en ligne
// libre sur toute la durée. Une réservation sans praticien occupe une place.
async function creneauxLibres(sb: Admin, p: ParamsEnLigne, dureeMin: number, date: string): Promise<string[]> {
  const aujourdhui = zurichToday();
  const ecart = ecartJours(aujourdhui, date);
  if (ecart < 0 || ecart > p.horizon_jours) return [];
  const plages = (p.horaires || {})[String(isoJour(date))] || [];
  if (!plages.length) return [];

  const { data: rdv } = await sb.from('spa_reservations')
    .select('heure_debut, duree_min, praticien, statut')
    .eq('etablissement_id', p.etablissement_id)
    .eq('date_rdv', date)
    .not('statut', 'in', '("annulee","absent")');
  const occupes = (rdv || []).map((r) => ({
    debut: enMinutes(String(r.heure_debut).slice(0, 5)), fin: enMinutes(String(r.heure_debut).slice(0, 5)) + Number(r.duree_min || 0),
    praticien: normaliser(r.praticien),
  }));
  const equipe = (p.praticiens_en_ligne || []).map(normaliser).filter(Boolean);
  const plancher = zurichMinutes() + (p.delai_min_heures || 0) * 60 - ecart * 1440;
  const pas = p.pas_minutes || 30;
  const libres: string[] = [];

  for (const plage of plages) {
    const de = enMinutes(plage.de);
    const a = enMinutes(plage.a);
    for (let t = de; t + dureeMin <= a; t += pas) {
      if (t < plancher) continue;
      const chevauche = occupes.filter((o) => o.debut < t + dureeMin && o.fin > t);
      const pris = equipe.filter((x) => chevauche.some((o) => o.praticien === x)).length;
      const sansPraticien = chevauche.filter((o) => !o.praticien).length;
      if (equipe.length - pris - sansPraticien > 0) libres.push(enHeure(t));
    }
  }
  return [...new Set(libres)].sort();
}

async function hacher(texte: string) {
  const empreinte = await crypto.subtle.digest('SHA-256', utf8(texte));
  return Array.from(new Uint8Array(empreinte), (o) => o.toString(16).padStart(2, '0')).join('');
}

// E-mail transactionnel (pas de lien de désinscription : ce n'est pas de la
// publicité, c'est la réponse à sa demande).
async function mailRdv(sb: Admin, cfg: Cfg, etab: Etab, params: Params, dest: {
  email: string; clientId?: string | null; sujet: string; corps: string;
}) {
  if (!dest.email) return { envoye: false };
  const res = await expedier(sb, cfg, etab, params, {
    to: dest.email,
    subject: dest.sujet,
    html: gabarit({ etab, params, titre: dest.sujet, corps: dest.corps }),
    text: texteBrut(dest.corps),
  });
  if (!res.canal) return { envoye: false, nonConfigure: true };
  await sb.from('spa_envois').insert({
    etablissement_id: etab.id, client_id: dest.clientId || null, type: 'rdv', email: dest.email,
    statut: res.erreur ? 'echec' : 'envoye', erreur: res.erreur || null, provider_id: res.id || null,
  });
  return { envoye: !res.erreur };
}

async function actionPublique(req: Request, sb: Admin, cfg: Cfg, action: string, body: Record<string, unknown>) {
  const lu = await lireEnLigne(sb, String(body.slug || ''));
  if (!lu) return json({ error: 'La réservation en ligne n\'est pas ouverte pour ce spa.' }, 404);
  const { enLigne, etab, params } = lu;

  if (action === 'public_infos') {
    const { data: soins } = await sb.from('spa_soins')
      .select('id, nom, categorie, duree_min, prix, description')
      .eq('etablissement_id', etab.id).eq('actif', true).eq('en_ligne', true)
      .order('categorie', { ascending: true, nullsFirst: false }).order('nom', { ascending: true });
    const jours = Object.entries(enLigne.horaires || {}).filter(([, v]) => Array.isArray(v) && v.length).map(([k]) => Number(k));
    return json({
      etablissement: { nom: etab.nom, adresse: etab.adresse || null, tel: etab.tel || null },
      message: enLigne.message_en_ligne || null,
      horizonJours: enLigne.horizon_jours,
      joursOuverts: jours,
      aujourdhui: zurichToday(),
      soins: (soins || []).map((s) => ({
        id: s.id, nom: s.nom, categorie: s.categorie || null, dureeMin: s.duree_min,
        prix: s.prix === null ? null : Number(s.prix), description: s.description || null,
      })),
    });
  }

  if (action === 'public_creneaux') {
    const date = String(body.date || '');
    if (!DATE_OK.test(date)) return json({ error: 'Date invalide.' }, 400);
    const { data: soin } = await sb.from('spa_soins').select('duree_min')
      .eq('id', String(body.soinId || '')).eq('etablissement_id', etab.id).eq('actif', true).eq('en_ligne', true).maybeSingle();
    if (!soin) return json({ error: 'Soin introuvable.' }, 404);
    return json({ date, creneaux: await creneauxLibres(sb, enLigne, Number(soin.duree_min), date) });
  }

  // ── public_reserver ──
  const prenom = String(body.prenom || '').trim().slice(0, 80);
  const nom = String(body.nom || '').trim().slice(0, 80);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 160);
  const telephone = String(body.telephone || '').trim().slice(0, 40);
  const message = String(body.message || '').trim().slice(0, 1000);
  const date = String(body.date || '');
  const heure = String(body.heure || '');
  const naissance = String(body.dateNaissance || '');
  const consentement = body.consentement === true;

  // Robots : champ piège rempli ou formulaire envoyé en moins de 3 secondes.
  // La durée est mesurée par la page elle-même (performance.now), pas par
  // comparaison d'horloges : un téléphone mal réglé ne perd pas sa demande.
  // On répond « reçu » sans rien enregistrer, pour ne pas renseigner le robot.
  const dureeSaisie = Number(body.dureeSaisie || 0);
  if (String(body.siteWeb || '') || !(dureeSaisie >= 3000)) {
    return json({ ok: true });
  }
  if (!prenom || !nom) return json({ error: 'Indiquez votre prénom et votre nom.' }, 400);
  if (!EMAIL_OK.test(email)) return json({ error: 'Votre adresse e-mail semble incorrecte.' }, 400);
  if (telephone.replace(/\D/g, '').length < 6) return json({ error: 'Indiquez un numéro de téléphone.' }, 400);
  if (!DATE_OK.test(date) || !HEURE_OK.test(heure)) return json({ error: 'Choisissez un jour et une heure.' }, 400);
  if (naissance && !DATE_OK.test(naissance)) return json({ error: 'Date de naissance invalide.' }, 400);

  // Le créneau doit encore être proposé (délai minimal, horaires, horizon).
  const { data: soin } = await sb.from('spa_soins').select('id, nom, duree_min')
    .eq('id', String(body.soinId || '')).eq('etablissement_id', etab.id).eq('actif', true).eq('en_ligne', true).maybeSingle();
  if (!soin) return json({ error: 'Ce soin n\'est plus proposé en ligne.' }, 404);
  const libres = await creneauxLibres(sb, enLigne, Number(soin.duree_min), date);
  if (!libres.includes(heure)) return json({ error: 'Ce créneau vient d\'être pris. Choisissez-en un autre.', code: 'creneau_pris' }, 409);

  // Limites par adresse IP (hachée) et par e-mail.
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'inconnue';
  const ipHash = await hacher(`${ip}:${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.slice(-16) || 'spa'}`);
  const uneHeure = new Date(Date.now() - 3600 * 1000).toISOString();
  const unJour = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ count: parIp }, { count: parEmail }] = await Promise.all([
    sb.from('spa_demandes_en_ligne').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', uneHeure),
    sb.from('spa_demandes_en_ligne').select('id', { count: 'exact', head: true }).eq('email', email).gte('created_at', unJour),
  ]);
  if ((parIp || 0) >= 5 || (parEmail || 0) >= 3) {
    return json({ error: 'Trop de demandes en peu de temps. Merci d\'appeler directement le spa.' }, 429);
  }
  await sb.from('spa_demandes_en_ligne').insert({ etablissement_id: etab.id, ip_hash: ipHash, email });

  const { data: r, error } = await sb.rpc('spa_reserver_en_ligne', {
    p_etab: etab.id, p_soin: soin.id, p_date: date, p_heure: heure,
    p_prenom: prenom, p_nom: nom, p_email: email, p_telephone: telephone,
    p_date_naissance: naissance || null, p_consentement: consentement, p_message: message || null,
  });
  if (error) {
    console.error('[spa-mailer] spa_reserver_en_ligne', error);
    return json({ error: 'La demande n\'a pas pu être enregistrée. Réessayez ou appelez le spa.' }, 500);
  }
  if (r?.erreur) {
    const messages: Record<string, string> = {
      creneau_pris: 'Ce créneau vient d\'être pris. Choisissez-en un autre.',
      horaire: 'Ce créneau est en dehors des heures d\'ouverture.',
      soin: 'Ce soin n\'est plus proposé en ligne.',
      ferme: 'La réservation en ligne n\'est pas ouverte pour ce spa.',
    };
    return json({ error: messages[r.erreur] || 'Créneau indisponible.', code: r.erreur }, 409);
  }

  const quand = `${jourLong(date)} à ${heure}`;
  await mailRdv(sb, cfg, etab, params, {
    email, clientId: r.client_id,
    sujet: `Votre demande de rendez-vous du ${jourLong(date)}`,
    corps: `Bonjour ${prenom},\n\nNous avons bien reçu votre demande pour « ${soin.nom} » le ${quand}.\n\nNous vous confirmons le rendez-vous très vite par e-mail. Pour toute question, répondez simplement à ce message.\n\nÀ bientôt.`,
  });
  // L'alerte au spa part de sa propre boîte vers sa propre adresse (ou de
  // Resend vers l'adresse de réponse) : elle arrive dans la boîte de réception.
  const boite = await lireBoite(sb, etab.id);
  const alerte = params.email_reponse || etab.email || boite?.adresse;
  if (alerte) {
    await mailRdv(sb, cfg, etab, { ...params, signature: 'Réservation en ligne' }, {
      email: alerte,
      sujet: `Nouvelle demande en ligne : ${soin.nom}, ${jourLong(date)} à ${heure}`,
      corps: `${prenom} ${nom} demande « ${soin.nom} » le ${quand}.\n\nTéléphone : ${telephone}\nE-mail : ${email}${message ? `\n\nMessage : ${message}` : ''}\n\nLa demande attend votre confirmation dans l'agenda du spa.`,
    });
  }
  return json({ ok: true, soin: soin.nom, date, heure });
}

// ── Réservation d'une table en ligne ──────────────────────────────
const SERVICES_TABLE = ['midi', 'soir', 'brunch'];

type ParamsTable = {
  etablissement_id: string; slug: string; mode: 'demande' | 'auto';
  horaires: Record<string, Record<string, { de?: string; a?: string }>>;
  capacite_service: number; capacite_creneau: number | null; max_couverts: number;
  delai_min_heures: number; horizon_jours: number; pas_minutes: number;
  jours_fermes: string[] | null; message_en_ligne: string | null;
  capacite_demi_heure: number | null; rythme: Record<string, Record<string, number>> | null;
};

// Plafond de la demi-heure d'arrivée : réglage propre au service, sinon défaut
// (null = pas de plafond). Même règle que resa_reserver_en_ligne.
const debutDemiHeure = (min: number) => Math.floor(min / 30) * 30;
function plafondDemiHeure(p: ParamsTable, service: string, min: number): number | null {
  const propre = (p.rythme || {})[service]?.[enHeure(debutDemiHeure(min))];
  if (typeof propre === 'number') return propre;
  return p.capacite_demi_heure ?? null;
}

// Les e-mails du restaurant ne reprennent pas les réglages du spa (signature,
// adresse de réponse) : un hôtel peut avoir les deux modules.
const PARAMS_TABLE: Params = { ...PARAMS_DEFAUT };

async function lireTableEnLigne(sb: Admin, slug: string) {
  if (!SLUG_OK.test(slug)) return null;
  const { data: p } = await sb.from('reservation_en_ligne_parametres')
    .select('*').eq('slug', slug).eq('en_ligne_actif', true).maybeSingle();
  if (!p) return null;
  const { data: etab } = await sb.from('etablissements')
    .select('id, nom, adresse, tel, email').eq('id', p.etablissement_id).maybeSingle();
  if (!etab) return null;
  return { p: p as ParamsTable, etab: etab as Etab };
}

function servicesDuJour(p: ParamsTable, date: string) {
  const jour = (p.horaires || {})[String(isoJour(date))] || {};
  return SERVICES_TABLE.filter((s) => HEURE_OK.test(jour[s]?.de || '') && HEURE_OK.test(jour[s]?.a || ''))
    .map((s) => ({ service: s, de: enMinutes(jour[s].de!), a: enMinutes(jour[s].a!) }))
    .filter((x) => x.de <= x.a);
}

// Heures d'arrivée encore ouvertes pour `couverts` personnes, par service :
// fenêtre d'arrivée du jour, au-delà du délai minimal, sous la capacité du
// service (réservations de l'équipe comprises) et, si elle est réglée, sous
// celle de l'heure d'arrivée.
async function creneauxTable(sb: Admin, p: ParamsTable, date: string, couverts: number) {
  const ecart = ecartJours(zurichToday(), date);
  if (ecart < 0 || ecart > p.horizon_jours) return [];
  if ((p.jours_fermes || []).includes(date)) return [];
  const services = servicesDuJour(p, date);
  if (!services.length) return [];

  const { data: resas } = await sb.from('reservations')
    .select('service, heure_arrivee, nb_couverts')
    .eq('etablissement_id', p.etablissement_id)
    .eq('date_service', date)
    .not('statut', 'in', '("annule","no_show")');
  const plancher = zurichMinutes() + (p.delai_min_heures || 0) * 60 - ecart * 1440;
  const pas = p.pas_minutes || 15;

  return services.map(({ service, de, a }) => {
    const du = (resas || []).filter((r) => r.service === service);
    const pris = du.reduce((n, r) => n + Number(r.nb_couverts || 0), 0);
    const complet = pris + couverts > p.capacite_service;
    const creneaux: string[] = [];
    if (!complet) {
      for (let t = de; t <= a; t += pas) {
        if (t < plancher) continue;
        const h = enHeure(t);
        if (p.capacite_creneau) {
          const deja = du.filter((r) => String(r.heure_arrivee).slice(0, 5) === h)
            .reduce((n, r) => n + Number(r.nb_couverts || 0), 0);
          if (deja + couverts > p.capacite_creneau) continue;
        }
        const plafond = plafondDemiHeure(p, service, t);
        if (plafond !== null) {
          const bloc = debutDemiHeure(t);
          const dansLaDemiHeure = du.filter((r) => debutDemiHeure(enMinutes(String(r.heure_arrivee).slice(0, 5))) === bloc)
            .reduce((n, r) => n + Number(r.nb_couverts || 0), 0);
          if (dansLaDemiHeure + couverts > plafond) continue;
        }
        creneaux.push(h);
      }
    }
    return { service, creneaux, complet };
  });
}

// E-mail transactionnel du restaurant (réponse à une réservation, pas de
// publicité : pas de lien de désinscription). Pas de journal spa_envois : il
// appartient au module Spa.
async function mailTable(sb: Admin, cfg: Cfg, etab: Etab, dest: { email: string; sujet: string; corps: string; signature?: string }) {
  if (!dest.email) return { envoye: false };
  const params = dest.signature ? { ...PARAMS_TABLE, signature: dest.signature } : PARAMS_TABLE;
  const res = await expedier(sb, cfg, etab, params, {
    to: dest.email,
    subject: dest.sujet,
    html: gabarit({ etab, params, titre: dest.sujet, corps: dest.corps }),
    text: texteBrut(dest.corps),
  });
  if (!res.canal) return { envoye: false, nonConfigure: true };
  if (res.erreur) console.warn('[spa-mailer] e-mail table', res.erreur);
  return { envoye: !res.erreur };
}

const personnes = (n: number) => `${n} personne${n > 1 ? 's' : ''}`;

async function actionTablePublique(req: Request, sb: Admin, cfg: Cfg, action: string, body: Record<string, unknown>) {
  const lu = await lireTableEnLigne(sb, String(body.slug || ''));
  if (!lu) return json({ error: 'La réservation en ligne n\'est pas ouverte pour ce restaurant.' }, 404);
  const { p, etab } = lu;
  const aujourdhui = zurichToday();

  if (action === 'public_table_infos') {
    const jours = Object.keys(p.horaires || {}).map(Number).filter((j) => {
      const services = (p.horaires || {})[String(j)] || {};
      return SERVICES_TABLE.some((s) => HEURE_OK.test(services[s]?.de || '') && HEURE_OK.test(services[s]?.a || ''));
    });
    return json({
      etablissement: { nom: etab.nom, adresse: etab.adresse || null, tel: etab.tel || null },
      message: p.message_en_ligne || null,
      mode: p.mode,
      maxCouverts: p.max_couverts,
      horizonJours: p.horizon_jours,
      joursOuverts: jours,
      joursFermes: (p.jours_fermes || []).filter((d) => d >= aujourdhui),
      aujourdhui,
    });
  }

  const couverts = Math.round(Number(body.couverts) || 0);
  if (couverts < 1 || couverts > p.max_couverts) {
    return json({ error: `En ligne, jusqu'à ${personnes(p.max_couverts)}. Pour un groupe, appelez-nous.`, code: 'couverts' }, 400);
  }

  if (action === 'public_table_creneaux') {
    const date = String(body.date || '');
    if (!DATE_OK.test(date)) return json({ error: 'Date invalide.' }, 400);
    return json({ date, services: await creneauxTable(sb, p, date, couverts) });
  }

  // ── public_table_reserver ──
  const prenom = String(body.prenom || '').trim().slice(0, 80);
  const nom = String(body.nom || '').trim().slice(0, 80);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 160);
  const telephone = String(body.telephone || '').trim().slice(0, 40);
  const message = String(body.message || '').trim().slice(0, 1000);
  const date = String(body.date || '');
  const heure = String(body.heure || '');
  const service = String(body.service || '');
  // Case « actualités et bons cadeaux » : décochée par défaut côté page, seul
  // un true explicite vaut accord.
  const consentement = body.consentement === true;

  // Robots : même règle que pour le spa (champ piège, moins de 3 secondes).
  const dureeSaisie = Number(body.dureeSaisie || 0);
  if (String(body.siteWeb || '') || !(dureeSaisie >= 3000)) return json({ ok: true });
  if (!prenom || !nom) return json({ error: 'Indiquez votre prénom et votre nom.' }, 400);
  if (!EMAIL_OK.test(email)) return json({ error: 'Votre adresse e-mail semble incorrecte.' }, 400);
  if (telephone.replace(/\D/g, '').length < 6) return json({ error: 'Indiquez un numéro de téléphone.' }, 400);
  if (!DATE_OK.test(date) || !HEURE_OK.test(heure) || !SERVICES_TABLE.includes(service)) {
    return json({ error: 'Choisissez un jour et une heure.' }, 400);
  }

  // L'heure doit encore être proposée (délai minimal, horizon, capacité).
  const ouverts = await creneauxTable(sb, p, date, couverts);
  if (!ouverts.find((x) => x.service === service)?.creneaux.includes(heure)) {
    return json({ error: 'Cette heure vient d\'être prise. Choisissez-en une autre.', code: 'creneau_pris' }, 409);
  }

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'inconnue';
  const ipHash = await hacher(`${ip}:${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.slice(-16) || 'spa'}`);
  const uneHeure = new Date(Date.now() - 3600 * 1000).toISOString();
  const unJour = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ count: parIp }, { count: parEmail }] = await Promise.all([
    sb.from('spa_demandes_en_ligne').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', uneHeure),
    sb.from('spa_demandes_en_ligne').select('id', { count: 'exact', head: true }).eq('email', email).gte('created_at', unJour),
  ]);
  if ((parIp || 0) >= 5 || (parEmail || 0) >= 3) {
    return json({ error: 'Trop de demandes en peu de temps. Merci d\'appeler directement le restaurant.' }, 429);
  }
  await sb.from('spa_demandes_en_ligne').insert({ etablissement_id: etab.id, ip_hash: ipHash, email });

  const { data: r, error } = await sb.rpc('resa_reserver_en_ligne', {
    p_etab: etab.id, p_date: date, p_service: service, p_heure: heure, p_couverts: couverts,
    p_nom: `${prenom} ${nom}`, p_telephone: telephone, p_email: email, p_message: message || null,
  });
  if (error) {
    console.error('[spa-mailer] resa_reserver_en_ligne', error);
    return json({ error: 'La réservation n\'a pas pu être enregistrée. Réessayez ou appelez le restaurant.' }, 500);
  }
  if (r?.erreur) {
    const messages: Record<string, string> = {
      creneau_pris: 'Cette heure vient d\'être prise. Choisissez-en une autre.',
      complet: 'Ce service est complet. Choisissez un autre moment.',
      demi_heure: 'Cette heure vient d\'être prise. Choisissez-en une autre.',
      horaire: 'Cette heure est en dehors des heures de réservation.',
      jour_ferme: 'Le restaurant est fermé ce jour-là.',
      couverts: `En ligne, jusqu'à ${personnes(p.max_couverts)}. Pour un groupe, appelez-nous.`,
      ferme: 'La réservation en ligne n\'est pas ouverte pour ce restaurant.',
    };
    return json({ error: messages[r.erreur] || 'Heure indisponible.', code: r.erreur }, 409);
  }

  await completerFicheClient(sb, String(r.reservation_id || ''), prenom, nom, consentement);

  const confirmee = r.statut === 'confirme';
  const quand = `${jourLong(date)} à ${heure}`;
  await mailTable(sb, cfg, etab, confirmee
    ? {
      email,
      sujet: `Votre table du ${jourLong(date)} est réservée`,
      corps: `Bonjour ${prenom},\n\nC'est noté : une table pour ${personnes(couverts)} le ${quand}.\n\nEn cas d'empêchement ou de retard, prévenez-nous en répondant à ce message${etab.tel ? ` ou au ${etab.tel}` : ''}.\n\nÀ très bientôt.`,
    }
    : {
      email,
      sujet: `Votre demande de réservation du ${jourLong(date)}`,
      corps: `Bonjour ${prenom},\n\nNous avons bien reçu votre demande : une table pour ${personnes(couverts)} le ${quand}.\n\nNous vous confirmons la réservation très vite. Pour toute question, répondez simplement à ce message.\n\nÀ bientôt.`,
    });
  if (etab.email) {
    await mailTable(sb, cfg, etab, {
      email: etab.email,
      signature: 'Réservation en ligne',
      sujet: `${confirmee ? 'Nouvelle réservation' : 'Nouvelle demande'} en ligne : ${personnes(couverts)}, ${quand}`,
      corps: `${prenom} ${nom} ${confirmee ? 'a réservé' : 'demande'} une table pour ${personnes(couverts)} le ${quand}.\n\nTéléphone : ${telephone}\nE-mail : ${email}${message ? `\n\nMessage : ${message}` : ''}\n\n${confirmee ? 'La réservation est déjà confirmée dans le module Réservations.' : 'La demande attend votre confirmation dans le module Réservations.'}`,
    });
  }
  return json({ ok: true, statut: r.statut, date, heure, couverts });
}

// ── Fiche client d'une réservation en ligne ───────────────────────
// La base a déjà rattaché la réservation à sa fiche (déclencheur
// resa_rattacher_client, par e-mail puis téléphone). On y range le prénom et
// le nom tels que saisis si la fiche vient d'être créée, et l'accord pour les
// actualités s'il a été donné. Jamais de retrait ici : une case laissée vide
// n'est pas une désinscription. Un échec ne coûte jamais la réservation.
async function completerFicheClient(sb: Admin, reservationId: string, prenom: string, nom: string, consentement: boolean) {
  if (!reservationId) return;
  try {
    const { data: resa } = await sb.from('reservations').select('client_id').eq('id', reservationId).maybeSingle();
    if (!resa?.client_id) return;
    const { data: fiche } = await sb.from('resa_clients')
      .select('id, prenom, consentement_marketing').eq('id', resa.client_id).maybeSingle();
    if (!fiche) return;
    const maintenant = new Date().toISOString();
    const patch: Record<string, unknown> = {};
    if (!fiche.prenom) { patch.prenom = prenom; patch.nom = nom; }
    if (consentement && !fiche.consentement_marketing) {
      Object.assign(patch, {
        consentement_marketing: true, consentement_at: maintenant,
        consentement_source: 'en_ligne', desinscrit_at: null,
      });
    }
    if (Object.keys(patch).length) {
      await sb.from('resa_clients').update({ ...patch, updated_at: maintenant }).eq('id', fiche.id);
    }
  } catch (e) {
    console.error('[spa-mailer] fiche client de la réservation', reservationId, e);
  }
}

// ── Handler ───────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* corps vide */ }
  const action = String(body.action || '');
  const etabId = String(body.etablissementId || '');
  const sb = admin();
  const cfg = config();

  // ── Désinscription : publique, par jeton ──
  if (action === 'desinscription') {
    const token = String(body.token || '');
    if (!/^[0-9a-f-]{36}$/i.test(token)) return json({ error: 'Lien invalide.' }, 400);
    let { data } = await sb.from('spa_clients')
      .update({ consentement_marketing: false })
      .eq('desinscription_token', token)
      .select('etablissement_id')
      .maybeSingle();
    // Même lien pour les clients des restaurants (fichier resa_clients).
    if (!data) {
      ({ data } = await sb.from('resa_clients')
        .update({ consentement_marketing: false, desinscrit_at: new Date().toISOString() })
        .eq('desinscription_token', token)
        .select('etablissement_id')
        .maybeSingle());
    }
    if (!data) return json({ error: 'Lien invalide ou déjà utilisé.' }, 404);
    const { data: etab } = await sb.from('etablissements').select('nom').eq('id', data.etablissement_id).maybeSingle();
    return json({ ok: true, etablissement: etab?.nom || null });
  }

  // ── Retour de connexion OAuth : public, par state à usage unique ──
  if (action === 'boite_fin') {
    const r = await finConnexion(sb, cfg, String(body.etat || ''), String(body.code || ''), String(body.erreur || ''));
    return json(r, r.erreur ? 400 : 200);
  }

  // ── Réservation d'une table en ligne : publique, par adresse (slug) ──
  if (action.startsWith('public_table_')) {
    if (!['public_table_infos', 'public_table_creneaux', 'public_table_reserver'].includes(action)) return json({ error: 'Action inconnue.' }, 400);
    return actionTablePublique(req, sb, cfg, action, body);
  }

  // ── Réservation en ligne : publique, par adresse de réservation (slug) ──
  if (action.startsWith('public_')) {
    if (!['public_infos', 'public_creneaux', 'public_reserver'].includes(action)) return json({ error: 'Action inconnue.' }, 400);
    return actionPublique(req, sb, cfg, action, body);
  }

  // ── Cron : tous les établissements dont l'envoi est actif ──
  if (action === 'anniversaires' && !etabId) {
    const secret = Deno.env.get('CRON_SECRET');
    if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const { data: actifs } = await sb.from('spa_parametres').select('etablissement_id').eq('anniversaire_actif', true);
    const resultats = [];
    for (const p of actifs || []) resultats.push(await anniversairesEtab(sb, cfg, p.etablissement_id));
    console.log('[spa-mailer] anniversaires', JSON.stringify(resultats));
    return json({ ok: true, resultats });
  }

  // ── Actions de l'équipe : session obligatoire ──
  const qui = await appelant(req, sb);
  if (!qui) return json({ error: 'Session invalide.' }, 401);

  if (action === 'etat') {
    if (!autorise(qui, etabId, ROLES_EQUIPE)) return json({ error: 'Accès refusé.' }, 403);
    const boite = await lireBoite(sb, etabId);
    return json({
      configure: cfg.resend || Boolean(boite && boite.statut === 'actif'),
      resend: cfg.resend,
      boite: boite ? {
        fournisseur: boite.fournisseur, adresse: boite.adresse, statut: boite.statut,
        derniereErreur: boite.derniere_erreur, connecteAt: boite.connecte_at,
      } : null,
      connexions: { google: connexionDispo(cfg, 'google'), microsoft: connexionDispo(cfg, 'microsoft') },
    });
  }

  if (action === 'boite_debut') {
    if (!autorise(qui, etabId, ROLES_DIRECTION)) return json({ error: 'Accès refusé.' }, 403);
    const f = String(body.fournisseur || '') as Fournisseur;
    if (f !== 'google' && f !== 'microsoft') return json({ error: 'Fournisseur inconnu.' }, 400);
    if (!connexionDispo(cfg, f)) {
      return json({ error: `La connexion ${f === 'google' ? 'Gmail' : 'Outlook'} n'est pas encore activée par Samper Consulting.` }, 503);
    }
    try {
      return json({ url: await debutConnexion(sb, cfg, etabId, f, qui.uid) });
    } catch (e) {
      console.error('[spa-mailer] début de connexion', e);
      return json({ error: 'La connexion n\'a pas pu démarrer. Réessayez.' }, 500);
    }
  }

  if (action === 'boite_deconnexion') {
    if (!autorise(qui, etabId, ROLES_DIRECTION)) return json({ error: 'Accès refusé.' }, 403);
    const boite = await lireBoite(sb, etabId);
    if (boite?.fournisseur === 'google') {
      try {
        await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', body: new URLSearchParams({ token: await dechiffrer(boite.jeton_chiffre) }) });
      } catch { /* révocation au mieux */ }
    }
    await sb.from('spa_boites_mail').delete().eq('etablissement_id', etabId);
    return json({ ok: true });
  }

  // Demande venue du site, confirmée ou refusée dans l'agenda : on prévient le
  // client. Le changement de statut est déjà fait par le front ; si aucun canal
  // d'envoi n'est branché, on le dit sans échouer.
  if (action === 'rdv_statut') {
    if (!autorise(qui, etabId, ROLES_EQUIPE)) return json({ error: 'Accès refusé.' }, 403);
    const evenement = String(body.evenement || '');
    const { data: r } = await sb.from('spa_reservations')
      .select('id, client_id, soin_libelle, date_rdv, heure_debut, statut, origine')
      .eq('id', String(body.reservationId || '')).eq('etablissement_id', etabId).maybeSingle();
    if (!r) return json({ error: 'Rendez-vous introuvable.' }, 404);
    if (r.origine !== 'en_ligne') return json({ envoye: false, raison: 'hors_ligne' });
    const attendu = evenement === 'confirmation' ? 'confirmee' : evenement === 'refus' ? 'annulee' : null;
    if (!attendu || r.statut !== attendu) return json({ envoye: false, raison: 'statut' });
    if (!(await peutEnvoyer(sb, cfg, etabId))) return json({ envoye: false, raison: 'non_configure' });
    const { data: c } = await sb.from('spa_clients').select('id, prenom, nom, email').eq('id', r.client_id).maybeSingle();
    if (!c?.email) return json({ envoye: false, raison: 'sans_email' });
    const lu = await lireEtab(sb, etabId);
    if (!lu) return json({ error: 'Établissement introuvable.' }, 404);
    const heure = String(r.heure_debut).slice(0, 5);
    const soin = r.soin_libelle || 'votre soin';
    const prenom = (c.prenom || c.nom || '').trim();
    const res = evenement === 'confirmation'
      ? await mailRdv(sb, cfg, lu.etab, lu.params, {
        email: c.email, clientId: c.id,
        sujet: `Votre rendez-vous du ${jourLong(r.date_rdv)} est confirmé`,
        corps: `Bonjour ${prenom},\n\nC'est confirmé : nous vous attendons le ${jourLong(r.date_rdv)} à ${heure} pour « ${soin} ».\n\nMerci d'arriver quelques minutes en avance. En cas d'empêchement, prévenez-nous en répondant à ce message.\n\nÀ très bientôt.`,
      })
      : await mailRdv(sb, cfg, lu.etab, lu.params, {
        email: c.email, clientId: c.id,
        sujet: `Votre demande du ${jourLong(r.date_rdv)}`,
        corps: `Bonjour ${prenom},\n\nNous sommes désolés : nous ne pouvons pas vous recevoir le ${jourLong(r.date_rdv)} à ${heure} pour « ${soin} ».\n\nRépondez à ce message ou appelez-nous pour convenir d'un autre moment.\n\nÀ bientôt.`,
      });
    return json({ envoye: res.envoye, raison: res.envoye ? null : 'echec' });
  }

  // Réservation de table venue du site, confirmée ou refusée dans le module
  // Réservations : même principe que rdv_statut.
  if (action === 'resa_statut') {
    if (!autorise(qui, etabId, ROLES_EQUIPE)) return json({ error: 'Accès refusé.' }, 403);
    const evenement = String(body.evenement || '');
    const { data: r } = await sb.from('reservations')
      .select('id, nom, email, date_service, heure_arrivee, nb_couverts, statut, origine')
      .eq('id', String(body.reservationId || '')).eq('etablissement_id', etabId).maybeSingle();
    if (!r) return json({ error: 'Réservation introuvable.' }, 404);
    if (r.origine !== 'en_ligne') return json({ envoye: false, raison: 'hors_ligne' });
    const attendu = evenement === 'confirmation' ? 'confirme' : evenement === 'refus' ? 'annule' : null;
    if (!attendu || r.statut !== attendu) return json({ envoye: false, raison: 'statut' });
    if (!r.email) return json({ envoye: false, raison: 'sans_email' });
    if (!(await peutEnvoyer(sb, cfg, etabId))) return json({ envoye: false, raison: 'non_configure' });
    const { data: etab } = await sb.from('etablissements').select('id, nom, adresse, tel, email').eq('id', etabId).maybeSingle();
    if (!etab) return json({ error: 'Établissement introuvable.' }, 404);
    const heure = String(r.heure_arrivee).slice(0, 5);
    const quand = `${jourLong(r.date_service)} à ${heure}`;
    const table = `une table pour ${personnes(Number(r.nb_couverts || 0))}`;
    const res = evenement === 'confirmation'
      ? await mailTable(sb, cfg, etab as Etab, {
        email: r.email,
        sujet: `Votre table du ${jourLong(r.date_service)} est confirmée`,
        corps: `Bonjour ${r.nom},\n\nC'est confirmé : ${table} vous attend le ${quand}.\n\nEn cas d'empêchement ou de retard, prévenez-nous en répondant à ce message.\n\nÀ très bientôt.`,
      })
      : await mailTable(sb, cfg, etab as Etab, {
        email: r.email,
        sujet: `Votre demande de réservation du ${jourLong(r.date_service)}`,
        corps: `Bonjour ${r.nom},\n\nNous sommes désolés : nous ne pouvons pas vous recevoir le ${quand} (${table}).\n\nRépondez à ce message ou appelez-nous pour convenir d'un autre moment.\n\nÀ bientôt.`,
      });
    return json({ envoye: res.envoye, raison: res.envoye ? null : 'echec' });
  }

  if (['anniversaires', 'test', 'campagne', 'bon'].includes(action) && !(await peutEnvoyer(sb, cfg, etabId))) {
    return json({ error: 'Aucune boîte mail n\'est connectée : connectez celle du spa dans l\'onglet E-mails.' }, 503);
  }

  if (action === 'anniversaires') {
    if (!autorise(qui, etabId, ROLES_DIRECTION)) return json({ error: 'Accès refusé.' }, 403);
    const r = await anniversairesEtab(sb, cfg, etabId);
    return json({ ok: true, ...r });
  }

  if (action === 'test') {
    if (!autorise(qui, etabId, ROLES_DIRECTION)) return json({ error: 'Accès refusé.' }, 403);
    if (!qui.email) return json({ error: "Ton compte n'a pas d'adresse e-mail." }, 400);
    const lu = await lireEtab(sb, etabId);
    if (!lu) return json({ error: 'Établissement introuvable.' }, 404);
    const { etab } = lu;
    const params = { ...lu.params, ...(body.params && typeof body.params === 'object' ? body.params as Partial<Params> : {}) };
    const exemple = { prenom: 'Camille', nom: 'Exemple' };
    const anniv = body.type === 'anniversaire';
    const sujet = '[Essai] ' + personnaliser(anniv ? (params.anniversaire_sujet || SUJET_ANNIV) : String(body.sujet || ''), exemple);
    const corps = personnaliser(anniv ? (params.anniversaire_message || MESSAGE_ANNIV) : String(body.message || ''), exemple);
    if (!corps.trim()) return json({ error: 'Le message est vide.' }, 400);
    const bon = anniv
      ? { code: codeBon(etab.nom).replace(/-\w+$/, '-ESSAI'), valeur: params.bon_valeur, valable_jusqu: addDaysIso(zurichToday(), params.bon_validite_jours) }
      : null;
    const lienFactice = `${cfg.appUrl}/api/spa-desinscription`;
    const res = await expedier(sb, cfg, etab, params, {
      to: qui.email,
      subject: sujet,
      html: gabarit({ etab, params, titre: sujet, corps, bon, lienDesinscr: lienFactice }),
      text: texteBrut(corps, bon, lienFactice),
    });
    await sb.from('spa_envois').insert({
      etablissement_id: etabId, type: 'test', email: qui.email,
      statut: res.erreur ? 'echec' : 'envoye', erreur: res.erreur || null, provider_id: res.id || null,
    });
    if (res.erreur) return json({ error: `Envoi refusé : ${res.erreur}` }, 502);
    return json({ ok: true, email: qui.email, canal: res.canal });
  }

  if (action === 'campagne') {
    if (!autorise(qui, etabId, ROLES_DIRECTION)) return json({ error: 'Accès refusé.' }, 403);
    const sujetBrut = String(body.sujet || '').trim();
    const messageBrut = String(body.message || '').trim();
    if (!sujetBrut || !messageBrut) return json({ error: 'Sujet et message sont obligatoires.' }, 400);
    const lu = await lireEtab(sb, etabId);
    if (!lu) return json({ error: 'Établissement introuvable.' }, 404);
    const { etab, params } = lu;

    const { data: clients, error } = await sb.from('spa_clients')
      .select('id, prenom, nom, email, date_naissance, consentement_marketing, desinscription_token, archive')
      .eq('etablissement_id', etabId)
      .eq('consentement_marketing', true)
      .eq('archive', false)
      .not('email', 'is', null);
    if (error) return json({ error: 'Lecture des clients impossible.' }, 500);
    const dest = (clients || []) as Client[];
    if (!dest.length) return json({ error: "Aucun client n'a accepté de recevoir les nouvelles." }, 400);

    const boite = await lireBoite(sb, etabId);
    const parBoite = Boolean(boite && boite.statut === 'actif');
    if (parBoite && dest.length > PLAFOND_BOITE && !cfg.resend) {
      return json({ error: `Une boîte Gmail ou Outlook limite les envois : ${PLAFOND_BOITE} destinataires au plus par actualité.` }, 400);
    }

    const { data: campagne, error: errC } = await sb.from('spa_campagnes').insert({
      etablissement_id: etabId, sujet: sujetBrut, message: messageBrut,
      nb_destinataires: dest.length, envoye_par: qui.uid,
    }).select('id').single();
    if (errC) return json({ error: 'Enregistrement de la campagne impossible.' }, 500);

    const preparer = (c: Client) => {
      const lien = lienDesinscription(cfg.appUrl, c.desinscription_token);
      const sujet = personnaliser(sujetBrut, c);
      const corps = personnaliser(messageBrut, c);
      return {
        to: c.email!,
        subject: sujet,
        html: gabarit({ etab, params, titre: sujet, corps, lienDesinscr: lien }),
        text: texteBrut(corps, null, lien),
        headers: enTetesDesinscription(lien),
      };
    };

    let envoyes = 0; let echecs = 0;
    const journaliser = async (lignes: Record<string, unknown>[]) => {
      if (lignes.length) await sb.from('spa_envois').insert(lignes);
      envoyes += lignes.filter((l) => l.statut === 'envoye').length;
      echecs += lignes.filter((l) => l.statut === 'echec').length;
    };

    if (parBoite && dest.length <= PLAFOND_BOITE) {
      // Depuis la boîte du spa : un e-mail à la fois, trois en parallèle.
      for (let i = 0; i < dest.length; i += 3) {
        const lot = dest.slice(i, i + 3);
        const res = await Promise.all(lot.map((c) => expedier(sb, cfg, etab, params, preparer(c), boite)));
        await journaliser(lot.map((c, k) => ({
          etablissement_id: etabId, client_id: c.id, type: 'news', campagne_id: campagne.id, email: c.email,
          statut: res[k].erreur ? 'echec' : 'envoye', erreur: res[k].erreur || null, provider_id: res[k].id || null,
        })));
      }
    } else {
      // Par Resend, en lots de 100.
      for (let i = 0; i < dest.length; i += LOT_MAX) {
        const lot = dest.slice(i, i + LOT_MAX);
        const mails = lot.map((c) => {
          const p = preparer(c);
          return {
            from: expediteur(etab, params, cfg.from), to: p.to,
            reply_to: params.email_reponse || etab.email || undefined,
            subject: p.subject, html: p.html, text: p.text, headers: p.headers,
          } as Mail;
        });
        const res = await envoyerLot(cfg.cle, mails);
        await journaliser(lot.map((c, k) => ({
          etablissement_id: etabId, client_id: c.id, type: 'news', campagne_id: campagne.id, email: c.email,
          statut: res[k].erreur ? 'echec' : 'envoye', erreur: res[k].erreur || null, provider_id: res[k].id || null,
        })));
      }
    }
    await sb.from('spa_campagnes').update({ nb_envoyes: envoyes, nb_echecs: echecs }).eq('id', campagne.id);
    return json({ ok: true, destinataires: dest.length, envoyes, echecs });
  }

  if (action === 'bon') {
    if (!autorise(qui, etabId, ['consultant', 'patron', 'hote'])) return json({ error: 'Accès refusé.' }, 403);
    const clientId = String(body.clientId || '');
    const valeur = String(body.valeur || '').trim();
    const validiteJours = Math.max(1, Math.min(730, Math.round(Number(body.validiteJours) || 60)));
    if (!valeur) return json({ error: 'Indique ce que le bon offre.' }, 400);
    const lu = await lireEtab(sb, etabId);
    if (!lu) return json({ error: 'Établissement introuvable.' }, 404);
    const { etab, params } = lu;
    const { data: c } = await sb.from('spa_clients')
      .select('id, prenom, nom, email, date_naissance, consentement_marketing, desinscription_token, archive')
      .eq('id', clientId).eq('etablissement_id', etabId).maybeSingle();
    if (!c) return json({ error: 'Client introuvable.' }, 404);
    if (!c.email) return json({ error: "Ce client n'a pas d'adresse e-mail." }, 400);

    const bon = await creerBon(sb, etab, c.id, {
      motif: 'cadeau', valeur, message: String(body.message || '').trim() || null, validiteJours, createdBy: qui.uid,
    });
    const sujet = personnaliser(String(body.sujet || '').trim() || 'Un bon cadeau pour vous, {prenom}', c);
    const corps = personnaliser(String(body.corps || '').trim()
      || 'Bonjour {prenom},\n\nNous avons le plaisir de vous offrir le bon ci-dessous. Présentez-le, ou donnez-nous son code, lors de votre prochaine réservation.\n\nÀ très bientôt.', c);
    const lien = c.consentement_marketing ? lienDesinscription(cfg.appUrl, c.desinscription_token) : null;
    const res = await expedier(sb, cfg, etab, params, {
      to: c.email,
      subject: sujet,
      html: gabarit({ etab, params, titre: sujet, corps, bon, lienDesinscr: lien }),
      text: texteBrut(corps, bon, lien),
    });
    await sb.from('spa_envois').insert({
      etablissement_id: etabId, client_id: c.id, type: 'bon', bon_id: bon.id, email: c.email,
      statut: res.erreur ? 'echec' : 'envoye', erreur: res.erreur || null, provider_id: res.id || null,
    });
    if (res.erreur) {
      await sb.from('spa_bons').delete().eq('id', bon.id);
      return json({ error: `Envoi refusé : ${res.erreur}` }, 502);
    }
    await sb.from('spa_bons').update({ envoye_at: new Date().toISOString() }).eq('id', bon.id);
    return json({ ok: true, code: bon.code });
  }

  return json({ error: 'Action inconnue.' }, 400);
});
