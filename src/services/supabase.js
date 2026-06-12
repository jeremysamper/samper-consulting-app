import { createClient } from '@supabase/supabase-js';
import { getBrowserWindow, readLegacyGlobal } from '../legacy/legacyApi.js';

function readLegacyConfig() {
  return readLegacyGlobal('SUPABASE_CONFIG') || {};
}

function readEnvConfig() {
  return {
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY
  };
}

// Fallback public — mêmes valeurs que components/config.js (la clé anon est
// publique par design, la sécurité repose sur la RLS). Sans lui, l'app Vite
// jette au chargement du module sur toute machine sans .env → écran blanc
// silencieux. Un .env local reste prioritaire pour pointer ailleurs.
const FALLBACK_CONFIG = {
  url: 'https://ppmtoiqgajwcdkbnrcll.supabase.co',
  anonKey: 'sb_publishable_Vp4K1VX34PBe4lID0qFS1w_JD2sc5Ov'
};

export function getSupabaseConfig() {
  const env = readEnvConfig();
  const legacy = readLegacyConfig();

  const url = env.url || legacy.url || FALLBACK_CONFIG.url;
  const anonKey = env.anonKey || legacy.anonKey || FALLBACK_CONFIG.anonKey;
  const source = env.url && env.anonKey ? 'env' : legacy.url && legacy.anonKey ? 'legacy' : 'fallback';

  return { url, anonKey, source };
}

export function getSupabaseConfigState() {
  const config = getSupabaseConfig();

  return {
    ready: config.source !== 'missing',
    source: config.source
  };
}

const config = getSupabaseConfig();

if (config.source === 'fallback') {
  console.info('[Supabase] Config fallback utilisée (pas de .env ni window.SUPABASE_CONFIG).');
}

export const supabase = createClient(config.url, config.anonKey, {
  auth: {
    persistSession: true,       // session conservée dans localStorage entre les ouvertures PWA
    autoRefreshToken: true,     // refresh silencieux du token — pas de reconnexion manuelle
    detectSessionInUrl: true,   // pour les magic links (si activés plus tard)
    storageKey: 'samper-auth',  // clé dédiée dans localStorage — évite les conflits multi-projet
  },
  realtime: {
    params: { eventsPerSecond: 10 }
  }
});

// ─────────────────────────────────────────
// Dédup in-flight + TTL court pour les lectures d'AMORÇAGE (boot)
// ─────────────────────────────────────────
// Même mécanique que le cache #4 (promesse partagée + TTL court + invalidation),
// mais placée ICI : c'est le module commun aux DEUX couches (services typés
// ci-dessous ET bridge legacySupabase). Les chemins redondants du login
// (useAuth, useCurrentEtablissement, hydrate, AppLayout) partagent ainsi UNE
// seule requête par endpoint au lieu de la refaire chacun de leur côté.
// Le fetcher DOIT throw sur erreur (pas de cache empoisonné) ; chaque appelant
// garde sa propre gestion d'erreur autour de l'appel.
const BOOT_READ_TTL = 8000;
const _bootReadCache = new Map(); // key -> { ts, promise }

export function bootDedupeRead(key, fetcher, ttl = BOOT_READ_TTL) {
  const hit = _bootReadCache.get(key);
  if (hit && (Date.now() - hit.ts) < ttl) return hit.promise;
  const promise = Promise.resolve()
    .then(fetcher)
    .catch((err) => { _bootReadCache.delete(key); throw err; });
  _bootReadCache.set(key, { ts: Date.now(), promise });
  return promise;
}

// Invalide une clé exacte, toutes les clés d'un préfixe, ou tout (sans argument).
export function invalidateBootRead(prefix) {
  if (prefix === undefined) { _bootReadCache.clear(); return; }
  for (const k of _bootReadCache.keys()) {
    if (k === prefix || k.startsWith(prefix)) _bootReadCache.delete(k);
  }
}

export const authService = {
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async resetPassword(email) {
    const browserWindow = getBrowserWindow();
    const currentPath = browserWindow?.location?.pathname || '/';
    const resetPath = currentPath.includes('vite-index.html') ? '/vite-index.html' : '/';
    const redirectTo = browserWindow ? `${browserWindow.location.origin}${resetPath}?reset=true` : undefined;
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    return data;
  },

  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  onAuthChange(callback) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => callback(event, session));
    return () => data.subscription.unsubscribe();
  }
};

function mapProfileFromDB(row) {
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    prenom: row.prenom,
    nom: row.nom,
    role: row.role,
    poste: row.poste,
    avatar: row.avatar || `${row.prenom?.[0] || ''}${row.nom?.[0] || ''}`.toUpperCase(),
    actif: row.actif,
    etablissementIds: row.etablissement_ids || row.etablissementIds || []
  };
}

function mapEtablissementFromDB(row) {
  if (!row) return null;

  return {
    id: row.id,
    nom: row.nom,
    type: row.type,
    adresse: row.adresse,
    tel: row.tel,
    email: row.email,
    couleur: row.couleur,
    actif: row.actif,
    notes: row.notes,
    ccntHeuresSemaine: row.ccnt_heures_semaine,
    logo_url: row.logo_url
  };
}

export const profileService = {
  async getProfile(userId) {
    const data = await bootDedupeRead('profile:' + userId, async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    });
    return mapProfileFromDB(data);
  },

  async listProfiles() {
    const data = await bootDedupeRead('profiles:all', async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('nom');
      if (error) throw error;
      return data || [];
    });
    return data.map(mapProfileFromDB);
  }
};

export const settingsService = {
  async getUserSetting(key) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const { data, error } = await supabase
      .from('user_settings')
      .select('value')
      .eq('user_id', session.user.id)
      .eq('key', key)
      .maybeSingle();

    if (error) throw error;
    return data?.value ?? null;
  },

  async setUserSetting(key, value) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const payload = {
      user_id: session.user.id,
      key,
      value,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('user_settings')
      .upsert(payload, { onConflict: 'user_id,key' })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};

export const etablissementService = {
  async listForUser(user) {
    // La requête brute (tous les établissements) est partagée via le cache boot ;
    // le filtre par utilisateur s'applique APRÈS (côté client), hors cache.
    const data = await bootDedupeRead('etablissements:all', async () => {
      const { data, error } = await supabase.from('etablissements').select('*').order('nom');
      if (error) throw error;
      return data || [];
    });

    const rows = data.map(mapEtablissementFromDB);
    if (!user?.etablissementIds?.length) return rows;
    return rows.filter((etab) => user.etablissementIds.includes(etab.id));
  },

  async updateLogo(etabId, logoDataUrl) {
    const { error } = await supabase
      .from('etablissements')
      .update({ logo_url: logoDataUrl })
      .eq('id', etabId);

    if (error) throw error;
  }
};

export const supabaseService = {
  client: supabase,
  auth: authService,
  profiles: profileService,
  settings: settingsService,
  etablissements: etablissementService
};
