import { getBrowserWindow, setLegacySB } from '../legacy/legacyApi.js';
import { getSupabaseConfig, supabase } from './supabase.js';
import { readText, writeText } from '../utils/storage.js';

// ═══════════════════════════════════════════════════════════════
// MODULE SUPABASE — Client + helpers pour auth et data
// ═══════════════════════════════════════════════════════════════
// Vite compatibility layer: keeps the legacy SB API while using the central
// Supabase client from services/supabase.js.
// ═══════════════════════════════════════════════════════════════

export function installLegacySupabase() {
  const cfg = getSupabaseConfig();
  if (!cfg.url || cfg.url.includes('VOTRE-PROJET')) {
    console.warn('[Supabase] Config manquante. Renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.');
    setLegacySB(null);
    return;
  }
  const client = supabase;

  // Cache mémoire des user_settings de l'utilisateur courant (Map<key, value>).
  // null = pas hydraté. Hydraté via db.loadAllUserSettings() après login.
  // Vidé via db.clearUserSettingsCache() au logout.
  let _userSettingsCache = null;

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
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: (getBrowserWindow()?.location.origin || '') + '/vite-index.html?reset=true'
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
      const { data, error } = await client.from('profiles').select('*').order('nom');
      if (error) { console.error('[listProfiles]', error); return []; }
      return data || [];
    },

    async createProfile(profile) {
      // profil.id = auth.users.id déjà créé via signUp
      const { data, error } = await client.from('profiles').insert(profile).select().single();
      if (error) throw error;
      return data;
    },

    async updateProfile(id, updates) {
      const { data, error } = await client.from('profiles').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },

    async deleteProfile(id) {
      const { error } = await client.from('profiles').delete().eq('id', id);
      if (error) throw error;
    },

    async listEtablissements() {
      const { data, error } = await client.from('etablissements').select('*').order('nom');
      if (error) { console.error('[listEtablissements]', error); return []; }
      return data || [];
    },

    async upsertEtablissement(etab) {
      const { data, error } = await client.from('etablissements').upsert(etab).select().single();
      if (error) throw error;
      return data;
    },

    async deleteEtablissement(id) {
      const { error } = await client.from('etablissements').delete().eq('id', id);
      if (error) throw error;
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
      const { data: { user } } = await client.auth.getUser();
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
    },

    // Lecture async classique. Utilise le cache si dispo, sinon fait l'appel DB.
    async getUserSetting(key) {
      if (_userSettingsCache) {
        return _userSettingsCache.get(key) ?? null;
      }
      const { data: { user } } = await client.auth.getUser();
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
      const { data: { user } } = await client.auth.getUser();
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
      const { data: { user } } = await client.auth.getUser();
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
    },

    // ─── SHIFTS (planning) ───
    async listShifts(etabId) {
      let q = client.from('shifts').select('*').order('date').order('debut');
      if (etabId) q = q.eq('etablissement_id', etabId);
      const { data, error } = await q;
      if (error) { console.error('[listShifts]', error); return []; }
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

    // ─── RECETTES ───
    async listRecettes(etabId) {
      let q = client.from('recettes').select('*').order('nom');
      if (etabId) q = q.eq('etablissement_id', etabId);
      const { data, error } = await q;
      if (error) { console.error('[listRecettes]', error); return []; }
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
    // PLATS (M2M avec recettes via plat_recettes)
    // ═══════════════════════════════════════════════════════════════
    async listPlats(etabId) {
      const { data, error } = await client
        .from('plats')
        .select('*, plat_recettes(id, recette_id, role, ordre)')
        .eq('etablissement_id', etabId)
        .order('ordre', { ascending: true })
        .order('nom', { ascending: true });
      if (error) { console.error('[listPlats]', error); return []; }
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
    // Stocke dans bucket 'documents' sous /recettes-photos/{etabId}/{type}-{id}.{ext}
    // Retourne une URL signée (1h) directement utilisable
    async uploadRecettePhoto({ etabId, type, id, file }) {
      if (!file) throw new Error('Aucun fichier');
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `recettes-photos/${etabId}/${type}-${id}-${Date.now()}.${ext}`;
      const { error: upErr } = await client.storage.from('documents').upload(path, file, {
        cacheControl: '3600', upsert: true,
      });
      if (upErr) throw upErr;
      // URL publique-style via signed URL longue durée (1 an)
      const { data, error } = await client.storage.from('documents').createSignedUrl(path, 60 * 60 * 24 * 365);
      if (error) throw error;
      return { path, url: data.signedUrl };
    },

    async refreshSignedUrl(path) {
      // Réobtenir une URL signée valide pour une photo existante
      if (!path || !path.startsWith('recettes-photos/')) return null;
      const { data, error } = await client.storage.from('documents').createSignedUrl(path, 60 * 60 * 24 * 365);
      if (error) return null;
      return data.signedUrl;
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
        .order('ordre', { ascending: true })
        .order('titre', { ascending: true });
      if (error) { console.error('[listSops]', error); return []; }
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
    // KIT CUISINIER — fiches techniques + références polymorphiques
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
    async listCartes(etabId) {
      let q = client.from('cartes').select('*');
      if (etabId) q = q.eq('etablissement_id', etabId);
      const { data, error } = await q;
      if (error) { console.error('[listCartes]', error); return []; }
      return (data || []).map(this.mapCarteFromDB);
    },

    async upsertCarte(carte) {
      const payload = {
        id: carte.id || ('carte-' + Date.now()),
        etablissement_id: carte.etablissementId,
        nom: carte.nom || 'Carte principale',
        date_debut: carte.dateDebut || null,
        date_fin: carte.dateFin || null,
        plats: carte.plats || [],
      };
      const { data, error } = await client.from('cartes').upsert(payload).select().single();
      if (error) throw error;
      return this.mapCarteFromDB(data);
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
      }).select().single();
      if (error) throw error;
      return data;
    },

    // ─── HACCP — Zones ───
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

    // ─── HACCP — Control templates ───
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

    // ─── HACCP — Relevés ───
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

    // ─── HACCP — Contrôles ───
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

    // ─── FICHES SALLE ───
    async listFichesSalle(etabId) {
      let q = client.from('fiches_salle').select('*').order('nom');
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
        infosService: row.infos_service || '',
        tempsPreparation: row.temps_preparation || '',
        modifiePar: row.modifie_par,
        modifie: row.updated_at ? row.updated_at.slice(0, 10) : null,
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
      return data;
    },
    async deleteFournisseur(id) {
      const { error } = await client.from('fournisseurs').delete().eq('id', id);
      if (error) throw error;
    },

    // ─── PRODUITS ───
    async listProduits(etabId) {
      let q = client.from('produits')
        .select(`*, fournisseurs(nom), produit_fournisseurs(id,fournisseur_id,prix_achat,conditionnement,quantite_cond,unite_cond,prix_unitaire,est_principal,reference,fournisseurs(nom))`)
        .order('categorie').order('nom');
      if (etabId) q = q.eq('etablissement_id', etabId);
      const { data, error } = await q;
      if (error) { console.error('[listProduits]', error); return []; }
      return (data || []).map(r => this.mapProduitFromDB(r));
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
      return data;
    },
    async deleteProduit(id) {
      const { error } = await client.from('produits').delete().eq('id', id);
      if (error) throw error;
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
      return data;
    },
    async deleteProduitFournisseur(id) {
      const { error } = await client.from('produit_fournisseurs').delete().eq('id', id);
      if (error) throw error;
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
    }
  };

  // ─────────────────────────────────────────
  // Expose
  // ─────────────────────────────────────────
  const legacySupabase = { client, auth, db, realtime };
  setLegacySB(legacySupabase);
  return legacySupabase;
}
