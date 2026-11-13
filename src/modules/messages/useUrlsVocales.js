import React from 'react';
import { dbService } from '../../services/dbService.js';
import { estVocal } from './vocal.js';

// URL signées des vocaux d'un fil (valables une heure côté stockage, gardées
// 50 minutes ici). Une seule requête pour tous les vocaux du fil ouvert qui
// n'en ont pas encore, aucune pour un fil sans vocal. Elles sont demandées à
// l'ouverture du fil pour que « Écouter » lance la lecture dans le geste
// même : Safari refuse une lecture lancée après une attente réseau.
const GARDE_MS = 50 * 60 * 1000;
const cache = new Map();
const enVol = new Map();

const valide = (e) => Boolean(e && e.expire > Date.now());
const urlVocale = (chemin) => (valide(cache.get(chemin)) ? cache.get(chemin).url : null);

// Rend la promesse des URL encore attendues, ou null quand toutes sont déjà
// en cache : rien à attendre, rien à redessiner.
function demander(chemins) {
  const bridge = dbService.getBridge();
  const manquants = chemins.filter((c) => !valide(cache.get(c)) && !enVol.has(c));
  if (manquants.length && bridge?.db?.getPrivateVoiceUrls) {
    const p = Promise.resolve(bridge.db.getPrivateVoiceUrls(manquants)).then((urls) => {
      const expire = Date.now() + GARDE_MS;
      Object.entries(urls || {}).forEach(([c, url]) => { if (url) cache.set(c, { url, expire }); });
    }).finally(() => { manquants.forEach((c) => enVol.delete(c)); });
    manquants.forEach((c) => enVol.set(c, p));
  }
  const attentes = chemins.map((c) => enVol.get(c)).filter(Boolean);
  return attentes.length ? Promise.all(attentes) : null;
}

export function useUrlsVocales(thread) {
  const [, rafraichir] = React.useReducer((n) => n + 1, 0);
  const chemins = React.useMemo(() => thread.filter(estVocal).map((m) => m.audioPath), [thread]);

  React.useEffect(() => {
    const attente = demander(chemins);
    if (!attente) return undefined;
    let actif = true;
    attente.then(() => { if (actif) rafraichir(); }).catch(() => { /* un toucher sur Écouter redemandera */ });
    return () => { actif = false; };
  }, [chemins]);

  // Repli quand l'URL manque encore (réseau lent, URL expirée) : demandée au
  // toucher, puis rendue.
  const charger = React.useCallback(async (chemin) => {
    await demander([chemin]);
    rafraichir();
    return urlVocale(chemin);
  }, []);

  return { urlDe: urlVocale, charger };
}
