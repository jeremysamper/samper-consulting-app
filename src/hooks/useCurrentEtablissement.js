import { useEffect, useMemo, useRef, useState } from 'react';
import { etablissementService, settingsService } from '../services/supabase.js';
import { readJson } from '../utils/storage.js';

const SETTING_KEY = 'current_etab_id';
const LEGACY_STORAGE_KEY = 'sc_current_etab';

function readLegacyCurrentEtablissementId() {
  return readJson(LEGACY_STORAGE_KEY, null);
}

export function useCurrentEtablissement(user) {
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

  useEffect(() => {
    let mounted = true;

    async function load() {
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
        const [rows, savedId] = await Promise.all([
          etablissementService.listForUser(user),
          settingsService.getUserSetting(SETTING_KEY).catch(() => null)
        ]);

        if (!mounted) return;

        const legacyId = readLegacyCurrentEtablissementId();
        const preferredId = selectedIdRef.current || savedId || legacyId;
        const fallbackId = rows[0]?.id || null;
        const nextId = rows.some((row) => row.id === preferredId) ? preferredId : fallbackId;

        setEtablissements(rows);
        setCurrentId(nextId);
        setError(null);
        hasLoadedRef.current = true;
      } catch (err) {
        // Une erreur sur un re-chargement silencieux ne doit pas remplacer
        // toute l'app par un écran d'erreur : on garde l'état courant.
        if (mounted && !hasLoadedRef.current) setError(err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [user]);

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
    selectEtablissement
  };
}
