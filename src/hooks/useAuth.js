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

  // Vrai pendant signIn() : empêche le handler SIGNED_IN de recharger le profil
  // que signIn charge déjà (évite un second getProfile au login = dédup à la source).
  const signingInRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    // ─── Garde-fou : si INITIAL_SESSION ne se déclenche jamais (défaillance client Supabase),
    // débloque l'affichage après 20 s pour éviter un spinner infini.
    const safetyTimer = globalThis.setTimeout(() => {
      if (mounted) setLoading(false);
    }, 20000);

    let unsubscribe = () => {};
    try {
      unsubscribe = authService.onAuthChange(async (event, nextSession) => {
        if (!mounted) return;

        // Log temporaire pour diagnostic en prod — à retirer dans 2 semaines une fois validé.
        console.log('[Auth]', event, nextSession?.user?.email ?? 'no session');

        // ─── INITIAL_SESSION : premier état auth déterminé — débloque le chargement ───
        //
        // Supabase JS v2 émet toujours INITIAL_SESSION en premier dès qu'un écouteur
        // est enregistré. Il représente l'état initial lu en localStorage (session valide,
        // token expiré mais rafraîchi, ou absence de session).
        //
        // FIX flash login : loading ne passe jamais à false avant cet event.
        // Le Login n'est donc jamais affiché avant que Supabase ait répondu de façon
        // définitive — même si le rafraîchissement JWT prend plusieurs secondes.
        if (event === 'INITIAL_SESSION') {
          globalThis.clearTimeout(safetyTimer);

          if (nextSession?.user) {
            const nextProfile = await loadProfileSafe(nextSession.user);
            if (!mounted) return;
            setSession(nextSession);
            setUser(nextSession.user);
            setProfile(nextProfile === PROFILE_LOAD_FAILED ? null : nextProfile);
          } else {
            // Pas de session → état propre. Login s'affichera après loading = false.
            setSession(null);
            setUser(null);
            setProfile(null);
          }

          setLoading(false);
          return;
        }

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

        // ─── SIGNED_IN (login manuel via Auth.jsx) : charger le profil ───
        // Si signIn() est en cours, c'est LUI qui charge le profil + pose la session
        // → on évite un second getProfile (dédup à la source).
        if (signingInRef.current) return;
        const nextProfile = await loadProfileSafe(nextSession?.user);
        if (!mounted) return;

        setSession(nextSession);
        setUser(nextSession?.user || null);

        // Si l'appel profil a échoué ET qu'on avait déjà un profil → on le préserve.
        // Ne déconnecte JAMAIS l'utilisateur à cause d'un timeout/erreur transitoire.
        if (nextProfile === PROFILE_LOAD_FAILED) {
          if (!profileRef.current) {
            setProfile(null);
          }
          return;
        }

        setProfile(nextProfile);
      });
    } catch (err) {
      console.warn('[Auth] Ecoute auth indisponible', err);
      globalThis.clearTimeout(safetyTimer);
      if (mounted) setLoading(false); // débloque si l'écoute échoue totalement
    }

    // Note : sc_session_only (sessionStorage flag) — mécanisme de session éphémère.
    // La vérification a lieu ici uniquement pour documenter l'intention ; le vrai
    // comportement (ne pas persister) est géré par le fait que sessionStorage est effacé
    // à la fermeture de l'onglet. Supabase conserve la session en localStorage (storageKey
    // 'samper-auth') mais l'app ne force pas la déconnexion ici (complexité PWA inutile).

    return () => {
      mounted = false;
      globalThis.clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, []);

  async function signIn(email, password) {
    signingInRef.current = true;
    try {
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
    } finally {
      // Laisse un court délai avant de relâcher le garde : l'event SIGNED_IN
      // de supabase-js peut être dispatché juste après la résolution de signIn.
      setTimeout(() => { signingInRef.current = false; }, 1500);
    }
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
