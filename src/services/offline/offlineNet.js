// ─────────────────────────────────────────────────────────────
// Primitives communes aux files hors-ligne (pointage, saisie d'inventaire).
//
// Extraites de punchSync : la file d'inventaire a exactement les mêmes
// besoins, et deux copies d'une règle aussi fine que « qu'est-ce qu'une
// erreur réseau » divergent immanquablement.
// ─────────────────────────────────────────────────────────────

// Erreur réseau (fetch échoué, timeout) : pas de code PostgREST. Une erreur
// métier ou d'infrastructure porte toujours un code (P0001, PGRST..., 22...).
// La distinction commande tout le reste : une erreur réseau met en file et
// n'est jamais comptée comme tentative, une erreur métier finit par abandonner.
export function isNetworkError(error) {
  return !error?.code;
}

// Course en cas de réseau lent : au-delà de `ms`, l'écriture part en file.
// Si l'appel online aboutit malgré tout côté serveur, le rejeu de l'élément mis
// en file est sans effet (idempotence par client_uuid) : zéro doublon possible.
export function withTimeout(promise, ms = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('réseau trop lent, écriture mise en file')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

export function generateUuid() {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  // Fallback v4 (vieux WebView) : aléa suffisant pour une clé d'idempotence.
  const bytes = new Uint8Array(16);
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
