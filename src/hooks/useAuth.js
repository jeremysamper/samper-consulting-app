import { useEffect, useRef, useState } from 'react';
import { authService, profileService } from '../services/supabase.js';

// ─── withTimeout : course Promise vs setTimeout ───
// Retourne le fallback si la promesse n'a pas résolu avant `delay` ms.
// Utilisé pour éviter de bloquer indéfiniment sur un appel réseau lent.
function withTimeout(promise, fallback, delay = 8000) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = globalThis.setTimeout(() => resolve(fallback), delay);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) globalThis.clearTimeout(timer);
  });
}

// ─── Symbole sentinelle pour distinguer "timeout/erreur" de "vraiment null" ───
// loadProfileSafe retourne PROFILE_LOAD_FAILED si l'appel a échoué ou expiré.
// Cela permet, sur un TOKEN_REFRESHED, de PRÉSERVER l'ancien profil au lieu
// de le nullifier (bug historique : déconnexion intempestive).
const PROFILE_LOAD_FAILED = Symbol('profile-load-failed');

async function loadProfileSafe(authUser) {
  if (!authUser) return null;
  try {
    const result = await withTimeout(
      profileService.getProfile(authUser.id),
      PROFILE_LOAD_FAILED,
      15000
    );
    return result;
  } catch (err) {
    // Erreur réseau / RLS / 401 transitoire — ne pas nullifier le profil
    console.warn('[Auth] loadProfile a échoué (sera ignoré si profil déjà chargé)', err);
    return PROFILE_LOAD_FAILED;
  }
}

export function useAuth() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Ref miroir du profil courant : permet au handler onAuthChange de savoir
  // si on a déjà un profil en mémoire, sans dépendre du state (stale closure).
  const profileRef = useRef(null);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        const currentSession = await withTimeout(authService.getSession(), null);
        const currentProfile = await loadProfileSafe(currentSession?.user);

        if (!mounted) return;
        setSession(currentSession);
        setUser(currentSession?.user || null);
        // Au boot, si l'appel profil a échoué, on stocke null (pas de profil précédent à préserver)
        setProfile(currentProfile === PROFILE_LOAD_FAILED ? null : currentProfile);
      } catch (err) {
        if (mounted) setError(err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    let unsubscribe = () => {};
    try {
      unsubscribe = authService.onAuthChange(async (event, nextSession) => {
        if (!mounted) return;

        // Log temporaire pour diagnostic en prod — à retirer dans 2 semaines une fois validé.
        // Montre l'event Supabase (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED, INITIAL_SESSION, PASSWORD_RECOVERY).
        console.log('[Auth]', event, nextSession?.user?.email ?? 'no session');

        // ─── Déconnexion explicite : on vide tout ───
        if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          setSession(null);
          setUser(null);
          setProfile(null);
          return;
        }

        // ─── PASSWORD_RECOVERY : ne pas toucher au profil, laisser le flow recovery gérer ───
        if (event === 'PASSWORD_RECOVERY') {
          return;
        }

        // ─── TOKEN_REFRESHED / USER_UPDATED : mise à jour session/user uniquement ───
        // Le profil reste tel quel. On ne refait PAS d'appel DB inutile.
        // C'est la correction clé du bug de déconnexion intempestive.
        if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          setSession(nextSession);
          setUser(nextSession?.user || null);
          return;
        }

        // ─── SIGNED_IN / INITIAL_SESSION (ou event inconnu) : charger le profil ───
        const nextProfile = await loadProfileSafe(nextSession?.user);
        if (!mounted) return;

        setSession(nextSession);
        setUser(nextSession?.user || null);

        // Si l'appel profil a échoué ET qu'on avait déjà un profil → on le préserve.
        // Ne déconnecte JAMAIS l'utilisateur à cause d'un timeout/erreur transitoire.
        if (nextProfile === PROFILE_LOAD_FAILED) {
          if (!profileRef.current) {
            // Pas de profil précédent → on laisse null (l'écran d'auth s'affichera)
            // C'est le bon comportement : pas de session = pas de profil = login.
            setProfile(null);
          }
          // sinon : on garde profileRef.current via le state existant (no-op intentionnel)
          return;
        }

        setProfile(nextProfile);
      });
    } catch (err) {
      console.warn('[Auth] Ecoute auth indisponible', err);
    }

    boot();

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  async function signIn(email, password) {
    const data = await withTimeout(authService.signIn(email, password), null, 15000);

    if (!data?.user) {
      throw new Error('Connexion trop lente. Verifie ta connexion internet puis reessaie.');
    }

    const nextProfile = await withTimeout(profileService.getProfile(data.user.id), null, 15000);

    if (!nextProfile) {
      await authService.signOut();
      throw new Error('Compte créé mais profil introuvable. Contactez le consultant.');
    }

    if (nextProfile.actif === false) {
      await authService.signOut();
      throw new Error('Ce compte a été désactivé. Contactez le consultant.');
    }

    setSession(data.session);
    setUser(data.user);
    setProfile(nextProfile);
    return nextProfile;
  }

  async function signOut() {
    await authService.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  }

  return {
    session,
    user,
    profile,
    loading,
    error,
    signIn,
    signOut,
    resetPassword: authService.resetPassword
  };
}
