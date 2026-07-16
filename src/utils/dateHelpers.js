// Utilitaires de manipulation de dates - toujours en heure locale (jamais UTC).
// Utilisé par les modules Prévisions, Brigade, etc.

/**
 * Parse une date ISO "YYYY-MM-DD" en Date locale.
 * new Date('2026-05-25') parse en UTC → décalage possible en soirée.
 * Cette fonction évite ce piège.
 */
export function parseLocalDate(str) {
  if (!str) return new Date();
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Retourne le lundi de la semaine contenant la date donnée.
 * Conforme au calendrier ISO / français (lundi = 1er jour).
 * Cas dimanche (getDay=0) : recule de 6 jours.
 */
export function getLundiSemaine(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=dim, 1=lun, …, 6=sam
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Retourne date + n jours (Date object). */
export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Formatte Date ou string ISO en "YYYY-MM-DD" local. */
export function isoDate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const JOURS_COURTS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const JOURS_LONGS  = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/** "Lun", "Mar", "Mer"… */
export function formatJourSemaine(date) {
  const d = typeof date === 'string' ? parseLocalDate(date) : new Date(date);
  return JOURS_COURTS[d.getDay()];
}

/** "25/05" */
export function formatDateCourte(date) {
  const d = typeof date === 'string' ? parseLocalDate(date) : new Date(date);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "Vendredi 29 mai" */
export function formatDateLongue(date) {
  const d = typeof date === 'string' ? parseLocalDate(date) : new Date(date);
  const nom = JOURS_LONGS[d.getDay()];
  return `${nom.charAt(0).toUpperCase() + nom.slice(1)} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}

/** true si date == aujourd'hui (comparaison locale). */
export function isAujourdhui(date) {
  const d = typeof date === 'string' ? parseLocalDate(date) : new Date(date);
  const t = new Date();
  return d.getFullYear() === t.getFullYear()
      && d.getMonth()    === t.getMonth()
      && d.getDate()     === t.getDate();
}
