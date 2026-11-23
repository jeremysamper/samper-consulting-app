import { useEffect, useRef } from 'react';
import { getBrowserWindow } from '../legacy/legacyApi.js';
import { readJson, removeStorageKeys } from '../utils/storage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Côté module d'un raccourci de navigationService (ouvrirFilEquipe, ouvrirSop,
// ouvrirDossier) : la clé ponctuelle est lue au montage puis effacée, et
// l'événement est écouté pour un module déjà monté (gardé en vie masqué).
// `prendre(demande)` reçoit la demande une seule fois. `cle` à null : le
// composant n'écoute pas (une autre instance du même écran est destinataire).
// ─────────────────────────────────────────────────────────────────────────────

export function useDemandeOuverture(cle, evenement, prendre) {
  const ref = useRef(prendre);
  ref.current = prendre;
  useEffect(() => {
    // Sans clé (écran qui n'est pas le destinataire), rien n'est lu ni effacé.
    if (!cle) return undefined;
    const lire = (d) => {
      removeStorageKeys([cle]);
      if (d && typeof d === 'object') ref.current(d);
    };
    lire(readJson(cle));
    const w = getBrowserWindow();
    if (!w) return undefined;
    const surEvenement = (e) => lire(e?.detail);
    w.addEventListener(evenement, surEvenement);
    return () => w.removeEventListener(evenement, surEvenement);
  }, [cle, evenement]);
}
