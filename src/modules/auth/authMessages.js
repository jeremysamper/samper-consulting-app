// Messages d'erreur d'authentification en français.
//
// Supabase renvoie des messages anglais bruts ("Invalid login credentials",
// "New password should be different from the old password"…). La brigade les
// lit en plein service : un seul point de traduction pour les trois surfaces
// d'auth (connexion, récupération par mail, changement volontaire).

const PATTERNS = [
  [/invalid login credentials/i, 'Email ou mot de passe incorrect.'],
  [/email not confirmed/i, "Cette adresse n'a pas encore été confirmée. Contactez le consultant."],
  [/user not found/i, 'Aucun compte ne correspond à cette adresse.'],
  [/new password should be different/i, 'Le nouveau mot de passe doit être différent de l’ancien.'],
  [/password should be at least (\d+)/i, 'Mot de passe trop court : $1 caractères minimum.'],
  [/password is (too weak|known to be weak)/i, 'Mot de passe trop courant. Choisissez-en un moins évident.'],
  [/auth session missing|session (not found|from session id not found)|jwt expired/i,
    "Ce lien n'est plus valide. Demandez un nouveau lien depuis l'écran de connexion."],
  [/(email link is invalid or has expired)|otp_expired|access_denied/i,
    'Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.'],
  [/invalid totp code|mfa_verification_failed|challenge (has )?expired|mfa_challenge_expired/i,
    'Code incorrect ou expiré. Saisissez le code affiché en ce moment.'],
  [/mfa.*(enroll|verification).*(disabled|not enabled)|mfa_totp_(enroll|verify)_not_enabled/i,
    "La double authentification n'est pas encore ouverte sur le serveur."],
  [/aal2.*required|insufficient_aal/i,
    'Reconnectez-vous avec votre code pour modifier la double authentification.'],
  [/for security purposes|rate limit|too many requests/i,
    'Trop de tentatives. Patientez une minute avant de réessayer.'],
  [/failed to fetch|network|timeout/i, 'Connexion au serveur impossible. Vérifiez le réseau puis réessayez.'],
];

/**
 * Traduit une erreur Supabase (ou un code d'erreur d'URL) en message lisible.
 * `fallback` est renvoyé quand rien ne correspond, pour ne jamais afficher
 * une chaîne anglaise inattendue à la brigade.
 */
export function authErrorMessage(err, fallback = 'Une erreur est survenue. Réessayez.') {
  const raw = typeof err === 'string' ? err : (err?.message || err?.error_description || err?.code || '');
  if (!raw) return fallback;

  for (const [pattern, message] of PATTERNS) {
    const match = raw.match(pattern);
    if (match) return message.replace('$1', match[1] ?? '');
  }

  // Message inconnu : on le laisse passer plutôt que de masquer une info utile.
  return raw;
}

// Longueur minimale exigée côté app. Supabase accepte 6 par défaut ; on demande
// plus, c'est le seul garde-fou avant qu'un compte serve toute une brigade.
export const MIN_PASSWORD_LENGTH = 8;

/** Renvoie un message d'erreur, ou null si le couple saisi est acceptable. */
export function validateNewPassword(password, confirmation) {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }
  if (password !== confirmation) {
    return 'Les deux mots de passe ne sont pas identiques.';
  }
  return null;
}
