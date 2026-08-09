import { useCallback, useEffect, useState } from 'react';
import { authService, getLandingAuthFlags } from '../services/supabase.js';
import { getBrowserWindow } from '../legacy/legacyApi.js';

// Retire les marqueurs d'auth de la barre d'adresse, sans recharger la page :
// une fois le mot de passe changé (ou l'écran quitté), un rafraîchissement ne
// doit pas rouvrir l'écran de réinitialisation.
//
// Volontairement JAMAIS appelé au montage : supabase-js lit `#access_token=…`
// (flow implicite) et `?code=…` (flow PKCE) de façon asynchrone au démarrage.
// Nettoyer trop tôt lui retirerait le jeton sous les pieds.
function cleanAuthParamsFromUrl() {
  const browserWindow = getBrowserWindow();
  if (!browserWindow?.location || !browserWindow.history?.replaceState) return;

  try {
    const url = new URL(browserWindow.location.href);
    ['reset', 'type', 'code', 'error', 'error_code', 'error_description']
      .forEach((key) => url.searchParams.delete(key));
    const search = url.searchParams.toString();
    browserWindow.history.replaceState(null, '', url.pathname + (search ? `?${search}` : ''));
  } catch (_) {
    // URL exotique : on laisse l'adresse telle quelle, sans casser l'app.
  }
}

/**
 * Vrai quand l'app a été ouverte depuis un lien « mot de passe oublié ».
 *
 * Trois sources, cumulées parce qu'aucune n'est fiable seule :
 *  - `?reset=true` : notre marqueur, survit aux deux flows et au lien expiré ;
 *  - `#type=recovery` : le marqueur Supabase du flow implicite ;
 *  - l'événement `PASSWORD_RECOVERY`, émis après coup par supabase-js.
 *
 * `linkErrorCode` porte le cas « lien périmé ou déjà utilisé » : Supabase
 * renvoie alors sur l'app avec un simple #error=… et aucune session — sans ça
 * l'utilisateur retombe sur l'écran de connexion sans la moindre explication.
 */
export function usePasswordRecovery() {
  const flags = getLandingAuthFlags();
  const [active, setActive] = useState(() => flags.recovery || Boolean(flags.errorCode));

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      unsubscribe = authService.onAuthChange((event) => {
        if (event === 'PASSWORD_RECOVERY') setActive(true);
      });
    } catch (err) {
      console.warn('[Auth] Écoute PASSWORD_RECOVERY indisponible', err);
    }
    return () => unsubscribe();
  }, []);

  const dismiss = useCallback(() => {
    cleanAuthParamsFromUrl();
    setActive(false);
  }, []);

  return {
    active,
    linkErrorCode: flags.errorCode,
    linkErrorDescription: flags.errorDescription,
    dismiss,
  };
}
