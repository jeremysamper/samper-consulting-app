// ─────────────────────────────────────────────────────────────────────────────
// Badgeuse : ce que l'appareil garde (lot L6, 22.11.2026). Sans import de la
// base : main.jsx le lit avant de choisir entre la borne et l'app.
// ─────────────────────────────────────────────────────────────────────────────

const CLE_BORNE = 'sc_borne_pointage';
export const CLE_FILE = 'sc_borne_file';
// Sortie de la borne pour cette visite seulement (onglet ou app rouverts : la
// borne revient).
const CLE_SORTIE = 'sc_borne_sortie';

export const lire = (stockage, cle) => {
  try { return JSON.parse(stockage.getItem(cle) || 'null'); } catch { return null; }
};

export function borneDeCetAppareil() {
  if (typeof window === 'undefined') return null;
  const b = lire(window.localStorage, CLE_BORNE);
  return b && typeof b.jeton === 'string' && b.jeton.length === 64 ? b : null;
}

export function retenirBorne(borne) {
  window.localStorage.setItem(CLE_BORNE, JSON.stringify({
    id: borne.id, jeton: borne.jeton, nom: borne.nom || '', etablissementId: borne.etablissement_id || borne.etablissementId || null, etablissementNom: borne.etablissementNom || '',
  }));
}

export function oublierBorne() {
  window.localStorage.removeItem(CLE_BORNE);
  window.localStorage.removeItem(CLE_FILE);
}

// L'écran de la borne s'ouvre au lancement quand l'appareil est une borne,
// sauf si l'on en est sorti pendant cette visite.
export function borneAuLancement() {
  if (!borneDeCetAppareil()) return false;
  try { return window.sessionStorage.getItem(CLE_SORTIE) !== '1'; } catch { return true; }
}

export function sortirDeLaBorne() {
  try { window.sessionStorage.setItem(CLE_SORTIE, '1'); } catch { /* stockage refusé : la borne revient */ }
}

export function revenirALaBorne() {
  try { window.sessionStorage.removeItem(CLE_SORTIE); } catch { /* rien */ }
}
