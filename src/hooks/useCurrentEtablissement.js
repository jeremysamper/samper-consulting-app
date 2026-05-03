import { useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!user) {
        setEtablissements([]);
        setCurrentId(null);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const [rows, savedId] = await Promise.all([
          etablissementService.listForUser(user),
          settingsService.getUserSetting(SETTING_KEY).catch(() => null)
        ]);

        if (!mounted) return;

        const legacyId = readLegacyCurrentEtablissementId();
        const preferredId = savedId || legacyId;
        const fallbackId = rows[0]?.id || null;
        const nextId = rows.some((row) => row.id === preferredId) ? preferredId : fallbackId;

        setEtablissements(rows);
        setCurrentId(nextId);
      } catch (err) {
        if (mounted) setError(err);
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
