import { useCallback, useEffect, useRef } from 'react';

// Debounce un callback : l'appel effectif est différé de `delay` ms après le dernier
// déclenchement. Retourne [debounced, flush, cancel].
//   - debounced(...args) : planifie l'appel
//   - flush()            : exécute immédiatement l'appel en attente, s'il y en a un
//   - cancel()           : annule l'appel en attente sans l'exécuter
export function useDebouncedCallback(callback, delay = 400) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const timerRef = useRef(null);
  const argsRef = useRef(null);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    argsRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      const args = argsRef.current;
      argsRef.current = null;
      if (args) callbackRef.current(...args);
    }
  }, []);

  const debounced = useCallback((...args) => {
    argsRef.current = args;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      argsRef.current = null;
      callbackRef.current(...args);
    }, delay);
  }, [delay]);

  useEffect(() => cancel, [cancel]);

  return [debounced, flush, cancel];
}
