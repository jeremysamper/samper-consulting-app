import { createClient } from '@supabase/supabase-js';
import { getBrowserWindow, readLegacyGlobal } from '../legacy/legacyApi.js';

const fallbackConfig = {
  url: 'https://ppmtoiqgajwcdkbnrcll.supabase.co',
  anonKey: 'sb_publishable_Vp4K1VX34PBe4lID0qFS1w_JD2sc5Ov'
};

function readLegacyConfig() {
  return readLegacyGlobal('SUPABASE_CONFIG') || {};
}

function readEnvConfig() {
  return {
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY
  };
}

export function getSupabaseConfig() {
  const env = readEnvConfig();
  const legacy = readLegacyConfig();

  return {
    url: env.url || legacy.url || fallbackConfig.url,
    anonKey: env.anonKey || legacy.anonKey || fallbackConfig.anonKey,
    source: env.url && env.anonKey ? 'env' : legacy.url && legacy.anonKey ? 'legacy' : 'fallback'
  };
}

export function getSupabaseConfigState() {
  const config = getSupabaseConfig();

  return {
    ready: Boolean(config.url && config.anonKey),
    source: config.source
  };
}

const config = getSupabaseConfig();

export const supabase = createClient(config.url, config.anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: { eventsPerSecond: 10 }
  }
});

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
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    return mapProfileFromDB(data);
  },

  async listProfiles() {
    const { data, error } = await supabase.from('profiles').select('*').order('nom');
    if (error) throw error;
    return (data || []).map(mapProfileFromDB);
  }
};

export const settingsService = {
  async getUserSetting(key) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user) return null;

    const { data, error } = await supabase
      .from('user_settings')
      .select('value')
      .eq('user_id', userData.user.id)
      .eq('key', key)
      .maybeSingle();

    if (error) throw error;
    return data?.value ?? null;
  },

  async setUserSetting(key, value) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user) return null;

    const payload = {
      user_id: userData.user.id,
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
    const { data, error } = await supabase.from('etablissements').select('*').order('nom');
    if (error) throw error;

    const rows = (data || []).map(mapEtablissementFromDB);
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
