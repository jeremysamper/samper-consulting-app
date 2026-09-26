import { useEffect, useMemo, useRef, useState } from 'react';
import { authService, etablissementService, invalidateBootRead, settingsService } from '../services/supabase.js';
import { dbService } from '../services/dbService.js';
import { readJson } from '../utils/storage.js';
import { useResumeRefresh } from './useResumeRefresh.js';

const SETTING_KEY = 'current_etab_id';
const LEGACY_STORAGE_KEY = 'sc_current_etab';
const RETRY_DELAYS_MS = [2000, 4000, 8000, 15000, 30000];

function readLegacyCurrentEtablissementId() {
  return readJson(LEGACY_STORAGE_KEY, null);
}

// Comparaison champ à champ d'un établissement mappé (valeurs plates, sauf la
// liste modulesActifs). Sert à garder le MÊME objet quand une relecture ne
// change rien : les modules gardés montés dépendent de l'objet établissement,
// un nouvel objet identique les ferait tous relire leurs données.
function sameEtablissement(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const va = a[key];
    const vb = b[key];
    if (Array.isArray(va) || Array.isArray(vb)) {
      if (!Array.isArray(va) || !Array.isArray(vb) || va.join('|') !== vb.join('|')) return false;
    } else if (va !== vb) {
      return false;
    }
  }
  return true;
}

function keepUnchanged(prev, rows) {
  const next = rows.map((row) => {
    const old = prev.find((etab) => etab.id === row.id);
    return old && sameEtablissement(old, row) ? old : row;
  });
  const identical = next.length === prev.length && next.every((etab, i) => etab === prev[i]);
  return identical ? prev : next;
}

export function useCurrentEtablissement(user, { bridgeReady = true } = {}) {
  const [etablissements, setEtablissements] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Choix explicite fait PENDANT la session : prioritaire sur la valeur DB.
  // Sans ça, un re-run de load() (profil ré-émis par Supabase au refocus de
  // l'onglet) relit current_etab_id en DB et peut ÉCRASER un changement
  // d'établissement dont l'écriture n'a pas encore abouti - l'UI revient
  // alors sur l'ancien établissement jusqu'au redémarrage de l'app.
  const selectedIdRef = useRef(null);
  // Premier chargement terminé : les re-runs suivants se font en arrière-plan
  // (pas de setLoading(true) → les modules ne sont pas démontés/remontés).
  const hasLoadedRef = useRef(false);
  const userIdRef = useRef(null);
  const loadRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    let retryTimer = null;
    let retryStep = 0;

    // Premier chargement en échec (réseau pas encore remonté au réveil, JWT en
    // cours de refresh) : sans établissement, LegacyModuleHost remplace TOUS les
    // modules par une alerte. On réessaie donc seul, de plus en plus espacé,
    // au lieu de laisser un écran sans issue jusqu'au redémarrage de l'app.
    const scheduleRetry = () => {
      if (retryTimer) globalThis.clearTimeout(retryTimer);
      const delay = RETRY_DELAYS_MS[Math.min(retryStep, RETRY_DELAYS_MS.length - 1)];
      retryStep += 1;
      retryTimer = globalThis.setTimeout(() => { retryTimer = null; if (mounted) load(); }, delay);
    };

    async function load() {
      if (retryTimer) { globalThis.clearTimeout(retryTimer); retryTimer = null; }
      if (!user) {
        selectedIdRef.current = null;
        hasLoadedRef.current = false;
        userIdRef.current = null;
        setEtablissements([]);
        setCurrentId(null);
        setLoading(false);
        return;
      }

      // Changement d'utilisateur (re-login) : on repart de zéro.
      if (userIdRef.current !== user.id) {
        selectedIdRef.current = null;
        hasLoadedRef.current = false;
        userIdRef.current = user.id;
      }

      if (!hasLoadedRef.current) setLoading(true);

      try {
        let [rows, savedId] = await Promise.all([
          etablissementService.listForUser(user),
          settingsService.getUserSetting(SETTING_KEY).catch(() => null)
        ]);

        if (!mounted) return;

        // Liste VIDE au premier chargement : sans session (JWT pas encore
        // rafraîchi, démarrage sur le dernier profil connu), la requête est partie
        // avec la clé anonyme et c'est la RLS qui a rendu du vide - à ne pas
        // prendre pour « aucun établissement ». La session n'est lue QUE dans ce
        // cas : hors-ligne avec un JWT expiré, chaque getSession() coûte un cycle
        // de refresh complet, qu'on ne paie pas quand le cache du service worker
        // a déjà rendu la liste (l'app doit démarrer dessus).
        if (!rows.length && !hasLoadedRef.current) {
          const session = await authService.getSession().catch(() => null);
          if (!mounted) return;
          if (!session) throw new Error('Reconnexion en cours...');
          // La liste vide a pu partir en anonyme juste avant que le refresh
          // aboutisse : une seule relecture, avec un JWT confirmé cette fois (le
          // cache boot rendrait sinon la même liste vide pendant 8 s).
          invalidateBootRead('etablissements:all');
          rows = await etablissementService.listForUser(user);
          if (!mounted) return;
        }

        const legacyId = readLegacyCurrentEtablissementId();
        const preferredId = selectedIdRef.current || savedId || legacyId;
        const fallbackId = rows[0]?.id || null;
        const nextId = rows.some((row) => row.id === preferredId) ? preferredId : fallbackId;

        setEtablissements((prev) => keepUnchanged(prev, rows));
        setCurrentId(nextId);
        setError(null);
        hasLoadedRef.current = true;
        retryStep = 0;
      } catch (err) {
        // Une erreur sur un re-chargement silencieux ne doit pas remplacer
        // toute l'app par un écran d'erreur : on garde l'état courant.
        if (mounted && !hasLoadedRef.current) {
          setError(err);
          scheduleRetry();
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadRef.current = load;
    load();

    return () => {
      mounted = false;
      loadRef.current = null;
      if (retryTimer) globalThis.clearTimeout(retryTimer);
    };
  }, [user]);

  // Fiche d'un établissement modifiée (modules activés, nom, couleur…) :
  // relecture silencieuse, sur cet appareil comme sur ceux de la brigade. Sans
  // ça, le menu et les modules gardaient les réglages de la connexion jusqu'au
  // redémarrage de l'app. On ne relit QUE la liste : l'établissement choisi
  // n'est pas remis en jeu (pas de relecture de current_etab_id).
  useEffect(() => {
    if (!user || !bridgeReady) return undefined;
    const realtime = dbService.getRealtime();
    if (!realtime?.subscribeReload) return undefined;
    let active = true;
    const off = realtime.subscribeReload('etablissements', async () => {
      if (!hasLoadedRef.current) return;
      try {
        const rows = await etablissementService.listForUser(user);
        // Liste vide = lecture en échec ou session en cours de refresh : on
        // garde l'état courant plutôt que de vider le sélecteur.
        if (!active || !rows.length) return;
        setEtablissements((prev) => keepUnchanged(prev, rows));
      } catch {
        // Relecture de confort : l'état courant reste valable.
      }
    });
    return () => { active = false; off(); };
  }, [user, bridgeReady]);

  // Réveil de l'appareil / retour du réseau : on retente tout de suite un
  // premier chargement resté en échec, sans attendre le prochain palier.
  useResumeRefresh(() => {
    if (!hasLoadedRef.current && loadRef.current) loadRef.current();
  });

  function retry() {
    if (loadRef.current) loadRef.current();
  }

  const current = useMemo(
    () => etablissements.find((etablissement) => etablissement.id === currentId) || null,
    [currentId, etablissements]
  );

  async function selectEtablissement(id) {
    // Optimiste : l'UI bascule immédiatement, la persistance suit.
    selectedIdRef.current = id;
    setCurrentId(id);
    await settingsService.setUserSetting(SETTING_KEY, id);
  }

  return {
    etablissements,
    current,
    currentId,
    loading,
    error,
    retry,
    selectEtablissement
  };
}
