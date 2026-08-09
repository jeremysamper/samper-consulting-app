import { setLegacySB } from '../legacy/legacyApi.js';
import { bootDedupeRead, buildPasswordResetRedirectUrl, getSupabaseConfig, invalidateBootRead, supabase } from './supabase.js';
import { readText, writeText } from '../utils/storage.js';

// ═══════════════════════════════════════════════════════════════
// MODULE SUPABASE - Client + helpers pour auth et data
// ═══════════════════════════════════════════════════════════════
// Vite compatibility layer: keeps the legacy SB API while using the central
// Supabase client from services/supabase.js.
// ═══════════════════════════════════════════════════════════════

// Durée de vie en jours : entier strictement positif, comme les CHECK SQL
// (recettes_duree_vie_*_positive). Une saisie vide ou aberrante retombe sur le
// défaut plutôt que de faire échouer l'enregistrement de toute la recette.
function joursValides(value, defaut) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : defaut;
}

// ═══════════════════════════════════════════════════════════════
// RÉVEIL DE L'APPAREIL - re-jouer les refetch des modules montés
// ═══════════════════════════════════════════════════════════════
// Une tablette mise en veille (ou laissée de côté une heure) perd son canal
// realtime et peut voir son JWT expirer. Au réveil, plus aucun event Postgres
// n'arrive : les modules restent sur les données d'avant la veille - ou sur un
// écran vide si la lecture du réveil a échoué. Comme le shell garde les 3
// derniers modules visités montés, l'écran reste figé jusqu'au rechargement de
// l'app. C'était la cause du bug « Aucune carte » de Cartes & Recettes.
//
// On rejoue donc les refetch enregistrés par subscribeReload quand l'onglet
// redevient visible, à la restauration bfcache (iOS) et au retour du réseau.
// C'est sûr par construction : le contrat de subscribeReload est justement que
// reloadFn soit un refetch complet et idempotent.
//
// Les écouteurs sont posés UNE fois pour toute l'app (pas un jeu par
// abonnement) et le déclenchement est limité à un par 10 s : au réveil les
// trois événements arrivent souvent groupés.
const _resumeHandlers = new Set();
const RESUME_MIN_INTERVAL_MS = 10000;
let _lastResumeAt = 0;

function _fireResume() {
  // Garde-fou : hors-ligne, on ne rejoue RIEN. Les lectures du bridge rendent []
  // en cas d'échec, donc un refetch sans réseau remplacerait des données encore
  // affichées par du vide - exactement ce qu'on cherche à éviter. Le retour du
  // réseau déclenche l'event 'online', qui rejouera les refetch à ce moment-là.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const now = Date.now();
  if (now - _lastResumeAt < RESUME_MIN_INTERVAL_MS) return;
  _lastResumeAt = now;
  // Copie : un handler peut se désabonner pendant la boucle (module démonté).
  [..._resumeHandlers].forEach((fn) => {
    try { fn(); } catch (err) { console.warn('[resume reload]', err); }
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (!document.hidden) _fireResume(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) _fireResume(); });
  window.addEventListener('online', _fireResume);
}

export function installLegacySupabase() {
  const client = supabase;

  // Cache mémoire des user_settings de l'utilisateur courant (Map<key, value>).
  // null = pas hydraté. Hydraté via db.loadAllUserSettings() après login.
  // Vidé via db.clearUserSettingsCache() au logout.
  let _userSettingsCache = null;

  // ─────────────────────────────────────────
  // ÉCHEC DE LECTURE : silencieux par défaut, remontable en mode strict
  // ─────────────────────────────────────────
  // Historiquement toutes les lectures de liste renvoient [] quand la requête
  // échoue. Résultat : un 401 (JWT expiré pendant la veille d'une tablette) ou
  // une coupure réseau est indiscernable d'un établissement réellement vide, et
  // l'écran annonce « Aucune carte » alors que les données existent en base.
  // `{ strict: true }` fait remonter l'erreur : l'appelant garde sa dernière
  // liste valide, affiche un état « indisponible » et réessaie.
  // À utiliser dans tout nouvel appel ; le défaut reste [] pour ne pas casser
  // les appelants historiques qui n'ont pas de gestion d'erreur.
  function _readFailed(label, error, strict) {
    console.error(label, error);
    if (strict) throw error;
    return [];
  }

  // Relation absente : la migration qui crée la table n'est pas encore
  // appliquée. Ce n'est PAS un échec de lecture — aucun réessai ne la fera
  // apparaître, et l'appelant doit voir un référentiel vide plutôt qu'un état
  // « indisponible » permanent. Distinction indispensable dès qu'une lecture
  // passe en strict sur une table déployée après le front.
  const RELATION_ABSENTE = new Set(['42P01', 'PGRST205', 'PGRST202']);
  const _relationAbsente = (error) => RELATION_ABSENTE.has(error?.code);

  // ─────────────────────────────────────────
  // CACHE COURT + DÉDUP IN-FLIGHT pour les lectures lourdes
  // ─────────────────────────────────────────
  // Objectif : absorber les clics rapides entre modules qui chargent tous la
  // même grosse liste (produits 800+ lignes + jointures). Deux montages
  // rapprochés partagent UNE seule requête réseau + UN seul remap.
  //
  // Garde-fous :
  //   - clé par etabId : aucune fuite inter-établissement (cacheKey = name:etabId).
  //   - TTL court (3 s) : juste de quoi couvrir une rafale de navigation.
  //   - invalidation IMMÉDIATE sur écriture locale (upsert/delete) → l'utilisateur
  //     voit sa saisie tout de suite, jamais l'ancienne liste.
  //   - invalidation par event realtime via le MÊME flux que subscribeReload
  //     (cf. _invalidateForTables appelé dans schedule()) → un seul chemin de
  //     rafraîchissement, pas de divergence cache/realtime.
  const READ_CACHE_TTL = 3000;
  const _readCache = new Map(); // cacheKey -> { ts, promise }

  const _cacheKey = (name, etabId) => `${name}:${etabId || '∅'}`;

  // Lecture dédupée + mise en cache courte. fetcher() n'est appelé qu'en cas de
  // miss ou d'entrée expirée ; sinon on renvoie la promesse en vol / récente.
  function _cachedRead(name, etabId, fetcher) {
    const key = _cacheKey(name, etabId);
    const hit = _readCache.get(key);
    if (hit && (Date.now() - hit.ts) < READ_CACHE_TTL) return hit.promise;
    const promise = Promise.resolve()
      .then(fetcher)
      .then((result) => {
        // DEV uniquement : on gèle le tableau mis en cache. Comme la promesse est
        // partagée entre appelants concurrents (dédup in-flight), une mutation en
        // place (.push/.sort/.splice) corromprait la vue de TOUS les modules.
        // Object.freeze transforme cette régression silencieuse en erreur bruyante.
        if (import.meta.env?.DEV && Array.isArray(result)) Object.freeze(result);
        return result;
      })
      .catch((err) => { _readCache.delete(key); throw err; }); // erreur → pas de cache empoisonné
    _readCache.set(key, { ts: Date.now(), promise });
    return promise;
  }

  // Invalide une entrée précise (name+etabId) ou toutes les entrées d'un name.
  function _invalidateRead(name, etabId) {
    if (etabId === undefined) {
      for (const k of _readCache.keys()) if (k.startsWith(name + ':')) _readCache.delete(k);
    } else {
      _readCache.delete(_cacheKey(name, etabId));
    }
  }

  // Map table Supabase → cache(s) à invalider quand un event realtime arrive.
  // produits embarque le nom du fournisseur + les prix (produit_fournisseurs),
  // donc un changement sur l'une de ces 3 tables doit rafraîchir le cache produits.
  const _CACHE_FOR_TABLE = {
    produits: 'produits',
    produit_fournisseurs: 'produits',
    fournisseurs: 'produits',
  };
  function _invalidateForTables(tables) {
    for (const t of tables) {
      const name = _CACHE_FOR_TABLE[t];
      if (name) _invalidateRead(name); // cache produits #4 (toutes entrées du name)
      // Cache boot (cross-couche) : un event realtime sur etablissements/profiles
      // doit le rafraîchir, sinon le reload débouncé servirait une version périmée.
      if (t === 'etablissements') invalidateBootRead('etablissements:all');
      if (t === 'profiles') { invalidateBootRead('profiles:all'); invalidateBootRead('profile:'); }
    }
  }

  // ─────────────────────────────────────────
  // AUTH helpers
  // ─────────────────────────────────────────
  const auth = {
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },

    async resetPassword(email) {
      // Même URL de retour que authService.resetPassword : c'est elle qui
      // déclenche l'écran « nouveau mot de passe » (src/hooks/usePasswordRecovery.js).
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: buildPasswordResetRedirectUrl()
      });
      if (error) throw error;
    },

    async getSession() {
      const { data: { session } } = await client.auth.getSession();
      return session;
    },

    onAuthChange(callback) {
      return client.auth.onAuthStateChange((event, session) => callback(event, session));
    },
  };

  // ─────────────────────────────────────────
  // DB helpers
  // ─────────────────────────────────────────
  const db = {
    async getProfile(userId) {
      const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (error) { console.error('[getProfile]', error); return null; }
      return data;
    },

    async listProfiles() {
      // Clé 'profiles:all' partagée avec profileService.listProfiles (cross-couche).
      try {
        return await bootDedupeRead('profiles:all', async () => {
          const { data, error } = await client.from('profiles').select('*').order('nom');
          if (error) throw error;
          return data || [];
        });
      } catch (e) { console.error('[listProfiles]', e); return []; }
    },

    async createProfile(profile) {
      // profil.id = auth.users.id déjà créé via signUp
      const { data, error } = await client.from('profiles').insert(profile).select().single();
      if (error) throw error;
      invalidateBootRead('profiles:all'); invalidateBootRead('profile:');
      return data;
    },

    async updateProfile(id, updates) {
      const { data, error } = await client.from('profiles').update(updates).eq('id', id).select().single();
      if (error) throw error;
      invalidateBootRead('profiles:all'); invalidateBootRead('profile:');
      return data;
    },

    async deleteProfile(id) {
      const { error } = await client.from('profiles').delete().eq('id', id);
      if (error) throw error;
      invalidateBootRead('profiles:all'); invalidateBootRead('profile:');
    },

    async listEtablissements() {
      // Clé 'etablissements:all' partagée avec etablissementService.listForUser
      // (cross-couche) : hydrate + AppLayout + useCurrentEtablissement = 1 requête.
      try {
        return await bootDedupeRead('etablissements:all', async () => {
          const { data, error } = await client.from('etablissements').select('*').order('nom');
          if (error) throw error;
          return data || [];
        });
      } catch (e) { console.error('[listEtablissements]', e); return []; }
    },

    async upsertEtablissement(etab) {
      const { data, error } = await client.from('etablissements').upsert(etab).select().single();
      if (error) throw error;
      invalidateBootRead('etablissements:all'); // saisie visible immédiatement
      return data;
    },

    async deleteEtablissement(id) {
      const { error } = await client.from('etablissements').delete().eq('id', id);
      if (error) throw error;
      invalidateBootRead('etablissements:all');
    },

    async listPermissions() {
      const { data, error } = await client.from('permissions').select('*');
      if (error) { console.error('[listPermissions]', error); return []; }
      // Retourner sous forme { consultant: {...}, patron: {...}, ... }
      const out = {};
      (data || []).forEach(r => { out[r.role_key] = r.perms; });
      return out;
    },

    async upsertPermissions(roleKey, perms) {
      const { error } = await client.from('permissions').upsert({ role_key: roleKey, perms });
      if (error) throw error;
    },

    async getSetting(key) {
      const { data, error } = await client.from('app_settings').select('value').eq('key', key).maybeSingle();
      if (error) { console.error('[getSetting]', error); return null; }
      return data?.value || null;
    },

    async setSetting(key, value) {
      const { error } = await client.from('app_settings').upsert({ key, value });
      if (error) throw error;
    },

    // ─── USER SETTINGS (préférences par utilisateur, synchronisées multi-device) ───
    // Stockage clé/valeur scopé sur auth.uid() via RLS.
    // Valeurs en JSONB : peuvent contenir bool, string, object…
    //
    // ARCHITECTURE CACHE :
    //   - _userSettingsCache : Map en mémoire, hydratée 1× au login via loadAllUserSettings()
    //   - getUserSettingSync(key) : lecture instantanée depuis cache (utiliser de préférence)
    //   - setUserSetting(key, val) : update optimiste cache + écriture DB en arrière-plan
    //   - subscribeUserSettings() : optionnel, pour synchroniser entre devices
    //
    // Les anciennes méthodes async (getUserSetting / getUserSettings) restent dispo
    // pour la rétro-compatibilité et les cas où le cache n'est pas encore hydraté.

    async loadAllUserSettings() {
      const { data: { session } } = await client.auth.getSession();
      const user = session?.user; // session locale (0 réseau) - l'id suffit, la RLS impose user_id côté serveur
      if (!user) {
        _userSettingsCache = new Map();
        return _userSettingsCache;
      }
      const { data, error } = await client
        .from('user_settings')
        .select('key, value')
        .eq('user_id', user.id);
      if (error) {
        console.error('[loadAllUserSettings]', error);
        _userSettingsCache = new Map();
        return _userSettingsCache;
      }
      _userSettingsCache = new Map((data || []).map(r => [r.key, r.value]));
      return _userSettingsCache;
    },

    // Lecture synchrone depuis le cache. Retourne undefined si pas hydraté ou clé absente.
    // À utiliser quand on est SÛR que loadAllUserSettings() a été appelé (après login).
    getUserSettingSync(key, defaultValue = null) {
      if (!_userSettingsCache) return defaultValue;
      const v = _userSettingsCache.get(key);
      return v === undefined ? defaultValue : v;
    },

    // True si le cache est hydraté (après login). Utile pour brancher les useEffect.
    isUserSettingsCacheReady() {
      return _userSettingsCache !== null;
    },

    // Vide le cache (à appeler au logout pour ne pas leak les settings d'un user à un autre).
    clearUserSettingsCache() {
      _userSettingsCache = null;
      _readCache.clear();      // cache produits #4
      invalidateBootRead();    // cache boot (etablissements/profiles) - purge au logout
    },

    // Lecture async classique. Utilise le cache si dispo, sinon fait l'appel DB.
    async getUserSetting(key) {
      if (_userSettingsCache) {
        return _userSettingsCache.get(key) ?? null;
      }
      const { data: { session } } = await client.auth.getSession();
      const user = session?.user; // session locale (0 réseau) - l'id suffit, la RLS impose user_id côté serveur
      if (!user) return null;
      const { data, error } = await client
        .from('user_settings')
        .select('value')
        .eq('user_id', user.id)
        .eq('key', key)
        .maybeSingle();
      if (error) { console.error('[getUserSetting]', key, error); return null; }
      return data?.value ?? null;
    },

    // Écriture : met à jour le cache IMMÉDIATEMENT (UX réactif) + envoie à la DB en arrière-plan.
    // Si la DB échoue, on log mais on garde la valeur en cache (next save retentera).
    async setUserSetting(key, value) {
      // Update optimiste du cache (lecture immédiate cohérente)
      if (_userSettingsCache) {
        _userSettingsCache.set(key, value);
      }
      const { data: { session } } = await client.auth.getSession();
      const user = session?.user; // session locale (0 réseau) - l'id suffit, la RLS impose user_id côté serveur
      if (!user) throw new Error('Non authentifié');
      const { error } = await client
        .from('user_settings')
        .upsert({
          user_id: user.id,
          key,
          value, // jsonb : Supabase JS sérialise automatiquement
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,key' });
      if (error) throw error;
    },

    // Lecture multi-keys async classique (utilise le cache si dispo).
    // Retourne un objet { key1: value1, key2: value2 }
    async getUserSettings(keys) {
      if (_userSettingsCache) {
        const out = {};
        keys.forEach(k => {
          const v = _userSettingsCache.get(k);
          if (v !== undefined) out[k] = v;
        });
        return out;
      }
      const { data: { session } } = await client.auth.getSession();
      const user = session?.user; // session locale (0 réseau) - l'id suffit, la RLS impose user_id côté serveur
      if (!user) return {};
      const { data, error } = await client
        .from('user_settings')
        .select('key, value')
        .eq('user_id', user.id)
        .in('key', keys);
      if (error) { console.error('[getUserSettings]', error); return {}; }
      const out = {};
      (data || []).forEach(r => { out[r.key] = r.value; });
      return out;
    },

    // ─── LOGO ÉTABLISSEMENT ───
    // Le logo est stocké en data URL (base64) dans etablissements.logo_url.
    // Update partiel pour ne pas écraser les autres champs.
    async updateEtablissementLogo(etabId, logoDataUrl) {
      const { error } = await client
        .from('etablissements')
        .update({ logo_url: logoDataUrl })
        .eq('id', etabId);
      if (error) throw error;
      invalidateBootRead('etablissements:all');
    },

    // ─── SHIFTS (planning) ───
    // strict : cf. _readFailed - remonte l'erreur au lieu de renvoyer [].
    async listShifts(etabId, { strict = false } = {}) {
      let q = client.from('shifts').select('*').order('date').order('debut');
      if (etabId) q = q.eq('etablissement_id', etabId);
      const { data, error } = await q;
      if (error) return _readFailed('[listShifts]', error, strict);
      return data || [];
    },

    async createShift(shift) {
      const payload = {
        id: shift.id || ('s' + Date.now() + Math.floor(Math.random() * 1000)),
        etablissement_id: shift.etablissementId,
        user_id: shift.userId,
        date: shift.date,
        debut: shift.debut,
        fin: shift.fin,
        pause: shift.pause ?? 0,
        poste: shift.poste || null,
        type_shift: shift.typeShift || 'simple',
        statut: shift.statut || 'confirmé',
        pointage_debut: shift.pointageDebut || null,
        pointage_fin: shift.pointageFin || null,
        note: shift.note || null,
      };
      const { data, error } = await client.from('shifts').insert(payload).select().single();
      if (error) throw error;
      return data;
    },

    // Création en masse : une seule requête insert([...]) (saisie groupée).
    async createShifts(shifts) {
      const list = (shifts || []);
      if (list.length === 0) return [];
      const stamp = Date.now();
      const payload = list.map((shift, i) => ({
        id: shift.id || ('s' + stamp + '-' + i + '-' + Math.floor(Math.random() * 1000)),
        etablissement_id: shift.etablissementId,
        user_id: shift.userId,
        date: shift.date,
        debut: shift.debut,
        fin: shift.fin,
        pause: shift.pause ?? 0,
        poste: shift.poste || null,
        type_shift: shift.typeShift || 'simple',
        statut: shift.statut || 'confirmé',
        pointage_debut: shift.pointageDebut || null,
        pointage_fin: shift.pointageFin || null,
        note: shift.note || null,
      }));
      const { data, error } = await client.from('shifts').insert(payload).select();
      if (error) throw error;
      return data;
    },

    async updateShift(id, updates) {
      // Mapper les champs camelCase → snake_case
      const m = {};
      if ('userId' in updates) m.user_id = updates.userId;
      if ('etablissementId' in updates) m.etablissement_id = updates.etablissementId;
      if ('date' in updates) m.date = updates.date;
      if ('debut' in updates) m.debut = updates.debut;
      if ('fin' in updates) m.fin = updates.fin;
      if ('pause' in updates) m.pause = updates.pause;
      if ('poste' in updates) m.poste = updates.poste;
      if ('typeShift' in updates) m.type_shift = updates.typeShift;
      if ('statut' in updates) m.statut = updates.statut;
      if ('pointageDebut' in updates) m.pointage_debut = updates.pointageDebut;
      if ('pointageFin' in updates) m.pointage_fin = updates.pointageFin;
      if ('note' in updates) m.note = updates.note;
      const { data, error } = await client.from('shifts').update(m).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },

    async deleteShift(id) {
      const { error } = await client.from('shifts').delete().eq('id', id);
      if (error) throw error;
    },

    // Suppression en masse : une seule requête delete().in('id', [...]).
    async deleteShifts(ids) {
      const list = (ids || []).filter(Boolean);
      if (list.length === 0) return;
      const { error } = await client.from('shifts').delete().in('id', list);
      if (error) throw error;
    },

    // Pointage sécurisé via RPC (l'heure est générée côté serveur, pas manipulable par le client)
    async pointerArrivee(shiftId) {
      const { data, error } = await client.rpc('pointer_arrivee', { shift_id: shiftId });
      if (error) throw error;
      return data;
    },

    async pointerDepart(shiftId) {
      const { data, error } = await client.rpc('pointer_depart', { shift_id: shiftId });
      if (error) throw error;
      return data;
    },

    // Mapper row DB → objet JS camelCase
    mapShiftFromDB(row) {
      if (!row) return null;
      return {
        id: row.id,
        etablissementId: row.etablissement_id,
        userId: row.user_id,
        date: row.date,
        debut: row.debut ? row.debut.slice(0, 5) : '',
        fin: row.fin ? row.fin.slice(0, 5) : '',
        pause: row.pause || 0,
        poste: row.poste || '',
        typeShift: row.type_shift || 'simple',
        statut: row.statut || 'confirmé',
        pointageDebut: row.pointage_debut ? row.pointage_debut.slice(0, 5) : null,
        pointageFin: row.pointage_fin ? row.pointage_fin.slice(0, 5) : null,
        note: row.note || '',
      };
    },

    // ─── EDGE FUNCTIONS (création/suppression user) ───
    async createUserViaEdge(payload) {
      try {
        const { data, error } = await client.functions.invoke('create-user', { body: payload });
        if (error) {
          // Tenter d'extraire le vrai message d'erreur depuis le body de la réponse
          let detail = error.message || String(error);
          if (error.context && typeof error.context.text === 'function') {
            try { const txt = await error.context.text(); if (txt) detail += ' | ' + txt; } catch(e){}
          }
          throw new Error(detail);
        }
        if (data?.error) throw new Error(data.error);
        return data;
      } catch (err) {
        console.error('[createUserViaEdge]', err);
        throw err;
      }
    },

    async deleteUserViaEdge(user_id) {
      // Tenter d'abord via Edge Function
      try {
        const { data, error } = await client.functions.invoke('delete-user', { body: { user_id } });
        if (!error && !data?.error) return data;
        // Si erreur, on continue vers le fallback ci-dessous
        console.warn('[deleteUserViaEdge] Edge function failed, falling back to DB delete', error);
      } catch (err) {
        console.warn('[deleteUserViaEdge] Edge function error, falling back', err);
      }

      // FALLBACK : supprimer directement le profil dans la table (sans toucher auth.users)
      // L'utilisateur ne pourra plus se connecter dans l'app car son profil n'existe plus
      const { error: delErr } = await client.from('profiles').delete().eq('id', user_id);
      if (delErr) throw new Error('Suppression impossible : ' + delErr.message);

      return { success: true, method: 'db_fallback', message: 'Profil supprimé. Le compte Auth reste présent (à supprimer manuellement dans Supabase Dashboard > Authentication si souhaité).' };
    },

    // Modifier l'e-mail et/ou le mot de passe d'un compte auth existant.
    // Réservé au consultant (contrôlé côté Edge Function via le rôle du caller).
    // payload = { user_id, email?, password? } - champs vides = inchangés.
    async updateUserAuthViaEdge(payload) {
      try {
        const { data, error } = await client.functions.invoke('update-user', { body: payload });
        if (error) {
          let detail = error.message || String(error);
          if (error.context && typeof error.context.text === 'function') {
            try { const txt = await error.context.text(); if (txt) detail += ' | ' + txt; } catch (e) {}
          }
          throw new Error(detail);
        }
        if (data?.error) throw new Error(data.error);
        return data;
      } catch (err) {
        console.error('[updateUserAuthViaEdge]', err);
        throw err;
      }
    },

    // ─── RECETTES ───
    // strict : cf. _readFailed - remonte l'erreur au lieu de renvoyer [].
    async listRecettes(etabId, { strict = false } = {}) {
      let q = client.from('recettes').select('*').order('nom');
      if (etabId) q = q.eq('etablissement_id', etabId);
      const { data, error } = await q;
      if (error) return _readFailed('[listRecettes]', error, strict);
      return (data || []).map(this.mapRecetteFromDB);
    },

    async upsertRecette(recette) {
      const payload = {
        id: recette.id || ('rec-' + Date.now() + Math.floor(Math.random() * 1000)),
        etablissement_id: recette.etablissementId,
        nom: recette.nom,
        categorie: recette.categorie || 'Plats',
        portions: recette.portions || 4,
        prix_vente: recette.prixVente || 0,
        temps_preparation: recette.tempsPreparation || 0,
        temps_cuisson: recette.tempsCuisson || 0,
        temps_total: recette.tempsTotal || ((recette.tempsPreparation || 0) + (recette.tempsCuisson || 0)),
        statut: recette.statut || 'brouillon',
        version: recette.version || 1,
        allergenes_ids: recette.allergenesIds || [],
        notes_consultant: recette.notesConsultant || null,
        dressage: recette.dressage || null,
        conservation: recette.conservation || null,
        ingredients: recette.ingredients || [],
        etapes: recette.etapes || [],
        modifie_par: recette.modifiePar || null,
        photo_url: recette.photoUrl || null,
        // Flag congelation : true=grosse prod, false=urgent, null="a qualifier".
        // On ne l'envoie que s'il est explicitement qualifie (true/false) : evite de
        // dependre de la colonne tant que la migration n'est pas appliquee, et laisse
        // la valeur existante intacte pour un upsert qui ne touche pas a ce champ.
        ...(recette.congelable === true || recette.congelable === false ? { congelable: recette.congelable } : {}),
        // Durees de vie (DLC, etiquetage HACCP) : envoyees uniquement si
        // l'appelant les porte. mapRecetteFromDB ne les expose que si les
        // colonnes existent cote DB, donc un front deploye avant la migration
        // 20260730_recettes_durees_vie n'essaie jamais de les ecrire.
        ...(recette.dureeVieJours != null
          ? { duree_vie_jours: joursValides(recette.dureeVieJours, 3) } : {}),
        ...(recette.dureeVieDecongeleJours != null
          ? { duree_vie_decongele_jours: joursValides(recette.dureeVieDecongeleJours, 2) } : {}),
        // NULL est une valeur metier ici (= preparation non congelable) : la cle
        // doit passer meme a null, d'ou le test de presence et non de valeur.
        ...(Object.prototype.hasOwnProperty.call(recette, 'dureeVieCongeleJours')
          ? { duree_vie_congele_jours: recette.dureeVieCongeleJours == null
              ? null
              : joursValides(recette.dureeVieCongeleJours, 1) }
          : {}),
      };
      const { data, error } = await client.from('recettes').upsert(payload).select().single();
      if (error) throw error;
      return this.mapRecetteFromDB(data);
    },

    async deleteRecette(id) {
      const { error } = await client.from('recettes').delete().eq('id', id);
      if (error) throw error;
    },

    // ═══════════════════════════════════════════════════════════════
    // ÉTIQUETTES DLC PERSONNALISÉES (etiquettes_perso)
    // Étiquettes nommées propres à l'établissement, pour les préparations
    // courantes qui n'ont pas de fiche recette. Mêmes colonnes de durées que
    // `recettes` : l'onglet Étiquettes DLC les traite comme des fiches.
    // RLS : lecture + création jusqu'au cuisinier, modification et suppression
    // à partir du responsable cuisine.
    // ═══════════════════════════════════════════════════════════════
    // strict : cf. _readFailed - remonte l'erreur au lieu de renvoyer [].
    async listEtiquettesPerso(etabId, { strict = false } = {}) {
      let q = client.from('etiquettes_perso').select('*').order('nom');
      if (etabId) q = q.eq('etablissement_id', etabId);
      const { data, error } = await q;
      // Table absente = liste vide MÊME en strict : un front déployé avant
      // l'application de la migration 20260802 doit continuer d'imprimer ses
      // étiquettes de recettes et ses cases Divers, sans état « indisponible »
      // ni réessai en boucle qui ne trouveront jamais la table. Les autres
      // erreurs (401, réseau, RLS) sont, elles, de vrais échecs de lecture.
      if (error) {
        if (_relationAbsente(error)) {
          console.warn('[listEtiquettesPerso] table absente, migration non appliquée');
          return [];
        }
        return _readFailed('[listEtiquettesPerso]', error, strict);
      }
      return (data || []).map(this.mapEtiquettePersoFromDB);
    },

    async upsertEtiquettePerso(e) {
      const row = {
        nom: String(e.nom || '').trim(),
        duree_vie_jours: joursValides(e.dureeVieJours, 3),
        duree_vie_decongele_jours: joursValides(e.dureeVieDecongeleJours, 2),
        // null est une valeur métier ici (= non congelable), pas une absence.
        duree_vie_congele_jours: e.dureeVieCongeleJours == null
          ? null
          : joursValides(e.dureeVieCongeleJours, 1),
      };
      let result;
      if (e.id) {
        row.updated_at = new Date().toISOString();
        const { data, error } = await client.from('etiquettes_perso').update(row).eq('id', e.id).select().single();
        if (error) throw error;
        result = data;
      } else {
        row.etablissement_id = e.etablissementId;
        row.created_by = e.createdBy || null;
        const { data, error } = await client.from('etiquettes_perso').insert(row).select().single();
        if (error) throw error;
        result = data;
      }
      return this.mapEtiquettePersoFromDB(result);
    },

    async deleteEtiquettePerso(id) {
      const { error } = await client.from('etiquettes_perso').delete().eq('id', id);
      if (error) throw error;
    },

    mapEtiquettePersoFromDB(row) {
      if (!row) return null;
      return {
        id: row.id,
        etablissementId: row.etablissement_id,
        nom: row.nom,
        dureeVieJours: row.duree_vie_jours,
        dureeVieCongeleJours: row.duree_vie_congele_jours ?? null,
        dureeVieDecongeleJours: row.duree_vie_decongele_jours,
        // `congelable` qualifié et non laissé indéterminé : c'est ce qui fait
        // afficher « Non congelable » au lieu de « durée de surgélation non
        // renseignée » (motifNonEligible). Sur une étiquette maison, l'absence
        // de durée de surgélation EST la qualification.
        congelable: row.duree_vie_congele_jours != null,
        // Marqueur de provenance : distingue ces lignes des fiches recettes
        // dans la liste de l'onglet (bloc dédié, boutons Modifier/Supprimer).
        perso: true,
        createdBy: row.created_by || null,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
      };
    },

    // ═══════════════════════════════════════════════════════════════
    // MISE EN PLACE (mep_listes + mep_items)
    // Listes de production : grosse prod (congelable) vs urgent (non congelable).
    // ═══════════════════════════════════════════════════════════════
    async listMepListes(etabId) {
      let q = client
        .from('mep_listes')
        .select('*, mep_items(id, fait)')
        .order('date_service', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (etabId) q = q.eq('etablissement_id', etabId);
      const { data, error } = await q;
      if (error) { console.error('[listMepListes]', error); return []; }
      return (data || []).map(this.mapMepListeFromDB);
    },

    async upsertMepListe(liste) {
      const row = {
        etablissement_id: liste.etablissementId,
        nom: liste.nom,
        date_service: liste.dateService || null,
      };
      let result;
      if (liste.id) {
        const { data, error } = await client.from('mep_listes').update(row).eq('id', liste.id).select('*, mep_items(id, fait)').single();
        if (error) throw error;
        result = data;
      } else {
        row.created_by = liste.createdBy || null;
        const { data, error } = await client.from('mep_listes').insert(row).select('*, mep_items(id, fait)').single();
        if (error) throw error;
        result = data;
      }
      return this.mapMepListeFromDB(result);
    },

    async deleteMepListe(id) {
      const { error } = await client.from('mep_listes').delete().eq('id', id);
      if (error) throw error;
    },

    async listMepItems(listeId) {
      const { data, error } = await client
        .from('mep_items')
        .select('*')
        .eq('liste_id', listeId)
        .order('ordre', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) { console.error('[listMepItems]', error); return []; }
      return (data || []).map(this.mapMepItemFromDB);
    },

    async upsertMepItem(item) {
      const row = {
        liste_id: item.listeId,
        recette_id: item.recetteId || null,
        label: item.label || null,
        quantite: item.quantite != null && item.quantite !== '' ? Number(item.quantite) : null,
        unite: item.unite || null,
        congelable: item.congelable ?? null,
        ordre: item.ordre ?? 0,
      };
      let result;
      if (item.id) {
        const { data, error } = await client.from('mep_items').update(row).eq('id', item.id).select().single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await client.from('mep_items').insert(row).select().single();
        if (error) throw error;
        result = data;
      }
      return this.mapMepItemFromDB(result);
    },

    async deleteMepItem(id) {
      const { error } = await client.from('mep_items').delete().eq('id', id);
      if (error) throw error;
    },

    // Coche / decoche un item. fait_at en UTC (now()), fait_par = auteur.
    async setMepItemFait(id, fait, userId) {
      const row = fait
        ? { fait: true, fait_par: userId || null, fait_at: new Date().toISOString() }
        : { fait: false, fait_par: null, fait_at: null };
      const { data, error } = await client.from('mep_items').update(row).eq('id', id).select().single();
      if (error) throw error;
      return this.mapMepItemFromDB(data);
    },

    mapMepListeFromDB(row) {
      if (!row) return null;
      const items = row.mep_items || [];
      return {
        id: row.id,
        etablissementId: row.etablissement_id,
        nom: row.nom,
        dateService: row.date_service || null,
        createdBy: row.created_by || null,
        createdAt: row.created_at || null,
        itemsCount: items.length,
        itemsFaits: items.filter(i => i.fait).length,
      };
    },

    mapMepItemFromDB(row) {
      if (!row) return null;
      return {
        id: row.id,
        listeId: row.liste_id,
        recetteId: row.recette_id || null,
        label: row.label || null,
        quantite: row.quantite != null ? Number(row.quantite) : null,
        unite: row.unite || null,
        congelable: row.congelable ?? null,
        fait: row.fait === true,
        faitPar: row.fait_par || null,
        faitAt: row.fait_at || null,
        ordre: row.ordre || 0,
        createdAt: row.created_at || null,
      };
    },

    // ═══════════════════════════════════════════════════════════════
    // KDS (kds_orders + kds_order_items) - commandes live Lightspeed.
    // Lecture RLS : consultant, resp_cuisine, cuisinier. Ecriture via RPC.
    // ═══════════════════════════════════════════════════════════════
    async listKdsOrders(etabId) {
      let q = client
        .from('kds_orders')
        .select('*, kds_order_items(*)')
        .order('opened_at', { ascending: true, nullsFirst: false });
      if (etabId) q = q.eq('etablissement_id', etabId);
      const { data, error } = await q;
      if (error) { console.error('[listKdsOrders]', error); return []; }
      return (data || []).map(this.mapKdsOrderFromDB);
    },

    async kdsBumpItem(itemId, bumped) {
      const { error } = await client.rpc('kds_bump_item', { p_item_id: itemId, p_bumped: !!bumped });
      if (error) throw error;
    },

    async kdsSetSuite(itemId, aSuivre) {
      const { error } = await client.rpc('kds_set_suite', { p_item_id: itemId, p_a_suivre: !!aSuivre });
      if (error) throw error;
    },

    async kdsCompleteOrder(orderId, done = true) {
      const { error } = await client.rpc('kds_complete_order', { p_order_id: orderId, p_done: !!done });
      if (error) throw error;
    },

    mapKdsOrderFromDB(row) {
      if (!row) return null;
      const items = (row.kds_order_items || []).map((i) => ({
        id: i.id,
        lineKey: i.ls_line_key,
        nom: i.nom || '',
        sku: i.sku || null,
        qty: i.qty != null ? Number(i.qty) : null,
        modifiers: Array.isArray(i.modifiers) ? i.modifiers : [],
        cours: i.cours || null,
        firedAt: i.fired_at || null,
        active: i.active !== false,
        aSuivre: i.a_suivre === true,
        bumpStatus: i.bump_status || 'pending',
        bumpedAt: i.bumped_at || null,
        bumpedBy: i.bumped_by || null,
      }));
      return {
        id: row.id,
        etablissementId: row.etablissement_id,
        lsCheckUuid: row.ls_check_uuid,
        tableNo: row.table_no || null,
        couverts: row.couverts != null ? Number(row.couverts) : null,
        openedAt: row.opened_at || null,
        status: row.status || 'open',
        completedAt: row.completed_at || null,
        items,
      };
    },

    // ═══════════════════════════════════════════════════════════════
    // PLATS (M2M avec recettes via plat_recettes)
    // ═══════════════════════════════════════════════════════════════
    // strict : cf. _readFailed - remonte l'erreur au lieu de renvoyer [].
    async listPlats(etabId, { strict = false } = {}) {
      const { data, error } = await client
        .from('plats')
        .select('*, plat_recettes(id, recette_id, role, ordre), carte_plats(carte_id)')
        .eq('etablissement_id', etabId)
        .order('ordre', { ascending: true })
        .order('nom', { ascending: true });
      if (error) return _readFailed('[listPlats]', error, strict);
      return (data || []).map(this.mapPlatFromDB);
    },

    async upsertPlat(plat) {
      const row = {
        etablissement_id: plat.etablissementId,
        nom: plat.nom,
        categorie: plat.categorie || 'Plats',
        prix_vente: plat.prixVente ?? null,
        description: plat.description || '',
        notes: plat.notes || '',
        ordre: plat.ordre ?? 0,
        actif: plat.actif !== false,
        photo_url: plat.photoUrl || null,
      };
      let result;
      if (plat.id) {
        const { data, error } = await client.from('plats').update(row).eq('id', plat.id).select().single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await client.from('plats').insert(row).select().single();
        if (error) throw error;
        result = data;
      }
      return this.mapPlatFromDB(result);
    },

    async deletePlat(id) {
      const { error } = await client.from('plats').delete().eq('id', id);
      if (error) throw error;
    },

    async linkRecetteToPlat(platId, recetteId, role = 'composant', ordre = 0) {
      const { data, error } = await client
        .from('plat_recettes')
        .upsert({ plat_id: platId, recette_id: recetteId, role, ordre }, { onConflict: 'plat_id,recette_id' })
        .select().single();
      if (error) throw error;
      return data;
    },

    async unlinkRecetteFromPlat(platId, recetteId) {
      const { error } = await client.from('plat_recettes')
        .delete()
        .match({ plat_id: platId, recette_id: recetteId });
      if (error) throw error;
    },

    async listRecetteIdsForPlat(platId) {
      const { data, error } = await client.from('plat_recettes')
        .select('recette_id, role, ordre')
        .eq('plat_id', platId)
        .order('ordre', { ascending: true });
      if (error) { console.error('[listRecetteIdsForPlat]', error); return []; }
      return data || [];
    },

    // ─── Upload de photo (recette ou plat) ───
    // Bucket public dédié 'recette-photos'. Path = <etabId>/<type>-<id>-<ts>.<ext>
    // (1er segment = etab pour que la RLS storage autorise l'écriture).
    // Retourne une URL publique permanente (pas de signed URL qui expire).
    async uploadRecettePhoto({ etabId, type, id, file }) {
      if (!file) throw new Error('Aucun fichier');
      // Upload cote serveur via l'Edge Function upload-recette-photo. Le client
      // storage de supabase-js n'attache pas toujours le token user a la requete
      // storage (-> auth.uid() null -> la RLS refuse "new row violates RLS policy"),
      // meme avec une session valide. Ici la fonction valide le JWT et ecrit dans
      // le bucket avec la cle service. Canal JWT fiable (meme principe que le POS).
      const { data: { session } } = await client.auth.getSession();
      if (!session) throw new Error('Session expiree. Reconnectez-vous puis reessayez.');
      const { url: supabaseUrl, anonKey } = getSupabaseConfig();
      const form = new FormData();
      form.append('file', file);
      form.append('etabId', etabId || '');
      form.append('type', type || 'plat');
      form.append('id', String(id ?? ''));
      const res = await fetch(`${supabaseUrl}/functions/v1/upload-recette-photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: anonKey },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      return { path: data.path, url: data.url };
    },

    mapPlatFromDB(row) {
      if (!row) return null;
      return {
        id: row.id,
        etablissementId: row.etablissement_id,
        nom: row.nom,
        categorie: row.categorie || 'Plats',
        prixVente: row.prix_vente != null ? Number(row.prix_vente) : null,
        description: row.description || '',
        notes: row.notes || '',
        ordre: row.ordre || 0,
        actif: row.actif !== false,
        photoUrl: row.photo_url || null,
        recettes: (row.plat_recettes || []).map(pr => ({
          recetteId: pr.recette_id,
          role: pr.role || 'composant',
          ordre: pr.ordre || 0,
        })),
        carteIds: (row.carte_plats || []).map(cp => cp.carte_id),
      };
    },


    mapRecetteFromDB(row) {
      if (!row) return null;
      const coutMatiere = (row.ingredients || []).reduce((s, i) => s + (Number(i.quantite) || 0) * (Number(i.prixUnit || i.prix_unit) || 0), 0);
      const coutPortion = row.portions ? coutMatiere / row.portions : 0;
      const foodCost = row.prix_vente ? (coutPortion / row.prix_vente * 100) : null;
      return {
        id: row.id,
        etablissementId: row.etablissement_id,
        nom: row.nom,
        categorie: row.categorie,
        portions: row.portions,
        prixVente: Number(row.prix_vente) || 0,
        tempsPreparation: row.temps_preparation || 0,
        tempsCuisson: row.temps_cuisson || 0,
        tempsTotal: row.temps_total || 0,
        statut: row.statut,
        version: row.version,
        allergenesIds: row.allergenes_ids || [],
        notesConsultant: row.notes_consultant || '',
        dressage: row.dressage || '',
        conservation: row.conservation || '',
        ingredients: (row.ingredients || []).map(i => ({ ...i, prixUnit: i.prixUnit || i.prix_unit || 0 })),
        etapes: row.etapes || [],
        modifiePar: row.modifie_par,
        modifie: row.updated_at ? row.updated_at.slice(0, 10) : null,
        photoUrl: row.photo_url || null,
        // null volontairement preserve (= « a qualifier », traite comme non congelable).
        congelable: row.congelable ?? null,
        // Durees de vie (DLC) : cles exposees UNIQUEMENT si la colonne existe,
        // pour qu'un upsert issu d'un objet recette ne tente pas de les ecrire
        // tant que la migration n'est pas appliquee. Cote congele, null est une
        // valeur metier (non congelable) et non une colonne absente.
        ...(row.duree_vie_jours !== undefined ? { dureeVieJours: row.duree_vie_jours } : {}),
        ...(row.duree_vie_congele_jours !== undefined ? { dureeVieCongeleJours: row.duree_vie_congele_jours } : {}),
        ...(row.duree_vie_decongele_jours !== undefined ? { dureeVieDecongeleJours: row.duree_vie_decongele_jours } : {}),
        coutMatiere, coutPortion, foodCost,
        margeGrossePct: row.prix_vente ? ((row.prix_vente - coutPortion) / row.prix_vente * 100) : null,
      };
    },

    // ═══════════════════════════════════════════════════════════════
    // SOPs (Standard Operating Procedures) + checklists
    // ═══════════════════════════════════════════════════════════════
    async listSops(etabId) {
      const { data, error } = await client
        .from('sops')
        .select('*')
        .eq('etablissement_id', etabId)
        .not('is_template', 'is', true) // exclut les SOP placées en bibliothèque de templates
        .order('ordre', { ascending: true })
        .order('titre', { ascending: true });
      if (error) { console.error('[listSops]', error); return []; }
      return (data || []).map(this.mapSopFromDB);
    },

    // Bibliothèque de templates SOP : toutes les SOP marquées is_template,
    // tous établissements confondus (réutilisables pour export multi-établissements).
    async listSopTemplates() {
      const { data, error } = await client
        .from('sops')
        .select('*')
        .eq('is_template', true)
        .order('titre', { ascending: true });
      if (error) { console.error('[listSopTemplates]', error); return []; }
      return (data || []).map(this.mapSopFromDB);
    },

    async upsertSop(sop) {
      const row = {
        etablissement_id: sop.etablissementId,
        titre: sop.titre,
        description: sop.description || '',
        categorie: sop.categorie || 'Service',
        frequence: sop.frequence || 'ponctuelle',
        sections: sop.sections || [],
        tags: sop.tags || [],
        is_template: !!sop.isTemplate,
        source_template: sop.sourceTemplate || null,
        ordre: sop.ordre ?? 0,
        actif: sop.actif !== false,
      };
      let result;
      if (sop.id) {
        const { data, error } = await client.from('sops').update(row).eq('id', sop.id).select().single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await client.from('sops').insert(row).select().single();
        if (error) throw error;
        result = data;
      }
      return this.mapSopFromDB(result);
    },

    async deleteSop(id) {
      const { error } = await client.from('sops').delete().eq('id', id);
      if (error) throw error;
    },

    // ─── Exécutions ───
    async listSopExecutions(etabId, opts = {}) {
      let q = client.from('sop_executions').select('*').eq('etablissement_id', etabId);
      if (opts.sopId) q = q.eq('sop_id', opts.sopId);
      if (opts.dateFrom) q = q.gte('date_execution', opts.dateFrom);
      if (opts.dateTo) q = q.lte('date_execution', opts.dateTo);
      if (opts.statut) q = q.eq('statut', opts.statut);
      q = q.order('heure_debut', { ascending: false });
      if (opts.limit) q = q.limit(opts.limit);
      const { data, error } = await q;
      if (error) { console.error('[listSopExecutions]', error); return []; }
      return (data || []).map(this.mapSopExecFromDB);
    },

    async startSopExecution({ sopId, etabId, userId, userName }) {
      const row = {
        sop_id: sopId,
        etablissement_id: etabId,
        operateur_id: userId || null,
        operateur_nom: userName || '',
        statut: 'en_cours',
      };
      const { data, error } = await client.from('sop_executions').insert(row).select().single();
      if (error) throw error;
      return this.mapSopExecFromDB(data);
    },

    async finishSopExecution(execId, { totalEtapes, etapesCochees, notes, statut = 'terminee' }) {
      const { data, error } = await client.from('sop_executions')
        .update({
          statut,
          heure_fin: new Date().toISOString(),
          total_etapes: totalEtapes || 0,
          etapes_cochees: etapesCochees || 0,
          notes: notes || '',
        })
        .eq('id', execId).select().single();
      if (error) throw error;
      return this.mapSopExecFromDB(data);
    },

    async deleteSopExecution(execId) {
      const { error } = await client.from('sop_executions').delete().eq('id', execId);
      if (error) throw error;
    },

    // ─── États des étapes ───
    async listSopStepStates(execId) {
      const { data, error } = await client.from('sop_step_states')
        .select('*').eq('execution_id', execId);
      if (error) { console.error('[listSopStepStates]', error); return []; }
      return (data || []).map(s => ({
        id: s.id,
        executionId: s.execution_id,
        stepPath: s.step_path,
        cochee: s.cochee,
        heureCheck: s.heure_check,
        note: s.note || '',
      }));
    },

    async toggleSopStep({ executionId, stepPath, cochee, note }) {
      const row = {
        execution_id: executionId,
        step_path: stepPath,
        cochee: cochee !== undefined ? cochee : true,
        heure_check: cochee ? new Date().toISOString() : null,
        note: note || '',
      };
      const { data, error } = await client.from('sop_step_states')
        .upsert(row, { onConflict: 'execution_id,step_path' })
        .select().single();
      if (error) throw error;
      return data;
    },

    mapSopFromDB(row) {
      if (!row) return null;
      return {
        id: row.id,
        etablissementId: row.etablissement_id,
        titre: row.titre,
        description: row.description || '',
        categorie: row.categorie || 'Service',
        frequence: row.frequence || 'ponctuelle',
        sections: row.sections || [],
        tags: row.tags || [],
        isTemplate: !!row.is_template,
        sourceTemplate: row.source_template,
        ordre: row.ordre || 0,
        actif: row.actif !== false,
        updatedAt: row.updated_at,
      };
    },

    mapSopExecFromDB(row) {
      if (!row) return null;
      return {
        id: row.id,
        sopId: row.sop_id,
        etablissementId: row.etablissement_id,
        operateurId: row.operateur_id,
        operateurNom: row.operateur_nom || '',
        dateExecution: row.date_execution,
        heureDebut: row.heure_debut,
        heureFin: row.heure_fin,
        statut: row.statut,
        totalEtapes: row.total_etapes || 0,
        etapesCochees: row.etapes_cochees || 0,
        notes: row.notes || '',
      };
    },

    // ═══════════════════════════════════════════════════════════════
    // KIT CUISINIER - fiches techniques + références polymorphiques
    // ═══════════════════════════════════════════════════════════════
    async listKitItems(etabId) {
      const { data, error } = await client
        .from('kit_items')
        .select('*')
        .eq('etablissement_id', etabId)
        .eq('actif', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) { console.error('[listKitItems]', error); return []; }
      return (data || []).map(this.mapKitItemFromDB);
    },

    async upsertKitItem(item) {
      const row = {
        etablissement_id: item.etablissementId,
        title: item.title,
        description: item.description || '',
        type: item.type || 'custom',
        linked_type: item.linkedType || null,
        linked_id: item.linkedId || null,
        tags: item.tags || [],
        is_essential: !!item.isEssential,
        sort_order: item.sortOrder ?? 0,
        actif: item.actif !== false,
      };
      let result;
      if (item.id) {
        const { data, error } = await client.from('kit_items').update(row).eq('id', item.id).select().single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await client.from('kit_items').insert(row).select().single();
        if (error) throw error;
        result = data;
      }
      return this.mapKitItemFromDB(result);
    },

    async deleteKitItem(id) {
      const { error } = await client.from('kit_items').delete().eq('id', id);
      if (error) throw error;
    },

    mapKitItemFromDB(row) {
      if (!row) return null;
      return {
        id: row.id,
        etablissementId: row.etablissement_id,
        title: row.title,
        description: row.description || '',
        type: row.type || 'custom',
        linkedType: row.linked_type,
        linkedId: row.linked_id,
        tags: row.tags || [],
        isEssential: !!row.is_essential,
        sortOrder: row.sort_order || 0,
        actif: row.actif !== false,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },

    // ─── CARTES ───
    // strict : cf. _readFailed - remonte l'erreur au lieu de renvoyer [].
    async listCartes(etabId, { strict = false } = {}) {
      let q = client.from('cartes').select('*').order('created_at', { ascending: true });
      if (etabId) q = q.eq('etablissement_id', etabId);
      const { data, error } = await q;
      if (error) return _readFailed('[listCartes]', error, strict);
      // Ordre des onglets : rang choisi par l'utilisateur (colonne `ordre`),
      // created_at en repli. Le tri se fait ici et NON dans la requête pour
      // qu'un front déployé avant la migration 20260805 ne demande pas une
      // colonne absente : `ordre` vaut alors undefined → 0 pour toutes les
      // cartes, et le tri stable de sort() préserve l'ordre created_at déjà
      // appliqué par la requête.
      return (data || []).map(this.mapCarteFromDB)
        .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
    },

    async upsertCarte(carte) {
      const payload = {
        id: carte.id || ('carte-' + Date.now()),
        etablissement_id: carte.etablissementId,
        nom: carte.nom || 'Carte principale',
        date_debut: carte.dateDebut || null,
        date_fin: carte.dateFin || null,
        plats: carte.plats || [],
        // Rang d'affichage : envoyé UNIQUEMENT si l'appelant le porte.
        // mapCarteFromDB ne l'expose que si la colonne existe, donc un front
        // déployé avant la migration 20260805 n'essaie jamais de l'écrire.
        // Sans clé, l'upsert préserve la valeur en base (même contrat que
        // `archive`) : renommer une carte ne la renvoie pas en tête.
        ...(Number.isFinite(carte.ordre) ? { ordre: carte.ordre } : {}),
      };
      const { data, error } = await client.from('cartes').upsert(payload).select().single();
      if (error) throw error;
      return this.mapCarteFromDB(data);
    },

    async deleteCarte(id) {
      // Les liaisons carte_plats / carte_fiches_salle sont supprimées en cascade.
      // Les plats, recettes et fiches restent intacts.
      const { error } = await client.from('cartes').delete().eq('id', id);
      if (error) throw error;
    },

    // Archive / restaure une carte. Update ciblé (pas d'upsert complet) :
    // upsertCarte n'envoie jamais la colonne archive, elle est donc préservée
    // par les renommages et syncs de plats.
    async setCarteArchive(id, archive) {
      const { error } = await client.from('cartes')
        .update({ archive: archive === true })
        .eq('id', id);
      if (error) throw error;
    },

    // Écrit le rang d'affichage des onglets : `orderedIds` est la liste des
    // cartes dans leur nouvel ordre, de gauche à droite. Update ciblé et non
    // upsert : `etablissement_id` est NOT NULL sans défaut, un upsert partiel
    // (id, ordre) serait rejeté. Les cartes archivées ne sont pas touchées -
    // elles gardent leur rang et retrouvent donc leur place à la restauration.
    async setCartesOrdre(orderedIds) {
      const ids = (orderedIds || []).filter(Boolean);
      for (let i = 0; i < ids.length; i += 1) {
        const { error } = await client.from('cartes').update({ ordre: i + 1 }).eq('id', ids[i]);
        if (error) throw error;
      }
    },

    // Remplace l'ensemble des cartes auxquelles un plat est rattaché.
    async setPlatCartes(platId, carteIds) {
      if (!platId) return;
      const wanted = [...new Set((carteIds || []).filter(Boolean))];
      const { data: existing, error: readErr } = await client
        .from('carte_plats').select('carte_id').eq('plat_id', platId);
      if (readErr) throw readErr;
      const current = (existing || []).map(r => r.carte_id);
      const toAdd = wanted.filter(id => !current.includes(id));
      const toRemove = current.filter(id => !wanted.includes(id));
      if (toAdd.length) {
        const { error } = await client.from('carte_plats')
          .upsert(toAdd.map(carte_id => ({ carte_id, plat_id: platId })), { onConflict: 'carte_id,plat_id' });
        if (error) throw error;
      }
      if (toRemove.length) {
        const { error } = await client.from('carte_plats')
          .delete().eq('plat_id', platId).in('carte_id', toRemove);
        if (error) throw error;
      }
    },

    // Retire un plat d'UNE carte précise (sans supprimer le plat ni ses recettes).
    // Le plat reste dans l'établissement et sur les autres cartes auxquelles il est lié.
    async removePlatFromCarte(carteId, platId) {
      const { error } = await client.from('carte_plats')
        .delete().match({ carte_id: carteId, plat_id: platId });
      if (error) throw error;
    },

    // Ajoute un plat à une carte (lien M2M, idempotent).
    async addPlatToCarte(carteId, platId) {
      const { error } = await client.from('carte_plats')
        .upsert({ carte_id: carteId, plat_id: platId }, { onConflict: 'carte_id,plat_id' });
      if (error) throw error;
    },

    // Remplace l'ensemble des cartes auxquelles une fiche salle est rattachée.
    async setFicheCartes(ficheId, carteIds) {
      if (!ficheId) return;
      const wanted = [...new Set((carteIds || []).filter(Boolean))];
      const { data: existing, error: readErr } = await client
        .from('carte_fiches_salle').select('carte_id').eq('fiche_salle_id', ficheId);
      if (readErr) throw readErr;
      const current = (existing || []).map(r => r.carte_id);
      const toAdd = wanted.filter(id => !current.includes(id));
      const toRemove = current.filter(id => !wanted.includes(id));
      if (toAdd.length) {
        const { error } = await client.from('carte_fiches_salle')
          .upsert(toAdd.map(carte_id => ({ carte_id, fiche_salle_id: ficheId })), { onConflict: 'carte_id,fiche_salle_id' });
        if (error) throw error;
      }
      if (toRemove.length) {
        const { error } = await client.from('carte_fiches_salle')
          .delete().eq('fiche_salle_id', ficheId).in('carte_id', toRemove);
        if (error) throw error;
      }
    },

    mapCarteFromDB(row) {
      if (!row) return null;
      return {
        id: row.id,
        etablissementId: row.etablissement_id,
        nom: row.nom,
        dateDebut: row.date_debut,
        dateFin: row.date_fin,
        plats: row.plats || [],
        archive: row.archive === true,
        // Rang d'affichage : clé exposée UNIQUEMENT si la colonne existe, pour
        // qu'un upsert issu d'un objet carte (renommage, sync de plats) ne
        // tente pas de l'écrire tant que la migration 20260805 n'est pas
        // appliquée. Absente = tri replié sur created_at.
        ...(row.ordre !== undefined ? { ordre: row.ordre } : {}),
      };
    },

    // ─── INVENTAIRES ───
    async listInventaires(etabId) {
      let q = client.from('inventaires').select('*').order('date', { ascending: false });
      if (etabId) q = q.eq('etablissement_id', etabId);
      const { data, error } = await q;
      if (error) { console.error('[listInventaires]', error); return []; }
      return (data || []).map(this.mapInventaireFromDB);
    },

    async upsertInventaire(inv) {
      const payload = {
        id: inv.id || ('inv-' + Date.now()),
        etablissement_id: inv.etablissementId,
        date: inv.date,
        statut: inv.statut || 'en cours',
        valide_par: inv.validePar || null,
        valeur_totale: inv.valeurTotale || 0,
        lignes: inv.lignes || [],
      };
      const { data, error } = await client.from('inventaires').upsert(payload).select().single();
      if (error) throw error;
      return this.mapInventaireFromDB(data);
    },

    async deleteInventaire(id) {
      const { error } = await client.from('inventaires').delete().eq('id', id);
      if (error) throw error;
    },

    mapInventaireFromDB(row) {
      if (!row) return null;
      return {
        id: row.id,
        etablissementId: row.etablissement_id,
        date: row.date,
        statut: row.statut,
        validePar: row.valide_par,
        valeurTotale: Number(row.valeur_totale) || 0,
        lignes: row.lignes || [],
      };
    },

    // ─── PERTES ───
    async listPertes(etabId) {
      let q = client.from('pertes').select('*').order('date', { ascending: false });
      if (etabId) q = q.eq('etablissement_id', etabId);
      const { data, error } = await q;
      if (error) { console.error('[listPertes]', error); return []; }
      return (data || []).map(this.mapPerteFromDB);
    },

    async upsertPerte(perte) {
      const payload = {
        id: perte.id || ('p-' + Date.now() + Math.floor(Math.random() * 1000)),
        etablissement_id: perte.etablissementId,
        date: perte.date,
        produit: perte.produit,
        categorie: perte.categorie || null,
        quantite: perte.quantite || 0,
        unite: perte.unite || 'pcs',
        valeur_unit: perte.valeurUnit || 0,
        motif: perte.motif || null,
        declare_par: perte.declarePar || null,
        valide: !!perte.valide,
        valide_par: perte.validePar || null,
        commentaire: perte.commentaire || null,
      };
      const { data, error } = await client.from('pertes').upsert(payload).select().single();
      if (error) throw error;
      return this.mapPerteFromDB(data);
    },

    async deletePerte(id) {
      const { error } = await client.from('pertes').delete().eq('id', id);
      if (error) throw error;
    },

    // ─── Compteur de factures (atomique multi-device) ───
    // Incrémente atomiquement le compteur (etablissement, date) via UPSERT Postgres
    // et retourne le nouveau numéro complet (FAC-YYYYMMDD-NN).
    // Fallback localStorage si la table n'existe pas encore (migration douce).
    async getNextFactureNumber(etabId, dateStr) {
      const d = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateForKey = `${y}-${m}-${dd}`;
      const datePart = `${y}${m}${dd}`;
      try {
        // Lire la valeur actuelle (ou 0 si pas de ligne)
        const { data: current, error: readErr } = await client
          .from('factures_compteurs')
          .select('last_seq')
          .eq('etablissement_id', etabId)
          .eq('date', dateForKey)
          .maybeSingle();
        if (readErr) throw readErr;
        const nextSeq = (current?.last_seq || 0) + 1;
        // Écrire la nouvelle valeur (UPSERT atomique au niveau ligne)
        const { error: writeErr } = await client
          .from('factures_compteurs')
          .upsert({
            etablissement_id: etabId,
            date: dateForKey,
            last_seq: nextSeq,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'etablissement_id,date' });
        if (writeErr) throw writeErr;
        return `FAC-${datePart}-${String(nextSeq).padStart(2, '0')}`;
      } catch (err) {
        // Fallback localStorage si la table n'existe pas (migration pas encore appliquée)
        console.warn('[getNextFactureNumber] DB échec, fallback localStorage', err);
        try {
          const key = `fac_counter_${datePart}`;
          const cnt = parseInt(readText(key, '0'), 10) + 1;
          writeText(key, String(cnt));
          return `FAC-${datePart}-${String(cnt).padStart(2, '0')}`;
        } catch {
          return `FAC-${datePart}-${Date.now().toString().slice(-3)}`;
        }
      }
    },

    mapPerteFromDB(row) {
      if (!row) return null;
      return {
        id: row.id,
        etablissementId: row.etablissement_id,
        date: row.date,
        produit: row.produit,
        categorie: row.categorie || '',
        quantite: Number(row.quantite) || 0,
        unite: row.unite,
        valeurUnit: Number(row.valeur_unit) || 0,
        motif: row.motif || '',
        declarePar: row.declare_par,
        valide: !!row.valide,
        validePar: row.valide_par,
        commentaire: row.commentaire || '',
      };
    },

    // ─── DOCUMENTS (dossiers + fichiers) ───
    async listDocuments(etabId) {
      let q = client.from('documents').select('*').order('type', { ascending: true }).order('nom');
      if (etabId) q = q.eq('etablissement_id', etabId);
      const { data, error } = await q;
      if (error) { console.error('[listDocuments]', error); return []; }
      return (data || []).map(this.mapDocumentFromDB);
    },

    async createFolder({ etablissementId, parentId, nom, userId }) {
      const payload = {
        id: 'dir-' + Date.now() + Math.floor(Math.random() * 1000),
        etablissement_id: etablissementId,
        parent_id: parentId || null,
        type: 'folder',
        nom,
        uploaded_by: userId || null,
      };
      const { data, error } = await client.from('documents').insert(payload).select().single();
      if (error) throw error;
      return this.mapDocumentFromDB(data);
    },

    // Upload d'un fichier PDF : upload dans storage puis insert dans la table
    async uploadFile({ etablissementId, parentId, file, userId }) {
      // Chemin : <etablissement_id>/<timestamp>-<nom-fichier>
      const timestamp = Date.now();
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${etablissementId}/${timestamp}-${cleanName}`;

      // 1. Upload dans storage
      const { error: upErr } = await client.storage.from('documents').upload(storagePath, file, {
        contentType: file.type || 'application/pdf',
        upsert: false,
      });
      if (upErr) throw upErr;

      // 2. Insert dans la table
      const payload = {
        id: 'doc-' + timestamp + Math.floor(Math.random() * 1000),
        etablissement_id: etablissementId,
        parent_id: parentId || null,
        type: 'file',
        nom: file.name,
        storage_path: storagePath,
        mime_type: file.type || 'application/pdf',
        taille: file.size,
        uploaded_by: userId || null,
      };
      const { data, error } = await client.from('documents').insert(payload).select().single();
      if (error) {
        // Rollback : supprimer le fichier uploadé
        await client.storage.from('documents').remove([storagePath]).catch(() => {});
        throw error;
      }
      return this.mapDocumentFromDB(data);
    },

    // Générer URL signée (valide 1h) pour lire/télécharger un PDF
    async getFileURL(storagePath) {
      const { data, error } = await client.storage.from('documents').createSignedUrl(storagePath, 3600);
      if (error) throw error;
      return data.signedUrl;
    },

    async deleteDocument(doc) {
      // Si c'est un fichier, supprimer aussi du storage
      if (doc.type === 'file' && doc.storagePath) {
        await client.storage.from('documents').remove([doc.storagePath]).catch(err => console.error('[storage remove]', err));
      }
      // Pour un dossier, il faut récursivement supprimer les enfants
      // (ON DELETE CASCADE sur parent_id gère les enfants en DB, mais pas les fichiers storage)
      if (doc.type === 'folder') {
        const { data: children } = await client.from('documents').select('*').eq('parent_id', doc.id);
        if (children && children.length > 0) {
          // Collecte récursive de tous les storage_path descendants
          const collectPaths = async (parentId) => {
            const { data: kids } = await client.from('documents').select('*').eq('parent_id', parentId);
            const paths = [];
            for (const kid of (kids || [])) {
              if (kid.type === 'file' && kid.storage_path) paths.push(kid.storage_path);
              if (kid.type === 'folder') paths.push(...await collectPaths(kid.id));
            }
            return paths;
          };
          const allPaths = await collectPaths(doc.id);
          if (allPaths.length > 0) {
            await client.storage.from('documents').remove(allPaths).catch(err => console.error('[bulk remove]', err));
          }
        }
      }
      const { error } = await client.from('documents').delete().eq('id', doc.id);
      if (error) throw error;
    },

    async renameDocument(id, newName) {
      const { data, error } = await client.from('documents').update({ nom: newName }).eq('id', id).select().single();
      if (error) throw error;
      return this.mapDocumentFromDB(data);
    },

    async moveDocument(id, newParentId) {
      const { data, error } = await client.from('documents')
        .update({ parent_id: newParentId || null })
        .eq('id', id).select().single();
      if (error) throw error;
      return this.mapDocumentFromDB(data);
    },

    mapDocumentFromDB(row) {
      if (!row) return null;
      return {
        id: row.id,
        etablissementId: row.etablissement_id,
        parentId: row.parent_id,
        type: row.type,
        nom: row.nom,
        storagePath: row.storage_path,
        mimeType: row.mime_type,
        taille: row.taille,
        uploadedBy: row.uploaded_by,
        description: row.description || '',
        createdAt: row.created_at,
      };
    },

    // ─── CONSULTANT MESSAGES (1 message par établissement) ───
    async getConsultantMessage(etabId) {
      const { data, error } = await client.from('consultant_messages').select('*').eq('etablissement_id', etabId).maybeSingle();
      if (error) { console.error('[getConsultantMessage]', error); return null; }
      if (!data) return null;
      return {
        etablissementId: data.etablissement_id,
        message: data.message || '',
        updatedBy: data.updated_by,
        updatedAt: data.updated_at,
      };
    },

    async setConsultantMessage(etabId, message, userId) {
      const { data, error } = await client.from('consultant_messages').upsert({
        etablissement_id: etabId,
        message,
        updated_by: userId,
        // Le default now() ne joue qu'à l'insert - sans ça, la date reste figée à la création.
        updated_at: new Date().toISOString(),
      }).select().single();
      if (error) throw error;
      return data;
    },

    // ─── MESSAGES PRIVÉS (sens unique : consultant → utilisateur) ───
    mapPrivateMessageFromDB(row) {
      return {
        id: row.id,
        recipientId: row.recipient_id,
        senderId: row.sender_id,
        message: row.message,
        createdAt: row.created_at,
        readAt: row.read_at,
      };
    },

    async listPrivateMessages(recipientId) {
      const { data, error } = await client.from('private_messages')
        .select('*')
        .eq('recipient_id', recipientId)
        .order('created_at', { ascending: false });
      if (error) { console.error('[listPrivateMessages]', error); return []; }
      return (data || []).map(r => this.mapPrivateMessageFromDB(r));
    },

    // Vue consultant : derniers messages tous destinataires confondus
    // (RLS : seuls le consultant et chaque destinataire voient leurs lignes).
    async listAllPrivateMessages() {
      const { data, error } = await client.from('private_messages')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) { console.error('[listAllPrivateMessages]', error); return []; }
      return (data || []).map(r => this.mapPrivateMessageFromDB(r));
    },

    async countUnreadPrivateMessages(recipientId) {
      const { count, error } = await client.from('private_messages')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', recipientId)
        .is('read_at', null);
      if (error) { console.error('[countUnreadPrivateMessages]', error); return 0; }
      return count || 0;
    },

    async sendPrivateMessage(recipientId, message, senderId) {
      const { data, error } = await client.from('private_messages').insert({
        recipient_id: recipientId,
        sender_id: senderId,
        message,
      }).select().single();
      if (error) throw error;
      return this.mapPrivateMessageFromDB(data);
    },

    async markPrivateMessagesRead(recipientId) {
      const { error } = await client.from('private_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('recipient_id', recipientId)
        .is('read_at', null);
      if (error) console.error('[markPrivateMessagesRead]', error);
    },

    async deletePrivateMessage(id) {
      const { error } = await client.from('private_messages').delete().eq('id', id);
      if (error) throw error;
    },

    // ─── HACCP - Zones ───
    async listHaccpZones(etabId) {
      let q = client.from('haccp_zones').select('*').order('nom');
      if (etabId) q = q.eq('etablissement_id', etabId);
      const { data, error } = await q;
      if (error) { console.error('[listHaccpZones]', error); return []; }
      return (data || []).map(this.mapHaccpZoneFromDB);
    },
    async upsertHaccpZone(zone) {
      const payload = {
        id: zone.id || ('hz-' + Date.now() + Math.floor(Math.random() * 1000)),
        etablissement_id: zone.etablissementId,
        nom: zone.nom,
        type: zone.type || 'froid',
        cible: zone.cible ?? null,
        min_val: zone.min ?? null,
        max_val: zone.max ?? null,
        unite: zone.unite || '°C',
        icone: zone.icone || '❄',
        actif: zone.actif !== false,
      };
      const { data, error } = await client.from('haccp_zones').upsert(payload).select().single();
      if (error) throw error;
      return this.mapHaccpZoneFromDB(data);
    },
    async deleteHaccpZone(id) {
      const { error } = await client.from('haccp_zones').delete().eq('id', id);
      if (error) throw error;
    },
    mapHaccpZoneFromDB(row) {
      if (!row) return null;
      return {
        id: row.id,
        etablissementId: row.etablissement_id,
        nom: row.nom,
        type: row.type,
        cible: row.cible != null ? Number(row.cible) : null,
        min: row.min_val != null ? Number(row.min_val) : null,
        max: row.max_val != null ? Number(row.max_val) : null,
        unite: row.unite,
        icone: row.icone,
        actif: !!row.actif,
      };
    },

    // ─── HACCP - Control templates ───
    async listHaccpTpls(etabId) {
      let q = client.from('haccp_ctrl_templates').select('*').order('label');
      if (etabId) q = q.eq('etablissement_id', etabId);
      const { data, error } = await q;
      if (error) { console.error('[listHaccpTpls]', error); return []; }
      return (data || []).map(this.mapHaccpTplFromDB);
    },
    async upsertHaccpTpl(tpl) {
      const payload = {
        id: tpl.id || ('ht-' + Date.now() + Math.floor(Math.random() * 1000)),
        etablissement_id: tpl.etablissementId,
        label: tpl.label,
        type: tpl.type || 'hygiene',
        frequence: tpl.frequence || 'Quotidien',
        actif: tpl.actif !== false,
        description: tpl.description || null,
      };
      const { data, error } = await client.from('haccp_ctrl_templates').upsert(payload).select().single();
      if (error) throw error;
      return this.mapHaccpTplFromDB(data);
    },
    async deleteHaccpTpl(id) {
      const { error } = await client.from('haccp_ctrl_templates').delete().eq('id', id);
      if (error) throw error;
    },
    mapHaccpTplFromDB(row) {
      if (!row) return null;
      return {
        id: row.id,
        etablissementId: row.etablissement_id,
        label: row.label,
        type: row.type,
        frequence: row.frequence,
        actif: !!row.actif,
        description: row.description || '',
      };
    },

    // ─── HACCP - Relevés ───
    async listHaccpReleves(etabId) {
      let q = client.from('haccp_releves').select('*').order('date', { ascending: false }).order('heure', { ascending: false });
      if (etabId) q = q.eq('etablissement_id', etabId);
      const { data, error } = await q;
      if (error) { console.error('[listHaccpReleves]', error); return []; }
      return (data || []).map(this.mapHaccpReleveFromDB);
    },
    async upsertHaccpReleve(releve) {
      const payload = {
        id: releve.id || ('hr-' + Date.now() + Math.floor(Math.random() * 1000)),
        etablissement_id: releve.etablissementId,
        zone_id: releve.zoneId,
        date: releve.date,
        heure: releve.heure,
        valeur: releve.valeur,
        operateur: releve.operateur || null,
        conforme: releve.conforme,
        commentaire: releve.commentaire || null,
      };
      const { data, error } = await client.from('haccp_releves').upsert(payload).select().single();
      if (error) throw error;
      return this.mapHaccpReleveFromDB(data);
    },
    async deleteHaccpReleve(id) {
      const { error } = await client.from('haccp_releves').delete().eq('id', id);
      if (error) throw error;
    },
    mapHaccpReleveFromDB(row) {
      if (!row) return null;
      return {
        id: row.id,
        etablissementId: row.etablissement_id,
        zoneId: row.zone_id,
        date: row.date,
        heure: row.heure ? row.heure.slice(0, 5) : '',
        valeur: Number(row.valeur) || 0,
        operateur: row.operateur,
        conforme: !!row.conforme,
        commentaire: row.commentaire || '',
      };
    },

    // ─── HACCP - Contrôles ───
    async listHaccpControls(etabId) {
      let q = client.from('haccp_controls').select('*').order('date', { ascending: false }).order('heure', { ascending: false });
      if (etabId) q = q.eq('etablissement_id', etabId);
      const { data, error } = await q;
      if (error) { console.error('[listHaccpControls]', error); return []; }
      return (data || []).map(this.mapHaccpControlFromDB);
    },
    async upsertHaccpControl(ctrl) {
      const payload = {
        id: ctrl.id || ('hc-' + Date.now() + Math.floor(Math.random() * 1000)),
        etablissement_id: ctrl.etablissementId,
        template_id: ctrl.templateId || null,
        date: ctrl.date,
        heure: ctrl.heure || null,
        statut: ctrl.statut || 'conforme',
        operateur: ctrl.operateur || null,
        notes: ctrl.notes || null,
      };
      const { data, error } = await client.from('haccp_controls').upsert(payload).select().single();
      if (error) throw error;
      return this.mapHaccpControlFromDB(data);
    },
    async deleteHaccpControl(id) {
      const { error } = await client.from('haccp_controls').delete().eq('id', id);
      if (error) throw error;
    },
    mapHaccpControlFromDB(row) {
      if (!row) return null;
      return {
        id: row.id,
        etablissementId: row.etablissement_id,
        templateId: row.template_id,
        date: row.date,
        heure: row.heure ? row.heure.slice(0, 5) : '',
        statut: row.statut,
        operateur: row.operateur,
        notes: row.notes || '',
      };
    },

    // ─── HACCP - Traçabilité (photos d'étiquettes, classées Année/Mois/Jour) ───
    async listHaccpTracabilite(etabId) {
      let q = client.from('haccp_tracabilite').select('*').order('date', { ascending: false }).order('created_at', { ascending: false });
      if (etabId) q = q.eq('etablissement_id', etabId);
      const { data, error } = await q;
      if (error) { console.error('[listHaccpTracabilite]', error); return []; }
      return (data || []).map(this.mapHaccpTracabiliteFromDB);
    },
    async createHaccpTracabilite(entry) {
      const payload = {
        id: entry.id || ('tr-' + Date.now() + Math.floor(Math.random() * 1000)),
        etablissement_id: entry.etablissementId,
        date: entry.date,
        produit: entry.produit || null,
        photo_url: entry.photoUrl,
        storage_path: entry.storagePath,
        operateur: entry.operateur || null,
        notes: entry.notes || null,
      };
      const { data, error } = await client.from('haccp_tracabilite').insert(payload).select().single();
      if (error) throw error;
      return this.mapHaccpTracabiliteFromDB(data);
    },
    // Suppression via l'Edge Function (ligne DB + fichier storage ensemble -
    // le bucket est en écriture service-only, le client ne peut pas y toucher).
    // Repli sur la suppression DB directe si la fonction déployée est une
    // ancienne version qui ne connaît pas encore l'action delete.
    async deleteHaccpTracabilite(id) {
      const { data: { session } } = await client.auth.getSession();
      if (session) {
        const { url: supabaseUrl, anonKey } = getSupabaseConfig();
        let res = null;
        try {
          res = await fetch(`${supabaseUrl}/functions/v1/upload-haccp-photo`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              apikey: anonKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'delete', id }),
          });
        } catch (err) {
          console.warn('[deleteHaccpTracabilite] Edge Function injoignable, repli DB direct', err);
        }
        if (res) {
          if (res.ok) return;
          const data = await res.json().catch(() => ({}));
          // 403 = vrai refus d'accès : ne pas le contourner par le repli
          if (res.status === 403) throw new Error(data.error || 'Accès refusé pour cet établissement');
          console.warn('[deleteHaccpTracabilite] Edge Function indisponible, repli DB direct', data.error || res.status);
        }
      }
      const { error } = await client.from('haccp_tracabilite').delete().eq('id', id);
      if (error) throw error;
    },
    mapHaccpTracabiliteFromDB(row) {
      if (!row) return null;
      return {
        id: row.id,
        etablissementId: row.etablissement_id,
        date: row.date,
        produit: row.produit || '',
        photoUrl: row.photo_url,
        storagePath: row.storage_path,
        operateur: row.operateur,
        notes: row.notes || '',
        createdAt: row.created_at,
      };
    },
    // Upload cote serveur via l'Edge Function upload-haccp-photo. Meme principe
    // que uploadRecettePhoto : le client storage n'attache pas toujours le token
    // user a la requete storage, donc la fonction valide le JWT et ecrit avec la
    // cle service. Le path (Annee/Mois/Jour) est construit cote serveur.
    async uploadHaccpPhoto({ etabId, file }) {
      if (!file) throw new Error('Aucun fichier');
      const { data: { session } } = await client.auth.getSession();
      if (!session) throw new Error('Session expiree. Reconnectez-vous puis reessayez.');
      const { url: supabaseUrl, anonKey } = getSupabaseConfig();
      const form = new FormData();
      form.append('file', file);
      form.append('etabId', etabId || '');
      const res = await fetch(`${supabaseUrl}/functions/v1/upload-haccp-photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: anonKey },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      return { path: data.path, url: data.url, date: data.date };
    },

    // ─── FICHES SALLE ───
    async listFichesSalle(etabId) {
      let q = client.from('fiches_salle').select('*, carte_fiches_salle(carte_id)').order('nom');
      if (etabId) q = q.eq('etablissement_id', etabId);
      const { data, error } = await q;
      if (error) { console.error('[listFichesSalle]', error); return []; }
      return (data || []).map(this.mapFicheSalleFromDB);
    },
    async upsertFicheSalle(fiche) {
      const payload = {
        id: fiche.id || ('fs-' + Date.now() + Math.floor(Math.random() * 1000)),
        etablissement_id: fiche.etablissementId,
        nom: fiche.nom,
        categorie: fiche.categorie || 'Plats',
        statut: fiche.statut || 'active',
        description_service: fiche.descriptionService || null,
        temperature_service: fiche.temperatureService || null,
        dressage_notes: fiche.dressageNotes || null,
        allergenes: fiche.allergenes || [],
        accords: fiche.accords || [],
        accords_generaux: fiche.accordsGeneraux || [],
        infos_service: fiche.infosService || null,
        temps_preparation: fiche.tempsPreparation || null,
        modifie_par: fiche.modifiePar || null,
      };
      const { data, error } = await client.from('fiches_salle').upsert(payload).select().single();
      if (error) throw error;
      return this.mapFicheSalleFromDB(data);
    },
    async deleteFicheSalle(id) {
      const { error } = await client.from('fiches_salle').delete().eq('id', id);
      if (error) throw error;
    },
    mapFicheSalleFromDB(row) {
      if (!row) return null;
      return {
        id: row.id,
        etablissementId: row.etablissement_id,
        nom: row.nom,
        categorie: row.categorie,
        statut: row.statut,
        descriptionService: row.description_service || '',
        temperatureService: row.temperature_service || '',
        dressageNotes: row.dressage_notes || '',
        allergenes: row.allergenes || [],
        accords: row.accords || [],
        accordsGeneraux: row.accords_generaux || [],
        infosService: row.infos_service || '',
        tempsPreparation: row.temps_preparation || '',
        modifiePar: row.modifie_par,
        modifie: row.updated_at ? row.updated_at.slice(0, 10) : null,
        carteIds: (row.carte_fiches_salle || []).map(cf => cf.carte_id),
      };
    },

    // ─── COMMANDE (liste de produits a commander, partagee par etablissement) ───
    async listCommandeItems(etabId) {
      let q = client.from('commande_items').select('*')
        .order('categorie', { ascending: true })
        .order('nom', { ascending: true });
      if (etabId) q = q.eq('etablissement_id', etabId);
      const { data, error } = await q;
      if (error) { console.error('[listCommandeItems]', error); return []; }
      return (data || []).map(this.mapCommandeItemFromDB);
    },

    async upsertCommandeItem(item) {
      const payload = {
        id: item.id || ('cmd-' + Date.now() + Math.floor(Math.random() * 1000)),
        etablissement_id: item.etablissementId,
        cle: item.cle,
        produit_id: item.produitId || null,
        nom: item.nom,
        categorie: item.categorie || 'Autres',
        unite: item.unite || '',
        besoin: item.besoin != null ? Number(item.besoin) : 0,
        quantite: item.quantite === '' || item.quantite == null ? null : Number(item.quantite),
        coche: !!item.coche,
        source: item.source || 'manual',
        ordre: item.ordre || 0,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await client.from('commande_items').upsert(payload).select().single();
      if (error) throw error;
      return this.mapCommandeItemFromDB(data);
    },

    async deleteCommandeItem(id) {
      const { error } = await client.from('commande_items').delete().eq('id', id);
      if (error) throw error;
    },

    // Genere / regenere les lignes « auto » a partir d'une liste calculee, sans
    // ecraser les cases cochees ni les quantites saisies (colonnes absentes du
    // payload upsert => preservees sur les lignes existantes). Les lignes « auto »
    // qui ne sont plus necessaires sont supprimees ; les lignes « manual » sont
    // toujours conservees.
    async generateCommande(etabId, computedItems) {
      const items = Array.isArray(computedItems) ? computedItems : [];
      const { data: existing, error: readErr } = await client
        .from('commande_items').select('id, cle, source, nom').eq('etablissement_id', etabId);
      if (readErr) throw readErr;
      const existingByCle = new Map((existing || []).map(r => [r.cle, r]));

      if (items.length) {
        const payload = items.map(it => {
          const ex = existingByCle.get(it.cle);
          return {
            etablissement_id: etabId,
            cle: it.cle,
            produit_id: it.produitId || null,
            // Préserve le nom existant (y compris renommé à la main) ; nomme les nouvelles lignes.
            nom: ex ? ex.nom : it.nom,
            categorie: it.categorie || 'Autres',
            unite: it.unite || '',
            besoin: Number(it.besoin) || 0,
            source: 'auto',
            ordre: it.ordre || 0,
            updated_at: new Date().toISOString(),
          };
        });
        const { error: upErr } = await client
          .from('commande_items').upsert(payload, { onConflict: 'etablissement_id,cle' });
        if (upErr) throw upErr;
      }

      const wanted = new Set(items.map(it => it.cle));
      const stale = (existing || []).filter(r => r.source === 'auto' && !wanted.has(r.cle)).map(r => r.id);
      if (stale.length) {
        const { error: delErr } = await client.from('commande_items').delete().in('id', stale);
        if (delErr) throw delErr;
      }
      return items.length;
    },

    mapCommandeItemFromDB(row) {
      if (!row) return null;
      return {
        id: row.id,
        etablissementId: row.etablissement_id,
        cle: row.cle,
        produitId: row.produit_id || null,
        nom: row.nom,
        categorie: row.categorie || 'Autres',
        unite: row.unite || '',
        besoin: row.besoin != null ? Number(row.besoin) : 0,
        quantite: row.quantite != null ? Number(row.quantite) : null,
        coche: !!row.coche,
        source: row.source || 'manual',
        ordre: row.ordre || 0,
      };
    },

    // ─── FOURNISSEURS ───
    async listFournisseurs(etabId) {
      let q = client.from('fournisseurs').select('*').order('nom');
      if (etabId) q = q.eq('etablissement_id', etabId);
      const { data, error } = await q;
      if (error) { console.error('[listFournisseurs]', error); return []; }
      return (data || []).map(r => ({
        id: r.id, etablissementId: r.etablissement_id, nom: r.nom,
        contact: r.contact || '', tel: r.tel || '', email: r.email || '',
        adresse: r.adresse || '', notes: r.notes || '', actif: !!r.actif,
      }));
    },
    async upsertFournisseur(f) {
      const payload = {
        id: f.id || ('fourn-' + Date.now() + Math.floor(Math.random() * 1000)),
        etablissement_id: f.etablissementId,
        nom: f.nom, contact: f.contact || null, tel: f.tel || null,
        email: f.email || null, adresse: f.adresse || null,
        notes: f.notes || null, actif: f.actif !== false,
      };
      const { data, error } = await client.from('fournisseurs').upsert(payload).select().single();
      if (error) throw error;
      _invalidateRead('produits'); // le nom du fournisseur est joint dans la liste produits
      return data;
    },
    async deleteFournisseur(id) {
      const { error } = await client.from('fournisseurs').delete().eq('id', id);
      if (error) throw error;
      _invalidateRead('produits');
    },

    // ─── PRODUITS ───
    // Lecture lourde (jointures imbriquées) → cache court + dédup in-flight.
    // Invalidée immédiatement par les écritures produits/fournisseurs ci-dessous
    // et par les events realtime (via subscribeReload → _invalidateForTables).
    async listProduits(etabId) {
      return _cachedRead('produits', etabId, async () => {
        let q = client.from('produits')
          .select(`*, fournisseurs(nom), produit_fournisseurs(id,fournisseur_id,prix_achat,conditionnement,quantite_cond,unite_cond,prix_unitaire,est_principal,reference,fournisseurs(nom))`)
          .order('categorie').order('nom');
        if (etabId) q = q.eq('etablissement_id', etabId);
        const { data, error } = await q;
        if (error) { console.error('[listProduits]', error); return []; }
        return (data || []).map(r => this.mapProduitFromDB(r));
      });
    },
    async searchProduits(etabId, query) {
      // Recherche full-text rapide
      let q = client.from('produits')
        .select(`*, produit_fournisseurs(prix_unitaire,est_principal,fournisseurs(nom))`)
        .eq('etablissement_id', etabId)
        .eq('actif', true)
        .ilike('nom', `%${query}%`)
        .order('nom')
        .limit(20);
      const { data, error } = await q;
      if (error) { console.error('[searchProduits]', error); return []; }
      return (data || []).map(r => this.mapProduitFromDB(r));
    },
    async upsertProduit(p) {
      const payload = {
        id: p.id || ('prod-' + Date.now() + Math.floor(Math.random() * 1000)),
        etablissement_id: p.etablissementId,
        nom: p.nom, categorie: p.categorie || 'Autres',
        sous_categorie: p.sousCategorie || null,
        unite_ref: p.uniteRef || 'g',
        prix_unitaire: p.prixUnitaire != null ? parseFloat(p.prixUnitaire) : null,
        fournisseur_id: p.fournisseurId || null,
        reference_fourn: p.referenceFourn || null,
        conditionnement: p.conditionnement || null,
        actif: p.actif !== false, notes: p.notes || null,
        allergenes: p.allergenes || [],
      };
      const { data, error } = await client.from('produits').upsert(payload).select().single();
      if (error) throw error;
      _invalidateRead('produits'); // garde-fou : la saisie utilisateur est visible tout de suite
      return data;
    },
    async deleteProduit(id) {
      const { error } = await client.from('produits').delete().eq('id', id);
      if (error) throw error;
      _invalidateRead('produits');
    },
    mapProduitFromDB(row) {
      if (!row) return null;
      // Trouver fournisseur principal dans produit_fournisseurs
      const pfs = row.produit_fournisseurs || [];
      const principal = pfs.find(pf => pf.est_principal) || pfs[0] || null;
      return {
        id: row.id, etablissementId: row.etablissement_id,
        nom: row.nom, categorie: row.categorie, sousCategorie: row.sous_categorie || '',
        uniteRef: row.unite_ref,
        prixUnitaire: principal?.prix_unitaire ?? row.prix_unitaire ?? 0,
        prixUnitaireManuel: row.prix_unitaire,
        fournisseurId: row.fournisseur_id,
        fournisseurNom: row.fournisseurs?.nom || principal?.fournisseurs?.nom || '',
        referenceFourn: row.reference_fourn || '',
        conditionnement: row.conditionnement || '',
        actif: !!row.actif, notes: row.notes || '',
        allergenes: row.allergenes || [],
        fournisseurs: pfs.map(pf => ({
          id: pf.id, fournisseurId: pf.fournisseur_id,
          fournisseurNom: pf.fournisseurs?.nom || '',
          prixAchat: pf.prix_achat, conditionnement: pf.conditionnement || '',
          quantiteCond: pf.quantite_cond, uniteCond: pf.unite_cond,
          prixUnitaire: pf.prix_unitaire, estPrincipal: pf.est_principal,
          reference: pf.reference || '',
        })),
      };
    },

    // ─── PRIX PAR FOURNISSEUR ───
    async upsertProduitFournisseur(pf) {
      const payload = {
        id: pf.id || ('pf-' + Date.now() + Math.floor(Math.random() * 1000)),
        produit_id: pf.produitId,
        fournisseur_id: pf.fournisseurId,
        prix_achat: parseFloat(pf.prixAchat) || 0,
        conditionnement: pf.conditionnement || null,
        quantite_cond: pf.quantiteCond ? parseFloat(pf.quantiteCond) : null,
        unite_cond: pf.uniteCond || null,
        est_principal: !!pf.estPrincipal,
        reference: pf.reference || null,
        delai_livraison: pf.delaiLivraison || null,
        notes: pf.notes || null,
      };
      const { data, error } = await client.from('produit_fournisseurs').upsert(payload).select().single();
      if (error) throw error;
      _invalidateRead('produits'); // le prix principal est agrégé dans la liste produits
      return data;
    },
    async deleteProduitFournisseur(id) {
      const { error } = await client.from('produit_fournisseurs').delete().eq('id', id);
      if (error) throw error;
      _invalidateRead('produits');
    },
  };

  // ─────────────────────────────────────────
  // REALTIME helpers
  // Usage : sb.subscribe('profiles', (payload) => { ... })
  // payload.eventType = INSERT | UPDATE | DELETE
  // payload.new = row après, payload.old = row avant (DELETE)
  // ─────────────────────────────────────────
  // Compteur global pour garantir l'unicité même si plusieurs subscribe()
  // sont appelés dans la même milliseconde (cas React StrictMode + remontages rapides)
  let _channelCounter = 0;

  const realtime = {
    subscribe(table, callback) {
      // Unicité ultra-robuste : compteur incrémental + timestamp + random
      _channelCounter += 1;
      const uniqueSuffix = `${Date.now()}-${_channelCounter}-${Math.random().toString(36).slice(2, 8)}`;
      const channelName = `rt:${table}:${uniqueSuffix}`;
      const channel = client.channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
        .subscribe();
      // Retourne une fonction de cleanup qui retire proprement le channel
      return () => {
        try { client.removeChannel(channel); }
        catch (e) { console.warn('[realtime cleanup]', e); }
      };
    },

    // Souscription « refetch » coalescée : écoute une ou plusieurs tables et
    // déclenche UN SEUL reloadFn débouncé, quelle que soit la rafale d'events.
    // Comportement identique à N subscribe(table, reloadFn) (reloadFn fait un
    // refetch complet, idempotent) mais :
    //   - regroupe une rafale multi-tables/multi-lignes en 1 seul reload
    //   - réduit drastiquement les refetch sous charge concurrente (multi-user)
    // À utiliser pour les callbacks qui rechargent toute une liste. NE PAS
    // utiliser quand le callback a besoin de chaque payload.new/old individuel
    // (ex. Planning) : utiliser subscribe() dans ce cas.
    //
    // debounceMs = 500 : fenêtre de coalescence. Sous édition concurrente
    // (plusieurs utilisateurs), une rafale d'events est regroupée en UN seul
    // refetch → réduit les « tempêtes de rechargement ». 500 ms reste
    // imperceptible à l'usage tout en divisant la charge sous forte activité.
    //
    // Le même reloadFn est aussi rejoué au réveil de l'appareil (cf.
    // _resumeHandlers en haut de fichier) : pendant la veille le canal realtime
    // est mort, aucun event n'arrive, et sans ça le module resterait figé sur
    // les données d'avant la veille - ou vide si sa dernière lecture a échoué.
    subscribeReload(tables, reloadFn, { debounceMs = 500 } = {}) {
      const list = Array.isArray(tables) ? tables : [tables];
      let timer = null;
      let cancelled = false;
      const schedule = () => {
        if (cancelled) return;
        // Garde-fou #1 : on invalide le cache de lecture sur le MÊME event qui
        // déclenche le reload. Un seul chemin de rafraîchissement → le reload
        // débouncé refetch toujours des données fraîches (pas de divergence).
        _invalidateForTables(list);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; if (!cancelled) reloadFn(); }, debounceMs);
      };
      const unsubs = list.map(t => this.subscribe(t, schedule));
      _resumeHandlers.add(schedule);
      return () => {
        cancelled = true;
        _resumeHandlers.delete(schedule);
        if (timer) { clearTimeout(timer); timer = null; }
        unsubs.forEach(u => u && u());
      };
    }
  };

  // ─────────────────────────────────────────
  // Expose
  // ─────────────────────────────────────────
  const legacySupabase = { client, auth, db, realtime };
  setLegacySB(legacySupabase);
  return legacySupabase;
}
