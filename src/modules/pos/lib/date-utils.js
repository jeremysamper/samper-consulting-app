/**
 * date-utils — Utilitaires de dates pour le module POS
 *
 * Toutes les dates manipulées sont des strings ISO YYYY-MM-DD.
 * Le timezone de l'établissement est utilisé pour déterminer "aujourd'hui".
 */

// ── Aujourd'hui dans le timezone de l'établissement ──────────────────────────

/**
 * Retourne la date locale (YYYY-MM-DD) dans le timezone donné.
 * @param {string} tz  Ex: 'Europe/Zurich'
 * @returns {string}   Ex: '2026-05-27'
 */
export function todayInTz(tz) {
  // fr-CA produit un format YYYY-MM-DD nativement
  return new Intl.DateTimeFormat('fr-CA', { timeZone: tz }).format(new Date());
}

// ── Arithmétique de dates (strings YYYY-MM-DD) ───────────────────────────────

/**
 * Ajoute N jours à une date ISO.
 * @param {string} dateStr  'YYYY-MM-DD'
 * @param {number} n        Nombre de jours (peut être négatif)
 * @returns {string}
 */
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return formatISO(dt);
}

/**
 * Retourne le jour de semaine (0=dim, 1=lun … 6=sam) d'une date ISO.
 * Parsing explicite en heure locale pour éviter le décalage UTC.
 * @param {string} dateStr  'YYYY-MM-DD'
 * @returns {number}
 */
export function dowFromDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

// ── Formatage ─────────────────────────────────────────────────────────────────

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MOIS  = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
               'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/**
 * Formate une date ISO en label long : "Mardi 27 mai 2026"
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${JOURS[dt.getDay()]} ${d} ${MOIS[m - 1]} ${y}`;
}

/**
 * Formate une plage de dates en label court : "du 17 au 23 mai 2026"
 * Si les deux dates sont dans le même mois, le mois n'est mentionné qu'une fois.
 * @param {string} from  YYYY-MM-DD (inclus)
 * @param {string} to    YYYY-MM-DD (inclus)
 * @returns {string}
 */
export function formatRangeLabel(from, to) {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);

  if (fm === tm && fy === ty) {
    return `du ${fd} au ${td} ${MOIS[fm - 1]} ${fy}`;
  }
  return `du ${fd} ${MOIS[fm - 1]} au ${td} ${MOIS[tm - 1]} ${ty}`;
}

/**
 * Formate une date ISO en "27 mai 2026".
 * @param {string} dateStr
 * @returns {string}
 */
export function formatShortDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MOIS[m - 1]} ${y}`;
}

// ── Interne ───────────────────────────────────────────────────────────────────

function formatISO(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
