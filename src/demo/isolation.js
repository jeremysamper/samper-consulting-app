// Mode démo : isole la page du reste de l'origine.
//
// /demo est servi sur le même domaine que l'application de production. Sans
// cette isolation, la démo écrirait dans le localStorage de la vraie app
// (session, établissement, préférences), dans ses files hors ligne
// (IndexedDB), et viderait ses caches de service worker à la déconnexion.
// Ici, tout est détourné vers le sessionStorage de l'onglet, sous un préfixe
// propre à la démo : rien ne survit à la fermeture de l'onglet, et rien de ce
// qu'écrit la démo n'est jamais lu par la vraie app.

export const PREFIXE = 'samper-demo:';

function memoire() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

// Le sessionStorage réel de l'onglet, ou une mémoire si le navigateur le refuse
// (iframe tierce avec stockage bloqué).
function stockageReel() {
  try {
    const s = window.sessionStorage;
    const essai = PREFIXE + 'essai';
    s.setItem(essai, '1');
    s.removeItem(essai);
    return s;
  } catch {
    return memoire();
  }
}

export const STOCKAGE = stockageReel();

// Un Storage préfixé, utilisable comme localStorage (méthodes, clés, longueur,
// accès par propriété et Object.keys).
function storagePrefixe(prefixe) {
  const cles = () => {
    const out = [];
    for (let i = 0; i < STOCKAGE.length; i += 1) {
      const k = STOCKAGE.key(i);
      if (k && k.startsWith(prefixe)) out.push(k.slice(prefixe.length));
    }
    return out;
  };
  const api = {
    getItem: (k) => STOCKAGE.getItem(prefixe + String(k)),
    setItem: (k, v) => {
      try { STOCKAGE.setItem(prefixe + String(k), String(v)); } catch (e) { console.warn('[Démo] stockage plein', e); }
    },
    removeItem: (k) => STOCKAGE.removeItem(prefixe + String(k)),
    clear: () => cles().forEach((k) => STOCKAGE.removeItem(prefixe + k)),
    key: (i) => cles()[i] ?? null,
    get length() { return cles().length; },
  };
  return new Proxy(api, {
    get(cible, prop) {
      if (typeof prop === 'symbol') return cible[prop];
      if (prop in cible) return cible[prop];
      return cible.getItem(prop);
    },
    set(cible, prop, valeur) { cible.setItem(prop, valeur); return true; },
    deleteProperty(cible, prop) { cible.removeItem(prop); return true; },
    has(cible, prop) { return prop in cible || cible.getItem(prop) !== null; },
    ownKeys() { return cles(); },
    getOwnPropertyDescriptor(cible, prop) {
      const v = cible.getItem(prop);
      return v === null ? undefined : { value: v, writable: true, enumerable: true, configurable: true };
    },
  });
}

function remplacer(objet, nom, valeur) {
  try {
    Object.defineProperty(objet, nom, { configurable: true, enumerable: true, get: () => valeur });
    return objet[nom] === valeur;
  } catch {
    return false;
  }
}

// IndexedDB : chaque base ouverte par la démo prend le préfixe, la vraie app ne
// les ouvre jamais (files de pointage et d'inventaire hors ligne).
function indexedDbPrefixe() {
  const reel = window.indexedDB;
  if (!reel) return null;
  return {
    open: (nom, version) => (version == null ? reel.open(PREFIXE + nom) : reel.open(PREFIXE + nom, version)),
    deleteDatabase: (nom) => reel.deleteDatabase(PREFIXE + nom),
    databases: async () => ((await reel.databases?.()) || [])
      .filter((d) => d.name?.startsWith(PREFIXE))
      .map((d) => ({ ...d, name: d.name.slice(PREFIXE.length) })),
    cmp: (a, b) => reel.cmp(a, b),
  };
}

// Supprime les bases IndexedDB de la démo (réinitialisation).
let indexedDbReel = null;

export async function effacerBasesLocales() {
  try {
    const liste = (await indexedDbReel?.databases?.()) || [];
    await Promise.all(liste.filter((d) => d.name?.startsWith(PREFIXE)).map((d) => new Promise((ok) => {
      const r = indexedDbReel.deleteDatabase(d.name);
      r.onsuccess = ok; r.onerror = ok; r.onblocked = ok;
    })));
  } catch { /* rien à effacer */ }
}

// Cache Storage : la vraie app y range les lectures de secours de son service
// worker ; la démo ne lit ni ne vide rien.
const cachesNeutres = {
  open: async () => ({ match: async () => undefined, matchAll: async () => [], put: async () => {}, add: async () => {}, addAll: async () => {}, delete: async () => false, keys: async () => [] }),
  match: async () => undefined,
  has: async () => false,
  delete: async () => false,
  keys: async () => [],
};

export function installerIsolation() {
  indexedDbReel = window.indexedDB || null;
  const ls = storagePrefixe(PREFIXE + 'ls:');
  const ss = storagePrefixe(PREFIXE + 'ss:');
  const okLs = remplacer(window, 'localStorage', ls);
  remplacer(window, 'sessionStorage', ss);
  const idb = indexedDbPrefixe();
  if (idb) remplacer(window, 'indexedDB', idb);
  if ('caches' in window) remplacer(window, 'caches', cachesNeutres);

  // Canaux entre onglets et verrous : supabase-js diffuse connexion et
  // déconnexion aux onglets de la même origine (BroadcastChannel nommé comme
  // sa clé de stockage) et sérialise ses opérations par navigator.locks. Sans
  // préfixe, une déconnexion dans la démo déconnecterait un onglet de la vraie
  // application ouvert à côté.
  const CanalReel = window.BroadcastChannel;
  if (CanalReel) {
    class CanalDemo extends CanalReel {
      constructor(nom) { super(PREFIXE + String(nom)); }
    }
    window.BroadcastChannel = CanalDemo;
  }
  const verrous = navigator.locks;
  if (verrous?.request) {
    const demander = verrous.request.bind(verrous);
    const interroger = verrous.query?.bind(verrous);
    try {
      Object.defineProperty(verrous, 'request', { configurable: true, value: (nom, ...reste) => demander(PREFIXE + String(nom), ...reste) });
      if (interroger) {
        Object.defineProperty(verrous, 'query', {
          configurable: true,
          value: async () => {
            const etat = await interroger();
            const garder = (l) => String(l.name || '').startsWith(PREFIXE);
            return { held: (etat.held || []).filter(garder), pending: (etat.pending || []).filter(garder) };
          },
        });
      }
    } catch { /* navigateur sans verrous modifiables : supabase-js retombe sur son verrou en mémoire */ }
  }

  // Aucun service worker pour la démo : ni enregistrement, ni abonnement push.
  const sw = navigator.serviceWorker;
  if (sw) {
    const refus = () => Promise.reject(new Error('Indisponible dans la démo.'));
    try { Object.defineProperty(sw, 'register', { configurable: true, value: refus }); } catch { /* ignore */ }
    try { Object.defineProperty(sw, 'getRegistration', { configurable: true, value: async () => undefined }); } catch { /* ignore */ }
    try { Object.defineProperty(sw, 'getRegistrations', { configurable: true, value: async () => [] }); } catch { /* ignore */ }
  }
  if (!okLs) {
    // Navigateur qui refuse le remplacement : la démo ne doit pas continuer,
    // elle écrirait dans le stockage de la vraie app.
    throw new Error('Isolation du stockage impossible dans ce navigateur.');
  }
}

// Efface tout ce que la démo a écrit dans l'onglet.
export function effacerStockageDemo() {
  const cles = [];
  for (let i = 0; i < STOCKAGE.length; i += 1) {
    const k = STOCKAGE.key(i);
    if (k && k.startsWith(PREFIXE)) cles.push(k);
  }
  cles.forEach((k) => STOCKAGE.removeItem(k));
}
