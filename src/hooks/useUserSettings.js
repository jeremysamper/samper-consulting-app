import { useCallback, useEffect, useState } from 'react';
import { settingsService } from '../services/supabase.js';

export function useUserSettings(keys = []) {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const keySignature = keys.join('|');

  useEffect(() => {
    let mounted = true;
    const requestedKeys = keySignature ? keySignature.split('|') : [];

    async function load() {
      setLoading(true);

      try {
        const entries = await Promise.all(
          requestedKeys.map(async (key) => [key, await settingsService.getUserSetting(key)])
        );

        if (mounted) setSettings(Object.fromEntries(entries));
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
  }, [keySignature]);

  const setSetting = useCallback(async (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
    await settingsService.setUserSetting(key, value);
  }, []);

  return {
    settings,
    loading,
    error,
    setSetting
  };
}
