export function getBrowserWindow() {
  return typeof window === 'undefined' ? null : window;
}

export function readLegacyGlobal(name) {
  return getBrowserWindow()?.[name] || null;
}

export function writeLegacyGlobal(name, value) {
  const browserWindow = getBrowserWindow();
  if (browserWindow) browserWindow[name] = value;
}

export function removeLegacyGlobal(name) {
  const browserWindow = getBrowserWindow();
  if (!browserWindow) return;

  try {
    delete browserWindow[name];
  } catch {
    browserWindow[name] = undefined;
  }
}

let legacySBBridge = null;
let legacyStorageBridge = { read: null, write: null };
let hydrateFromSupabaseBridge = null;

export function setLegacySB(value) {
  legacySBBridge = value || null;
  writeLegacyGlobal('SB', legacySBBridge);
}

export function getLegacySB() {
  return legacySBBridge || readLegacyGlobal('SB');
}

export function getLegacyDb() {
  return getLegacySB()?.db || null;
}

export function getLegacyRealtime() {
  return getLegacySB()?.realtime || null;
}

export function getHydrateFromSupabase() {
  const hydrate = hydrateFromSupabaseBridge || readLegacyGlobal('hydrateFromSupabase');
  return typeof hydrate === 'function' ? hydrate : null;
}

export function setHydrateFromSupabase(value) {
  hydrateFromSupabaseBridge = typeof value === 'function' ? value : null;
  writeLegacyGlobal('hydrateFromSupabase', hydrateFromSupabaseBridge);
}

export function readLegacyStorage(key, fallback) {
  if (typeof legacyStorageBridge.read === 'function') {
    return legacyStorageBridge.read(key, fallback);
  }

  const scRead = readLegacyGlobal('scRead');
  if (typeof scRead !== 'function') return fallback;
  return scRead(key, fallback);
}

export function writeLegacyStorage(key, value) {
  if (typeof legacyStorageBridge.write === 'function') {
    legacyStorageBridge.write(key, value);
    return;
  }

  const scWrite = readLegacyGlobal('scWrite');
  if (typeof scWrite === 'function') scWrite(key, value);
}

export function setLegacyStorageBridge({ read, write } = {}) {
  legacyStorageBridge = {
    read: typeof read === 'function' ? read : null,
    write: typeof write === 'function' ? write : null
  };

  writeLegacyGlobal('scRead', legacyStorageBridge.read);
  writeLegacyGlobal('scWrite', legacyStorageBridge.write);
}

export function confirmLegacy(message) {
  const browserWindow = getBrowserWindow();
  return browserWindow ? browserWindow.confirm(message) : false;
}

export function alertLegacy(message) {
  const browserWindow = getBrowserWindow();
  if (browserWindow) {
    browserWindow.alert(message);
    return;
  }

  console.warn(message);
}

export function notifyLegacy(message, type = 'info') {
  const notify = readLegacyGlobal('notify');
  if (typeof notify === 'function') {
    notify(message, type);
    return;
  }

  if (type === 'error') {
    console.error(message);
  } else {
    console.info(message);
  }
}
