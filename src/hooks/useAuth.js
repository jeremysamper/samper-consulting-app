import { useEffect, useRef, useState } from 'react';
import { authService, profileService, readPersistedAuthUser } from '../services/supabase.js';
import { readJson, removeStorageKeys, writeJson } from '../utils/storage.js';

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

// ─── Snapshot local du profil (boot hors-ligne) ───
// Si le fetch profil échoue au DÉMARRAGE (réseau absent) alors qu'une session
// existe, on restaure le dernier profil connu de CE user au lieu d'afficher le
// login : sans profil, pas d'app shell, donc pas de pointage hors-ligne.
// Filet de sécurité derrière le cache SW des lectures de boot (sb-boot) ; le
// snapshot n'est jamais servi pour un autre user.id et il est effacé à la
// déconnexion explicite. Aucun changement de comportement online.
const PROFILE_SNAPSHOT_KEY = 'sc_profile_snapshot';

// Supabase ré-émet SIGNED_IN à chaque retour au premier plan : le profil n'est
// relu en arrière-plan qu'au plus une fois par minute.
const PROFILE_REFRESH_MIN_MS = 60000;

function readProfileSnapshot(userId) {
  const snapshot = readJson(PROFILE_SNAPSHOT_KEY, null);
  return snapshot && snapshot.id === userId ? snapshot : null;
}

function writeProfileSnapshot(profile) {
  if (profile && profile.id) writeJson(PROFILE_SNAPSHOT_KEY, profile);
}

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
    // Erreur réseau / RLS / 401 transitoire - ne pas nullifier le profil
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

  // Pose le profil en PRÉSERVANT l'identité de l'objet si le contenu n'a pas
  // changé. Supabase ré-émet SIGNED_IN à chaque retour sur l'onglet : sans
  // cette garde, chaque refocus fabrique un nouvel objet profil → tous les
  // useEffect qui dépendent de `auth.profile` repartent (re-hydratation
  // DEMO_DATA, re-résolution de l'établissement courant qui peut écraser un
  // changement d'établissement en cours…).
  const applyProfile = (next) => {
    setProfile(prev => {
      if (prev && next && JSON.stringify(prev) === JSON.stringify(next)) return prev;
      return next;
    });
  };

  // Vrai pendant signIn() : empêche le handler SIGNED_IN de recharger le profil
  // que signIn charge déjà (évite un second getProfile au login = dédup à la source).
  const signingInRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    // Chaque chargement de profil prend un numéro : une réponse arrivée après un
    // événement plus récent (déconnexion, autre chargement) est ignorée.
    let epoch = 0;
    let lastProfileLoadAt = 0;

    // ─── Session persistée mais pas encore confirmée par Supabase ───
    // Réseau absent ou lent au démarrage : auth-js ne peut pas rafraîchir le
    // JWT, mais il ne l'efface que sur une vraie fin de session. Tant que la
    // session est en localStorage, on démarre sur le dernier profil connu de ce
    // user plutôt que d'afficher le login à quelqu'un qui EST connecté (il y
    // retapait son mot de passe, et la connexion pendait à son tour). Dès que
    // le réseau revient, le refresh aboutit (relancé au besoin par
    // src/services/resumeCoordinator.js) et TOKEN_REFRESHED pose la session.
    const bootFromSnapshot = () => {
      const persistedUser = readPersistedAuthUser();
      const snapshot = persistedUser ? readProfileSnapshot(persistedUser.id) : null;
      if (!snapshot) return false;
      setUser(persistedUser);
      applyProfile(snapshot);
      return true;
    };

    // ─── Garde-fou : INITIAL_SESSION tarde (refresh du JWT sur un réseau qui ne
    // répond pas). On ne laisse pas l'écran de démarrage indéfiniment.
    const safetyTimer = globalThis.setTimeout(() => {
      if (!mounted) return;
      if (!profileRef.current) bootFromSnapshot();
      setLoading(false);
    }, 15000);

    // Charge le profil puis pose session + profil. TOUJOURS appelé en différé
    // (setTimeout 0), jamais attendu depuis le callback d'auth - voir plus bas.
    //
    // L'écran de démarrage est libéré par le chargement le plus RÉCENT, quel que
    // soit l'événement qui l'a lancé : au boot auth-js peut émettre SIGNED_IN ou
    // TOKEN_REFRESHED en plus d'INITIAL_SESSION, selon le moment où cet écouteur
    // s'inscrit et l'état du JWT stocké. Si seul le chargement
    // « initial » libérait l'écran, un événement arrivé juste après lui prendrait
    // son numéro et l'écran de démarrage ne partirait plus jamais.
    const loadAndApplyProfile = async (nextSession) => {
      const myEpoch = ++epoch;
      lastProfileLoadAt = Date.now();
      const nextProfile = await loadProfileSafe(nextSession.user);
      if (!mounted || myEpoch !== epoch) return;

      setSession(nextSession);
      setUser(nextSession.user);

      if (nextProfile === PROFILE_LOAD_FAILED) {
        // Timeout / erreur transitoire : on garde le profil en mémoire, sinon le
        // dernier profil connu de ce user. Ne JAMAIS déconnecter pour ça.
        if (!profileRef.current) applyProfile(readProfileSnapshot(nextSession.user.id));
      } else {
        applyProfile(nextProfile);
        writeProfileSnapshot(nextProfile);
      }
      globalThis.clearTimeout(safetyTimer);
      setLoading(false);
    };

    let unsubscribe = () => {};
    try {
      // ─── RÈGLE : aucun appel Supabase n'est ATTENDU dans ce callback ───
      // auth-js attend le retour de ses abonnés. Il notifie TOKEN_REFRESHED
      // AVANT de rendre la main aux getSession() qui attendent ce refresh : un
      // `await` ici retient donc toutes les requêtes parties pendant ce refresh
      // (au réveil, toutes), et un
      // refreshSession() lancé depuis TOKEN_REFRESHED s'attend lui-même
      // (interblocage reconnu par Supabase). Jusqu'en supabase-js 2.106, c'était
      // pire : les abonnés étaient appelés sous le verrou interne d'auth-js, et
      // comme SIGNED_IN est ré-émis à CHAQUE retour au premier plan, un
      // `await getProfile()` ici gelait l'app 15 s à chaque rallumage d'écran.
      // Le callback reste donc synchrone et tout chargement part en différé
      // (setTimeout 0) - le contournement documenté par Supabase.
      unsubscribe = authService.onAuthChange((event, nextSession) => {
        if (!mounted) return;

        // Log temporaire pour diagnostic en prod - à retirer dans 2 semaines une fois validé.
        console.log('[Auth]', event, nextSession?.user?.email ?? 'no session');

        // ─── INITIAL_SESSION : premier état auth déterminé - débloque le chargement ───
        //
        // Supabase JS v2 émet INITIAL_SESSION à chaque écouteur, une fois son
        // initialisation terminée : quelques ms au boot normal, jusqu'à ~30 s si
        // le refresh du JWT échoue faute de réseau. Il est précédé d'un SIGNED_IN
        // ou d'un TOKEN_REFRESHED quand cette initialisation, qui relit ou
        // rafraîchit la session restaurée, se termine après l'inscription de
        // l'écouteur. Il représente l'état initial lu en localStorage (session
        // valide, token expiré mais rafraîchi, ou absence de session).
        //
        // FIX flash login : loading ne passe à false qu'avec un profil posé, ou
        // une fois l'absence de session établie. Le Login n'est donc jamais
        // affiché avant que Supabase ait répondu de façon définitive - même si
        // le rafraîchissement JWT prend plusieurs secondes.
        if (event === 'INITIAL_SESSION') {
          if (nextSession?.user) {
            // Le safetyTimer reste armé : il couvre aussi ce chargement de profil.
            globalThis.setTimeout(() => { if (mounted) loadAndApplyProfile(nextSession); }, 0);
            return;
          }

          // Pas de session rendue. Session encore persistée = refresh impossible
          // pour l'instant : dernier profil connu. Sinon état propre → login.
          globalThis.clearTimeout(safetyTimer);
          epoch += 1;
          setSession(null);
          if (!bootFromSnapshot()) {
            setUser(null);
            setProfile(null);
          }
          setLoading(false);
          return;
        }

        // ─── Déconnexion explicite : on vide tout ───
        if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          // L'état est déterminé (personne de connecté) : le login peut s'afficher,
          // y compris si un chargement de profil en cours vient d'être périmé.
          epoch += 1;
          globalThis.clearTimeout(safetyTimer);
          setSession(null);
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        // ─── PASSWORD_RECOVERY : ne pas toucher au profil, laisser le flow recovery gérer ───
        if (event === 'PASSWORD_RECOVERY') {
          return;
        }

        // ─── TOKEN_REFRESHED / USER_UPDATED : mise à jour session/user uniquement ───
        // Le profil reste tel quel. On ne refait PAS d'appel DB inutile.
        // C'est la correction clé du bug de déconnexion intempestive.
        // Exception : aucun profil en mémoire (démarrage sans réseau ni profil
        // connu) → ce refresh réussi est le moment de le charger.
        if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          setSession(nextSession);
          setUser(nextSession?.user || null);
          if (!profileRef.current && nextSession?.user) {
            globalThis.setTimeout(() => { if (mounted) loadAndApplyProfile(nextSession); }, 0);
          }
          return;
        }

        // ─── SIGNED_IN : login, ou simple retour au premier plan ───
        // Si signIn() est en cours, c'est LUI qui charge le profil + pose la session
        // → on évite un second getProfile (dédup à la source).
        if (signingInRef.current || !nextSession?.user) return;

        // Même utilisateur déjà chargé = ré-émission au refocus. La session est
        // posée tout de suite ; le profil n'est relu (rôle, compte désactivé)
        // qu'en arrière-plan et au plus une fois par minute.
        if (profileRef.current && profileRef.current.id === nextSession.user.id) {
          setSession(nextSession);
          setUser(nextSession.user);
          if (Date.now() - lastProfileLoadAt < PROFILE_REFRESH_MIN_MS) return;
        }
        globalThis.setTimeout(() => { if (mounted) loadAndApplyProfile(nextSession); }, 0);
      });
    } catch (err) {
      console.warn('[Auth] Ecoute auth indisponible', err);
      globalThis.clearTimeout(safetyTimer);
      if (mounted) setLoading(false); // débloque si l'écoute échoue totalement
    }

    // Note : sc_session_only (sessionStorage flag) - mécanisme de session éphémère.
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
      writeProfileSnapshot(nextProfile);
      return nextProfile;
    } finally {
      // Laisse un court délai avant de relâcher le garde : l'event SIGNED_IN
      // de supabase-js peut être dispatché juste après la résolution de signIn.
      setTimeout(() => { signingInRef.current = false; }, 1500);
    }
  }

  async function signOut() {
    await authService.signOut();
    removeStorageKeys([PROFILE_SNAPSHOT_KEY]);
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
