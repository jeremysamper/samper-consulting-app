import { useEffect, useState } from 'react';
import { getBrowserWindow } from '../legacy/legacyApi.js';

export function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(() => {
    const browserWindow = getBrowserWindow();
    return browserWindow ? browserWindow.innerWidth < breakpoint : false;
  });

  useEffect(() => {
    const browserWindow = getBrowserWindow();
    if (!browserWindow) return undefined;

    const handler = () => setMobile(browserWindow.innerWidth < breakpoint);
    handler();
    browserWindow.addEventListener('resize', handler);
    return () => browserWindow.removeEventListener('resize', handler);
  }, [breakpoint]);

  return mobile;
}
