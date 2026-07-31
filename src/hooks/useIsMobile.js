import { useEffect, useState } from 'react';
import { getBrowserWindow } from '../legacy/legacyApi.js';

// Présentation mobile ou desktop, mesurée par MEDIA QUERY et jamais par
// window.innerWidth.
//
// Sur iPad, innerWidth suit le viewport VISUEL : un pincer-pour-zoomer, le
// clavier logiciel, le passage en Split View ou un simple retour d'arrière-plan
// le renvoient plus petit qu'il ne l'est - parfois 0 le temps d'un événement
// resize. Une seule mesure aberrante faisait basculer toute l'app en
// présentation mobile, et comme aucun autre resize ne suivait, elle y restait
// jusqu'au rechargement. Une media query, elle, s'évalue sur le viewport de
// MISE EN PAGE : le zoom ne la déplace pas et elle ne repasse jamais par 0.
export function useIsMobile(breakpoint = 768) {
  const query = `(max-width: ${breakpoint - 0.02}px)`;

  const [mobile, setMobile] = useState(() => {
    const browserWindow = getBrowserWindow();
    if (!browserWindow) return false;
    if (browserWindow.matchMedia) return browserWindow.matchMedia(query).matches;
    // Repli sans matchMedia : une largeur nulle n'est pas une mesure, on l'ignore.
    return browserWindow.innerWidth > 0 ? browserWindow.innerWidth < breakpoint : false;
  });

  useEffect(() => {
    const browserWindow = getBrowserWindow();
    if (!browserWindow) return undefined;

    if (browserWindow.matchMedia) {
      const mq = browserWindow.matchMedia(query);
      const handler = (e) => setMobile(e.matches);
      setMobile(mq.matches);
      // addEventListener n'existe sur MediaQueryList qu'à partir de Safari 14.
      if (mq.addEventListener) {
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
      }
      mq.addListener(handler);
      return () => mq.removeListener(handler);
    }

    const handler = () => {
      if (browserWindow.innerWidth > 0) setMobile(browserWindow.innerWidth < breakpoint);
    };
    handler();
    browserWindow.addEventListener('resize', handler);
    return () => browserWindow.removeEventListener('resize', handler);
  }, [query, breakpoint]);

  return mobile;
}
