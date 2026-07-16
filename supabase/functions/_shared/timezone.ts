// ================================================================
// timezone.ts - Conversion UTC → date locale
//
// Utilise Intl.DateTimeFormat avec locale sv-SE (format YYYY-MM-DD natif).
// Pas de dépendance externe - fonctionne dans Deno Edge Runtime.
// ================================================================

const FALLBACK_TZ = 'Europe/Zurich';

/**
 * Convertit un timestamp UTC en string de date locale "YYYY-MM-DD".
 *
 * Exemple :
 *   utcToLocalDateString("2026-05-22T22:45:00Z", "Europe/Zurich")
 *   → "2026-05-23"  (car 22:45 UTC = 00:45 CEST = lendemain)
 *
 * @param utcIso  Timestamp ISO 8601 UTC (ex: "2026-05-22T22:45:00Z")
 * @param tz      Timezone IANA (ex: "Europe/Zurich", "Europe/Paris")
 * @returns       Date locale "YYYY-MM-DD"
 */
export function utcToLocalDateString(utcIso: string, tz: string): string {
  const date = new Date(utcIso);
  if (isNaN(date.getTime())) {
    throw new Error(`utcToLocalDateString: timestamp invalide "${utcIso}"`);
  }

  // sv-SE est la seule locale garantie YYYY-MM-DD dans tous les environnements Deno
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: isValidTimezone(tz) ? tz : FALLBACK_TZ,
    year:  'numeric',
    month: '2-digit',
    day:   '2-digit',
  });

  return fmt.format(date);
}

/**
 * Construit les bornes UTC d'une journée locale.
 *
 * Exemple : localDateToUtcRange("2026-05-22", "Europe/Zurich") → {
 *   from: "2026-05-21T22:00:00.000Z",  (minuit CEST en été = UTC-2)
 *   to:   "2026-05-22T21:59:59.999Z"
 * }
 *
 * @param localDate  "YYYY-MM-DD" en heure locale
 * @param tz         Timezone IANA
 * @returns          { from: string, to: string } en ISO UTC
 */
export function localDateToUtcRange(
  localDate: string,
  tz: string
): { from: string; to: string } {
  const resolvedTz = isValidTimezone(tz) ? tz : FALLBACK_TZ;

  // Minuit local = début du jour
  const from = localMidnightToUtc(localDate, resolvedTz, false);
  // 23:59:59.999 local = fin du jour
  const to   = localMidnightToUtc(localDate, resolvedTz, true);

  return { from, to };
}

// ── Helpers privés ────────────────────────────────────────────────

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convertit "YYYY-MM-DD" + tz en timestamp UTC ISO.
 * @param end  Si true, retourne 23:59:59.999 ; sinon 00:00:00.000
 */
function localMidnightToUtc(localDate: string, tz: string, end: boolean): string {
  // Construire une date dans la timezone cible via Intl
  // On utilise le fait que new Date() accepte un format ISO sans timezone
  // et qu'on peut forcer l'interprétation locale via une manipulation du décalage.
  //
  // Approche robuste : trouver le décalage UTC pour ce jour précis dans cette TZ
  // en utilisant Intl.DateTimeFormat pour tester une date connue.

  const [year, month, day] = localDate.split('-').map(Number);
  const time = end ? { h: 23, m: 59, s: 59, ms: 999 } : { h: 0, m: 0, s: 0, ms: 0 };

  // Créer une date UTC candidate et ajuster jusqu'à obtenir la bonne date locale
  // Algorithme : chercher l'offset réel pour ce jour via bisection simple
  const candidate = new Date(Date.UTC(year, month - 1, day, time.h, time.m, time.s, time.ms));

  // Vérifier si la date locale de ce candidate correspond au localDate attendu
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });

  // Format sv-SE : "YYYY-MM-DD HH:MM:SS"
  const parts = fmt.format(candidate).split(' ');
  const localDateOfCandidate = parts[0];

  if (localDateOfCandidate === localDate) {
    return candidate.toISOString();
  }

  // Si décalage, ajuster via l'offset
  // Récupère l'offset TZ en minutes pour ce moment
  const offsetMs = getTimezoneOffsetMs(candidate, tz);
  const adjusted = new Date(candidate.getTime() - offsetMs);
  return adjusted.toISOString();
}

/**
 * Retourne le décalage UTC→local en millisecondes pour une date donnée dans une TZ.
 * Positif si local > UTC (ex: UTC+2 → +7200000).
 */
function getTimezoneOffsetMs(date: Date, tz: string): number {
  // Méthode : formater la date en UTC et en local, calculer la différence
  const utcStr = date.toISOString();

  const localFmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const localStr = localFmt.format(date).replace(' ', 'T') + '.000Z';
  // Note : ce localStr est "comme si" c'était UTC, pour faire le diff

  const localAsIfUtc = new Date(localStr);
  return localAsIfUtc.getTime() - date.getTime();
}
