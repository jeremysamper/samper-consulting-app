// Appel audio dans l'app (lot C4) : règles et textes, fonctions pures,
// partagées par le moteur d'appel, le bandeau de la coque et la vue Appels.
// La base tient les garde-fous (migration 20261113_appels.sql) : l'écran ne
// fait que dire ce qu'elle refuse, avec ses messages stables (rapport C2b).
import { formatDuree } from './vocal.js';

// Sonnerie : la base pose expire_a = création + 30 s (D6). Une ligne « sonne »
// relue après son échéance (rejeu au réveil de l'appareil) ne sonne jamais ;
// la marge couvre un petit écart d'horloge de l'appareil.
export const MARGE_ECHEANCE_MS = 2000;
// Collecte ICE complète avant l'envoi de l'offre ou de la réponse (audit C5,
// section 5 : pas d'ICE progressif), plafonnée.
export const COLLECTE_MAX_MS = 3000;
// Battement pendant l'appel (appel_battement), pour la clôture de secours.
export const BATTEMENT_MS = 30000;
// Connexion jamais établie après la réponse : l'appel est clos en échec.
export const CONNEXION_MAX_MS = 20000;
// Message de fin d'appel affiché puis retiré seul.
export const FIN_AFFICHEE_MS = 5000;

const TEXTES_BASE = {
  appel_session: 'Session expirée : reconnectez-vous, puis réessayez.',
  appel_compte_inactif: 'Votre compte est désactivé : appel impossible.',
  appel_appele_invalide: 'Cette personne ne peut pas être appelée.',
  appel_appele_introuvable: 'Cette personne ne peut pas être appelée.',
  appel_poste_partage: 'Les comptes des iPad de poste ne peuvent ni appeler ni être appelés.',
  appel_offre_invalide: "L'appel n'a pas pu se préparer. Réessayez.",
  appel_reponse_invalide: "L'appel n'a pas pu se préparer. Réessayez.",
  appel_issue_invalide: "L'appel n'a pas pu se terminer proprement.",
  appel_introuvable: "Cet appel n'existe plus.",
  appel_plus_en_sonnerie: 'Appel déjà pris sur un autre appareil, ou terminé.',
};

// Code stable rendu par une fonction de la base (message de l'exception), ou
// null : PostgREST le porte dans error.message.
export function codeAppel(err) {
  const m = String(err?.message || err || '').match(/\bappel_[a-z_]+\b/);
  return m ? m[0] : null;
}

// Phrase d'un refus de la base. Aucun nom dedans : la phrase passe par la
// traduction de l'écran, un nom n'y entre jamais (K6).
export function messageAppel(err) {
  const code = codeAppel(err);
  if (code === 'appel_occupe') return "Appel impossible : la personne est déjà en ligne, ou vous l'êtes sur un autre appareil.";
  return TEXTES_BASE[code] || 'Appel impossible. Vérifiez la connexion, puis réessayez.';
}

export function estIos(nav = globalThis.navigator) {
  const ua = String(nav?.userAgent || '');
  // iPadOS se présente en Mac ; l'écran tactile le trahit.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && Number(nav?.maxTouchPoints) > 1);
}

// Micro refusé ou indisponible : une phrase par cas (audit C5, section 13).
export function messageMicro(err, ios = estIos()) {
  const nom = err?.name || '';
  const texte = String(err?.message || '');
  if (nom === 'NotAllowedError' || nom === 'SecurityError') {
    return "Micro refusé. Autorisez le micro pour cette app dans les réglages du navigateur ou de l'appareil, puis réessayez.";
  }
  if (nom === 'NotFoundError' || nom === 'OverconstrainedError') return 'Aucun micro trouvé sur cet appareil.';
  // iPhone et iPad : le micro ne revient qu'après un redémarrage de l'app
  // (« No AVAudioSessionCaptureDevice », bug WebKit 319706).
  if (ios && (nom === 'NotReadableError' || nom === 'AbortError' || /AVAudioSession/i.test(texte))) {
    return "Le micro ne répond pas. Fermez complètement l'app, puis relancez-la.";
  }
  if (nom === 'NotReadableError') return 'Le micro est déjà utilisé par une autre app. Fermez-la, puis réessayez.';
  return "Le micro n'a pas pu s'ouvrir.";
}

// Réponse d'appel-turn lue en configuration ICE. statut : code HTTP (0 pour
// une erreur réseau), corps : JSON rendu.
//   { iceServers, relais }  relais vrai quand appel-turn a rendu ses serveurs
//                           (le relais de la maison, A10) ; sinon aucun
//                           serveur : connexion directe par les seules
//                           adresses de l'appareil, aucun tiers interrogé
//   { refus }               le compte ne peut pas appeler (403), phrase prête
export function configIce(statut, corps) {
  if (statut === 200 && corps && Array.isArray(corps.iceServers) && corps.iceServers.length) {
    return { iceServers: corps.iceServers, relais: true };
  }
  if (statut === 403) {
    const poste = /poste/i.test(String(corps?.error || ''));
    return { refus: poste ? TEXTES_BASE.appel_poste_partage : TEXTES_BASE.appel_compte_inactif };
  }
  if (statut === 401) return { refus: TEXTES_BASE.appel_session };
  return { iceServers: [], relais: false };
}

const ms = (iso) => {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? t : NaN;
};

// Une ligne sonne-t-elle encore pour cet appareil, à l'instant maintenant ?
export function sonneEncore(ligne, maintenant = Date.now()) {
  if (!ligne || ligne.etat !== 'sonne') return false;
  const fin = ms(ligne.expire_a);
  return Number.isFinite(fin) && maintenant < fin + MARGE_ECHEANCE_MS;
}

// Millisecondes de sonnerie restantes (0 si échue).
export function sonnerieRestante(ligne, maintenant = Date.now()) {
  const fin = ms(ligne?.expire_a);
  if (!Number.isFinite(fin)) return 0;
  return Math.max(0, fin + MARGE_ECHEANCE_MS - maintenant);
}

// Délai avant que l'appelant clôe en « manqué » : l'échéance de la base, lue
// sur l'horloge de l'appareil, bornée (5 s au moins, 32 s au plus) contre une
// horloge d'appareil fausse ou une échéance illisible.
export const ECHEANCE_MIN_MS = 5000;
export const ECHEANCE_MAX_MS = 32000;
export function echeanceAppelant(ligne, maintenant = Date.now()) {
  const reste = ms(ligne?.expire_a) - maintenant;
  if (!Number.isFinite(reste)) return ECHEANCE_MAX_MS;
  return Math.min(ECHEANCE_MAX_MS, Math.max(ECHEANCE_MIN_MS, reste));
}

// Issues du journal ; « manqué » se dit selon le sens (lireJournal).
const ISSUES = {
  termine: 'Terminé',
  refuse: 'Refusé',
  echec: 'Échec de connexion',
  sonne: 'Sonne',
  en_cours: 'En cours',
};

// Ligne du journal vue par un compte : sens et issue, dits simplement. La
// durée est rendue à part : un texte qui mêle chiffres et mots partirait à
// la traduction une fois par valeur (observation 0104).
//   { sens: 'emis' | 'recu', autreId, issue, duree, environ, manque }
export function lireJournal(ligne, moi) {
  const emis = ligne.appelant_id === moi;
  const autreId = emis ? ligne.appele_id : ligne.appelant_id;
  const termine = ligne.etat === 'termine' && ligne.duree_s != null;
  let issue = ISSUES[ligne.etat] || '';
  if (ligne.etat === 'manque') issue = emis ? 'Sans réponse' : 'Manqué';
  return {
    sens: emis ? 'emis' : 'recu',
    autreId,
    issue,
    duree: termine ? formatDuree(ligne.duree_s) : null,
    environ: termine && Boolean(ligne.duree_approx),
    manque: !emis && ligne.etat === 'manque',
  };
}

// Paire de candidats retenue par la connexion : passe-t-elle par le relais ?
// stats : RTCStatsReport (ou toute table itérable de rapports).
export function viaRelais(stats) {
  if (!stats) return null;
  const parId = new Map();
  stats.forEach((r) => parId.set(r.id, r));
  let paire = null;
  stats.forEach((r) => {
    if (r.type === 'transport' && r.selectedCandidatePairId) paire = parId.get(r.selectedCandidatePairId) || paire;
  });
  if (!paire) stats.forEach((r) => { if (r.type === 'candidate-pair' && (r.selected || r.nominated) && r.state === 'succeeded') paire = paire || r; });
  if (!paire) return null;
  const loc = parId.get(paire.localCandidateId);
  const dist = parId.get(paire.remoteCandidateId);
  return loc?.candidateType === 'relay' || dist?.candidateType === 'relay';
}

// L'appareil sait-il appeler ? (WebRTC et micro, donc HTTPS ou localhost.)
export function peutAppeler(env = globalThis) {
  return Boolean(typeof env?.RTCPeerConnection === 'function' && env?.navigator?.mediaDevices?.getUserMedia);
}
