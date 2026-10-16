// ─────────────────────────────────────────────────────────────────────────────
// Erreurs techniques en phrases françaises.
//
// Supabase (PostgREST), le réseau et les Edge Functions renvoient des messages
// anglais bruts (« duplicate key value violates unique constraint… », « Failed
// to fetch », « JWT expired »). Posés tels quels dans un toast ou un état
// d'erreur, ils ne disent rien à la brigade. messageErreur les ramène à une
// phrase claire et garde l'erreur brute dans la console, pour le diagnostic.
//
// Un message déjà rédigé en français par l'app (sans code d'erreur, sans mot
// technique anglais) passe tel quel : « Sélectionnez au moins une carte. »
// reste lisible. Même principe que messageErreur du Spa et authErrorMessage.
//
//   messageErreur(err)                         -> phrase générique au besoin
//   messageErreur(err, 'commande')             -> préfixe du journal console
//   messageErreur(err, 'commande', 'Liste non générée.')
//                                              -> repli propre à l'écran
// ─────────────────────────────────────────────────────────────────────────────

export const MESSAGE_PAR_DEFAUT = 'Une erreur est survenue. Réessayez.';

const RESEAU = 'Connexion impossible pour le moment. Vérifiez le réseau puis réessayez.';
const SESSION = 'Votre session a expiré. Reconnectez-vous puis réessayez.';
const DROIT = "Vous n'avez pas le droit de faire cette action.";
const DOUBLON = 'Cet élément existe déjà.';
const INTROUVABLE = 'Élément introuvable. Il a peut-être été supprimé.';
const LIE = "Cet élément est relié à d'autres données : l'opération n'est pas possible.";

const PAR_CODE = {
  23505: DOUBLON,
  23503: LIE,
  42501: DROIT,
  PGRST116: INTROUVABLE,
  PGRST301: SESSION,
  PGRST303: SESSION,
};

const PAR_STATUT = { 401: SESSION, 403: DROIT, 404: INTROUVABLE, 408: RESEAU, 409: DOUBLON };

const PAR_MOTIF = [
  [/failed to fetch|failed to send a request|networkerror|network request failed|load failed|fetch failed|err_network|err_internet|timed? ?out|aborterror|the user aborted/i, RESEAU],
  [/jwt|token (is )?expired|invalid refresh token|refresh_token|auth session missing|session (expired|missing|not found)|not authenticated/i, SESSION],
  [/permission denied|row-level security|row level security|insufficient privilege|not authorized|unauthorized|forbidden/i, DROIT],
  [/duplicate key|unique constraint|already exists/i, DOUBLON],
  [/violates foreign key/i, LIE],
  [/no rows|not found|does not exist/i, INTROUVABLE],
];

// Un mot de ce genre trahit un message technique anglais.
const TECHNIQUE = /\b(error|errors|failed|failure|invalid|cannot|unable|null|undefined|column|relation|function|violates|constraint|denied|fetch|network|jwt|syntax|unexpected|status|request|response|schema|payload|exception|edge|supabase|postgres|postgrest|object|property|reading|is not|of undefined)\b/i;
// Et un de ceux-ci, un message rédigé en français.
const FRANCAIS = /[àâçéèêëîïôûùüÿœ]|\b(le|la|les|un|une|des|du|de|est|sont|pas|aucun|aucune|impossible|veuillez|vide|liste|fichier|trop|non|au|aux|sur|pour|avec)\b/i;

function texteDe(err) {
  if (typeof err === 'string') return err;
  if (!err || typeof err !== 'object') return '';
  return String(err.message || err.error_description || err.msg || err.error || '');
}

export function messageErreur(err, contexte = '', parDefaut = MESSAGE_PAR_DEFAUT) {
  console.error(contexte ? `[${contexte}]` : '[erreur]', err);
  if (!err) return parDefaut;
  const brut = texteDe(err).trim();
  const code = typeof err === 'object' ? String(err.code ?? '') : '';
  const statut = typeof err === 'object' ? Number(err.status ?? err.statusCode ?? 0) : 0;

  if (code && PAR_CODE[code]) return PAR_CODE[code];
  for (const [motif, phrase] of PAR_MOTIF) {
    if (motif.test(brut)) return phrase;
  }
  if (PAR_STATUT[statut]) return PAR_STATUT[statut];
  // Message rédigé en français par l'app, ou levé par une fonction de la base
  // (RAISE EXCEPTION, code P0001 : « pointage déjà enregistré ») : il passe tel
  // quel, c'est lui qui dit ce qui s'est passé.
  if (brut && FRANCAIS.test(brut) && !TECHNIQUE.test(brut)) return brut;
  return parDefaut;
}
