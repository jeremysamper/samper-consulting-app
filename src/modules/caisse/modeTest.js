import { readJson, readText, removeStorageKeys, writeJson, writeText } from '../../utils/storage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Caisse v6 : mode test, propre au poste (cet appareil), jamais à la maison.
//
// Le mode se retient ici, dans le stockage local de l'appareil : un iPad en
// test n'empêche pas les autres de vendre pour de vrai. La base, elle, ne se
// fie pas à cette mémoire : un ticket de test ne se crée que si le poste a été
// passé en mode test par consultant, patron ou resp_cuisine (RPC
// caisse_test_entrer, trace au journal), et l'écran revérifie l'état du poste
// à chaque ouverture de la caisse (caisse_test_etat). Un mode expiré ou quitté
// ailleurs fait donc revenir l'écran en mode normal.
//
// Deux choses identifient le poste :
//   - son nom, tiré au hasard et gardé sur l'appareil : c'est lui que le
//     journal du mode test cite (entrée, sortie, purge) ;
//   - sa clé, que la base rend une seule fois à l'entrée en mode test et dont
//     elle ne garde que l'empreinte. Chaque ticket de test doit la présenter :
//     connaître le nom d'un poste ne suffit pas à ouvrir un ticket de test.
// ─────────────────────────────────────────────────────────────────────────────

const CLE_POSTE = 'sc_caisse_poste';
const CLE_MODE = 'sc_caisse_test';

export const ROLES_MODE_TEST = ['consultant', 'patron', 'resp_cuisine'];

function hexAleatoire(octets) {
  const tab = new Uint8Array(octets);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(tab);
  else for (let i = 0; i < octets; i += 1) tab[i] = Math.floor(Math.random() * 256);
  return Array.from(tab, (o) => o.toString(16).padStart(2, '0')).join('');
}

// Identifiant du poste : créé au premier besoin, puis stable sur l'appareil.
export function idPoste() {
  const connu = readText(CLE_POSTE, '');
  if (/^poste-[0-9a-f]{12}$/.test(connu)) return connu;
  const neuf = `poste-${hexAleatoire(6)}`;
  writeText(CLE_POSTE, neuf);
  return neuf;
}

// Nom court du poste, pour le journal : « Poste 3F2A ». Les purges
// automatiques n'ont pas de poste.
export function libellePoste(poste) {
  const m = /^poste-([0-9a-f]{12})$/.exec(String(poste || ''));
  return m ? m[1].slice(-4).toUpperCase() : null;
}

// Le mode test retenu sur cet appareil pour cet établissement : la clé du
// poste, ou null si l'appareil n'est pas en mode test pour cette maison.
export function lireModeTest(etablissementId) {
  const etat = readJson(CLE_MODE, null);
  if (!etablissementId || !etat || etat.etablissementId !== etablissementId) return null;
  return typeof etat.cle === 'string' && etat.cle ? etat.cle : null;
}

export function retenirModeTest(etablissementId, cle) {
  writeJson(CLE_MODE, { etablissementId, cle, depuis: new Date().toISOString() });
}

export function oublierModeTest() {
  removeStorageKeys([CLE_MODE]);
}
