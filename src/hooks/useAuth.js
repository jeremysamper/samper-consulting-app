import { useEffect, useState } from 'react';
import { authService, profileService } from '../services/supabase.js';

function withTimeout(promise, fallback, delay = 8000) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = globalThis.setTimeout(() => resolve(fallback), delay);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) globalThis.clearTimeout(timer);
  });
}

export function useAuth() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadProfile(authUser) {
      if (!authUser) return null;
      return withTimeout(profileService.getProfile(authUser.id), null, 10000);
    }

    async function boot() {
      try {
        const currentSession = await withTimeout(authService.getSession(), null);
        const currentProfile = await loadProfile(currentSession?.user);

        if (!mounted) return;
        setSession(currentSession);
        setUser(currentSession?.user || null);
        setProfile(currentProfile);
      } catch (err) {
        if (mounted) setError(err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    let unsubscribe = () => {};
    try {
      unsubscribe = authService.onAuthChange(async (_event, nextSession) => {
        try {
          const nextProfile = await loadProfile(nextSession?.user);
          if (!mounted) return;
          setSession(nextSession);
          setUser(nextSession?.user || null);
          setProfile(nextProfile);
        } catch (err) {
          if (mounted) setError(err);
        }
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
