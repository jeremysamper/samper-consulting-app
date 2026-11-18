// ================================================================
// Fermetures de la maison (reglages_maison.fermetures, 18.11.2026).
//
// Copie de maisonFermee (src/utils/reglagesMaison.js), sans les services :
// une règle d'alerte liée au jour (pointage manquant, relevé HACCP manquant,
// ventes inactives) ne s'évalue pas un jour où la maison est fermée. Les cas
// de src/utils/reglagesMaison.test.mjs (CAS_FERMETURES, service null) valent
// pour cette copie.
//
// Lecture en échec ou table absente (migration pas appliquée) : aucune
// fermeture, les alertes partent comme avant.
// ================================================================

export const REGLES_DU_JOUR = new Set(['pointage_manquant', 'haccp_manquant', 'ventes_inactives']);

type Fermetures = { jours_fermes?: unknown; periodes?: unknown };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function jourIsoDe(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number);
  const j = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return j === 0 ? 7 : j;
}

export function maisonFermee(f: Fermetures | null | undefined, dateISO: string): boolean {
  if (!f || typeof f !== 'object' || !DATE.test(dateISO)) return false;
  const jours = Array.isArray(f.jours_fermes) ? f.jours_fermes.map(Number) : [];
  if (jours.includes(jourIsoDe(dateISO))) return true;
  const periodes = Array.isArray(f.periodes) ? f.periodes : [];
  return periodes.some((p: { du?: unknown; au?: unknown }) => (
    typeof p?.du === 'string' && typeof p?.au === 'string' && DATE.test(p.du) && DATE.test(p.au)
    && p.du <= dateISO && dateISO <= p.au
  ));
}

// Date du jour à Zurich, « AAAA-MM-JJ ».
export function aujourdhuiZurich(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Fermetures de toutes les maisons, lues une fois par passage.
// deno-lint-ignore no-explicit-any
export async function lireFermetures(sb: any): Promise<Map<string, Fermetures>> {
  const carte = new Map<string, Fermetures>();
  const { data, error } = await sb.from('reglages_maison').select('etablissement_id, fermetures');
  if (error) {
    console.warn('[alerts] fermetures non lues, aucune appliquée :', error.message);
    return carte;
  }
  for (const r of data ?? []) carte.set(r.etablissement_id, r.fermetures);
  return carte;
}
